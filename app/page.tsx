'use client'

import { useRef, useState } from 'react'
import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { UploadDropzone } from '@/components/upload-dropzone'
import { SummaryCards } from '@/components/summary-cards'
import { DocumentsTable } from '@/components/documents-table'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Compliance Overview',
    subtitle:
      'Monitor subcontractor documents and stay ahead of expirations.',
  },
  subcontractors: {
    title: 'Subcontractors',
    subtitle: 'Manage your network of subcontractors and their documents.',
  },
  alerts: {
    title: 'Expiration Alerts',
    subtitle: 'Documents that need renewal or immediate attention.',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Configure notifications, users, and workspace preferences.',
  },
}

export default function Page() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [tableRefreshKey, setTableRefreshKey] = useState(0)
  const uploadRef = useRef<HTMLDivElement>(null)

  const scrollToUpload = () => {
    setActiveNav('dashboard')
    requestAnimationFrame(() => {
      uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const { title, subtitle } = pageTitles[activeNav] ?? pageTitles.dashboard

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      {/* Sidebar - hides/drawers automatically on mobile if handled internally */}
      <DashboardSidebar active={activeNav} onNavigate={setActiveNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader onUpload={scrollToUpload} />

        {/* Dynamic padding: Compact on mobile (px-4 py-5), spacious on desktop (md:px-8 md:py-8) */}
        <main className="flex-1 px-4 py-5 md:px-8 md:py-8">
          {/* Main Container: Stretches up to 1600px without blank margins */}
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 md:gap-8">
            
            {/* Header section with responsive fluid typography */}
            <div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground text-balance">
                {title}
              </h2>
              <p className="mt-1 sm:mt-2 text-sm sm:text-base lg:text-lg text-muted-foreground">
                {subtitle}
              </p>
            </div>

            {/* Upload Area */}
            <div ref={uploadRef}>
              <UploadDropzone
                onUploadComplete={() =>
                  setTableRefreshKey((key) => key + 1)
                }
              />
            </div>

            {/* Summary KPI Cards */}
            <SummaryCards refreshKey={tableRefreshKey} />

            {/* Main Documents Table */}
            <DocumentsTable refreshKey={tableRefreshKey} />
          </div>
        </main>
      </div>
    </div>
  )
}