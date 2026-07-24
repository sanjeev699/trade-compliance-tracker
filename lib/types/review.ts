import type { CoverageType } from '@/lib/compliance/status'
import type { VendorWithCompliance } from '@/lib/types/vendor'

export type ReviewType =
  | 'LOW_CONFIDENCE_MATCH'
  | 'ADDRESS_MISMATCH'
  | 'FUZZY_MATCH'
  | 'CARRIER_SWITCH'
  | 'POLICY_CONFLICT'
  | 'MISSING_POLICY_DATA'
  | 'MANUAL_OVERRIDE'

export type ReviewStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED'

export const REJECTION_REASONS = [
  'NOT_AN_ACORD_25',
  'ILLEGIBLE_DOCUMENT',
  'WRONG_VENDOR',
  'EXPIRED_CERTIFICATE',
  'DUPLICATE_SUBMISSION',
  'EXTRACTION_INACCURATE',
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]

export interface ExtractedCoverage {
  coverage_type: CoverageType
  policy_number: string | null
  naic_code: string | null
  limit_amount: number
  effective_date: string | null
  expiration_date: string
}

export interface ExtractedDocument {
  vendor_name: string
  address_street: string | null
  address_zip: string | null
  primary_email?: string | null
  coverages: ExtractedCoverage[]
}

export interface ReviewDocument {
  id: string
  company_name: string
  doc_type: string
  file_url: string
  original_filename: string | null
  mime_type: string | null
  extraction_status: string
  extracted_data: ExtractedDocument
  created_at: string
}

export interface VendorSummary {
  vendor_id: string
  company_name: string
  trade_specialty: string
  primary_email: string
  tax_id_ein: string | null
  address_street: string | null
  address_zip: string | null
}

export interface ReviewQueueItem {
  review_id: string
  review_type: ReviewType
  status: ReviewStatus
  confidence_score: string | number | null
  details: Record<string, unknown>
  created_at: string
  document: ReviewDocument
  vendor: VendorWithCompliance | null
  candidate_vendors: VendorSummary[]
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[]
}

export interface ResolveVendorPayload {
  vendor_id?: string
  company_name: string
  primary_email: string
  trade_specialty: string
  tax_id_ein?: string | null
  address_street?: string | null
  address_zip?: string | null
}

export interface ResolveReviewPayload {
  action: 'APPROVE' | 'REJECT'
  notes?: string | null
  reason_code?: RejectionReason
  vendor?: ResolveVendorPayload
  coverages?: ExtractedCoverage[]
}
