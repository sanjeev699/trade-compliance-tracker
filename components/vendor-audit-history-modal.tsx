'use client'

import { useEffect, useState } from 'react'
import { Loader2, ScrollText, User2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import type { AuditLog } from '@/components/audit-log-workspace'

interface Props {
  vendorId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VendorAuditHistoryModal({ vendorId, open, onOpenChange }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && vendorId) {
      setLoading(true)
      fetch(`/api/audit?vendor_id=${vendorId}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && data.logs) setLogs(data.logs)
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [open, vendorId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-muted/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="size-5 text-muted-foreground" />
            Audit History
          </DialogTitle>
          <DialogDescription>
            Immutable ledger of all compliance overrides and verification actions for this vendor.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2 mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-6 animate-spin mb-2" />
              <span className="text-sm">Fetching immutable logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No audit records found for this vendor.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="relative pl-6 pb-6 border-l border-border last:border-0 last:pb-0">
                <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-border border-2 border-background" />
                <div className="flex flex-col bg-background border border-border rounded-md p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <User2 className="size-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{log.actor_name}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {log.actor_role}
                      </span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-xs font-mono text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-xs font-mono mb-3 text-foreground/80 pb-3 border-b border-border/50">
                    <span className="font-semibold mr-2 text-foreground">
                      {log.action_type === 'INSURANCE_POLICY_UPDATE' ? '🏥 Insurance:' : '📄 Docs/Safety:'}
                    </span>
                    {log.action_details}
                  </div>
                  
                  <div className="text-sm text-foreground/90 leading-relaxed bg-muted/30 rounded p-3 italic">
                    "{log.manager_note}"
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
