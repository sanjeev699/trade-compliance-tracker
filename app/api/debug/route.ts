export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: vendor } = await supabase.from('vendors').select('company_name, documents ( coverages )').ilike('company_name', '%Aldea%').single()
  return NextResponse.json({ vendor })
}
