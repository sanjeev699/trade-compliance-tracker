import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { evaluateCompliance } from '@/lib/compliance/status'
import type { VendorRow, VendorWithCompliance } from '@/lib/types/vendor'
import type { ReviewDocument, ReviewQueueItem, VendorSummary } from '@/lib/types/review'

const VENDOR_SELECT = `
  vendor_id, company_name, normalized_name, tax_id_ein, primary_email,
  trade_specialty, address_street, address_zip, emr_score, emr_verified,
  osha_file_url, created_at, updated_at,
  policy_lines (
    policy_id, coverage_type, policy_number, naic_code, limit_amount,
    effective_limit_amount, effective_date, expiration_date, is_active
  )
`

interface QueueRow {
  review_id: string
  review_type: ReviewQueueItem['review_type']
  status: ReviewQueueItem['status']
  confidence_score: string | number | null
  details: Record<string, unknown> | null
  created_at: string
  documents: ReviewDocument | null
}

// Candidate ids are recorded by the ingestion matcher so the manager can link
// the certificate to the vendor it nearly matched.
function candidateIdsFrom(details: Record<string, unknown> | null): string[] {
  if (!details) return []
  const ids: string[] = []
  const single = details.candidate_vendor_id
  if (typeof single === 'string') ids.push(single)
  const many = details.candidate_vendor_ids
  if (Array.isArray(many)) {
    for (const value of many) if (typeof value === 'string') ids.push(value)
  }
  return ids
}

function withCompliance(vendor: VendorRow): VendorWithCompliance {
  const activeLines = (vendor.policy_lines ?? []).filter((line) => line.is_active)
  return { ...vendor, policy_lines: activeLines, compliance: evaluateCompliance(activeLines) }
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('review_queue_items')
      .select(
        `review_id, review_type, status, confidence_score, details, created_at, vendor_id,
         documents ( id, company_name, doc_type, file_url, original_filename,
                     mime_type, extraction_status, extracted_data, created_at )`,
      )
      .in('status', ['PENDING', 'IN_REVIEW'])
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as (QueueRow & { vendor_id: string | null })[]

    // One vendor lookup covers both the linked vendor and every near-match
    // candidate referenced by the open items.
    const vendorIds = new Set<string>()
    for (const row of rows) {
      if (row.vendor_id) vendorIds.add(row.vendor_id)
      for (const id of candidateIdsFrom(row.details)) vendorIds.add(id)
    }

    const vendorsById = new Map<string, VendorWithCompliance>()
    if (vendorIds.size > 0) {
      const { data: vendorRows, error: vendorError } = await supabase
        .from('vendors')
        .select(VENDOR_SELECT)
        .in('vendor_id', Array.from(vendorIds))
      if (vendorError) throw new Error(vendorError.message)
      for (const vendor of (vendorRows ?? []) as unknown as VendorRow[]) {
        vendorsById.set(vendor.vendor_id, withCompliance(vendor))
      }
    }

    const toSummary = (vendor: VendorWithCompliance): VendorSummary => ({
      vendor_id: vendor.vendor_id,
      company_name: vendor.company_name,
      trade_specialty: vendor.trade_specialty,
      primary_email: vendor.primary_email,
      tax_id_ein: vendor.tax_id_ein,
      address_street: vendor.address_street,
      address_zip: vendor.address_zip,
    })

    const items: ReviewQueueItem[] = rows
      .filter((row) => row.documents !== null)
      .map((row) => ({
        review_id: row.review_id,
        review_type: row.review_type,
        status: row.status,
        confidence_score: row.confidence_score,
        details: row.details ?? {},
        created_at: row.created_at,
        document: row.documents as ReviewDocument,
        vendor: row.vendor_id ? (vendorsById.get(row.vendor_id) ?? null) : null,
        candidate_vendors: candidateIdsFrom(row.details)
          .map((id) => vendorsById.get(id))
          .filter((vendor): vendor is VendorWithCompliance => Boolean(vendor))
          .map(toSummary),
      }))

    return NextResponse.json({ items })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load review queue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
