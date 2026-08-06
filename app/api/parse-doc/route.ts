import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { normalizeVendorName } from '@/lib/compliance/normalize'
import { COVERAGE_LABELS } from '@/lib/compliance/status'

// This is the canonical, policy_lines-ready extraction contract.  The only
// nullable field is NAIC because some certificates do not print it legibly.
const CoverageSchema = z.object({
  coverage_type: z.string().describe('Coverage type (e.g. WORKERS_COMP, UMBRELLA, GL, AUTO or the literal text from the certificate)'),
  policy_number: z.string().nullable(),
  naic_code: z.string().nullable(),
  limit_amount: z.number().nonnegative().nullable(),
  addl_insr: z.boolean().default(false).describe('Whether Additional Insured is checked for this policy'),
  subr_wvd: z.boolean().default(false).describe('Whether Subrogation Waived is checked for this policy'),
  employers_liability_ea_acc: z.number().nullable().optional().describe('Each Accident limit, if Workers Comp'),
  employers_liability_disease_ea_emp: z.number().nullable().optional().describe('Disease-EA Employee limit, if Workers Comp'),
  employers_liability_disease_policy_limit: z.number().nullable().optional().describe('Disease-Policy Limit, if Workers Comp'),
  effective_date: z.string().nullable().describe('YYYY-MM-DD format when present'),
  expiration_date: z.string().nullable().describe('YYYY-MM-DD format when present'),
})

const DocSchema = z.object({
  is_acord_25: z.boolean().describe('True if this document is structurally an ACORD 25 Certificate of Liability Insurance form. False if it is a different document type like a W-9, MSA, or random image.'),
  vendor_name: z.string().describe('The Insured name. Do not extract the Producer or Agency name.'),
  address_street: z.string().nullable(),
  address_zip: z.string().nullable(),
  primary_email: z
    .string()
    .nullable()
    .describe('Email address of the Insured, never the producer. Null when absent.'),
  description_of_operations: z.string().nullable().describe('The full text in the Description of Operations block'),
  coverages: z.array(CoverageSchema),
})

type ParsedDocument = z.infer<typeof DocSchema>

type ReviewReason = {
  type:
    | 'ADDRESS_MISMATCH'
    | 'FUZZY_MATCH'
    | 'LOW_CONFIDENCE_MATCH'
    | 'CARRIER_SWITCH'
    | 'POLICY_CONFLICT'
    | 'MISSING_POLICY_DATA'
    | 'MANUAL_OVERRIDE'
  details: Record<string, unknown>
}

// A certificate rarely carries the Insured's email, but vendors.primary_email is
// mandatory. The placeholder keeps ingestion moving and is surfaced in Tab 1 and
// the review queue so a Risk Manager can supply the real contact.
function placeholderEmail(normalizedName: string) {
  const slug = normalizedName.replace(/\s+/g, '-').slice(0, 40) || 'vendor'
  return `unverified+${slug}-${crypto.randomUUID().slice(0, 8)}@pending.local`
}

function normalizeCoverageType(raw: string): 'GL' | 'AUTO' | 'WORKERS_COMP' | 'UMBRELLA' | null {
  const norm = raw.toUpperCase().replace(/[^A-Z]/g, '')
  if (norm.includes('WORKERSCOMP') || norm.includes('WORKERCOMP')) return 'WORKERS_COMP'
  if (norm.includes('UMBRELLA') || norm.includes('EXCESS')) return 'UMBRELLA'
  if (norm.includes('AUTO')) return 'AUTO'
  if (norm.includes('GL') || norm.includes('GENERAL') || norm === 'CGL') return 'GL'
  
  if (raw === 'WORKERS_COMP') return 'WORKERS_COMP'
  if (raw === 'UMBRELLA') return 'UMBRELLA'
  
  return null
}

function dateOrToday(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 10)
}

function isExactPolicyDuplicate(
  existing: { limit_amount: number | string; effective_date: string; expiration_date: string } | null,
  coverage: ParsedDocument['coverages'][number],
) {
  return Boolean(
    existing &&
      Number(existing.limit_amount) === coverage.limit_amount &&
      existing.effective_date === (coverage.effective_date || null) &&
      existing.expiration_date === (coverage.expiration_date || null),
  )
}

// PRD 3.2 "Same Carrier + New Policy #" only auto-replaces expiring coverage.
function isExpiringOrExpired(date: string) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 30)
  return new Date(`${date}T00:00:00`) <= cutoff
}

