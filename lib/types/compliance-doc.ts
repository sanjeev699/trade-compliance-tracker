export interface Coverage {
  type: string
  policy_number: string
  expiration_date: string
  limits: string
  sub_limits?: { limit_name: string; amount: string }[] | null
}

export interface ComplianceDocRow {
  id: string
  company_name: string
  doc_type: string
  expiration_date: string
  policy_amount: string | null
  coverages: Coverage[] | null
  file_url: string | null
  created_at: string
}

export interface ParsedComplianceDoc {
  company_name: string
  doc_type: string
  expiration_date: string
  policy_amount: string
  coverages: Coverage[]
}
