export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ProjectRow } from '@/lib/types/project'

export async function GET() {
  const supabase = createSupabaseServerClient()

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ projects })
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient()

  try {
    const body = await request.json()
    const { project_name, req_gl_limit, req_umbrella_limit } = body

    if (!project_name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        project_name,
        req_gl_limit: req_gl_limit ? Number(req_gl_limit) : 1000000.00,
        req_umbrella_limit: req_umbrella_limit ? Number(req_umbrella_limit) : 0.00,
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ project }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
