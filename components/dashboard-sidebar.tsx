'use client'

import {
  LayoutDashboard,
  Users,
  BellRing,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { label: 'Subcontractors', icon: Users, key: 'subcontractors' },
  { label: 'Expiration Alerts', icon: BellRing, key: 'alerts', badge: 3 },
  { label: 'Settings', icon: Settings, key: 'settings' },
] as const

export function DashboardSidebar({
  active,
  onNavigate,
}: {
  active: string
  onNavigate: (key: string) => void
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-6">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
          Sentinel
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4" aria-label="Main">
        {navItems.map((item) => {
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">{item.label}</span>
              {'badge' in item && item.badge ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[11px] font-semibold text-destructive-foreground">
                  {item.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            RM
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              Rosa Martinez
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Compliance Manager
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
