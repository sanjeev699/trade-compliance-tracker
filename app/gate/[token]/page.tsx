import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { evaluateCompliance, GLOBAL_GC_REQUIREMENTS } from '@/lib/compliance/status'
import type { VendorRow } from '@/lib/types/vendor'

export const dynamic = 'force-dynamic'

export default async function GatekeeperPage({
  params,
}: {
  params: { token: string }
}) {
  const supabase = createSupabaseServerClient()
  const token = params.token

  // 1. Fetch the project by token
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('gatekeeper_access_token', token)
    .single()

  if (projectError || !project) {
    return notFound()
  }

  // 2. Fetch the lineup
  const { data: lineups, error: lineupError } = await supabase
    .from('project_lineups')
    .select(`
      lineup_id,
      vendors (*)
    `)
    .eq('project_id', project.project_id)

  if (lineupError) {
    return (
      <div className="p-8 text-center text-red-500">
        Error loading site lineup.
      </div>
    )
  }

  const requirements = {
    ...GLOBAL_GC_REQUIREMENTS,
    req_gl_limit: Number(project.req_gl_limit),
    req_umbrella_limit: Number(project.req_umbrella_limit),
  }

  // 3. Evaluate compliance for each vendor
  const vendors = await Promise.all(
    (lineups || []).map(async (lineup: any) => {
      const vendor: VendorRow = lineup.vendors

      const { data: policyLines } = await supabase
        .from('policy_lines')
        .select('*')
        .eq('vendor_id', vendor.vendor_id)
        .eq('is_active', true)

      const compliance = evaluateCompliance(policyLines || [], requirements)
      return { ...vendor, compliance }
    })
  )

  // Sort vendors: COMPLIANT at bottom, non-compliant at top (for easier visibility of issues)
  const sortedVendors = vendors.sort((a, b) => {
    if (a.compliance.status === 'COMPLIANT' && b.compliance.status !== 'COMPLIANT') return 1
    if (a.compliance.status !== 'COMPLIANT' && b.compliance.status === 'COMPLIANT') return -1
    return a.company_name.localeCompare(b.company_name)
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-12">
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold tracking-tight">{project.project_name}</h1>
        <p className="text-sm text-slate-400">Jobsite Gatekeeper Access</p>
      </header>

      <main className="p-4 space-y-4">
        {sortedVendors.length === 0 ? (
          <div className="text-center p-8 text-slate-400">
            No subcontractors assigned to this site yet.
          </div>
        ) : (
          sortedVendors.map((vendor) => {
            const isCompliant = vendor.compliance.status === 'COMPLIANT'
            const statusColor = isCompliant
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
              : 'bg-red-500/10 border-red-500/20 text-red-500'

            const statusBg = isCompliant ? 'bg-emerald-500' : 'bg-red-500'
            const message = isCompliant ? 'ENTER SITE' : 'DENY ENTRY'

            return (
              <div
                key={vendor.vendor_id}
                className={`rounded-xl border p-5 flex flex-col gap-4 ${statusColor}`}
              >
                <div>
                  <h2 className="text-xl font-bold text-white">{vendor.company_name}</h2>
                  <p className="text-sm opacity-80">{vendor.trade_specialty}</p>
                </div>

                <div
                  className={`py-3 rounded-lg text-center font-bold text-xl tracking-widest text-white ${statusBg} shadow-lg`}
                >
                  {message}
                </div>

                {!isCompliant && (
                  <div className="text-sm opacity-90 font-medium">
                    Reason: {vendor.compliance.status.replace('_', ' ')}
                  </div>
                )}
                
                <a
                  href={`mailto:${vendor.primary_email}`}
                  className="mt-2 block w-full text-center py-2.5 rounded-lg border border-current opacity-80 font-medium hover:opacity-100 transition-opacity"
                >
                  Contact Subcontractor
                </a>
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}
