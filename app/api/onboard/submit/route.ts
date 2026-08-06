import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const FileSchema = z.object({
  docType: z.string(),
  fileUrl: z.string().url(),
  originalFilename: z.string(),
  mimeType: z.string(),
  size: z.number().optional()
})

const OnboardSubmitSchema = z.object({
  token: z.string().uuid(),
  primary_contact_name: z.string().trim().min(1),
  primary_phone: z.string().trim().min(1),
  tax_id: z.string().trim().min(1),
  address_street: z.string().trim().min(1),
  address_zip: z.string().trim().min(1),
  alt_email: z.string().optional().nullable(),
  alt_phone: z.string().optional().nullable(),
  files: z.array(FileSchema)
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = OnboardSubmitSchema.safeParse(body)
    
    if (!parsed.success) {
      const errorMsg = `Invalid payload: ${parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join(', ')}`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { 
      token, primary_contact_name, primary_phone, tax_id, 
      address_street, address_zip, alt_email, alt_phone, files 
    } = parsed.data

    const supabase = createSupabaseServerClient()

    // 1. Validate Token
    const { data: invite, error: inviteError } = await supabase
      .from('vendor_invites')
      .select('id, vendor_id, status, expires_at')
      .eq('token', token)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid or missing invitation token.' }, { status: 400 })
    }
    
    if (invite.status !== 'PENDING') {
      return NextResponse.json({ error: 'This onboarding link has already been used or expired.' }, { status: 400 })
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This onboarding link has expired.' }, { status: 400 })
    }

    const vendorId = invite.vendor_id

    // 1.5 Check for Duplicate Tax ID
    const { data: duplicates } = await supabase
      .from('vendors')
      .select('vendor_id, company_name')
      .eq('tax_id_ein', tax_id)
      .neq('vendor_id', vendorId)
      .limit(1)
      
    const duplicateVendor = duplicates && duplicates.length > 0 ? duplicates[0] : null
    const finalStatus = duplicateVendor ? 'NEEDS_REVIEW' : 'IN_REVIEW'

    // Prepare file URLs
    const w9File = files.find(f => f.docType === "W-9")
    const msaFile = files.find(f => f.docType === "Master Subcontractor Agreement (MSA)" || f.docType === "MSA")
    const acordFile = files.find(f => f.docType === "Certificate of Insurance (COI / ACORD 25)" || f.docType === "ACORD 25")
    const oshaFile = files.find(f => f.docType === "OSHA 300 Log")

    const updatePayload: any = {
        address_street,
        address_zip,
        metadata: {
          contact_person: primary_contact_name,
          phone: primary_phone,
          ein: tax_id,
          alt_email,
          alt_phone
        },
        onboarding_status: finalStatus
    }

    if (w9File) updatePayload.w9_file_url = w9File.fileUrl
    if (msaFile) updatePayload.msa_file_url = msaFile.fileUrl
    if (acordFile) updatePayload.acord25_url = acordFile.fileUrl
    if (oshaFile) updatePayload.osha_file_url = oshaFile.fileUrl

    // 2. Update Vendor Record
    const { error: updateError } = await supabase
      .from('vendors')
      .update(updatePayload)
      .eq('vendor_id', vendorId)

    if (updateError) {
      throw new Error(`Failed to update vendor: ${updateError.message}`)
    }

    // 3. Process Files (Insert Document Metadata)
    const protocol = req.headers.get('x-forwarded-proto') || 'http'
    const host = req.headers.get('host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`

    for (const file of files) {
      const isAcord25 = file.docType === "Certificate of Insurance (COI / ACORD 25)" || file.docType === "ACORD 25"

      // Insert into documents table
      const { data: docRecord, error: docError } = await supabase
        .from('documents')
        .insert({
          vendor_id: vendorId,
          company_name: 'Unknown (Pending Extraction)',
          doc_type: file.docType,
          file_url: file.fileUrl,
          original_filename: file.originalFilename,
          mime_type: file.mimeType,
          extraction_status: isAcord25 ? 'PENDING' : 'PROCESSED'
        })
        .select('id')
        .single()
        
      if (docError) {
        console.error('Failed to insert document metadata:', docError.message)
        continue
      }

      // If it's an ACORD 25, trigger extraction
      if (isAcord25) {
        try {
          // We call our own API route to run extraction, passing the forced vendor_id
          const res = await fetch(`${baseUrl}/api/parse-doc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileUrl: file.fileUrl,
              originalFilename: file.originalFilename,
              mimeType: file.mimeType,
              vendor_id: vendorId
            })
          })
          
          if (!res.ok) {
            console.error('Extraction failed for document:', await res.text())
            await supabase.from('review_queue_items').insert({
              document_id: docRecord.id,
              vendor_id: vendorId,
              review_type: 'MANUAL_OVERRIDE',
              details: { 
                type: 'INVALID_DOCUMENT_FORMAT', 
                reason: 'Uploaded file(s) could not be parsed as a valid ACORD 25 certificate.' 
              }
            })
            await supabase.from('documents').update({ extraction_status: 'REVIEW_REQUIRED' }).eq('id', docRecord.id)
          }
        } catch (extError) {
          console.error('Failed to trigger parse-doc:', extError)
          await supabase.from('review_queue_items').insert({
            document_id: docRecord.id,
            vendor_id: vendorId,
            review_type: 'MANUAL_OVERRIDE',
            details: { 
              type: 'INVALID_DOCUMENT_FORMAT', 
              reason: 'Uploaded file(s) could not be parsed as a valid ACORD 25 certificate.' 
            }
          })
          await supabase.from('documents').update({ extraction_status: 'REVIEW_REQUIRED' }).eq('id', docRecord.id)
        }
      }
    }

    // 4. Mark Invite as USED
    await supabase
      .from('vendor_invites')
      .update({ status: 'USED' })
      .eq('id', invite.id)

    // 5. Audit Log
    const auditLogs = [{
      vendor_id: vendorId,
      actor_name: 'Subcontractor',
      actor_role: 'External',
      action_type: 'SUB_ONBOARDING_COMPLETED',
      action_details: `Subcontractor completed onboarding portal submission. Uploaded ${files.length} document(s).`,
      manager_note: 'Automated entry via Subcontractor Onboarding Portal'
    }]

    if (duplicateVendor) {
      auditLogs.push({
        vendor_id: vendorId,
        actor_name: 'Subcontractor',
        actor_role: 'External',
        action_type: 'PROFILE_UPDATE',
        action_details: `Submitted Tax ID/EIN matches existing vendor record [${duplicateVendor.vendor_id} / ${duplicateVendor.company_name}]`,
        manager_note: 'Automated entry: Duplicate Tax ID Flagged'
      })
    }

    await supabase.from('audit_logs').insert(auditLogs)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Submit API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Unknown error occurred' }, 
      { status: 500 }
    )
  }
}
