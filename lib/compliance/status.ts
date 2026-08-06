// PRD 4.1.3: the single evaluator behind every compliance surface (Tab 1 master
// directory, Tab 3 project matrix, and the mobile gatekeeper).

export type CoverageType = 'GL' | 'AUTO' | 'WORKERS_COMP' | 'UMBRELLA'

export const COVERAGE_TYPES: CoverageType[] = ['GL', 'AUTO', 'WORKERS_COMP', 'UMBRELLA']

export const COVERAGE_LABELS: Record<CoverageType, string> = {
  GL: 'General Liability',
  AUTO: 'Auto Liability',
  WORKERS_COMP: "Workers' Compensation",
  UMBRELLA: 'Umbrella / Excess',
}

export type ComplianceStatus =
  | 'COMPLIANT'
  | 'EXPIRING_SOON'
  | 'UNDER_LIMIT'
  | 'EXPIRED'
  | 'MISSING_DOCUMENT'
  | 'REJECTED'
  | 'MISSING_DATA'

export const EXPIRING_SOON_WINDOW_DAYS = 30

// Worst status wins when a vendor's coverages are rolled up into one badge.
const SEVERITY: Record<ComplianceStatus, number> = {
  REJECTED: 0,
  EXPIRED: 1,
  MISSING_DOCUMENT: 2,
  MISSING_DATA: 3,
  UNDER_LIMIT: 4,
  EXPIRING_SOON: 5,
  COMPLIANT: 6,
}

export interface PolicyLineSnapshot {
  id?: string
  document_id?: string
  status?: 'APPROVED' | 'EXPIRED' | 'REJECTED' | 'MISSING_DATA' | null
  coverage_type: CoverageType
  policy_number?: string
  naic_code?: string
  limit_amount: number | string
  effective_limit_amount: number | string
  effective_date?: string
  expiration_date: string
  is_active?: boolean
}

export interface ComplianceRequirements {
  req_gl_limit: number
  req_umbrella_limit: number
  required_coverages: CoverageType[]
}

// Global GC baseline used until a project override (PRD 4.1.3) is supplied.
export const GLOBAL_GC_REQUIREMENTS: ComplianceRequirements = {
  req_gl_limit: 1_000_000,
  req_umbrella_limit: 0,
  required_coverages: ['GL', 'WORKERS_COMP'],
}

export interface CoverageEvaluation {
  coverage_type: CoverageType
  status: ComplianceStatus
  policy: PolicyLineSnapshot | null
  required_limit: number
  effective_limit: number
  days_until_expiration: number | null
}

export interface ComplianceEvaluation {
  status: ComplianceStatus
  coverages: CoverageEvaluation[]
  earliest_expiration: string | null
}

export type VendorGlobalStatus = 'CLEAR' | 'REVIEW_NEEDED' | 'ON_HOLD'

