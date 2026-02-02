'use client';

import {
  useState,
  useEffect,
  FormEvent,
  ChangeEvent,
  useRef,
  Dispatch,
  SetStateAction,
} from 'react';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switcher } from '@/components/ui/shadcn-io/navbar-12/Switcher';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProjectExpenseCategoriesForm } from '@/components/forms/project-expense-categories-form';

interface Project {
  id: number;
  project_name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  project_category_id?: number;
  category_id?: number;
  organization_id?: number;
}

interface Organization {
  id: number;
  name: string;
  description?: string;
  currency_code?: string;
  currency_symbol?: string;
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

interface CurrencyOption {
  code: string;
  name: string;
}

interface ProjectFormData {
  project_name: string;
  description: string;
  start_date: string;
  end_date: string;
  project_category_id: string;
  expense_category_id: string;
  organization_id: string;
  currency_code: string;
}

interface ProjectFormProps {
  editingProject: Project | null;
  selectedOrganizationId?: string | null;
  organizations: Organization[];
  projectCategories: ProjectCategory[];
  setProjectCategories: Dispatch<SetStateAction<ProjectCategory[]>>;
  expenseCategories: ExpenseCategory[];
  setExpenseCategories: Dispatch<SetStateAction<ExpenseCategory[]>>;
  onSuccess: (project: Project) => void;
  onCancel: () => void;
}

export function ProjectForm({
  editingProject,
  selectedOrganizationId,
  organizations,
  projectCategories,
  setProjectCategories,
  expenseCategories,
  setExpenseCategories,
  onSuccess,
  onCancel,
}: ProjectFormProps) {
  const attemptedPresetApplyOrgsRef = useRef<Set<string>>(new Set());

  const [formData, setFormData] = useState<ProjectFormData>({
    project_name: '',
    description: '',
    start_date: '',
    end_date: '',
    project_category_id: '',
    expense_category_id: '',
    organization_id: selectedOrganizationId || '',
    currency_code: '',
  });

  const [pendingProjectCategoryId, setPendingProjectCategoryId] = useState<number | null>(null);
  const [pendingExpenseCategoryId, setPendingExpenseCategoryId] = useState<number | null>(null);
  const [newlyCreatedCategoryIds, setNewlyCreatedCategoryIds] = useState<{ projectCategoryIds: number[], expenseCategoryIds: number[] }>({ projectCategoryIds: [], expenseCategoryIds: [] });

  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [currencyManuallySet, setCurrencyManuallySet] = useState(false);

  const ensureDefaultCategoriesForOrganization = async (organizationId: string) => {
    if (attemptedPresetApplyOrgsRef.current.has(organizationId)) {
      return;
    }

    attemptedPresetApplyOrgsRef.current.add(organizationId);

    const orgIdNum = parseInt(organizationId, 10);
    if (!Number.isFinite(orgIdNum)) return;

    const presetsRes = await fetch('/api/v1/category-presets');
    const presetsData = await presetsRes.json();
    if (presetsData.status !== 'success' || !Array.isArray(presetsData.presets)) {
      return;
    }

    const presetIds = (presetsData.presets as { id: number }[])
      .map((p) => p.id)
      .filter((n) => Number.isFinite(n));

    if (presetIds.length === 0) return;

    await fetch('/api/v1/category-presets/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectCategoryPresetIds: presetIds,
        project_id: null,
      }),
    });
  };

  const reloadCategories = async () => {
    try {
      const projectId = editingProject ? editingProject.id : null;
      const projectCategoriesUrl = projectId ? `/api/v1/project-categories?projectId=${projectId}` : '/api/v1/project-categories';
      const expenseCategoriesUrl = projectId ? `/api/v1/expense-categories?projectId=${projectId}` : '/api/v1/expense-categories';

      const [projectRes, expenseRes] = await Promise.all([
        fetch(projectCategoriesUrl),
        fetch(expenseCategoriesUrl),
      ]);

      const projectData = await projectRes.json();
      const expenseData = await expenseRes.json();

      const incomingProjectCategories = projectData.status === 'success'
        ? (projectData.categories || [])
        : [];

      const incomingExpenseCategories = expenseData.status === 'success'
        ? (expenseData.categories || [])
        : [];

      // Ensure defaults exist for the selected organization (org-shared categories)
      // so the dropdown has defaults and users can add custom only.
      if (incomingProjectCategories.length === 0 && formData.organization_id) {
        try {
          await ensureDefaultCategoriesForOrganization(formData.organization_id);
          const [projectRes2, expenseRes2] = await Promise.all([
            fetch(projectCategoriesUrl),
            fetch(expenseCategoriesUrl),
          ]);
          const projectData2 = await projectRes2.json();
          const expenseData2 = await expenseRes2.json();
          if (projectData2.status === 'success') {
            setProjectCategories(projectData2.categories || []);
          }
          if (expenseData2.status === 'success') {
            setExpenseCategories(expenseData2.categories || []);
          }
          return;
        } catch {
        }
      }

      setProjectCategories(incomingProjectCategories);
      setExpenseCategories(incomingExpenseCategories);
    } catch (error) {
      toast.error('Failed to refresh categories');
    }
  };

  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [showProjectCategoryWizard, setShowProjectCategoryWizard] =
    useState(false);
  const [showCustomCategoryFormInWizard, setShowCustomCategoryFormInWizard] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    reloadCategories();
  }, [editingProject]);

  useEffect(() => {
    const loadCurrencies = async () => {
      try {
        const response = await fetch('/api/v1/currencies');
        const data = await response.json();
        if (data.status === 'success') {
          setCurrencyOptions(data.currencies || []);
        }
      } catch {
      }
    };

    loadCurrencies();
  }, []);

  useEffect(() => {
    if (editingProject) {
      setFormData({
        project_name: editingProject.project_name,
        description: editingProject.description || '',
        start_date: editingProject.start_date || '',
        end_date: editingProject.end_date || '',
        project_category_id:
          editingProject.project_category_id?.toString() || '',
        expense_category_id: editingProject.category_id?.toString() || '',
        organization_id:
          editingProject.organization_id?.toString() ||
          selectedOrganizationId ||
          '',
        currency_code: (editingProject as any).currency_code || '',
      });
      if ((editingProject as any).currency_code) {
        setCurrencyManuallySet(true);
      }
    } else {
      setFormData({
        project_name: '',
        description: '',
        start_date: '',
        end_date: '',
        project_category_id: '',
        expense_category_id: '',
        organization_id: selectedOrganizationId || '',
        currency_code: '',
      });
      setShowNewCategoryForm(false);
      setNewCategoryName('');
      setCurrencyManuallySet(false);
    }
  }, [editingProject, selectedOrganizationId]);

  useEffect(() => {
    if (!editingProject && formData.organization_id) {
      reloadCategories();
    }
  }, [editingProject, formData.organization_id]);

  // Auto-default project currency from selected organization's currency
  useEffect(() => {
    if (!formData.organization_id || currencyManuallySet) {
      return;
    }

    const org = organizations.find((o) => o.id.toString() === formData.organization_id);
    if (!org?.currency_code) return;

    setFormData((prev) => ({
      ...prev,
      currency_code: org.currency_code as string,
    }));
  }, [formData.organization_id, organizations, currencyOptions, currencyManuallySet]);

  const selectedProjectCategoryId = formData.project_category_id
    ? parseInt(formData.project_category_id, 10)
    : null;

  const visibleProjectCategories = projectCategories;

  const filteredExpenseCategories = expenseCategories.filter((category) => {
    if (!selectedProjectCategoryId) {
      return false;
    }

    return category.project_category_id === selectedProjectCategoryId;
  });

  useEffect(() => {
    if (
      pendingProjectCategoryId &&
      projectCategories.some((c) => c.id === pendingProjectCategoryId)
    ) {
      setFormData((prev) => ({
        ...prev,
        project_category_id: pendingProjectCategoryId.toString(),
      }));
      setPendingProjectCategoryId(null);
    }
  }, [pendingProjectCategoryId, projectCategories]);

  useEffect(() => {
    if (
      pendingExpenseCategoryId &&
      expenseCategories.some((c) => c.id === pendingExpenseCategoryId)
    ) {
      setFormData((prev) => ({
        ...prev,
        expense_category_id: pendingExpenseCategoryId.toString(),
      }));
      setPendingExpenseCategoryId(null);
    }
  }, [pendingExpenseCategoryId, expenseCategories]);

  useEffect(() => {
    if (!formData.expense_category_id) {
      return;
    }

    const currentId = parseInt(formData.expense_category_id, 10);
    const isStillVisible = filteredExpenseCategories.some(
      (category) => category.id === currentId,
    );

    if (!isStillVisible) {
      setFormData((prev) => ({ ...prev, expense_category_id: '' }));
    }
  }, [formData.expense_category_id, filteredExpenseCategories]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (
      !formData.project_name ||
      !formData.project_category_id ||
      !formData.expense_category_id ||
      !formData.organization_id ||
      !formData.currency_code
    ) {
      toast.error(
        'Please fill in all required fields: project name, project category, expense category, organization, and project currency',
      );
      return;
    }

    const params = {
      project_name: formData.project_name,
      description: formData.description,
      start_date: formData.start_date,
      end_date: formData.end_date,
      project_category_id: parseInt(formData.project_category_id),
      expense_category_id: parseInt(formData.expense_category_id), // Now required
      organization_id: parseInt(formData.organization_id),
      currency_code: formData.currency_code || null,
    };

    try {
      setIsSubmitting(true);
      let response: Response;
      if (editingProject) {
        response = await fetch('/api/v1/projects', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...params, id: editingProject.id }),
        });
      } else {
        response = await fetch('/api/v1/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });
      }

      const data = await response.json();

      if (data.status === 'success') {
        toast.success(
          editingProject
            ? 'Project updated successfully'
            : 'Project created successfully',
        );
        if (!editingProject) {
          // This is a new project, so we need to claim the categories
          const newProject = data.project as Project;
          if (newlyCreatedCategoryIds.projectCategoryIds.length > 0 || newlyCreatedCategoryIds.expenseCategoryIds.length > 0) {
            await fetch('/api/v1/categories/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId: newProject.id,
                ...newlyCreatedCategoryIds,
              }),
            });
          }
        }
        onSuccess(data.project);
      } else {
        toast.error(data.message || 'Operation failed');
      }
    } catch (error) {
      toast.error('Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      const response = await fetch('/api/v1/project-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category_name: newCategoryName,
          description: '',
          is_custom: true,
          organization_id: parseInt(formData.organization_id), // Use the selected organization
        }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        const newCategory = data.category as ProjectCategory;
        setProjectCategories((prev) => [...prev, newCategory]);
        setFormData((prev) => ({
          ...prev,
          project_category_id: newCategory.id.toString(),
        }));
        setShowNewCategoryForm(false);
        setNewCategoryName('');
        toast.success('Category created successfully!');
      } else {
        toast.error(data.message || 'Failed to create category');
      }
    } catch (error) {
      toast.error('Failed to create category');
    }
  };

  const currencyItems = currencyOptions.map((currency) => ({
    value: currency.code,
    label: `${currency.code} - ${currency.name}`,
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <Dialog
        open={showProjectCategoryWizard}
        onOpenChange={(open) => {
          setShowProjectCategoryWizard(open);
          if (!open) {
            setShowCustomCategoryFormInWizard(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Add Project Category and Expense Categories
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Create a custom project category and its expense categories
            </h3>
            <ProjectExpenseCategoriesForm
              projectId={editingProject ? editingProject.id : null}
              onSuccess={async () => {
                setShowProjectCategoryWizard(false);
                setShowCustomCategoryFormInWizard(false);
                await reloadCategories();
              }}
              onCancel={() => {
                setShowProjectCategoryWizard(false);
                setShowCustomCategoryFormInWizard(false);
              }}
              onCreatedProjectCategory={(id) => {
                setPendingProjectCategoryId(id);
                if (!editingProject) {
                  setNewlyCreatedCategoryIds(prev => ({ ...prev, projectCategoryIds: [...prev.projectCategoryIds, id] }));
                }
              }}
              onCreatedExpenseCategories={(ids) => {
                if (ids.length > 0) {
                  setPendingExpenseCategoryId(ids[0]);
                }
                if (!editingProject) {
                  setNewlyCreatedCategoryIds(prev => ({ ...prev, expenseCategoryIds: [...prev.expenseCategoryIds, ...ids] }));
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            Project Name *
          </label>
          <Input
            placeholder="Enter project name"
            value={formData.project_name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({
                ...prev,
                project_name: e.target.value,
              }))
            }
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">
            Description
          </label>
          <Input
            placeholder="Enter project description"
            value={formData.description}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
          />
          <div>
            <div className="flex items-center gap-1 mb-2">
              <label className="block text-sm font-medium text-foreground">
                Project Category *
              </label>
              <div className="group relative">
                <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                </div>
                <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                  Group this project under a project category (e.g., &#34;Construction&#34;, &#34;Retail&#34;,
                  &#34;Services&#34;)
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Switcher
                  items={visibleProjectCategories.map((category) => ({
                    value: category.id.toString(),
                    label: category.category_name,
                  }))}
                  value={formData.project_category_id}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      project_category_id: value,
                    }))
                  }
                  placeholder="Select category"
                  searchPlaceholder="Search category..."
                  emptyText="No categories found."
                  widthClassName="w-full"
                  allowClear={false}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setShowProjectCategoryWizard(true)}
                className="mb-0"
                disabled={!formData.organization_id}
              >
                + Add New
              </Button>
            </div>

            {showNewCategoryForm && (
              <div className="mt-3 p-3 border border-border rounded-lg bg-muted">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter category name"
                    value={newCategoryName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setNewCategoryName(e.target.value)
                    }
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    type="button"
                    onClick={handleCreateCategory}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowNewCategoryForm(false);
                      setNewCategoryName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
          {selectedProjectCategoryId && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <label className="block text-sm font-medium text-foreground">
                  Expense Category *
                </label>
                <div className="group relative">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                    Category for your expenses (e.g., &quot;Office Supplies&quot;, &quot;Travel&quot;,
                    &quot;Equipment&quot;)
                  </div>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Switcher
                    items={filteredExpenseCategories.map((category) => ({
                      value: category.id.toString(),
                      label: category.category_name,
                    }))}
                    value={formData.expense_category_id}
                    onChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        expense_category_id: value,
                      }))
                    }
                    placeholder="Select expense category"
                    searchPlaceholder="Search expense category..."
                    emptyText="No expense categories found."
                    widthClassName="w-full"
                    allowClear={false}
                  />
                </div>
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <label className="block text-sm font-medium text-foreground">
                Organization *
              </label>
              <div className="group relative">
                <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                </div>
                <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                  Select the organization this project belongs to
                </div>
              </div>
            </div>
            <Switcher
              items={organizations.map((org) => ({
                value: org.id.toString(),
                label: org.name,
              }))}
              value={formData.organization_id}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  organization_id: value,
                }))
              }
              placeholder="Select organization"
              searchPlaceholder="Search organization..."
              emptyText="No organizations found."
              widthClassName="w-full"
              allowClear={false}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">
              Project Currency <span className="text-red-500">*</span>
            </label>
            <Switcher
              items={currencyItems}
              value={formData.currency_code}
              onChange={(value) => {
                setFormData((prev) => ({ ...prev, currency_code: value }));
                setCurrencyManuallySet(true);
              }}
              placeholder="Select currency"
              searchPlaceholder="Search currency..."
              emptyText="No currencies found."
              widthClassName="w-full"
              allowClear={false}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Start Date *
              </label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData((prev) => ({
                    ...prev,
                    start_date: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">
                End Date
              </label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData((prev) => ({
                    ...prev,
                    end_date: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onCancel();
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {editingProject ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </div>
    </form>
  );
}
