'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Edit, Plus, Search } from 'lucide-react';
import { useFilter } from '@/lib/context/filter-context';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExpenseForm } from '@/components/forms/expense-form';

// Shared interfaces - consider moving to a types file
interface Expense {
  id: number;
  project_id?: number;
  cycle_id?: number;
  category_id?: number;
  vendor_id?: number;
  payment_method_id?: number;
  expense_name?: string;
  description: string;
  amount: number;
  date_time_created: string;
  created_by: number;
  created_at: string;
}

interface Project {
  id: number;
  project_name: string;
  project_category_id?: number | null;
}

interface ExpenseCategory {
  id: number;
  category_name: string;
  project_category_id?: number | null;
}

interface Vendor {
  id: number;
  vendor_name: string;
}

interface PaymentMethod {
  id: number;
  payment_method: string;
}

interface ProjectCategory {
  id: number;
  category_name: string;
}

interface Cycle {
    id: number;
    cycle_name: string;
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

function ExpensesPageContent() {
  const { selectedProject, selectedCycle, projects, cycles: globalCycles, setSelectedProject, setSelectedCycle, currentCurrencyCode } = useFilter();
  const searchParams = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<number[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedProject, selectedCycle]);

  useEffect(() => {
    const open = searchParams.get('open');
    if (open === 'expense') {
      if (!selectedProject || !selectedCycle) {
        toast.error('Please select a project and a cycle from the main navigation first.');
      } else {
        setEditingExpense(null);
        setShowForm(true);
      }
    }
  }, [searchParams, selectedProject, selectedCycle]);

