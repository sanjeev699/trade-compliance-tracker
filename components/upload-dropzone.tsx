'use client'

import { useCallback, useRef, useState } from 'react'
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createSupabaseClient } from '@/lib/supabase/client'

const ACCEPTED = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]
const ACCEPTED_EXT = ['.pdf', '.jpg', '.jpeg', '.png']
const MAX_SIZE = 25 * 1024 * 1024

type FileStatus = 'uploading' | 'parsing' | 'done' | 'error'

interface UploadedFile {
  id: string
  name: string
  size: number
  status: FileStatus
  error?: string
}

interface UploadDropzoneProps {
  onUploadComplete?: () => void
}

function isAccepted(file: File) {
  if (ACCEPTED.includes(file.type)) return true
  const lower = file.name.toLowerCase()
  return ACCEPTED_EXT.some((ext) => lower.endsWith(ext))
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status: FileStatus) {
  switch (status) {
    case 'uploading':
      return 'Uploading'
    case 'parsing':
      return 'Extracting data'
    case 'done':
      return 'Complete'
    case 'error':
      return 'Failed'
  }
}

export function UploadDropzone({ onUploadComplete }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const updateFile = useCallback(
    (id: string, patch: Partial<UploadedFile>) => {
      setFiles((prev) =>
        prev.map((file) => (file.id === id ? { ...file, ...patch } : file)),
      )
    },
    [],
  )

  const processFile = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID()
      const entry: UploadedFile = {
        id,
        name: file.name,
        size: file.size,
        status: 'uploading',
      }

      setFiles((prev) => [entry, ...prev])

      try {
        const supabase = createSupabaseClient()
        const ext = file.name.split('.').pop() ?? 'bin'
        const filePath = `${Date.now()}-${crypto.randomUUID()}.${ext}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('certificates')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('certificates').getPublicUrl(uploadData.path)

        updateFile(id, { status: 'parsing' })

        const parseResponse = await fetch('/api/parse-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileUrl: publicUrl,
            originalFilename: file.name,
            mimeType: file.type || null,
          }),
        })

        if (!parseResponse.ok) {
          const payload = await parseResponse.json().catch(() => ({}))
          throw new Error(payload.error ?? 'Failed to parse document')
        }

        updateFile(id, { status: 'done' })
        onUploadComplete?.()
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Upload failed unexpectedly'
        updateFile(id, { status: 'error', error: message })
      }
    },
    [onUploadComplete, updateFile],
  )

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const incoming = Array.from(fileList)
      const valid = incoming.filter(isAccepted)
      const rejected = incoming.length - valid.length
      const oversized = valid.filter((file) => file.size > MAX_SIZE)
      const toUpload = valid.filter((file) => file.size <= MAX_SIZE)

      const messages: string[] = []
      if (rejected > 0) {
        messages.push(
          `${rejected} file(s) skipped — only PDF and image files are accepted.`,
        )
      }
      if (oversized.length > 0) {
        messages.push(
          `${oversized.length} file(s) skipped — maximum size is 25MB.`,
        )
      }

      setError(messages.length > 0 ? messages.join(' ') : null)

      toUpload.forEach((file) => {
        void processFile(file)
      })
    },
    [processFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload compliance document. Drag and drop a PDF or image file, or press Enter to browse."
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragging
            ? 'border-primary bg-accent'
            : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40',
        )}
      >
        <span
          className={cn(
            'flex size-12 items-center justify-center rounded-full transition-colors',
            isDragging
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-accent-foreground',
          )}
        >
          <UploadCloud className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {isDragging
              ? 'Drop to upload'
              : 'Drag & drop certificates or documents here'}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF or image up to 25MB &middot; or{' '}
            <span className="font-medium text-primary">browse files</span>
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : null}

      {files.length > 0 ? (
        <ul className="space-y-2" aria-label="Uploaded files">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <FileText className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)}
                  {file.error ? ` · ${file.error}` : null}
                </p>
              </div>
              <span
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  file.status === 'done' && 'text-success',
                  file.status === 'error' && 'text-destructive',
                  (file.status === 'uploading' || file.status === 'parsing') &&
                    'text-muted-foreground',
                )}
              >
                {file.status === 'uploading' || file.status === 'parsing' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : file.status === 'done' ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="size-4" aria-hidden="true" />
                )}
                {statusLabel(file.status)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${file.name}`}
                disabled={
                  file.status === 'uploading' || file.status === 'parsing'
                }
                onClick={() =>
                  setFiles((prev) => prev.filter((f) => f.id !== file.id))
                }
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
