'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, UploadCloud, X, Lock } from 'lucide-react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  token: string
  vendor: any
  requiredDocs: string[]
}

type StagedDoc = {
  file: File
  docType: string
  id: string // for multi-file
}

export function OnboardingPortalForm({ token, vendor, requiredDocs }: Props) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Profile Form State
  const [primaryContact, setPrimaryContact] = useState(vendor?.primary_contact_name || '')
  // Primary Phone is read-only from the vendor record now
  const primaryPhone = vendor?.phone_number || ''
  const companyName = vendor?.company_name || ''
  const primaryEmail = vendor?.primary_email || ''
  
  const [taxId, setTaxId] = useState(vendor?.tax_id_ein || '')
  const [addressStreet, setAddressStreet] = useState(vendor?.address_street || '')
  const [addressZip, setAddressZip] = useState(vendor?.address_zip || '')
  const [altEmail, setAltEmail] = useState(vendor?.alt_email || '')
  const [altPhone, setAltPhone] = useState(vendor?.alt_phone || '')

  // Document Upload State
  const [singleFiles, setSingleFiles] = useState<Record<string, File>>({})
  const [coiFiles, setCoiFiles] = useState<StagedDoc[]>([])

  const isLocked = (docName: string) => {
    if (docName === 'W-9 Form' && vendor.w9_file_url) return true
    if (docName === 'Master Subcontractor Agreement (MSA)' && vendor.msa_file_url) return true
    if (docName.includes('OSHA') && vendor.osha_file_url) return true
    return false
  }

  const validateFile = (file: File) => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
    if (!validTypes.includes(file.type)) {
      toast.error('Only PDF, PNG, and JPG files are accepted.')
      return false
    }
    return true
  }

  const handleSingleFileChange = (docName: string, file: File | null) => {
    if (file && !validateFile(file)) return
    setSingleFiles(prev => {
      const updated = { ...prev }
      if (file) updated[docName] = file
      else delete updated[docName]
      return updated
    })
  }

  const handleCoiFileAdd = (files: FileList | null) => {
    if (!files) return
    const validFiles = Array.from(files).filter(validateFile)
    if (validFiles.length === 0) return

    const newDocs: StagedDoc[] = validFiles.map(file => ({
      file,
      docType: 'Certificate of Insurance (COI / ACORD 25)',
      id: crypto.randomUUID()
    }))
    setCoiFiles(prev => [...prev, ...newDocs])
  }

  const handleCoiRemove = (id: string) => {
    setCoiFiles(prev => prev.filter(f => f.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Basic Validation
    if (!primaryContact || !primaryPhone || !taxId || !addressStreet || !addressZip) {
      setError('Please fill out all mandatory contact and profile fields.')
      return
    }

    // Doc Validation
    for (const doc of requiredDocs) {
      if (isLocked(doc)) continue

      if (doc.includes('COI')) {
        if (coiFiles.length === 0) {
          setError(`At least one ACORD 25 file is required for ${doc}.`)
          return
        }
      } else {
        if (!singleFiles[doc]) {
          setError(`${doc} is required.`)
          return
        }
      }
    }

    setIsLoading(true)

    try {
      const supabase = createSupabaseClient()
      const uploadedFileUrls: Array<{ docType: string, fileUrl: string, originalFilename: string, mimeType: string }> = []

      // Helper to upload a file to Supabase
      const uploadFileToSupabase = async (file: File, docType: string) => {
        const ext = file.name.split('.').pop() ?? 'bin'
        const filePath = `${Date.now()}-${crypto.randomUUID()}.${ext}`

        const { data, error } = await supabase.storage
          .from('certificates')
          .upload(filePath, file, { cacheControl: '3600', upsert: false })

        if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`)

        const { data: publicData } = supabase.storage
          .from('certificates')
          .getPublicUrl(filePath)

        uploadedFileUrls.push({
          docType,
          fileUrl: publicData.publicUrl,
          originalFilename: file.name,
          mimeType: file.type
        })
      }

      // Upload all single files
      for (const [docName, file] of Object.entries(singleFiles)) {
        await uploadFileToSupabase(file, docName)
      }

      // Upload COI files
      for (const stagedDoc of coiFiles) {
        await uploadFileToSupabase(stagedDoc.file, stagedDoc.docType)
      }

      // Submit JSON payload to backend
      const res = await fetch('/api/onboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          primary_contact_name: primaryContact,
          primary_phone: primaryPhone,
          tax_id: taxId,
          address_street: addressStreet,
          address_zip: addressZip,
          alt_email: altEmail,
          alt_phone: altPhone,
          files: uploadedFileUrls
        })
      })

      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || 'Submission failed.')

      // Redirect or show success
      router.refresh()
      
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border overflow-hidden">
      
      {/* Section 1: Profile & Contact Details Form */}
      <div className="p-8 border-b">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Company Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-sm font-medium">Company Name</label>
            <Input value={companyName} readOnly className="bg-slate-100 cursor-not-allowed text-slate-600" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Email</label>
            <Input value={primaryEmail} readOnly className="bg-slate-100 cursor-not-allowed text-slate-600" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Phone Number</label>
            <Input value={primaryPhone} readOnly className="bg-slate-100 cursor-not-allowed text-slate-600" />
          </div>
        </div>
        <p className="text-xs text-slate-500 -mt-4 mb-4">Contact risk manager if primary company details need updating.</p>

        <h3 className="text-lg font-bold text-slate-900 mb-4 pt-4 border-t">Additional Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Contact Name <span className="text-red-500">*</span></label>
            <Input value={primaryContact} onChange={e => setPrimaryContact(e.target.value)} placeholder="Jane Doe" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tax ID / EIN <span className="text-red-500">*</span></label>
            <Input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="XX-XXXXXXX" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Business Address <span className="text-red-500">*</span></label>
            <Input value={addressStreet} onChange={e => setAddressStreet(e.target.value)} placeholder="123 Builder Lane" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Business Zip <span className="text-red-500">*</span></label>
            <Input value={addressZip} onChange={e => setAddressZip(e.target.value)} placeholder="10001" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-500">Alternative Email (Optional)</label>
            <Input type="email" value={altEmail} onChange={e => setAltEmail(e.target.value)} placeholder="accounting@acme.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-500">Alternative Phone Number (Optional)</label>
            <Input value={altPhone} onChange={e => setAltPhone(e.target.value)} placeholder="(555) 987-6543" />
          </div>
        </div>
      </div>

      {/* Section 2: Itemized Document Upload Containers */}
      <div className="p-8 bg-slate-50/50">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Compliance Documents</h2>
        
        <div className="space-y-6">
          {requiredDocs.map(doc => {
            const locked = isLocked(doc)
            const isCoi = doc.includes('COI')

            return (
              <div key={doc} className="p-5 border rounded-lg bg-white shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">{doc} {locked ? '' : <span className="text-red-500">*</span>}</h3>
                  {locked && (
                    <span className="flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded">
                      <Lock className="size-3" /> Currently inactive
                    </span>
                  )}
                </div>

                {isCoi && !locked && (
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Please upload valid ACORD 25 Certificate(s) of Insurance covering General Liability, Auto, Workers' Comp, or Umbrella policies. Kindly recheck and remove if there are any irrelevant documents.
                  </p>
                )}

                {locked ? (
                  <div className="p-4 border border-dashed rounded bg-slate-50 text-slate-400 text-sm text-center">
                    This document slot is locked and has already been verified by a manager.
                  </div>
                ) : isCoi ? (
                  <div>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors border-slate-300">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-8 h-8 mb-3 text-slate-400" />
                        <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-slate-500">.pdf, .png, .jpg (Max 25MB)</p>
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        multiple 
                        accept="application/pdf,image/png,image/jpeg"
                        onChange={e => handleCoiFileAdd(e.target.files)} 
                      />
                    </label>

                    {coiFiles.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {coiFiles.map(staged => (
                          <li key={staged.id} className="flex items-center justify-between p-3 border rounded text-sm bg-slate-50">
                            <span className="truncate font-medium text-slate-700">{staged.file.name}</span>
                            <Button type="button" variant="ghost" size="sm" className="h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleCoiRemove(staged.id)}>
                              <X className="size-4 mr-1" /> Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div>
                    {!singleFiles[doc] ? (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors border-slate-300">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <UploadCloud className="w-8 h-8 mb-3 text-slate-400" />
                          <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                          <p className="text-xs text-slate-500">.pdf, .png, .jpg</p>
                        </div>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="application/pdf,image/png,image/jpeg"
                          onChange={e => handleSingleFileChange(doc, e.target.files?.[0] || null)} 
                        />
                      </label>
                    ) : (
                      <div className="flex items-center justify-between p-4 border rounded-lg bg-emerald-50 border-emerald-100 shadow-sm">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="p-2 bg-emerald-100 rounded-md text-emerald-600">
                            <UploadCloud className="size-5" />
                          </div>
                          <span className="truncate font-medium text-emerald-800">{singleFiles[doc].name}</span>
                        </div>
                        <label className="cursor-pointer bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ml-4">
                          Replace File
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="application/pdf,image/png,image/jpeg"
                            onChange={e => handleSingleFileChange(doc, e.target.files?.[0] || null)} 
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Error & Section 3: Form Actions */}
      <div className="p-8 border-t bg-white">
        {error && (
          <div className="mb-4 p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md">
            {error}
          </div>
        )}
        
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} className="min-w-40">
            {isLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            {isLoading ? 'Finalizing...' : 'Submit & Finalize'}
          </Button>
        </div>
      </div>
    </form>
  )
}
