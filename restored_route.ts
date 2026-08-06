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

    // Only update vendors if there are fields to update
    if (Object.keys(updatePayload).length > 0) {
      await supabase
        .from('vendors')
        .update(updatePayload)
        .eq('vendor_id', vendorId)
    }
    
    // Fetch updated vendor to return
    const { data, error } = await supabase