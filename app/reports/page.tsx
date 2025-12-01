'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { BarChart3, TrendingUp } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { TrendsChart } from '@/components/charts/trends-chart';
import { PnlByProjectChart } from '@/components/charts/pnl-by-project-chart';
import { SalesBreakdownChart } from '@/components/charts/sales-breakdown-chart';
import { BudgetVsActualChart } from '@/components/charts/budget-vs-actual-chart';
import { ExpensesByCategoryChart } from '@/components/expenses-by-category-chart';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useFilter } from '@/lib/context/filter-context';

interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  monthlyTrends: Array<{
    month: string;
    totalRevenue: number;
    totalExpenses: number;
  }>;
  totalBudgetAllotment: number;
}

function ReportsPageContent() {
  const { selectedOrganization, selectedProject, selectedCycle, projects, cycles, currentCurrencyCode } = useFilter();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    loadReportSummary();
  }, [selectedOrganization, selectedProject, selectedCycle]);

  const loadReportSummary = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOrganization) {
        params.append('orgId', selectedOrganization);
      }
      if (selectedProject) {
        params.append('projectId', selectedProject);
      }
      if (selectedCycle) {
        params.append('cycleId', selectedCycle);
      }

      const response = await fetch(`/api/reports/summary?${params.toString()}`);
      const data = await response.json();

      if (data.status === 'success') {
        setSummary(data);
      } else {
        toast.error(data.message || 'Failed to load report summary');
        setSummary(null);
      }
    } catch (error) {
      toast.error('Failed to load report summary');
      setSummary(null);
    } finally {
      setReportLoading(false);
    }
  };

  const getReportTitle = () => {
    if (selectedCycle) {
      const cycle = cycles.find(c => c.id.toString() === selectedCycle);
      return `Report for Cycle: ${cycle?.cycle_name || '...'}`;
    }
    if (selectedProject) {
      const project = projects.find(p => p.id.toString() === selectedProject);
      return `Report for Project: ${project?.project_name || '...'}`;
    }
    return 'Organization Financial Overview';
  };

  const remainingBudget = summary
    ? summary.totalBudgetAllotment - summary.totalExpenses
    : 0;
  const currencyLabel = currentCurrencyCode || '';

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Reports</h1>
        </div>

        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-700">
            {getReportTitle()}
          </h2>
        </div>

        {reportLoading ? (
          <div className="text-center p-8">Loading report...</div>
        ) : summary ? (
          <Tabs defaultValue="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="md:col-span-1">
                <TabsList className="flex md:flex-col h-auto items-stretch">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="pnl">P&amp;L by Project</TabsTrigger>
                  <TabsTrigger value="expenses">Expenses by Category</TabsTrigger>
                  <TabsTrigger value="sales">Sales Breakdown</TabsTrigger>
                  <TabsTrigger value="budget">Budget vs Actual</TabsTrigger>
                </TabsList>
              </div>
              <div className="md:col-span-4">
                <TabsContent value="overview">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-green-600">
                            {currencyLabel
                              ? `${currencyLabel} ${summary.totalRevenue.toLocaleString()}`
                              : summary.totalRevenue.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-red-600">
                            {currencyLabel
                              ? `${currencyLabel} ${summary.totalExpenses.toLocaleString()}`
                              : summary.totalExpenses.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div className="space-y-1">
                            <CardTitle className="text-sm font-medium">Net Profit / Loss</CardTitle>
                            <CardDescription className="text-xs">Revenue - Expenses</CardDescription>
                          </div>
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className={`text-2xl font-bold ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {currencyLabel
                              ? `${currencyLabel} ${summary.netProfit.toLocaleString()}`
                              : summary.netProfit.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Budget Allotment</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {currencyLabel
                              ? `${currencyLabel} ${summary.totalBudgetAllotment.toLocaleString()}`
                              : summary.totalBudgetAllotment.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="space-y-1 pb-2">
                          <CardTitle className="text-sm font-medium">Remaining Spend</CardTitle>
                          <CardDescription className="text-xs">Budget - Expenses</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className={`text-2xl font-bold ${remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {currencyLabel
                              ? `${currencyLabel} ${remainingBudget.toLocaleString()}`
                              : remainingBudget.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    {summary.monthlyTrends && summary.monthlyTrends.length > 0 && (
                      <TrendsChart data={summary.monthlyTrends} />
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="pnl">
                  <PnlByProjectChart />
                </TabsContent>
                <TabsContent value="expenses">
                  <ExpensesByCategoryChart />
                </TabsContent>
                <TabsContent value="sales">
                  <SalesBreakdownChart />
                </TabsContent>
                <TabsContent value="budget">
                  <BudgetVsActualChart />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No summary data available for the selected scope.
            </CardContent>
          </Card>
        )}
      </div>
    </AuthGuard>
  );
}

export default function ReportsPage() {
  return <ReportsPageContent />;
}