import { useState, useEffect, useMemo, useRef } from 'react'
import Draggable from 'react-draggable'
import { formatCurrency, formatEmrScore, formatDate } from '@/lib/format'
import type { VendorWithCompliance } from '@/lib/types/vendor'
import { AlertTriangle, CheckCircle2, Copy, Eye, FileText, Loader2, Mail, MapPin, Pencil, Save, UploadCloud, Download, Trash2, Plus, XCircle, History, X, ZoomIn, ZoomOut, ClipboardEdit } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { createSupabaseClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from '@/components/ui/button'
import { CoverageType } from '@/lib/compliance/status'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { VendorAuditHistoryModal } from '@/components/vendor-audit-history-modal'
import { cn } from '@/lib/utils'
import type { AuditLog } from '@/components/audit-log-workspace'
import { toast } from 'sonner'

interface Props {
  vendor: VendorWithCompliance | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
  onSaved?: () => void
  onUpdateVendor?: (vendor: VendorWithCompliance, auditNote?: string) => void
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-4 border-b border-border last:border-0">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm text-foreground uppercase tracking-wider">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function DataRow({ label, value, subtext }: { label: string; value: React.ReactNode; subtext?: string }) {
  if (value === null) return null;
  return (
    <div className="flex justify-between items-start gap-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {subtext && <span className="text-xs text-muted-foreground">{subtext}</span>}
      </div>
      <div className="text-sm text-right">{value}</div>
    </div>
  )
}

function CheckRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      {checked ? (
        <CheckCircle2 className="size-4 text-emerald-500" />
      ) : (
        <XCircle className="size-4 text-muted-foreground/30" />
      )}
    </div>
  )
}

function InlineAuditHistory({ logs }: { logs: AuditLog[] }) {
  const [expanded, setExpanded] = useState(false)
  
  if (logs.length === 0) {
    return <div className="text-xs text-muted-foreground italic mt-2 px-3">No past audit notes found.</div>
  }
  
  return (
    <div className="mt-2 text-xs flex flex-col gap-2">
      <button 
        className="flex items-center gap-1 text-primary hover:underline self-start px-2 py-1 bg-muted/30 rounded"
        onClick={() => setExpanded(!expanded)}
      >
        <History className="size-3" />
        {expanded ? 'Hide Past Notes' : `View Past Notes (${logs.length})`}
      </button>
      
      {expanded && (
        <div className="flex flex-col gap-3 pl-3 border-l-2 border-border mt-1">
          {logs.slice(0, 5).map(log => (
            <div key={log.id} className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground/80">{log.actor_name}</span>
                <span>
                  {new Date(log.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                  })}
                </span>
              </div>
              <div className="text-muted-foreground leading-relaxed">
                {log.manager_note || 'No note provided.'}
              </div>
            </div>
          ))}
          {logs.length > 5 && (
             <div className="text-[10px] text-muted-foreground italic">
               + {logs.length - 5} more earlier logs
             </div>
          )}
        </div>
      )}
    </div>
  )
}

const findPolicy = (vendor: any, ...types: string[]) => {
  if (!vendor?.policy_lines) return undefined;
  return vendor.policy_lines.find((p: any) => 
    types.some(t => p.coverage_type?.toUpperCase() === t.toUpperCase())
  );
};

