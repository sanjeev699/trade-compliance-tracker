import { CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ComplianceStatus } from '@/lib/compliance-data'

export const statusConfig: Record<
  ComplianceStatus,
  {
    label: string
    icon: LucideIcon
    badgeClass: string
    iconClass: string
  }
> = {
  active: {
    label: 'Active',
    icon: CircleCheck,
    badgeClass:
      'border-success/25 bg-success/10 text-foreground',
    iconClass: 'text-success',
  },
  expiring: {
    label: 'Expiring Soon',
    icon: Clock,
    badgeClass:
      'border-warning/30 bg-warning/15 text-foreground',
    iconClass: 'text-amber-600 dark:text-amber-500',
  },
  expired: {
    label: 'Action Required',
    icon: TriangleAlert,
    badgeClass:
      'border-destructive/25 bg-destructive/10 text-foreground',
    iconClass: 'text-destructive',
  },
  compliant: {
    label: 'Compliant',
    icon: CircleCheck,
    badgeClass:
      'border-success/25 bg-success/10 text-foreground',
    iconClass: 'text-success',
  },
}
