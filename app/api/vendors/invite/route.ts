import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { normalizeVendorName } from '@/lib/compliance/normalize'
import crypto from 'crypto'

const InviteVendorSchema = z.object({
  company_name: z.string().trim().min(1),
  primary_email: z.string().trim().email(),
  trade_specialty: z.string().trim().min(1),
  required_docs: z.array(z.string()),
  expires_in_days: z.number().int().min(1).max(30),
  internal_note: z.string().optional(),
  force_merge: z.boolean().optional()
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = InviteVendorSchema.safeParse(body)
    
    if (!parsed.success) {
      const errorMsg = `Invalid payload: ${parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join(', ')}`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { company_name, primary_email, trade_specialty, required_docs, expires_in_days, internal_note, force_merge } = parsed.data
    const supabase = createSupabaseServerClient()

    // 1. Create or get existing vendor
    const normalizedName = normalizeVendorName(company_name)
    
    let vendorId: string

    // See if vendor already exists by normalized name or email
    const { data: existingRecords, error: fetchError } = await supabase
      .from('vendors')
      .select('vendor_id, company_name')
      .or(`primary_email.eq.${primary_email},normalized_name.eq.${normalizedName}`)
      .limit(1)

    if (fetchError) throw new Error(`Error querying vendors: ${fetchError.message}`)

    if (existingRecords && existingRecords.length > 0) {
      if (!force_merge) {
        return NextResponse.json({ 
          requires_merge_confirmation: true, 
          existing_company_name: existingRecords[0].company_name 
        }, { status: 409 })
      }

      vendorId = existingRecords[0].vendor_id
      // Update onboarding status for existing
      await supabase
        .from('vendors')
        .update({ onboarding_status: 'INVITED' })
        .eq('vendor_id', vendorId)
    } else {
      // Create new vendor
      const ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001'
      const { data: newVendor, error: insertError } = await supabase
        .from('vendors')
        .insert({
          company_name,
          primary_email,
          trade_specialty,
          normalized_name: normalizedName,
          organization_id: ORG_ID,
          onboarding_status: 'INVITED'
        })
        .select('vendor_id')
        .single()
        
      if (insertError) throw new Error(`Error creating vendor: ${insertError.message}`)
      vendorId = newVendor.vendor_id
    }

    // 2. Insert into vendor_invites
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expires_in_days)
    
    const token = crypto.randomUUID()
    
    const { error: inviteError } = await supabase
      .from('vendor_invites')
      .insert({
        vendor_id: vendorId,
        token,
        required_docs,
        internal_note: internal_note || null,
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
        action_type: 'INVITE_CREATED',
        action_details: `Sent onboarding invite requesting: ${required_docs.join(', ')}`,
        manager_note: `Onboarding invite sent to ${primary_email} (${company_name}). ${internal_note ? `Note: ${internal_note}` : ''}`
      })

    if (auditError) console.error('Failed to write audit log:', auditError.message)

    // 4. Return formatted response for the frontend
    const origin = req.headers.get('origin') || 'https://compliance.engine.local'
    const magicLinkUrl = `${origin}/onboarding/${token}`
    
    const subject = `Action Required: Subcontractor Onboarding for ${company_name}`
    const emailBody = `Hello,

You have been invited to complete the subcontractor onboarding process for Trade Compliance Tracker.

Please click the secure link below to upload your required compliance documents:
${required_docs.map(doc => `- ${doc}`).join('\n')}

Secure Onboarding Link:
${magicLinkUrl}

🔒 Note: This secure onboarding link is unique to ${company_name} and expires in ${expires_in_days} days. Please do not forward.

Thank you.`

    return NextResponse.json({
      success: true,
      vendor_id: vendorId,
      magic_link_url: magicLinkUrl,
      subject,
      emailBody
    })

  } catch (error: unknown) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' }, 
      { status: 500 }
    )
  }
}
