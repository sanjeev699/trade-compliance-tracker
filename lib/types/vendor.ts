import type { ComplianceEvaluation, CoverageType, VendorGlobalStatus } from '@/lib/compliance/status'

export interface PolicyLineRow {
  id?: string
  policy_id?: string
  coverage_type: CoverageType
  policy_number: string
  naic_code: string
  limit_amount: string | number
  effective_limit_amount: string | number
  effective_date: string
  expiration_date: string
  is_active: boolean
  addl_insr?: boolean
  subr_wvd?: boolean
  employers_liability_ea_acc?: number | string | null
  employers_liability_disease_ea_emp?: number | string | null
  employers_liability_disease_policy_limit?: number | string | null
  status?: 'APPROVED' | 'EXPIRED' | 'REJECTED' | 'MISSING_DATA' | null
  rejection_reason?: string | null
}

export interface VendorRow {
  vendor_id: string
  company_name: string
  normalized_name: string
  sc_id: string
  w9_status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  w9_file_url: string | null
  w9_rejection_reason?: string | null
  msa_status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  msa_file_url: string | null
  msa_rejection_reason?: string | null
  tax_id_ein: string | null
  primary_email: string
  phone_number: string | null
  primary_contact_name?: string | null
  alt_email?: string | null
  alt_phone?: string | null
  trade_specialty: string
  address_street: string | null
  address_zip: string | null
  emr_score: string | number | null
  emr_verified?: boolean
  emr_status?: 'PENDING' | 'VERIFIED' | 'REJECTED'
  emr_file_url?: string | null
  emr_rejection_reason?: string | null
  osha_file_url: string | null
  osha_status?: 'PENDING' | 'VERIFIED' | 'REJECTED'
  osha_rejection_reason?: string | null
  acord25_url?: string | null
  coi_status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED'
  created_at: string
  updated_at: string
  policy_lines: PolicyLineRow[]
  documents?: { description_of_operations: string | null, doc_type?: string | null, file_url?: string | null, original_filename?: string | null, extraction_status?: string | null }[]
  onboarding_status?: string | null
}

export interface VendorInvite {
  id: string
  vendor_id: string
  token: string
  required_docs: string[]
  internal_note: string | null
  expires_at: string
  status: 'PENDING' | 'USED' | 'EXPIRED'
  created_at: string
}

export interface VendorWithCompliance extends VendorRow {
  compliance: ComplianceEvaluation
  global_status: VendorGlobalStatus
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
  phone_number?: string | null
  address_street?: string | null
  address_zip?: string | null
  emr_score?: number | null
  emr_verified?: boolean
  emr_status?: 'PENDING' | 'VERIFIED' | 'REJECTED'
  emr_file_url?: string | null
  emr_rejection_reason?: string | null
  osha_file_url?: string | null
  osha_status?: 'PENDING' | 'VERIFIED' | 'REJECTED'
  osha_rejection_reason?: string | null
  w9_status?: 'PENDING' | 'VERIFIED' | 'REJECTED'
  w9_file_url?: string | null
  w9_rejection_reason?: string | null
  msa_status?: 'PENDING' | 'VERIFIED' | 'REJECTED'
  msa_file_url?: string | null
  msa_rejection_reason?: string | null
  audit_note?: string
  onboarding_status?: string | null
}
