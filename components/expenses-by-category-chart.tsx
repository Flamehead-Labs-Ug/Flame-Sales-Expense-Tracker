'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFilter } from '@/lib/context/filter-context';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

interface ExpenseByCategory {
  category_name: string;
  total_amount: number;
}

export function ExpensesByCategoryChart() {
  const { selectedProject, selectedCycle, currentCurrencyCode } = useFilter();
  const [data, setData] = useState<ExpenseByCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const currencyCode = currentCurrencyCode || 'USD';

  const totalExpenses = data.reduce((sum, item) => sum + item.total_amount, 0);

  const chartConfig: ChartConfig = {
    expenses: {
      label: 'Expenses',
      color: 'hsl(var(--chart-1))',
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

    const headers = ['Category', 'Total Expenses'];
    const rows = data.map(item => [
      escapeCsvValue(item.category_name),
      escapeCsvValue(item.total_amount),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'expenses-by-category.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedProject) {
          params.append('projectId', selectedProject);
        }
        if (selectedCycle) {
          params.append('cycleId', selectedCycle);
        }
        const query = params.toString();
        const url = query
          ? `/api/analytics/expenses-by-category?${query}`
          : '/api/analytics/expenses-by-category';
        const response = await fetch(url);
        const result = await response.json();
        if (result.status === 'success') {
          setData(result.data);
        } else {
          setData([]);
        }
      } catch (error) {
        console.error('Failed to fetch expenses by category:', error);
        setData([]);
      }
      setIsLoading(false);
    };

    fetchData();
  }, [selectedProject, selectedCycle]);

  if (isLoading) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px] flex items-center justify-center">
                <p>Loading chart data...</p>
            </CardContent>
        </Card>
    );
  }

  if (data.length === 0) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px] flex items-center justify-center">
                <p>No expense data available to display.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Current selection</div>
            <div className="mt-1 text-lg font-semibold">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Categories</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Distinct expense categories</div>
            <div className="mt-1 text-lg font-semibold">{data.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expenses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category_name" />
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
                <Bar dataKey="total_amount" fill="var(--color-expenses)" name="Total Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.length} categor{data.length === 1 ? 'y' : 'ies'}
            </div>
            <Button variant="outline" size="sm" type="button" onClick={exportToCsv}>
              Export CSV
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-2 text-left">Category</th>
                  <th className="py-2 px-2 text-right">Total Expenses</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.category_name} className="border-b last:border-0">
                    <td className="py-2 px-2 text-left">{item.category_name}</td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.total_amount)}
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
