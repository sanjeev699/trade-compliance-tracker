'use client'

import { useEffect, useState } from 'react'
import { Download, Search, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

export interface AuditLog {
  id: string
  vendor_id: string
  actor_name: string
  actor_role: string
  action_type: string
  action_details: string
  manager_note: string
  created_at: string
  vendors: {
    sc_id: string
    company_name: string
  }
}

export function AuditLogWorkspace() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true)
      try {
        const response = await fetch('/api/audit')
        if (response.ok) {
          const data = await response.json()
          setLogs(data.logs || [])
        }
      } catch (err) {
        console.error('Error fetching logs', err)
      } finally {
        setLoading(false)
      }
    }
    void fetchLogs()
  }, [])

  const filteredLogs = logs.filter((log) => {
    const searchString = query.toLowerCase()
    const matchesSearch = 
      log.action_details.toLowerCase().includes(searchString) ||
      (log.manager_note && log.manager_note.toLowerCase().includes(searchString)) ||
      log.vendors.company_name.toLowerCase().includes(searchString) ||
      log.vendors.sc_id?.toLowerCase().includes(searchString)
    
    // We only have "all" implemented right now, but scope filtering would go here
    return matchesSearch
  })

  const exportPDF = () => {
    const doc = new jsPDF()
    
    doc.setFontSize(16)
    doc.text('Compliance Audit Log', 14, 15)
    
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Generated on: ${new Date().toISOString()}`, 14, 22)
    
    const tableData = filteredLogs.map((log) => [
      formatDate(log.created_at) + ' ' + new Date(log.created_at).toLocaleTimeString(),
      log.vendors?.sc_id || 'N/A',
      log.vendors?.company_name || 'N/A',
      log.actor_name,
      log.action_type === 'INSURANCE_POLICY_UPDATE' ? 'INSURANCE' : log.action_type === 'PROFILE_UPDATE' ? 'PROFILE' : 'DOCS_SAFETY',
      log.action_details,
      log.manager_note || '',
    ])
    
    // @ts-ignore - jspdf-autotable extends jsPDF
    doc.autoTable({
      startY: 30,
      head: [['Date', 'SC ID', 'Company', 'Actor', 'Type', 'Action Details', 'Manager Note']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    })
    
    doc.save(`audit_log_${new Date().getTime()}.pdf`)
  }

  return (
    <Card className="w-full border border-border shadow-sm">
      <CardHeader className="gap-4 px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Global Audit Ledger
          </CardTitle>
          <Button onClick={exportPDF} className="gap-2" variant="default">
            <Download className="size-4" />
            Download PDF Log
          </Button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search actions, vendors, or notes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 pl-9 text-sm"
            />
          </div>
          <Select value={scope} onValueChange={(val) => val && setScope(val)}>
            <SelectTrigger className="h-10 w-full lg:w-48 text-sm">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Records</SelectItem>
              <SelectItem value="master">Master Directory</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="w-full overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow className="border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-transparent">
                  <TableHead className="w-[140px] pl-6">Date & Time</TableHead>
                  <TableHead className="w-[120px]">Vendor SC ID</TableHead>
                  <TableHead className="w-[180px]">Company Name</TableHead>
                  <TableHead className="w-[140px]">Actor</TableHead>
                  <TableHead className="w-[140px]">Action Type</TableHead>
                  <TableHead className="w-[200px]">Action Details</TableHead>
                  <TableHead className="min-w-[250px] pr-6">Manager Audit Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto size-6 animate-spin mb-2" />
                    Loading audit trail...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    No audit records found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/40 text-sm">
                    <TableCell className="pl-6 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-foreground">{formatDate(log.created_at)}</span>
                        <span className="text-[11px] text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs text-muted-foreground pt-3">
                      {log.vendors.sc_id || 'N/A'}
                    </TableCell>
                    <TableCell className="align-top font-semibold text-foreground pt-3">
                      {log.vendors.company_name}
                    </TableCell>
                    <TableCell className="align-top pt-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{log.actor_name}</span>
                        <span className="text-[11px] text-muted-foreground">{log.actor_role}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top pt-3">
                      <span className="text-[11px] font-mono px-2 py-1 bg-muted rounded">
                        {log.action_type === 'INSURANCE_POLICY_UPDATE' ? 'INSURANCE' : log.action_type === 'PROFILE_UPDATE' ? 'PROFILE' : log.action_type === 'ONBOARDING' || log.action_type === 'SUB_ONBOARDING_COMPLETED' || log.action_type === 'SUB_ONBOARDING_INVITE_CREATED' ? 'ONBOARDING' : 'DOCS_SAFETY'}
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-[11px] text-muted-foreground leading-relaxed pt-3 max-w-xs whitespace-pre-wrap break-words">
                      {(() => {
                        try {
                          const parsed = JSON.parse(log.action_details)
                          if (parsed.required_docs) {
                            return `Requested: ${parsed.required_docs.join(', ')}`
                          }
                          return log.action_details
                        } catch {
                          return log.action_details
                        }
                      })()}
                    </TableCell>
                    <TableCell className="pr-6 align-top text-muted-foreground text-xs leading-relaxed max-w-xs whitespace-pre-wrap break-words pt-3">
                      {log.manager_note || log.manager_note}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
