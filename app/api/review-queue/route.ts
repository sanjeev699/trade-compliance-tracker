export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { evaluateCompliance, evaluateVendorGlobalStatus } from '@/lib/compliance/status'
import type { VendorRow, VendorWithCompliance } from '@/lib/types/vendor'
import type { ReviewDocument, ReviewQueueItem, VendorSummary } from '@/lib/types/review'

const VENDOR_SELECT = `
  vendor_id, company_name, normalized_name, tax_id_ein, primary_email,
  trade_specialty, address_street, address_zip, emr_score, emr_verified,
  osha_file_url, onboarding_status, created_at, updated_at,
  policy_lines (
    id:policy_id, coverage_type, policy_number, naic_code, limit_amount,
    effective_limit_amount, effective_date, expiration_date, is_active,
    addl_insr, subr_wvd, employers_liability_ea_acc,
    employers_liability_disease_ea_emp, employers_liability_disease_policy_limit
  ),
  documents ( description_of_operations, doc_type, file_url, original_filename, extraction_status ),
  review_queue_items ( status )
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

  const hasCoi = !!vendor.acord25_url || (vendor.documents || []).some(d => 
    d.doc_type === 'COI' || d.doc_type === 'ACORD 25' || d.doc_type === 'Certificate of Insurance (COI / ACORD 25)'
  )

  const compliance = evaluateCompliance(activeLines as any, undefined, undefined, hasCoi)
  const global_status = evaluateVendorGlobalStatus(
    compliance.status,
    vendor.w9_status,
    vendor.msa_status,
    typeof vendor.emr_score === 'number' ? vendor.emr_score : null
  )
  return { ...vendor, policy_lines: activeLines, compliance, global_status }
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('review_queue_items')
      .select(
        `review_id, review_type, status, confidence_score, details, created_at, vendor_id,
         documents!inner ( id, company_name, doc_type, file_url, original_filename,
                     mime_type, extraction_status, extracted_data, created_at ),
         vendors!inner ( vendor_id, company_name, sc_id )`
      )
      .in('status', ['PENDING', 'IN_REVIEW'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Review Queue Error:', error.message)
      return NextResponse.json({ items: [] })
    }

    const rows = (data ?? []) as any[]

    const items: ReviewQueueItem[] = rows.map((row) => ({
      review_id: row.review_id,
      review_type: row.review_type,
      status: row.status,
      confidence_score: row.confidence_score,
      details: row.details ?? {},
      created_at: row.created_at,
      document: row.documents as ReviewDocument,
      vendor: row.vendors ? {
        vendor_id: row.vendors.vendor_id,
        company_name: row.vendors.company_name,
        sc_id: row.vendors.sc_id
      } : null,
      candidate_vendors: []
    }))

    return NextResponse.json({ items })
  } catch (error: unknown) {
    console.error('Review Queue Exception:', error)
    return NextResponse.json({ items: [] })
  }
}
