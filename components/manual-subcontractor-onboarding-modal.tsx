'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UploadCloud, X, AlertCircle } from 'lucide-react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function ManualSubcontractorOnboardingModal({ isOpen, onClose }: Props) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [w9File, setW9File] = useState<File | null>(null)
  const [coiFile, setCoiFile] = useState<File | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName || !taxId || !address || !email) {
      setError('Please fill all mandatory fields.')
      return
    }

    setIsLoading(true)
    setError(null)
    
    try {
      const supabase = createSupabaseClient()
      const uploadedUrls: { docType: string, fileUrl: string, originalFilename: string, mimeType: string }[] = []

      const upload = async (file: File, docType: string) => {
        const ext = file.name.split('.').pop() ?? 'bin'
        const filePath = `${Date.now()}-${crypto.randomUUID()}.${ext}`

        const { error } = await supabase.storage
          .from('certificates')
          .upload(filePath, file, { cacheControl: '3600', upsert: false })

        if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`)

        const { data: publicData } = supabase.storage.from('certificates').getPublicUrl(filePath)
        
        uploadedUrls.push({
          docType,
          fileUrl: publicData.publicUrl,
          originalFilename: file.name,
          mimeType: file.type
        })
      }

      if (w9File) await upload(w9File, 'W-9 Form')
      if (coiFile) await upload(coiFile, 'Certificate of Insurance (COI / ACORD 25)')

      const res = await fetch('/api/subcontractors/manual-onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          tax_id: taxId,
          address_street: address,
          primary_email: email,
          primary_phone: phone,
          files: uploadedUrls
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit manual onboarding.')

      onClose()
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Onboard Subcontractor Manually</DialogTitle>
          <DialogDescription>
            <span className="flex items-start gap-2 bg-blue-50 text-blue-700 p-3 rounded-md mt-2 border border-blue-100 font-normal">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <span className="text-sm">
                Manual onboarding requires manual data entry. For automated parsing, we recommend using the Remote Onboarding link generated in the Studio.
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Tax ID / EIN *</Label>
              <Input value={taxId} onChange={e => setTaxId(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Primary Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Primary Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Address *</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>W-9 Form</Label>
              <Input type="file" onChange={e => setW9File(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-2">
              <Label>ACORD 25 COI</Label>
              <Input type="file" onChange={e => setCoiFile(e.target.files?.[0] || null)} accept="application/pdf,image/*" />
            </div>
          </div>

          {error && <div className="p-3 text-sm text-rose-600 bg-rose-50 rounded border border-rose-100">{error}</div>}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              {isLoading ? 'Saving...' : 'Submit Documents'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
