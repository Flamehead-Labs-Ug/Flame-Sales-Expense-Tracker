'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@stackframe/stack'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DashboardStats } from '@/components/dashboard-stats'
import { DashboardAnalytics } from '@/components/dashboard-analytics';
import { Plus } from 'lucide-react'

export default function HomePage() {
  const user = useUser({ or: 'redirect' })
  const router = useRouter()

  useEffect(() => {
    const initialize = async () => {
      try {
        const orgResponse = await fetch('/api/organizations')
        const orgData = await orgResponse.json()

        if (orgData.status === 'success' && orgData.organizations.length === 0) {
          router.push('/setup')
        }
      } catch (error) {
        console.error(error)
      }
    }

    if (user) {
      initialize()
    }
  }, [router, user])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to Flame Expense Tracker
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => router.push('/expenses?open=expense')}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Expense
          </Button>
          <Button
            onClick={() => router.push('/sales?open=sale')}
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Sale
          </Button>
        </div>
      </div>

      {/* Top-level KPIs */}
      <DashboardStats />

      {/* Analytical overview */}
      <DashboardAnalytics />
    </div>
  )
}