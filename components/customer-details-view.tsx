'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AuthGuard } from '@/components/auth-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CustomerForm, Customer } from '@/components/forms/customer-form'

export function CustomerDetailsView({ customerId, backHref }: { customerId: string; backHref: string }) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)

  const loadCustomer = async () => {
    try {
      setLoading(true)
      const url = new URL('/api/v1/customers', window.location.origin)
      url.searchParams.set('id', customerId)
      const res = await fetch(url.toString())
      const data = await res.json()

      const c = data?.customer as Customer | null | undefined
      if (data?.status !== 'success' || !c) {
        toast.error(data?.message || 'Customer not found')
        setCustomer(null)
        return
      }

      setCustomer(c)
    } catch {
      toast.error('Failed to load customer')
      setCustomer(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!customerId) return
    void loadCustomer()
  }, [customerId])

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  if (!customer) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-4">
          <Button variant="outline" onClick={() => router.push(backHref)}>
            Back
          </Button>
          <div className="text-muted-foreground">Customer not found.</div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Customer Details</h1>
            <div className="text-sm text-muted-foreground">#{customer.id} • {customer.name}</div>
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
              <CardTitle>Edit Customer</CardTitle>
              <CardDescription>Update customer information</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerForm
                editingCustomer={customer}
                onSuccess={() => {
                  void loadCustomer()
                }}
                onCancel={() => router.push(backHref)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Quick customer info</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <div className="text-muted-foreground">Email</div>
                <div className="font-medium">{customer.email || '—'}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Phone</div>
                <div className="font-medium">{customer.phone || customer.phone_number || '—'}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  )
}
