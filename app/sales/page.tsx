'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trash2, Edit, Plus } from 'lucide-react';
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
import { SaleForm } from '@/components/forms/sale-form';

interface Sale {
  id: number;
  project_id?: number;
  product_id?: number;
  // New: specific variant involved in the sale (nullable for legacy rows)
  variant_id?: number;
  customer: string;
  quantity: number;
  unit_cost: number;
  price: number;
  status: string;
  date: string;
  cycle_id?: number;
  cash_at_hand?: number;
  balance?: number;
  sale_date?: string;
  notes?: string;
  created_by: number;
  created_at: string;
}

interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  monthlyTrends?: Array<{
    month: string;
    totalRevenue: number;
    totalExpenses: number;
  }>;
  totalBudgetAllotment: number;
}

interface Project {
  id: number;
  project_name: string;
}

// Variant-level product option used by the Sales form
interface Product {
  // variant id from product_variants
  id: number;
  // parent product id
  product_id: number;
  product_name: string;
  label?: string;
  selling_price?: number;
  unit_cost?: number;
  quantity_in_stock: number;
  unit_of_measurement?: string;
}

const statusOptions = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  { value: 'refunded', label: 'Refunded', color: 'bg-gray-100 text-gray-800' }
];

function SalesPageContent() {
  const { selectedProject, selectedCycle, projects, cycles: globalCycles, setSelectedProject, setSelectedCycle, selectedOrganization, organizations, currentCurrencyCode } = useFilter();
  const currentOrg = organizations.find((org) => org.id.toString() === selectedOrganization);
  const orgCurrencySymbol = currentOrg?.currency_symbol || '$';
  const currencyLabel = currentCurrencyCode || orgCurrencySymbol || '';
  const searchParams = useSearchParams();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    loadData();
    loadProducts();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedProject, selectedCycle]);

  useEffect(() => {
    const open = searchParams.get('open');
    if (open === 'sale') {
      if (!selectedProject || !selectedCycle) {
        toast.error('Please select a project and a cycle from the main navigation first.');
      } else {
        setEditingSale(null);
        setShowForm(true);
      }
    }
  }, [searchParams, selectedProject, selectedCycle]);


  const loadData = async () => {
    try {
      const salesParams: any = { limit: 100 };
      if (selectedProject) salesParams.project_id = parseInt(selectedProject);

      const salesUrl = new URL('/api/sales', window.location.origin)
      if (selectedProject) salesUrl.searchParams.set('project_id', selectedProject)
      if (selectedCycle) salesUrl.searchParams.set('cycle_id', selectedCycle)

      const summaryParams = new URLSearchParams()
      if (selectedProject) summaryParams.set('projectId', selectedProject)
      if (selectedCycle) summaryParams.set('cycleId', selectedCycle)
      const summaryQuery = summaryParams.toString()
      const summaryUrl = summaryQuery
        ? `/api/reports/summary?${summaryQuery}`
        : '/api/reports/summary'

      const [salesRes, summaryRes] = await Promise.all([
        fetch(salesUrl.toString()),
        fetch(summaryUrl),
      ]);

      const salesData = await salesRes.json();
      const summaryData = await summaryRes.json();

      if (salesData.status === 'success') {
        setSales(salesData.sales || []);
      }

      if (summaryData.status === 'success') {
        setSummary(summaryData);
      } else {
        setSummary(null);
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const response = await fetch('/api/products');
      const data = await response.json();
      if (data.status === 'success') {
        const rawProducts = data.products || [];

        // Flatten each product's variants into a variant-level list
        const flattened: Product[] = [];

        for (const p of rawProducts) {
          const variants = Array.isArray(p.variants) ? p.variants : [];

          if (variants.length > 0) {
            for (const v of variants) {
              flattened.push({
                id: v.id, // variant_id
                product_id: p.id,
                product_name: p.product_name,
                label: v.label || undefined,
                unit_cost: v.unit_cost ?? undefined,
                selling_price: v.selling_price ?? undefined,
                quantity_in_stock: v.quantity_in_stock ?? 0,
                unit_of_measurement: v.unit_of_measurement || undefined,
              });
            }
          } else {
            // Fallback: treat the base product row as a single variant
            flattened.push({
              id: p.id,
              product_id: p.id,
              product_name: p.product_name,
              label: p.variant_name || undefined,
              unit_cost: p.unit_cost ?? undefined,
              selling_price: p.selling_price ?? undefined,
              quantity_in_stock: p.quantity_in_stock ?? 0,
              unit_of_measurement: p.unit_of_measurement || undefined,
            });
          }
        }

        setProducts(flattened);
      }
    } catch (error) {
      toast.error('Failed to load products');
    }
  };


  const handleEdit = (sale: Sale) => {
    // Sync global navigation with sale's project and cycle
    if (sale.project_id) {
      setSelectedProject(sale.project_id.toString());
      if (sale.cycle_id) {
        // Wait a bit for cycles to load, then set the cycle
        setTimeout(() => {
          setSelectedCycle(sale.cycle_id!.toString());
        }, 100);
      }
    }
    setEditingSale(sale);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this sale?')) return;

    try {
      const response = await fetch(`/api/sales?id=${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast.success('Sale deleted successfully');
        loadData();
        loadProducts();
      } else {
        toast.error(data.message || 'Failed to delete sale');
      }
    } catch (error) {
      toast.error('Failed to delete sale');
    }
  };

  const getProjectName = (id?: number) => {
    if (!id) return 'N/A';
    const project = projects.find(p => p.id === id);
    return project?.project_name || 'Unknown';
  };

  const getProductInfo = (sale: Sale) => {
    if (!sale.product_id) return 'N/A';

    // Prefer exact variant match when we have variant_id
    let variant: Product | undefined;
    if (sale.variant_id) {
      variant = products.find(p => p.id === sale.variant_id);
    }

    // Fallback: any variant for the product
    if (!variant) {
      variant = products.find(p => p.product_id === sale.product_id);
    }

    if (!variant) return 'Unknown Product';

    const variantLabel = variant.label ? ` - ${variant.label}` : '';
    return `${variant.product_name}${variantLabel}`;
  };

  const getCycleName = (id?: string) => {
    if (!id) return 'No cycle selected';
    const cycle = globalCycles.find(c => c.id === parseInt(id));
    return cycle?.cycle_name || 'Unknown Cycle';
  };

  const getSaleCycleName = (sale?: Sale) => {
    if (!sale?.cycle_id) return 'No cycle';
    const cycle = globalCycles.find(c => c.id === sale.cycle_id);
    return cycle?.cycle_name || 'Unknown Cycle';
  };

  const getStatusBadge = (status: string) => {
    const statusOption = statusOptions.find(s => s.value === status);
    return (
      <Badge className={statusOption?.color || 'bg-gray-100 text-gray-800'}>
        {statusOption?.label || status}
      </Badge>
    );
  };

  const calculateTotal = (quantity: number, price: number) => {
    return quantity * price;
  };

  const calculateProfit = (quantity: number, unitCost: number, price: number) => {
    return (price - unitCost) * quantity;
  };

  const remainingBudget = summary
    ? summary.totalBudgetAllotment - summary.totalExpenses
    : 0;

  let completedSalesCount = 0;
  let completedSalesTotal = 0;
  let pendingSalesCount = 0;
  let pendingOutstandingTotal = 0;
  let cashCollectedTotal = 0;

  for (const sale of sales) {
    const quantity = Number(sale.quantity) || 0;
    const price = Number(sale.price) || 0;
    const total = quantity * price;
    const cashAtHand = Number((sale as any).cash_at_hand ?? 0);
    const balance = Number((sale as any).balance ?? 0);

    if (sale.status === 'completed') {
      completedSalesCount += 1;
      completedSalesTotal += total;
      // For completed sales, prefer explicit cash_at_hand if present; otherwise assume fully paid.
      if (!Number.isNaN(cashAtHand) && cashAtHand > 0) {
        cashCollectedTotal += cashAtHand;
      } else {
        cashCollectedTotal += total;
      }
    } else if (sale.status === 'pending') {
      pendingSalesCount += 1;
      const outstanding = balance > 0 ? balance : Math.max(total - cashAtHand, 0);
      pendingOutstandingTotal += outstanding;

      // For pending sales, cash collected is whatever has already been paid.
      if (!Number.isNaN(cashAtHand) && cashAtHand > 0) {
        cashCollectedTotal += cashAtHand;
      } else if (balance > 0) {
        const inferredCollected = Math.max(total - balance, 0);
        cashCollectedTotal += inferredCollected;
      }
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sales</h1>
        <Button
          onClick={() => {
            if (!selectedProject || !selectedCycle) {
              toast.error('Please select a project and a cycle from the main navigation first.');
            } else {
              setEditingSale(null);
              setShowForm(true);
            }
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Sale
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {currencyLabel
                  ? `${currencyLabel} ${Number(summary.totalRevenue ?? 0).toLocaleString()}`
                  : Number(summary.totalRevenue ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {currencyLabel
                  ? `${currencyLabel} ${Number(summary.totalExpenses ?? 0).toLocaleString()}`
                  : Number(summary.totalExpenses ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-sm font-medium">Net Profit / Loss</CardTitle>
                <CardDescription className="text-xs">Revenue - Expenses</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {currencyLabel
                  ? `${currencyLabel} ${Number(summary.netProfit ?? 0).toLocaleString()}`
                  : Number(summary.netProfit ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash Collected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {currencyLabel
                  ? `${currencyLabel} ${Number(cashCollectedTotal || 0).toLocaleString()}`
                  : Number(cashCollectedTotal || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-500 mb-1">
                {completedSalesCount.toLocaleString()} {completedSalesCount === 1 ? 'sale' : 'sales'}
              </div>
              <div className="text-xl font-bold text-green-600">
                {currencyLabel
                  ? `${currencyLabel} ${Number(completedSalesTotal || 0).toLocaleString()}`
                  : Number(completedSalesTotal || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-500 mb-1">
                {pendingSalesCount.toLocaleString()} {pendingSalesCount === 1 ? 'sale' : 'sales'}
              </div>
              <div className="text-xl font-bold text-yellow-600">
                {currencyLabel
                  ? `${currencyLabel} ${Number(pendingOutstandingTotal || 0).toLocaleString()}`
                  : Number(pendingOutstandingTotal || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSale ? 'Edit Sale' : 'Add New Sale'}</DialogTitle>
          </DialogHeader>
          <SaleForm 
            editingSale={editingSale}
            selectedProject={selectedProject}
            selectedCycle={selectedCycle}
            projects={projects}
            cycles={globalCycles}
            products={products}
            onSuccess={(mode = 'close') => {
                if (mode === 'close') {
                  setShowForm(false);
                }
                setEditingSale(null);
                loadData();
                loadProducts();
            }}
            onCancel={() => {
                setShowForm(false);
                setEditingSale(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <div className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
          {sales.length > 0 ? (
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Date</th>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Customer</th>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Product</th>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-2 text-right font-semibold text-foreground">Quantity</th>
                <th className="px-4 py-2 text-right font-semibold text-foreground">Total Sale</th>
                <th className="px-4 py-2 text-right font-semibold text-foreground">Profit</th>
                <th className="px-4 py-2 text-right font-semibold text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sales.map((sale) => {
                const totalSale = sale.quantity * sale.price;
                const totalCost = sale.quantity * sale.unit_cost;
                const profit = totalSale - totalCost;

                const statusOption = statusOptions.find((s) => s.value === sale.status);
                const statusLabel = statusOption?.label || (typeof sale.status === 'string'
                  ? sale.status.charAt(0).toUpperCase() + sale.status.slice(1)
                  : 'No Status');

                return (
                  <tr key={sale.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {(() => {
                        const dateStr = sale.sale_date || sale.date;
                        if (!dateStr) return 'N/A';
                        return new Date(dateStr).toLocaleDateString();
                      })()}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{sale.customer}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{getProductInfo(sale)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className={statusOption?.color || 'bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium'}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">{sale.quantity}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      {currencyLabel
                        ? `${currencyLabel} ${totalSale.toLocaleString()}`
                        : totalSale.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      {currencyLabel
                        ? `${currencyLabel} ${profit.toLocaleString()}`
                        : profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(sale)}
                          className="inline-flex items-center px-3 py-1.5 border border-border text-xs font-medium rounded-md text-foreground bg-background hover:bg-muted"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(sale.id)}
                          className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-xs font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No sales found. Create your first sale to get started.
            </div>
          )}
        </div>
      </div>
      </div>
    </AuthGuard>
  );
}

export default function SalesPage() {
  return <SalesPageContent />
}