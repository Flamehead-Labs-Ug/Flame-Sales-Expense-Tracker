'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useFilter } from '@/lib/context/filter-context';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OrganizationForm } from '@/components/forms/organization-form';

interface Organization {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalBudgetAllotment: number;
}

function OrganizationsPageContent() {
  const { currentCurrencyCode, refreshOrganizations } = useFilter();
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const [orgsRes, summaryRes] = await Promise.all([
        fetch('/api/v1/organizations'),
        fetch('/api/v1/reports/summary'),
      ]);

      const orgsData = await orgsRes.json();
      const summaryData = await summaryRes.json();

      if (orgsData.status === 'success') {
        setOrganizations(orgsData.organizations || []);
      }

      if (summaryData.status === 'success') {
        setSummary(summaryData);
      } else {
        setSummary(null);
      }
    } catch (error) {
      toast.error('Failed to load organizations');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (org: Organization) => {
    setEditingOrganization(org);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    toast.error('Deleting organizations is not supported yet.');
  };

  const totalOrganizations = organizations.length;
  const totalBudgetAllotment = summary?.totalBudgetAllotment ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const remainingSpend = totalBudgetAllotment - totalExpenses;
  const currencyLabel = currentCurrencyCode || '';

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="flex flex-col h-[calc(100vh-8rem)] p-6">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 flex flex-wrap items-center gap-3 justify-between">
          <h1 className="text-3xl font-bold">Organizations</h1>
          <Link href="/setup">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Organization
            </Button>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">
                  {totalOrganizations.toLocaleString()}
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
                    ? `${currencyLabel} ${Number(totalBudgetAllotment ?? 0).toLocaleString()}`
                    : Number(totalBudgetAllotment ?? 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-1 p-3 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-sm font-medium">Remaining Spend</CardTitle>
                <CardDescription className="text-xs">Budget - Expenses</CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className={`text-xl font-bold sm:text-2xl ${remainingSpend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {currencyLabel
                    ? `${currencyLabel} ${Number(remainingSpend ?? 0).toLocaleString()}`
                    : Number(remainingSpend ?? 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {organizations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="bg-card rounded-lg border border-border p-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground">{org.name}</h3>
                    {org.description && (
                      <p className="text-muted-foreground">{org.description}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Created: {new Date(org.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => router.push(`/organizations/${org.id}`)}
                      className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleEdit(org)}
                      className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(org.id)}
                      className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-sm font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
              No organizations found. Create your first organization to get started.
            </div>
          )}

          <Dialog
            open={showForm}
            onOpenChange={(open) => {
              setShowForm(open);
              if (!open) {
                setEditingOrganization(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingOrganization ? 'Edit Organization' : 'Edit Organization'}</DialogTitle>
              </DialogHeader>
              {editingOrganization && (
                <OrganizationForm
                  editingOrganization={editingOrganization}
                  onSuccess={(organization) => {
                    setShowForm(false);
                    setEditingOrganization(null);
                    loadOrganizations();
                    refreshOrganizations();
                  }}
                  onCancel={() => {
                    setShowForm(false);
                    setEditingOrganization(null);
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function OrganizationsPage() {
  return <OrganizationsPageContent />;
}