export function evaluateVendorGlobalStatus(
  insuranceStatus: ComplianceStatus,
  w9Status: 'PENDING' | 'VERIFIED' | 'REJECTED' = 'PENDING',
  msaStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' = 'PENDING',
  emrScore: number | null = null
): VendorGlobalStatus {
  // Any critical failure puts them On Hold
  if (
    insuranceStatus === 'EXPIRED' ||
    insuranceStatus === 'MISSING_DOCUMENT' ||
    insuranceStatus === 'UNDER_LIMIT' ||
    w9Status === 'REJECTED' ||
    w9Status === 'PENDING' ||
    msaStatus === 'REJECTED' ||
    msaStatus === 'PENDING' ||
    (emrScore !== null && emrScore > 1.15)
  ) {
    return 'ON_HOLD'
  }

  // Any warning puts them in Review Needed
  if (
    insuranceStatus === 'EXPIRING_SOON' ||
    (emrScore !== null && emrScore > 1.0)
  ) {
    return 'REVIEW_NEEDED'
  }

  return 'CLEAR'
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function daysUntil(dateString: string, today: Date = new Date()): number {
  const target = startOfDay(new Date(`${dateString}T00:00:00`))
  const diff = target.getTime() - startOfDay(today).getTime()
  return Math.round(diff / 86_400_000)
}

export function requiredLimitFor(
  coverage: CoverageType,
  requirements: ComplianceRequirements,
): number {
  if (coverage === 'GL') return requirements.req_gl_limit
  if (coverage === 'UMBRELLA') return requirements.req_umbrella_limit
  return 0
}

// The newest expiration is the line that actually governs a coverage, so an
// archived or superseded line never drags a compliant vendor down.
function governingLine(
  lines: PolicyLineSnapshot[],
  coverage: CoverageType,
): PolicyLineSnapshot | null {
  const candidates = lines.filter(
    (line) => line.coverage_type === coverage && line.is_active !== false
  )
  if (candidates.length === 0) return null
  return candidates.reduce((latest, line) =>
    line.expiration_date > latest.expiration_date ? line : latest,
  )
}

export function evaluateCoverage(
  lines: PolicyLineSnapshot[],
  coverage: CoverageType,
  requirements: ComplianceRequirements = GLOBAL_GC_REQUIREMENTS,
  today: Date = new Date(),
): CoverageEvaluation {
  const requiredLimit = requiredLimitFor(coverage, requirements)
  const policy = governingLine(lines, coverage)

  if (!policy) {
    return {
      coverage_type: coverage,
      status: 'MISSING_DOCUMENT',
      policy: null,
      required_limit: requiredLimit,
      effective_limit: 0,
      days_until_expiration: null,
    }
  }

  // effective_limit_amount already carries stacked Excess/Umbrella layers
  // (PRD 3.2 "Stacked Limits"), maintained by the policy_lines trigger.
  const effectiveLimit = Number(policy.effective_limit_amount)
  const remainingDays = daysUntil(policy.expiration_date, today)

  // Hard expiration enforcement at T+1 (PRD 4.1.4).
  let status: ComplianceStatus = 'COMPLIANT'
  if (policy.status === 'REJECTED') status = 'REJECTED'
  else if (policy.status === 'MISSING_DATA') status = 'MISSING_DATA'
  else if (policy.status === 'EXPIRED' || remainingDays < 0) status = 'EXPIRED'
  else if (effectiveLimit < requiredLimit) status = 'UNDER_LIMIT'
  else if (remainingDays < EXPIRING_SOON_WINDOW_DAYS) status = 'EXPIRING_SOON'

  return {
    coverage_type: coverage,
    status,
    policy,
    required_limit: requiredLimit,
    effective_limit: effectiveLimit,
    days_until_expiration: remainingDays,
  }
}

export function evaluateCompliance(
  lines: PolicyLineSnapshot[],
  requirements: ComplianceRequirements = GLOBAL_GC_REQUIREMENTS,
  today: Date = new Date(),
  hasCoiDoc: boolean = true,
): ComplianceEvaluation {
  const evaluated = COVERAGE_TYPES.filter(
    (coverage) =>
      requirements.required_coverages.includes(coverage) ||
      lines.some((line) => line.coverage_type === coverage && line.is_active !== false),
  ).map((coverage) => evaluateCoverage(lines, coverage, requirements, today))

  const scored = evaluated.filter(
    (evaluation) =>
      requirements.required_coverages.includes(evaluation.coverage_type) ||
      evaluation.status !== 'MISSING_DOCUMENT',
  )

  const status = scored.reduce<ComplianceStatus>(
    (worst, evaluation) =>
      SEVERITY[evaluation.status] < SEVERITY[worst] ? evaluation.status : worst,
    'COMPLIANT',
  )

  const expirations = evaluated
    .map((evaluation) => evaluation.policy?.expiration_date)
    .filter((value): value is string => Boolean(value))
    .sort()

  const finalStatus = hasCoiDoc ? status : 'MISSING_DOCUMENT'

  return { status: finalStatus, coverages: evaluated, earliest_expiration: expirations[0] ?? null }
}

export function compareBySeverity(a: ComplianceStatus, b: ComplianceStatus): number {
  return SEVERITY[a] - SEVERITY[b]
}
