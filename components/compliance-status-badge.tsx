import { CircleCheck, Clock, CircleAlert, TriangleAlert, CircleDashed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComplianceStatus } from '@/lib/compliance/status'

// PRD 5.1 status palette.
export const statusPresentation: Record<
  ComplianceStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  COMPLIANT: {
    label: 'Compliant',
    icon: CircleCheck,
    className: 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  },
  EXPIRING_SOON: {
    label: 'Expiring Soon',
    icon: Clock,
    className: 'border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400',
  },
  UNDER_LIMIT: {
    label: 'Under Limit',
    icon: CircleAlert,
    className: 'border-orange-600/30 bg-orange-600/10 text-orange-700 dark:text-orange-400',
  },
  EXPIRED: {
    label: 'Expired',
    icon: TriangleAlert,
    className: 'border-rose-200/80 bg-rose-50 text-rose-700 dark:text-rose-400',
  },
  MISSING_DOCUMENT: {
    label: 'Missing Document',
    icon: CircleDashed,
    className: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  },
  REJECTED: {
    label: 'Rejected',
    icon: CircleAlert,
    className: 'border-rose-200/80 bg-rose-50 text-rose-700 dark:text-rose-400',
  },
  MISSING_DATA: {
    label: 'Incomplete Data',
    icon: TriangleAlert,
    className: 'border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400',
  },
}

export function ComplianceStatusBadge({
  status,
  label,
  className,
}: {
  status: ComplianceStatus
  label?: string
  className?: string
}) {
  const config = statusPresentation[status]
  const { label: defaultLabel, icon: Icon } = config

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label ?? defaultLabel}
    </span>
  )
}
