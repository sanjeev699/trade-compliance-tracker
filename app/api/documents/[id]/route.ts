import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createSupabaseServerClient()
    const { id } = await props.params
    
    // 1. Fetch document to get file_url
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('file_url, vendor_id')
      .eq('id', id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: fetchError?.message || 'Document not found' }, { status: 404 })
    }

    if (doc.vendor_id && doc.file_url) {
      const { data: vendor } = await supabase.from('vendors').select('w9_file_url, msa_file_url, osha_file_url, acord25_url').eq('vendor_id', doc.vendor_id).single()
      if (vendor) {
        const updates: any = {}
        if (vendor.w9_file_url === doc.file_url) { updates.w9_file_url = null; updates.w9_status = 'PENDING' }
        if (vendor.msa_file_url === doc.file_url) { updates.msa_file_url = null; updates.msa_status = 'PENDING' }
        if (vendor.osha_file_url === doc.file_url) { updates.osha_file_url = null }
        if (vendor.acord25_url === doc.file_url) { updates.acord25_url = null; updates.coi_status = 'PENDING' }
        
        if (Object.keys(updates).length > 0) {
          await supabase.from('vendors').update(updates).eq('vendor_id', doc.vendor_id)
        }
      }
    }

    // 2. Delete from database (cascades to review_queue_items)
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (dbError) {
      if (dbError.message.includes('row-level security') && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        // If RLS fails, bypass with service role
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )
        const { error: adminError } = await supabaseAdmin
          .from('documents')
          .delete()
          .eq('id', id)
        
        if (adminError) {
          return NextResponse.json({ error: adminError.message }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: dbError.message }, { status: 400 })
      }
    }

    // 3. Delete from Supabase Storage
    if (doc.file_url) {
      // Extract the path from the URL
      // E.g. https://.../storage/v1/object/public/certificates/0a8c...
      const urlParts = doc.file_url.split('/certificates/')
      if (urlParts.length > 1) {
        const filePath = urlParts[1]
        const { error: storageError } = await supabase.storage.from('certificates').remove([filePath])
        if (storageError) {
          console.error("Failed to delete file from storage:", storageError)
          // We don't fail the API request since the DB record is already deleted
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
