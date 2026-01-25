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

  const { currentCurrencyCode } = useFilter()

  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [history, setHistory] = useState<BudgetTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const [showBudgetDialog, setShowBudgetDialog] = useState(false)
  const [budgetAction, setBudgetAction] = useState<'ADD' | 'SET'>('ADD')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)

  const currencyLabel = currentCurrencyCode || ''

  const loadCycle = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/v1/cycles?id=${cycleId}`)
      const data = await res.json()
      if (data.status === 'success') {
        const c = (data.cycles || [])[0] as Cycle | undefined
        if (!c) {
          setCycle(null)
          return
        }
        setCycle(c)
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
      const res = await fetch(`/api/v1/cycle-budget-transactions?cycle_id=${cycleId}`)
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
  }, [cycleId])

  const openBudgetDialog = (action: 'ADD' | 'SET') => {
    setBudgetAction(action)
    setBudgetAmount('')
    setBudgetNotes('')
    setShowBudgetDialog(true)
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
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Start Date</CardTitle>
              <CardDescription className="text-xs">Cycle start</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{cycle.start_date ? new Date(cycle.start_date).toLocaleDateString() : 'N/A'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">End Date</CardTitle>
              <CardDescription className="text-xs">Cycle end</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{cycle.end_date ? new Date(cycle.end_date).toLocaleDateString() : 'N/A'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Budget Allotment</CardTitle>
              <CardDescription className="text-xs">Current budget</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencyLabel ? `${currencyLabel} ${budgetValue.toLocaleString()}` : budgetValue.toLocaleString()}
              </div>
            </CardContent>
            <CardFooter className="justify-end" />
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Budget History</CardTitle>
            <CardDescription>All changes to this cycle’s budget</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-medium px-3 py-2">Date</th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-right font-medium px-3 py-2">Delta</th>
                    <th className="text-right font-medium px-3 py-2">Before</th>
                    <th className="text-right font-medium px-3 py-2">After</th>
                    <th className="text-left font-medium px-3 py-2">Notes</th>
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
                      <td className="px-3 py-2">{h.notes || '—'}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-muted-foreground" colSpan={6}>No budget changes yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

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
