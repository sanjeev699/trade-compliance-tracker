import type { ComplianceEvaluation } from '@/lib/compliance/status'
import type { VendorRow } from '@/lib/types/vendor'

export interface ProjectRow {
  project_id: string
  project_name: string
  gatekeeper_access_token: string
  req_gl_limit: string | number
  req_umbrella_limit: string | number
  created_at: string
  updated_at: string
}

export interface ProjectLineupRow {
  lineup_id: string
  project_id: string
  vendor_id: string
  override_status: string | null
  created_at: string
  updated_at: string
}

export interface VendorInLineup extends VendorRow {
  lineup_id: string
  override_status: string | null
  compliance?: ComplianceEvaluation
}

export interface ProjectWithLineups extends ProjectRow {
  vendors: VendorInLineup[]
}

export interface ProjectsResponse {
  projects: ProjectRow[]
}

export interface ProjectLineupResponse {
  project: ProjectRow
  vendors: VendorInLineup[]
}
