'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProjectForm } from '@/components/forms/project-form';
import { useFilter } from '@/lib/context/filter-context';

interface Project {
  id: number;
  project_name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  project_category_id?: number;
  category_id?: number;
  currency_code?: string | null;
  created_at: string;
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

function ProjectDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const projectId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const {
    organizations,
    selectedOrganization,
    refreshProjects,
    setSelectedProject,
    currentCurrencyCode,
  } = useFilter();

  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  const currencyLabel = useMemo(() => {
    return currentCurrencyCode || project?.currency_code || '';
  }, [currentCurrencyCode, project?.currency_code]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const summaryUrl = new URL('/api/v1/reports/summary', window.location.origin);
      summaryUrl.searchParams.set('projectId', projectId);

      const [projRes, projCatsRes, expCatsRes, summaryRes] = await Promise.all([
        fetch(`/api/v1/projects?id=${projectId}${selectedOrganization ? `&org_id=${selectedOrganization}` : ''}`),
        fetch('/api/v1/project-categories'),
        fetch('/api/v1/expense-categories'),
        fetch(summaryUrl.toString()),
      ]);

      const projData = await projRes.json();
      const projCatsData = await projCatsRes.json();
      const expCatsData = await expCatsRes.json();
      const summaryData = await summaryRes.json();

      if (projData.status === 'success') {
        const p = (projData.projects || [])[0] as Project | undefined;
        setProject(p || null);
      } else {
        toast.error(projData.message || 'Failed to load project');
      }

      if (projCatsData.status === 'success') {
        setProjectCategories(projCatsData.categories || []);
      }

      if (expCatsData.status === 'success') {
        setExpenseCategories(expCatsData.categories || []);
      }

      if (summaryData.status === 'success') {
        setSummary(summaryData);
      } else {
        setSummary(null);
      }
    } catch {
      toast.error('Failed to load project');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    void loadProject();
  }, [projectId, selectedOrganization]);

  const categoryName = useMemo(() => {
    if (!project?.project_category_id) return 'N/A';
    const c = projectCategories.find((x) => x.id === project.project_category_id);
    return c?.category_name || 'Unknown';
  }, [project?.project_category_id, projectCategories]);

  const remainingSpend = (summary?.totalBudgetAllotment ?? 0) - (summary?.totalExpenses ?? 0);

  if (loading) return <div className="p-6">Loading...</div>;

  if (!project) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-4">
          <Button variant="outline" onClick={() => router.push('/projects')}>Back</Button>
          <div className="text-muted-foreground">Project not found.</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{project.project_name}</h1>
            <div className="text-sm text-muted-foreground">Category: {categoryName}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/projects')}>Back</Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedProject(project.id.toString());
                setShowEdit(true);
              }}
            >
              Edit Project
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Start Date</CardTitle>
              <CardDescription className="text-xs">Project start</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{project.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">End Date</CardTitle>
              <CardDescription className="text-xs">Project end</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{project.end_date ? new Date(project.end_date).toLocaleDateString() : 'N/A'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Currency</CardTitle>
              <CardDescription className="text-xs">Project currency</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{project.currency_code || currencyLabel || 'N/A'}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <CardDescription className="text-xs">Project</CardDescription>
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
              <CardDescription className="text-xs">Project</CardDescription>
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
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <ProjectForm
              editingProject={project}
              selectedOrganizationId={selectedOrganization}
              organizations={organizations}
              projectCategories={projectCategories}
              setProjectCategories={setProjectCategories}
              expenseCategories={expenseCategories}
              setExpenseCategories={setExpenseCategories}
              onSuccess={(p) => {
                setShowEdit(false);
                setSelectedProject(p?.id ? p.id.toString() : project.id.toString());
                void loadProject();
                refreshProjects();
              }}
              onCancel={() => setShowEdit(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}

export default function ProjectDetailsPage() {
  return <ProjectDetailsPageContent />;
}
