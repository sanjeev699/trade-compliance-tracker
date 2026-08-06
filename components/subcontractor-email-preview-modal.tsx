import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, Mail, Check } from 'lucide-react'
import { useState } from 'react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  body: string
}

export function SubcontractorEmailPreviewModal({ open, onOpenChange, subject, body }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`)
      setCopied(true)
      alert('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      alert('Failed to copy')
    }
  }

  const handleOpenMail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Email Preview</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto py-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-500 uppercase">Subject</p>
            <div className="p-3 bg-slate-50 border rounded-md text-sm font-medium">
              {subject}
            </div>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-500 uppercase">Message Body</p>
            <div className="p-4 bg-slate-50 border rounded-md text-sm whitespace-pre-wrap font-mono">
              {body}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Email Body'}
            </Button>
            <Button onClick={handleOpenMail}>
              <Mail className="size-4 mr-2" />
              Open in Native Mail App
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
