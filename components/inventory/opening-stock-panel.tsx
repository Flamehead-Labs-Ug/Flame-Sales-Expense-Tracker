'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'

import { useFilter } from '@/lib/context/filter-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type InventoryItemVariantOption = {
  id: number
  label: string
  itemName: string
  typeCode: string
}

type Row = {
  rowId: string
  inventory_item_variant_id: string
  quantity_on_hand: string
  unit_cost: string
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function OpeningStockPanel() {
  const { selectedProject, selectedCycle } = useFilter()

  const [variants, setVariants] = useState<InventoryItemVariantOption[]>([])
  const [loading, setLoading] = useState(false)

  const [rows, setRows] = useState<Row[]>([
    { rowId: uid(), inventory_item_variant_id: '', quantity_on_hand: '', unit_cost: '' },
  ])
  const [posting, setPosting] = useState(false)

  const canUse = Boolean(selectedProject && selectedCycle)

  const loadVariants = async () => {
    if (!canUse) {
      setVariants([])
      return
    }

    setLoading(true)
    try {
      const url = new URL('/api/v1/inventory-items', window.location.origin)
      url.searchParams.set('project_id', selectedProject)
      url.searchParams.set('cycle_id', selectedCycle)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to load inventory variants')
      }

      const out: InventoryItemVariantOption[] = []
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
      setVariants(out)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load inventory variants')
      setVariants([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVariants()
  }, [selectedProject, selectedCycle])

  const variantById = useMemo(() => {
    const m = new Map<number, InventoryItemVariantOption>()
    for (const v of variants) m.set(v.id, v)
    return m
  }, [variants])

  const postOpening = async () => {
    if (!canUse) {
      toast.error('Select a project and cycle first')
      return
    }

    const clean = rows
      .map((r) => ({
        inventory_item_variant_id: parseInt(r.inventory_item_variant_id || '0', 10) || null,
        quantity_on_hand: parseInt(r.quantity_on_hand || '0', 10),
        unit_cost: toNumOrNull(r.unit_cost),
      }))
      .filter((r) => r.inventory_item_variant_id)

    if (clean.length === 0) {
      toast.error('Add at least one line')
      return
    }

    setPosting(true)
    try {
      const res = await fetch('/api/v1/inventory-opening-balance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: parseInt(selectedProject, 10),
          cycle_id: parseInt(selectedCycle, 10),
          lines: clean,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to post opening stock')
      }

      toast.success('Opening stock posted')
      setRows([{ rowId: uid(), inventory_item_variant_id: '', quantity_on_hand: '', unit_cost: '' }])
      await loadVariants()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to post opening stock')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="space-y-4">
      {!canUse ? (
        <Card>
          <CardHeader>
            <CardTitle>Opening Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">Select a project and cycle to post opening stock.</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Opening Stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Set the desired on-hand quantity for each item variant. This posts an OPENING_BALANCE adjustment to reach that quantity.
            </div>

            <div className="space-y-3">
              {rows.map((r, idx) => {
                const selectedId = parseInt(r.inventory_item_variant_id || '0', 10) || 0
                const opt = selectedId ? variantById.get(selectedId) : null

                return (
                  <div key={r.rowId} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-6 space-y-2">
                      <Label>Variant</Label>
                      <Select
                        value={r.inventory_item_variant_id}
                        onValueChange={(v) =>
                          setRows((prev) =>
                            prev.map((x) => (x.rowId === r.rowId ? { ...x, inventory_item_variant_id: v } : x)),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loading ? 'Loading...' : 'Select item variant'} />
                        </SelectTrigger>
                        <SelectContent>
                          {variants.map((v) => (
                            <SelectItem key={String(v.id)} value={String(v.id)}>
                              {v.itemName} / {v.label} ({v.typeCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {opt ? (
                        <div className="text-xs text-muted-foreground">
                          {opt.itemName} / {opt.label}
                        </div>
                      ) : null}
                    </div>

                    <div className="md:col-span-3 space-y-2">
                      <Label>Quantity On Hand</Label>
                      <Input
                        type="number"
                        value={r.quantity_on_hand}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x) => (x.rowId === r.rowId ? { ...x, quantity_on_hand: e.target.value } : x)),
                          )
                        }
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label>Unit Cost</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={r.unit_cost}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x) => (x.rowId === r.rowId ? { ...x, unit_cost: e.target.value } : x)),
                          )
                        }
                      />
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((x) => x.rowId !== r.rowId))}
                        disabled={rows.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2 justify-between">
              <Button
                variant="outline"
                type="button"
                onClick={() => setRows((prev) => [...prev, { rowId: uid(), inventory_item_variant_id: '', quantity_on_hand: '', unit_cost: '' }])}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add line
              </Button>

              <Button type="button" onClick={postOpening} disabled={posting}>
                {posting ? 'Posting...' : 'Post Opening Stock'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
