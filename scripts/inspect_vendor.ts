import { createSupabaseAdminClient } from '../lib/supabase/admin'
import { evaluateCompliance, evaluateVendorGlobalStatus } from '../lib/compliance/status'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const VENDOR_SELECT = `
  vendor_id, company_name, normalized_name, sc_id, tax_id_ein, primary_email, phone_number,
  trade_specialty, address_street, address_zip, emr_score,
  w9_status, w9_file_url, msa_status, msa_file_url,
  osha_file_url, acord25_url, coi_status, onboarding_status, created_at, updated_at,
  policy_lines (
    id:policy_id, coverage_type, policy_number, naic_code, limit_amount,
    effective_limit_amount, effective_date, expiration_date, is_active,
    addl_insr, subr_wvd, employers_liability_ea_acc,
    employers_liability_disease_ea_emp, employers_liability_disease_policy_limit
  ),
  documents ( description_of_operations, doc_type, file_url, original_filename, extraction_status ),
  review_queue_items ( status, vendor_id )
`

async function main() {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_SELECT)
    .limit(1)
    .single()

  if (error) {
    console.error(error)
    return
  }

  const vendor = data as any
  const activeLines = (vendor.policy_lines ?? []).filter((line: any) => line.is_active)
  const compliance = evaluateCompliance(activeLines)
  const globalStatus = evaluateVendorGlobalStatus(
    compliance.status,
    vendor.w9_status,
    vendor.msa_status,
    typeof vendor.emr_score === 'number' ? vendor.emr_score : null
  )

  const finalVendor = {
    ...vendor,
    policy_lines: activeLines,
    compliance,
    global_status: globalStatus,
  }

  console.log(JSON.stringify(finalVendor, null, 2))
}

main().catch(console.error)
