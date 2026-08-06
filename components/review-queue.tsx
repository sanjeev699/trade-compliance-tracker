'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  Eye
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { type ReviewQueueItem, type ReviewQueueResponse, type ReviewType } from '@/lib/types/review'
import { VendorInspectDrawer } from '@/components/vendor-inspect-drawer'

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
  INVALID_DOCUMENT_FORMAT: {
    label: 'Validation Failed',
    detail: 'OCR could not detect standard ACORD 25 structural headers.',
  },
  ENTITY_MISMATCH: {
    label: 'Entity Mismatch',
    detail: 'Insured name on document does not match the vendor name.',
  },
}

export function VendorFetchWrapper({ vendorId, onOpenChange, onSaved }: { vendorId: string, onOpenChange: (open: boolean) => void, onSaved: () => void }) {
  const [vendor, setVendor] = useState<any>(null)
  
  useEffect(() => {
    async function fetchVendor() {
      try {
        const response = await fetch(`/api/vendors?vendor_id=${vendorId}`)
        if (response.ok) {
          const data = await response.json()
          // API returns an array, so get the first item
          setVendor(Array.isArray(data) ? data[0] : data)
        }
      } catch (err) {
        console.error('Failed to fetch vendor', err)
      }
    }
    void fetchVendor()
  }, [vendorId])

  if (!vendor) return null

  return (
    <VendorInspectDrawer 
      vendor={vendor} 
      open={true} 
      onOpenChange={onOpenChange} 
      onUpdateVendor={setVendor}
      onSaved={onSaved}
    />
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
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const response = await fetch('/api/review-queue', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load review queue')
      const payload = (await response.json()) as any
      const queueItems = Array.isArray(payload) ? payload : (payload.items || [])
      console.log('Review Queue Items:', queueItems)
      setItems(queueItems)
    } catch (error: unknown) {
      setFetchError(error instanceof Error ? error.message : 'Unable to load review queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    const handleUpdate = () => {
      void load()
      onResolved?.()
    }
    window.addEventListener('review-queue-updated', handleUpdate)
    return () => window.removeEventListener('review-queue-updated', handleUpdate)
  }, [load, onResolved])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-16 text-sm text-muted-foreground justify-center">
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
    <>
      <Card>
        <CardHeader className="pb-2 border-b">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Inbox className="size-4" aria-hidden="true" />
            Pending items
            <Badge variant="secondary">
              {items.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-[250px]">Subcontractor</TableHead>
                <TableHead>Date Flagged</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-[300px]">Warning Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const reviewType = item.review_type === 'MANUAL_OVERRIDE' && item.details?.type ? (item.details.type as ReviewType) : item.review_type;
                const flagDetails = flagCopy[reviewType] || { label: reviewType, detail: '' };
                const reasonText = (item.details?.reason as string) || item.notes || flagDetails.detail;
                
                return (
                  <TableRow key={item.review_id} className="group hover:bg-slate-50/50">
                    <TableCell className="font-medium align-top py-3">
                      <div className="flex flex-col gap-1">
                        <span className="truncate max-w-[200px]" title={item.document?.extracted_data?.vendor_name ?? item.document?.company_name ?? 'Unassigned Vendor'}>
                          {item.vendor?.company_name ?? item.document?.extracted_data?.vendor_name ?? item.document?.company_name ?? 'Unassigned Vendor'}
                        </span>
                        {item.vendor?.sc_id && (
                          <Badge variant="secondary" className="w-fit text-[10px] h-5">{item.vendor.sc_id}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-3 text-sm text-slate-600">
                      {formatDate(item.created_at)}
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-50 text-amber-800 flex items-center gap-1 w-fit">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        {flagDetails.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <div className="text-xs text-slate-700 max-w-md line-clamp-2" title={reasonText}>
                        {reasonText}
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top py-3">
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => setSelectedVendorId(item.vendor_id || item.vendor?.vendor_id || null)}
                        disabled={!item.vendor_id && !item.vendor?.vendor_id}
                      >
                        <Eye className="size-3 mr-1.5" />
                        Inspect & Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {selectedVendorId && (
        <VendorFetchWrapper 
          vendorId={selectedVendorId} 
          onOpenChange={(open) => !open && setSelectedVendorId(null)} 
          onSaved={() => {
            void load();
            onResolved?.();
          }}
        />
      )}
    </>
  )
}
