'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFilter } from '@/lib/context/filter-context'
import { calcRemainingBudget } from '@/lib/accounting/formulas'

interface SummaryStats {
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  totalBudgetAllotment: number
}

export function DashboardStats() {
  const { selectedOrganization, selectedProject, selectedCycle, currentCurrencyCode } = useFilter()
  const [stats, setStats] = useState<SummaryStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const url = new URL('/api/v1/reports/summary', window.location.origin)
        if (selectedOrganization) {
          url.searchParams.set('orgId', selectedOrganization)
        }
        if (selectedProject) {
          url.searchParams.set('projectId', selectedProject)
        }
        if (selectedCycle) {
          url.searchParams.set('cycleId', selectedCycle)
        }

        const response = await fetch(url.toString())
        if (response.ok) {
          const data = await response.json()
          if (data.status === 'success') {
            setStats({
              totalRevenue: data.totalRevenue ?? 0,
              totalExpenses: data.totalExpenses ?? 0,
              netProfit: data.netProfit ?? 0,
              totalBudgetAllotment: data.totalBudgetAllotment ?? 0,
            })
          }
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [selectedOrganization, selectedProject, selectedCycle])

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-xl font-bold sm:text-2xl">--</div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const totalRevenue = stats?.totalRevenue ?? 0
  const totalExpenses = stats?.totalExpenses ?? 0
  const netProfit = stats?.netProfit ?? 0
  const totalBudgetAllotment = stats?.totalBudgetAllotment ?? 0
  const remainingBudget = calcRemainingBudget(totalBudgetAllotment, totalExpenses)
  const currencyLabel = currentCurrencyCode || ''

  return (
    <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-3 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-xl font-bold text-green-600 sm:text-2xl">
            {currencyLabel
              ? `${currencyLabel} ${totalRevenue.toLocaleString()}`
              : totalRevenue.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-xl font-bold text-red-600 sm:text-2xl">
            {currencyLabel
              ? `${currencyLabel} ${totalExpenses.toLocaleString()}`
              : totalExpenses.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">Net Profit / Loss</CardTitle>
            <CardDescription className="text-xs">Revenue - Expenses</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className={`text-xl font-bold sm:text-2xl ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {currencyLabel
              ? `${currencyLabel} ${netProfit.toLocaleString()}`
              : netProfit.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium">Budget Allotment</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-xl font-bold sm:text-2xl">
            {currencyLabel
              ? `${currencyLabel} ${totalBudgetAllotment.toLocaleString()}`
              : totalBudgetAllotment.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="space-y-1 p-3 pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium">Remaining Spend</CardTitle>
          <CardDescription className="text-xs">Budget - Expenses</CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className={`text-xl font-bold sm:text-2xl ${remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {currencyLabel
              ? `${currencyLabel} ${remainingBudget.toLocaleString()}`
              : remainingBudget.toLocaleString()}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}