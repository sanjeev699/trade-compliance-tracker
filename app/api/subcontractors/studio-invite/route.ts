import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { normalizeVendorName } from '@/lib/compliance/normalize'
import crypto from 'crypto'

const StudioInviteSchema = z.object({
  company_name: z.string().trim().min(1),
  primary_email: z.string().trim().email(),
  phone_number: z.string().trim(),
  required_docs: z.array(z.string()),
  force_merge: z.boolean().optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = StudioInviteSchema.safeParse(body)
    
    if (!parsed.success) {
      const errorMsg = `Invalid payload: ${parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join(', ')}`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { company_name, primary_email, phone_number, required_docs, force_merge } = parsed.data
    const supabase = createSupabaseServerClient()
    const normalizedName = normalizeVendorName(company_name)
    
    let vendorId: string

    // 1. Check for Duplicate (Primary Email or Normalized Name)
    const { data: existingRecords, error: fetchError } = await supabase
      .from('vendors')
      .select('vendor_id, primary_email, normalized_name, company_name')
      .or(`primary_email.eq.${primary_email},normalized_name.eq.${normalizedName}`)
      .limit(1)

    if (fetchError) throw new Error(`Error querying subcontractors: ${fetchError.message}`)

    if (existingRecords && existingRecords.length > 0) {
      if (!force_merge) {
        return NextResponse.json({ 
          requires_merge_confirmation: true, 
          existing_company_name: existingRecords[0].company_name 
        }, { status: 409 })
      }
      
      // Duplicate found and force_merge is true, bind to existing
      vendorId = existingRecords[0].vendor_id
      
      await supabase
        .from('vendors')
        .update({ 
          onboarding_status: 'INVITED',
          // Optional: Update phone if we want, but sticking to spec: link invite to existing record
        })
        .eq('vendor_id', vendorId)
    } else {
      // Create new record
      const { data: newVendor, error: insertError } = await supabase
        .from('vendors')
        .insert({
          company_name,
          primary_email,
          phone_number,
          trade_specialty: 'Unclassified', // Default since Studio doesn't ask for it
          normalized_name: normalizedName,
          onboarding_status: 'INVITED',
          organization_id: process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001'
        })
        .select('vendor_id')
        .single()
        
      if (insertError) throw new Error(`Error creating subcontractor: ${insertError.message}`)
      vendorId = newVendor.vendor_id
    }

    // 2. Insert into vendor_invites
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14) // Default 14 days for studio link
    const token = crypto.randomUUID()
    
    const { error: inviteError } = await supabase
      .from('vendor_invites')
      .insert({
        vendor_id: vendorId,
        token,
        required_docs,
        internal_note: null,
        expires_at: expiresAt.toISOString(),
        organization_id: process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001',
        status: 'PENDING'
      })

    if (inviteError) throw new Error(`Error creating invite: ${inviteError.message}`)

    // 3. Log to audit_logs
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        vendor_id: vendorId,
        actor_name: 'Risk Manager',
        actor_role: 'Admin',
        action_type: 'ONBOARDING',
        action_details: `Requested: ${required_docs.join(', ')}`,
        manager_note: `Manager activated onboarding invitation for ${company_name}.`
      })

    if (auditError) console.error('Failed to write audit log:', auditError.message)

    return NextResponse.json({ success: true, token, vendor_id: vendorId })
  } catch (error: any) {
    console.error('Studio Invite Error:', error)
    return NextResponse.json(
      { error: error.message || 'Unknown error occurred' }, 
      { status: 500 }
    )
  }
}
