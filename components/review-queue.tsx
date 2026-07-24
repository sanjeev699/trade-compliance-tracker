'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Inbox,
  Link2,
  Loader2,
  RefreshCw,
  ShieldQuestion,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { COVERAGE_LABELS, type CoverageType } from '@/lib/compliance/status'
import { formatDate } from '@/lib/format'
import {
  REJECTION_REASONS,
  type ExtractedCoverage,
  type RejectionReason,
  type ReviewQueueItem,
  type ReviewQueueResponse,
  type ReviewType,
} from '@/lib/types/review'
import { cn } from '@/lib/utils'

const flagCopy: Record<ReviewType, { label: string; detail: string }> = {
  LOW_CONFIDENCE_MATCH: {
    label: 'Low confidence match',
    detail: 'No existing vendor matched; a vendor profile was provisioned from this certificate.',
  },
  ADDRESS_MISMATCH: {
    label: 'Address mismatch',
    detail: 'The company name matched an existing vendor but the street or ZIP differs.',
  },
  FUZZY_MATCH: {
    label: 'Fuzzy name match',
    detail: 'The closest vendor name scored at or below the 90% confidence threshold.',
  },
  CARRIER_SWITCH: {
    label: 'Carrier switch',
    detail: 'The incoming policy is written by a different carrier than the active one.',
  },
  POLICY_CONFLICT: {
    label: 'Policy conflict',
    detail: 'An active policy for this coverage is not near expiry; the incumbent was kept.',
  },
  MISSING_POLICY_DATA: {
    label: 'Missing policy data',
    detail: 'The certificate is missing a policy number or carrier NAIC code.',
  },
  MANUAL_OVERRIDE: {
    label: 'Manual override',
    detail: 'Flagged for manual handling by a Risk Manager.',
  },
}

const rejectionCopy: Record<RejectionReason, string> = {
  NOT_AN_ACORD_25: 'Not an ACORD 25',
  ILLEGIBLE_DOCUMENT: 'Illegible document',
  WRONG_VENDOR: 'Wrong vendor',
  EXPIRED_CERTIFICATE: 'Expired certificate',
  DUPLICATE_SUBMISSION: 'Duplicate submission',
  EXTRACTION_INACCURATE: 'Extraction inaccurate',
}

interface VendorFormState {
  vendor_id: string
  company_name: string
  primary_email: string
  trade_specialty: string
  tax_id_ein: string
  address_street: string
  address_zip: string
}

interface CoverageFormState {
  coverage_type: CoverageType
  policy_number: string
  naic_code: string
  limit_amount: string
  effective_date: string
  expiration_date: string
}

const NEW_VENDOR = 'new'

function vendorFormFor(item: ReviewQueueItem): VendorFormState {
  const extracted = item.document.extracted_data
  const vendor = item.vendor
  return {
    vendor_id: vendor?.vendor_id ?? NEW_VENDOR,
    company_name: vendor?.company_name ?? extracted?.vendor_name ?? item.document.company_name,
    primary_email: vendor?.primary_email ?? extracted?.primary_email ?? '',
    trade_specialty: vendor?.trade_specialty ?? 'Unclassified',
    tax_id_ein: vendor?.tax_id_ein ?? '',
    address_street: vendor?.address_street ?? extracted?.address_street ?? '',
    address_zip: vendor?.address_zip ?? extracted?.address_zip ?? '',
  }
}

function coverageFormFor(item: ReviewQueueItem): CoverageFormState[] {
  return (item.document.extracted_data?.coverages ?? []).map((coverage) => ({
    coverage_type: coverage.coverage_type,
    policy_number: coverage.policy_number ?? '',
    naic_code: coverage.naic_code ?? '',
    limit_amount: String(coverage.limit_amount ?? 0),
    effective_date: coverage.effective_date ?? '',
    expiration_date: coverage.expiration_date ?? '',
  }))
}

function toCoveragePayload(rows: CoverageFormState[]): ExtractedCoverage[] {
  return rows.map((row) => ({
    coverage_type: row.coverage_type,
    policy_number: row.policy_number.trim() || null,
    naic_code: row.naic_code.trim() || null,
    limit_amount: Number(row.limit_amount) || 0,
    effective_date: row.effective_date || null,
    expiration_date: row.expiration_date,
  }))
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}

