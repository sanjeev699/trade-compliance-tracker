export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return NextResponse.json(data ?? [])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load documents'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient()
    const { vendor_id, file_url, doc_type, original_filename, mime_type } = await req.json()

    if (!vendor_id) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    // Backend check to verify vendor exists
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('vendor_id, company_name')
      .eq('vendor_id', vendor_id)
      .single()

    if (vendorError || !vendor) {
      return NextResponse.json({ error: 'Target vendor does not exist' }, { status: 404 })
    }

    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        vendor_id,
        company_name: vendor.company_name,
        file_url,
        doc_type: doc_type || 'UNKNOWN',
        original_filename,
        mime_type,
        extraction_status: 'EXTRACTED' // Valid constraint values: 'PENDING', 'EXTRACTED', 'PROCESSED', 'REVIEW_REQUIRED', 'FAILED'
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    
    return NextResponse.json(document, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
