import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createSupabaseServerClient()
    const { id } = await props.params
    
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('vendor_id', id)

    if (error) {
      // If RLS fails, try with service role
      if (error.message.includes('row-level security') && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const supabaseAdmin = createSupabaseServerClient()
        const { error: adminError } = await supabaseAdmin
          .from('vendors')
          .delete()
          .eq('vendor_id', id)
        
        if (adminError) {
          return NextResponse.json({ error: adminError.message }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
