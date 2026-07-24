'use client'

import { FolderKanban, Inbox, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WorkspaceTab = 'vendors' | 'review' | 'projects'

export const workspaceTabs: {
  key: WorkspaceTab
  label: string
  icon: LucideIcon
}[] = [
  { key: 'vendors', label: 'Master Vendors', icon: Users },
  { key: 'review', label: 'Review Queue', icon: Inbox },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
]

export function WorkspaceTabs({
  active,
  onChange,
}: {
  active: WorkspaceTab
  onChange: (tab: WorkspaceTab) => void
}) {
  return (
    <nav
      role="tablist"
      aria-label="Workspace"
      className="flex gap-1 overflow-x-auto border-b border-border"
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
          </button>
        )
      })}
    </nav>
  )
}
