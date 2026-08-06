export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { evaluateCompliance, GLOBAL_GC_REQUIREMENTS } from '@/lib/compliance/status'
import type { ProjectRow, VendorInLineup } from '@/lib/types/project'
import type { VendorRow } from '@/lib/types/vendor'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createSupabaseServerClient()
  const { id: projectId } = await params

  // 1. Fetch the project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('project_id', projectId)
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // 2. Fetch the lineup and join with vendors
  const { data: lineups, error: lineupError } = await supabase
    .from('project_lineups')
    .select(`
      lineup_id,
      override_status,
      vendors (*)
    `)
    .eq('project_id', projectId)

  if (lineupError) {
    return NextResponse.json({ error: lineupError.message }, { status: 500 })
  }

  const requirements = {
    ...GLOBAL_GC_REQUIREMENTS,
    req_gl_limit: Number(project.req_gl_limit),
    req_umbrella_limit: Number(project.req_umbrella_limit),
  }

  // 3. For each vendor, fetch active policy lines and evaluate compliance
  const vendorsInLineup: VendorInLineup[] = await Promise.all(
    (lineups || []).map(async (lineup: any) => {
      const vendor: VendorRow = lineup.vendors

      const { data: policyLines } = await supabase
        .from('policy_lines')
        .select('*')
        .eq('vendor_id', vendor.vendor_id)
        .eq('is_active', true)

      const compliance = evaluateCompliance(policyLines || [], requirements)

      return {
        ...vendor,
        lineup_id: lineup.lineup_id,
        override_status: lineup.override_status,
        compliance,
      }
    })
  )

  return NextResponse.json({
    project,
    vendors: vendorsInLineup,
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createSupabaseServerClient()
  const { id: projectId } = await params

  try {
    const body = await request.json()
    const { vendor_id } = body

    if (!vendor_id) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('project_lineups')
      .insert({
        project_id: projectId,
        vendor_id,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Vendor is already in the lineup' }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ lineup: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createSupabaseServerClient()
  const { id: projectId } = await params

  try {
    const body = await request.json()
    const { vendor_id } = body

    if (!vendor_id) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('project_lineups')
      .delete()
      .eq('project_id', projectId)
      .eq('vendor_id', vendor_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
