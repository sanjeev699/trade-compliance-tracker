import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createSupabaseServerClient()
    const { id } = await props.params
    const url = new URL(req.url)
    const type = url.searchParams.get('type') // 'W9', 'MSA', or 'COI'

    if (!type || (type !== 'W9' && type !== 'MSA' && type !== 'COI')) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    // 1. Fetch vendor to get the correct file_url
    const column = type === 'W9' ? 'w9_file_url' : type === 'MSA' ? 'msa_file_url' : 'acord25_url'
    const statusColumn = type === 'W9' ? 'w9_status' : type === 'MSA' ? 'msa_status' : 'coi_status'
    
    const { data: vendor, error: fetchError } = await supabase
      .from('vendors')
      .select(`${column}`)
      .eq('vendor_id', id)
      .single()

    if (fetchError || !vendor) {
      return NextResponse.json({ error: fetchError?.message || 'Vendor not found' }, { status: 404 })
    }

    const fileUrl = (vendor as any)[column]

    // 2. Set the file url to null in the database
    const updatePayload: any = {
      [column]: null,
      [statusColumn]: 'PENDING'
    }

    const { error: dbError } = await supabase
      .from('vendors')
      .update(updatePayload)
      .eq('vendor_id', id)

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 })
    }

    // 3. Delete from Supabase Storage
    if (fileUrl) {
      const urlParts = fileUrl.split('/certificates/')
      if (urlParts.length > 1) {
        const filePath = urlParts[1]
        const { error: storageError } = await supabase.storage.from('certificates').remove([filePath])
        if (storageError) {
          console.error(`Failed to delete ${type} from storage:`, storageError)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
