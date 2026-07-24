import { cn } from '@/lib/utils'
import type { ComplianceStatus } from '@/lib/compliance-data'
import { statusConfig } from '@/lib/status-config'

export function StatusBadge({
  status,
  labelOverride,
  className,
}: {
  status: ComplianceStatus
  labelOverride?: string
  className?: string
}) {
  const { label, icon: Icon, badgeClass, iconClass } = statusConfig[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        badgeClass,
        className,
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', iconClass)} aria-hidden="true" />
      {labelOverride ?? label}
    </span>
  )
}
