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

interface BudgetVsActualItem {
  cycleId: number;
  cycleName: string;
  budget: number;
  actualExpenses: number;
  actualRevenue: number;
  variance: number;
}

export function BudgetVsActualChart() {
  const { selectedProject, currentCurrencyCode } = useFilter();
  const [data, setData] = useState<BudgetVsActualItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const currencyCode = currentCurrencyCode || 'USD';

   const totalBudget = data.reduce((sum, item) => sum + item.budget, 0);
   const totalExpenses = data.reduce((sum, item) => sum + item.actualExpenses, 0);
   const totalRevenue = data.reduce((sum, item) => sum + item.actualRevenue, 0);
   const totalVariance = totalBudget - totalExpenses;

  const chartConfig: ChartConfig = {
    budget: {
      label: 'Budget',
      color: 'hsl(var(--chart-1))',
    },
    expenses: {
      label: 'Expenses',
      color: 'hsl(var(--chart-2))',
    },
    revenue: {
      label: 'Revenue',
      color: 'hsl(var(--chart-3))',
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

    const headers = ['Cycle', 'Budget', 'Expenses', 'Revenue', 'Variance'];
    const rows = data.map(item => [
      escapeCsvValue(item.cycleName),
      escapeCsvValue(item.budget),
      escapeCsvValue(item.actualExpenses),
      escapeCsvValue(item.actualRevenue),
      escapeCsvValue(item.variance),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'budget-vs-actual-by-cycle.csv');
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
        const query = params.toString();
        const url = query
          ? `/api/reports/budget-vs-actual?${query}`
          : '/api/reports/budget-vs-actual';
        const response = await fetch(url);
        const result = await response.json();
        if (result.status === 'success') {
          setData(result.data || []);
        } else {
          setData([]);
        }
      } catch (error) {
        console.error('Failed to load budget vs actual data:', error);
        setData([]);
      }
      setIsLoading(false);
    };

    loadData();
  }, [selectedProject]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget vs Actual by Cycle</CardTitle>
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
          <CardTitle>Budget vs Actual by Cycle</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p>No budget or expense data available to display.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Total Budget</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">All cycles</div>
            <div className="mt-1 text-lg font-semibold">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalBudget)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">All cycles</div>
            <div className="mt-1 text-lg font-semibold text-red-600">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">All cycles</div>
            <div className="mt-1 text-lg font-semibold text-green-600">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalRevenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Remaining Budget</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Budget - Expenses</div>
            <div className={`mt-1 text-lg font-semibold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalVariance)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget vs Actual by Cycle</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cycleName" />
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
                <Bar dataKey="budget" name="Budget" fill="var(--color-budget)" />
                <Bar dataKey="actualExpenses" name="Expenses" fill="var(--color-expenses)" />
                <Bar dataKey="actualRevenue" name="Revenue" fill="var(--color-revenue)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.length} cycle{data.length === 1 ? '' : 's'}
            </div>
            <Button variant="outline" size="sm" type="button" onClick={exportToCsv}>
              Export CSV
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-2 text-left">Cycle</th>
                  <th className="py-2 px-2 text-right">Budget</th>
                  <th className="py-2 px-2 text-right">Expenses</th>
                  <th className="py-2 px-2 text-right">Revenue</th>
                  <th className="py-2 px-2 text-right">Remaining Budget</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.cycleId} className="border-b last:border-0">
                    <td className="py-2 px-2 text-left">{item.cycleName}</td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.budget)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.actualExpenses)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.actualRevenue)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.variance)}
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
