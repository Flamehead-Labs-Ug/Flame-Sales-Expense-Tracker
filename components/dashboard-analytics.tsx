'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useFilter } from '@/lib/context/filter-context'
import { calcNetProfit, calcSaleTotal } from '@/lib/accounting/formulas'

interface Expense {
  id: number
  amount: number
  date_time_created: string
  description?: string
}

interface Sale {
  id: number
  quantity: number
  unit_cost: number
  price: number
  sale_date?: string
  date?: string
  customer: string
}

interface CashflowSummary {
  totalExpenses: number
  totalSales: number
  netProfit: number
}

interface SummaryStats {
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  totalBudgetAllotment: number
}

const DAYS_WINDOW = 30

export function DashboardAnalytics() {
  const { selectedOrganization, selectedProject, selectedCycle, currentCurrencyCode } = useFilter()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<SummaryStats | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const expenseUrl = new URL('/api/v1/expenses', window.location.origin)
        expenseUrl.searchParams.set('limit', '200')
        if (selectedProject) {
          expenseUrl.searchParams.set('project_id', selectedProject)
        }
        if (selectedCycle) {
          expenseUrl.searchParams.set('cycle_id', selectedCycle)
        }

        const salesUrl = new URL('/api/v1/sales', window.location.origin)
        if (selectedProject) {
          salesUrl.searchParams.set('project_id', selectedProject)
        }
        if (selectedCycle) {
          salesUrl.searchParams.set('cycle_id', selectedCycle)
        }

        const summaryUrl = new URL('/api/v1/reports/summary', window.location.origin)
        if (selectedOrganization) {
          summaryUrl.searchParams.set('orgId', selectedOrganization)
        }
        if (selectedProject) {
          summaryUrl.searchParams.set('projectId', selectedProject)
        }
        if (selectedCycle) {
          summaryUrl.searchParams.set('cycleId', selectedCycle)
        }

        const [expensesRes, salesRes, summaryRes] = await Promise.all([
          fetch(expenseUrl.toString()),
          fetch(salesUrl.toString()),
          fetch(summaryUrl.toString()),
        ])

        const expensesData = await expensesRes.json()
        const salesData = await salesRes.json()
        const summaryData = await summaryRes.json()

        if (expensesData.status === 'success') {
          setExpenses(expensesData.expenses || [])
        }
        if (salesData.status === 'success') {
          setSales(salesData.sales || [])
        }
        if (summaryData.status === 'success') {
          setSummary({
            totalRevenue: summaryData.totalRevenue ?? 0,
            totalExpenses: summaryData.totalExpenses ?? 0,
            netProfit: summaryData.netProfit ?? 0,
            totalBudgetAllotment: summaryData.totalBudgetAllotment ?? 0,
          })
        }
      } catch (error) {
        // Fail silently on dashboard; main pages have their own error handling
        console.error('Failed to load dashboard analytics data:', error)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [selectedOrganization, selectedProject, selectedCycle])

  const sinceDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - DAYS_WINDOW)
    return d
  }, [])

  const recentExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        if (!e.date_time_created) return false
        const d = new Date(e.date_time_created)
        return d >= sinceDate
      })
      .slice(0, 20)
  }, [expenses, sinceDate])

  const recentSales = useMemo(() => {
    return sales
      .filter((s) => {
        const dateStr = s.sale_date || s.date
        if (!dateStr) return false
        const d = new Date(dateStr)
        return d >= sinceDate
      })
      .slice(0, 20)
  }, [sales, sinceDate])

  const cashflow: CashflowSummary = useMemo(() => {
    const totalExpenses = recentExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const totalSales = recentSales.reduce(
      (sum, s) => sum + calcSaleTotal(s.quantity || 0, s.price || 0),
      0,
    )
    return {
      totalExpenses,
      totalSales,
      netProfit: calcNetProfit(totalSales, totalExpenses),
    }
  }, [recentExpenses, recentSales])

  const totalRevenue = summary?.totalRevenue ?? cashflow.totalSales
  const totalExpensesValue = summary?.totalExpenses ?? cashflow.totalExpenses
  const netProfitValue = summary?.netProfit ?? cashflow.netProfit
  const budget = summary?.totalBudgetAllotment ?? 0
  const currencyLabel = currentCurrencyCode || ''

  const maxAbs = Math.max(
    Math.abs(totalExpensesValue),
    Math.abs(totalRevenue),
    1,
  )

  if (loading) {
    return null
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Cashflow Summary
          </CardTitle>
          <Link href="/reports">
            <Button variant="outline" size="sm">
              Reports &amp; Analytics
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Total Revenue</span>
              <span>
                {currencyLabel
                  ? `${currencyLabel} ${totalRevenue.toLocaleString()}`
                  : totalRevenue.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-emerald-50 overflow-hidden">
              <div
                className="h-2 rounded-full bg-emerald-500"
                style={{ width: `${(Math.abs(totalRevenue) / maxAbs) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Total Expenses</span>
              <span>
                {currencyLabel
                  ? `${currencyLabel} ${totalExpensesValue.toLocaleString()}`
                  : totalExpensesValue.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-red-50 overflow-hidden">
              <div
                className="h-2 rounded-full bg-red-500"
                style={{ width: `${(Math.abs(totalExpensesValue) / maxAbs) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Net Profit / Loss</span>
              <span className={netProfitValue >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {currencyLabel
                  ? `${currencyLabel} ${netProfitValue.toLocaleString()}`
                  : netProfitValue.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Budget</span>
              <span>
                {currencyLabel
                  ? `${currencyLabel} ${budget.toLocaleString()}`
                  : budget.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">Recent Expenses</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {recentExpenses.length === 0 && (
                  <p className="text-xs text-muted-foreground">No recent expenses.</p>
                )}
                {recentExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between py-1 border-b last:border-b-0 border-gray-100"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{e.description || 'Expense'}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(e.date_time_created).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-2 text-xs font-semibold text-red-600">
                      {currencyLabel
                        ? `-${currencyLabel} ${Number(e.amount || 0).toLocaleString()}`
                        : `-${Number(e.amount || 0).toLocaleString()}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">Recent Sales</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {recentSales.length === 0 && (
                  <p className="text-xs text-muted-foreground">No recent sales.</p>
                )}
                {recentSales.map((s) => {
                  const dateStr = s.sale_date || s.date
                  const total = Number(s.price || 0)
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-1 border-b last:border-b-0 border-gray-100"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{s.customer || 'Sale'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {dateStr ? new Date(dateStr).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <div className="ml-2 text-xs font-semibold text-emerald-600">
                        {currencyLabel
                          ? `+${currencyLabel} ${total.toLocaleString()}`
                          : `+${total.toLocaleString()}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
