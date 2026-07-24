import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeVendorName } from './normalize.ts'
import {
  evaluateCompliance,
  evaluateCoverage,
  GLOBAL_GC_REQUIREMENTS,
  type ComplianceRequirements,
  type PolicyLineSnapshot,
} from './status.ts'

const TODAY = new Date('2026-07-01T12:00:00Z')

function line(overrides: Partial<PolicyLineSnapshot> = {}): PolicyLineSnapshot {
  return {
    coverage_type: 'GL',
    limit_amount: 1_000_000,
    effective_limit_amount: 1_000_000,
    expiration_date: '2027-01-01',
    is_active: true,
    ...overrides,
  }
}

const GL_ONLY: ComplianceRequirements = {
  req_gl_limit: 1_000_000,
  req_umbrella_limit: 0,
  required_coverages: ['GL'],
}

test('compliant when limits are met and expiration is beyond the 30 day window', () => {
  const evaluation = evaluateCoverage([line()], 'GL', GLOBAL_GC_REQUIREMENTS, TODAY)
  assert.equal(evaluation.status, 'COMPLIANT')
})

test('expiring soon inside the 30 day window', () => {
  const evaluation = evaluateCoverage(
    [line({ expiration_date: '2026-07-20' })],
    'GL',
    GLOBAL_GC_REQUIREMENTS,
    TODAY,
  )
  assert.equal(evaluation.status, 'EXPIRING_SOON')
  assert.equal(evaluation.days_until_expiration, 19)
})

test('under limit when the effective limit is below the requirement', () => {
  const evaluation = evaluateCoverage(
    [line({ limit_amount: 500_000, effective_limit_amount: 500_000 })],
    'GL',
    { ...GL_ONLY, req_gl_limit: 1_000_000 },
    TODAY,
  )
  assert.equal(evaluation.status, 'UNDER_LIMIT')
})

test('stacked umbrella limits lift an under-limit GL policy to compliant', () => {
  const evaluation = evaluateCoverage(
    [line({ limit_amount: 1_000_000, effective_limit_amount: 6_000_000 })],
    'GL',
    { ...GL_ONLY, req_gl_limit: 5_000_000 },
    TODAY,
  )
  assert.equal(evaluation.status, 'COMPLIANT')
  assert.equal(evaluation.effective_limit, 6_000_000)
})

test('expired at T+1 past the expiration date', () => {
  const expiredYesterday = evaluateCoverage(
    [line({ expiration_date: '2026-06-30' })],
    'GL',
    GL_ONLY,
    TODAY,
  )
  assert.equal(expiredYesterday.status, 'EXPIRED')

  const expiresToday = evaluateCoverage(
    [line({ expiration_date: '2026-07-01' })],
    'GL',
    GL_ONLY,
    TODAY,
  )
  assert.equal(expiresToday.status, 'EXPIRING_SOON')
})

test('missing document when a required coverage has no active line', () => {
  const evaluation = evaluateCoverage([], 'WORKERS_COMP', GLOBAL_GC_REQUIREMENTS, TODAY)
  assert.equal(evaluation.status, 'MISSING_DOCUMENT')
  assert.equal(evaluation.policy, null)
})

test('archived lines never govern a coverage', () => {
  const evaluation = evaluateCoverage(
    [
      line({ expiration_date: '2028-01-01', is_active: false }),
      line({ expiration_date: '2027-01-01' }),
    ],
    'GL',
    GL_ONLY,
    TODAY,
  )
  assert.equal(evaluation.policy?.expiration_date, '2027-01-01')
})

test('vendor rollup reports the worst status across required coverages', () => {
  const evaluation = evaluateCompliance(
    [line(), line({ coverage_type: 'WORKERS_COMP', expiration_date: '2026-06-01' })],
    GLOBAL_GC_REQUIREMENTS,
    TODAY,
  )
  assert.equal(evaluation.status, 'EXPIRED')
  assert.equal(evaluation.earliest_expiration, '2026-06-01')
})

test('optional coverage without a policy does not penalise the vendor', () => {
  const evaluation = evaluateCompliance([line()], GL_ONLY, TODAY)
  assert.equal(evaluation.status, 'COMPLIANT')
  assert.deepEqual(
    evaluation.coverages.map((coverage) => coverage.coverage_type),
    ['GL'],
  )
})

test('vendor name normalization is stable across punctuation and casing', () => {
  assert.equal(normalizeVendorName('  Apex  Electrical, Inc. '), 'apex electrical inc')
  assert.equal(normalizeVendorName('APEX-ELECTRICAL INC'), 'apex electrical inc')
})