  const loadData = async () => {
    setLoading(true);
    try {
      const expenseUrl = new URL('/api/expenses', window.location.origin)
      if (selectedProject) expenseUrl.searchParams.set('project_id', selectedProject)
      if (selectedCycle) expenseUrl.searchParams.set('cycle_id', selectedCycle)

      const categoriesUrl = new URL('/api/expense-categories', window.location.origin)
      if (selectedProject) categoriesUrl.searchParams.set('projectId', selectedProject)

      const projectCategoriesUrl = new URL('/api/project-categories', window.location.origin)
      if (selectedProject) projectCategoriesUrl.searchParams.set('projectId', selectedProject)

      const summaryParams = new URLSearchParams()
      if (selectedProject) summaryParams.set('projectId', selectedProject)
      if (selectedCycle) summaryParams.set('cycleId', selectedCycle)
      const summaryQuery = summaryParams.toString()
      const summaryUrl = summaryQuery
        ? `/api/reports/summary?${summaryQuery}`
        : '/api/reports/summary'

      const [expensesRes, categoriesRes, vendorsRes, paymentMethodsRes, projectCategoriesRes, cyclesRes, summaryRes] = await Promise.all([
        fetch(expenseUrl.toString()),
        fetch(categoriesUrl.toString()),
        fetch('/api/vendors'),
        fetch('/api/payment-methods'),
        fetch(projectCategoriesUrl.toString()),
        fetch(selectedProject ? `/api/cycles?project_id=${selectedProject}` : '/api/cycles'),
        fetch(summaryUrl),
      ]);

      const expensesData = await expensesRes.json();
      const categoriesData = await categoriesRes.json();
      const vendorsData = await vendorsRes.json();
      const paymentMethodsData = await paymentMethodsRes.json();
      const projectCategoriesData = await projectCategoriesRes.json();
      const cyclesData = await cyclesRes.json();
      const summaryData = await summaryRes.json();

      if (expensesData.status === 'success') setExpenses(expensesData.expenses || []);
      if (categoriesData.status === 'success') setCategories(categoriesData.categories || []);
      if (vendorsData.status === 'success') setVendors(vendorsData.vendors || []);
      if (paymentMethodsData.status === 'success') setPaymentMethods(paymentMethodsData.payment_methods || []);
      if (projectCategoriesData.status === 'success') setProjectCategories(projectCategoriesData.categories || []);
      if (cyclesData.status === 'success') setCycles(cyclesData.cycles || []);
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

  const toggleSelectExpense = (id: number) => {
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllExpenses = () => {
    if (selectedExpenseIds.length === expenses.length) {
      setSelectedExpenseIds([]);
    } else {
      setSelectedExpenseIds(expenses.map((e) => e.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedExpenseIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedExpenseIds.length} expense(s)?`)) return;

    try {
      const deletePromises = selectedExpenseIds.map(id => fetch(`/api/expenses?id=${id}`, { method: 'DELETE' }));
      await Promise.all(deletePromises);
      toast.success(`Deleted ${selectedExpenseIds.length} expense(s) successfully`);
      setSelectedExpenseIds([]);
      loadData();
    } catch (error) {
      toast.error('Failed to delete selected expenses');
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      const response = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.status === 'success') {
        toast.success('Expense deleted successfully');
        loadData();
      } else {
        toast.error(data.message || 'Failed to delete expense');
      }
    } catch (error) {
      toast.error('Failed to delete expense');
    }
  };

  const handleSearch = async () => {
    // The loadData function will handle search if searchTerm is set
    loadData(); 
  };

  const getProjectName = (id?: number) => projects.find(p => p.id === id)?.project_name || 'N/A';
  const getCategoryName = (id?: number) => categories.find(c => c.id === id)?.category_name || 'N/A';
  const getVendorName = (id?: number) => vendors.find(v => v.id === id)?.vendor_name || 'N/A';
  const getPaymentMethodName = (id?: number) => paymentMethods.find(m => m.id === id)?.payment_method || 'N/A';

  const remainingBudget = summary
    ? summary.totalBudgetAllotment - summary.totalExpenses
    : 0;
  const currencyLabel = currentCurrencyCode || '';

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Expenses</h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                if (!selectedProject || !selectedCycle) {
                  toast.error('Please select a project and a cycle from the main navigation first.');
                } else {
                  setEditingExpense(null);
                  setShowForm(true);
                }
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={selectedExpenseIds.length === 0}
              onClick={handleBulkDelete}
            >
              Delete Selected ({selectedExpenseIds.length})
            </Button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Budget Allotment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currencyLabel
                    ? `${currencyLabel} ${Number(summary.totalBudgetAllotment ?? 0).toLocaleString()}`
                    : Number(summary.totalBudgetAllotment ?? 0).toLocaleString()}
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
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="text-sm font-medium">Remaining Spend</CardTitle>
                <CardDescription className="text-xs">Budget - Expenses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {currencyLabel
                    ? `${currencyLabel} ${Number(remainingBudget ?? 0).toLocaleString()}`
                    : Number(remainingBudget ?? 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch}>
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
        </div>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
            </DialogHeader>
            <div className="p-6">
              <ExpenseForm 
                editingExpense={editingExpense}
                selectedProject={selectedProject}
                selectedCycle={selectedCycle}
                projects={projects}
                cycles={cycles}
                categories={categories}
                vendors={vendors}
                paymentMethods={paymentMethods}
                projectCategories={projectCategories}
                setCategories={setCategories}
                setVendors={setVendors}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingExpense(null);
                  loadData();
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditingExpense(null);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>

        <div className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
            {expenses.length > 0 ? (
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectedExpenseIds.length > 0 && selectedExpenseIds.length === expenses.length}
                      onChange={toggleSelectAllExpenses}
                    />
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Date</th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Project</th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Expense</th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Category</th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Vendor</th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Payment Method</th>
                  <th className="px-4 py-2 text-right font-semibold text-foreground">Amount</th>
                  <th className="px-4 py-2 text-right font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedExpenseIds.includes(expense.id)}
                        onChange={() => toggleSelectExpense(expense.id)}
                      />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{new Date(expense.date_time_created).toLocaleDateString()}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{getProjectName(expense.project_id)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{expense.expense_name}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{getCategoryName(expense.category_id)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{getVendorName(expense.vendor_id)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{getPaymentMethodName(expense.payment_method_id)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {currentCurrencyCode
                        ? `${currentCurrencyCode} ${Number(expense.amount ?? 0).toFixed(2)}`
                        : Number(expense.amount ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(expense)} className="text-blue-600 hover:text-blue-800">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-800">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No expenses found.
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function ExpensesPage() {
  return <ExpensesPageContent />;
}