export function ReviewQueue({
  refreshKey = 0,
  onResolved,
}: {
  refreshKey?: number
  onResolved?: () => void
}) {
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [vendorForm, setVendorForm] = useState<VendorFormState | null>(null)
  const [coverageRows, setCoverageRows] = useState<CoverageFormState[]>([])
  const [reason, setReason] = useState<RejectionReason>('EXTRACTION_INACCURATE')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const response = await fetch('/api/review-queue', { cache: 'no-store' })
      const payload = (await response.json()) as ReviewQueueResponse & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load review queue')
      setItems(payload.items)
      setSelectedId((current) => {
        if (current && payload.items.some((item) => item.review_id === current)) return current
        return payload.items[0]?.review_id ?? null
      })
    } catch (error: unknown) {
      setFetchError(error instanceof Error ? error.message : 'Unable to load review queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const selected = useMemo(
    () => items.find((item) => item.review_id === selectedId) ?? null,
    [items, selectedId],
  )

  useEffect(() => {
    if (!selected) {
      setVendorForm(null)
      setCoverageRows([])
      return
    }
    setVendorForm(vendorFormFor(selected))
    setCoverageRows(coverageFormFor(selected))
    setNotes('')
    setActionError(null)
  }, [selected])

  const documentFlags = useMemo(() => {
    if (!selected) return []
    return items
      .filter((item) => item.document.id === selected.document.id)
      .map((item) => item.review_type)
  }, [items, selected])

  const resolve = async (body: Record<string, unknown>) => {
    if (!selected) return
    setSubmitting(true)
    setActionError(null)
    try {
      const response = await fetch(`/api/review-queue/${selected.review_id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to resolve this item')
      await load()
      onResolved?.()
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Unable to resolve this item')
    } finally {
      setSubmitting(false)
    }
  }

  const approve = () => {
    if (!vendorForm) return
    void resolve({
      action: 'APPROVE',
      notes: notes || null,
      vendor: {
        vendor_id: vendorForm.vendor_id === NEW_VENDOR ? undefined : vendorForm.vendor_id,
        company_name: vendorForm.company_name.trim(),
        primary_email: vendorForm.primary_email.trim(),
        trade_specialty: vendorForm.trade_specialty.trim() || 'Unclassified',
        tax_id_ein: vendorForm.tax_id_ein.trim() || null,
        address_street: vendorForm.address_street.trim() || null,
        address_zip: vendorForm.address_zip.trim() || null,
      },
      coverages: toCoveragePayload(coverageRows),
    })
  }

  const reject = () => {
    void resolve({ action: 'REJECT', reason_code: reason, notes: notes || null })
  }

  const updateCoverage = (index: number, patch: Partial<CoverageFormState>) => {
    setCoverageRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading the review queue…
        </CardContent>
      </Card>
    )
  }

  if (fetchError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center justify-between gap-4 py-6 text-sm">
          <span className="text-destructive">{fetchError}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <CheckCircle2 className="size-8 text-emerald-600" aria-hidden="true" />
          <p className="text-sm font-medium">The review queue is clear.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Certificates that need a human decision — low-confidence matches, carrier switches,
            policy conflicts — land here as they are ingested.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Inbox className="size-4" aria-hidden="true" />
            Pending items
            <Badge variant="secondary" className="ml-auto">
              {items.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto p-2">
          {items.map((item) => (
            <button
              key={item.review_id}
              type="button"
              onClick={() => setSelectedId(item.review_id)}
              className={cn(
                'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                item.review_id === selectedId
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-transparent hover:bg-muted',
              )}
            >
              <span className="block truncate font-medium">
                {item.document.extracted_data?.vendor_name ?? item.document.company_name}
              </span>
              <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                {flagCopy[item.review_type].label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDate(item.created_at)}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {selected && vendorForm ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="truncate text-sm font-semibold">
                {selected.document.original_filename ?? 'Certificate'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selected.document.mime_type?.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.document.file_url}
                  alt="Uploaded certificate"
                  className="h-[70vh] w-full bg-muted object-contain"
                />
              ) : (
                <iframe
                  title="Uploaded certificate"
                  src={selected.document.file_url}
                  className="h-[70vh] w-full border-0 bg-muted"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Extracted metadata</CardTitle>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {documentFlags.map((flag) => (
                  <Badge
                    key={flag}
                    variant="outline"
                    className="border-amber-500/40 bg-amber-50 text-amber-800"
                  >
                    <FileWarning className="size-3" aria-hidden="true" />
                    {flagCopy[flag].label}
                  </Badge>
                ))}
                {selected.confidence_score !== null ? (
                  <Badge variant="secondary" className="font-mono">
                    {Number(selected.confidence_score).toFixed(1)}% confidence
                  </Badge>
                ) : null}
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                {flagCopy[selected.review_type].detail}
              </p>
            </CardHeader>

            <CardContent className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
              <div className="flex flex-col gap-1">
                <FieldLabel>Link to vendor</FieldLabel>
                <Select
                  value={vendorForm.vendor_id}
                  onValueChange={(value) =>
                    setVendorForm((form) =>
                      form && typeof value === 'string' ? { ...form, vendor_id: value } : form,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_VENDOR}>Create a new vendor</SelectItem>
                    {selected.vendor ? (
                      <SelectItem value={selected.vendor.vendor_id}>
                        {selected.vendor.company_name} (linked)
                      </SelectItem>
                    ) : null}
                    {selected.candidate_vendors
                      .filter((candidate) => candidate.vendor_id !== selected.vendor?.vendor_id)
                      .map((candidate) => (
                        <SelectItem key={candidate.vendor_id} value={candidate.vendor_id}>
                          {candidate.company_name} (near match)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <FieldLabel>Company</FieldLabel>
                  <Input
                    value={vendorForm.company_name}
                    onChange={(event) =>
                      setVendorForm((form) =>
                        form ? { ...form, company_name: event.target.value } : form,
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <FieldLabel>Trade</FieldLabel>
                  <Input
                    value={vendorForm.trade_specialty}
                    onChange={(event) =>
                      setVendorForm((form) =>
                        form ? { ...form, trade_specialty: event.target.value } : form,
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <FieldLabel>Contact email</FieldLabel>
                  <Input
                    type="email"
                    value={vendorForm.primary_email}
                    onChange={(event) =>
                      setVendorForm((form) =>
                        form ? { ...form, primary_email: event.target.value } : form,
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <FieldLabel>EIN</FieldLabel>
                  <Input
                    value={vendorForm.tax_id_ein}
                    onChange={(event) =>
                      setVendorForm((form) =>
                        form ? { ...form, tax_id_ein: event.target.value } : form,
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <FieldLabel>Street</FieldLabel>
                  <Input
                    value={vendorForm.address_street}
                    onChange={(event) =>
                      setVendorForm((form) =>
                        form ? { ...form, address_street: event.target.value } : form,
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <FieldLabel>ZIP</FieldLabel>
                  <Input
                    value={vendorForm.address_zip}
                    onChange={(event) =>
                      setVendorForm((form) =>
                        form ? { ...form, address_zip: event.target.value } : form,
                      )
                    }
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3">
                <FieldLabel>Coverages</FieldLabel>
                {coverageRows.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                    No coverages were extracted from this certificate. Reject it, or approve after
                    adding the policy manually from the vendor directory.
                  </p>
                ) : null}
                {coverageRows.map((row, index) => (
                  <div key={`${row.coverage_type}-${index}`} className="rounded-md border p-3">
                    <div className="flex items-center gap-2 pb-2 text-sm font-medium">
                      <ShieldQuestion className="size-4 text-muted-foreground" aria-hidden="true" />
                      {COVERAGE_LABELS[row.coverage_type]}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <FieldLabel>Policy number</FieldLabel>
                        <Input
                          className="font-mono"
                          value={row.policy_number}
                          onChange={(event) =>
                            updateCoverage(index, { policy_number: event.target.value })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <FieldLabel>Carrier NAIC</FieldLabel>
                        <Input
                          className="font-mono"
                          value={row.naic_code}
                          onChange={(event) =>
                            updateCoverage(index, { naic_code: event.target.value })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <FieldLabel>Limit</FieldLabel>
                        <Input
                          type="number"
                          min={0}
                          value={row.limit_amount}
                          onChange={(event) =>
                            updateCoverage(index, { limit_amount: event.target.value })
                          }
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <FieldLabel>Effective</FieldLabel>
                          <Input
                            type="date"
                            value={row.effective_date}
                            onChange={(event) =>
                              updateCoverage(index, { effective_date: event.target.value })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <FieldLabel>Expires</FieldLabel>
                          <Input
                            type="date"
                            value={row.expiration_date}
                            onChange={(event) =>
                              updateCoverage(index, { expiration_date: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <label className="flex flex-col gap-1">
                <FieldLabel>Reviewer note (optional)</FieldLabel>
                <Input
                  value={notes}
                  placeholder="Recorded on the queue item for the audit trail"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>

              {actionError ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {actionError}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
                <Button
                  onClick={approve}
                  disabled={submitting || coverageRows.length === 0}
                  className="sm:flex-1"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="size-4" aria-hidden="true" />
                  )}
                  Approve &amp; Link
                </Button>
                <Select
                  value={reason}
                  onValueChange={(value) => setReason(value as RejectionReason)}
                >
                  <SelectTrigger className="sm:w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_REASONS.map((code) => (
                      <SelectItem key={code} value={code}>
                        {rejectionCopy[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="destructive" onClick={reject} disabled={submitting}>
                  <XCircle className="size-4" aria-hidden="true" />
                  Reject file
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
