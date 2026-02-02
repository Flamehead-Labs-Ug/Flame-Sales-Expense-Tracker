'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AuthGuard } from '@/components/auth-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFilter } from '@/lib/context/filter-context'

interface Cycle {
  id: number
  cycle_name: string
  cycle_number: number
  project_id: number
  start_date?: string
  end_date?: string
  budget_allotment?: number
}

interface BudgetTransaction {
  id: number
  organization_id: number
  project_id?: number
  cycle_id: number
  type: string
  amount_delta: number
  amount_delta_org_ccy: number
  budget_before?: number
  budget_after?: number
  notes?: string
  created_by?: number
  created_at: string
}

function CycleDetailsPageContent() {
  const router = useRouter()
  const params = useParams()
  const cycleId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  const { currentCurrencyCode, selectedOrganization, refreshCycles, setSelectedCycle } = useFilter()

  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [history, setHistory] = useState<BudgetTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    cycle_name: '',
    start_date: '',
    end_date: '',
  })

  const [showBudgetDialog, setShowBudgetDialog] = useState(false)
  const [budgetAction, setBudgetAction] = useState<'ADD' | 'SET'>('ADD')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)

  const currencyLabel = currentCurrencyCode || ''

  const loadCycle = async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      qs.set('id', cycleId)
      if (selectedOrganization) {
        qs.set('org_id', selectedOrganization)
      }
      const res = await fetch(`/api/v1/cycles?${qs.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.status === 'success') {
        const c = (data.cycles || [])[0] as Cycle | undefined
        if (!c) {
          setCycle(null)
          return
        }
        setCycle(c)
        setFormData({
          cycle_name: c.cycle_name || '',
          start_date: c.start_date ? c.start_date.split('T')[0] : '',
          end_date: c.end_date ? c.end_date.split('T')[0] : '',
        })
      } else {
        toast.error(data.message || 'Failed to load cycle')
      }
    } catch {
      toast.error('Failed to load cycle')
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    try {
      const qs = new URLSearchParams()
      qs.set('cycle_id', cycleId)
      if (selectedOrganization) {
        qs.set('org_id', selectedOrganization)
      }
      const res = await fetch(`/api/v1/cycle-budget-transactions?${qs.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.status === 'success') {
        setHistory(data.transactions || [])
      }
    } catch {
    }
  }

  useEffect(() => {
    if (!cycleId) return
    void loadCycle()
    void loadHistory()
  }, [cycleId, selectedOrganization])

  const openBudgetDialog = (action: 'ADD' | 'SET') => {
    setBudgetAction(action)
    setBudgetAmount('')
    setBudgetNotes('')
    setShowBudgetDialog(true)
  }

  const handleSaveCycle = async () => {
    if (!cycle) return

    try {
      setSaving(true)
      const body: any = {
        id: cycle.id,
        project_id: cycle.project_id,
        cycle_number: cycle.cycle_number,
        cycle_name: formData.cycle_name || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
      }

      if (selectedOrganization) {
        body.org_id = selectedOrganization
      }

      const res = await fetch('/api/v1/cycles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to update cycle')
      }

      toast.success('Cycle updated')
      await loadCycle()
      refreshCycles()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update cycle'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCycle = async () => {
    if (!cycle) return
    if (!confirm('Are you sure you want to delete this cycle?')) return

    try {
      const qs = new URLSearchParams()
      qs.set('id', cycle.id.toString())
      if (selectedOrganization) {
        qs.set('org_id', selectedOrganization)
      }

      const res = await fetch(`/api/v1/cycles?${qs.toString()}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to delete cycle')
      }

      toast.success('Cycle deleted')
      setSelectedCycle('')
      refreshCycles()
      router.push('/cycles')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete cycle'
      toast.error(msg)
    }
  }

  const handleSaveBudget = async () => {
    const amt = parseFloat(budgetAmount || '0') || 0
    if (amt <= 0) {
      toast.error('Enter an amount greater than 0')
      return
    }

    try {
      setSavingBudget(true)
      const res = await fetch('/api/v1/cycle-budget-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycle_id: parseInt(cycleId, 10),
          action: budgetAction,
          amount: amt,
          notes: budgetNotes || null,
        }),
      })

      const data = await res.json()
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to update budget')
      }

      toast.success(budgetAction === 'ADD' ? 'Budget added' : 'Budget set')
      setShowBudgetDialog(false)
      await loadCycle()
      await loadHistory()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update budget'
      toast.error(msg)
    } finally {
      setSavingBudget(false)
    }
  }

  const budgetValue = useMemo(() => {
    return Number(cycle?.budget_allotment ?? 0) || 0
  }, [cycle?.budget_allotment])

  if (loading) return <div className="p-6">Loading...</div>

  if (!cycle) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-4">
          <Button variant="outline" onClick={() => router.push('/cycles')}>Back</Button>
          <div className="text-muted-foreground">Cycle not found.</div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{cycle.cycle_name}</h1>
            <div className="text-sm text-muted-foreground">Cycle #{cycle.cycle_number}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/cycles')}>Back</Button>
            <Button variant="outline" onClick={() => openBudgetDialog('SET')}>Set Budget</Button>
            <Button onClick={() => openBudgetDialog('ADD')}>Add Budget</Button>
            <Button variant="outline" onClick={handleDeleteCycle}>Delete</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Edit Cycle</CardTitle>
              <CardDescription>Update this cycle’s details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Cycle Name</label>
                <Input value={formData.cycle_name} onChange={(e) => setFormData((p) => ({ ...p, cycle_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground">Start Date</label>
                  <Input type="date" value={formData.start_date} onChange={(e) => setFormData((p) => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">End Date</label>
                  <Input type="date" value={formData.end_date} onChange={(e) => setFormData((p) => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="outline" onClick={() => loadCycle()} disabled={saving}>Reset</Button>
              <Button onClick={handleSaveCycle} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Key dates, budget, and history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="text-sm">
                  <div className="text-muted-foreground">Start Date</div>
                  <div className="font-medium">{cycle.start_date ? new Date(cycle.start_date).toLocaleDateString() : 'N/A'}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground">End Date</div>
                  <div className="font-medium">{cycle.end_date ? new Date(cycle.end_date).toLocaleDateString() : 'N/A'}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground">Budget</div>
                  <div className="font-medium">{currencyLabel ? `${currencyLabel} ${budgetValue.toLocaleString()}` : budgetValue.toLocaleString()}</div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="text-sm font-medium mb-2">Budget History</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left font-medium px-3 py-2">Date</th>
                        <th className="text-left font-medium px-3 py-2">Type</th>
                        <th className="text-right font-medium px-3 py-2">Delta</th>
                        <th className="text-right font-medium px-3 py-2">Before</th>
                        <th className="text-right font-medium px-3 py-2">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-b border-border/60">
                          <td className="px-3 py-2 whitespace-nowrap">{new Date(h.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{h.type}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{h.amount_delta > 0 ? `+${h.amount_delta}` : h.amount_delta}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{h.budget_before ?? '—'}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{h.budget_after ?? '—'}</td>
                        </tr>
                      ))}
                      {history.length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={5}>No budget changes yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{budgetAction === 'ADD' ? 'Add Budget' : 'Set Budget'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                />
                {budgetAction === 'ADD' && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    This will increase the current budget.
                  </div>
                )}
                {budgetAction === 'SET' && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    This will overwrite the current budget.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Notes</label>
                <Input value={budgetNotes} onChange={(e) => setBudgetNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBudgetDialog(false)} disabled={savingBudget}>Cancel</Button>
              <Button onClick={handleSaveBudget} disabled={savingBudget}>
                {savingBudget ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  )
}

export default function CycleDetailsPage() {
  return <CycleDetailsPageContent />
}
