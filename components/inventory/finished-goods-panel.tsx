'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Edit, Plus } from 'lucide-react'

import { useFilter } from '@/lib/context/filter-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { ProductForm } from '@/components/forms/product-form'
import { InventoryLogPanel } from '@/components/inventory/inventory-log-panel'

interface VariantAttribute {
  type: string
  value: string
  unit: string
}

interface ProductVariant {
  id: number
  product_id: number
  label?: string
  unit_cost?: number
  selling_price?: number
  quantity_in_stock: number
  unit_of_measurement?: string
  images?: string[]
  attributes?: VariantAttribute[]
}

interface Product {
  id: number
  product_name: string
  description?: string
  sku?: string
  quantity_in_stock: number
  reorder_level: number
  project_id?: number
  cycle_id?: number
  variants?: ProductVariant[]
}

type V2BalanceByProductVariantId = Map<
  number,
  { inventory_item_variant_id: number; quantity_on_hand: number; avg_unit_cost: number | null }
>

const INVENTORY_PURCHASE_CATEGORY_NAME = 'Product/ Inventory / Stock Purchases'

export function FinishedGoodsPanel() {
  const { selectedProject, selectedCycle, projects, currentCurrencyCode } = useFilter()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [showDetails, setShowDetails] = useState(false)
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)

  const [balancesByProductVariantId, setBalancesByProductVariantId] = useState<V2BalanceByProductVariantId>(new Map())

  const [expenseCategories, setExpenseCategories] = useState<Array<{ id: number; category_name: string }>>([])

  const [showStockDialog, setShowStockDialog] = useState(false)
  const [stockMode, setStockMode] = useState<'purchase' | 'adjust'>('purchase')
  const [stockVariantId, setStockVariantId] = useState('')
  const [stockQuantity, setStockQuantity] = useState('')
  const [stockUnitCost, setStockUnitCost] = useState('')
  const [stockSellingPrice, setStockSellingPrice] = useState('')
  const [stockNotes, setStockNotes] = useState('')
  const [isSavingStock, setIsSavingStock] = useState(false)

  const [logVariantId, setLogVariantId] = useState<number | null>(null)

  const purchaseCategoryId = useMemo(() => {
    const found = expenseCategories.find((c) => c.category_name === INVENTORY_PURCHASE_CATEGORY_NAME)
    return found?.id ?? null
  }, [expenseCategories])

  const projectNameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of projects) m.set(p.id, p.project_name)
    return m
  }, [projects])

  const loadProducts = async () => {
    setLoading(true)
    try {
      if (!selectedProject || !selectedCycle) {
        setProducts([])
        setLoading(false)
        return
      }

      const url = new URL('/api/v1/products', window.location.origin)
      url.searchParams.set('project_id', selectedProject)
      url.searchParams.set('cycle_id', selectedCycle)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to load products')
      }
      setProducts((data.products || []) as Product[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load products')
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const loadExpenseCategories = async (projectId: string | null) => {
    try {
      const url = new URL('/api/v1/expense-categories', window.location.origin)
      if (projectId) url.searchParams.set('projectId', projectId)
      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (data?.status === 'success') {
        setExpenseCategories((data.categories || []) as any[])
      } else {
        setExpenseCategories([])
      }
    } catch {
      setExpenseCategories([])
    }
  }

  const loadV2Balances = async () => {
    if (!selectedProject || !selectedCycle) {
      setBalancesByProductVariantId(new Map())
      return
    }

    try {
      const url = new URL('/api/v1/inventory-items', window.location.origin)
      url.searchParams.set('type_code', 'FINISHED_GOODS')
      url.searchParams.set('project_id', selectedProject)
      url.searchParams.set('cycle_id', selectedCycle)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') {
        setBalancesByProductVariantId(new Map())
        return
      }

      const map: V2BalanceByProductVariantId = new Map()
      for (const item of data.items || []) {
        for (const v of item.variants || []) {
          const sourceProductVariantId = Number((v as any).source_product_variant_id ?? 0) || 0
          if (!sourceProductVariantId) continue

          map.set(sourceProductVariantId, {
            inventory_item_variant_id: Number(v.id),
            quantity_on_hand: Number(v.quantity_on_hand ?? 0) || 0,
            avg_unit_cost: v.avg_unit_cost == null ? null : (Number(v.avg_unit_cost) || null),
          })
        }
      }

      setBalancesByProductVariantId(map)
    } catch {
      setBalancesByProductVariantId(new Map())
    }
  }

  useEffect(() => {
    loadProducts()
  }, [selectedProject, selectedCycle])

  useEffect(() => {
    loadV2Balances()
  }, [selectedProject, selectedCycle])

  useEffect(() => {
    loadExpenseCategories(selectedProject || null)
  }, [selectedProject])

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const filteredProducts = useMemo(() => {
    return (products || []).filter((p) => {
      const matchesSearch = normalizedSearch
        ? (p.product_name || '').toLowerCase().includes(normalizedSearch) || (p.sku || '').toLowerCase().includes(normalizedSearch)
        : true
      return matchesSearch
    })
  }, [products, normalizedSearch])

  const openDetails = (p: Product) => {
    setDetailsProduct(p)
    setShowDetails(true)

    const firstVariantId = p.variants?.[0]?.id
    if (firstVariantId) {
      const v2 = balancesByProductVariantId.get(firstVariantId) || null
      setLogVariantId(v2 ? v2.inventory_item_variant_id : null)
    } else {
      setLogVariantId(null)
    }
  }

  const openStockDialog = (mode: 'purchase' | 'adjust', p: Product) => {
    setDetailsProduct(p)
    setStockMode(mode)
    setShowStockDialog(true)
    setStockVariantId('')
    setStockQuantity('')
    setStockUnitCost('')
    setStockSellingPrice('')
    setStockNotes('')
  }

  const handleSaveStock = async () => {
    const product = detailsProduct
    if (!product) return

    const qty = parseInt(stockQuantity || '0', 10) || 0
    if (qty <= 0) {
      toast.error('Enter a quantity greater than 0')
      return
    }

    if (!selectedProject || !selectedCycle) {
      toast.error('Please select a project and cycle from the top navigation first.')
      return
    }

    if (!stockVariantId) {
      toast.error('Please select a variant')
      return
    }

    if (stockMode === 'purchase') {
      const unitCost = parseFloat(stockUnitCost || '0') || 0
      if (unitCost <= 0) {
        toast.error('Enter a unit cost greater than 0')
        return
      }

      if (!purchaseCategoryId) {
        toast.error(`Missing expense category: ${INVENTORY_PURCHASE_CATEGORY_NAME}`)
        return
      }
    }

    try {
      setIsSavingStock(true)

      const variant = product.variants?.find((v) => v.id === parseInt(stockVariantId, 10))
      const payload: any = {
        type: stockMode === 'purchase' ? 'PURCHASE' : 'ADJUSTMENT_IN',
        project_id: parseInt(selectedProject, 10),
        cycle_id: parseInt(selectedCycle, 10),
        product_id: product.id,
        variant_id: parseInt(stockVariantId, 10),
        quantity: qty,
        notes: stockNotes || null,
      }

      if (stockMode === 'purchase') {
        payload.create_expense = true
        payload.expense_category_id = purchaseCategoryId
        payload.expense_name = variant?.label
          ? `Stock Purchase - ${product.product_name} (${variant.label})`
          : `Stock Purchase - ${product.product_name}`
        payload.unit_cost = parseFloat(stockUnitCost || '0') || 0
        payload.update_variant_unit_cost = parseFloat(stockUnitCost || '0') || null
        payload.update_variant_selling_price = stockSellingPrice.trim() === '' ? null : (parseFloat(stockSellingPrice) || null)
        payload.expense_date = new Date().toISOString()
      } else {
        payload.create_expense = false
      }

      const response = await fetch('/api/v1/inventory-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.status !== 'success') {
        throw new Error(data?.message || 'Failed to update stock')
      }

      toast.success(stockMode === 'purchase' ? 'Stock purchase recorded' : 'Stock adjusted')
      setShowStockDialog(false)
      await loadProducts()
      await loadV2Balances()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update stock')
    } finally {
      setIsSavingStock(false)
    }
  }

  if (!selectedProject || !selectedCycle) {
    return <div className="text-sm text-muted-foreground">Select a project and cycle to view products.</div>
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full md:w-72">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by product name or SKU"
          />
        </div>

        <Button
          onClick={() => {
            if (!selectedProject) {
              toast.error('Please select a project before creating a product')
              return
            }
            if (!selectedCycle) {
              toast.error('Please select a cycle before creating a product')
              return
            }
            setEditingProduct(null)
            setShowForm(true)
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Product / Finished Good
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProducts.map((p) => {
          const projectName = p.project_id ? (projectNameById.get(p.project_id) || 'Unknown') : 'N/A'

          const variants = Array.isArray(p.variants) ? p.variants : []
          const totalQtyV2 = variants.reduce((sum, v) => {
            const b = balancesByProductVariantId.get(v.id)
            return sum + (b ? b.quantity_on_hand : 0)
          }, 0)

          return (
            <Card key={p.id}>
              <CardHeader className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-lg font-semibold">{p.product_name}</CardTitle>
                  {p.sku ? <span className="px-2 py-1 text-xs bg-muted text-foreground rounded">SKU: {p.sku}</span> : null}
                  {variants.length > 0 ? (
                    <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">{variants.length} variant{variants.length > 1 ? 's' : ''}</span>
                  ) : null}
                </div>
                {p.description ? <CardDescription className="text-xs text-muted-foreground">{p.description}</CardDescription> : null}
              </CardHeader>

              <CardContent>
                <div className="text-sm text-muted-foreground">Project: {projectName}</div>
                <div className="text-sm text-muted-foreground">
                  On hand (v2): {selectedProject && selectedCycle ? Number(totalQtyV2).toLocaleString() : '—'}
                </div>
              </CardContent>

              <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => openDetails(p)}>
                  View
                </Button>
                <Button variant="outline" onClick={() => { setEditingProduct(p); setShowForm(true) }}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </CardFooter>
            </Card>
          )
        })}

        {filteredProducts.length === 0 ? (
          <div className="col-span-full bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            No products found.
          </div>
        ) : null}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product / Finished Good' : 'Add Product / Finished Good'}</DialogTitle>
          </DialogHeader>
          <ProductForm
            editingProduct={editingProduct}
            selectedProject={selectedProject}
            selectedCycle={selectedCycle}
            projects={projects}
            onSuccess={() => {
              setShowForm(false)
              setEditingProduct(null)
              loadProducts()
              loadV2Balances()
            }}
            onCancel={() => {
              setShowForm(false)
              setEditingProduct(null)
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailsProduct?.product_name || 'Product / Finished Good'}</DialogTitle>
          </DialogHeader>

          {detailsProduct ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {detailsProduct.sku ? `SKU: ${detailsProduct.sku}` : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => openStockDialog('adjust', detailsProduct)}>
                    Adjust Stock
                  </Button>
                  <Button onClick={() => openStockDialog('purchase', detailsProduct)}>Add Stock (Purchase)</Button>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Variants</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(detailsProduct.variants || []).map((v) => {
                    const b = balancesByProductVariantId.get(v.id) || null
                    const onHand = b ? b.quantity_on_hand : 0
                    const avgCost = b ? b.avg_unit_cost : null
                    const invVariantId = b ? b.inventory_item_variant_id : null

                    return (
                      <div
                        key={v.id}
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-border rounded-md p-3"
                      >
                        <div>
                          <div className="font-medium">{v.label || 'Default variant'}</div>
                          <div className="text-xs text-muted-foreground">
                            On hand (v2): {selectedProject && selectedCycle ? Number(onHand).toLocaleString() : '—'}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Avg cost: {avgCost == null ? '—' : (currentCurrencyCode ? `${currentCurrencyCode} ${Number(avgCost).toLocaleString()}` : Number(avgCost).toLocaleString())}
                        </div>
                        <div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogVariantId(invVariantId)}
                            disabled={!invVariantId}
                          >
                            View Log
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory Log</CardTitle>
                  <CardDescription>Inventory v2 movements for the selected variant</CardDescription>
                </CardHeader>
                <CardContent>
                  <InventoryLogPanel inventoryItemVariantId={logVariantId} />
                </CardContent>
              </Card>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetails(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showStockDialog} onOpenChange={setShowStockDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{stockMode === 'purchase' ? 'Add Stock (Purchase)' : 'Adjust Stock'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Variant</Label>
              <Select value={stockVariantId} onValueChange={setStockVariantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select variant" />
                </SelectTrigger>
                <SelectContent>
                  {(detailsProduct?.variants || []).map((v) => (
                    <SelectItem key={String(v.id)} value={String(v.id)}>
                      {v.label || 'Default variant'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} />
            </div>

            {stockMode === 'purchase' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Unit Cost</Label>
                  <Input type="number" step="0.01" min={0} value={stockUnitCost} onChange={(e) => setStockUnitCost(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Selling Price</Label>
                  <Input type="number" step="0.01" min={0} value={stockSellingPrice} onChange={(e) => setStockSellingPrice(e.target.value)} />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStockDialog(false)} disabled={isSavingStock}>
              Cancel
            </Button>
            <Button onClick={handleSaveStock} disabled={isSavingStock}>
              {isSavingStock ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
