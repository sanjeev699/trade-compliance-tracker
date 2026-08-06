'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, MoreHorizontal, Plus, Search, Mail, Filter, ShieldCheck, Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { statusPresentation } from '@/components/compliance-status-badge'
import { formatCurrency, formatDate, formatEmrScore } from '@/lib/format'
import {
  compareBySeverity,
  type ComplianceStatus,
  type CoverageType,
} from '@/lib/compliance/status'
import type { VendorPatch, VendorWithCompliance, VendorsResponse } from '@/lib/types/vendor'
import { VendorInspectDrawer } from '@/components/vendor-inspect-drawer'
import { NewSubcontractorInviteModal } from '@/components/new-subcontractor-invite-modal'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const statusFilters: { label: string; value: ComplianceStatus | 'all' }[] = [
  { label: 'All statuses', value: 'all' },
  ...(Object.keys(statusPresentation) as ComplianceStatus[]).map((status) => ({
    label: statusPresentation[status].label,
    value: status,
  })),
]

interface VendorFormState {
  company_name: string
  primary_email: string
  trade_specialty: string
  tax_id_ein: string
  address_street: string
  address_zip: string
  emr_score: string
  emr_verified: boolean
  osha_file_url: string
}

function toFormState(vendor: VendorWithCompliance): VendorFormState {
  return {
    company_name: vendor.company_name,
    primary_email: vendor.primary_email,
    trade_specialty: vendor.trade_specialty,
    tax_id_ein: vendor.tax_id_ein ?? '',
    address_street: vendor.address_street ?? '',
    address_zip: vendor.address_zip ?? '',
    emr_score: vendor.emr_score === null ? '' : String(vendor.emr_score),
    emr_verified: vendor.emr_verified ?? false,
    osha_file_url: vendor.osha_file_url ?? '',
  }
}

const emptyFormState: VendorFormState = {
  company_name: '',
  primary_email: '',
  trade_specialty: 'Unclassified',
  tax_id_ein: '',
  address_street: '',
  address_zip: '',
  emr_score: '',
  emr_verified: false,
  osha_file_url: '',
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function AccountStatusBadge({ vendor }: { vendor: VendorWithCompliance }) {
  const isArchived = (vendor.onboarding_status || '').toUpperCase() === 'ARCHIVED'
  const isInvited = (vendor.onboarding_status || '').toUpperCase() === 'INVITED'
  
  if (isArchived) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
        Inactive
      </span>
    )
  }
  
  if (isInvited) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
        Invite Sent
      </span>
    )
  }

  const isCompliant = vendor.compliance.status === 'COMPLIANT' || vendor.compliance.status === 'EXPIRING_SOON'

  if (!isCompliant) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        Review Required
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
      Active
    </span>
  )
}

export function GlobalStatusBadge({ vendor }: { vendor: any }) {
  const hasPolicies = Array.isArray(vendor?.policy_lines) && vendor.policy_lines.length > 0;
  const hasDocuments = Array.isArray(vendor?.documents) && vendor.documents.length > 0;
  const hasPendingReview = Array.isArray(vendor?.review_queue_items) && 
    vendor.review_queue_items.some((item: any) => item.status === 'PENDING' || item.status === 'IN_REVIEW');
  const hasFailedDoc = hasDocuments && 
    vendor.documents.some((doc: any) => doc.extraction_status === 'REVIEW_REQUIRED' || doc.extraction_status === 'FAILED');

  // A. If documents/policies exist or extraction requires review, prioritize Validation Flag
  if (hasPendingReview || hasFailedDoc || (hasPolicies && vendor?.onboarding_status === 'INVITED')) {
    return (
      <span className="inline-flex items-center border rounded-full px-2.5 py-0.5 text-xs bg-amber-50 text-amber-800 border-amber-300 font-medium">
        ⚠️ In Review (Validation Flag)
      </span>
    );
  }

  // B. Check Onboarding / Invited Status ONLY if no documents/policies exist yet
  const onboardingStatus = (vendor?.onboarding_status || '').toUpperCase();
  if (onboardingStatus === 'INVITED' || onboardingStatus === 'INVITE_SENT' || onboardingStatus === 'PENDING') {
    return <Badge className="bg-blue-50 text-blue-700 border-blue-200" variant="outline">📧 Invite Sent</Badge>;
  }

  // C. Fallback to calculated global_status or On Hold
  if (vendor?.global_status === 'COMPLIANT') {
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">● Compliant</Badge>;
  }

  return <Badge className="bg-red-50 text-red-700 border-red-200" variant="outline">● On Hold</Badge>;
}

