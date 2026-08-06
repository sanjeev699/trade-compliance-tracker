import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeVendorName } from '@/lib/compliance/normalize'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const name = searchParams.get('name')
  
  if (!email || !name) return NextResponse.json({ exists: false })
  
  const supabase = createSupabaseServerClient()
  
  const { data: existingRecords } = await supabase
    .from('vendors')
    .select('company_name')
    .or(`primary_email.eq.${email},normalized_name.eq.${normalizeVendorName(name)}`)
    .limit(1)
  
  if (existingRecords && existingRecords.length > 0) {
    return NextResponse.json({ exists: true, company_name: existingRecords[0].company_name })
  }
  
  return NextResponse.json({ exists: false })
}
