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
import { PnlStatement } from '@/components/pnl-statement';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
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

type ReportView = 'overview' | 'pnl' | 'expenses' | 'sales' | 'budget';

function ReportsPageContent() {
  const { selectedOrganization, selectedProject, selectedCycle, projects, cycles, currentCurrencyCode } = useFilter();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [activeView, setActiveView] = useState<ReportView>('overview');

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

      const response = await fetch(`/api/v1/reports/summary?${params.toString()}`);
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
      <div className="flex flex-col h-[calc(100vh-8rem)] p-6">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 flex flex-wrap items-center gap-3 justify-between">
          <h1 className="text-3xl font-bold">Reports</h1>
          <h2 className="text-xl font-semibold text-muted-foreground">
            {getReportTitle()}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {reportLoading ? (
            <div className="text-center p-8">Loading report...</div>
          ) : summary ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-1">
                  <RadioGroup
                    value={activeView}
                    onValueChange={(value) => setActiveView(value as ReportView)}
                    className="flex flex-wrap gap-2 md:flex-col md:items-start"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="overview" id="overview" />
                      <Label htmlFor="overview" className="text-sm">
                        Overview
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pnl" id="pnl" />
                      <Label htmlFor="pnl" className="text-sm">
                        P&amp;L
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="expenses" id="expenses" />
                      <Label htmlFor="expenses" className="text-sm">
                        Expenses by Category
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sales" id="sales" />
                      <Label htmlFor="sales" className="text-sm">
                        Sales Breakdown
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="budget" id="budget" />
                      <Label htmlFor="budget" className="text-sm">
                        Budget vs Actual
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="md:col-span-4">
                  {activeView === 'overview' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 md:gap-6">
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
                            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                            <div className="text-xl font-bold text-green-600 sm:text-2xl">
                              {currencyLabel
                                ? `${currencyLabel} ${summary.totalRevenue.toLocaleString()}`
                                : summary.totalRevenue.toLocaleString()}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
                            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                            <div className="text-xl font-bold text-red-600 sm:text-2xl">
                              {currencyLabel
                                ? `${currencyLabel} ${summary.totalExpenses.toLocaleString()}`
                                : summary.totalExpenses.toLocaleString()}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
                            <div className="space-y-1">
                              <CardTitle className="text-sm font-medium">Net Profit / Loss</CardTitle>
                              <CardDescription className="text-xs">Revenue - Expenses</CardDescription>
                            </div>
                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                            <div className={`text-xl font-bold sm:text-2xl ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {currencyLabel
                                ? `${currencyLabel} ${summary.netProfit.toLocaleString()}`
                                : summary.netProfit.toLocaleString()}
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
                                ? `${currencyLabel} ${summary.totalBudgetAllotment.toLocaleString()}`
                                : summary.totalBudgetAllotment.toLocaleString()}
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
                      {summary.monthlyTrends && summary.monthlyTrends.length > 0 && (
                        <TrendsChart data={summary.monthlyTrends} />
                      )}
                    </div>
                  )}
                  {activeView === 'pnl' && (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <div>
                        <PnlByProjectChart />
                      </div>
                      <div>
                        <PnlStatement />
                      </div>
                    </div>
                  )}
                  {activeView === 'expenses' && <ExpensesByCategoryChart />}
                  {activeView === 'sales' && <SalesBreakdownChart />}
                  {activeView === 'budget' && <BudgetVsActualChart />}
                </div>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No summary data available for the selected scope.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}

export default function ReportsPage() {
  return <ReportsPageContent />;
}