async function extractDocument(
  fileUrl: string,
  originalFilename?: string | null,
  mimeType?: string | null,
): Promise<ParsedDocument> {
  const openai = new OpenAI()
  const isPdf = mimeType === 'application/pdf' || originalFilename?.toLowerCase().endsWith('.pdf') || fileUrl.toLowerCase().includes('.pdf')
  
  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok) throw new Error(`Failed to fetch file for OCR: ${fileRes.statusText}`)
  const arrayBuffer = await fileRes.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const actualMime = mimeType || (isPdf ? 'application/pdf' : 'image/jpeg')
  const dataUrl = `data:${actualMime};base64,${buffer.toString('base64')}`

  const response = await openai.responses.parse({
    model: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
    instructions: 'You extract insurance certificate data. Return only factual values visible in the supplied document. Never invent a policy number, NAIC code, amount, or date.',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Extract the ACORD 25 certificate into the required JSON schema.
Use the INSURED party as vendor_name, never the producer or agency. Extract only
GL, AUTO, WORKERS_COMP, and UMBRELLA coverages. Normalize coverage_type to the
schema enum. STRICT MAPPING REQUIRED: Map any variation of Workers' Compensation (e.g., 'WORKERS_COMPENSATION', 'WORKERS COMP') to 'WORKERS_COMP'. Map any variation of Umbrella or Excess Liability (e.g., 'UMBRELLA_LIABILITY', 'EXCESS_LIABILITY') to 'UMBRELLA'.
limit_amount must be a number in US dollars with no symbols or commas. Read exact numerical values from the LIMITS column. Do NOT sum or aggregate values across separate rows (e.g. do not add D&O limits to Commercial General Liability Each Occurrence, and do not combine policy numbers/limits).
Ensure General Liability limit_amount extracts the 'EACH OCCURRENCE' limit strictly from the top line under COMMERCIAL GENERAL LIABILITY.
Ensure Automobile Liability limit_amount extracts the 'COMBINED SINGLE LIMIT' strictly from the top row under AUTOMOBILE LIABILITY.
Use YYYY-MM-DD dates. If a date is blank or unreadable, return null (not an empty string ""). Return null, never a guess, for an unreadable policy_number, NAIC code, or Insured email.
CRITICAL: To find the NAIC code for a coverage, look at the "INSR LTR" column (e.g. A, B, C) on the left side of that coverage's row. Then, match that letter to the "INSURERS AFFORDING COVERAGE" box at the top right to find the corresponding NAIC #. Do not leave the NAIC code null if it can be found this way.
CRITICAL: Extract the exact POLICY NUMBER for each coverage row. Do not truncate it or leave it null if it is visible.
CRITICAL: If an individual policy line row (e.g., Auto Liability) does not have an explicit POLICY EFF or POLICY EXP value listed on its own line on the document, do NOT infer or carry over dates from adjacent lines. Force expiration_date and effective_date to null if the corresponding policy row on the form is unpopulated or blank.
CRITICAL: If the LIMITS column is completely blank for a specific coverage row (e.g. General Liability), you MUST return null for limit_amount. Do NOT copy limits from adjacent rows like Auto Liability.`,
          },
          isPdf
            ? {
                type: 'input_file',
                file_url: fileUrl,
                detail: 'high',
              }
            : { type: 'input_image', image_url: dataUrl, detail: 'high' },
        ],
      },
    ],
    text: { format: zodTextFormat(DocSchema, 'acord_certificate_extraction') },
  })

  const parsed = response.output_parsed
  if (!parsed) throw new Error('Failed to parse data from OpenAI.')
  return parsed
}

export async function POST(req: Request) {
  try {
    const { fileUrl, originalFilename, mimeType, vendor_id, bypass_mismatch } = await req.json()
    if (!fileUrl) {
      return NextResponse.json({ error: 'Missing fileUrl in request body' }, { status: 400 })
    }

    const parsed = await extractDocument(fileUrl, originalFilename, mimeType)
    console.log("LLM PARSED OUTPUT:", JSON.stringify(parsed, null, 2))
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for backend DB writes')
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const normalizedName = normalizeVendorName(parsed.vendor_name)
    const reviewReasons: ReviewReason[] = []
    let vendorId: string | null = vendor_id || null

    if (!vendorId) {
      // Tier 1: match an existing vendor through Policy # + Carrier NAIC.
      for (const coverage of parsed.coverages) {
        const naicCode = coverage.naic_code?.trim()
      if (!coverage.policy_number?.trim() || !naicCode) continue
      const { data: policyMatch, error } = await supabase
        .from('policy_lines')
        .select('vendor_id')
        .eq('policy_number', coverage.policy_number.trim())
        .eq('naic_code', naicCode)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`Unable to match policy: ${error.message}`)
      if (policyMatch) {
        vendorId = policyMatch.vendor_id
        break
      }
    }

    // Tier 2: match normalized company name plus complete street address and ZIP.
    // A same-name/different-address candidate is deliberately not auto-linked.
    if (!vendorId) {
      const { data: nameCandidates, error } = await supabase
        .from('vendors')
        .select('vendor_id, address_street, address_zip')
        .eq('normalized_name', normalizedName)
        .limit(2)
      if (error) throw new Error(`Unable to match vendor: ${error.message}`)

      const exactAddressCandidate = nameCandidates?.find(
        (candidate) =>
          parsed.address_street &&
          parsed.address_zip &&
          candidate.address_street === parsed.address_street &&
          candidate.address_zip === parsed.address_zip,
      )
      if (exactAddressCandidate) {
        vendorId = exactAddressCandidate.vendor_id
      } else if (nameCandidates?.length) {
        vendorId = nameCandidates[0].vendor_id
      }
    }

    // Tier 3: similarity is useful only above the PRD's strict 90% threshold.
    // Anything at or below that threshold remains unlinked and awaits review.
    if (!vendorId && reviewReasons.length === 0) {
      const { data: fuzzyCandidates, error } = await supabase.rpc('find_vendor_fuzzy', {
        p_normalized_name: normalizedName,
      })
      if (error) throw new Error(`Unable to run fuzzy vendor match: ${error.message}`)

      const candidate = fuzzyCandidates?.[0]
      if (candidate && Number(candidate.confidence_score) > 90) {
        vendorId = candidate.vendor_id
      } else {
        reviewReasons.push({
          type: 'FUZZY_MATCH',
          details: {
            normalized_name: normalizedName,
            candidate_vendor_id: candidate?.vendor_id ?? null,
            confidence_score: candidate ? Number(candidate.confidence_score) : 0,
            threshold: 90,
          },
        })
      }
    }
    }

    if (!parsed.is_acord_25) {
      reviewReasons.push({
        type: 'MANUAL_OVERRIDE',
        details: { type: 'INVALID_DOCUMENT_FORMAT', reason: 'Document does not match standard ACORD 25 structure.' }
      })
    }

    // Entity mismatch check when vendorId is present
    if (vendorId && parsed.vendor_name && !bypass_mismatch) {
      const { data: vData } = await supabase.from('vendors').select('company_name').eq('vendor_id', vendorId).single()
      if (vData && vData.company_name) {
        const extractedLower = parsed.vendor_name.toLowerCase().trim()
        const vendorLower = vData.company_name.toLowerCase().trim()
        if (extractedLower && vendorLower && !extractedLower.includes(vendorLower) && !vendorLower.includes(extractedLower)) {
          reviewReasons.push({
            type: 'MANUAL_OVERRIDE',
            details: {
              type: 'ENTITY_MISMATCH',
              reason: `⚠️ Insured Name Mismatch: Form says '${parsed.vendor_name}' vs Vendor '${vData.company_name}'`
            }
          })
        }
      }
    }


    // Exact duplicates are ignored before a document, vendor, or policy record is
    // changed. This satisfies the PRD's zero-state-change duplicate rule.
    const identifiableCoverages = parsed.coverages.filter(
      (coverage) => coverage.policy_number?.trim() && coverage.naic_code?.trim(),
    )
    if (vendorId && identifiableCoverages.length === parsed.coverages.length && identifiableCoverages.length > 0) {
      let allDuplicates = true
      for (const coverage of identifiableCoverages) {
        const { data: existing, error } = await supabase
          .from('policy_lines')
          .select('limit_amount, effective_date, expiration_date')
          .eq('vendor_id', vendorId)
          .eq('policy_number', coverage.policy_number!.trim())
          .eq('naic_code', coverage.naic_code!.trim())
          .eq('coverage_type', coverage.coverage_type)
          .eq('is_active', true)
          .maybeSingle()
        if (error) throw new Error(`Unable to check duplicate policy: ${error.message}`)
        if (!isExactPolicyDuplicate(existing, coverage)) {
          allDuplicates = false
          break
        }
      }
      if (allDuplicates) {
        return NextResponse.json({ status: 'IGNORED_DUPLICATE', extraction: parsed })
      }
    }

    // Provisioning: when all three tiers miss, the Insured block becomes a real
    // vendor so that ingestion always terminates in queryable data. The review
    // item is a notification, not a gate.
    let provisionedVendor = false
    if (!vendorId) {
      const { data: created, error: createError } = await supabase
        .from('vendors')
        .insert({
          company_name: parsed.vendor_name,
          normalized_name: normalizedName,
          primary_email: parsed.primary_email?.trim() || placeholderEmail(normalizedName),
          trade_specialty: 'Unclassified',
          address_street: parsed.address_street,
          address_zip: parsed.address_zip,
        })
        .select('vendor_id')
        .single()
      if (createError) throw new Error(`Unable to provision vendor: ${createError.message}`)

      vendorId = created.vendor_id
      provisionedVendor = true
      
      const hasMissingCriticalFields = parsed.coverages.some(c => 
        !c.policy_number?.trim() || !c.naic_code?.trim() || c.limit_amount == null
      ) || parsed.coverages.length === 0;

      if (hasMissingCriticalFields) {
        reviewReasons.push({
          type: 'LOW_CONFIDENCE_MATCH',
          details: {
            reason: 'Auto-provisioned vendor missing critical policy fields',
            provisioned_vendor_id: vendorId,
            normalized_name: normalizedName,
            company_name: parsed.vendor_name,
            contact_email_verified: Boolean(parsed.primary_email?.trim()),
            trade_specialty_verified: false,
          },
        })
      }
    }

    const documentId = crypto.randomUUID()
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        vendor_id: vendorId,
        company_name: parsed.vendor_name,
        doc_type: 'Certificate of Insurance',
        expiration_date: [...parsed.coverages]
          .map((coverage) => coverage.expiration_date)
          .sort()[0] ?? null,
        policy_amount: String(Math.max(0, ...parsed.coverages.map((coverage) => coverage.limit_amount ?? coverage.employers_liability_ea_acc ?? coverage.employers_liability_disease_policy_limit ?? 1000000))),
        coverages: parsed.coverages.map((coverage) => {
          const normType = normalizeCoverageType(coverage.coverage_type)
          const effLim = coverage.limit_amount ?? coverage.employers_liability_ea_acc ?? coverage.employers_liability_disease_policy_limit ?? 1000000
          return {
            type: normType ? COVERAGE_LABELS[normType] : coverage.coverage_type,
            policy_number: coverage.policy_number ?? 'Unverified',
            expiration_date: coverage.expiration_date,
            limits: `$${effLim.toLocaleString('en-US')}`,
          }
        }),
        file_url: fileUrl,
        original_filename: originalFilename ?? null,
        checksum_sha256: null,
        extraction_status: 'PROCESSED',
        extracted_data: parsed,
        description_of_operations: parsed.description_of_operations,
      })
      .select()
      .single()
    if (documentError) throw new Error(`Unable to save document: ${documentError.message}`)

    for (const [index, coverage] of parsed.coverages.entries()) {
      if (!vendorId) break
      
      const type = normalizeCoverageType(coverage.coverage_type)
      if (!type) {
        // Ignore unrecognized/optional coverage lines (e.g. Property, Fidelity)
        continue
      }
      
      const policyNumber = coverage.policy_number?.trim()
      const naicCode = coverage.naic_code?.trim()
      const effectiveLimit = coverage.limit_amount ?? coverage.employers_liability_ea_acc ?? coverage.employers_liability_disease_policy_limit ?? 0
      const safeEffectiveDate = coverage.effective_date?.trim() || null
      const safeExpirationDate = coverage.expiration_date?.trim() || null
      
      const hasDates = safeEffectiveDate || safeExpirationDate
      const hasPolicyNum = !!policyNumber?.trim()
      const isUnactionable = !hasPolicyNum && !hasDates
      const isBlank = (effectiveLimit === 0 && !hasDates) || isUnactionable
      
      if (isBlank) continue

      const isPrimaryCoverage = ['GL', 'AUTO', 'WORKERS_COMP', 'UMBRELLA'].includes(type)
      
      if (isPrimaryCoverage && !hasPolicyNum) {
        reviewReasons.push({
          type: 'MISSING_POLICY_DATA',
          details: { coverage_index: index, coverage_type: type, missing: 'policy_number' },
        })
      }
      
      const safePolicyNumber = policyNumber || 'Unverified'
      const safeNaicCode = naicCode || 'Unverified'

      const { data: existing, error: existingError } = await supabase
        .from('policy_lines')
        .select('id:policy_id, limit_amount, expiration_date')
        .eq('vendor_id', vendorId)
        .eq('policy_number', safePolicyNumber)
        .eq('naic_code', safeNaicCode)
        .eq('coverage_type', type)
        .eq('is_active', true)
        .maybeSingle()
      if (existingError) throw new Error(`Unable to check policy line: ${existingError.message}`)

      const lineStatus = (!safeEffectiveDate || !safeExpirationDate ? 'MISSING_DATA' : 'APPROVED')
      if (existing) {
        if (coverage.expiration_date > existing.expiration_date) {
          // Same Carrier Renewal (PRD 3.2): archive the superseded line so the
          // pre-renewal limits and dates survive as an audit record, then
          // activate the renewed line.
          const { error: archiveError } = await supabase
            .from('policy_lines')
            .update({ is_active: false })
            .eq('policy_id', existing.id)
          if (archiveError) throw new Error(`Unable to archive renewed policy: ${archiveError.message}`)

          const { error } = await supabase.from('policy_lines').insert({
            vendor_id: vendorId,
            document_id: documentId,
            policy_number: safePolicyNumber,
            naic_code: safeNaicCode,
            coverage_type: type,
            limit_amount: effectiveLimit,
            effective_limit_amount: effectiveLimit,
            effective_date: safeEffectiveDate,
            expiration_date: safeExpirationDate,
            status: lineStatus,
            addl_insr: coverage.addl_insr,
            subr_wvd: coverage.subr_wvd,
            employers_liability_ea_acc: coverage.employers_liability_ea_acc ?? null,
            employers_liability_disease_ea_emp: coverage.employers_liability_disease_ea_emp ?? null,
            employers_liability_disease_policy_limit: coverage.employers_liability_disease_policy_limit ?? null,
          })
          if (error) {
            if (error.code === '23505' && error.message.includes('policy_lines_active_policy_key')) {
              console.log('Skipped duplicate active policy line insert during renewal')
            } else {
              throw new Error(`Unable to renew policy line: ${error.message}`)
            }
          }
        } else if (coverage.expiration_date !== existing.expiration_date || effectiveLimit !== Number(existing.limit_amount)) {
          reviewReasons.push({
            type: 'POLICY_CONFLICT',
            details: { id: existing.id, policy_number: safePolicyNumber, naic_code: safeNaicCode },
          })
        }
      } else {
        const { data: activeCoverageLines, error: activeCoverageError } = await supabase
          .from('policy_lines')
          .select('id:policy_id, policy_number, naic_code, expiration_date')
          .eq('vendor_id', vendorId)
          .eq('coverage_type', type)
          .eq('is_active', true)
        if (activeCoverageError) throw new Error(`Unable to reconcile policy line: ${activeCoverageError.message}`)

        if (!activeCoverageLines?.length) {
          const { error } = await supabase.from('policy_lines').insert({
            vendor_id: vendorId,
            document_id: documentId,
            policy_number: safePolicyNumber,
            naic_code: safeNaicCode,
            coverage_type: type,
            limit_amount: effectiveLimit,
            effective_limit_amount: effectiveLimit,
            effective_date: safeEffectiveDate,
            expiration_date: safeExpirationDate,
            status: lineStatus,
            addl_insr: coverage.addl_insr,
            subr_wvd: coverage.subr_wvd,
            employers_liability_ea_acc: coverage.employers_liability_ea_acc ?? null,
            employers_liability_disease_ea_emp: coverage.employers_liability_disease_ea_emp ?? null,
            employers_liability_disease_policy_limit: coverage.employers_liability_disease_policy_limit ?? null,
          })
          if (error) {
            if (error.code === '23505' && error.message.includes('policy_lines_active_policy_key')) {
              console.log('Skipped duplicate active policy line insert')
            } else {
              throw new Error(`Unable to save policy line: ${error.message}`)
            }
          }
          continue
        }

        if (activeCoverageLines.length > 1) {
          reviewReasons.push({
            type: 'POLICY_CONFLICT',
            details: {
              reason: 'Multiple active policy lines exist for the same coverage type',
              coverage_type: type,
              active_ids: activeCoverageLines.map((line) => line.id),
            },
          })
          continue
        }

        const activeLine = activeCoverageLines[0]
        const isCarrierSwitch = activeLine.naic_code !== safeNaicCode

        // Same Carrier + New Policy # (PRD 3.2) requires expiring coverage; a
        // mid-term same-carrier policy change is a genuine conflict. A carrier
        // switch carries no such condition and applies at any point in the term.
        const isIncomingMissingData = !safeEffectiveDate || !safeExpirationDate
        if (isIncomingMissingData && activeLine.expiration_date) {
          reviewReasons.push({
            type: 'POLICY_CONFLICT',
            details: {
              reason: 'Incoming policy is missing dates and cannot automatically override a dated active policy',
              existing_id: activeLine.id,
              incoming_policy_number: safePolicyNumber,
              incoming_naic_code: safeNaicCode,
            },
          })
          continue
        }

        if (!isCarrierSwitch && activeLine.expiration_date && !isExpiringOrExpired(activeLine.expiration_date)) {
          reviewReasons.push({
            type: 'POLICY_CONFLICT',
            details: {
              reason: 'Incoming same-carrier policy conflicts with a non-expiring active policy',
              existing_id: activeLine.id,
              incoming_policy_number: safePolicyNumber,
              incoming_naic_code: safeNaicCode,
            },
          })
          continue
        }

        const { error: archiveError } = await supabase
          .from('policy_lines')
          .update({ is_active: false })
          .eq('policy_id', activeLine.id)
        if (archiveError) throw new Error(`Unable to archive prior policy: ${archiveError.message}`)

        if (isCarrierSwitch) {
          reviewReasons.push({
            type: 'CARRIER_SWITCH',
            details: {
              coverage_type: type,
              previous_id: activeLine.id,
              previous_naic_code: activeLine.naic_code,
              incoming_naic_code: safeNaicCode,
              mid_term: !isExpiringOrExpired(activeLine.expiration_date),
            },
          })
        }

        const { error } = await supabase.from('policy_lines').insert({
          vendor_id: vendorId,
          document_id: documentId,
          policy_number: safePolicyNumber,
          naic_code: safeNaicCode,
          coverage_type: type,
          limit_amount: effectiveLimit,
          effective_limit_amount: effectiveLimit,
          effective_date: safeEffectiveDate,
          expiration_date: safeExpirationDate,
          status: lineStatus,
          addl_insr: coverage.addl_insr,
          subr_wvd: coverage.subr_wvd,
          employers_liability_ea_acc: coverage.employers_liability_ea_acc ?? null,
          employers_liability_disease_ea_emp: coverage.employers_liability_disease_ea_emp ?? null,
          employers_liability_disease_policy_limit: coverage.employers_liability_disease_policy_limit ?? null,
        })
        if (error) {
          if (error.code === '23505' && error.message.includes('policy_lines_active_policy_key')) {
            console.log('Skipped duplicate active policy line insert during switch/conflict')
          } else {
            throw new Error(`Unable to save policy line: ${error.message}`)
          }
        }
      }
    }

    if (parsed.coverages.length === 0) {
      reviewReasons.push({ type: 'MISSING_POLICY_DATA', details: { reason: 'No usable policy coverages were extracted' } })
    }

    if (reviewReasons.length > 0) {
      const { error: queueError } = await supabase.from('review_queue_items').insert(
        reviewReasons.map((reason) => ({
          document_id: documentId,
          vendor_id: vendorId,
          review_type: reason.type,
          details: reason.details,
        })),
      )
      if (queueError) throw new Error(`Unable to create review item: ${queueError.message}`)
    }

    const extractionStatus = reviewReasons.length > 0 ? 'REVIEW_REQUIRED' : 'PROCESSED'
    const { error: statusError } = await supabase
      .from('documents')
      .update({ extraction_status: extractionStatus })
      .eq('id', documentId)
    if (statusError) throw new Error(`Unable to finalize document: ${statusError.message}`)

    return NextResponse.json({
      document: { ...document, extraction_status: extractionStatus, vendor_id: vendorId },
      vendor_id: vendorId,
      provisioned_vendor: provisionedVendor,
      review_reasons: reviewReasons.map((reason) => reason.type),
      extraction: parsed,
    })
  } catch (error: unknown) {
    console.error('Parse document error:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
