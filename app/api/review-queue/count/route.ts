export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { count, error } = await supabase
      .from('review_queue_items')
      .select('*', { count: 'exact', head: true })
      .in('status', ['PENDING', 'IN_REVIEW'])

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ count: count || 0 })
  } catch (error: any) {
    return NextResponse.json({ count: 0, error: error.message }, { status: 500 })
  }
}
