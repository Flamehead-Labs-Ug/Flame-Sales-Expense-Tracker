'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useFilter } from '@/lib/context/filter-context';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

interface MonthlyTrend {
  month: string;
  totalRevenue: number;
  totalExpenses: number;
}

interface TrendsChartProps {
  data: MonthlyTrend[];
}

export function TrendsChart({ data }: TrendsChartProps) {
  const { currentCurrencyCode } = useFilter();
  const currencyCode = currentCurrencyCode || 'USD';
  const formattedData = data.map(item => ({
    ...item,
    month: new Date(item.month).toLocaleString('default', { month: 'short', year: '2-digit' }),
  }));

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Trends (Last 12 Months)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
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
              <Line
                type="monotone"
                dataKey="totalRevenue"
                name="Revenue"
                stroke="var(--color-revenue)"
                activeDot={{ r: 8 }}
              />
              <Line
                type="monotone"
                dataKey="totalExpenses"
                name="Expenses"
                stroke="var(--color-expenses)"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
