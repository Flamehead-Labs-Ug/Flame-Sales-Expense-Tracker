'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrganizationForm } from '@/components/forms/organization-form';
import { useFilter } from '@/lib/context/filter-context';

interface Organization {
  id: number;
  name: string;
  created_at: string;
  country_code?: string | null;
  currency_code?: string | null;
  currency_symbol?: string | null;
}

interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalBudgetAllotment: number;
}

function OrganizationDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const orgId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const { refreshOrganizations, currentCurrencyCode } = useFilter();

  const [org, setOrg] = useState<Organization | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [showEdit, setShowEdit] = useState(false);

  const currencyLabel = useMemo(() => {
    return currentCurrencyCode || org?.currency_code || '';
  }, [currentCurrencyCode, org?.currency_code]);

  const loadOrg = async () => {
    try {
      setLoading(true);
      const [orgRes, summaryRes] = await Promise.all([
        fetch(`/api/v1/organizations?id=${orgId}`),
        fetch(`/api/v1/reports/summary?orgId=${orgId}`),
      ]);

      const orgData = await orgRes.json();
      const summaryData = await summaryRes.json();

      if (orgData.status === 'success') {
        const o = (orgData.organizations || [])[0] as Organization | undefined;
        setOrg(o || null);
      } else {
        toast.error(orgData.message || 'Failed to load organization');
      }

      if (summaryData.status === 'success') {
        setSummary(summaryData);
      } else {
        setSummary(null);
      }
    } catch {
      toast.error('Failed to load organization');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    void loadOrg();
  }, [orgId]);

  const remainingSpend = (summary?.totalBudgetAllotment ?? 0) - (summary?.totalExpenses ?? 0);

  if (loading) return <div className="p-6">Loading...</div>;

  if (!org) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-4">
          <Button variant="outline" onClick={() => router.push('/organizations')}>Back</Button>
          <div className="text-muted-foreground">Organization not found.</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{org.name}</h1>
            <div className="text-sm text-muted-foreground">Created: {new Date(org.created_at).toLocaleDateString()}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/organizations')}>Back</Button>
            <Button variant="outline" onClick={() => setShowEdit(true)}>Edit Organization</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Country</CardTitle>
              <CardDescription className="text-xs">Organization location</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{org.country_code || 'N/A'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Currency</CardTitle>
              <CardDescription className="text-xs">Base currency</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{org.currency_code || 'N/A'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Currency Symbol</CardTitle>
              <CardDescription className="text-xs">Display symbol</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{org.currency_symbol || 'N/A'}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <CardDescription className="text-xs">All time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {currencyLabel ? `${currencyLabel} ${Number(summary?.totalRevenue ?? 0).toLocaleString()}` : Number(summary?.totalRevenue ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <CardDescription className="text-xs">All time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {currencyLabel ? `${currencyLabel} ${Number(summary?.totalExpenses ?? 0).toLocaleString()}` : Number(summary?.totalExpenses ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              <CardDescription className="text-xs">Revenue - Expenses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${Number(summary?.netProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {currencyLabel ? `${currencyLabel} ${Number(summary?.netProfit ?? 0).toLocaleString()}` : Number(summary?.netProfit ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Remaining Spend</CardTitle>
              <CardDescription className="text-xs">Budget - Expenses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${remainingSpend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {currencyLabel ? `${currencyLabel} ${Number(remainingSpend).toLocaleString()}` : Number(remainingSpend).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Organization</DialogTitle>
            </DialogHeader>
            <OrganizationForm
              editingOrganization={org}
              onSuccess={() => {
                setShowEdit(false);
                void loadOrg();
                refreshOrganizations();
              }}
              onCancel={() => setShowEdit(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}

export default function OrganizationDetailsPage() {
  return <OrganizationDetailsPageContent />;
}
