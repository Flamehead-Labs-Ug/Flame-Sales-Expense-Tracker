'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AuthGuard } from '@/components/auth-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SaleForm } from '@/components/forms/sale-form'
import { useFilter } from '@/lib/context/filter-context'

interface Sale {
  id: number
  project_id?: number
  product_id?: number
  variant_id?: number
  customer: string
  quantity: number
  unit_cost: number
  price: number
  status: string
  date: string
  cycle_id?: number
  cash_at_hand?: number
  balance?: number
  sale_date?: string
  notes?: string
  created_by: number
  created_at: string
}

// Variant-level product option used by SaleForm
interface Product {
  id: number
  product_id: number
  product_name: string
  label?: string
  selling_price?: number
  unit_cost?: number
  quantity_in_stock: number
  unit_of_measurement?: string
}

interface Cycle {
  id: number
  cycle_name: string
}

export function SaleDetailsView({ saleId, backHref }: { saleId: string; backHref: string }) {
  const router = useRouter()
  const { selectedProject, selectedCycle, projects, currentCurrencyCode } = useFilter()

  const [loading, setLoading] = useState(true)
  const [sale, setSale] = useState<Sale | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cycles, setCycles] = useState<Cycle[]>([])

  const currencyLabel = currentCurrencyCode || ''

  const projectName = useMemo(() => {
    if (!sale?.project_id) return 'N/A'
    const p = projects.find((x) => x.id === sale.project_id)
    return p?.project_name || 'Unknown'
  }, [projects, sale?.project_id])

  const loadProducts = async () => {
    try {
      const response = await fetch('/api/v1/products')
      const data = await response.json()
      if (data.status !== 'success') return

      const rawProducts = data.products || []
      const flattened: Product[] = []

      for (const p of rawProducts) {
        const variants = Array.isArray(p.variants) ? p.variants : []

        if (variants.length > 0) {
          for (const v of variants) {
            flattened.push({
              id: v.id,
              product_id: p.id,
              product_name: p.product_name,
              label: v.label || undefined,
              unit_cost: v.unit_cost ?? undefined,
              selling_price: v.selling_price ?? undefined,
              quantity_in_stock: v.quantity_in_stock ?? 0,
              unit_of_measurement: v.unit_of_measurement || undefined,
            })
          }
        } else {
          flattened.push({
            id: p.id,
            product_id: p.id,
            product_name: p.product_name,
            label: p.variant_name || undefined,
            unit_cost: p.unit_cost ?? undefined,
            selling_price: p.selling_price ?? undefined,
            quantity_in_stock: p.quantity_in_stock ?? 0,
            unit_of_measurement: p.unit_of_measurement || undefined,
          })
        }
      }

      setProducts(flattened)
    } catch {
    }
  }

  const loadCycles = async (projectId?: number) => {
    try {
      const url = projectId ? `/api/v1/cycles?project_id=${projectId}` : '/api/v1/cycles'
      const response = await fetch(url)
      const data = await response.json()
      if (data.status === 'success') setCycles(data.cycles || [])
    } catch {
      setCycles([])
    }
  }

  const loadSale = async () => {
    try {
      setLoading(true)
      const url = new URL('/api/v1/sales', window.location.origin)
      url.searchParams.set('id', saleId)
      const res = await fetch(url.toString())
      const data = await res.json()

      const s = data?.sale as Sale | null | undefined
      if (data?.status !== 'success' || !s) {
        toast.error(data?.message || 'Sale not found')
        setSale(null)
        return
      }

      const normalizedSale: Sale = {
        ...s,
        customer: (s.customer || (s as any).customer_name || '').toString(),
      }

      setSale(normalizedSale)
      await loadCycles(normalizedSale.project_id)
    } catch {
      toast.error('Failed to load sale')
      setSale(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [])

  useEffect(() => {
    if (!saleId) return
    void loadSale()
  }, [saleId])

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  if (!sale) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-4">
          <Button variant="outline" onClick={() => router.push(backHref)}>
            Back
          </Button>
          <div className="text-muted-foreground">Sale not found.</div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Sale Details</h1>
            <div className="text-sm text-muted-foreground">
              #{sale.id} • Project: {projectName}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(backHref)}>
              Back
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Edit Sale</CardTitle>
              <CardDescription>Update the sale details</CardDescription>
            </CardHeader>
            <CardContent>
              <SaleForm
                editingSale={sale}
                selectedProject={sale.project_id?.toString() || selectedProject}
                selectedCycle={sale.cycle_id?.toString() || selectedCycle}
                projects={projects}
                cycles={cycles}
                products={products}
                onSuccess={() => {
                  void loadSale()
                }}
                onCancel={() => router.push(backHref)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Quick view of key numbers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <div className="text-muted-foreground">Customer</div>
                <div className="font-medium">{sale.customer || '—'}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Status</div>
                <div className="font-medium">{sale.status}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Quantity</div>
                <div className="font-medium">{Number(sale.quantity || 0).toLocaleString()}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Unit Price</div>
                <div className="font-medium">
                  {currencyLabel ? `${currencyLabel} ${Number(sale.price || 0).toFixed(2)}` : Number(sale.price || 0).toFixed(2)}
                </div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Total</div>
                <div className="font-medium">
                  {currencyLabel
                    ? `${currencyLabel} ${(Number(sale.quantity || 0) * Number(sale.price || 0)).toFixed(2)}`
                    : (Number(sale.quantity || 0) * Number(sale.price || 0)).toFixed(2)}
                </div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Created</div>
                <div className="font-medium">{new Date(sale.created_at).toLocaleString()}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  )
}
