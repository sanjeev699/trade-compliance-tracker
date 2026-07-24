'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { summarizeByStatus } from '@/lib/compliance-data'
import { statusConfig } from '@/lib/status-config'
import { StatusBadge } from '@/components/status-badge'

interface StatCard {
  status: 'active' | 'expiring' | 'expired'
  label: string
  helper: string
  icon: LucideIcon
}

interface SummaryCardsProps {
  refreshKey?: number
}

const cardMeta: StatCard[] = [
  {
    status: 'active',
    label: 'Active Compliance Docs',
    helper: 'Valid and up to date',
    icon: CircleCheck,
  },
  {
    status: 'expiring',
    label: 'Expiring in 30 Days',
    helper: 'Renewal recommended',
    icon: Clock,
  },
  {
    status: 'expired',
    label: 'Expired / Action Required',
    helper: 'Immediate attention needed',
    icon: TriangleAlert,
  },
]

export function SummaryCards({ refreshKey = 0 }: SummaryCardsProps) {
  const [metrics, setMetrics] = useState({
    active: 0,
    expiring: 0,
    expired: 0,
  })
  const [loading, setLoading] = useState(true)

  const fetchMetrics = useCallback(async () => {
    setLoading(true)

    const response = await fetch('/api/documents')
    const data = await response.json().catch(() => null)

    if (!response.ok || !Array.isArray(data)) {
      setMetrics({ active: 0, expiring: 0, expired: 0 })
    } else {
      const summary = summarizeByStatus(
        data.map((row) => row.expiration_date),
      )
      setMetrics({
        active: summary.active,
        expiring: summary.expiring,
        expired: summary.expired,
      })
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchMetrics()
  }, [fetchMetrics, refreshKey])

  const values = useMemo(
    () => ({
      active: metrics.active,
      expiring: metrics.expiring,
      expired: metrics.expired,
    }),
    [metrics],
  )

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cardMeta.map((card) => {
        const config = statusConfig[card.status]
        const Icon = card.icon

        return (
          <Card key={card.label} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg',
                  config.badgeClass,
                )}
              >
                <Icon
                  className={cn('size-5', config.iconClass)}
                  aria-hidden="true"
                />
              </span>
              <StatusBadge status={card.status} />
            </div>
            <div className="mt-4">
              <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                {loading ? '—' : values[card.status]}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {card.label}
              </p>
              <p className="text-xs text-muted-foreground">{card.helper}</p>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
