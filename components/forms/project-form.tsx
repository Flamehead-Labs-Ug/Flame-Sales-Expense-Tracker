'use client';

import {
  useState,
  useEffect,
  FormEvent,
  ChangeEvent,
  Dispatch,
  SetStateAction,
} from 'react';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProjectExpenseCategoriesForm } from '@/components/forms/project-expense-categories-form';
import { ProjectCategoryPresetsPanel } from '@/components/forms/project-category-presets-panel';

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

interface ExpenseCategoryPreset {
  id: number;
  name: string;
  description?: string;
  sort_order?: number;
}

interface ProjectCategoryPreset {
  id: number;
  name: string;
  description?: string;
  sort_order?: number;
  expense_presets: ExpenseCategoryPreset[];
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

  const [categoryPresets, setCategoryPresets] = useState<ProjectCategoryPreset[]>([]);
  const [selectedPresetIds, setSelectedPresetIds] = useState<number[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [applyingPresets, setApplyingPresets] = useState(false);

  const [pendingProjectCategoryId, setPendingProjectCategoryId] = useState<number | null>(null);
  const [pendingExpenseCategoryId, setPendingExpenseCategoryId] = useState<number | null>(null);
  const [newlyCreatedCategoryIds, setNewlyCreatedCategoryIds] = useState<{ projectCategoryIds: number[], expenseCategoryIds: number[] }>({ projectCategoryIds: [], expenseCategoryIds: [] });

  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [currencySearch, setCurrencySearch] = useState('');
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [currencyManuallySet, setCurrencyManuallySet] = useState(false);

  const reloadCategories = async () => {
    try {
      const projectId = editingProject ? editingProject.id : null;
      const projectCategoriesUrl = projectId ? `/api/project-categories?projectId=${projectId}` : '/api/project-categories';
      const expenseCategoriesUrl = projectId ? `/api/expense-categories?projectId=${projectId}` : '/api/expense-categories';

      const [projectRes, expenseRes] = await Promise.all([
        fetch(projectCategoriesUrl),
        fetch(expenseCategoriesUrl),
      ]);

      const projectData = await projectRes.json();
      const expenseData = await expenseRes.json();

      if (projectData.status === 'success') {
        setProjectCategories(projectData.categories || []);
      }
      if (expenseData.status === 'success') {
        setExpenseCategories(expenseData.categories || []);
      }
    } catch (error) {
      toast.error('Failed to refresh categories');
    }
  };

  const handleCurrencyInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrencySearch(value);
    setShowCurrencyDropdown(true);
    setCurrencyManuallySet(true);

    if (!value.trim()) {
      // Clearing the input clears the selected currency code
      setFormData((prev) => ({
        ...prev,
        currency_code: '',
      }));
    }
  };

  const handleSelectCurrency = (currency: CurrencyOption) => {
    setFormData((prev) => ({
      ...prev,
      currency_code: currency.code,
    }));
    setCurrencySearch(`${currency.code} - ${currency.name}`);
    setCurrencyManuallySet(true);
    setShowCurrencyDropdown(false);
  };

  const loadCategoryPresets = async () => {
    try {
      setLoadingPresets(true);
      const response = await fetch('/api/category-presets');
      const data = await response.json();

      if (data.status === 'success' && Array.isArray(data.presets)) {
        setCategoryPresets(data.presets as ProjectCategoryPreset[]);
      } else {
        setCategoryPresets([]);
      }
    } catch (error) {
      toast.error('Failed to load recommended categories');
    } finally {
      setLoadingPresets(false);
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
        const response = await fetch('/api/currencies');
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
    if (formData.currency_code && currencyOptions.length > 0 && !currencySearch) {
      const currency = currencyOptions.find((c) => c.code === formData.currency_code);
      if (currency) {
        setCurrencySearch(`${currency.code} - ${currency.name}`);
      }
    }
  }, [formData.currency_code, currencyOptions, currencySearch]);

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

