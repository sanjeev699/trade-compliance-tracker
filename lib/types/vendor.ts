import type { ComplianceEvaluation, CoverageType } from '@/lib/compliance/status'

export interface PolicyLineRow {
  policy_id: string
  coverage_type: CoverageType
  policy_number: string
  naic_code: string
  limit_amount: string | number
  effective_limit_amount: string | number
  effective_date: string
  expiration_date: string
  is_active: boolean
}

export interface VendorRow {
  vendor_id: string
  company_name: string
  normalized_name: string
  tax_id_ein: string | null
  primary_email: string
  trade_specialty: string
  address_street: string | null
  address_zip: string | null
  emr_score: string | number | null
  emr_verified: boolean
  osha_file_url: string | null
  created_at: string
  updated_at: string
  policy_lines: PolicyLineRow[]
}

export interface VendorWithCompliance extends VendorRow {
  compliance: ComplianceEvaluation
}

export interface VendorsResponse {
  vendors: VendorWithCompliance[]
  trades: string[]
}

export interface VendorPatch {
  vendor_id: string
  company_name?: string
  primary_email?: string
  trade_specialty?: string
  tax_id_ein?: string | null
  address_street?: string | null
  address_zip?: string | null
  emr_score?: number | null
  emr_verified?: boolean
  osha_file_url?: string | null
}
