export type DocumentType =
  | 'General Liability'
  | 'Workers Comp'
  | 'Auto Liability'
  | 'Professional Liability'
  | 'Umbrella Policy'
  | 'Business License'

export type ComplianceStatus = 'active' | 'expiring' | 'expired' | 'compliant'

export interface ComplianceDocument {
  id: string
  subcontractor: string
  documentType: DocumentType
  policyNumber: string
  carrier: string
  coverage: string
  issuedDate: string
  expirationDate: string
}

function startOfToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

export function daysUntil(dateString: string): number {
  const target = new Date(dateString + 'T00:00:00')
  const diff = target.getTime() - startOfToday().getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

export function getStatus(dateString: string): ComplianceStatus {
  const days = daysUntil(dateString)
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'active'
}

export const STATUS_PRIORITY: Record<ComplianceStatus, number> = {
  expired: 0,
  expiring: 1,
  active: 2,
  compliant: 3,
}

export function compareByStatusPriority(
  expirationA: string,
  expirationB: string,
): number {
  const statusA = getStatus(expirationA)
  const statusB = getStatus(expirationB)
  const priorityDiff = STATUS_PRIORITY[statusA] - STATUS_PRIORITY[statusB]
  if (priorityDiff !== 0) return priorityDiff
  return daysUntil(expirationA) - daysUntil(expirationB)
}

export function summarizeByStatus(expirationDates: string[]) {
  let active = 0
  let expiring = 0
  let expired = 0

  for (const date of expirationDates) {
    const status = getStatus(date)
    if (status === 'active') active++
    else if (status === 'expiring') expiring++
    else expired++
  }

  return { active, expiring, expired, total: expirationDates.length }
}

export function formatDate(dateString: string): string {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const documents: ComplianceDocument[] = [
  {
    id: 'DOC-1042',
    subcontractor: 'Apex Electrical Services',
    documentType: 'General Liability',
    policyNumber: 'GL-88213-A',
    carrier: 'Travelers',
    coverage: '$2,000,000',
    issuedDate: '2025-09-15',
    expirationDate: '2026-09-15',
  },
  {
    id: 'DOC-1043',
    subcontractor: 'Apex Electrical Services',
    documentType: 'Workers Comp',
    policyNumber: 'WC-40129-B',
    carrier: 'The Hartford',
    coverage: '$1,000,000',
    issuedDate: '2025-08-01',
    expirationDate: '2026-08-01',
  },
  {
    id: 'DOC-1044',
    subcontractor: 'Summit Mechanical Co.',
    documentType: 'General Liability',
    policyNumber: 'GL-55810-C',
    carrier: 'Liberty Mutual',
    coverage: '$2,000,000',
    issuedDate: '2025-07-30',
    expirationDate: '2026-08-10',
  },
  {
    id: 'DOC-1045',
    subcontractor: 'Summit Mechanical Co.',
    documentType: 'Auto Liability',
    policyNumber: 'AL-31228-D',
    carrier: 'Progressive Commercial',
    coverage: '$1,000,000',
    issuedDate: '2025-06-12',
    expirationDate: '2026-07-28',
  },
  {
    id: 'DOC-1046',
    subcontractor: 'Ironclad Steel Erectors',
    documentType: 'Workers Comp',
    policyNumber: 'WC-77410-E',
    carrier: 'AmTrust',
    coverage: '$1,000,000',
    issuedDate: '2025-05-20',
    expirationDate: '2026-05-20',
  },
  {
    id: 'DOC-1047',
    subcontractor: 'Ironclad Steel Erectors',
    documentType: 'Umbrella Policy',
    policyNumber: 'UMB-90021-F',
    carrier: 'Chubb',
    coverage: '$5,000,000',
    issuedDate: '2025-06-30',
    expirationDate: '2026-08-05',
  },
  {
    id: 'DOC-1048',
    subcontractor: 'Cascade Plumbing LLC',
    documentType: 'General Liability',
    policyNumber: 'GL-12094-G',
    carrier: 'Nationwide',
    coverage: '$1,000,000',
    issuedDate: '2024-07-01',
    expirationDate: '2026-07-01',
  },
  {
    id: 'DOC-1049',
    subcontractor: 'Cascade Plumbing LLC',
    documentType: 'Business License',
    policyNumber: 'BL-2026-4471',
    carrier: 'State of Washington',
    coverage: 'N/A',
    issuedDate: '2025-01-15',
    expirationDate: '2026-12-31',
  },
  {
    id: 'DOC-1050',
    subcontractor: 'Pinnacle Roofing Group',
    documentType: 'Workers Comp',
    policyNumber: 'WC-63317-H',
    carrier: 'Zurich',
    coverage: '$1,000,000',
    issuedDate: '2024-06-18',
    expirationDate: '2026-06-18',
  },
  {
    id: 'DOC-1051',
    subcontractor: 'Pinnacle Roofing Group',
    documentType: 'General Liability',
    policyNumber: 'GL-63318-I',
    carrier: 'CNA',
    coverage: '$2,000,000',
    issuedDate: '2025-08-22',
    expirationDate: '2026-08-22',
  },
  {
    id: 'DOC-1052',
    subcontractor: 'Verde Landscaping Inc.',
    documentType: 'Auto Liability',
    policyNumber: 'AL-44120-J',
    carrier: 'Geico Commercial',
    coverage: '$1,000,000',
    issuedDate: '2025-10-01',
    expirationDate: '2026-10-01',
  },
  {
    id: 'DOC-1053',
    subcontractor: 'Verde Landscaping Inc.',
    documentType: 'Professional Liability',
    policyNumber: 'PL-22087-K',
    carrier: 'Hiscox',
    coverage: '$1,000,000',
    issuedDate: '2024-07-10',
    expirationDate: '2026-07-10',
  },
  {
    id: 'DOC-1054',
    subcontractor: 'Boreal HVAC Systems',
    documentType: 'General Liability',
    policyNumber: 'GL-98120-L',
    carrier: 'Travelers',
    coverage: '$2,000,000',
    issuedDate: '2025-09-05',
    expirationDate: '2026-09-05',
  },
  {
    id: 'DOC-1055',
    subcontractor: 'Boreal HVAC Systems',
    documentType: 'Workers Comp',
    policyNumber: 'WC-98121-M',
    carrier: 'The Hartford',
    coverage: '$1,000,000',
    issuedDate: '2024-06-25',
    expirationDate: '2026-06-25',
  },
  {
    id: 'DOC-1056',
    subcontractor: 'Granite Concrete Partners',
    documentType: 'Umbrella Policy',
    policyNumber: 'UMB-11223-N',
    carrier: 'Chubb',
    coverage: '$10,000,000',
    issuedDate: '2025-08-14',
    expirationDate: '2026-08-14',
  },
  {
    id: 'DOC-1057',
    subcontractor: 'Granite Concrete Partners',
    documentType: 'General Liability',
    policyNumber: 'GL-11224-O',
    carrier: 'Liberty Mutual',
    coverage: '$2,000,000',
    issuedDate: '2024-07-19',
    expirationDate: '2026-07-19',
  },
]

export const documentTypes: DocumentType[] = [
  'General Liability',
  'Workers Comp',
  'Auto Liability',
  'Professional Liability',
  'Umbrella Policy',
  'Business License',
]

export function getSummary() {
  let active = 0
  let expiring = 0
  let expired = 0
  for (const doc of documents) {
    const status = getStatus(doc.expirationDate)
    if (status === 'active') active++
    else if (status === 'expiring') expiring++
    else expired++
  }
  return { active, expiring, expired, total: documents.length }
}
