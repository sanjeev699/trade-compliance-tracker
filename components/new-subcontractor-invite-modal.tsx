'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Link as LinkIcon, Check } from 'lucide-react'
import { SubcontractorEmailPreviewModal } from './subcontractor-email-preview-modal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const TRADES = [
  'Plumbing', 'Electrical', 'HVAC', 'Roofing', 
  'Concrete', 'Steel Erection', 'General Contractor', 'Other'
]

const DOC_TYPES = [
  { id: 'W-9 Form', label: 'W-9 Form', defaultChecked: true },
  { id: 'Certificate of Insurance (COI / ACORD 25)', label: 'Certificate of Insurance (COI / ACORD 25)', defaultChecked: true },
  { id: 'Master Subcontractor Agreement (MSA)', label: 'Master Subcontractor Agreement (MSA)', defaultChecked: true },
  { id: 'OSHA 300 Safety Log', label: 'OSHA 300 Safety Log', defaultChecked: false },
  { id: 'State Trade License', label: 'State Trade License', defaultChecked: false }
]

export function NewSubcontractorInviteModal({ open, onOpenChange, onSuccess }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Form State
  const [companyName, setCompanyName] = useState('')
  const [primaryEmail, setPrimaryEmail] = useState('')
  const [trade, setTrade] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<string[]>(
    DOC_TYPES.filter(d => d.defaultChecked).map(d => d.id)
  )
  const [expiresIn, setExpiresIn] = useState('3')
  const [internalNote, setInternalNote] = useState('')
  
  // Preview Modal State
  const [previewData, setPreviewData] = useState<{subject: string, body: string, magicLink: string} | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingName: string, isLinkOnly: boolean } | null>(null)

  const handleDocToggle = (docId: string, checked: boolean) => {
    setSelectedDocs(prev => 
      checked ? [...prev, docId] : prev.filter(id => id !== docId)
    )
  }

  const handleSubmit = async (e: React.FormEvent, returnOnlyLink = false) => {
    e.preventDefault()
    if (!companyName || !primaryEmail || !trade) {
      alert('Please fill in all required fields (Company Name, Email, and Trade).')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/vendors/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          primary_email: primaryEmail,
          trade_specialty: trade,
          required_docs: selectedDocs,
          expires_in_days: parseInt(expiresIn),
          internal_note: internalNote,
          force_merge: false
        })
      })

      if (res.status === 409) {
        const data = await res.json()
        if (data.requires_merge_confirmation) {
          setDuplicateWarning({ existingName: data.existing_company_name, isLinkOnly: returnOnlyLink })
          setIsLoading(false)
          return
        }
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')

      if (returnOnlyLink) {
        await navigator.clipboard.writeText(data.magic_link_url)
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
        alert('Magic Link copied to clipboard!')
        if (onSuccess) onSuccess()
      } else {
        setPreviewData({
          subject: data.subject,
          body: data.emailBody,
          magicLink: data.magic_link_url
        })
        if (onSuccess) onSuccess()
      }
      
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleMergeAndSend = async () => {
    setIsLoading(true)
    const returnOnlyLink = duplicateWarning?.isLinkOnly || false
    setDuplicateWarning(null)
    
    try {
      const res = await fetch('/api/vendors/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          primary_email: primaryEmail,
          trade_specialty: trade,
          required_docs: selectedDocs,
          expires_in_days: parseInt(expiresIn),
          internal_note: internalNote,
          force_merge: true
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')

      if (returnOnlyLink) {
        await navigator.clipboard.writeText(data.magic_link_url)
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
        alert('Magic Link copied to clipboard!')
        if (onSuccess) onSuccess()
      } else {
        setPreviewData({
          subject: data.subject,
          body: data.emailBody,
          magicLink: data.magic_link_url
        })
        if (onSuccess) onSuccess()
      }
      
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open && !previewData} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invite New Subcontractor</DialogTitle>
            <DialogDescription>
              Generate a secure onboarding link for a new subcontractor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-8 py-4">
            {/* SECTION 1: Basic Intake */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">1. Subcontractor Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Name <span className="text-red-500">*</span></label>
                  <Input 
                    placeholder="e.g. Acme Builders" 
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Primary Email <span className="text-red-500">*</span></label>
                  <Input 
                    type="email" 
                    placeholder="contact@acme.com" 
                    value={primaryEmail}
                    onChange={(e) => setPrimaryEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-sm font-medium">Trade / Category <span className="text-red-500">*</span></label>
                  <Select value={trade} onValueChange={(val) => setTrade(val || '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a trade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TRADES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* SECTION 2: Required Docs */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">2. Required Compliance Documents</h3>
              <div className="grid grid-cols-2 gap-3">
                {DOC_TYPES.map(doc => (
                  <label key={doc.id} className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox"
                      className="rounded border-gray-300 text-primary shadow-sm focus:border-primary focus:ring-primary h-4 w-4"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={(e) => handleDocToggle(doc.id, e.target.checked)}
                    />
                    <span className="text-sm font-medium leading-none">{doc.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* SECTION 3: Expiration & Note */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">3. Options</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Link Expiration</label>
                  <div className="flex gap-4">
                    {['3', '7', '14'].map(days => (
                      <label key={days} className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name="expiresIn" 
                          value={days}
                          checked={expiresIn === days}
                          onChange={(e) => setExpiresIn(e.target.value)}
                          className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium">{days} Days</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Internal Note (Optional)</label>
                  <Textarea 
                    placeholder="Add a note to the audit log..."
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t mt-4">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={(e) => handleSubmit(e, true)}
                disabled={isLoading}
              >
                {copiedLink ? <Check className="size-4 mr-2" /> : <LinkIcon className="size-4 mr-2" />}
                {copiedLink ? 'Copied!' : 'Copy Magic Link'}
              </Button>
              <Button 
                onClick={(e) => handleSubmit(e, false)}
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Create Mail Template
              </Button>
            </div>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {previewData && (
        <SubcontractorEmailPreviewModal 
          open={!!previewData}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewData(null)
              onOpenChange(false) // close parent too
            }
          }}
          subject={previewData.subject}
          body={previewData.body}
        />
      )}

      <AlertDialog open={!!duplicateWarning} onOpenChange={(open) => !open && setDuplicateWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Record Found</AlertDialogTitle>
            <AlertDialogDescription>
              A vendor with this email or name already exists in the system: <strong>{duplicateWarning?.existingName}</strong>.
              <br /><br />
              Do you want to send this invite under the existing company, or cancel and use a different email?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateWarning(null)}>
              Cancel (Change Email)
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleMergeAndSend} disabled={isLoading}>
              Merge & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
