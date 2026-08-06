'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RefreshCw, Sparkles, Copy, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react'
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
import { ManualSubcontractorOnboardingModal } from './manual-subcontractor-onboarding-modal'

type Status = 'READY' | 'DRAFT' | 'CREATED'

const DOC_OPTIONS = [
  { id: 'ACORD 25 COI', label: 'ACORD 25 COI' },
  { id: 'W-9 Form', label: 'W-9 Form' },
  { id: 'Master Subcontractor Agreement (MSA)', label: 'Master Subcontractor Agreement (MSA)' },
  { id: 'State License', label: 'State License' }
]

export function SubcontractorOnboardingStudio() {
  const [status, setStatus] = useState<Status>('READY')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [requiredDocs, setRequiredDocs] = useState<string[]>(['ACORD 25 COI', 'W-9 Form'])
  const [isManualModalOpen, setIsManualModalOpen] = useState(false)
  
  const [generatedSubject, setGeneratedSubject] = useState('')
  const [generatedBody, setGeneratedBody] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [pendingCopyAction, setPendingCopyAction] = useState<(() => void) | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingName: string } | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [forceMerge, setForceMerge] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDocToggle = (docId: string) => {
    setRequiredDocs(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    )
  }

  const handleReset = () => {
    setCompanyName('')
    setEmail('')
    setPhone('')
    setRequiredDocs(['ACORD 25 COI', 'W-9 Form'])
    setGeneratedSubject('')
    setGeneratedBody('')
    setGeneratedLink('')
    setStatus('READY')
    setError(null)
    setForceMerge(false)
  }

  const handleGenerate = async (skipCheck = false) => {
    if (!companyName || !email || !phone) {
      setError('Please fill in Company Name, Email, and Phone.')
      return
    }
    setError(null)

    if (!skipCheck) {
      setIsChecking(true)
      try {
        const res = await fetch(`/api/vendors/check?email=${encodeURIComponent(email)}&name=${encodeURIComponent(companyName)}`)
        const data = await res.json()
        if (data.exists) {
          setDuplicateWarning({ existingName: data.company_name })
          return // Stop generation! Modal pops up.
        }
      } catch (err) {
        console.error('Error checking duplicates:', err)
      } finally {
        setIsChecking(false)
      }
    }

    setForceMerge(skipCheck)

    const previewToken = '15a17b6e-preview-only-dummy-06c941a83c4f'
    const previewUrl = `${window.location.origin}/onboard/${previewToken}`
    
    setGeneratedSubject(`Action Required: Vendor Onboarding - ${companyName}`)
    setGeneratedBody(`Hello team at ${companyName},\n\nPlease complete your subcontractor onboarding profile and upload the following compliance documents:\n\n${requiredDocs.map(d => `- ${d}`).join('\n')}\n\nClick the onboarding link to securely provide these records:\n${previewUrl}\n\nThank you,\nThe Compliance Team`)
    setGeneratedLink(previewUrl)
    setStatus('DRAFT')
  }

  const activateRecord = async (overrideForceMerge = false) => {
    setIsActivating(true)
    setError(null)
    const shouldForceMerge = overrideForceMerge || forceMerge
    try {
      const res = await fetch('/api/subcontractors/studio-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          primary_email: email,
          phone_number: phone,
          required_docs: requiredDocs,
          force_merge: shouldForceMerge
        })
      })
      
      if (res.status === 409) {
        const data = await res.json()
        if (data.requires_merge_confirmation) {
          setDuplicateWarning({ existingName: data.existing_company_name })
          setIsActivating(false)
          return null
        }
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to activate invite')

      const realLink = `${window.location.origin}/onboard/${data.token}`
      const previewToken = '15a17b6e-preview-only-dummy-06c941a83c4f'
      const previewUrl = `${window.location.origin}/onboard/${previewToken}`
      
      setGeneratedLink(realLink)
      setGeneratedBody(prev => prev.replace(previewUrl, realLink))
      setStatus('CREATED')
      setPendingCopyAction(null)
      return realLink
    } catch (err: any) {
      setError(err.message)
      setPendingCopyAction(null)
    } finally {
      setIsActivating(false)
    }
  }

  const executeCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Clipboard failed', err)
    }
  }

  const handleCopyIntent = (type: 'subject' | 'body' | 'link') => {
    if (status === 'READY') return
    if (status === 'CREATED') {
      if (type === 'subject') executeCopy(generatedSubject, type)
      if (type === 'body') executeCopy(generatedBody, type)
      if (type === 'link') executeCopy(generatedLink, type)
      return
    }

    setPendingCopyAction(() => async () => {
      const newLink = await activateRecord()
      if (newLink) {
        const previewToken = '15a17b6e-preview-only-dummy-06c941a83c4f'
        const previewUrl = `${window.location.origin}/onboard/${previewToken}`
        if (type === 'subject') executeCopy(generatedSubject, type)
        if (type === 'body') executeCopy(generatedBody.replace(previewUrl, newLink), type)
        if (type === 'link') executeCopy(newLink, type)
      }
    })
  }

  const maskTokenUrl = (url: string) => {
    if (!url) return ''
    const parts = url.split('/onboard/')
    if (parts.length < 2) return url
    const token = parts[1]
    if (token.length >= 32) {
      return `${parts[0]}/onboard/${token.substring(0, 8)}-••••-••••-••••-${token.substring(token.length - 12)}`
    }
    return url
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 border rounded-xl overflow-hidden shadow-sm">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        {/* LEFT COLUMN: Inputs & Config */}
        <div className="p-6 md:p-8 bg-white border-r">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              {status === 'READY' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span> Ready for New</span>}
              {status === 'DRAFT' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"><span className="size-2 rounded-full bg-blue-500"></span> Draft Created</span>}
              {status === 'CREATED' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><CheckCircle2 className="size-3" /> Record Created</span>}
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-500 hover:text-slate-900">
              <RefreshCw className="size-4 mr-2" /> Reset Form
            </Button>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Company Name <span className="text-rose-500">*</span></Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Construction" disabled={status === 'CREATED'} className="placeholder:text-gray-300" />
            </div>
            
            <div className="space-y-2">
              <Label>Primary Email <span className="text-rose-500">*</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@acme.com" disabled={status === 'CREATED'} className="placeholder:text-gray-300" />
            </div>

            <div className="space-y-2">
              <Label>Primary Phone <span className="text-rose-500">*</span></Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" disabled={status === 'CREATED'} className="placeholder:text-gray-300" />
            </div>

            <div className="space-y-3 pt-4 border-t">
              <Label>Required Documents</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DOC_OPTIONS.map(doc => (
                  <div key={doc.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`doc-${doc.id}`} 
                      checked={requiredDocs.includes(doc.id)} 
                      onCheckedChange={() => handleDocToggle(doc.id)}
                      disabled={status === 'CREATED'}
                    />
                    <Label htmlFor={`doc-${doc.id}`} className="text-sm font-normal cursor-pointer">{doc.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="p-3 text-sm text-rose-600 bg-rose-50 rounded border border-rose-100">{error}</div>}

                <Button 
                  onClick={() => handleGenerate(false)} 
                  disabled={!companyName || !email || !phone || isChecking}
                  className="w-full gap-2 text-sm h-11"
                >
                  {isChecking ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Generate Preview
                </Button>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Read-Only Preview */}
        <div className="p-6 md:p-8 bg-slate-50 flex flex-col gap-6">
          <div className="space-y-2">
            <Label className="text-slate-500 text-xs font-bold uppercase tracking-wider">Subject Line</Label>
            <div className="flex gap-2">
              <Input readOnly value={generatedSubject} className="bg-white" placeholder="Waiting for preview generation..." />
              <Button variant="secondary" onClick={() => handleCopyIntent('subject')} disabled={status === 'READY'}>
                <Copy className="size-4 mr-2" /> Copy Subject
              </Button>
            </div>
          </div>

          <div className="space-y-2 flex-1 flex flex-col">
            <Label className="text-slate-500 text-xs font-bold uppercase tracking-wider">Email Body</Label>
            <div className="relative flex-1">
              <textarea 
                readOnly 
                value={generatedBody}
                placeholder="Waiting for preview generation..."
                className="w-full h-full min-h-[200px] p-3 rounded-md border border-input bg-white text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <div className="absolute top-3 right-3">
                <Button variant="secondary" size="sm" onClick={() => handleCopyIntent('body')} disabled={status === 'READY'}>
                  <Copy className="size-4 mr-2" /> Copy Body
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 text-xs font-bold uppercase tracking-wider">Direct Magic Link</Label>
            <div className="flex gap-2">
              <Input readOnly value={maskTokenUrl(generatedLink)} className="bg-white text-emerald-600 font-mono text-sm" placeholder="Waiting for preview generation..." />
              <Button variant="secondary" onClick={() => handleCopyIntent('link')} disabled={status === 'READY'}>
                <Copy className="size-4 mr-2" /> Copy Link
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: Manual Escape Hatch */}
      <div className="p-4 bg-slate-100 border-t flex justify-center text-sm text-slate-500">
        Already have offline documents from this vendor? 
        <button onClick={() => setIsManualModalOpen(true)} className="ml-1 text-primary hover:underline font-medium inline-flex items-center">
           Onboard Vendor Manually <ExternalLink className="size-3 ml-1" />
        </button>
      </div>

      <AlertDialog open={!!pendingCopyAction && !duplicateWarning} onOpenChange={(open) => !open && setPendingCopyAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Subcontractor Outreach</AlertDialogTitle>
            <AlertDialogDescription>
              This will activate the onboarding link for <strong>{companyName}</strong> and create a record in your directory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingCopyAction && pendingCopyAction()} disabled={isActivating}>
              {isActivating ? 'Creating...' : 'Confirm & Copy'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogCancel onClick={() => { setDuplicateWarning(null); setPendingCopyAction(null); }}>
              Cancel (Change Email)
            </AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (pendingCopyAction) {
                setDuplicateWarning(null)
                const newLink = await activateRecord(true)
                if (newLink && pendingCopyAction) {
                  const previewToken = '15a17b6e-preview-only-dummy-06c941a83c4f'
                  const previewUrl = `${window.location.origin}/onboard/${previewToken}`
                  executeCopy(newLink, 'link')
                }
              } else {
                setDuplicateWarning(null)
                handleGenerate(true)
              }
            }} disabled={isActivating || isChecking}>
              {pendingCopyAction ? 'Merge & Send' : 'Merge & Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManualSubcontractorOnboardingModal 
        isOpen={isManualModalOpen} 
        onClose={() => setIsManualModalOpen(false)} 
      />
    </div>
  )
}
