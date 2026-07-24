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