    const currency = currencyOptions.find((c) => c.code === org.currency_code);
    if (currency) {
      setCurrencySearch(`${currency.code} - ${currency.name}`);
    }
  }, [formData.organization_id, organizations, currencyOptions, currencyManuallySet]);

  const selectedProjectCategoryId = formData.project_category_id
    ? parseInt(formData.project_category_id, 10)
    : null;

  const visibleProjectCategories = !editingProject
    ? newlyCreatedCategoryIds.projectCategoryIds.length > 0
      ? projectCategories.filter((category) =>
          newlyCreatedCategoryIds.projectCategoryIds.includes(category.id),
        )
      : []
    : projectCategories;

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
    if (showProjectCategoryWizard) {
      loadCategoryPresets();
    }
  }, [showProjectCategoryWizard]);

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

  const handleTogglePreset = (id: number) => {
    setSelectedPresetIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id],
    );
  };

  const handleApplyPresets = async () => {
    if (selectedPresetIds.length === 0) {
      toast.error('Select at least one recommended project category');
      return;
    }

    try {
      setApplyingPresets(true);
      const response = await fetch('/api/category-presets/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectCategoryPresetIds: selectedPresetIds,
          project_id: editingProject ? editingProject.id : null,
        }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        const newProjects = (data.projectCategories || []) as ProjectCategory[];
        const newExpenses = (data.expenseCategories || []) as ExpenseCategory[];

        setProjectCategories((prev) => [...prev, ...newProjects]);
        setExpenseCategories((prev) => [...prev, ...newExpenses]);

        // For a new project, track these IDs so the dropdown only shows
        // categories created in this session (project-specific setup UX)
        if (!editingProject) {
          setNewlyCreatedCategoryIds((prev) => ({
            projectCategoryIds: [
              ...prev.projectCategoryIds,
              ...newProjects.map((p) => p.id),
            ],
            expenseCategoryIds: [
              ...prev.expenseCategoryIds,
              ...newExpenses.map((e) => e.id),
            ],
          }));
        }

        // Auto-select the first new project category and a matching expense category if available
        if (newProjects.length > 0) {
          const firstProject = newProjects[0];
          const matchingNewExpense = newExpenses.find(
            (e) => e.project_category_id === firstProject.id,
          );

          setFormData((prev) => ({
            ...prev,
            project_category_id: firstProject.id.toString(),
            expense_category_id: matchingNewExpense
              ? matchingNewExpense.id.toString()
              : prev.expense_category_id,
          }));
        }

        toast.success('Categories created from recommended options');
        setSelectedPresetIds([]);
        setShowProjectCategoryWizard(false);
      } else {
        toast.error(data.message || 'Failed to apply recommended categories');
      }
    } catch (error) {
      toast.error('Failed to apply recommended categories');
    } finally {
      setApplyingPresets(false);
    }
  };

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
        response = await fetch('/api/projects', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...params, id: editingProject.id }),
        });
      } else {
        response = await fetch('/api/projects', {
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
            await fetch('/api/categories/claim', {
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
      const response = await fetch('/api/project-categories', {
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

  const filteredCurrencies = currencyOptions.filter((currency) => {
    if (!currencySearch.trim()) return true;
    const query = currencySearch.toLowerCase();
    return (
      currency.code.toLowerCase().includes(query) ||
      (currency.name || '').toLowerCase().includes(query)
    );
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <Dialog
        open={showProjectCategoryWizard}
        onOpenChange={(open) => {
          setShowProjectCategoryWizard(open);
          if (!open) {
            setSelectedPresetIds([]);
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3 md:col-span-1">
                <ProjectCategoryPresetsPanel
                  presets={categoryPresets}
                  loading={loadingPresets}
                  selectedPresetIds={selectedPresetIds}
                  applying={applyingPresets}
                  onTogglePreset={handleTogglePreset}
                  onClearSelection={() => setSelectedPresetIds([])}
                  onUseSelected={handleApplyPresets}
                  onAddCustomCategory={() =>
                    setShowCustomCategoryFormInWizard(true)
                  }
                />
              </div>

              <div className="border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-4 md:col-span-2">
                {showCustomCategoryFormInWizard ? (
                  <>
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
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Or choose "Add custom category" on the left to define your own
                    project and expense categories.
                  </p>
                )}
              </div>
            </div>
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
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  Category for your project (e.g., "Office Furniture", "Medical
                  Expenses", "Food")
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <select
                  value={formData.project_category_id}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setFormData((prev) => ({
                      ...prev,
                      project_category_id: e.target.value,
                    }))
                  }
                  required
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                >
                  <option value="">Select category</option>
                  {visibleProjectCategories.map((category) => (
                    <option key={category.id} value={category.id.toString()}>
                      {category.category_name}
                    </option>
                  ))}
                </select>
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
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    Category for your expenses (e.g., "Office Supplies", "Travel",
                    "Equipment")
                  </div>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <select
                    value={formData.expense_category_id}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setFormData((prev) => ({
                        ...prev,
                        expense_category_id: e.target.value,
                      }))
                    }
                    required
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  >
                    <option value="">Select expense category</option>
                    {filteredExpenseCategories.map((category) => (
                      <option key={category.id} value={category.id.toString()}>
                        {category.category_name}
                      </option>
                    ))}
                  </select>
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
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  Select the organization this project belongs to
                </div>
              </div>
            </div>
            <select
              value={formData.organization_id}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setFormData((prev) => ({
                  ...prev,
                  organization_id: e.target.value,
                }))
              }
              required
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            >
              <option value="">Select organization</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id.toString()}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">
              Project Currency <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 relative">
              <Input
                placeholder="Search currency"
                value={currencySearch}
                onChange={handleCurrencyInputChange}
                onFocus={() => setShowCurrencyDropdown(true)}
              />
              {showCurrencyDropdown && filteredCurrencies.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-md shadow max-h-40 overflow-y-auto">
                  {filteredCurrencies.map((currency) => (
                    <button
                      key={currency.code}
                      type="button"
                      onClick={() => handleSelectCurrency(currency)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    >
                      <div className="font-medium text-foreground">{currency.code}</div>
                      <div className="text-xs text-muted-foreground">{currency.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
