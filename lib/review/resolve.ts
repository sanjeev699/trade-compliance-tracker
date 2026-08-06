import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeVendorName } from '@/lib/compliance/normalize'
import type { ExtractedCoverage, ResolveVendorPayload } from '@/lib/types/review'

export interface ReviewItemRecord {
  review_id: string
  document_id: string
  vendor_id: string | null
  status: string
  details: Record<string, unknown> | null
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function provisionedVendorId(details: Record<string, unknown> | null): string | null {
  const value = details?.provisioned_vendor_id
  return typeof value === 'string' ? value : null
}

export async function loadReviewItem(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<ReviewItemRecord> {
  const { data, error } = await supabase
    .from('review_queue_items')
    .select('review_id, document_id, vendor_id, status, details')
    .eq('review_id', reviewId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load review item: ${error.message}`)
  if (!data) throw new Error('Review item not found')
  if (data.status === 'RESOLVED' || data.status === 'DISMISSED') {
    throw new Error('Review item has already been resolved')
  }
  return data as ReviewItemRecord
}

async function upsertVendor(
  supabase: SupabaseClient,
  vendor: ResolveVendorPayload,
): Promise<string> {
  const fields = {
    company_name: vendor.company_name,
    normalized_name: normalizeVendorName(vendor.company_name),
    primary_email: vendor.primary_email,
    trade_specialty: vendor.trade_specialty || 'Unclassified',
    tax_id_ein: vendor.tax_id_ein ?? null,
    address_street: vendor.address_street ?? null,
    address_zip: vendor.address_zip ?? null,
  }

  if (vendor.vendor_id) {
    const { error } = await supabase
      .from('vendors')
      .update(fields)
      .eq('vendor_id', vendor.vendor_id)
    if (error) throw new Error(`Unable to update vendor: ${error.message}`)
    return vendor.vendor_id
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert(fields)
    .select('vendor_id')
    .single()
  if (error) throw new Error(`Unable to create vendor: ${error.message}`)
  return data.vendor_id as string
}

// The manager has confirmed this certificate, so its lines become the active
// truth for each coverage type it carries.
async function applyCoverages(
  supabase: SupabaseClient,
  vendorId: string,
  documentId: string,
  coverages: ExtractedCoverage[],
) {
  for (const coverage of coverages) {
    const policyNumber = coverage.policy_number?.trim()
    const naicCode = coverage.naic_code?.trim()
    if (!policyNumber || !naicCode) {
      throw new Error(
        `${coverage.coverage_type} needs both a policy number and a NAIC code before it can be approved`,
      )
    }

    const { data: activeLines, error: activeError } = await supabase
      .from('policy_lines')
      .select('id:policy_id, policy_number, naic_code')
      .eq('vendor_id', vendorId)
      .eq('coverage_type', coverage.coverage_type)
      .eq('is_active', true)
    if (activeError) throw new Error(`Unable to read policy lines: ${activeError.message}`)

    const sameLine = activeLines?.find(
      (line) => line.policy_number === policyNumber && line.naic_code === naicCode,
    )
    const supersededIds = (activeLines ?? [])
      .filter((line) => line.id !== sameLine?.id)
      .map((line) => line.id)

    if (supersededIds.length > 0) {
      const { error } = await supabase
        .from('policy_lines')
        .update({ is_active: false })
        .in('policy_id', supersededIds)
      if (error) throw new Error(`Unable to archive superseded policy: ${error.message}`)
    }

    const values = {
      vendor_id: vendorId,
      document_id: documentId,
      policy_number: policyNumber,
      naic_code: naicCode,
      coverage_type: coverage.coverage_type,
      limit_amount: coverage.limit_amount,
      effective_date: coverage.effective_date ?? today(),
      expiration_date: coverage.expiration_date,
      is_active: true,
    }

    const { error } = sameLine
      ? await supabase.from('policy_lines').update(values).eq('policy_id', sameLine.id)
      : await supabase.from('policy_lines').insert(values)
    if (error) throw new Error(`Unable to save policy line: ${error.message}`)
  }
}

// A vendor auto-provisioned during ingest is discarded once the manager links
// the certificate elsewhere or rejects it, but only when nothing else uses it.
async function discardOrphanProvisionedVendor(
  supabase: SupabaseClient,
  vendorId: string,
  documentId: string,
) {
  const { data: policyLines, error: policyError } = await supabase
    .from('policy_lines')
    .select('id, document_id')
    .eq('vendor_id', vendorId)
  if (policyError) throw new Error(`Unable to inspect vendor policies: ${policyError.message}`)
  if ((policyLines ?? []).some((line) => line.document_id !== documentId)) return

  const { count: documentCount, error: documentError } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
    .neq('id', documentId)
  if (documentError) throw new Error(`Unable to inspect vendor documents: ${documentError.message}`)
  if ((documentCount ?? 0) > 0) return

  const { error } = await supabase.from('vendors').delete().eq('vendor_id', vendorId)
  if (error) throw new Error(`Unable to remove provisioned vendor: ${error.message}`)
}

async function closeOpenItemsForDocument(
  supabase: SupabaseClient,
  documentId: string,
  vendorId: string | null,
  status: 'RESOLVED' | 'DISMISSED',
  resolutionCode: string,
  notes: string | null,
) {
  const { error } = await supabase
    .from('review_queue_items')
    .update({
      status,
      vendor_id: vendorId,
      resolved_at: new Date().toISOString(),
      resolution_code: resolutionCode,
      resolution_notes: notes,
    })
    .eq('document_id', documentId)
    .in('status', ['PENDING', 'IN_REVIEW'])
  if (error) throw new Error(`Unable to close review items: ${error.message}`)
}

export async function approveReviewItem(
  supabase: SupabaseClient,
  item: ReviewItemRecord,
  vendor: ResolveVendorPayload,
  coverages: ExtractedCoverage[],
  notes: string | null,
) {
  const vendorId = await upsertVendor(supabase, vendor)
  await applyCoverages(supabase, vendorId, item.document_id, coverages)

  const { error: documentError } = await supabase
    .from('documents')
    .update({ vendor_id: vendorId, extraction_status: 'PROCESSED' })
    .eq('id', item.document_id)
  if (documentError) throw new Error(`Unable to link document: ${documentError.message}`)

  await closeOpenItemsForDocument(
    supabase,
    item.document_id,
    vendorId,
    'RESOLVED',
    'APPROVED_AND_LINKED',
    notes,
  )

  const provisioned = provisionedVendorId(item.details)
  if (provisioned && provisioned !== vendorId) {
    await discardOrphanProvisionedVendor(supabase, provisioned, item.document_id)
  }

  return vendorId
}

export async function rejectReviewItem(
  supabase: SupabaseClient,
  item: ReviewItemRecord,
  reasonCode: string,
  notes: string | null,
) {
  // Nothing extracted from a rejected certificate may stay active.
  const { error: archiveError } = await supabase
    .from('policy_lines')
    .update({ is_active: false })
    .eq('document_id', item.document_id)
    .eq('is_active', true)
  if (archiveError) throw new Error(`Unable to archive rejected policies: ${archiveError.message}`)

  const { error: documentError } = await supabase
    .from('documents')
    .update({ extraction_status: 'REJECTED' })
    .eq('id', item.document_id)
  if (documentError) throw new Error(`Unable to reject document: ${documentError.message}`)

  await closeOpenItemsForDocument(
    supabase,
    item.document_id,
    item.vendor_id,
    'DISMISSED',
    reasonCode,
    notes,
  )

  const provisioned = provisionedVendorId(item.details) ?? item.vendor_id
  if (provisioned) {
    await discardOrphanProvisionedVendor(supabase, provisioned, item.document_id)
  }
}
