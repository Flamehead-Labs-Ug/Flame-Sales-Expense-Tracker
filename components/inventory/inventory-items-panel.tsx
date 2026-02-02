'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

import { useFilter } from '@/lib/context/filter-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type InventoryItemTypeCode = 'RAW_MATERIAL' | 'WORK_IN_PROGRESS' | 'FINISHED_GOODS'

type InventoryItemVariant = {
  id: number
  inventory_item_id: number
  label: string | null
  sku: string | null
  is_active: boolean
  unit_cost: number | null
  selling_price: number | null
  quantity_on_hand?: number
  avg_unit_cost?: number | null
}

type InventoryItem = {
  id: number
  name: string
  sku: string | null
  uom: string | null
  is_active: boolean
  type_code: InventoryItemTypeCode
  variants: InventoryItemVariant[]
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function InventoryItemsPanel({ lockedTypeCode }: { lockedTypeCode?: InventoryItemTypeCode } = {}) {
  const { selectedProject, selectedCycle } = useFilter()

  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<InventoryItemTypeCode>(lockedTypeCode ?? 'RAW_MATERIAL')
  const effectiveTypeFilter: InventoryItemTypeCode = lockedTypeCode ?? typeFilter

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    type_code: (lockedTypeCode ?? 'RAW_MATERIAL') as InventoryItemTypeCode,
    name: '',
    sku: '',
    uom: '',
    default_purchase_unit_cost: '',
    default_sale_price: '',
    variant_label: 'Default',
    variant_sku: '',
  })
  const [creating, setCreating] = useState(false)

  const canCreateHere = effectiveTypeFilter !== 'FINISHED_GOODS'

  const hasBalances = Boolean(selectedProject && selectedCycle)

  const loadItems = async () => {
    setLoading(true)
    try {
      const url = new URL('/api/v1/inventory-items', window.location.origin)
      url.searchParams.set('type_code', effectiveTypeFilter)
      if (selectedProject && selectedCycle) {
        url.searchParams.set('project_id', selectedProject)
        url.searchParams.set('cycle_id', selectedCycle)
      }

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to load inventory items')
      }
      setItems((data.items || []) as InventoryItem[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load inventory items')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
  }, [effectiveTypeFilter, selectedProject, selectedCycle])

  useEffect(() => {
    if (lockedTypeCode) {
      setTypeFilter(lockedTypeCode)
      setCreateForm((p) => ({ ...p, type_code: lockedTypeCode }))
    }
  }, [lockedTypeCode])

  const variantRows = useMemo(() => {
    const rows: Array<{
      itemId: number
      itemName: string
      typeCode: InventoryItemTypeCode
      variant: InventoryItemVariant
    }> = []

    for (const it of items) {
      for (const v of it.variants || []) {
        rows.push({ itemId: it.id, itemName: it.name, typeCode: it.type_code, variant: v })
      }
    }

    return rows
  }, [items])

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('Name is required')
      return
    }

    const createType = lockedTypeCode ?? createForm.type_code

    if (createType === 'FINISHED_GOODS') {
      toast.message('Products / Finished Goods are managed in the Products / Finished Goods tab.')
      return
    }

    setCreating(true)
    try {
      const payload: any = {
        inventory_item_type_code: createType,
        name: createForm.name.trim(),
        sku: createForm.sku.trim() || null,
        uom: createForm.uom.trim() || null,
        default_purchase_unit_cost: toNumOrNull(createForm.default_purchase_unit_cost),
        default_sale_price: toNumOrNull(createForm.default_sale_price),
        variants: [
          {
            label: createForm.variant_label?.trim() || 'Default',
            sku: createForm.variant_sku?.trim() || null,
            unit_cost: toNumOrNull(createForm.default_purchase_unit_cost),
            selling_price: toNumOrNull(createForm.default_sale_price),
          },
        ],
      }

      const res = await fetch('/api/v1/inventory-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to create inventory item')
      }

      toast.success('Inventory item created')
      setShowCreate(false)
      setCreateForm({
        type_code: createForm.type_code,
        name: '',
        sku: '',
        uom: '',
        default_purchase_unit_cost: '',
        default_sale_price: '',
        variant_label: 'Default',
        variant_sku: '',
      })
      await loadItems()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create inventory item')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!lockedTypeCode ? (
            <div className="w-[240px]">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as InventoryItemTypeCode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RAW_MATERIAL">Raw Materials</SelectItem>
                  <SelectItem value="WORK_IN_PROGRESS">Work In Progress</SelectItem>
                  <SelectItem value="FINISHED_GOODS">Finished Goods</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <Button
          onClick={() => {
            if (!canCreateHere) {
              toast.message('Finished Goods are managed in the Finished Goods tab.')
              return
            }
            if (lockedTypeCode) {
              setCreateForm((p) => ({ ...p, type_code: lockedTypeCode }))
            }
            setShowCreate(true)
          }}
          disabled={!canCreateHere}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{loading ? 'Loading...' : 'Items'}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading items...</div>
          ) : variantRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-foreground">Item</th>
                    <th className="px-4 py-2 text-left font-semibold text-foreground">Variant</th>
                    <th className="px-4 py-2 text-right font-semibold text-foreground">On Hand</th>
                    <th className="px-4 py-2 text-right font-semibold text-foreground">Avg Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {variantRows.map((r) => (
                    <tr key={r.variant.id} className="hover:bg-muted/50">
                      <td className="px-4 py-2 whitespace-nowrap">{r.itemName}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{r.variant.label || r.variant.sku || `#${r.variant.id}`}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        {hasBalances ? Number(r.variant.quantity_on_hand ?? 0).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        {hasBalances
                          ? r.variant.avg_unit_cost == null
                            ? '—'
                            : Number(r.variant.avg_unit_cost).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Inventory Item</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!lockedTypeCode ? (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={createForm.type_code}
                  onValueChange={(v) => setCreateForm((p) => ({ ...p, type_code: v as InventoryItemTypeCode }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RAW_MATERIAL">Raw Materials</SelectItem>
                    <SelectItem value="WORK_IN_PROGRESS">Work In Progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={createForm.sku} onChange={(e) => setCreateForm((p) => ({ ...p, sku: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>UOM</Label>
              <Input value={createForm.uom} onChange={(e) => setCreateForm((p) => ({ ...p, uom: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Default Purchase Unit Cost</Label>
              <Input
                type="number"
                step="0.0001"
                value={createForm.default_purchase_unit_cost}
                onChange={(e) => setCreateForm((p) => ({ ...p, default_purchase_unit_cost: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Default Sale Price</Label>
              <Input
                type="number"
                step="0.0001"
                value={createForm.default_sale_price}
                onChange={(e) => setCreateForm((p) => ({ ...p, default_sale_price: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Variant Label</Label>
              <Input
                value={createForm.variant_label}
                onChange={(e) => setCreateForm((p) => ({ ...p, variant_label: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Variant SKU</Label>
              <Input
                value={createForm.variant_sku}
                onChange={(e) => setCreateForm((p) => ({ ...p, variant_sku: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
