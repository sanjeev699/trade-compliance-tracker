'use client'

import { useEffect, useState, useCallback } from 'react'

import { FolderKanban, Inbox, Users, ScrollText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WorkspaceTab = 'vendors' | 'review' | 'projects' | 'audit' | 'studio'

export const workspaceTabs: {
  key: WorkspaceTab
  label: string
  icon: LucideIcon
}[] = [
  { key: 'vendors', label: 'Subcontractors', icon: Users },
  { key: 'review', label: 'Review Queue', icon: Inbox },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
  { key: 'studio', label: 'Onboarding', icon: Users },
]

export function WorkspaceTabs({
  active,
  onChange,
}: {
  active: WorkspaceTab
  onChange: (tab: WorkspaceTab) => void
}) {
  const [reviewCount, setReviewCount] = useState<number>(0)

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/review-queue/count')
      if (res.ok) {
        const data = await res.json()
        setReviewCount(data.count || 0)
      }
    } catch (e) {}
  }, [])

  useEffect(() => {
    fetchCount()
    // Set up an interval or a custom event to refetch when needed
    const interval = setInterval(fetchCount, 15000)
    window.addEventListener('review-queue-updated', fetchCount)
    return () => {
      clearInterval(interval)
      window.removeEventListener('review-queue-updated', fetchCount)
    }
  }, [fetchCount])

  return (
    <nav
      role="tablist"
      aria-label="Workspace"
      className="flex gap-1 overflow-x-auto border-b border-border scrollbar-none [ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {workspaceTabs.map((tab) => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="size-4 shrink-0" aria-hidden="true" />
            {tab.label}
            {tab.key === 'review' && reviewCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                {reviewCount}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
