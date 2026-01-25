'use client';

import { useState, useEffect } from 'react';
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
  DialogTitle,
} from '@/components/ui/dialog';
import { ProjectForm } from '@/components/forms/project-form';

interface Project {
  id: number;
  project_name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  project_category_id?: number;
  category_id?: number;
  vendor_id?: number;
  department?: string;
  budget_allotment?: number;
  organization_id?: number;
  created_by: number;
  created_at: string;
}

interface Organization {
  id: number;
  name: string;
  description?: string;
}

interface ProjectCategory {
  id: number;
  category_name: string;
  description?: string;
}

interface ExpenseCategory {
  id: number;
  category_name: string;
  description?: string;
  project_category_id?: number;
}

interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalBudgetAllotment: number;
}

function ProjectsPageContent() {
  const { refreshProjects, organizations, selectedOrganization, setSelectedProject, currentCurrencyCode } = useFilter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedOrganization) {
      loadData();
    }
  }, [selectedOrganization]);

  useEffect(() => {
    if (searchParams?.get('new') === '1') {
      setEditingProject(null);
      setShowForm(true);
    }
  }, [searchParams]);

  const loadData = async () => {
    try {
      const projectsUrl = selectedOrganization ? `/api/v1/projects?org_id=${selectedOrganization}` : '/api/v1/projects';
      const summaryUrl = new URL('/api/v1/reports/summary', window.location.origin);

      if (selectedOrganization) {
        summaryUrl.searchParams.set('orgId', selectedOrganization);
      }

      const [projectsRes, projectCatsRes, expenseCatsRes, summaryRes] = await Promise.all([
        fetch(projectsUrl),
        fetch('/api/v1/project-categories'),
        fetch('/api/v1/expense-categories'),
        fetch(summaryUrl.toString()),
      ]);

      const projectsData = await projectsRes.json();
      const projectCatsData = await projectCatsRes.json();
      const expenseCatsData = await expenseCatsRes.json();
      const summaryData = await summaryRes.json();

      if (projectsData.status === 'success') {
        setProjects(projectsData.projects || []);
      }
      if (projectCatsData.status === 'success') {
        setProjectCategories(projectCatsData.categories || []);
      }
      if (expenseCatsData.status === 'success') {
        setExpenseCategories(expenseCatsData.categories || []);
      }

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

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'delete_project',
          params: { project_id: id }
        })
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast.success('Project deleted successfully');
        loadData();
        refreshProjects(); // Refresh the global projects list
      } else {
        toast.error(data.message || 'Failed to delete project');
      }
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const getCategoryName = (id?: number) => {
    if (!id) return 'N/A';
    const category = projectCategories.find(c => c.id === id);
    return category?.category_name || 'Unknown';
  };

  const totalProjects = projects.length;
  const now = new Date();

  const activeProjectsCount = projects.filter((project) => {
    const start = project.start_date ? new Date(project.start_date) : null;
    const end = project.end_date ? new Date(project.end_date) : null;

    if (start && start > now) return false;
    if (end && end < now) return false;
    return true;
  }).length;

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
          <h1 className="text-3xl font-bold">Projects</h1>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Project
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">
                  {totalProjects.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl font-bold text-green-600 sm:text-2xl">
                  {activeProjectsCount.toLocaleString()}
                </div>
                <CardDescription className="text-xs mt-1">Ongoing (not yet ended)</CardDescription>
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

          {projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="bg-card rounded-lg border border-border p-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground">{project.project_name}</h3>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => router.push(`/projects/${project.id}`)}
                      className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleEdit(project)}
                      className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-sm font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
              No projects found. Create your first project to get started.
            </div>
          )}

          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProject ? 'Edit Project' : 'Add New Project'}</DialogTitle>
              </DialogHeader>
              <ProjectForm
                editingProject={editingProject}
                selectedOrganizationId={selectedOrganization}
                organizations={organizations}
                projectCategories={projectCategories}
                setProjectCategories={setProjectCategories}
                expenseCategories={expenseCategories}
                setExpenseCategories={setExpenseCategories}
                onSuccess={(project) => {
                  setShowForm(false);
                  setEditingProject(null);
                  loadData();
                  refreshProjects(); // Refresh the global projects list
                  // Auto-select this project in the global navigation
                  if (project?.id) {
                    setSelectedProject(project.id.toString());
                  }
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditingProject(null);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function ProjectsPage() {
  return <ProjectsPageContent />
}