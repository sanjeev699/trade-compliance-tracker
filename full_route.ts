				<truncated 39 lines>
  msa_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
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

export async function GET() {
  try {
    const ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001'
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('vendors')
      .select(VENDOR_SELECT)
      // .eq('organization_id', ORG_ID) // Uncomment if org filtering is enforced
      .order('company_name', { ascending: true })

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

