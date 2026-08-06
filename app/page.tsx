'use client'

import { useRef, useState } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import { UploadDropzone } from '@/components/upload-dropzone'
import { ReviewQueue } from '@/components/review-queue'
import { VendorsDirectory } from '@/components/vendors-directory'
import { WorkspaceTabs, type WorkspaceTab } from '@/components/workspace-tabs'
import { ProjectsWorkspace } from '@/components/projects-workspace'
import { AuditLogWorkspace } from '@/components/audit-log-workspace'
import { SubcontractorOnboardingStudio } from '@/components/subcontractor-onboarding-studio'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const tabCopy: Record<WorkspaceTab, { title: string; subtitle: string }> = {
  vendors: {
    title: 'Subcontractor Directory',
    subtitle:
      'Every onboarded subcontractor, their active policy lines, and their live compliance status.',
  },
  review: {
    title: 'Review Queue',
    subtitle:
      'Low-confidence matches, carrier switches, and policy conflicts awaiting Risk Manager clearance.',
  },
  projects: {
    title: 'Projects',
    subtitle:
      'Project lineups, project-specific insurance requirements, and jobsite gatekeeper access.',
  },
  audit: {
    title: 'Centralized Audit Log',
    subtitle: 'Immutable system ledger of all compliance overrides and verification actions.',
  },
  studio: {
    title: 'Subcontractor Onboarding Studio',
    subtitle: 'Centralized portal to generate onboarding links and invite subcontractors.',
  },
}

function PlaceholderPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="border border-dashed border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-lg font-semibold tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('vendors')
  const [refreshKey, setRefreshKey] = useState(0)


  const { title, subtitle } = tabCopy[activeTab]

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased">
      <DashboardHeader />

      <main className="flex-1 px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 md:gap-8">
          <WorkspaceTabs active={activeTab} onChange={setActiveTab} />

          <div>
            <h2 className="text-xl font-bold tracking-tight text-balance text-foreground sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground sm:mt-2">
              {subtitle}
            </p>
          </div>

          {activeTab === 'vendors' ? (
            <>
              <VendorsDirectory refreshKey={refreshKey} onNavigateStudio={() => setActiveTab('studio')} />
            </>
          ) : null}

          {activeTab === 'review' ? (
            <ReviewQueue
              refreshKey={refreshKey}
              onResolved={() => setRefreshKey((key) => key + 1)}
            />
          ) : null}

          {activeTab === 'projects' ? (
            <ProjectsWorkspace />
          ) : null}

          {activeTab === 'audit' ? (
            <AuditLogWorkspace />
          ) : null}

          {activeTab === 'studio' ? (
            <SubcontractorOnboardingStudio />
          ) : null}
        </div>
      </main>
    </div>
  )
}
