'use client'

import { Upload, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DashboardHeader({ onUpload }: { onUpload: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground md:hidden">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">Workspace</p>
          <h1 className="text-sm font-semibold leading-none text-foreground md:text-base">
            Meridian Construction Group
          </h1>
        </div>
      </div>

      <Button onClick={onUpload} className="gap-2">
        <Upload className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Upload Document</span>
        <span className="sm:hidden">Upload</span>
      </Button>
    </header>
  )
}
