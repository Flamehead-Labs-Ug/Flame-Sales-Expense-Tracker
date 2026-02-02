'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useFilter } from '@/lib/context/filter-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type TxRow = {
  id: number
  created_at: string
  transaction_type: string
  quantity_delta: number
  unit_cost: number | null
  source_type: string | null
  source_id: number | null
  notes: string | null
  type_code: string
  item_name: string
  variant_label: string | null
  variant_sku: string | null
  inventory_item_variant_id: number
}

type VariantOption = {
  id: number
  label: string
  itemName: string
  typeCode: string
}

export function InventoryLogPanel(props: { inventoryItemVariantId?: number | null } = {}) {
  const { selectedProject, selectedCycle } = useFilter()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TxRow[]>([])

  const [typeFilter, setTypeFilter] = useState<string>('ALL_TYPES')
  const [variantFilter, setVariantFilter] = useState<string>(props.inventoryItemVariantId ? String(props.inventoryItemVariantId) : 'ALL_VARIANTS')

  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([])

  const canUse = Boolean(selectedProject && selectedCycle)

  const loadVariantOptions = async () => {
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
        setVariantOptions([])
        return
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
    } catch {
      setVariantOptions([])
    }
  }

  const loadLog = async () => {
    if (!canUse) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const url = new URL('/api/v1/inventory-log', window.location.origin)
      url.searchParams.set('project_id', selectedProject)
      url.searchParams.set('cycle_id', selectedCycle)
      url.searchParams.set('limit', '500')
      if (typeFilter !== 'ALL_TYPES') url.searchParams.set('type_code', typeFilter)
      if (variantFilter !== 'ALL_VARIANTS') url.searchParams.set('inventory_item_variant_id', variantFilter)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to load inventory log')
      }

      setRows((data.transactions || []) as TxRow[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load inventory log')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVariantOptions()
  }, [selectedProject, selectedCycle])

  useEffect(() => {
    if (props.inventoryItemVariantId) {
      setVariantFilter(String(props.inventoryItemVariantId))
    }
  }, [props.inventoryItemVariantId])

  useEffect(() => {
    loadLog()
  }, [selectedProject, selectedCycle, typeFilter, variantFilter])

  const typeOptions = useMemo(() => {
    return [
      { value: 'ALL_TYPES', label: 'All Types' },
      { value: 'RAW_MATERIAL', label: 'Raw Materials' },
      { value: 'WORK_IN_PROGRESS', label: 'Work In Progress' },
      { value: 'FINISHED_GOODS', label: 'Finished Goods' },
    ]
  }, [])

  return (
    <div className="space-y-4">
      {!canUse ? (
        <Card>
          <CardHeader>
            <CardTitle>Inventory Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">Select a project and cycle to view the inventory log.</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{loading ? 'Loading...' : 'Inventory Log'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((o) => (
                      <SelectItem key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={variantFilter} onValueChange={setVariantFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All variants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_VARIANTS">All variants</SelectItem>
                    {variantOptions.map((v) => (
                      <SelectItem key={String(v.id)} value={String(v.id)}>
                        {v.itemName} / {v.label} ({v.typeCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading log...</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No inventory movements for this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Date</th>
                      <th className="px-3 py-2 text-left font-semibold">Type</th>
                      <th className="px-3 py-2 text-left font-semibold">Item</th>
                      <th className="px-3 py-2 text-left font-semibold">Variant</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Unit Cost</th>
                      <th className="px-3 py-2 text-left font-semibold">Source</th>
                      <th className="px-3 py-2 text-left font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/50">
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.transaction_type}</td>
                        <td className="px-3 py-2">{r.item_name}</td>
                        <td className="px-3 py-2">{r.variant_label || r.variant_sku || `#${r.inventory_item_variant_id}`}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.quantity_delta > 0 ? `+${r.quantity_delta}` : r.quantity_delta}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{r.unit_cost == null ? '—' : Number(r.unit_cost).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.source_type ? `${r.source_type}${r.source_id ? ` #${r.source_id}` : ''}` : '—'}
                        </td>
                        <td className="px-3 py-2">{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
