'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Trash2, Edit, Plus } from 'lucide-react';
import { useFilter } from '@/lib/context/filter-context';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Cycle {
  id: number;
  cycle_name: string;
  cycle_number: number;
  project_id: number;
  start_date?: string;
  end_date?: string;
  budget_allotment?: number;
  created_by: number;
  created_at: string;
}

interface Project {
  id: number;
  project_name: string;
}

interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalBudgetAllotment: number;
}

function CyclesPageContent() {
  const { selectedProject, projects, refreshCycles, currentCurrencyCode, setSelectedCycle } = useFilter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCycle, setEditingCycle] = useState<Cycle | null>(null);
  const [filteredCycles, setFilteredCycles] = useState<Cycle[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  const [formData, setFormData] = useState({
    cycle_number: '',
    start_date: '',
    end_date: '',
    budget_allotment: ''
  });

  useEffect(() => {
    loadData();
  }, [selectedProject]);

  useEffect(() => {
    if (searchParams?.get('new') !== '1') return;

    if (!selectedProject) {
      toast.error('Please select a project from the main navigation first.');
      return;
    }

    setEditingCycle(null);
    setShowForm(true);
  }, [searchParams, selectedProject]);

  const loadData = async () => {
    try {
      const cyclesRes = await fetch('/api/v1/cycles');

      const cyclesData = await cyclesRes.json();

      if (cyclesData.status === 'success') {
        setCycles(cyclesData.cycles || []);
      }

      const summaryParams = new URLSearchParams();
      if (selectedProject) {
        summaryParams.set('projectId', selectedProject);
      }
      const summaryQuery = summaryParams.toString();
      const summaryUrl = summaryQuery
        ? `/api/v1/reports/summary?${summaryQuery}`
        : '/api/v1/reports/summary';

      const summaryRes = await fetch(summaryUrl);
      const summaryData = await summaryRes.json();

      if (summaryData.status === 'success') {
        setSummary(summaryData);
      } else {
        setSummary(null);
      }
    } catch (error) {
      toast.error('Failed to load data');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    const cycleNumber = parseInt(formData.cycle_number);
    const params = {
      cycle_name: `Cycle ${cycleNumber}`,
      cycle_number: cycleNumber,
      project_id: parseInt(selectedProject),
      ...(formData.start_date && { start_date: formData.start_date }),
      ...(formData.end_date && { end_date: formData.end_date }),
      ...(formData.budget_allotment && { budget_allotment: parseFloat(formData.budget_allotment) })
    };

    try {
      const response = await fetch('/api/v1/cycles', {
        method: editingCycle ? 'PUT' : 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingCycle ? { id: editingCycle.id, ...params } : params)
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast.success(editingCycle ? 'Cycle updated successfully' : 'Cycle created successfully');
        // Keep global navigation in sync with the last created/edited cycle
        if (data.cycle?.id) {
          setSelectedCycle(data.cycle.id.toString());
        }
        setShowForm(false);
        setEditingCycle(null);
        setFormData({
          cycle_number: '',
          start_date: '',
          end_date: '',
          budget_allotment: ''
        });
        loadData();
        refreshCycles(); // Refresh the global cycles list
      } else {
        toast.error(data.message || 'Operation failed');
      }
    } catch (error) {
      toast.error('Failed to save cycle');
    }
  };

  const handleEdit = (cycle: Cycle) => {
    setEditingCycle(cycle);
    setFormData({
      cycle_number: cycle.cycle_number.toString(),
      start_date: cycle.start_date ? cycle.start_date.split('T')[0] : '',
      end_date: cycle.end_date ? cycle.end_date.split('T')[0] : '',
      budget_allotment: cycle.budget_allotment?.toString() || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this cycle?')) return;

    try {
      const response = await fetch(`/api/v1/cycles?id=${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast.success('Cycle deleted successfully');
        loadData();
        refreshCycles(); // Refresh the global cycles list
      } else {
        toast.error(data.message || 'Failed to delete cycle');
      }
    } catch (error) {
      toast.error('Failed to delete cycle');
    }
  };

  const getProjectName = (id: number) => {
    const project = projects.find(p => p.id === id);
    return project?.project_name || 'Unknown Project';
  };



  const getAvailableCycleNumbers = () => {
    if (!selectedProject) return [];
    const projectCycles = cycles.filter(c => c.project_id === parseInt(selectedProject));
    const usedNumbers = projectCycles.map(c => c.cycle_number);
    const maxUsed = usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0;
    const maxCycles = Math.max(4, maxUsed + 1);
    const available = [];
    for (let i = 1; i <= maxCycles; i++) {
      if (!usedNumbers.includes(i)) {
        available.push(i);
      }
    }
    return available;
  };

  useEffect(() => {
    if (selectedProject) {
      const filtered = cycles.filter(cycle => cycle.project_id === parseInt(selectedProject));
      setFilteredCycles(filtered);
    } else {
      // When no project is selected, show all cycles across all projects
      setFilteredCycles(cycles);
    }
  }, [cycles, selectedProject]);

  const now = new Date();

  const activeCyclesCount = filteredCycles.filter((cycle) => {
    const start = cycle.start_date ? new Date(cycle.start_date) : null;
    const end = cycle.end_date ? new Date(cycle.end_date) : null;

    if (start && start > now) return false;
    if (end && end < now) return false;
    return true;
  }).length;

  const endedCyclesCount = filteredCycles.filter((cycle) => {
    const end = cycle.end_date ? new Date(cycle.end_date) : null;
    return !!end && end < now;
  }).length;

  const totalBudgetAllotment = summary?.totalBudgetAllotment ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const remainingBudget = totalBudgetAllotment - totalExpenses;
  const currencyLabel = currentCurrencyCode || '';

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="flex flex-col h-[calc(100vh-8rem)] p-6">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-3xl font-bold">Cycles</h1>
        <Button
          onClick={() => {
            if (!selectedProject) {
              toast.error('Please select a project from the main navigation first.');
              return;
            }
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Cycle
        </Button>
      </div>

      <div className="overflow-y-auto space-y-6 pr-2">
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="text-sm font-medium">Active Cycles</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-xl font-bold text-green-600 sm:text-2xl">
                {activeCyclesCount.toLocaleString()}
              </div>
              <CardDescription className="text-xs mt-1">Currently ongoing</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="text-sm font-medium">Ended Cycles</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-xl font-bold text-muted-foreground sm:text-2xl">
                {endedCyclesCount.toLocaleString()}
              </div>
              <CardDescription className="text-xs mt-1">Cycles with end date in the past</CardDescription>
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
              <div className={`text-xl font-bold sm:text-2xl ${remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {currencyLabel
                  ? `${currencyLabel} ${Number(remainingBudget ?? 0).toLocaleString()}`
                  : Number(remainingBudget ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCycle ? 'Edit Cycle' : 'Add New Cycle'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Project</label>
                <Input
                  value={selectedProject ? getProjectName(parseInt(selectedProject)) : ''}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Cycle Number *</label>
                <Select
                  value={formData.cycle_number}
                  onValueChange={(value) => setFormData({ ...formData, cycle_number: value })}
                  disabled={editingCycle !== null}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select cycle number" />
                  </SelectTrigger>
                  <SelectContent>
                    {editingCycle ? (
                      <SelectItem value={editingCycle.cycle_number.toString()}>
                        Cycle {editingCycle.cycle_number}
                      </SelectItem>
                    ) : (
                      getAvailableCycleNumbers().map((num) => (
                        <SelectItem key={num.toString()} value={num.toString()}>
                          Cycle {num}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">End Date</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">
                  {currentCurrencyCode
                    ? `Budget Allotment (${currentCurrencyCode})`
                    : 'Budget Allotment'}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={
                    currentCurrencyCode
                      ? `Enter budget amount in ${currentCurrencyCode}`
                      : 'Enter budget amount'
                  }
                  value={formData.budget_allotment}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, budget_allotment: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingCycle(null);
                  setFormData({
                    cycle_number: '',
                    start_date: '',
                    end_date: '',
                    budget_allotment: ''
                  });
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingCycle ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      </div>

      <div className="space-y-4">
        {filteredCycles.length > 0 ? (
          filteredCycles.map((cycle) => (
            <div key={cycle.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">{cycle.cycle_name}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Cycle Number:</span> {cycle.cycle_number}
                    </div>
                    <div>
                      <span className="font-medium">Start Date:</span> {cycle.start_date ? new Date(cycle.start_date).toLocaleDateString() : 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">End Date:</span> {cycle.end_date ? new Date(cycle.end_date).toLocaleDateString() : 'N/A'}
                    </div>
                    {cycle.budget_allotment && (
                      <div>
                        <span className="font-medium">Budget:</span>{' '}
                        {currentCurrencyCode
                          ? `${currentCurrencyCode} ${cycle.budget_allotment.toLocaleString()}`
                          : cycle.budget_allotment.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => router.push(`/cycles/${cycle.id}`)}
                    className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                  >
                    View
                  </button>
                  <button 
                    onClick={() => handleEdit(cycle)}
                    className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(cycle.id)}
                    className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-sm font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            {selectedProject ? 'No cycles found for this project.' : 'No cycles found.'}
          </div>
        )}
      </div>
      </div>
    </AuthGuard>
  );
}

export default function CyclesPage() {
  return <CyclesPageContent />
}