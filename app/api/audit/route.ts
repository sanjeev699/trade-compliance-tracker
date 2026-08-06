export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const vendorId = searchParams.get('vendor_id')

    const supabase = createSupabaseServerClient()
    let query = supabase
      .from('audit_logs')
      .select('*, vendors!inner(sc_id, company_name)')
      .order('created_at', { ascending: false })

    if (vendorId) {
      query = query.eq('vendor_id', vendorId)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)
    
    const mappedData = data.map((log: any) => ({
      ...log,
      manager_audit_note: log.manager_note
    }))
    
    return NextResponse.json({ logs: mappedData })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load audit logs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
