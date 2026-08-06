import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { normalizeVendorName } from '@/lib/compliance/normalize'

const FileSchema = z.object({
  docType: z.string(),
  fileUrl: z.string().url(),
  originalFilename: z.string(),
  mimeType: z.string(),
})

const ManualOnboardSchema = z.object({
  company_name: z.string().trim().min(1),
  tax_id: z.string().trim().min(1),
  address_street: z.string().trim().min(1),
  primary_email: z.string().trim().email(),
  primary_phone: z.string().trim().optional(),
  files: z.array(FileSchema)
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = ManualOnboardSchema.safeParse(body)
    
    if (!parsed.success) {
      const errorMsg = `Invalid payload: ${parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join(', ')}`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { company_name, tax_id, address_street, primary_email, primary_phone, files } = parsed.data
    const supabase = createSupabaseServerClient()
    const normalizedName = normalizeVendorName(company_name)
    
    let vendorId: string

    // 1. Check for Duplicate
    const { data: existingRecords } = await supabase
      .from('vendors')
      .select('vendor_id')
      .or(`tax_id_ein.eq.${tax_id},primary_email.eq.${primary_email},normalized_name.eq.${normalizedName}`)
      .limit(1)

    if (existingRecords && existingRecords.length > 0) {
      // Bind to existing
      vendorId = existingRecords[0].vendor_id
      await supabase
        .from('vendors')
        .update({ 
          onboarding_status: 'IN_REVIEW',
          address_street,
          phone_number: primary_phone || null
        })
        .eq('vendor_id', vendorId)
    } else {
      // Create new record
      const { data: newVendor, error: insertError } = await supabase
        .from('vendors')
        .insert({
          company_name,
          primary_email,
          phone_number: primary_phone || null,
          tax_id_ein: tax_id,
          address_street,
          trade_specialty: 'Unclassified',
          normalized_name: normalizedName,
          onboarding_status: 'IN_REVIEW'
        })
        .select('vendor_id')
        .single()
        
      if (insertError) throw new Error(`Error creating subcontractor: ${insertError.message}`)
      vendorId = newVendor.vendor_id
    }

    // 2. Insert Documents
    const protocol = req.headers.get('x-forwarded-proto') || 'http'
    const host = req.headers.get('host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`

    for (const file of files) {
      const isAcord25 = file.docType === "Certificate of Insurance (COI / ACORD 25)" || file.docType === "ACORD 25"

      const { error: docError } = await supabase
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
        
      if (docError) {
        console.error('Failed to insert document metadata:', docError.message)
        continue
      }

      if (isAcord25) {
        try {
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
          if (!res.ok) console.error('Extraction failed:', await res.text())
        } catch (extError) {
          console.error('Failed to trigger parse-doc:', extError)
        }
      }
    }

    // 3. Log to audit_logs
    await supabase
      .from('audit_logs')
      .insert({
        vendor_id: vendorId,
        actor_name: 'Compliance Manager',
        actor_role: 'Manager',
        action_type: 'SUB_ONBOARDING_COMPLETED',
        action_details: JSON.stringify({ uploadedFiles: files.length }),
        manager_note: 'Automated entry via Manual Onboarding escape hatch'
      })

    return NextResponse.json({ success: true, vendor_id: vendorId })
  } catch (error: any) {
    console.error('Manual Onboard Error:', error)
    return NextResponse.json(
      { error: error.message || 'Unknown error occurred' }, 
      { status: 500 }
    )
  }
}
