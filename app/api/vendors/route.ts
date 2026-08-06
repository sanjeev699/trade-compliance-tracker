import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeVendorName } from '@/lib/compliance/normalize'
import { evaluateCompliance, evaluateVendorGlobalStatus } from '@/lib/compliance/status'
import type { VendorRow, VendorWithCompliance } from '@/lib/types/vendor'

const VENDOR_SELECT = `
  vendor_id, company_name, sc_id, trade_specialty, tax_id_ein, 
  address_street, address_zip, 
  primary_contact_name, primary_email, phone_number,
  w9_status, coi_status, emr_score, msa_status,
  w9_file_url, msa_file_url, osha_file_url, acord25_url, onboarding_status, created_at, updated_at,
  w9_rejection_reason, msa_rejection_reason, 
  emr_status, emr_file_url, emr_rejection_reason, 
  osha_status, osha_rejection_reason,
  metadata,
  documents (
    id, doc_type, file_url, extraction_status, original_filename, description_of_operations,
    review_queue_items (review_type, details)
  ),
  policy_lines (*)
`

const emrScore = z.number().min(0).max(9.99).nullable()

const CreateVendorSchema = z.object({
  company_name: z.string().trim().min(1),
  primary_email: z.string().trim().email(),
  trade_specialty: z.string().trim().min(1).default('Unclassified'),
  tax_id_ein: z.string().trim().min(1).nullable().optional(),
  address_street: z.string().trim().min(1).nullable().optional(),
  address_zip: z.string().trim().min(1).nullable().optional(),
  emr_score: emrScore.optional(),
  emr_verified: z.boolean().optional(),
  emr_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  emr_file_url: z.string().trim().url().nullable().optional(),
  emr_rejection_reason: z.string().trim().nullable().optional(),
  osha_file_url: z.string().trim().url().nullable().optional(),
  osha_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  osha_rejection_reason: z.string().trim().nullable().optional(),
  w9_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  w9_file_url: z.string().trim().url().nullable().optional(),
  w9_rejection_reason: z.string().trim().nullable().optional(),
  msa_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  msa_file_url: z.string().trim().url().nullable().optional(),
  msa_rejection_reason: z.string().trim().nullable().optional(),
  coi_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED']).optional(),
  acord25_url: z.string().trim().nullable().optional(),
  audit_note: z.string().trim().min(1).optional(),
})

const UpdateVendorSchema = CreateVendorSchema.partial().extend({

  vendor_id: z.string().uuid(),
  audit_note: z.string().optional().nullable(),
  action_type: z.enum(['DOCS_SAFETY_UPDATE', 'INSURANCE_POLICY_UPDATE', 'PROFILE_UPDATE']).optional(),
  action_details: z.string().optional(),
  policy_updates: z.array(z.object({
    policy_id: z.string().uuid(),
    limit_amount: z.number().min(0).optional(),
    expiration_date: z.string().nullable().optional(),
    status: z.string().optional(),
    rejection_reason: z.string().nullable().optional()
  })).optional()
})

