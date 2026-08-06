import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient()
    const body = await req.json()
    const { vendor_id, review_item_id } = body

    if (!vendor_id && !review_item_id) {
      return NextResponse.json({ error: 'Missing vendor_id or review_item_id' }, { status: 400 })
    }

    let query = supabase
      .from('review_queue_items')
      .update({ status: 'RESOLVED', updated_at: new Date().toISOString() })
      .eq('status', 'PENDING')

    if (review_item_id) {
      query = query.eq('review_id', review_item_id)
    } else if (vendor_id) {
      query = query.eq('vendor_id', vendor_id)
    }

    const { error } = await query

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
