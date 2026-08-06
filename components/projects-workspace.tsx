'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Link as LinkIcon, Building2, UserPlus, Loader2, X, HardHat } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ComplianceStatusBadge } from '@/components/compliance-status-badge'
import { formatCurrency } from '@/lib/format'
import type { ProjectRow, VendorInLineup } from '@/lib/types/project'
import type { VendorWithCompliance } from '@/lib/types/vendor'

export function ProjectsWorkspace() {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [lineup, setLineup] = useState<VendorInLineup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLineup, setLoadingLineup] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isAddVendorModalOpen, setIsAddVendorModalOpen] = useState(false)
  
  // Data for the Add Vendor modal
  const [allVendors, setAllVendors] = useState<VendorWithCompliance[]>([])
  const [loadingVendors, setLoadingVendors] = useState(false)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error('Network response was not ok')
      const data = await res.json()
      setProjects(data.projects || [])
      if (data.projects?.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data.projects[0].project_id)
      }
    } catch (err) {
      console.error('Failed to fetch projects', err)
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId])

  const fetchLineup = useCallback(async (projectId: string) => {
    setLoadingLineup(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/lineup`)
      if (!res.ok) throw new Error('Network response was not ok')
      const data = await res.json()
      setLineup(data.vendors || [])
    } catch (err) {
      console.error('Failed to fetch lineup', err)
    } finally {
      setLoadingLineup(false)
    }
  }, [])

  const fetchAllVendors = useCallback(async () => {
    setLoadingVendors(true)
    try {
      const res = await fetch('/api/vendors')
      if (!res.ok) throw new Error('Network response was not ok')
      const data = await res.json()
      setAllVendors(data.vendors || [])
    } catch (err) {
      console.error('Failed to fetch vendors', err)
    } finally {
      setLoadingVendors(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (selectedProjectId) {
      fetchLineup(selectedProjectId)
    } else {
      setLineup([])
    }
  }, [selectedProjectId, fetchLineup])

  const selectedProject = projects.find((p) => p.project_id === selectedProjectId)

  const handleCopyLink = () => {
    if (!selectedProject) return
    const url = `${window.location.origin}/gate/${selectedProject.gatekeeper_access_token}`
    navigator.clipboard.writeText(url)
    alert('Gatekeeper link copied to clipboard!')
  }

  const handleRemoveVendor = async (vendorId: string) => {
    if (!selectedProjectId) return
    try {
      await fetch(`/api/projects/${selectedProjectId}/lineup`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId }),
      })
      fetchLineup(selectedProjectId)
    } catch (err) {
      console.error('Failed to remove vendor', err)
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar: Projects List */}
      <Card className="w-full lg:w-80 shrink-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Projects</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No projects yet.</div>
          ) : (
            <div className="flex flex-col">
              {projects.map((project) => (
                <button
                  key={project.project_id}
                  onClick={() => setSelectedProjectId(project.project_id)}
                  className={`flex flex-col items-start px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    selectedProjectId === project.project_id ? 'bg-muted' : ''
                  }`}
                >
                  <span className="font-medium text-foreground">{project.project_name}</span>
                  <span className="text-xs text-muted-foreground">
                    GL Req: {formatCurrency(Number(project.req_gl_limit))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Area: Lineup Builder */}
      <Card className="flex-1">
        {selectedProject ? (
          <>
            <CardHeader className="flex flex-row items-start justify-between border-b pb-4">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Building2 className="size-5 text-muted-foreground" />
                  {selectedProject.project_name}
                </CardTitle>
                <CardDescription className="mt-1">
                  Required GL: {formatCurrency(Number(selectedProject.req_gl_limit))} | Required Umbrella:{' '}
                  {formatCurrency(Number(selectedProject.req_umbrella_limit))}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyLink}>
                  <LinkIcon className="mr-2 size-4" />
                  Copy Jobsite Link
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    fetchAllVendors()
                    setIsAddVendorModalOpen(true)
                  }}
                >
                  <UserPlus className="mr-2 size-4" />
                  Add Vendor
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLineup ? (
                <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Loading lineup...
                </div>
              ) : lineup.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center">
                  <HardHat className="size-8 mb-2 text-muted-foreground/50" />
                  No vendors assigned to this project yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Trade</TableHead>
                        <TableHead>Compliance Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineup.map((vendor) => (
                        <TableRow key={vendor.lineup_id}>
                          <TableCell className="font-medium">{vendor.company_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {vendor.trade_specialty}
                          </TableCell>
                          <TableCell>
                            {vendor.compliance ? (
                              <ComplianceStatusBadge status={vendor.compliance.status} />
                            ) : (
                              <span className="text-xs text-muted-foreground">Evaluating...</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveVendor(vendor.vendor_id)}
                            >
                              <X className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </>
        ) : (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Select or create a project to manage its lineup.
          </div>
        )}
      </Card>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => {
          setIsCreateModalOpen(false)
          fetchProjects()
        }}
      />

      {/* Add Vendor Modal */}
      {selectedProject && (
        <AddVendorModal
          isOpen={isAddVendorModalOpen}
          onClose={() => setIsAddVendorModalOpen(false)}
          projectId={selectedProject.project_id}
          vendors={allVendors}
          loading={loadingVendors}
          currentLineup={lineup}
          onAdded={() => fetchLineup(selectedProject.project_id)}
        />
      )}
    </div>
  )
}

function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [gl, setGl] = useState('1000000')
  const [umbrella, setUmbrella] = useState('0')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: name,
          req_gl_limit: gl,
          req_umbrella_limit: umbrella,
        }),
      })
      setName('')
      setGl('1000000')
      setUmbrella('0')
      onCreated()
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Define custom insurance requirements for this project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Name</label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., LA Insignia Tower" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Required GL Limit ($)</label>
            <Input type="number" required value={gl} onChange={(e) => setGl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Required Umbrella Limit ($)</label>
            <Input type="number" required value={umbrella} onChange={(e) => setUmbrella(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddVendorModal({
  isOpen,
  onClose,
  projectId,
  vendors,
  loading,
  currentLineup,
  onAdded,
}: {
  isOpen: boolean
  onClose: () => void
  projectId: string
  vendors: VendorWithCompliance[]
  loading: boolean
  currentLineup: VendorInLineup[]
  onAdded: () => void
}) {
  const [search, setSearch] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)

  const lineupIds = new Set(currentLineup.map((v) => v.vendor_id))

  const availableVendors = vendors.filter(
    (v) =>
      !lineupIds.has(v.vendor_id) &&
      v.company_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async (vendorId: string) => {
    setAddingId(vendorId)
    try {
      await fetch(`/api/projects/${projectId}/lineup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId }),
      })
      onAdded()
    } catch (err) {
      console.error(err)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Vendor to Lineup</DialogTitle>
          <DialogDescription>
            Search and select a vendor from the Master Directory.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading vendors...</div>
          ) : availableVendors.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No matching vendors available.
            </div>
          ) : (
            <div className="divide-y">
              {availableVendors.map((vendor) => (
                <div key={vendor.vendor_id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                  <div>
                    <div className="font-medium text-sm">{vendor.company_name}</div>
                    <div className="text-xs text-muted-foreground">{vendor.trade_specialty}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAdd(vendor.vendor_id)}
                    disabled={addingId === vendor.vendor_id}
                  >
                    {addingId === vendor.vendor_id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4 mr-1" />
                    )}
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
