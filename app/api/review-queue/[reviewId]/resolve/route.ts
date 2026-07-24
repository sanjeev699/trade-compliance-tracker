import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { approveReviewItem, loadReviewItem, rejectReviewItem } from '@/lib/review/resolve'
import { REJECTION_REASONS } from '@/lib/types/review'

const coverageSchema = z.object({
  coverage_type: z.enum(['GL', 'AUTO', 'WORKERS_COMP', 'UMBRELLA']),
  policy_number: z.string().nullable(),
  naic_code: z.string().nullable(),
  limit_amount: z.number().nonnegative(),
  effective_date: z.string().nullable(),
  expiration_date: z.string().min(1),
})

const vendorSchema = z.object({
  vendor_id: z.string().uuid().optional(),
  company_name: z.string().min(1),
  primary_email: z.string().email(),
  trade_specialty: z.string().min(1),
  tax_id_ein: z.string().nullable().optional(),
  address_street: z.string().nullable().optional(),
  address_zip: z.string().nullable().optional(),
})

const payloadSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('APPROVE'),
    notes: z.string().nullable().optional(),
    vendor: vendorSchema,
    coverages: z.array(coverageSchema).min(1),
  }),
  z.object({
    action: z.literal('REJECT'),
    notes: z.string().nullable().optional(),
    reason_code: z.enum(REJECTION_REASONS),
  }),
])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const { reviewId } = await params
    if (!z.string().uuid().safeParse(reviewId).success) {
      return NextResponse.json({ error: 'Invalid review id' }, { status: 400 })
    }

    const parsed = payloadSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const supabase = createSupabaseServerClient()
    const item = await loadReviewItem(supabase, reviewId)
    const notes = parsed.data.notes?.trim() || null

    if (parsed.data.action === 'APPROVE') {
      const vendorId = await approveReviewItem(
        supabase,
        item,
        parsed.data.vendor,
        parsed.data.coverages,
        notes,
      )
      return NextResponse.json({ status: 'RESOLVED', vendor_id: vendorId })
    }

    await rejectReviewItem(supabase, item, parsed.data.reason_code, notes)
    return NextResponse.json({ status: 'DISMISSED', reason_code: parsed.data.reason_code })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to resolve review item'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