function withCompliance(vendor: VendorRow): VendorWithCompliance {
  const activeLines = (vendor.policy_lines ?? []).filter((line) => line.is_active)
  
  const hasCoi = !!vendor.acord25_url || (vendor.documents || []).some(d => 
    d.doc_type === 'COI' || d.doc_type === 'ACORD 25' || d.doc_type === 'Certificate of Insurance (COI / ACORD 25)'
  )

  const compliance = evaluateCompliance(activeLines as any, undefined, undefined, hasCoi)
  const globalStatus = evaluateVendorGlobalStatus(
    compliance.status,
    vendor.w9_status,
    vendor.msa_status,
    typeof vendor.emr_score === 'number' ? vendor.emr_score : null
  )
  return {
    ...vendor,
    policy_lines: activeLines,
    compliance,
    global_status: globalStatus,
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('id')
    
    const ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001'
    const supabase = createSupabaseServerClient()
    
    let query = supabase.from('vendors').select(VENDOR_SELECT).order('company_name', { ascending: true })
    if (vendorId) {
      query = query.eq('vendor_id', vendorId)
    }
    
    const { data, error } = await query

    if (error) throw new Error(error.message)

    const vendors = ((data ?? []) as unknown as VendorRow[]).map(withCompliance)
    const trades = Array.from(
      new Set(vendors.map((vendor) => vendor.trade_specialty).filter(Boolean)),
    ).sort()

    return NextResponse.json({ vendors, trades })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load vendors'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = CreateVendorSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid vendor payload', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001'
    const supabase = createSupabaseServerClient()
    
    const newVendor = {
      ...parsed.data,
      organization_id: ORG_ID,
      normalized_name: normalizeVendorName(parsed.data.company_name),
      sc_id: `VND-${Math.floor(1000 + Math.random() * 9000)}`,
      onboarding_status: 'INVITED'
    }

    const { data, error } = await supabase
      .from('vendors')
      .insert([newVendor])
      .select(VENDOR_SELECT)
      .single()

    if (error) {
      console.error('Database insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { vendor: withCompliance(data as unknown as VendorRow) },
      { status: 201 },
    )
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Unable to create vendor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

  export async function PATCH(req: Request) {
    try {
      const body = await req.json()
      console.log('2. API RECEIVED PAYLOAD:', body)
      const parsed = UpdateVendorSchema.safeParse(body)
      if (!parsed.success) {
      const errorMsg = `Invalid vendor payload: ${parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join(', ')}`
      console.error(errorMsg)
      return NextResponse.json(
        { error: errorMsg },
        { status: 400 },
      )
    }

    const { vendor_id: vendorId, ...patch } = parsed.data
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    
    // Fetch old vendor to compare for audit log
    const { data: oldVendor } = await supabase.from('vendors').select('*').eq('vendor_id', vendorId).single()
    
    // Extract action_type, action_details and policy_updates
    const { audit_note, action_type, action_details, policy_updates, ...vendorUpdatePayload } = patch
    const updatePayload = vendorUpdatePayload.company_name 
      ? { ...vendorUpdatePayload, normalized_name: normalizeVendorName(vendorUpdatePayload.company_name) }
      : vendorUpdatePayload

    // Apply policy updates if any
    if (policy_updates && policy_updates.length > 0) {
      for (const update of policy_updates) {
        const updateData: any = {}
        if (update.limit_amount !== undefined) {
          updateData.limit_amount = update.limit_amount
          updateData.effective_limit_amount = update.limit_amount // keeping simple
        }
        if (update.expiration_date !== undefined) updateData.expiration_date = update.expiration_date
        if (update.status !== undefined) updateData.status = update.status
        if (update.rejection_reason !== undefined) updateData.rejection_reason = update.rejection_reason
        
        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase.from('policy_lines').update(updateData).eq('policy_id', update.policy_id)
          if (error) {
            console.error("SUPABASE UPDATE ERROR DETAILS:", error.message, error.details, error.hint);
            return NextResponse.json({ error: error.message || "Failed to update policies" }, { status: 500 });
          }
        }
      }
    }

    // Implicitly transition INVITED vendors to IN_REVIEW if documents or statuses are manually updated
    const isDocOrStatusUpdate = 
      patch.w9_file_url !== undefined || patch.msa_file_url !== undefined || 
      patch.acord25_url !== undefined || patch.osha_file_url !== undefined ||
      patch.w9_status !== undefined || patch.msa_status !== undefined || 
      patch.coi_status !== undefined || patch.emr_score !== undefined || 
      (policy_updates && policy_updates.length > 0);

    if (isDocOrStatusUpdate && oldVendor?.onboarding_status === 'INVITED') {
      updatePayload.onboarding_status = 'IN_REVIEW'
    }

    // Only update vendors if there are fields to update
    if (Object.keys(updatePayload).length > 0) {
      await supabase
        .from('vendors')
        .update(updatePayload)
        .eq('vendor_id', vendorId)
    }
    
    // Fetch updated vendor to return
    const { data, error } = await supabase
      .from('vendors')
      .select(VENDOR_SELECT)
      .eq('vendor_id', vendorId)
      .single()

    if (error) throw new Error(error.message)

    if ((audit_note || action_type) && oldVendor) {
      const changes = []
      if (action_type === 'INSURANCE_POLICY_UPDATE') {
        if (patch.coi_status && patch.coi_status !== oldVendor.coi_status) changes.push(`ACORD 25 COI: ${oldVendor.coi_status || 'NONE'} -> ${patch.coi_status}`)
        if (action_details) changes.push(action_details)
        if (changes.length === 0) changes.push(`Insurance policies manually updated`)
      } else if (action_type === 'PROFILE_UPDATE') {
        // PROFILE_UPDATE action details are calculated client-side and passed in
        if (action_details) changes.push(action_details)
      } else {
        if (patch.w9_status && patch.w9_status !== oldVendor.w9_status) changes.push(`W-9: ${oldVendor.w9_status} -> ${patch.w9_status}`)
        if (patch.msa_status && patch.msa_status !== oldVendor.msa_status) changes.push(`MSA: ${oldVendor.msa_status} -> ${patch.msa_status}`)
        if (patch.emr_score !== undefined && patch.emr_score !== oldVendor.emr_score) changes.push(`EMR: ${oldVendor.emr_score} -> ${patch.emr_score}`)
        if (patch.osha_file_url !== undefined && patch.osha_file_url !== oldVendor.osha_file_url) changes.push(`OSHA Log updated`)
      }
      
      const generatedActionDetails = changes.length > 0 ? changes.join(', ') : 'Profile updated'
      const finalActionDetails = (action_type === 'INSURANCE_POLICY_UPDATE' || action_type === 'PROFILE_UPDATE')
        ? changes.join(' | ') 
        : (action_details || generatedActionDetails)
      
      const { data: { user } } = await supabase.auth.getUser()

      const { data: newLog, error: insertError } = await supabase.from('audit_logs').insert({
        vendor_id: vendorId,
        actor_name: 'Risk Manager', // Default for now
        actor_role: 'Admin', // Added!
        action_type: action_type || 'PROFILE_UPDATE',
        action_details: finalActionDetails || action_details || 'Profile updated',
        user_email: user?.email,
        manager_note: audit_note || 'Profile updated'
      }).select('*').single()
      
      if (insertError) {
        console.error('�?O DB AUDIT INSERT ERROR:', insertError);
        return NextResponse.json(
          { success: false, error: insertError.message, details: insertError },
          { status: 500 }
        );
      }
      
      console.log('3. DB INSERT RESULT:', newLog, insertError);
      
      const auditLogWithVendor = newLog ? {
        ...newLog,
        manager_audit_note: newLog.manager_note,
        vendors: {
          sc_id: data.sc_id,
          company_name: data.company_name
        }
      } : null;
      
      return NextResponse.json({ 
        success: true,
        vendor: withCompliance(data as unknown as VendorRow), 
        audit_log: auditLogWithVendor 
      })
    }

    return NextResponse.json({ vendor: withCompliance(data as unknown as VendorRow) })
  } catch (error: any) {
    console.error("UNHANDLED API ERROR:", error)
    const message = error instanceof Error ? error.message : 'Unable to update vendor'
    return NextResponse.json({ error: message, details: error }, { status: 500 })
  }
}

