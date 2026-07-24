import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeVendorName } from '@/lib/compliance/normalize'
import { evaluateCompliance } from '@/lib/compliance/status'
import type { VendorRow, VendorWithCompliance } from '@/lib/types/vendor'

const VENDOR_SELECT = `
  vendor_id, company_name, normalized_name, tax_id_ein, primary_email,
  trade_specialty, address_street, address_zip, emr_score, emr_verified,
  osha_file_url, created_at, updated_at,
  policy_lines (
    policy_id, coverage_type, policy_number, naic_code, limit_amount,
    effective_limit_amount, effective_date, expiration_date, is_active
  )
`

const emrScore = z.number().min(0).max(9.99).nullable()

const CreateVendorSchema = z.object({
  company_name: z.string().trim().min(1),
  primary_email: z.string().trim().email(),
  trade_specialty: z.string().trim().min(1).default('Unclassified'),
  tax_id_ein: z.string().trim().min(1).nullable().optional(),
  address_street: z.string().trim().min(1).nullable().optional(),
  address_zip: z.string().trim().min(1).nullable().optional(),
  emr_score: emrScore.optional(),
  emr_verified: z.boolean().optional(),
  osha_file_url: z.string().trim().url().nullable().optional(),
})

const UpdateVendorSchema = CreateVendorSchema.partial().extend({
  vendor_id: z.string().uuid(),
})

function withCompliance(vendor: VendorRow): VendorWithCompliance {
  const activeLines = (vendor.policy_lines ?? []).filter((line) => line.is_active)
  return {
    ...vendor,
    policy_lines: activeLines,
    compliance: evaluateCompliance(activeLines),
  }
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('vendors')
      .select(VENDOR_SELECT)
      .order('company_name', { ascending: true })

    if (error) throw new Error(error.message)

    const vendors = ((data ?? []) as unknown as VendorRow[]).map(withCompliance)
    const trades = Array.from(
      new Set(vendors.map((vendor) => vendor.trade_specialty).filter(Boolean)),
    ).sort()

    return NextResponse.json({ vendors, trades })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load vendors'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const parsed = CreateVendorSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid vendor payload', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        ...parsed.data,
        normalized_name: normalizeVendorName(parsed.data.company_name),
      })
      .select(VENDOR_SELECT)
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json(
      { vendor: withCompliance(data as unknown as VendorRow) },
      { status: 201 },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create vendor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const parsed = UpdateVendorSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid vendor payload', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const { vendor_id: vendorId, ...patch } = parsed.data
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('vendors')
      .update(
        patch.company_name
          ? { ...patch, normalized_name: normalizeVendorName(patch.company_name) }
          : patch,
      )
      .eq('vendor_id', vendorId)
      .select(VENDOR_SELECT)
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ vendor: withCompliance(data as unknown as VendorRow) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update vendor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