function MicroBadge({ label, status, tooltip }: { label: string; status: 'green' | 'amber' | 'red' | 'gray'; tooltip: string }) {
  const colors = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    amber: 'bg-amber-50 text-amber-700 border-amber-300',
    red: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    gray: 'bg-gray-100 text-gray-400 border-gray-200',
  }
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium tracking-normal flex items-center justify-center cursor-help transition-colors w-max border', colors[status])}>
            {label}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs font-medium">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function coverageCell(vendor: VendorWithCompliance, coverage: CoverageType) {
  const evaluation = vendor.compliance.coverages.find(
    (item) => item.coverage_type === coverage,
  )

  if (!evaluation || !evaluation.policy || !evaluation.policy.expiration_date) {
    return (
      <div className="flex flex-col gap-0.5 text-gray-400">
        <span className="text-sm font-medium text-slate-300">—</span>
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="cursor-help w-max text-xs text-slate-400">Not Provided</div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs font-medium">{coverage} Policy: Missing</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  const now = new Date()
  const expDate = new Date(evaluation.policy.expiration_date)
  const daysDiff = (expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)

  let statusColor = 'text-slate-500'
  let expLabel = ''
  let tooltipMsg = ''
  
  const formattedDt = expDate.toLocaleDateString()

  if (evaluation.status === 'REJECTED' || evaluation.policy?.status === 'REJECTED') {
    statusColor = 'bg-rose-50 text-rose-600 border border-rose-200/80 px-2.5 py-0.5 rounded-full text-[13px] font-normal inline-flex items-center gap-1 w-max'
    expLabel = `🔴 Rejected`
    tooltipMsg = evaluation.policy?.rejection_reason 
      ? `${coverage} rejected - ${evaluation.policy.rejection_reason}`
      : `${coverage} rejected`
  } else if (evaluation.status === 'MISSING_DATA' || evaluation.policy?.status === 'MISSING_DATA') {
    statusColor = 'bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-0.5 rounded-full text-[13px] font-normal inline-flex items-center gap-1 w-max'
    expLabel = `🟡 Incomplete`
    tooltipMsg = `This policy is missing required data`
  } else if (daysDiff < 0) {
    statusColor = 'bg-rose-50 text-rose-600 border border-rose-200/80 px-2.5 py-0.5 rounded-full text-[13px] font-normal inline-flex items-center gap-1 w-max'
    expLabel = `🔴 ${formattedDt}`
    tooltipMsg = `Expired on ${formattedDt} — Renewal COI Required`
  } else if (daysDiff <= 30) {
    statusColor = 'bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-0.5 rounded-full text-[13px] font-normal inline-flex items-center gap-1 w-max'
    expLabel = `🟡 ${formattedDt}`
    tooltipMsg = `Expires in ${Math.ceil(daysDiff)} days on ${formattedDt}`
  } else {
    statusColor = 'bg-emerald-50 text-emerald-600 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-[13px] font-normal inline-flex items-center gap-1 w-max'
    expLabel = `🟢 ${formattedDt}`
    tooltipMsg = `Active till ${formattedDt}`
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-light text-slate-700 tracking-wide">{formatCurrency(Number(evaluation.policy.limit_amount))}</span>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className={cn('cursor-help w-max', statusColor)}>
              {expLabel}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs font-medium">{tooltipMsg}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

function VendorFields({
  form,
  onChange,
  idPrefix,
}: {
  form: VendorFormState
  onChange: (patch: Partial<VendorFormState>) => void
  idPrefix: string
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Company name
        <Input
          id={`${idPrefix}-company`}
          value={form.company_name}
          onChange={(event) => onChange({ company_name: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Trade specialty
        <Input
          id={`${idPrefix}-trade`}
          value={form.trade_specialty}
          onChange={(event) => onChange({ trade_specialty: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Primary email
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={form.primary_email}
          onChange={(event) => onChange({ primary_email: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Tax ID / EIN
        <Input
          id={`${idPrefix}-ein`}
          value={form.tax_id_ein}
          className="font-mono"
          onChange={(event) => onChange({ tax_id_ein: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Street address
        <Input
          id={`${idPrefix}-street`}
          value={form.address_street}
          onChange={(event) => onChange({ address_street: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        ZIP
        <Input
          id={`${idPrefix}-zip`}
          value={form.address_zip}
          className="font-mono"
          onChange={(event) => onChange({ address_zip: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        EMR score (manual bucket)
        <Input
          id={`${idPrefix}-emr`}
          inputMode="decimal"
          placeholder="0.85"
          value={form.emr_score}
          className="font-mono"
          onChange={(event) => onChange({ emr_score: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        OSHA 300 / 300A log URL
        <Input
          id={`${idPrefix}-osha`}
          placeholder="https://..."
          value={form.osha_file_url}
          onChange={(event) => onChange({ osha_file_url: event.target.value })}
        />
      </label>
      <Button
        type="button"
        variant={form.emr_verified ? 'default' : 'outline'}
        className="gap-2 self-end"
        aria-pressed={form.emr_verified}
        onClick={() => onChange({ emr_verified: !form.emr_verified })}
      >
        <ShieldCheck className="size-4" aria-hidden="true" />
        {form.emr_verified ? 'EMR verified' : 'Mark EMR verified'}
      </Button>
    </div>
  )
}

export function VendorsDirectory({ refreshKey = 0, onNavigateStudio }: { refreshKey?: number, onNavigateStudio?: () => void }) {
  const [vendors, setVendors] = useState<VendorWithCompliance[]>([])
  const [trades, setTrades] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [tradeFilter, setTradeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<VendorFormState>(emptyFormState)
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [createForm, setCreateForm] = useState<VendorFormState>(emptyFormState)
  
  const [inspectVendor, setInspectVendor] = useState<VendorWithCompliance | null>(null)

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    const response = await fetch('/api/vendors?_t=' + Date.now(), { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setFetchError((payload as { error?: string }).error ?? 'Unable to load vendors')
      setVendors([])
      setTrades([])
    } else {
      const data = payload as VendorsResponse
      setVendors(data.vendors)
      setTrades(data.trades)
      
      setInspectVendor(prev => {
        if (!prev) return null;
        const latest = data.vendors.find((v: any) => v.vendor_id === prev.vendor_id);
        return latest || prev;
      });
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchVendors()
  }, [fetchVendors, refreshKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vendors
      .filter((vendor) => {
        const matchesQuery =
          q === '' ||
          vendor.company_name.toLowerCase().includes(q) ||
          vendor.normalized_name.includes(q) ||
          vendor.trade_specialty.toLowerCase().includes(q) ||
          (vendor.tax_id_ein?.toLowerCase().includes(q) ?? false) ||
          vendor.primary_email.toLowerCase().includes(q)
        const matchesTrade = tradeFilter.length === 0 || tradeFilter.includes(vendor.trade_specialty)
        const matchesStatus = statusFilter.length === 0 || statusFilter.includes(vendor.compliance.status)
        const matchesTab = activeTab === 'archived' 
          ? vendor.onboarding_status === 'ARCHIVED'
          : vendor.onboarding_status !== 'ARCHIVED'
        return matchesQuery && matchesTrade && matchesStatus && matchesTab
      })
      .sort((a, b) => {
        const severity = compareBySeverity(a.compliance.status, b.compliance.status)
        if (severity !== 0) return severity
        return a.company_name.localeCompare(b.company_name)
      })
  }, [vendors, query, tradeFilter, statusFilter])

  const startEdit = (vendor: VendorWithCompliance) => {
    setSaveError(null)
    setEditingId(vendor.vendor_id)
    setEditForm(toFormState(vendor))
  }

  const submitVendor = async (
    method: 'POST' | 'PATCH',
    body: VendorPatch | Record<string, unknown>,
  ) => {
    setSaving(true)
    setSaveError(null)

    const response = await fetch('/api/vendors', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    setSaving(false)

    if (!response.ok) {
      setSaveError((payload as { error?: string }).error ?? 'Unable to save vendor')
      return false
    }

    await fetchVendors()
    return true
  }

  const saveEdit = async () => {
    if (!editingId) return
    const emrScore = editForm.emr_score.trim()
    const ok = await submitVendor('PATCH', {
      vendor_id: editingId,
      company_name: editForm.company_name.trim(),
      primary_email: editForm.primary_email.trim(),
      trade_specialty: editForm.trade_specialty.trim() || 'Unclassified',
      tax_id_ein: optionalText(editForm.tax_id_ein),
      address_street: optionalText(editForm.address_street),
      address_zip: optionalText(editForm.address_zip),
      emr_score: emrScore === '' ? null : Number(emrScore),
      emr_verified: editForm.emr_verified,
      osha_file_url: optionalText(editForm.osha_file_url),
    })
    if (ok) setEditingId(null)
  }

  const createVendor = async () => {
    const emrScore = createForm.emr_score.trim()
    const ok = await submitVendor('POST', {
      company_name: createForm.company_name.trim(),
      primary_email: createForm.primary_email.trim(),
      trade_specialty: createForm.trade_specialty.trim() || 'Unclassified',
      tax_id_ein: optionalText(createForm.tax_id_ein),
      address_street: optionalText(createForm.address_street),
      address_zip: optionalText(createForm.address_zip),
      emr_score: emrScore === '' ? null : Number(emrScore),
      emr_verified: createForm.emr_verified,
      osha_file_url: optionalText(createForm.osha_file_url),
    })
    if (ok) {
      setCreateOpen(false)
      setCreateForm(emptyFormState)
    }
  }

  return (
    <Card className="w-full border border-border shadow-sm">
      <CardHeader className="gap-4 px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
              {loading
                ? 'Loading subcontractors...'
                : `${filtered.length} Total Subcontractor${filtered.length === 1 ? '' : 's'}`}
            </span>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active'|'archived')} className="w-auto hidden sm:block">
              <TabsList className="h-8">
                <TabsTrigger value="active" className="text-xs">Active</TabsTrigger>
                <TabsTrigger value="archived" className="text-xs">Archived</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-3">
            <Button className="bg-black hover:bg-slate-800 text-white font-medium px-4 py-2 rounded-lg transition-colors" onClick={() => onNavigateStudio && onNavigateStudio()}>
              + Add Subcontractor
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, trade, or EIN..."
              className="h-10 pl-9 text-sm"
              aria-label="Search vendors"
            />
          </div>
          <div className="flex gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "gap-2 h-10 w-full min-w-44 text-sm lg:w-48 justify-start")}>
                <Filter className="size-4 text-muted-foreground" />
                {tradeFilter.length === 0 ? 'All trades' : `${tradeFilter.length} trade${tradeFilter.length > 1 ? 's' : ''}`}
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                {trades.map((trade) => (
                  <DropdownMenuCheckboxItem
                    key={trade}
                    checked={tradeFilter.includes(trade)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setTradeFilter([...tradeFilter, trade])
                      } else {
                        setTradeFilter(tradeFilter.filter((t) => t !== trade))
                      }
                    }}
                  >
                    {trade}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "gap-2 h-10 w-full min-w-44 text-sm lg:w-48 justify-start")}>
                <Filter className="size-4 text-muted-foreground" />
                {statusFilter.length === 0 ? 'Overall Status' : `${statusFilter.length} status${statusFilter.length > 1 ? 'es' : ''}`}
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                {statusFilters.map((filter) => (
                  <DropdownMenuCheckboxItem
                    key={filter.value}
                    checked={statusFilter.includes(filter.value)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setStatusFilter([...statusFilter, filter.value])
                      } else {
                        setStatusFilter(statusFilter.filter((s) => s !== filter.value))
                      }
                    }}
                  >
                    {filter.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {fetchError ? <p className="px-6 pb-4 text-sm text-destructive">{fetchError}</p> : null}
        {saveError ? <p className="px-6 pb-4 text-sm text-destructive">{saveError}</p> : null}

        <div className="w-full overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="border-b text-xs font-bold text-slate-500 uppercase tracking-wider hover:bg-transparent">
                <TableHead className="py-3 pl-6 w-[200px]">Subcontractor</TableHead>
                <TableHead className="py-3 w-[100px]">SC ID</TableHead>
                <TableHead className="py-3 w-[150px]">Account Status</TableHead>
                <TableHead className="py-3 w-[150px]">Trade</TableHead>
                <TableHead className="py-3 min-w-[140px]">Docs & Safety</TableHead>
                <TableHead className="py-3 min-w-[130px]">CGL</TableHead>
                <TableHead className="py-3 min-w-[130px]">Auto</TableHead>
                <TableHead className="py-3 min-w-[130px]">WC</TableHead>
                <TableHead className="py-3 min-w-[130px]">Umbrella</TableHead>
                <TableHead className="py-3 pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                    Loading subcontractor directory...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                    {vendors.length === 0
                      ? 'No subcontractors yet. Upload an ACORD 25 certificate to provision one automatically.'
                      : 'No subcontractors match your filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((vendor) => {
                  const isEditing = editingId === vendor.vendor_id
                  return (
                    <Fragment key={vendor.vendor_id}>
                      <TableRow
                        className={cn(
                          'transition-colors hover:bg-muted/40',
                          isEditing && 'border-b-0 bg-muted/20',
                        )}
                      >
                        <TableCell className="pl-6 py-3.5 pr-4 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-sm text-foreground">{vendor.company_name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 font-normal truncate max-w-[120px]" title={vendor.tax_id_ein || 'EIN: --'}>
                                {vendor.tax_id_ein || 'EIN: --'}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3.5 align-middle">
                          <span className="font-sans text-xs font-medium text-slate-500 w-max block mt-0.5">
                            {vendor.sc_id || 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3.5 align-middle">
                          <div className="flex flex-col gap-1.5 mt-0.5">
                            <AccountStatusBadge vendor={vendor} />
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3.5 align-middle text-sm">
                          {vendor.trade_specialty && vendor.trade_specialty !== 'Unclassified' ? vendor.trade_specialty : <span className="text-xs text-slate-400 font-normal">—</span>}
                        </TableCell>
                        <TableCell className="px-4 py-3.5 align-middle">
                          <div className="grid grid-cols-2 gap-1.5 w-max">
                            {(() => {
                              const hasW9 = vendor.w9_file_url || vendor.documents?.some(d => d.doc_type === 'W-9' || d.doc_type === 'W9')
                              let w9Status: 'green' | 'amber' | 'red' | 'gray' = 'gray'
                              let w9Tooltip = 'W-9: Not Provided'
                              if (vendor.w9_status === 'VERIFIED') {
                                w9Status = 'green'
                                w9Tooltip = 'W-9: Verified'
                              } else if (vendor.w9_status === 'REJECTED') {
                                w9Status = 'red'
                                w9Tooltip = (vendor as any).w9_rejection_reason ? `W-9 rejected - ${(vendor as any).w9_rejection_reason}` : 'W-9 rejected'
                              } else if (hasW9) {
                                w9Status = 'amber'
                                w9Tooltip = 'W-9: Pending Manual Review'
                              }
                              
                              return (
                                <MicroBadge 
                                  label="W-9" 
                                  status={w9Status} 
                                  tooltip={w9Tooltip}
                                />
                              )
                            })()}
                            {(() => {
                              const hasMsa = vendor.msa_file_url || vendor.documents?.some(d => d.doc_type === 'MSA' || d.doc_type === 'Master Subcontractor Agreement (MSA)')
                              let msaStatus: 'green' | 'amber' | 'red' | 'gray' = 'gray'
                              let msaTooltip = 'MSA: Not Provided'
                              if (vendor.msa_status === 'VERIFIED') {
                                msaStatus = 'green'
                                msaTooltip = 'MSA: Verified'
                              } else if (vendor.msa_status === 'REJECTED') {
                                msaStatus = 'red'
                                msaTooltip = (vendor as any).msa_rejection_reason ? `MSA rejected - ${(vendor as any).msa_rejection_reason}` : 'MSA rejected'
                              } else if (hasMsa) {
                                msaStatus = 'amber'
                                msaTooltip = 'MSA: Pending Manual Review'
                              }
                              
                              return (
                                <MicroBadge 
                                  label="MSA" 
                                  status={msaStatus} 
                                  tooltip={msaTooltip}
                                />
                              )
                            })()}
                            {(() => {
                              const emrStatus = (vendor as any).emr_status;
                              let emrColor: 'green' | 'amber' | 'red' | 'gray' = 'gray';
                              let emrTooltip = 'EMR Score: Not Done Yet';
                              let emrLabel = vendor.emr_score != null ? `EMR ${vendor.emr_score}` : 'EMR N/A';

                              if (emrStatus === 'REJECTED') {
                                emrColor = 'red';
                                emrLabel = vendor.emr_score != null ? `EMR ${vendor.emr_score}` : 'EMR N/A';
                                emrTooltip = (vendor as any).emr_rejection_reason ? `EMR rejected - ${(vendor as any).emr_rejection_reason}` : 'EMR rejected';
                              } else if (vendor.emr_score != null) {
                                const score = Number(vendor.emr_score);
                                emrColor = score <= 1.0 ? 'green' : score <= 1.15 ? 'amber' : 'red';
                                emrTooltip = score <= 1.0 ? `EMR: ${score} (Clear)` : score <= 1.15 ? `EMR: ${score} (Needs Review - Elevated)` : `EMR: ${score} (Failed - Above Threshold)`;
                              }

                              return <MicroBadge label={emrLabel} status={emrColor} tooltip={emrTooltip} />;
                            })()}
                            {(() => {
                              const oshaStatus = (vendor as any).osha_status;
                              const hasOsha = !!vendor.osha_file_url;
                              let oshaColor: 'green' | 'amber' | 'red' | 'gray' = 'gray';
                              let oshaTooltip = 'OSHA 300: Not Provided';

                              if (oshaStatus === 'VERIFIED') {
                                oshaColor = 'green';
                                oshaTooltip = 'OSHA 300: Verified';
                              } else if (oshaStatus === 'REJECTED') {
                                oshaColor = 'red';
                                oshaTooltip = (vendor as any).osha_rejection_reason ? `OSHA rejected - ${(vendor as any).osha_rejection_reason}` : 'OSHA rejected';
                              } else if (hasOsha) {
                                oshaColor = 'amber';
                                oshaTooltip = 'OSHA 300: Pending Manual Review';
                              }

                              return <MicroBadge label="OSHA" status={oshaColor} tooltip={oshaTooltip} />;
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3.5 align-middle">{coverageCell(vendor, 'GL')}</TableCell>
                        <TableCell className="px-4 py-3.5 align-middle">{coverageCell(vendor, 'AUTO')}</TableCell>
                        <TableCell className="px-4 py-3.5 align-middle">{coverageCell(vendor, 'WORKERS_COMP')}</TableCell>
                        <TableCell className="px-4 py-3.5 align-middle">{coverageCell(vendor, 'UMBRELLA')}</TableCell>
                        <TableCell className="px-4 py-3.5 pr-6 text-right align-middle">
                          <div className="flex flex-col justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-3 text-xs font-medium text-foreground bg-background hover:bg-muted border-border"
                              onClick={() => setInspectVendor(vendor)}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {isEditing ? (
                        <TableRow className="bg-muted/15 hover:bg-muted/15">
                          <TableCell colSpan={9} className="px-6 py-5">
                            <VendorFields
                              form={editForm}
                              idPrefix={`edit-${vendor.vendor_id}`}
                              onChange={(patch) =>
                                setEditForm((previous) => ({ ...previous, ...patch }))
                              }
                            />
                            <div className="mt-4 flex justify-end gap-2">
                              <Button variant="ghost" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                              <Button className="gap-2" disabled={saving} onClick={() => void saveEdit()}>
                                {saving ? (
                                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                                ) : null}
                                Save changes
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
            <DialogDescription>
              Create a subcontractor profile manually. Certificates uploaded later match into it
              automatically.
            </DialogDescription>
          </DialogHeader>
          <VendorFields
            form={createForm}
            idPrefix="create"
            onChange={(patch) => setCreateForm((previous) => ({ ...previous, ...patch }))}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button className="gap-2" disabled={saving} onClick={() => void createVendor()}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Create vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <VendorInspectDrawer 
        vendor={inspectVendor} 
        open={!!inspectVendor} 
        onOpenChange={(open) => !open && setInspectVendor(null)} 
        onDeleted={fetchVendors}
        onSaved={fetchVendors}
        onUpdateVendor={(updatedVendor) => {
          setVendors(prev => prev.map(v => v.vendor_id === updatedVendor.vendor_id ? updatedVendor : v))
          if (inspectVendor?.vendor_id === updatedVendor.vendor_id) {
            setInspectVendor(updatedVendor)
          }
        }}
      />
      {inviteOpen && (
        <NewSubcontractorInviteModal 
          open={inviteOpen} 
          onOpenChange={setInviteOpen} 
          onSuccess={() => {
            fetchVendors()
          }}
        />
      )}
    </Card>
  )
}
