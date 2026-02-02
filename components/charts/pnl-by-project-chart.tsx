'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useFilter } from '@/lib/context/filter-context';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { calcExpenseTotalsByProjectCategory, calcGrossProfit, calcNetProfitFromGrossProfit } from '@/lib/accounting/formulas';

interface ProjectPnl {
  projectId: number;
  projectName: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

interface Expense {
  id: number;
  category_id?: number | null;
  amount: number;
}

interface ExpenseCategory {
  id: number;
  project_category_id?: number | null;
}

interface ProjectCategory {
  id: number;
  category_name: string;
}

export function PnlByProjectChart() {
  const { selectedProject, selectedCycle, currentCurrencyCode } = useFilter();
  const [data, setData] = useState<ProjectPnl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const currencyCode = currentCurrencyCode || 'USD';

  const netSales = data.reduce((sum, item) => sum + item.totalRevenue, 0);
  const { totalCogs, totalOperatingExpenses } = calcExpenseTotalsByProjectCategory(
    expenses,
    categories,
    projectCategories,
  );
  const grossProfit = calcGrossProfit(netSales, totalCogs);
  const netProfitLoss = calcNetProfitFromGrossProfit(grossProfit, totalOperatingExpenses);

  const chartConfig: ChartConfig = {
    revenue: {
      label: 'Revenue',
      color: 'hsl(var(--chart-1))',
    },
    expenses: {
      label: 'Expenses',
      color: 'hsl(var(--chart-2))',
    },
  };

  const exportToCsv = () => {
    if (!data.length) {
      return;
    }

    const escapeCsvValue = (value: string | number) => {
      const str = String(value ?? '');
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const headers = ['Project', 'Revenue', 'Expenses', 'Net Profit'];
    const rows = data.map(item => [
      escapeCsvValue(item.projectName),
      escapeCsvValue(item.totalRevenue),
      escapeCsvValue(item.totalExpenses),
      escapeCsvValue(item.netProfit),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'pnl-by-project.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedProject) {
          params.append('projectId', selectedProject);
        }
        if (selectedCycle) {
          params.append('cycleId', selectedCycle);
        }

        const response = await fetch(`/api/v1/reports/pnl-by-project?${params.toString()}`);
        const result = await response.json();

        const expenseUrl = new URL('/api/v1/expenses', window.location.origin)
        if (selectedProject) expenseUrl.searchParams.set('project_id', selectedProject)
        if (selectedCycle) expenseUrl.searchParams.set('cycle_id', selectedCycle)

        const categoriesUrl = new URL('/api/v1/expense-categories', window.location.origin)
        if (selectedProject) categoriesUrl.searchParams.set('projectId', selectedProject)

        const projectCategoriesUrl = new URL('/api/v1/project-categories', window.location.origin)
        if (selectedProject) projectCategoriesUrl.searchParams.set('projectId', selectedProject)

        const [expensesRes, categoriesRes, projectCategoriesRes] = await Promise.all([
          fetch(expenseUrl.toString()),
          fetch(categoriesUrl.toString()),
          fetch(projectCategoriesUrl.toString()),
        ])

        const expensesData = await expensesRes.json()
        const categoriesData = await categoriesRes.json()
        const projectCategoriesData = await projectCategoriesRes.json()

        if (result.status === 'success') {
          setData(result.data || []);
        } else {
          setData([]);
        }

        if (expensesData.status === 'success') {
          setExpenses(expensesData.expenses || [])
        } else {
          setExpenses([])
        }

        if (categoriesData.status === 'success') {
          setCategories(categoriesData.categories || [])
        } else {
          setCategories([])
        }

        if (projectCategoriesData.status === 'success') {
          setProjectCategories(projectCategoriesData.categories || [])
        } else {
          setProjectCategories([])
        }
      } catch (error) {
        console.error('Failed to load P&L by project:', error);
        setData([]);
        setExpenses([]);
        setCategories([]);
        setProjectCategories([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedProject, selectedCycle]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; Loss by Project</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p>Loading chart data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; Loss by Project</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p>No project data available to display.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 text-sm">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Net Sales</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">All projects</div>
            <div className="mt-1 text-lg font-semibold text-green-600">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(netSales)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Gross Profit</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Net Sales - COGS</div>
            <div className={`mt-1 text-lg font-semibold ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(grossProfit)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Net Profit / Loss</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Gross Profit - Operating Expenses</div>
            <div className={`mt-1 text-lg font-semibold ${netProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(netProfitLoss)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; Loss by Project</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="projectName" />
                <YAxis />
                <Tooltip
                  formatter={(value: number) =>
                    new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: currencyCode,
                    }).format(value)
                  }
                />
                <Legend />
                <Bar dataKey="totalRevenue" name="Revenue" fill="var(--color-revenue)" />
                <Bar dataKey="totalExpenses" name="Expenses" fill="var(--color-expenses)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.length} project{data.length === 1 ? '' : 's'}
            </div>
            <Button variant="outline" size="sm" type="button" onClick={exportToCsv}>
              Export CSV
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-2 text-left">Project</th>
                  <th className="py-2 px-2 text-right">Revenue</th>
                  <th className="py-2 px-2 text-right">Expenses</th>
                  <th className="py-2 px-2 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.projectId} className="border-b last:border-0">
                    <td className="py-2 px-2 text-left">{item.projectName}</td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.totalRevenue)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.totalExpenses)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
