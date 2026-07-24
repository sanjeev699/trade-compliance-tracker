'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Pencil, Plus, ShieldCheck, X, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { ComplianceStatusBadge, statusPresentation } from '@/components/compliance-status-badge'
import { formatCurrency, formatDate, formatEmrScore } from '@/lib/format'
import {
  compareBySeverity,
  type ComplianceStatus,
  type CoverageType,
} from '@/lib/compliance/status'
import type { VendorPatch, VendorWithCompliance, VendorsResponse } from '@/lib/types/vendor'
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
    emr_verified: vendor.emr_verified,
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

function coverageCell(vendor: VendorWithCompliance, coverage: CoverageType) {
  const evaluation = vendor.compliance.coverages.find(
    (item) => item.coverage_type === coverage,
  )
  if (!evaluation || !evaluation.policy) {
    return <ComplianceStatusBadge status="MISSING_DOCUMENT" label="Missing" />
  }

  return (
    <div className="flex flex-col gap-1">
      <ComplianceStatusBadge status={evaluation.status} />
      <span className="font-mono text-[11px] text-muted-foreground">
        {formatCurrency(evaluation.effective_limit)} · exp{' '}
        {formatDate(evaluation.policy.expiration_date)}
      </span>
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

export function VendorsDirectory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [vendors, setVendors] = useState<VendorWithCompliance[]>([])
  const [trades, setTrades] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [tradeFilter, setTradeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<VendorFormState>(emptyFormState)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<VendorFormState>(emptyFormState)

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    const response = await fetch('/api/vendors')
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setFetchError((payload as { error?: string }).error ?? 'Unable to load vendors')
      setVendors([])
      setTrades([])
    } else {
      const data = payload as VendorsResponse
      setVendors(data.vendors)
      setTrades(data.trades)
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
        const matchesTrade = tradeFilter === 'all' || vendor.trade_specialty === tradeFilter
        const matchesStatus = statusFilter === 'all' || vendor.compliance.status === statusFilter
        return matchesQuery && matchesTrade && matchesStatus
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
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl font-semibold tracking-tight">
              Master Vendor Directory
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {loading
                ? 'Loading vendors...'
                : `${filtered.length} of ${vendors.length} subcontractors`}
            </p>
          </div>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add vendor
          </Button>
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
            <Select value={tradeFilter} onValueChange={(value) => value && setTradeFilter(value)}>
              <SelectTrigger className="h-10 w-full min-w-44 text-sm lg:w-48">
                <SelectValue placeholder="Trade">
                  {(value: string) => (value === 'all' ? 'All trades' : value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trades</SelectItem>
                {trades.map((trade) => (
                  <SelectItem key={trade} value={trade}>
                    {trade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value)}>
              <SelectTrigger className="h-10 w-full min-w-40 text-sm lg:w-48">
                <SelectValue placeholder="Status">
                  {(value: string) =>
                    statusFilters.find((filter) => filter.value === value)?.label ?? 'Status'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {fetchError ? <p className="px-6 pb-4 text-sm text-destructive">{fetchError}</p> : null}
        {saveError ? <p className="px-6 pb-4 text-sm text-destructive">{saveError}</p> : null}

        <div className="w-full overflow-x-auto">
          <Table className="w-full min-w-[1100px]">
            <TableHeader>
              <TableRow className="border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-transparent">
                <TableHead className="min-w-[240px] py-3.5 pl-6">Company</TableHead>
                <TableHead className="min-w-[150px] py-3.5">Trade</TableHead>
                <TableHead className="min-w-[190px] py-3.5">General Liability</TableHead>
                <TableHead className="min-w-[190px] py-3.5">Workers&apos; Comp</TableHead>
                <TableHead className="min-w-[110px] py-3.5">EMR</TableHead>
                <TableHead className="min-w-[150px] py-3.5">Status</TableHead>
                <TableHead className="w-[100px] py-3.5 pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    Loading master vendor directory...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    {vendors.length === 0
                      ? 'No vendors yet. Upload an ACORD 25 certificate to provision one automatically.'
                      : 'No vendors match your filters.'}
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
                        <TableCell className="py-4 pl-6">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-foreground">
                              {vendor.company_name}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              EIN {vendor.tax_id_ein ?? '—'} · {vendor.primary_email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-foreground">
                          {vendor.trade_specialty}
                        </TableCell>
                        <TableCell className="py-4">{coverageCell(vendor, 'GL')}</TableCell>
                        <TableCell className="py-4">
                          {coverageCell(vendor, 'WORKERS_COMP')}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-sm text-foreground">
                              {formatEmrScore(vendor.emr_score)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {vendor.emr_verified ? 'Verified' : 'Unverified'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <ComplianceStatusBadge status={vendor.compliance.status} />
                        </TableCell>
                        <TableCell className="py-4 pr-6 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-3 text-xs font-medium"
                            onClick={() => (isEditing ? setEditingId(null) : startEdit(vendor))}
                          >
                            {isEditing ? (
                              <X className="size-3.5" aria-hidden="true" />
                            ) : (
                              <Pencil className="size-3.5" aria-hidden="true" />
                            )}
                            {isEditing ? 'Close' : 'Edit'}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isEditing ? (
                        <TableRow className="bg-muted/15 hover:bg-muted/15">
                          <TableCell colSpan={7} className="px-6 py-5">
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
    </Card>
  )
}
