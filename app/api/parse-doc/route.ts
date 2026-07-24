import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeVendorName } from '@/lib/compliance/normalize'
import { COVERAGE_LABELS } from '@/lib/compliance/status'

// This is the canonical, policy_lines-ready extraction contract.  The only
// nullable field is NAIC because some certificates do not print it legibly.
const CoverageSchema = z.object({
  coverage_type: z.enum(['GL', 'AUTO', 'WORKERS_COMP', 'UMBRELLA']),
  policy_number: z.string().nullable(),
  naic_code: z.string().nullable(),
  limit_amount: z.number().nonnegative(),
  effective_date: z.string().nullable().describe('YYYY-MM-DD format when present'),
  expiration_date: z.string().describe('YYYY-MM-DD format'),
})

const DocSchema = z.object({
  vendor_name: z.string().describe('The Insured name. Do not extract the Producer or Agency name.'),
  address_street: z.string().nullable(),
  address_zip: z.string().nullable(),
  primary_email: z
    .string()
    .nullable()
    .describe('Email address of the Insured, never the producer. Null when absent.'),
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
  details: Record<string, unknown>
}

// A certificate rarely carries the Insured's email, but vendors.primary_email is
// mandatory. The placeholder keeps ingestion moving and is surfaced in Tab 1 and
// the review queue so a Risk Manager can supply the real contact.
function placeholderEmail(normalizedName: string) {
  const slug = normalizedName.replace(/\s+/g, '-').slice(0, 40) || 'vendor'
  return `unverified+${slug}-${crypto.randomUUID().slice(0, 8)}@pending.local`
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
      existing.effective_date === dateOrToday(coverage.effective_date) &&
      existing.expiration_date === coverage.expiration_date,
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
schema enum. limit_amount must be a number in US dollars with no symbols or
commas. Use YYYY-MM-DD dates. Return null, never a guess, for an unreadable
policy_number, NAIC code, effective date, or Insured email.`,
          },
          isPdf
            ? {
                type: 'input_file',
                file_url: fileUrl,
                filename: originalFilename ?? 'certificate.pdf',
                detail: 'high',
              }
            : { type: 'input_image', image_url: fileUrl, detail: 'high' },
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
    const { fileUrl, originalFilename, mimeType } = await req.json()
    if (!fileUrl) {
      return NextResponse.json({ error: 'Missing fileUrl in request body' }, { status: 400 })
    }

    const parsed = await extractDocument(fileUrl, originalFilename, mimeType)
    const supabase = createSupabaseServerClient()
    const normalizedName = normalizeVendorName(parsed.vendor_name)
    const reviewReasons: ReviewReason[] = []
    let vendorId: string | null = null

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
        reviewReasons.push({
          type: 'ADDRESS_MISMATCH',
          details: {
            candidate_vendor_ids: nameCandidates.map((candidate) => candidate.vendor_id),
            parsed_address: parsed.address_street,
            parsed_zip: parsed.address_zip,
          },
        })
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
      reviewReasons.push({
        type: 'LOW_CONFIDENCE_MATCH',
        details: {
          reason: 'No existing vendor matched; a new vendor profile was provisioned from the certificate',
          provisioned_vendor_id: vendorId,
          normalized_name: normalizedName,
          company_name: parsed.vendor_name,
          contact_email_verified: Boolean(parsed.primary_email?.trim()),
          trade_specialty_verified: false,
        },
      })
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
        policy_amount: String(Math.max(0, ...parsed.coverages.map((coverage) => coverage.limit_amount))),
        coverages: parsed.coverages.map((coverage) => ({
          type: COVERAGE_LABELS[coverage.coverage_type],
          policy_number: coverage.policy_number ?? 'Unverified',
          expiration_date: coverage.expiration_date,
          limits: `$${coverage.limit_amount.toLocaleString('en-US')}`,
          sub_limits: null,
        })),
        file_url: fileUrl,
        original_filename: originalFilename ?? null,
        mime_type: mimeType ?? null,
        extraction_status: 'EXTRACTED',
        extracted_data: parsed,
      })
      .select()
      .single()
    if (documentError) throw new Error(`Unable to save document: ${documentError.message}`)

    for (const [index, coverage] of parsed.coverages.entries()) {
      if (!vendorId) break
      const type = coverage.coverage_type
      const policyNumber = coverage.policy_number?.trim()
      const naicCode = coverage.naic_code?.trim()
      if (!policyNumber || !naicCode) {
        reviewReasons.push({
          type: 'MISSING_POLICY_DATA',
          details: { coverage_index: index, coverage_type: type, missing: !policyNumber ? 'policy_number' : 'naic_code' },
        })
        continue
      }

      const { data: existing, error: existingError } = await supabase
        .from('policy_lines')
        .select('policy_id, limit_amount, expiration_date')
        .eq('vendor_id', vendorId)
        .eq('policy_number', policyNumber)
        .eq('naic_code', naicCode)
        .eq('coverage_type', type)
        .eq('is_active', true)
        .maybeSingle()
      if (existingError) throw new Error(`Unable to check policy line: ${existingError.message}`)

      const limitAmount = coverage.limit_amount
      if (existing) {
        if (coverage.expiration_date > existing.expiration_date) {
          // Same Carrier Renewal (PRD 3.2): archive the superseded line so the
          // pre-renewal limits and dates survive as an audit record, then
          // activate the renewed line.
          const { error: archiveError } = await supabase
            .from('policy_lines')
            .update({ is_active: false })
            .eq('policy_id', existing.policy_id)
          if (archiveError) throw new Error(`Unable to archive renewed policy: ${archiveError.message}`)

          const { error } = await supabase.from('policy_lines').insert({
            vendor_id: vendorId,
            source_document_id: documentId,
            policy_number: policyNumber,
            naic_code: naicCode,
            coverage_type: type,
            limit_amount: limitAmount,
            effective_date: dateOrToday(coverage.effective_date),
            expiration_date: coverage.expiration_date,
          })
          if (error) throw new Error(`Unable to renew policy line: ${error.message}`)
        } else if (coverage.expiration_date !== existing.expiration_date || limitAmount !== Number(existing.limit_amount)) {
          reviewReasons.push({
            type: 'POLICY_CONFLICT',
            details: { policy_id: existing.policy_id, policy_number: policyNumber, naic_code: naicCode },
          })
        }
      } else {
        const { data: activeCoverageLines, error: activeCoverageError } = await supabase
          .from('policy_lines')
          .select('policy_id, policy_number, naic_code, expiration_date')
          .eq('vendor_id', vendorId)
          .eq('coverage_type', type)
          .eq('is_active', true)
        if (activeCoverageError) throw new Error(`Unable to reconcile policy line: ${activeCoverageError.message}`)

        if (!activeCoverageLines?.length) {
          const { error } = await supabase.from('policy_lines').insert({
            vendor_id: vendorId,
            source_document_id: documentId,
            policy_number: policyNumber,
            naic_code: naicCode,
            coverage_type: type,
            limit_amount: limitAmount,
            effective_date: dateOrToday(coverage.effective_date),
            expiration_date: coverage.expiration_date,
          })
          if (error) throw new Error(`Unable to save policy line: ${error.message}`)
          continue
        }

        if (activeCoverageLines.length > 1) {
          reviewReasons.push({
            type: 'POLICY_CONFLICT',
            details: {
              reason: 'Multiple active policy lines exist for the same coverage type',
              coverage_type: type,
              active_policy_ids: activeCoverageLines.map((line) => line.policy_id),
            },
          })
          continue
        }

        const activeLine = activeCoverageLines[0]
        const isCarrierSwitch = activeLine.naic_code !== naicCode

        // Same Carrier + New Policy # (PRD 3.2) requires expiring coverage; a
        // mid-term same-carrier policy change is a genuine conflict. A carrier
        // switch carries no such condition and applies at any point in the term.
        if (!isCarrierSwitch && !isExpiringOrExpired(activeLine.expiration_date)) {
          reviewReasons.push({
            type: 'POLICY_CONFLICT',
            details: {
              reason: 'Incoming same-carrier policy conflicts with a non-expiring active policy',
              existing_policy_id: activeLine.policy_id,
              incoming_policy_number: policyNumber,
              incoming_naic_code: naicCode,
            },
          })
          continue
        }

        const { error: archiveError } = await supabase
          .from('policy_lines')
          .update({ is_active: false })
          .eq('policy_id', activeLine.policy_id)
        if (archiveError) throw new Error(`Unable to archive prior policy: ${archiveError.message}`)

        if (isCarrierSwitch) {
          reviewReasons.push({
            type: 'CARRIER_SWITCH',
            details: {
              coverage_type: type,
              previous_policy_id: activeLine.policy_id,
              previous_naic_code: activeLine.naic_code,
              incoming_naic_code: naicCode,
              mid_term: !isExpiringOrExpired(activeLine.expiration_date),
            },
          })
        }

        const { error } = await supabase.from('policy_lines').insert({
          vendor_id: vendorId,
          source_document_id: documentId,
          policy_number: policyNumber,
          naic_code: naicCode,
          coverage_type: type,
          limit_amount: limitAmount,
          effective_date: dateOrToday(coverage.effective_date),
          expiration_date: coverage.expiration_date,
        })
        if (error) throw new Error(`Unable to save policy line: ${error.message}`)
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