export function VendorInspectDrawer({ vendor, open, onOpenChange, onDeleted, onSaved, onUpdateVendor }: Props) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingDocs, setIsSavingDocs] = useState(false)
  const [isSavingInsurance, setIsSavingInsurance] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null)
  const [activePreviewTitle, setActivePreviewTitle] = useState<string>('')
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  const [isInsuranceModalOpen, setIsInsuranceModalOpen] = useState(false)
  const [pdfZoom, setPdfZoom] = useState(100)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragNodeRef = useRef<HTMLDivElement>(null)
  const uploadTargetRef = useRef<{docType: string, prefix: string} | null>(null)
  const [isUploadingCoi, setIsUploadingCoi] = useState(false)
  const [isDeletingDoc, setIsDeletingDoc] = useState<string | null>(null)
  
  const [docsSaved, setDocsSaved] = useState(false)
  const [insuranceSaved, setInsuranceSaved] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileTrade, setProfileTrade] = useState('')
  const [profileEin, setProfileEin] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileAddressStreet, setProfileAddressStreet] = useState('')
  const [profileAddressZip, setProfileAddressZip] = useState('')

  // Document Upload & Match State
  const [isUpdatingAnyway, setIsUpdatingAnyway] = useState(false)
  const [activeUploadDocType, setActiveUploadDocType] = useState<string | null>(null)
  const [matchWarning, setMatchWarning] = useState<{
    show: boolean
    docType: string
    publicUrl: string
    extractedName: string | null
    extractedAddress: string | null
    fileName: string
    mimeType: string
  } | null>(null)

  // Docs & Safety State
  const [w9Status, setW9Status] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING')
  const [msaStatus, setMsaStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING')
  const [emrStatus, setEmrStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING')
  const [oshaStatus, setOshaStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING')
  const [emrScore, setEmrScore] = useState<string>('')
  const [docsManagerNote, setDocsManagerNote] = useState('')


  // Document Micro-Commit State
  const [rejectDocModal, setRejectDocModal] = useState<{ isOpen: boolean, type: 'W9' | 'MSA' | 'EMR' | 'OSHA' | null, reason: string }>({ isOpen: false, type: null, reason: '' })
  
  const prevVendorIdRef = useRef<string | null>(null)
  
  const handleDocMicroCommit = async (docType: 'w9' | 'msa' | 'emr' | 'osha', status: 'PENDING' | 'VERIFIED' | 'REJECTED', reason: string = '') => {
    if (!vendor) return;
    
    // Optimistic UI update
    if (docType === 'w9') setW9Status(status);
    if (docType === 'msa') setMsaStatus(status);
    if (docType === 'emr') setEmrStatus(status);
    if (docType === 'osha') setOshaStatus(status);
    
    const payload: any = { vendor_id: vendor.vendor_id };
    payload[`${docType}_status`] = status;
    if (status === 'REJECTED') {
      payload[`${docType}_rejection_reason`] = reason;
    }
    
    payload.action_type = 'DOCS_SAFETY_UPDATE';
    payload.action_details = `${docType.toUpperCase()} marked as ${status}`;
    
    try {
      const res = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        if (data.audit_log) {
          setAuditLogs(prev => [data.audit_log, ...prev]);
        }
        if (onUpdateVendor) onUpdateVendor({ ...(data.vendor || vendor), audit_logs: [data.audit_log, ...(auditLogs || [])] } as any, '');
      }
    } catch (err) {
      console.error('Failed to micro-commit', err);
    }
  };

  // Insurance Editing State
  const [isEditingInsurance, setIsEditingInsurance] = useState(false)
  const [insuranceNote, setInsuranceNote] = useState('')

  // Document Deletion State
  const [docToDelete, setDocToDelete] = useState<{ id?: string, type?: string, url: string, name: string } | null>(null)

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])

  // Baselines to allow instant reset after save (before parent re-fetches)
  const [baselineDocs, setBaselineDocs] = useState({ w9: '', msa: '', emr: '' })
  
  const [formData, setFormData] = useState({
    cgl_limit: '',
    cgl_exp: '',
    cgl_status: 'NOT_PROVIDED',
    auto_limit: '',
    auto_exp: '',
    auto_status: 'NOT_PROVIDED',
    wc_limit: '',
    wc_exp: '',
    wc_status: 'NOT_PROVIDED',
    umbrella_limit: '',
    umbrella_exp: '',
    umbrella_status: 'NOT_PROVIDED',
    cgl_rejection_reason: '',
    auto_rejection_reason: '',
    wc_rejection_reason: '',
    umbrella_rejection_reason: '',
    coi_status: 'PENDING'
  })
  const [baselineInsurance, setBaselineInsurance] = useState(formData)
  
  const [rejectingPolicyKey, setRejectingPolicyKey] = useState<keyof typeof formData | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  
  const [coiStatus, setCoiStatus] = useState<string>('PENDING')

  const getDocument = (type: 'W9' | 'MSA' | 'OSHA' | 'COI' | 'EMR') => {
    if (!vendor) return null;
    if (vendor.documents) {
      if (type === 'W9') {
        const doc = vendor.documents.find(d => d.doc_type === 'W-9' || d.doc_type === 'W9');
        if (doc) return { url: doc.file_url, name: doc.original_filename || getDocumentFilename(doc.file_url || ''), id: (doc as any).id };
      }
      if (type === 'MSA') {
        const doc = vendor.documents.find(d => d.doc_type === 'MSA' || d.doc_type === 'Master Subcontractor Agreement (MSA)');
        if (doc) return { url: doc.file_url, name: doc.original_filename || getDocumentFilename(doc.file_url || ''), id: (doc as any).id };
      }
      if (type === 'OSHA') {
        const doc = vendor.documents.find(d => d.doc_type === 'OSHA' || d.doc_type === 'OSHA 300 Log');
        if (doc) return { url: doc.file_url, name: doc.original_filename || getDocumentFilename(doc.file_url || ''), id: (doc as any).id };
      }
    }
    if (type === 'W9' && vendor.w9_file_url) return { url: vendor.w9_file_url, name: getDocumentFilename(vendor.w9_file_url) };
    if (type === 'MSA' && vendor.msa_file_url) return { url: vendor.msa_file_url, name: getDocumentFilename(vendor.msa_file_url) };
    if (type === 'OSHA' && vendor.osha_file_url) return { url: vendor.osha_file_url, name: getDocumentFilename(vendor.osha_file_url) };
    return null;
  }

  const handleDeleteDocument = async () => {
    if (!docToDelete) return;
    try {
      setIsDeletingDoc(docToDelete.id || docToDelete.type || 'deleting')
      if (docToDelete.id) {
        const res = await fetch(`/api/documents/${docToDelete.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete document')
      } else if (docToDelete.type && vendor?.vendor_id) {
        const res = await fetch(`/api/vendors/${vendor.vendor_id}/documents?type=${docToDelete.type}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(`Failed to delete ${docToDelete.type}`)
      }
      toast.success("Document deleted successfully")
      
      if (onUpdateVendor && vendor) {
        try {
          const freshRes = await fetch(`/api/vendors?id=${vendor.vendor_id}`)
          if (freshRes.ok) {
            const freshData = await freshRes.json()
            if (freshData.vendors && freshData.vendors.length > 0) {
              onUpdateVendor(freshData.vendors[0])
              return
            }
          }
        } catch (e) {
          // Fallback to manual update if fetch fails
        }
        let updatedVendor = { ...vendor }
        if (docToDelete.id) {
          updatedVendor.documents = vendor.documents?.filter((d: any) => d.id !== docToDelete.id)
          updatedVendor.policy_lines = vendor.policy_lines?.filter((p: any) => p.document_id !== docToDelete.id)
          if (updatedVendor.w9_file_url === docToDelete.url) { updatedVendor.w9_file_url = null; updatedVendor.w9_status = 'PENDING' }
          if (updatedVendor.msa_file_url === docToDelete.url) { updatedVendor.msa_file_url = null; updatedVendor.msa_status = 'PENDING' }
          if (updatedVendor.osha_file_url === docToDelete.url) { updatedVendor.osha_file_url = null }
          if (updatedVendor.acord25_url === docToDelete.url) { updatedVendor.acord25_url = null; updatedVendor.coi_status = 'PENDING' }
        } else if (docToDelete.type) {
          if (docToDelete.type === 'W9') {
            updatedVendor.w9_file_url = null
            updatedVendor.w9_status = 'PENDING'
          } else if (docToDelete.type === 'MSA') {
            updatedVendor.msa_file_url = null
            updatedVendor.msa_status = 'PENDING'
          } else if (docToDelete.type === 'COI') {
            updatedVendor.acord25_url = null
            updatedVendor.coi_status = 'PENDING'
            updatedVendor.policy_lines = []
          }
        }
        onUpdateVendor(updatedVendor)
      }

      if (onSaved) onSaved()
    } catch (e) {
      console.error(e)
      toast.error("Failed to delete document")
    } finally {
      setIsDeletingDoc(null)
      setDocToDelete(null)
    }
  }

  useEffect(() => {
    setActivePreviewUrl(null)
    setPdfZoom(100)
    
    if (!open) {
      // When the drawer closes, reset the prevVendorIdRef so next time it opens
      // (even for the same vendor), it correctly resets the edit modes.
      prevVendorIdRef.current = null
      setIsEditingProfile(false)
      setIsEditingInsurance(false)
    }
  }, [vendor?.vendor_id, open])

  useEffect(() => {
    if (vendor && open) {
      // Profile
      if (vendor.vendor_id !== prevVendorIdRef.current) {
        setIsEditingProfile(false)
        setIsEditingInsurance(false)
        prevVendorIdRef.current = vendor.vendor_id
      }
      setProfileName(vendor.company_name)
      setProfileTrade(vendor.trade_specialty)
      setProfileEin(vendor.tax_id_ein || '')
      setProfileEmail(vendor.primary_email || '')
      setProfilePhone(vendor.phone_number || '')
      setProfileAddressStreet(vendor.address_street || '')
      setProfileAddressZip(vendor.address_zip || '')

      // Docs & Safety
      const hasW9File = !!(vendor.w9_file_url || vendor.documents?.some((d: any) => d.doc_type === 'W-9' || d.doc_type === 'W9'));
      setW9Status(vendor.w9_status === 'VERIFIED' && !hasW9File ? 'PENDING' : (vendor.w9_status || 'PENDING'))
      const hasMsaFile = !!(vendor.msa_file_url || vendor.documents?.some((d: any) => d.doc_type === 'MSA' || d.doc_type === 'Master Subcontractor Agreement (MSA)'));
      setMsaStatus(vendor.msa_status === 'VERIFIED' && !hasMsaFile ? 'PENDING' : (vendor.msa_status || 'PENDING'))
      setEmrStatus((vendor as any).emr_status || 'PENDING')
      setOshaStatus((vendor as any).osha_status || 'PENDING')
      const emrVal = vendor.emr_score != null ? vendor.emr_score.toString() : ''
      setEmrScore(emrVal)
      setDocsManagerNote('')
      
      setBaselineDocs({
        w9: vendor.w9_status,
        msa: vendor.msa_status,
        emr: emrVal
      })

      // Insurance
      setIsEditingInsurance(false)
      setInsuranceNote('')
      
      const glPol = findPolicy(vendor, 'GL', 'GENERAL_LIABILITY', 'CGL');
      const autoPol = findPolicy(vendor, 'AUTO', 'AUTOMOBILE', 'AL', 'AUTO_LIABILITY');
      const wcPol = findPolicy(vendor, 'WORKERS_COMP', 'WORKERS_COMPENSATION', 'WC');
      const umbPol = findPolicy(vendor, 'UMBRELLA', 'COMMERCIAL_UMBRELLA', 'CU', 'EXCESS');

      const newFormData = {
        cgl_limit: glPol?.limit_amount ? glPol.limit_amount.toString() : (glPol?.effective_limit_amount ? glPol.effective_limit_amount.toString() : ''),
        cgl_exp: glPol?.expiration_date || '',
        cgl_status: glPol?.status || (glPol ? 'APPROVED' : 'NOT_PROVIDED'),
        auto_limit: autoPol?.limit_amount ? autoPol.limit_amount.toString() : (autoPol?.effective_limit_amount ? autoPol.effective_limit_amount.toString() : ''),
        auto_exp: autoPol?.expiration_date || '',
        auto_status: autoPol?.status || (autoPol ? 'APPROVED' : 'NOT_PROVIDED'),
        wc_limit: wcPol?.limit_amount ? wcPol.limit_amount.toString() : (wcPol?.effective_limit_amount ? wcPol.effective_limit_amount.toString() : ''),
        wc_exp: wcPol?.expiration_date || '',
        wc_status: wcPol?.status || (wcPol ? 'APPROVED' : 'NOT_PROVIDED'),
        umbrella_limit: umbPol?.limit_amount ? umbPol.limit_amount.toString() : (umbPol?.effective_limit_amount ? umbPol.effective_limit_amount.toString() : ''),
        umbrella_exp: umbPol?.expiration_date || '',
        umbrella_status: umbPol?.status || (umbPol ? 'APPROVED' : 'NOT_PROVIDED'),
        cgl_rejection_reason: glPol?.rejection_reason || '',
        auto_rejection_reason: autoPol?.rejection_reason || '',
        wc_rejection_reason: wcPol?.rejection_reason || '',
        umbrella_rejection_reason: umbPol?.rejection_reason || '',
        coi_status: vendor?.coi_status || 'PENDING'
      }
      
      setFormData(newFormData)
      setBaselineInsurance(newFormData)
      setCoiStatus(vendor.coi_status || 'PENDING')

      // Fetch Logs safely
      const fetchAuditLogs = async () => {
        try {
          const res = await fetch(`/api/audit?vendor_id=${vendor.vendor_id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data && data.logs) {
            setAuditLogs(currentLogs => {
              if (currentLogs.length > data.logs.length) {
                console.log('🛡️ GUARD BLOCKED STALE OVERWRITE:', currentLogs.length, 'vs incoming:', data.logs.length);
                return currentLogs;
              }
              return data.logs;
            });
          }
        } catch (err) {
          console.error('Failed to fetch audit logs:', err);
        }
      };
      fetchAuditLogs();

      setDocsSaved(false)
      setInsuranceSaved(false)
      setProfileSaved(false)
    }
  }, [vendor, open])

  // Computed dirty states
  const isProfileDirty = vendor ? (
    profileName !== vendor.company_name ||
    profileTrade !== vendor.trade_specialty ||
    profileEin !== (vendor.tax_id_ein || '') ||
    profileEmail !== (vendor.primary_email || '') ||
    profilePhone !== (vendor.phone_number || '') ||
    profileAddressStreet !== (vendor.address_street || '') ||
    profileAddressZip !== (vendor.address_zip || '')
  ) : false

  const isDocsDirty = false; // Docs now use micro-commits

  const isInsuranceDirty = useMemo(() => {
    if (!vendor) return false
    return (
      formData.cgl_limit !== baselineInsurance.cgl_limit ||
      formData.cgl_exp !== baselineInsurance.cgl_exp ||
      formData.cgl_status !== baselineInsurance.cgl_status ||
      formData.auto_limit !== baselineInsurance.auto_limit ||
      formData.auto_exp !== baselineInsurance.auto_exp ||
      formData.auto_status !== baselineInsurance.auto_status ||
      formData.wc_limit !== baselineInsurance.wc_limit ||
      formData.wc_exp !== baselineInsurance.wc_exp ||
      formData.wc_status !== baselineInsurance.wc_status ||
      formData.umbrella_limit !== baselineInsurance.umbrella_limit ||
      formData.umbrella_exp !== baselineInsurance.umbrella_exp ||
      formData.umbrella_status !== baselineInsurance.umbrella_status ||
      coiStatus !== (vendor?.coi_status || 'PENDING')
    )
  }, [vendor, formData, baselineInsurance, coiStatus])

  const issuesList = useMemo(() => {
    if (!vendor) return []
    const list: string[] = []
    
    const hasW9 = vendor.w9_file_url || vendor.documents?.some((d: any) => d.doc_type === 'W-9' || d.doc_type === 'W9')
    if (vendor.w9_status === 'REJECTED') list.push(`W-9: Rejected - ${(vendor as any).w9_rejection_reason || 'See details'}`)
    else if (hasW9 && vendor.w9_status !== 'VERIFIED') list.push('W-9: Pending Manual Review')
    else if (!hasW9) list.push('W-9: Not Provided')

    const hasMsa = vendor.msa_file_url || vendor.documents?.some((d: any) => d.doc_type === 'MSA' || d.doc_type === 'Master Subcontractor Agreement (MSA)')
    if (vendor.msa_status === 'REJECTED') list.push(`MSA: Rejected - ${(vendor as any).msa_rejection_reason || 'See details'}`)
    else if (hasMsa && vendor.msa_status !== 'VERIFIED') list.push('MSA: Pending Manual Review')
    else if (!hasMsa) list.push('MSA: Not Provided')

    if ((vendor as any).emr_status === 'REJECTED') list.push(`EMR: Rejected - ${(vendor as any).emr_rejection_reason || 'See details'}`)
    else if (vendor.emr_score != null) {
      if (Number(vendor.emr_score) > 1.15) list.push(`EMR: ${vendor.emr_score} (Failed - Above Threshold)`)
      else if (Number(vendor.emr_score) > 1.0) list.push(`EMR: ${vendor.emr_score} (Needs Review - Elevated)`)
      else if (!(vendor as any).emr_file_url && !vendor.documents?.some((d: any) => d.doc_type === 'EMR')) list.push('EMR: Verification Document Missing')
    } else {
      list.push('EMR Score: Not Done Yet')
    }

    if ((vendor as any).osha_status === 'REJECTED') list.push(`OSHA: Rejected - ${(vendor as any).osha_rejection_reason || 'See details'}`)
    else if (!vendor.osha_file_url) list.push('OSHA 300: Not Provided')

    if (vendor.compliance?.coverages) {
      vendor.compliance.coverages.forEach((cov: any) => {
        let label = cov.coverage_type
        if (cov.coverage_type === 'GL') label = 'CGL'
        else if (cov.coverage_type === 'AUTO') label = 'Auto'
        else if (cov.coverage_type === 'WORKERS_COMP') label = 'WC'
        else if (cov.coverage_type === 'UMBRELLA') label = 'Umbrella'

        if (!cov.policy || !cov.policy.expiration_date) {
           list.push(`${label} Policy: Missing`)
        } else {
           if (cov.policy.status === 'REJECTED') {
             list.push(`${label} Policy Rejected${cov.policy.rejection_reason ? `: ${cov.policy.rejection_reason}` : ''}`)
           }
           const now = new Date()
           const expDate = new Date(cov.policy.expiration_date)
           const daysDiff = (expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)
           const formattedDt = expDate.toLocaleDateString()
           if (daysDiff < 0) list.push(`${label}: Expired on ${formattedDt} — Renewal COI Required`)
           else if (daysDiff <= 30) list.push(`${label}: Expires in ${Math.ceil(daysDiff)} days on ${formattedDt}`)
        }
      })
    } else if (vendor.compliance?.status === 'MISSING_DOCUMENT') {
      list.push('COI Document: Missing')
    }

    if (vendor.documents && Array.isArray(vendor.documents)) {
      vendor.documents.forEach((doc: any) => {
        if (doc.extraction_status === 'REVIEW_REQUIRED' && Array.isArray(doc.review_queue_items)) {
          doc.review_queue_items.forEach((item: any) => {
            if (item.review_type === 'MISSING_POLICY_DATA') return // Redundant with 'Policy: Missing' check above
            list.push(`Flag: ${item.details?.reason || item.review_type}`)
          })
        } else if (doc.extraction_status === 'REVIEW_REQUIRED') {
           list.push(`Flag: ${doc.extraction_notes || "Invalid ACORD 25 format. Manual verification required."}`)
        }
      })
    }
    
    return list
  }, [vendor])

  const actionableIssues = useMemo(() => {
    return issuesList.filter(issue => 
      !issue.includes('Pending Manual Review') && 
      !issue.includes('EMR Score: Not Done Yet') && 
      !issue.includes('Needs Review') && 
      !issue.includes('AI Flag:')
    )
  }, [issuesList])

  const hasUnsavedChanges = isProfileDirty || isDocsDirty || isInsuranceDirty

  useEffect(() => {
    setActiveUploadDocType(null)
    setIsUploadingCoi(false)
    uploadTargetRef.current = null
    setMatchWarning({ show: false, docType: '', publicUrl: '', extractedName: '', extractedAddress: '', fileName: '', mimeType: '' })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [open, vendor?.vendor_id])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges) {
      if (isDocsDirty || isProfileDirty) {
        setIsNoteModalOpen(true)
        return
      }
      if (isInsuranceDirty) {
        setIsInsuranceModalOpen(true)
        return
      }
    }
    onOpenChange(newOpen)
  }

  if (!vendor) return null

  const handleUploadCoi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !vendor) return
    setIsUploadingCoi(true)
    try {
      const supabase = createSupabaseClient()
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const ext = isPdf ? 'pdf' : (file.name.split('.').pop() ?? 'pdf')
      const filePath = `coi/${vendor.vendor_id}-${Date.now()}.${ext}`
      
      const { data, error } = await supabase.storage
        .from('certificates')
        .upload(filePath, file, { contentType: file.type })
        
      if (error) throw new Error(error.message)
      
      const { data: { publicUrl } } = supabase.storage.from('certificates').getPublicUrl(data.path)
      
      const res = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendor.vendor_id,
          acord25_url: publicUrl,
          action_type: 'INSURANCE_POLICY_UPDATE',
          action_details: 'ACORD 25 COI document uploaded manually'
        })
      })
      if (!res.ok) throw new Error('Failed to update vendor record')

      const docRes = await fetch('/api/parse-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: publicUrl,
          mimeType: file.type,
          originalFilename: file.name,
          vendor_id: vendor.vendor_id
        })
      })
      if (!docRes.ok) {
        const text = await docRes.text()
        let errorMsg = 'Failed to parse document record'
        try {
          const body = JSON.parse(text)
          if (body.error) errorMsg = body.error
        } catch {
          errorMsg = text || errorMsg
        }
        throw new Error(errorMsg)
      }
      
      toast.success('COI uploaded successfully')
      
      if (onUpdateVendor) {
        try {
          const freshRes = await fetch(`/api/vendors?id=${vendor.vendor_id}`)
          if (freshRes.ok) {
            const freshData = await freshRes.json()
            if (freshData.vendors && freshData.vendors.length > 0) {
              onUpdateVendor(freshData.vendors[0])
            } else {
              onUpdateVendor({ ...vendor, acord25_url: publicUrl } as any)
            }
          }
        } catch (e) {
          onUpdateVendor({ ...vendor, acord25_url: publicUrl } as any)
        }
      }
      if (onSaved) onSaved()
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload COI')
    } finally {
      setIsUploadingCoi(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>, docType: string, actionDetailPrefix: string) => {
    const file = e.target.files?.[0]
    if (!file || !vendor) return
    setActiveUploadDocType(docType)
    try {
      const supabase = createSupabaseClient()
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const ext = isPdf ? 'pdf' : (file.name.split('.').pop() ?? 'pdf')
      const filePath = `${docType.toLowerCase()}/${vendor.vendor_id}-${Date.now()}.${ext}`
      
      const { data, error } = await supabase.storage
        .from('certificates')
        .upload(filePath, file, { contentType: file.type })
        
      if (error) throw new Error(error.message)
      
      const { data: { publicUrl } } = supabase.storage.from('certificates').getPublicUrl(data.path)
      
      const extractRes = await fetch('/api/extract-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: publicUrl, mimeType: file.type, originalFilename: file.name })
      })
      
      if (extractRes.ok) {
        const { vendor_name, address_street } = await extractRes.json()
        
        const safeLower = (s: string | null | undefined) => (s || '').toLowerCase().trim()
        const vendorNameMatch = safeLower(vendor.company_name)
        const extractedNameMatch = safeLower(vendor_name)
        
        const isNameMatch = !extractedNameMatch || vendorNameMatch.includes(extractedNameMatch) || extractedNameMatch.includes(vendorNameMatch)
        const isAddressMatch = !address_street || !vendor.address_street || safeLower(vendor.address_street).includes(safeLower(address_street).split(' ')[0])
        
        if (!isNameMatch || !isAddressMatch) {
          setMatchWarning({
            show: true,
            docType,
            publicUrl,
            extractedName: vendor_name,
            extractedAddress: address_street,
            fileName: actionDetailPrefix,
            mimeType: file.type
          })
          return
        }
      }

      const fieldUpdate = await commitDocumentUpdate(docType, publicUrl, actionDetailPrefix)
      if (!fieldUpdate) throw new Error('Document update failed')
      
      if (docType === 'COI') {
        const docRes = await fetch('/api/parse-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileUrl: publicUrl,
            mimeType: file.type,
            originalFilename: file.name,
            vendor_id: vendor.vendor_id
          })
        })
        if (!docRes.ok) {
          const text = await docRes.text()
          let errorMsg = 'Failed to parse document record'
          try {
            const body = JSON.parse(text)
            if (body.error) errorMsg = body.error
          } catch {
            errorMsg = text || errorMsg
          }
          throw new Error(errorMsg)
        }
      } else {
        const docRes = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor_id: vendor.vendor_id,
            file_url: publicUrl,
            doc_type: docType,
            original_filename: file.name,
            mime_type: file.type
          })
        })
        if (!docRes.ok) throw new Error('Failed to create document record')
      }

      if (onUpdateVendor && vendor) {
        try {
          const freshRes = await fetch(`/api/vendors?id=${vendor.vendor_id}`)
          if (freshRes.ok) {
            const freshData = await freshRes.json()
            if (freshData.vendors && freshData.vendors.length > 0) {
              onUpdateVendor(freshData.vendors[0])
            } else {
              onUpdateVendor({ ...vendor, ...fieldUpdate } as any)
            }
          }
        } catch (e) {
          onUpdateVendor({ ...vendor, ...fieldUpdate } as any)
        }
      }
      if (onSaved) onSaved()
      
    } catch (err: any) {
      toast.error(err.message || `Failed to upload ${actionDetailPrefix}`)
    } finally {
      setActiveUploadDocType(null)
      if (e.target) e.target.value = ''
    }
  }

  const commitDocumentUpdate = async (docType: string, publicUrl: string, actionDetailPrefix: string) => {
    try {
      let fieldUpdate = {}
      if (docType === 'COI') fieldUpdate = { acord25_url: publicUrl }
      else if (docType === 'W9' || docType === 'W-9') fieldUpdate = { w9_file_url: publicUrl }
      else if (docType === 'MSA') fieldUpdate = { msa_file_url: publicUrl }
      else if (docType === 'OSHA') fieldUpdate = { osha_file_url: publicUrl }

      const res = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendor?.vendor_id,
          ...fieldUpdate,
          action_type: docType === 'COI' ? 'INSURANCE_POLICY_UPDATE' : 'DOCS_SAFETY_UPDATE',
          action_details: `${actionDetailPrefix} document uploaded`
        })
      })
      if (!res.ok) throw new Error('Failed to update vendor record')
      
      const data = await res.json()
      if (data.audit_log) {
        setAuditLogs(prev => [data.audit_log, ...prev])
      }

      toast.success(`${actionDetailPrefix} uploaded successfully`)
      return fieldUpdate
    } catch (err: any) {
      toast.error(err.message || 'Failed to update vendor')
      return null
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this subcontractor? This action cannot be undone.')) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.vendor_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete vendor')
      onOpenChange(false)
      if (onDeleted) onDeleted()
    } catch (e) {
      alert('Error deleting vendor')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSaveUnified = async () => {
    if (!docsManagerNote.trim()) {
      alert('Audit Note is required to save verification changes.')
      return
    }

    setIsSavingProfile(true)
    setIsSavingDocs(true)
    try {
      const currentNote = docsManagerNote.trim()
      
      const diffs = []
      if (profileName !== vendor.company_name) diffs.push(`Name: ${vendor.company_name} -> ${profileName}`)
      if (profileTrade !== vendor.trade_specialty) diffs.push(`Trade: ${vendor.trade_specialty} -> ${profileTrade}`)
      if (profileEin !== (vendor.tax_id_ein || '')) diffs.push(`EIN updated`)
      if (profileEmail !== (vendor.primary_email || '')) diffs.push(`Email: ${vendor.primary_email || 'None'} -> ${profileEmail}`)
      if (profilePhone !== (vendor.phone_number || '')) diffs.push(`Phone updated`)
      if (profileAddressStreet !== (vendor.address_street || '')) diffs.push(`Street updated`)
      if (profileAddressZip !== (vendor.address_zip || '')) diffs.push(`Zip updated`)
      
      if (w9Status !== baselineDocs.w9) diffs.push(`W-9: ${baselineDocs.w9} -> ${w9Status}`)
      if (msaStatus !== baselineDocs.msa) diffs.push(`MSA: ${baselineDocs.msa} -> ${msaStatus}`)
      if (emrScore !== baselineDocs.emr) diffs.push(`EMR: ${baselineDocs.emr} -> ${emrScore}`)
      
      const actionDetails = diffs.length > 0 ? diffs.join(', ') : 'Profile / Docs updated'

      const emr = parseFloat(emrScore)
      const res = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendor.vendor_id,
          company_name: profileName,
          trade_specialty: profileTrade,
          tax_id_ein: profileEin || null,
          primary_email: profileEmail,
          phone_number: profilePhone || null,
          address_street: profileAddressStreet || null,
          address_zip: profileAddressZip || null,
          emr_score: !isNaN(emr) ? emr : null,
          audit_note: currentNote,
          action_type: 'PROFILE_UPDATE',
          action_details: actionDetails
        })
      })
      
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update changes')

      if (!data.audit_log) {
        throw new Error('Failed to save note to database!')
      }
      
      let updatedAuditLogs: any[] = [];
      setAuditLogs(prev => {
        updatedAuditLogs = [data.audit_log, ...prev]
        return updatedAuditLogs
      })

      setBaselineDocs({ w9: w9Status, msa: msaStatus, emr: emrScore })
      setDocsSaved(true)
      setProfileSaved(true)
      setTimeout(() => { setDocsSaved(false); setProfileSaved(false); }, 3000)

      if (onUpdateVendor) {
        onUpdateVendor({ ...(data.vendor || vendor), audit_logs: updatedAuditLogs } as any, currentNote)
      }
      if (onSaved) onSaved()
      
      setDocsManagerNote('')
      setIsNoteModalOpen(false)
      setIsEditingProfile(false)
      
      fetch('/api/review-queue/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendor.vendor_id })
      }).then(() => {
        window.dispatchEvent(new Event('review-queue-updated'))
      }).catch(console.error)
      
    } catch (e: any) {
      alert(`Error updating changes: ${e.message}`)
    } finally {
      setIsSavingDocs(false)
      setIsSavingProfile(false)
    }
  }

  const parseAmount = (val: string | number) => typeof val === 'number' ? val : parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;

  const handleSaveInsurance = async () => {
    if (!insuranceNote.trim()) {
      alert('Insurance Audit Note is required to save policy changes.')
      return
    }

    setIsSavingInsurance(true)
    try {
      const updates = vendor.policy_lines.map(p => {
        let rawLimit = ''
        let rawDate = ''
        let rawStatus = p.status || 'APPROVED'
        
        if (p.coverage_type === 'GL') {
          rawLimit = formData.cgl_limit
          rawDate = formData.cgl_exp
          rawStatus = formData.cgl_status as any
        } else if (p.coverage_type === 'AUTO') {
          rawLimit = formData.auto_limit
          rawDate = formData.auto_exp
          rawStatus = formData.auto_status as any
        } else if (p.coverage_type === 'WORKERS_COMP') {
          rawLimit = formData.wc_limit
          rawDate = formData.wc_exp
          rawStatus = formData.wc_status as any
        } else if (p.coverage_type === 'UMBRELLA') {
          rawLimit = formData.umbrella_limit
          rawDate = formData.umbrella_exp
          rawStatus = formData.umbrella_status as any
        }
        
        const limitNum = Number(String(rawLimit).replace(/[^0-9]/g, '')) || 0
        const parsedDate = rawDate ? new Date(rawDate).toISOString() : null

        // Optimistically update local vendor object
        p.limit_amount = limitNum
        if (parsedDate) {
          p.expiration_date = parsedDate
        }
        p.status = rawStatus

        if (p.coverage_type === 'GL') {
          p.rejection_reason = formData.cgl_rejection_reason
        } else if (p.coverage_type === 'AUTO') {
          p.rejection_reason = formData.auto_rejection_reason
        } else if (p.coverage_type === 'WORKERS_COMP') {
          p.rejection_reason = formData.wc_rejection_reason
        } else if (p.coverage_type === 'UMBRELLA') {
          p.rejection_reason = formData.umbrella_rejection_reason
        }

        return {
          policy_id: (p as any).policy_id || p.id,
          limit_amount: limitNum,
          expiration_date: parsedDate,
          status: rawStatus,
          rejection_reason: p.rejection_reason
        }
      })
      
      const currentNote = insuranceNote.trim()
      
      const diffs: string[] = []
      const formatCurr = (val: string | number) => {
        const num = Number(String(val).replace(/[^0-9]/g, '')) || 0
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num)
      }
      const formatDt = (val: string) => {
        if (!val) return 'None'
        const parts = val.split('-')
        if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
        return new Date(val).toLocaleDateString()
      }

      if (formData.cgl_limit !== baselineInsurance.cgl_limit) diffs.push(`CGL Limit: ${formatCurr(baselineInsurance.cgl_limit)} → ${formatCurr(formData.cgl_limit)}`)
      if (formData.cgl_exp !== baselineInsurance.cgl_exp) diffs.push(`CGL Expiration: ${formatDt(baselineInsurance.cgl_exp)} → ${formatDt(formData.cgl_exp)}`)
      if (formData.cgl_status !== baselineInsurance.cgl_status) diffs.push(`CGL Status: ${baselineInsurance.cgl_status} → ${formData.cgl_status}`)
      
      if (formData.auto_limit !== baselineInsurance.auto_limit) diffs.push(`AUTO Limit: ${formatCurr(baselineInsurance.auto_limit)} → ${formatCurr(formData.auto_limit)}`)
      if (formData.auto_exp !== baselineInsurance.auto_exp) diffs.push(`AUTO Expiration: ${formatDt(baselineInsurance.auto_exp)} → ${formatDt(formData.auto_exp)}`)
      if (formData.auto_status !== baselineInsurance.auto_status) diffs.push(`AUTO Status: ${baselineInsurance.auto_status} → ${formData.auto_status}`)
      
      if (formData.wc_limit !== baselineInsurance.wc_limit) diffs.push(`WC Limit: ${formatCurr(baselineInsurance.wc_limit)} → ${formatCurr(formData.wc_limit)}`)
      if (formData.wc_exp !== baselineInsurance.wc_exp) diffs.push(`WC Expiration: ${formatDt(baselineInsurance.wc_exp)} → ${formatDt(formData.wc_exp)}`)
      if (formData.wc_status !== baselineInsurance.wc_status) diffs.push(`WC Status: ${baselineInsurance.wc_status} → ${formData.wc_status}`)
      
      if (formData.umbrella_limit !== baselineInsurance.umbrella_limit) diffs.push(`UMBRELLA Limit: ${formatCurr(baselineInsurance.umbrella_limit)} → ${formatCurr(formData.umbrella_limit)}`)
      if (formData.umbrella_exp !== baselineInsurance.umbrella_exp) diffs.push(`UMBRELLA Expiration: ${formatDt(baselineInsurance.umbrella_exp)} → ${formatDt(formData.umbrella_exp)}`)
      if (formData.umbrella_status !== baselineInsurance.umbrella_status) diffs.push(`UMBRELLA Status: ${baselineInsurance.umbrella_status} → ${formData.umbrella_status}`)

      const actionDetails = diffs.length > 0 ? diffs.join(' | ') : 'Policy verification re-saved (no coverage limit changes)'

      const res = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendor.vendor_id,
          audit_note: currentNote,
          action_type: 'INSURANCE_POLICY_UPDATE',
          action_details: actionDetails,
          policy_updates: updates,
          coi_status: coiStatus
        })
      })
      
      if (!res.ok) {
        let errMsg = 'Failed to update insurance policies'
        try {
          const errData = await res.json()
          if (errData.error) errMsg = errData.error
        } catch (_) {}
        throw new Error(errMsg)
      }
      
      const data = await res.json()
      
      if (!data.audit_log) {
        throw new Error('Failed to save note to database!')
      }
      
      const newLog = data.audit_log
      
      let updatedAuditLogs: any[] = [];
      setAuditLogs(prev => {
        updatedAuditLogs = [newLog, ...prev];
        return updatedAuditLogs;
      });

      setIsEditingInsurance(false)
      setIsInsuranceModalOpen(false)
      setBaselineInsurance(formData)
      setInsuranceSaved(true)
      setTimeout(() => setInsuranceSaved(false), 3000)

      if (onUpdateVendor) {
        onUpdateVendor({ ...(data.vendor || vendor), audit_logs: updatedAuditLogs } as any, currentNote)
      }
      if (onSaved) onSaved()

      setInsuranceNote('')
      toast.success("Insurance policies updated successfully!")
      
      // Auto-resolve any pending queue items for this vendor
      fetch('/api/review-queue/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendor.vendor_id })
      }).catch(console.error)
      
    } catch (e) {
      toast.error(`Failed to update policies: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setIsSavingInsurance(false)
    }
  }

  const gl = findPolicy(vendor, 'GL', 'GENERAL_LIABILITY', 'CGL');
  const auto = findPolicy(vendor, 'AUTO', 'AUTOMOBILE', 'AL', 'AUTO_LIABILITY');
  const wc = findPolicy(vendor, 'WORKERS_COMP', 'WORKERS_COMPENSATION', 'WC');
  const umbrella = findPolicy(vendor, 'UMBRELLA', 'COMMERCIAL_UMBRELLA', 'CU', 'EXCESS');

  const hasAddlInsr = vendor?.policy_lines?.some(p => p.addl_insr)
  const hasSubrWvd = vendor?.policy_lines?.some(p => p.subr_wvd)
  const descriptionOfOps = vendor?.documents?.[0]?.description_of_operations || 'Not Provided'

  const renderLimit = (key: keyof typeof formData, defaultVal: number) => {
    if (!isEditingInsurance) return <span className="font-mono font-medium">{defaultVal === 0 ? '—' : formatCurrency(defaultVal)}</span>
    return (
      <Input
        type="number"
        step="1000"
        value={formData[key]}
        onChange={(e) => setFormData(prev => ({...prev, [key]: e.target.value}))}
        className="h-7 text-xs w-32 font-mono text-right"
      />
    )
  }

  const renderExp = (key: keyof typeof formData, defaultVal: string) => {
    if (!isEditingInsurance) return <span className="font-mono text-muted-foreground">{formatDate(defaultVal)}</span>
    return (
      <Input
        type="date"
        value={formData[key]}
        onChange={(e) => setFormData(prev => ({...prev, [key]: e.target.value}))}
        className="h-7 text-xs w-32 font-mono text-right"
      />
    )
  }

  const renderStatus = (key: keyof typeof formData) => {
    const s = formData[key] as string
    if (!isEditingInsurance) {
      return (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-semibold flex w-max items-center justify-center",
          s === 'APPROVED' ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
          s === 'REJECTED' ? "bg-rose-100 text-rose-700 border border-rose-200" :
          s === 'MISSING_DATA' ? "bg-amber-100 text-amber-700 border border-amber-200" :
          s === 'NOT_PROVIDED' ? "bg-slate-100 text-slate-500 border border-slate-200" :
          "bg-slate-100 text-slate-700 border border-slate-200"
        )}>
          {s === 'MISSING_DATA' ? 'MISSING DATES' : s === 'NOT_PROVIDED' ? 'NOT PROVIDED' : s}
        </span>
      )
    }
    return (
      <div className="flex gap-1 items-center">
        <Button variant={s === 'APPROVED' ? 'default' : 'outline'} size="sm" className={cn("h-7 text-[10px] px-2", s === 'APPROVED' && "bg-emerald-600 hover:bg-emerald-700 text-white")} onClick={() => setFormData(prev => ({...prev, [key]: 'APPROVED'}))}>
          Approve
        </Button>
        <Button variant={s === 'REJECTED' ? 'destructive' : 'outline'} size="sm" className="h-7 text-[10px] px-2" onClick={() => { setRejectingPolicyKey(key); setRejectReason(''); }}>
          Reject
        </Button>
        {s === 'MISSING_DATA' && <span className="text-[10px] text-amber-600 font-bold ml-1">MISSING DATES</span>}
      </div>
    )
  }

  const getDocumentFilename = (url: string | null) => {
    if (!url || !vendor?.documents) return null
    const doc = (vendor.documents as any[]).find(d => d.file_url === url)
    return doc?.original_filename || url.split('/').pop() || 'Document'
  }

  const emrNum = parseFloat(emrScore)
  const isEmrValid = !isNaN(emrNum)
  const emrBadge = isEmrValid && emrNum <= 1.0 ? 'bg-emerald-500/15 text-emerald-700' : isEmrValid && emrNum <= 1.15 ? 'bg-amber-500/15 text-amber-700' : isEmrValid ? 'bg-red-500/15 text-red-700' : 'bg-muted text-muted-foreground'

  const docsLogs = auditLogs.filter(l => l.action_type !== 'INSURANCE_POLICY_UPDATE')
  const insuranceLogs = auditLogs.filter(l => l.action_type === 'INSURANCE_POLICY_UPDATE')


  return (
    <>
      <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => {
        if (uploadTargetRef.current) {
          handleUploadDocument(e, uploadTargetRef.current.docType, uploadTargetRef.current.prefix);
        }
      }} />
      <Sheet open={!!open} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent 
          className="w-full sm:max-w-[45vw] flex flex-col p-0 shadow-2xl z-50"
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            // Prevent sheet from closing when clicking inside our custom preview panel or radix dialogs
            if (target?.closest?.('.preview-panel-overlay') || target?.closest?.('[role="dialog"]')) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('[role="dialog"]')) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            e.preventDefault();
          }}
        >
          <div 
            className="flex-1 overflow-y-auto p-6 relative cursor-default"
            onClick={() => {
              if (isEditingProfile) {
                if (isProfileDirty || isDocsDirty) setIsNoteModalOpen(true)
                else setIsEditingProfile(false)
              }
              if (isEditingInsurance) {
                if (isInsuranceDirty) setIsInsuranceModalOpen(true)
                else setIsEditingInsurance(false)
              }
            }}
          >
            <div 
              className={cn("relative transition-all duration-300", isEditingProfile && "z-20 bg-background pb-4", isEditingInsurance && "opacity-40")}
              onClick={(e) => isEditingProfile && e.stopPropagation()}
            >
              {isEditingInsurance && (
                <div 
                  className="absolute inset-0 z-20 cursor-pointer" 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isInsuranceDirty) setIsInsuranceModalOpen(true);
                    else setIsEditingInsurance(false);
                  }}
                />
              )}
            {issuesList.length > 0 && (
              <div className="mb-6">
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3 text-amber-800 font-semibold text-sm">
                    <AlertTriangle className="size-4" />
                    Attention Required
                  </div>
                  <ul className="space-y-2 text-xs text-amber-700/90 pl-5 list-disc marker:text-amber-500">
                    {issuesList.map((issue, idx) => (
                      <li key={idx} className="pl-1">{issue}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <SheetHeader className="mb-6">
              <div className="flex items-start justify-between">
                {isEditingProfile ? (
                  <div className="flex flex-col gap-2 w-full pr-4">
                    <Input value={profileName} onChange={e => setProfileName(e.target.value)} className="h-8 text-sm font-semibold" placeholder="Company Name" />
                    <Input value={profileTrade} onChange={e => setProfileTrade(e.target.value)} className="h-8 text-xs" placeholder="Trade Specialty" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={profileEin} onChange={e => setProfileEin(e.target.value)} className="h-8 text-xs" placeholder="EIN / Tax ID" />
                      <Input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} className="h-8 text-xs" placeholder="Primary Email" />
                    </div>
                    <Input value={profilePhone} onChange={e => setProfilePhone(e.target.value)} className="h-8 text-xs" placeholder="Phone Number" />
                    <div className="grid grid-cols-[1fr_100px] gap-2">
                      <Input value={profileAddressStreet} onChange={e => setProfileAddressStreet(e.target.value)} className="h-8 text-xs" placeholder="Street Address" />
                      <Input value={profileAddressZip} onChange={e => setProfileAddressZip(e.target.value)} className="h-8 text-xs" placeholder="Zip / Pincode" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <SheetTitle className="text-xl">
                        {vendor.company_name}
                      </SheetTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono px-2 py-0.5 bg-muted/50 rounded text-muted-foreground border border-border/50">
                          {vendor.sc_id || 'N/A'}
                        </span>
                        <span className="text-xs text-muted-foreground">Trade • {vendor.trade_specialty || 'N/A'}</span>
                        {profileSaved && (
                          <span className="ml-2 flex items-center text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full animate-in fade-in slide-in-from-right-2">
                            <CheckCircle2 className="size-3 mr-1" /> Saved
                          </span>
                        )}
                      </div>
                      {(vendor.phone_number || vendor.primary_email || vendor.address_street || vendor.address_zip) && (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {vendor.primary_email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="size-3" /> {vendor.primary_email}</span>}
                          {(vendor.primary_email && vendor.phone_number) && <span className="text-xs text-muted-foreground text-muted-foreground/50">•</span>}
                          {vendor.phone_number && <span className="text-xs text-muted-foreground">{vendor.phone_number}</span>}
                          {((vendor.primary_email || vendor.phone_number) && (vendor.address_street || vendor.address_zip)) && <span className="text-xs text-muted-foreground text-muted-foreground/50">•</span>}
                          {(vendor.address_street || vendor.address_zip) && <span className="text-xs text-muted-foreground truncate">{[vendor.address_street, vendor.address_zip].filter(Boolean).join(', ')}</span>}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-primary shrink-0" onClick={() => setIsEditingProfile(true)}>
                      <Pencil className="size-3 mr-1.5" /> Edit Profile
                    </Button>
                  </>
                )}
              </div>
            </SheetHeader>


            <div className="flex flex-col">
              <Section 
                title="Docs & Safety Verification"
                action={
                  isDocsDirty ? (
                    <span className="flex items-center text-[10px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="size-3 mr-1" /> Unsaved Changes
                    </span>
                  ) : docsSaved ? (
                    <span className="flex items-center text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full animate-in fade-in slide-in-from-right-2">
                      <CheckCircle2 className="size-3 mr-1" /> Saved
                    </span>
                  ) : null
                }
              >
                <div className="flex items-center justify-between gap-4 mt-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">W-9 Form</span>
                    {(() => {
                      const doc = getDocument('W9');
                      return doc?.url ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full w-max border max-w-[200px] truncate" title={doc.name || ''}>
                            {doc.name}
                          </span>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setActivePreviewUrl(doc.url!); setActivePreviewTitle("W-9 Form") }}>
                            <Eye className="size-3 mr-1" /> View Preview
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                            <a href={doc.url!} target="_blank" rel="noopener noreferrer" download>
                              <Download className="size-3 mr-1" /> Download
                            </a>
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocToDelete({ id: doc.id, type: 'W9', url: doc.url!, name: doc.name! }) }} disabled={!!isDeletingDoc || !isEditingProfile}>
                            {isDeletingDoc === (doc.id || 'W9') ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={() => { uploadTargetRef.current = { docType: 'W9', prefix: 'W-9 Form' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'W9' || !isEditingProfile}>
                            {activeUploadDocType === 'W9' ? <Loader2 className="size-3 animate-spin mr-1" /> : <UploadCloud className="size-3 mr-1" />}
                            Replace
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { uploadTargetRef.current = { docType: 'W9', prefix: 'W-9 Form' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'W9' || !isEditingProfile}>
                            {activeUploadDocType === 'W9' ? <Loader2 className="size-3 animate-spin mr-1" /> : <UploadCloud className="size-3 mr-1" />}
                            Upload W-9
                          </Button>
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full w-max">No file found</span>
                        </div>
                      )
                    })()}
                  </div>
                  <Select value={w9Status} onValueChange={(v: any) => {
                    if (v === 'REJECTED') {
                      setRejectDocModal({ isOpen: true, type: 'W9', reason: '' });
                    } else {
                      handleDocMicroCommit('w9', v);
                    }
                  }} disabled={!isEditingProfile}>
                    <SelectTrigger className="h-8 w-[140px] shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="VERIFIED" disabled={!getDocument('W9')?.url}>Verified</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Master Subcontractor Agreement</span>
                    {(() => {
                      const doc = getDocument('MSA');
                      return doc?.url ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full w-max border max-w-[200px] truncate" title={doc.name || ''}>
                            {doc.name}
                          </span>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setActivePreviewUrl(doc.url!); setActivePreviewTitle("Master Subcontractor Agreement") }}>
                            <Eye className="size-3 mr-1" /> View Preview
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                            <a href={doc.url!} target="_blank" rel="noopener noreferrer" download>
                              <Download className="size-3 mr-1" /> Download
                            </a>
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocToDelete({ id: doc.id, type: 'MSA', url: doc.url!, name: doc.name! }) }} disabled={!!isDeletingDoc || !isEditingProfile}>
                            {isDeletingDoc === (doc.id || 'MSA') ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={() => { uploadTargetRef.current = { docType: 'MSA', prefix: 'Master Subcontractor Agreement' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'MSA' || !isEditingProfile}>
                            {activeUploadDocType === 'MSA' ? <Loader2 className="size-3 animate-spin mr-1" /> : <UploadCloud className="size-3 mr-1" />}
                            Replace
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { uploadTargetRef.current = { docType: 'MSA', prefix: 'Master Subcontractor Agreement' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'MSA' || !isEditingProfile}>
                            {activeUploadDocType === 'MSA' ? <Loader2 className="size-3 animate-spin mr-1" /> : <UploadCloud className="size-3 mr-1" />}
                            Upload MSA
                          </Button>
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full w-max">No file found</span>
                        </div>
                      )
                    })()}
                  </div>
                  <Select value={msaStatus} onValueChange={(v: any) => {
                    if (v === 'REJECTED') {
                      setRejectDocModal({ isOpen: true, type: 'MSA', reason: '' });
                    } else {
                      handleDocMicroCommit('msa', v);
                    }
                  }} disabled={!isEditingProfile}>
                    <SelectTrigger className="h-8 w-[140px] shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="VERIFIED" disabled={!getDocument('MSA')?.url}>Verified</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">EMR Score & Letter</span>
                      <span className={cn('px-2 py-0.5 text-[10px] font-semibold rounded', emrBadge)}>
                        {isEmrValid ? formatEmrScore(emrNum) : 'N/A'}
                      </span>
                    </div>
                    {(() => {
                      const doc = getDocument('EMR');
                      return doc?.url ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full w-max border max-w-[200px] truncate" title={doc.name || ''}>
                            {doc.name}
                          </span>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setActivePreviewUrl(doc.url!); setActivePreviewTitle("EMR Letter") }}>
                            <Eye className="size-3 mr-1" /> View Preview
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocToDelete({ id: doc.id, type: 'EMR', url: doc.url!, name: doc.name! }) }} disabled={!!isDeletingDoc || !isEditingProfile}>
                            {isDeletingDoc === (doc.id || 'EMR') ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { uploadTargetRef.current = { docType: 'EMR', prefix: 'EMR Letter' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'EMR' || !isEditingProfile}>
                            {activeUploadDocType === 'EMR' ? <Loader2 className="size-3 animate-spin mr-1" /> : <UploadCloud className="size-3 mr-1" />}
                            Upload EMR Letter
                          </Button>
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full w-max">No file found</span>
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Input 
                      type="number" 
                      step="0.01"
                      min="0"
                      max="9.99"
                      value={emrScore} 
                      onChange={(e) => setEmrScore(e.target.value)}
                      placeholder="e.g. 0.85"
                      className="h-8 w-[140px] text-xs"
                      disabled={!isEditingProfile}
                    />
                    <Select value={emrStatus} onValueChange={(v: any) => {
                      if (v === 'REJECTED') {
                        setRejectDocModal({ isOpen: true, type: 'EMR', reason: '' });
                      } else {
                        handleDocMicroCommit('emr', v);
                      }
                    }} disabled={!isEditingProfile}>
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="VERIFIED" disabled={!getDocument('EMR')?.url}>Verified</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-1 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">OSHA 300 Log</span>
                    {(() => {
                      const doc = getDocument('OSHA');
                      return doc?.url ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full w-max border max-w-[200px] truncate" title={doc.name || ''}>
                            {doc.name}
                          </span>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setActivePreviewUrl(doc.url!); setActivePreviewTitle("OSHA 300 Log") }}>
                            <Eye className="size-3 mr-1" /> View Preview
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                            <a href={doc.url!} target="_blank" rel="noopener noreferrer" download>
                              <Download className="size-3 mr-1" /> Download
                            </a>
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocToDelete({ id: doc.id, type: 'OSHA', url: doc.url!, name: doc.name! }) }} disabled={!!isDeletingDoc || !isEditingProfile}>
                            {isDeletingDoc === (doc.id || 'OSHA') ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={() => { uploadTargetRef.current = { docType: 'OSHA', prefix: 'OSHA 300 Log' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'OSHA' || !isEditingProfile}>
                            {activeUploadDocType === 'OSHA' ? <Loader2 className="size-3 animate-spin mr-1" /> : <UploadCloud className="size-3 mr-1" />}
                            Replace
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { uploadTargetRef.current = { docType: 'OSHA', prefix: 'OSHA 300 Log' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'OSHA' || !isEditingProfile}>
                            {activeUploadDocType === 'OSHA' ? <Loader2 className="size-3 animate-spin mr-1" /> : <UploadCloud className="size-3 mr-1" />}
                            Upload OSHA
                          </Button>
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full w-max">No file found</span>
                        </div>
                      )
                    })()}
                  </div>
                  <Select value={oshaStatus} onValueChange={(v: any) => {
                    if (v === 'REJECTED') {
                      setRejectDocModal({ isOpen: true, type: 'OSHA', reason: '' });
                    } else {
                      handleDocMicroCommit('osha', v);
                    }
                  }} disabled={!isEditingProfile}>
                    <SelectTrigger className="h-8 w-[140px] shrink-0 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="VERIFIED" disabled={!getDocument('OSHA')?.url}>Verified</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                  {isEditingProfile && (
                    <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-border/50">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                        setW9Status(baselineDocs.w9)
                        setMsaStatus(baselineDocs.msa)
                        setEmrStatus((vendor as any).emr_status || 'PENDING')
                        setOshaStatus((vendor as any).osha_status || 'PENDING')
                        setEmrScore(baselineDocs.emr)
                        setProfileName(vendor.company_name)
                        setProfileTrade(vendor.trade_specialty)
                        setProfileEin(vendor.tax_id_ein || '')
                        setProfileEmail(vendor.primary_email || '')
                        setProfilePhone(vendor.phone_number || '')
                        setProfileAddressStreet(vendor.address_street || '')
                        setProfileAddressZip(vendor.address_zip || '')
                        setDocsManagerNote('')
                        setIsNoteModalOpen(false)
                        setIsEditingProfile(false)
                      }}>Cancel</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => setIsNoteModalOpen(true)} disabled={isSavingProfile || (!isProfileDirty && !isDocsDirty)}>
                        {isSavingProfile ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
                        Save Changes
                      </Button>
                    </div>
                  )}

                  <InlineAuditHistory logs={docsLogs} />
                </Section>
              </div>
            </div>

            <div 
              className={cn("flex flex-col mt-6 transition-all duration-300 relative", isEditingInsurance && "z-20 bg-background pb-4", isEditingProfile && "opacity-40")}
              onClick={(e) => isEditingInsurance && e.stopPropagation()}
            >
              {isEditingProfile && (
                <div 
                  className="absolute inset-0 z-20 cursor-pointer" 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isProfileDirty || isDocsDirty) setIsNoteModalOpen(true);
                    else setIsEditingProfile(false);
                  }}
                />
              )}
              <Section 
                title="Insurance Policies" 
                action={
                  <div className="flex items-center gap-2">
                    {isInsuranceDirty ? (
                      <span className="flex items-center text-[10px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="size-3 mr-1" /> Unsaved Changes
                      </span>
                    ) : insuranceSaved ? (
                      <span className="flex items-center text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full animate-in fade-in slide-in-from-right-2">
                        <CheckCircle2 className="size-3 mr-1" /> Saved
                      </span>
                    ) : null}
                  </div>
                }
              >
                <div className="flex items-start justify-between gap-4 mb-2 mt-2">
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">ACORD 25 Certificate (COI)</h4>
                      <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => { uploadTargetRef.current = { docType: 'COI', prefix: 'ACORD 25 COI' }; fileInputRef.current?.click(); }} disabled={activeUploadDocType === 'COI' || !isEditingInsurance}>
                        {activeUploadDocType === 'COI' ? <Loader2 className="size-3 animate-spin mr-1" /> : <Plus className="size-3 mr-1" />}
                        Add ACORD 25
                      </Button>
                    </div>
                    {(() => {
                      const acordDocs = vendor?.documents?.filter(d => d.doc_type === "Certificate of Insurance (COI / ACORD 25)" || d.doc_type === "ACORD 25" || d.doc_type === "COI" || d.doc_type === "Certificate of Insurance") || [];
                      // Add fallback URL if no documents exist but the URL is present on the vendor
                      if (acordDocs.length === 0 && vendor?.acord25_url) {
                        acordDocs.push({
                          file_url: vendor.acord25_url,
                          original_filename: getDocumentFilename(vendor.acord25_url),
                          doc_type: 'ACORD 25'
                        } as any);
                      }
                      
                      if (acordDocs.length === 0) {
                        return (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full w-max">No file found</span>
                          </div>
                        )
                      }
                      
                      return (
                        <div className="flex flex-col gap-2">
                          {acordDocs.map((doc: any, i: number) => {
                            const name = doc.original_filename || getDocumentFilename(doc.file_url)
                            const docId = doc.id
                            return (
                              <div key={i} className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 p-1.5 border rounded-md bg-slate-50/50">
                                  <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full w-max border max-w-[200px] truncate" title={name || ''}>
                                    {name}
                                  </span>
                                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setActivePreviewUrl(doc.file_url!); setActivePreviewTitle("ACORD 25 Certificate (COI)") }}>
                                    <Eye className="size-3 mr-1" /> View Preview
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                                    <a href={doc.file_url!} target="_blank" rel="noopener noreferrer" download>
                                      <Download className="size-3 mr-1" /> Download
                                    </a>
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocToDelete(docId ? { id: docId, url: doc.file_url!, name: name || 'Document' } : { type: 'COI', url: doc.file_url!, name: name || 'ACORD 25' }) }} disabled={!!isDeletingDoc || !isEditingInsurance}>
                                    {isDeletingDoc === (docId || 'COI') ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                                  </Button>
                                </div>

                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                  {isEditingInsurance ? (
                    <Select value={coiStatus} onValueChange={(v: any) => setCoiStatus(v)}>
                      <SelectTrigger className="h-8 w-[140px] shrink-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="VERIFIED">Verified</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                        <SelectItem value="EXPIRED">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="w-[140px] shrink-0">
                      {coiStatus === 'PENDING' ? null : (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-semibold flex w-max items-center justify-center",
                          coiStatus === 'VERIFIED' ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                          coiStatus === 'REJECTED' ? "bg-rose-100 text-rose-700 border border-rose-200" :
                          coiStatus === 'EXPIRED' ? "bg-amber-100 text-amber-700 border border-amber-200" :
                          "bg-slate-100 text-slate-700 border border-slate-200"
                        )}>
                          {coiStatus}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit Policy Lines Trigger */}
                <div className="flex justify-end mb-2 items-center">
                  {isEditingProfile && (
                    <span className="text-[10px] text-muted-foreground italic mr-3">
                      Save profile to edit insurance
                    </span>
                  )}
                  <Button variant="outline" size="sm" className={cn("h-7 text-[11px] px-3", isEditingInsurance ? 'text-amber-600 border-amber-200 bg-amber-50' : 'text-primary')} onClick={() => setIsEditingInsurance(!isEditingInsurance)} disabled={isEditingProfile}>
                    {isEditingInsurance ? <X className="size-3 mr-1.5" /> : <Pencil className="size-3 mr-1.5" />}
                    {isEditingInsurance ? 'Cancel Edit' : 'Edit Policy Lines'}
                  </Button>
                </div>

                {/* General Liability */}
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">General Liability</span>
                  {gl ? (
                    <>
                      <DataRow label="Each Occurrence" value={renderLimit('cgl_limit', Number(gl.limit_amount ?? gl.effective_limit_amount ?? 0))} />
                      <DataRow label="Expiration" value={renderExp('cgl_exp', gl.expiration_date)} />
                      <DataRow label="Status" value={renderStatus('cgl_status')} />
                    </>
                  ) : <span className="text-xs text-muted-foreground">Missing</span>}
                </div>

                {/* Auto Liability */}
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Auto Liability</span>
                  {auto ? (
                    <>
                      <DataRow label="Combined Single Limit" value={renderLimit('auto_limit', Number(auto.limit_amount ?? auto.effective_limit_amount ?? 0))} />
                      <DataRow label="Expiration" value={renderExp('auto_exp', auto.expiration_date)} />
                      <DataRow label="Status" value={renderStatus('auto_status')} />
                    </>
                  ) : <span className="text-xs text-muted-foreground">Missing</span>}
                </div>

                {/* Workers Comp */}
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Workers' Compensation</span>
                  {wc ? (
                    <>
                      <DataRow label="Employers Liab. - Ea. Accident" value={renderLimit('wc_limit', Number(wc.limit_amount ?? wc.effective_limit_amount ?? 0))} />
                      <DataRow label="Expiration" value={renderExp('wc_exp', wc.expiration_date)} />
                      <DataRow label="Status" value={renderStatus('wc_status')} />
                    </>
                  ) : <span className="text-xs text-muted-foreground">Missing</span>}
                </div>

                {/* Umbrella */}
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Umbrella / Excess</span>
                  {umbrella ? (
                    <>
                      <DataRow label="Each Occurrence" value={renderLimit('umbrella_limit', Number(umbrella.limit_amount ?? umbrella.effective_limit_amount ?? 0))} />
                      <DataRow label="Expiration" value={renderExp('umbrella_exp', umbrella.expiration_date)} />
                      <DataRow label="Status" value={renderStatus('umbrella_status')} />
                    </>
                  ) : <span className="text-xs text-muted-foreground">Missing or N/A</span>}
                </div>

                <div className="mt-2 py-4 border-t border-border flex flex-col gap-2">
                  <CheckRow label="Additional Insured (ADDL INSR)" checked={hasAddlInsr} />
                  <CheckRow label="Subrogation Waived (SUBR WVD)" checked={hasSubrWvd} />
                  <DataRow 
                    label="Description of Operations" 
                    value={<span className="text-xs text-muted-foreground max-w-[200px] text-right line-clamp-4 leading-relaxed">{descriptionOfOps}</span>} 
                  />
                </div>

                {isEditingInsurance && (
                  <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-border/50">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                      setFormData(baselineInsurance)
                      setInsuranceNote('')
                      setIsInsuranceModalOpen(false)
                      setIsEditingInsurance(false)
                    }}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={() => setIsInsuranceModalOpen(true)} disabled={isSavingInsurance || !isInsuranceDirty}>
                      {isSavingInsurance ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
                      Save Changes
                    </Button>
                  </div>
                )}
                
                <InlineAuditHistory logs={insuranceLogs} />
              </Section>
            </div>
          </div>

          <div 
            className={cn("sticky bottom-0 z-10 border-t border-border p-4 bg-background shrink-0 flex flex-col gap-6 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] transition-opacity duration-300 relative", (isEditingProfile || isEditingInsurance) && "opacity-40")}
          >
            {(isEditingProfile || isEditingInsurance) && (
              <div 
                className="absolute inset-0 z-20 cursor-pointer" 
                onClick={(e) => {
                  e.stopPropagation();
                  if (isEditingProfile) {
                    if (isProfileDirty || isDocsDirty) setIsNoteModalOpen(true);
                    else setIsEditingProfile(false);
                  }
                  if (isEditingInsurance) {
                    if (isInsuranceDirty) setIsInsuranceModalOpen(true);
                    else setIsEditingInsurance(false);
                  }
                }}
              />
            )}
            <div className="flex flex-col gap-2">
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full gap-2" 
                      onClick={() => {
                        const recipient = vendor?.primary_email || ''
                        const subject = encodeURIComponent(`Action Required: Compliance Documents for ${vendor?.company_name || 'Subcontractor'}`)
                        const intro = `Hello,\n\nPlease address the following compliance items for ${vendor?.company_name || 'Subcontractor'}:\n\n`
                        
                        const missingDocs: string[] = []
                        
                        // Check W-9
                        if (vendor.w9_status === 'REJECTED') missingDocs.push(`W-9 Form Rejected: ${(vendor as any).w9_rejection_reason || 'Please provide updated document'}`)
                        else if (!vendor.w9_file_url && !vendor.documents?.some(d => d.doc_type === 'W-9' || d.doc_type === 'W9')) missingDocs.push('W-9 Form: Missing')

                        // Check MSA
                        if (vendor.msa_status === 'REJECTED') missingDocs.push(`Master Subcontractor Agreement Rejected: ${(vendor as any).msa_rejection_reason || 'Please provide updated agreement'}`)
                        else if (!vendor.msa_file_url && !vendor.documents?.some(d => d.doc_type === 'MSA' || d.doc_type === 'Master Subcontractor Agreement (MSA)')) missingDocs.push('Master Subcontractor Agreement: Missing')

                        // Check EMR
                        if ((vendor as any).emr_status === 'REJECTED') missingDocs.push(`EMR Letter Rejected: ${(vendor as any).emr_rejection_reason || 'Please provide current year EMR worksheet/letter'}`)
                        else if (vendor.emr_score && (!(vendor as any).emr_file_url && !vendor.documents?.some(d => d.doc_type === 'EMR'))) missingDocs.push('EMR Letter: Missing verification document')

                        // Check OSHA
                        if ((vendor as any).osha_status === 'REJECTED') missingDocs.push(`OSHA 300 Log Rejected: ${(vendor as any).osha_rejection_reason || 'Please provide updated log'}`)
                        else if (!vendor.osha_file_url) missingDocs.push('OSHA 300 Logs: Missing')

                        // Check Insurance Policies
                        if (vendor.policy_lines && vendor.policy_lines.length > 0) {
                          const now = new Date()
                          vendor.policy_lines.forEach(policy => {
                            if (!policy.is_active) return;
                            if (policy.status === 'REJECTED') {
                              missingDocs.push(`${policy.coverage_type} Policy Rejected: ${policy.rejection_reason || 'Review required'}`);
                            } else if (policy.expiration_date) {
                              const expDate = new Date(policy.expiration_date);
                              const daysDiff = (expDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
                              if (daysDiff < 0) {
                                missingDocs.push(`${policy.coverage_type} Policy Expired: Expired on ${expDate.toLocaleDateString()}. Please provide renewal COI.`);
                              }
                            }
                          });
                        } else {
                          // Fallback if no policies parsed but COI missing
                          if (!vendor.acord25_url && !vendor.documents?.some(d => d.doc_type === 'COI' || d.doc_type === 'ACORD 25' || d.doc_type === 'Certificate of Insurance (COI / ACORD 25)')) {
                             missingDocs.push('Certificate of Insurance (COI): Missing');
                          }
                        }

                        const bulletPoints = missingDocs.length > 0 
                          ? missingDocs.map(issue => `• ${issue}`).join('\n')
                          : `• Please complete any remaining sections of your onboarding profile.`
                        const body = encodeURIComponent(intro + bulletPoints + `\n\nThank you.`)
                        window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`
                      }}
                    >
                      <Mail className="size-4" aria-hidden="true" />
                      Send Nudge Email
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs font-medium">Click here to send a reminder email to subcontractor to send documents/information needed</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="flex justify-between items-center border-t border-slate-200 pt-6">
              <Button variant="outline" size="sm" onClick={handleDelete} disabled={isDeleting} className="text-rose-600 hover:bg-rose-50 border-rose-200">
                {isDeleting ? <Loader2 className="size-4 animate-spin mr-2" /> : <Trash2 className="size-4 mr-2" />}
                Delete Subcontractor
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold" onClick={() => onOpenChange(false)}>
                  Close ✕
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!rejectingPolicyKey} onOpenChange={(o) => { if (!o) setRejectingPolicyKey(null) }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {rejectingPolicyKey === 'cgl_status' ? 'Reject General Liability'
                : rejectingPolicyKey === 'auto_status' ? 'Reject Auto Liability'
                : rejectingPolicyKey === 'wc_status' ? "Reject Workers' Compensation"
                : rejectingPolicyKey === 'umbrella_status' ? 'Reject Umbrella / Excess'
                : 'Reject Policy'}
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this policy. This will be shown to the subcontractor.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea 
              placeholder="e.g. Limits are too low, missing additional insured endorsement..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="text-sm"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingPolicyKey(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (rejectingPolicyKey) {
                const rKey = rejectingPolicyKey === 'cgl_status' ? 'cgl_rejection_reason'
                         : rejectingPolicyKey === 'auto_status' ? 'auto_rejection_reason'
                         : rejectingPolicyKey === 'wc_status' ? 'wc_rejection_reason'
                         : 'umbrella_rejection_reason'
                setFormData(prev => ({ ...prev, [rejectingPolicyKey]: 'REJECTED', [rKey]: rejectReason }))
                setRejectingPolicyKey(null)
              }
            }}>
              {rejectingPolicyKey === 'cgl_status' ? 'Reject General Liability'
                : rejectingPolicyKey === 'auto_status' ? 'Reject Auto Liability'
                : rejectingPolicyKey === 'wc_status' ? "Reject Workers' Compensation"
                : rejectingPolicyKey === 'umbrella_status' ? 'Reject Umbrella / Excess'
                : 'Reject Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {vendor && showHistoryModal && (
        <VendorAuditHistoryModal 
          vendorId={vendor.vendor_id}
          open={!!showHistoryModal}
          onOpenChange={setShowHistoryModal}
        />
      )}

      {/* Side-by-Side Fixed Document Viewer (Rendered outside Sheet so it sits on the left) */}
      {activePreviewUrl && (
        <Draggable nodeRef={dragNodeRef} handle=".drag-handle">
          <div ref={dragNodeRef} className="preview-panel-overlay fixed left-6 top-6 w-[42vw] h-[88vh] bg-background shadow-2xl rounded-xl z-[60] flex flex-col border overflow-hidden">
            <div className="drag-handle p-3 border-b shrink-0 flex flex-row items-center justify-between bg-muted/30 cursor-move hover:bg-muted/50 transition-colors">
            <h3 className="font-semibold text-sm">{activePreviewTitle}</h3>
            <div className="flex items-center gap-2">
              {activePreviewUrl && (
                <div className="flex items-center border rounded-md overflow-hidden mr-2 bg-background">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 rounded-none hover:bg-muted text-muted-foreground" onClick={() => {
                    setPdfZoom(z => {
                      const nextZoom = Math.max(50, z - 25);
                      console.log('[RCA Preview Zoom] Previous Zoom:', z, 'New Zoom:', nextZoom);
                      return nextZoom;
                    });
                  }}>
                    <ZoomOut className="size-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-0 w-12 rounded-none hover:bg-muted text-[10px] font-mono text-center" onClick={() => {
                    setPdfZoom(z => {
                      console.log('[RCA Preview Zoom] Previous Zoom:', z, 'New Zoom:', 100);
                      return 100;
                    });
                  }}>
                    {pdfZoom}%
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 rounded-none hover:bg-muted text-muted-foreground" onClick={() => {
                    setPdfZoom(z => {
                      const nextZoom = Math.min(200, z + 25);
                      console.log('[RCA Preview Zoom] Previous Zoom:', z, 'New Zoom:', nextZoom);
                      return nextZoom;
                    });
                  }}>
                    <ZoomIn className="size-3" />
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                <a href={activePreviewUrl} target="_blank" rel="noreferrer">
                  <Download className="size-3 mr-1" /> Download
                </a>
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setActivePreviewUrl(null); setPdfZoom(100); }}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 w-full overflow-auto relative p-6 bg-slate-200/50">
            {(() => {
              const baseUrl = activePreviewUrl.split('#')[0];
              const scale = pdfZoom / 100;
              const isImage = baseUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i);
              
              if (isImage) {
                return (
                  <div className={`flex items-start min-h-full ${scale > 1 ? 'justify-start' : 'justify-center mx-auto'}`}>
                    <img 
                      src={baseUrl} 
                      alt={activePreviewTitle}
                      className="shadow-sm bg-white"
                      style={{
                        width: scale > 1 ? `${scale * 100}%` : 'auto',
                        maxWidth: scale > 1 ? 'none' : '100%',
                        height: 'auto',
                        transition: 'width 0.2s ease-in-out'
                      }}
                    />
                  </div>
                );
              }
              
              return (
                <div 
                  className={`flex items-start min-h-full ${scale > 1 ? 'justify-start' : 'justify-center mx-auto'}`}
                  style={{
                    width: scale > 1 ? `${800 * scale}px` : '100%',
                    minWidth: `${800 * scale}px`,
                    height: `${1100 * scale}px`
                  }}
                >
                  <div 
                    className="transition-all duration-200 origin-top-left mx-auto"
                    style={{
                      transform: `scale(${scale})`,
                      width: '800px',
                      height: '1100px'
                    }}
                  >
                    <iframe
                      src={baseUrl}
                      className="border-0 w-full h-full bg-white shadow-sm"
                      title={activePreviewTitle}
                      allowFullScreen
                    />
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="p-2 bg-slate-50 border-t shrink-0 text-center text-[10px] text-slate-500">
            Unable to embed preview? <a href={activePreviewUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Click here to open in new tab</a>
          </div>
        </div>
        </Draggable>
      )}

      {/* Mismatch Warning Modal */}
      <Dialog open={!!matchWarning?.show} onOpenChange={(open) => !open && setMatchWarning({ show: false, docType: '', publicUrl: '', extractedName: '', extractedAddress: '', fileName: '', mimeType: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center text-amber-600 gap-2">
              <AlertTriangle className="size-5" /> Document Mismatch Detected
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-slate-600 space-y-4">
            <p>The uploaded document details (Name/Address) differ from the current vendor profile. Are you sure you want to update this document?</p>
            <div className="bg-slate-50 p-3 rounded-md border text-xs grid grid-cols-2 gap-4">
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Extracted from Document:</span>
                <span className="block font-mono">{matchWarning?.extractedName || 'N/A'}</span>
                <span className="block font-mono mt-1 text-slate-500">{matchWarning?.extractedAddress || 'N/A'}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Current Profile:</span>
                <span className="block font-mono">{vendor?.company_name || 'N/A'}</span>
                <span className="block font-mono mt-1 text-slate-500">{vendor?.address_street || 'N/A'}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMatchWarning({ show: false, docType: '', publicUrl: '', extractedName: '', extractedAddress: '', fileName: '', mimeType: '' })}>Cancel</Button>
            <Button variant="default" disabled={isUpdatingAnyway} onClick={async () => {
              if (matchWarning) {
                setIsUpdatingAnyway(true)
                try {
                  const fieldUpdate = await commitDocumentUpdate(matchWarning.docType, matchWarning.publicUrl, matchWarning.fileName)
                  if (!fieldUpdate) throw new Error('Document update failed')

                  if (matchWarning.docType === 'COI') {
                    const docRes = await fetch('/api/parse-doc', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        fileUrl: matchWarning.publicUrl,
                        mimeType: matchWarning.mimeType,
                        originalFilename: matchWarning.fileName,
                        vendor_id: vendor?.vendor_id,
                        bypass_mismatch: true
                      })
                    })
                    if (!docRes.ok) {
                      const text = await docRes.text()
                      let errorMsg = 'Failed to parse document record'
                      try {
                        const body = JSON.parse(text)
                        if (body.error) errorMsg = body.error
                      } catch {
                        errorMsg = text || errorMsg
                      }
                      throw new Error(errorMsg)
                    }
                  } else {
                    const docRes = await fetch('/api/documents', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        vendor_id: vendor?.vendor_id,
                        file_url: matchWarning.publicUrl,
                        doc_type: matchWarning.docType,
                        original_filename: matchWarning.fileName,
                        mime_type: 'application/pdf'
                      })
                    })
                    if (!docRes.ok) throw new Error('Failed to create document record')
                  }

                  if (onUpdateVendor && vendor) {
                    try {
                      const freshRes = await fetch(`/api/vendors?id=${vendor.vendor_id}`)
                      if (freshRes.ok) {
                        const freshData = await freshRes.json()
                        if (freshData.vendors && freshData.vendors.length > 0) {
                          onUpdateVendor(freshData.vendors[0])
                        } else {
                          onUpdateVendor({ ...vendor, ...fieldUpdate } as any)
                        }
                      }
                    } catch (e) {
                      onUpdateVendor({ ...vendor, ...fieldUpdate } as any)
                    }
                  }
                  if (onSaved) onSaved()
                } catch (err: any) {
                  toast.error(err.message || 'Failed to force upload document')
                } finally {
                  setIsUpdatingAnyway(false)
                  setActiveUploadDocType(null)
                  setMatchWarning({ show: false, docType: '', publicUrl: '', extractedName: '', extractedAddress: '', fileName: '', mimeType: '' })
                }
              }
            }}>Update Anyway</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocToDelete(null)} disabled={!!isDeletingDoc}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteDocument} disabled={!!isDeletingDoc}>
              {isDeletingDoc ? <Loader2 className="size-4 animate-spin mr-2" /> : <Trash2 className="size-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-border/40 shadow-2xl">
          <div className="px-6 pt-6 pb-4 bg-slate-50/50 border-b border-border/40">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <div className="bg-amber-100 p-1.5 rounded-md">
                  <ClipboardEdit className="size-4 text-amber-700" />
                </div>
                Docs & Safety Audit Note
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-relaxed">
                Detail your verification checks, overrides, or any issues found. This note will be permanently attached to the audit log.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6">
            <Textarea 
              value={docsManagerNote} 
              onChange={(e) => setDocsManagerNote(e.target.value)} 
              placeholder="e.g., Verified W-9 details via IRS TIN matching, approved override for EMR score based on safety narrative..."
              className={cn(
                "min-h-[140px] text-sm resize-none bg-background shadow-inner border-border focus-visible:ring-1 focus-visible:ring-amber-500/50 focus-visible:border-amber-500 transition-all", 
                (!docsManagerNote.trim() && (isDocsDirty || isProfileDirty)) && "border-amber-300 bg-amber-50/30"
              )}
            />
          </div>
          <DialogFooter className="px-6 pb-6 pt-4 bg-slate-50/50 border-t border-border/40 flex items-center justify-end gap-2 w-full">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setIsNoteModalOpen(false)}>Cancel</Button>
            <Button 
              size="sm"
              className={cn("h-8 transition-all duration-300 shadow-sm", (!docsManagerNote.trim()) ? "bg-slate-100 text-slate-400 hover:bg-slate-100" : "bg-amber-600 hover:bg-amber-700 text-white")} 
              onClick={handleSaveUnified} 
              disabled={isSavingDocs || isSavingProfile || !docsManagerNote.trim()}
            >
              {isSavingDocs || isSavingProfile ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Save className="size-3.5 mr-1.5" />}
              Save & Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isInsuranceModalOpen} onOpenChange={setIsInsuranceModalOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-border/40 shadow-2xl">
          <div className="px-6 pt-6 pb-4 bg-slate-50/50 border-b border-border/40">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <div className="bg-amber-100 p-1.5 rounded-md">
                  <ClipboardEdit className="size-4 text-amber-700" />
                </div>
                Insurance Audit Note
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-relaxed">
                Detail your reason for overriding policy information. This note will be permanently attached to the audit log.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6">
            <Textarea 
              value={insuranceNote} 
              onChange={(e) => setInsuranceNote(e.target.value)} 
              placeholder="e.g., Authorized manual limit override for General Liability per recent compliance review..."
              className={cn(
                "min-h-[140px] text-sm resize-none bg-background shadow-inner border-border focus-visible:ring-1 focus-visible:ring-amber-500/50 focus-visible:border-amber-500 transition-all", 
                (!insuranceNote.trim() && isInsuranceDirty) && "border-amber-300 bg-amber-50/30"
              )}
            />
          </div>
          <DialogFooter className="px-6 pb-6 pt-4 bg-slate-50/50 border-t border-border/40 flex items-center justify-end gap-2 w-full">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setIsInsuranceModalOpen(false)}>Cancel</Button>
            <Button 
              size="sm"
              className={cn("h-8 transition-all duration-300 shadow-sm", (!insuranceNote.trim()) ? "bg-slate-100 text-slate-400 hover:bg-slate-100" : "bg-amber-600 hover:bg-amber-700 text-white")} 
              onClick={handleSaveInsurance} 
              disabled={isSavingInsurance || !insuranceNote.trim()}
            >
              {isSavingInsurance ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Save className="size-3.5 mr-1.5" />}
              Save & Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Reject Modal */}
      <Dialog open={rejectDocModal.isOpen} onOpenChange={(open) => !open && setRejectDocModal(prev => ({...prev, isOpen: false}))}>
        <DialogContent className="sm:max-w-[425px] bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <XCircle className="h-5 w-5 text-rose-500" />
              Reject {rejectDocModal.type}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Please provide a specific reason for rejecting this document. This will be automatically included in the nudge email sent to the subcontractor.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="doc_reject_reason" className="mb-2 block text-slate-700">Rejection Reason</Label>
            <Input
              id="doc_reject_reason"
              placeholder="e.g. Name does not match TIN, Document is from last year..."
              value={rejectDocModal.reason}
              onChange={(e) => setRejectDocModal(prev => ({...prev, reason: e.target.value}))}
              autoFocus
              className="bg-white border-slate-300"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDocModal(prev => ({...prev, isOpen: false}))}>Cancel</Button>
            <Button 
              className="bg-rose-600 hover:bg-rose-700 text-white" 
              disabled={!rejectDocModal.reason.trim()}
              onClick={() => {
                if (rejectDocModal.type) {
                  handleDocMicroCommit(rejectDocModal.type.toLowerCase() as any, 'REJECTED', rejectDocModal.reason.trim());
                }
                setRejectDocModal({ isOpen: false, type: null, reason: '' });
              }}
            >
              Reject Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
