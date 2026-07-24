'use client'

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { Search, Eye, FileText, Download, Calendar, ChevronRight, ChevronDown } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  formatDate,
  getStatus,
  daysUntil,
  STATUS_PRIORITY,
  type ComplianceStatus,
} from '@/lib/compliance-data'
import type { ComplianceDocRow } from '@/lib/types/compliance-doc'
import { cn } from '@/lib/utils'

const statusFilters: { label: string; value: ComplianceStatus | 'all' }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Compliant', value: 'compliant' },
  { label: 'Active', value: 'active' },
  { label: 'Expiring Soon', value: 'expiring' },
  { label: 'Action Required', value: 'expired' },
]

function formatTimestamp(isoString: string): string {
  if (!isoString) return 'N/A'
  try {
    const date = new Date(isoString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return formatDate(isoString)
  }
}

function getPrimaryNameOnly(fullName: string): string {
  if (!fullName) return ''
  return fullName.split(',')[0].trim()
}

function getEarliestExpiration(doc: ComplianceDocRow): string {
  if (!doc.coverages || doc.coverages.length === 0) return doc.expiration_date
  let earliest = doc.coverages[0].expiration_date
  for (let i = 1; i < doc.coverages.length; i++) {
    if (new Date(doc.coverages[i].expiration_date) < new Date(earliest)) {
      earliest = doc.coverages[i].expiration_date
    }
  }
  return earliest
}

function getParentStatus(doc: ComplianceDocRow): ComplianceStatus {
  if (!doc.coverages || doc.coverages.length === 0) {
    return getStatus(doc.expiration_date)
  }
  if (doc.coverages.length === 1) {
    return getStatus(doc.coverages[0].expiration_date)
  }

  let hasExpired = false
  let hasExpiring = false

  for (const cov of doc.coverages) {
    const st = getStatus(cov.expiration_date)
    if (st === 'expired') hasExpired = true
    if (st === 'expiring') hasExpiring = true
  }

  if (hasExpired || hasExpiring) return 'expired'
  return 'compliant'
}

interface DocumentsTableProps {
  refreshKey?: number
}

export function DocumentsTable({ refreshKey = 0 }: DocumentsTableProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selected, setSelected] = useState<ComplianceDocRow | null>(null)
  const [documents, setDocuments] = useState<ComplianceDocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    const response = await fetch('/api/documents')
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setFetchError(payload.error ?? 'Unable to load documents')
      setDocuments([])
    } else {
      setDocuments(payload as ComplianceDocRow[])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchDocuments()
  }, [fetchDocuments, refreshKey])

  const documentTypes = useMemo(() => {
    const types = new Set(documents.map((doc) => doc.doc_type))
    return Array.from(types).sort()
  }, [documents])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents
      .filter((doc) => {
        const matchesQuery =
          q === '' ||
          doc.company_name.toLowerCase().includes(q) ||
          doc.doc_type.toLowerCase().includes(q) ||
          (doc.policy_amount?.toLowerCase().includes(q) ?? false) ||
          (doc.id?.toLowerCase().includes(q) ?? false)
        const matchesType = typeFilter === 'all' || doc.doc_type === typeFilter
        const parentStatus = getParentStatus(doc)
        const matchesStatus =
          statusFilter === 'all' || parentStatus === statusFilter
        return matchesQuery && matchesType && matchesStatus
      })
      .sort((a, b) => {
        const statusA = getParentStatus(a)
        const statusB = getParentStatus(b)
        const priorityA = STATUS_PRIORITY[statusA] ?? 2
        const priorityB = STATUS_PRIORITY[statusB] ?? 2

        if (priorityA !== priorityB) return priorityA - priorityB

        const dateA = getEarliestExpiration(a)
        const dateB = getEarliestExpiration(b)
        return daysUntil(dateA) - daysUntil(dateB)
      })
  }, [documents, query, typeFilter, statusFilter])

  return (
    <div className="w-full">
      <Card className="w-full border border-border shadow-sm">
        <CardHeader className="gap-4 px-6 pt-6 pb-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl font-semibold tracking-tight">
              Compliance Documents
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {loading
                ? 'Loading documents...'
                : `${filtered.length} of ${documents.length} documents`}
            </p>
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by Vendor ID, company, document type..."
                className="pl-9 h-10 text-sm"
                aria-label="Search documents"
              />
            </div>
            <div className="flex gap-3">
              <Select
                value={typeFilter}
                onValueChange={(value) => value && setTypeFilter(value)}
              >
                <SelectTrigger className="w-full min-w-44 lg:w-48 h-10 text-sm">
                  <SelectValue placeholder="Document type">
                    {(value: string) =>
                      value === 'all' ? 'All document types' : value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All document types</SelectItem>
                  {documentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => value && setStatusFilter(value)}
              >
                <SelectTrigger className="w-full min-w-40 lg:w-44 h-10 text-sm">
                  <SelectValue placeholder="Status">
                    {(value: string) =>
                      statusFilters.find((f) => f.value === value)?.label ??
                      'Status'
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
          {fetchError ? (
            <p className="px-6 pb-4 text-sm text-destructive">{fetchError}</p>
          ) : null}
          <div className="w-full overflow-x-auto">
            <Table className="w-full min-w-[1000px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <TableHead className="pl-6 py-3.5 w-[160px]">Vendor ID</TableHead>
                  <TableHead className="py-3.5 min-w-[220px]">Insured Company</TableHead>
                  <TableHead className="py-3.5 min-w-[180px]">Document Type</TableHead>
                  <TableHead className="py-3.5 min-w-[160px]">Uploaded At</TableHead>
                  <TableHead className="py-3.5 min-w-[140px]">Expiration Date</TableHead>
                  <TableHead className="py-3.5 min-w-[130px]">Status</TableHead>
                  <TableHead className="pr-6 py-3.5 text-right w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Loading compliance documents...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      {documents.length === 0
                        ? 'No documents yet. Upload a certificate to get started.'
                        : 'No documents match your filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((doc) => {
                    const coverages = doc.coverages || []
                    const isMulti = coverages.length > 1
                    const isSingle = coverages.length === 1
                    const isExpanded = expandedRows.has(doc.id)
                    const parentStatus = getParentStatus(doc)

                    let typeDisplay = doc.doc_type
                    let dateDisplay = formatDate(doc.expiration_date)
                    let statusToDisplay = getStatus(doc.expiration_date)

                    if (isMulti) {
                      typeDisplay = 'Certificate of Insurance'
                      dateDisplay = formatDate(getEarliestExpiration(doc))
                      statusToDisplay = parentStatus
                    } else if (isSingle) {
                      typeDisplay = `${coverages[0].type}`
                      dateDisplay = formatDate(coverages[0].expiration_date)
                      statusToDisplay = getStatus(coverages[0].expiration_date)
                    }

                    const vendorIdDisplay = `VEND-${doc.id.slice(0, 6).toUpperCase()}`
                    const primaryInsuredName = getPrimaryNameOnly(doc.company_name)

                    return (
                      <Fragment key={doc.id}>
                        <TableRow
                          className={cn(
                            'group hover:bg-muted/40 transition-colors',
                            isExpanded && 'border-b-0 bg-muted/20'
                          )}
                        >
                          <TableCell className="pl-6 py-4 font-mono text-xs font-semibold text-muted-foreground">
                            <div className="flex items-center gap-2">
                              {isMulti ? (
                                <button
                                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => toggleRow(doc.id)}
                                  aria-label={
                                    isExpanded
                                      ? 'Collapse coverages'
                                      : 'Expand coverages'
                                  }
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="size-3.5" />
                                  ) : (
                                    <ChevronRight className="size-3.5" />
                                  )}
                                </button>
                              ) : (
                                <div className="size-5 shrink-0" />
                              )}
                              <span>{vendorIdDisplay}</span>
                            </div>
                          </TableCell>

                          <TableCell className="py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground">
                                {primaryInsuredName}
                              </span>
                              {isMulti && (
                                <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground tracking-wide uppercase">
                                  {coverages.length} Coverages
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="py-4 text-sm text-foreground">
                            {typeDisplay}
                          </TableCell>

                          <TableCell className="py-4 text-xs text-muted-foreground">
                            {formatTimestamp(doc.created_at)}
                          </TableCell>

                          <TableCell className="py-4 text-sm text-foreground font-medium">
                            {dateDisplay}
                          </TableCell>

                          <TableCell className="py-4">
                            <StatusBadge status={statusToDisplay} />
                          </TableCell>

                          <TableCell className="pr-6 py-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 h-8 px-3 text-xs font-medium"
                              onClick={() => setSelected(doc)}
                            >
                              <Eye className="size-3.5" aria-hidden="true" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && isMulti && (
                          <TableRow className="bg-muted/15 hover:bg-muted/15">
                            <TableCell colSpan={7} className="p-0 border-b">
                              <div className="pl-12 pr-6 py-4">
                                <Table className="rounded-lg border bg-background text-sm shadow-sm overflow-hidden w-full">
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent bg-muted/50 border-b">
                                      <TableHead className="h-9 font-semibold text-xs text-muted-foreground uppercase">
                                        Coverage / Policy #
                                      </TableHead>
                                      <TableHead className="h-9 font-semibold text-xs text-muted-foreground uppercase">
                                        Limit
                                      </TableHead>
                                      <TableHead className="h-9 font-semibold text-xs text-muted-foreground uppercase w-[140px]">
                                        Expiration
                                      </TableHead>
                                      <TableHead className="h-9 font-semibold text-xs text-muted-foreground uppercase w-[130px]">
                                        Status
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {[...coverages]
                                      .sort((a, b) => {
                                        const pA =
                                          STATUS_PRIORITY[
                                            getStatus(a.expiration_date)
                                          ] ?? 2
                                        const pB =
                                          STATUS_PRIORITY[
                                            getStatus(b.expiration_date)
                                          ] ?? 2
                                        if (pA !== pB) return pA - pB
                                        return (
                                          daysUntil(a.expiration_date) -
                                          daysUntil(b.expiration_date)
                                        )
                                      })
                                      .map((cov, idx) => (
                                        <TableRow
                                          key={idx}
                                          className="hover:bg-muted/20 border-b last:border-0"
                                        >
                                          <TableCell className="align-top py-3 text-sm">
                                            <div className="font-semibold text-foreground">
                                              {cov.type}
                                            </div>
                                            <div className="text-xs font-mono text-muted-foreground mt-0.5">
                                              {cov.policy_number}
                                            </div>
                                          </TableCell>
                                          <TableCell className="align-top py-3 text-sm">
                                            <div className="font-semibold text-foreground">
                                              {cov.limits}
                                            </div>
                                            {cov.sub_limits &&
                                              cov.sub_limits.filter(
                                                (s) =>
                                                  s.amount &&
                                                  s.amount.trim() !== '' &&
                                                  s.amount.trim() !== '$'
                                              ).length > 0 && (
                                                <div className="mt-2 flex flex-col gap-1 border-l-2 border-primary/20 pl-2.5">
                                                  {cov.sub_limits
                                                    .filter(
                                                      (s) =>
                                                        s.amount &&
                                                        s.amount.trim() !==
                                                          '' &&
                                                        s.amount.trim() !== '$'
                                                    )
                                                    .map((sub, i) => (
                                                      <div
                                                        key={i}
                                                        className="text-xs text-muted-foreground leading-relaxed"
                                                      >
                                                        <span>
                                                          {sub.limit_name}
                                                        </span>
                                                        <span className="mx-1.5">
                                                          —
                                                        </span>
                                                        <span className="font-medium text-foreground">
                                                          {sub.amount}
                                                        </span>
                                                      </div>
                                                    ))}
                                                </div>
                                              )}
                                          </TableCell>
                                          <TableCell className="align-top py-3 text-sm font-medium">
                                            {formatDate(cov.expiration_date)}
                                          </TableCell>
                                          <TableCell className="align-top py-2.5">
                                            <StatusBadge
                                              status={getStatus(
                                                cov.expiration_date
                                              )}
                                              labelOverride={
                                                getStatus(
                                                  cov.expiration_date
                                                ) === 'expired'
                                                  ? 'Expired'
                                                  : undefined
                                              }
                                            />
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto pr-2">
          {selected ? <DocumentDetail doc={selected} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DocumentDetail({ doc }: { doc: ComplianceDocRow }) {
  const status = getParentStatus(doc)
  const vendorIdDisplay = `VEND-${doc.id.slice(0, 6).toUpperCase()}`

  const details: { label: string; value: string }[] = [
    { label: 'Vendor ID', value: vendorIdDisplay },
    { label: 'Document ID', value: doc.id },
    { label: 'Document Type', value: doc.doc_type },
    { label: 'Expires', value: formatDate(getEarliestExpiration(doc)) },
    {
      label: 'Uploaded At',
      value: formatTimestamp(doc.created_at),
    },
  ]

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <FileText className="size-5 text-primary" aria-hidden="true" />
          {doc.doc_type}
        </DialogTitle>
        <DialogDescription className="text-xs text-foreground pt-1">
          <span className="font-semibold block text-muted-foreground text-[11px] uppercase tracking-wider">
            Full Insured Name & Entities
          </span>
          {doc.company_name}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 my-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="size-4" aria-hidden="true" />
          Current status
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 py-2">
        {details.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 text-xs font-mono font-medium text-foreground break-all">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {doc.coverages && doc.coverages.length > 0 ? (
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-semibold text-foreground">Coverages</h4>
          <div className="flex flex-col gap-2.5">
            {[...doc.coverages]
              .sort((a, b) => {
                const pA = STATUS_PRIORITY[getStatus(a.expiration_date)] ?? 2
                const pB = STATUS_PRIORITY[getStatus(b.expiration_date)] ?? 2
                if (pA !== pB) return pA - pB
                return daysUntil(a.expiration_date) - daysUntil(b.expiration_date)
              })
              .map((cov, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5 text-sm"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{cov.type}</span>
                      <span>{cov.limits}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Policy: {cov.policy_number}</span>
                      <span>Exp: {formatDate(cov.expiration_date)}</span>
                    </div>
                  </div>
                  {cov.sub_limits &&
                    cov.sub_limits.filter(
                      (s) =>
                        s.amount &&
                        s.amount.trim() !== '' &&
                        s.amount.trim() !== '$'
                    ).length > 0 && (
                      <div className="flex flex-col gap-1 rounded bg-muted/40 p-2.5">
                        {cov.sub_limits
                          .filter(
                            (s) =>
                              s.amount &&
                              s.amount.trim() !== '' &&
                              s.amount.trim() !== '$'
                          )
                          .map((sub, i) => (
                            <div key={i} className="text-xs text-muted-foreground">
                              <span>{sub.limit_name}</span>
                              <span className="mx-1.5">—</span>
                              <span className="font-medium text-foreground">
                                {sub.amount}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {doc.file_url ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card p-4 mt-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {getPrimaryNameOnly(doc.company_name)} certificate
            </p>
            <p className="text-xs text-muted-foreground">Uploaded certificate</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            render={
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            {...{ nativeButton: false }}
          >
            <Download className="size-4" aria-hidden="true" />
            Download
          </Button>
        </div>
      ) : null}
    </>
  )
}
