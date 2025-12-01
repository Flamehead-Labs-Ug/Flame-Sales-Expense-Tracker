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

interface ProjectPnl {
  projectId: number;
  projectName: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export function PnlByProjectChart() {
  const { selectedProject, selectedCycle, currentCurrencyCode } = useFilter();
  const [data, setData] = useState<ProjectPnl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const currencyCode = currentCurrencyCode || 'USD';

  const totalRevenue = data.reduce((sum, item) => sum + item.totalRevenue, 0);
  const totalExpenses = data.reduce((sum, item) => sum + item.totalExpenses, 0);
  const netProfit = totalRevenue - totalExpenses;

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

        const response = await fetch(`/api/reports/pnl-by-project?${params.toString()}`);
        const result = await response.json();

        if (result.status === 'success') {
          setData(result.data || []);
        } else {
          setData([]);
        }
      } catch (error) {
        console.error('Failed to load P&L by project:', error);
        setData([]);
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
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">All projects</div>
            <div className="mt-1 text-lg font-semibold text-green-600">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalRevenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">All projects</div>
            <div className="mt-1 text-lg font-semibold text-red-600">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Net Profit / Loss</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Revenue - Expenses</div>
            <div className={`mt-1 text-lg font-semibold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(netProfit)}
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
