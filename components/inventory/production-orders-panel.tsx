'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'

import { useFilter } from '@/lib/context/filter-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type VariantOption = {
  id: number
  label: string
  itemName: string
  typeCode: string
}

type ProductionOrder = {
  id: number
  project_id: number
  cycle_id: number
  status: string
  output_inventory_item_variant_id: number
  output_quantity: number
  output_unit_cost: number | null
  notes: string | null
  created_at: string
  completed_at: string | null
  inputs: Array<{
    id: number
    input_inventory_item_variant_id: number
    quantity_required: number
    unit_cost_override: number | null
  }>
}

type InputRow = {
  rowId: string
  input_inventory_item_variant_id: string
  quantity_required: string
  unit_cost_override: string
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function ProductionOrdersPanel() {
  const { selectedProject, selectedCycle } = useFilter()

  const canUse = Boolean(selectedProject && selectedCycle)

  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)

  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  const [outputVariantId, setOutputVariantId] = useState('')
  const [outputQty, setOutputQty] = useState('')
  const [inputs, setInputs] = useState<InputRow[]>([
    { rowId: uid(), input_inventory_item_variant_id: '', quantity_required: '', unit_cost_override: '' },
  ])

  const variantById = useMemo(() => {
    const m = new Map<number, VariantOption>()
    for (const v of variantOptions) m.set(v.id, v)
    return m
  }, [variantOptions])

  const loadOrders = async () => {
    if (!canUse) {
      setOrders([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const url = new URL('/api/v1/production-orders', window.location.origin)
      url.searchParams.set('project_id', selectedProject)
      url.searchParams.set('cycle_id', selectedCycle)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to load production orders')
      }
      setOrders((data.orders || []) as ProductionOrder[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load production orders')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const loadVariants = async () => {
    if (!canUse) {
      setVariantOptions([])
      return
    }

    try {
      const url = new URL('/api/v1/inventory-items', window.location.origin)
      url.searchParams.set('project_id', selectedProject)
      url.searchParams.set('cycle_id', selectedCycle)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to load inventory variants')
      }

      const out: VariantOption[] = []
      for (const item of data.items || []) {
        for (const v of item.variants || []) {
          out.push({
            id: Number(v.id),
            label: v.label || v.sku || `#${v.id}`,
            itemName: item.name,
            typeCode: item.type_code,
          })
        }
      }
      setVariantOptions(out)
    } catch (e) {
      setVariantOptions([])
    }
  }

  useEffect(() => {
    loadOrders()
    loadVariants()
  }, [selectedProject, selectedCycle])

  const createOrder = async () => {
    if (!canUse) {
      toast.error('Select a project and cycle first')
      return
    }

    const outputId = parseInt(outputVariantId || '0', 10) || 0
    const outQty = parseInt(outputQty || '0', 10) || 0

    if (!outputId) {
      toast.error('Select an output item')
      return
    }
    if (!outQty) {
      toast.error('Output quantity is required')
      return
    }

    const cleanInputs = inputs
      .map((r) => ({
        input_inventory_item_variant_id: parseInt(r.input_inventory_item_variant_id || '0', 10) || null,
        quantity_required: parseInt(r.quantity_required || '0', 10) || 0,
        unit_cost_override: toNumOrNull(r.unit_cost_override),
      }))
      .filter((r) => r.input_inventory_item_variant_id && r.quantity_required > 0)

    if (cleanInputs.length === 0) {
      toast.error('Add at least one input line')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/v1/production-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: parseInt(selectedProject, 10),
          cycle_id: parseInt(selectedCycle, 10),
          output_inventory_item_variant_id: outputId,
          output_quantity: outQty,
          inputs: cleanInputs,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to create production order')
      }

      toast.success('Production order created')
      setShowCreate(false)
      setOutputVariantId('')
      setOutputQty('')
      setInputs([{ rowId: uid(), input_inventory_item_variant_id: '', quantity_required: '', unit_cost_override: '' }])
      await loadOrders()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create production order')
    } finally {
      setCreating(false)
    }
  }

  const completeOrder = async (id: number) => {
    if (!confirm('Complete this production order? This will post inventory movements.')) return

    try {
      const res = await fetch('/api/v1/production-orders', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status: 'COMPLETED' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to complete production order')
      }
      toast.success('Production order completed')
      await loadOrders()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete production order')
    }
  }

  const deleteOrder = async (id: number) => {
    if (!confirm('Delete this production order?')) return

    try {
      const url = new URL('/api/v1/production-orders', window.location.origin)
      url.searchParams.set('id', String(id))

      const res = await fetch(url.toString(), { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to delete production order')
      }
      toast.success('Production order deleted')
      await loadOrders()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete production order')
    }
  }

  return (
    <div className="space-y-4">
      {!canUse ? (
        <Card>
          <CardHeader>
            <CardTitle>Production Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">Select a project and cycle to manage production orders.</div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Production Order
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{loading ? 'Loading...' : 'Production Orders'}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No production orders yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-foreground">Order</th>
                        <th className="px-4 py-2 text-left font-semibold text-foreground">Output</th>
                        <th className="px-4 py-2 text-left font-semibold text-foreground">Status</th>
                        <th className="px-4 py-2 text-right font-semibold text-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {orders.map((o) => {
                        const outOpt = variantById.get(Number(o.output_inventory_item_variant_id))
                        const outLabel = outOpt
                          ? `${outOpt.itemName} / ${outOpt.label}`
                          : `Variant #${o.output_inventory_item_variant_id}`

                        return (
                          <tr key={o.id} className="hover:bg-muted/50">
                            <td className="px-4 py-2 whitespace-nowrap">#{o.id}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium">{outLabel}</div>
                              <div className="text-xs text-muted-foreground">
                                Qty: {Number(o.output_quantity ?? 0).toLocaleString()}
                                {o.output_unit_cost == null ? '' : ` | Unit cost: ${Number(o.output_unit_cost).toLocaleString()}`}
                              </div>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                                {String(o.status || 'DRAFT')}
                              </span>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-right">
                              <div className="inline-flex gap-2">
                                {String(o.status) !== 'COMPLETED' ? (
                                  <Button variant="outline" size="sm" onClick={() => completeOrder(o.id)}>
                                    Complete
                                  </Button>
                                ) : null}
                                <Button variant="outline" size="sm" onClick={() => deleteOrder(o.id)}>
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create Production Order</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Output Item Variant</Label>
                  <Select value={outputVariantId} onValueChange={setOutputVariantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select output" />
                    </SelectTrigger>
                    <SelectContent>
                      {variantOptions
                        .filter((v) => v.typeCode === 'WORK_IN_PROGRESS' || v.typeCode === 'FINISHED_GOODS')
                        .map((v) => (
                          <SelectItem key={String(v.id)} value={String(v.id)}>
                            {v.itemName} / {v.label} ({v.typeCode})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Output Quantity</Label>
                  <Input type="number" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Inputs</Label>
                <div className="space-y-3">
                  {inputs.map((r) => (
                    <div key={r.rowId} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-6">
                        <Select
                          value={r.input_inventory_item_variant_id}
                          onValueChange={(v) =>
                            setInputs((prev) => prev.map((x) => (x.rowId === r.rowId ? { ...x, input_inventory_item_variant_id: v } : x)))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select input" />
                          </SelectTrigger>
                          <SelectContent>
                            {variantOptions
                              .filter((v) => v.typeCode === 'RAW_MATERIAL' || v.typeCode === 'WORK_IN_PROGRESS')
                              .map((v) => (
                                <SelectItem key={String(v.id)} value={String(v.id)}>
                                  {v.itemName} / {v.label} ({v.typeCode})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="md:col-span-3">
                        <Input
                          type="number"
                          placeholder="Qty"
                          value={r.quantity_required}
                          onChange={(e) =>
                            setInputs((prev) => prev.map((x) => (x.rowId === r.rowId ? { ...x, quantity_required: e.target.value } : x)))
                          }
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Input
                          type="number"
                          step="0.0001"
                          placeholder="Unit cost (optional)"
                          value={r.unit_cost_override}
                          onChange={(e) =>
                            setInputs((prev) => prev.map((x) => (x.rowId === r.rowId ? { ...x, unit_cost_override: e.target.value } : x)))
                          }
                        />
                      </div>

                      <div className="md:col-span-1 flex justify-end">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setInputs((prev) => prev.filter((x) => x.rowId !== r.rowId))}
                          disabled={inputs.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() =>
                      setInputs((prev) => [
                        ...prev,
                        { rowId: uid(), input_inventory_item_variant_id: '', quantity_required: '', unit_cost_override: '' },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add input
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowCreate(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button type="button" onClick={createOrder} disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
