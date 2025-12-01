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

interface SalesBreakdownItem {
  label: string;
  totalSales: number;
}

export function SalesBreakdownChart() {
  const { selectedProject, selectedCycle, currentCurrencyCode } = useFilter();
  const [dimension, setDimension] = useState<'customer' | 'product'>('customer');
  const [data, setData] = useState<SalesBreakdownItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const currencyCode = currentCurrencyCode || 'USD';

  const totalSalesAmount = data.reduce((sum, item) => sum + item.totalSales, 0);

  const chartConfig: ChartConfig = {
    sales: {
      label: 'Sales',
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

    const labelHeader = dimension === 'product' ? 'Product' : 'Customer';
    const headers = [labelHeader, 'Total Sales'];
    const rows = data.map(item => [
      escapeCsvValue(item.label),
      escapeCsvValue(item.totalSales),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const filename = dimension === 'product'
      ? 'sales-breakdown-by-product.csv'
      : 'sales-breakdown-by-customer.csv';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
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
        params.append('dimension', dimension);
        if (selectedProject) {
          params.append('projectId', selectedProject);
        }
        if (selectedCycle) {
          params.append('cycleId', selectedCycle);
        }
        const response = await fetch(`/api/reports/sales-breakdown?${params.toString()}`);
        const result = await response.json();
        if (result.status === 'success') {
          setData(result.data || []);
        } else {
          setData([]);
        }
      } catch (error) {
        console.error('Failed to load sales breakdown:', error);
        setData([]);
      }
      setIsLoading(false);
    };

    loadData();
  }, [selectedProject, selectedCycle, dimension]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales Breakdown</CardTitle>
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
          <CardTitle>Sales Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p>No sales data available to display.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Total Sales</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Current selection</div>
            <div className="mt-1 text-lg font-semibold">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(totalSalesAmount)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-tight">Dimension</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">Grouping mode</div>
            <div className="mt-1 text-lg font-semibold">
              {dimension === 'product' ? 'By Product' : 'By Customer'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
          <CardTitle>Sales Breakdown</CardTitle>
          <div className="flex gap-2 mt-2 md:mt-0">
            <Button
              type="button"
              variant={dimension === 'customer' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDimension('customer')}
            >
              By Customer
            </Button>
            <Button
              type="button"
              variant={dimension === 'product' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDimension('product')}
            >
              By Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
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
                <Bar dataKey="totalSales" name="Sales" fill="var(--color-sales)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.length} item{data.length === 1 ? '' : 's'}
            </div>
            <Button variant="outline" size="sm" type="button" onClick={exportToCsv}>
              Export CSV
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-2 text-left">{dimension === 'product' ? 'Product' : 'Customer'}</th>
                  <th className="py-2 px-2 text-right">Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.label} className="border-b last:border-0">
                    <td className="py-2 px-2 text-left">{item.label}</td>
                    <td className="py-2 px-2 text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(item.totalSales)}
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
