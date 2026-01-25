'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Trash2, Edit, Plus } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
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

interface ProjectCategory {
  id: number;
  category_name: string;
  description?: string;
  is_custom?: boolean;
  created_by: number;
  created_at: string;
}

interface ExpenseCategory {
  id: number;
  category_name: string;
  description?: string;
  project_category_id?: number;
  created_by: number;
  created_at: string;
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

interface Project {
  id: number;
  project_name: string;
}

function CategoriesPageContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [filteredExpenseCategories, setFilteredExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'project' | 'expense'>('project');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>('');

  const defaultsEnsuredForProject = useRef<Set<string>>(new Set());

  const [projectFormData, setProjectFormData] = useState({
    category_name: '',
    description: ''
  });

  const [expenseFormData, setExpenseFormData] = useState({
    category_name: '',
    description: '',
    project_category_id: '',
  });

  const [showNewExpenseForm, setShowNewExpenseForm] = useState(false);
  const [newExpenseFormData, setNewExpenseFormData] = useState({
    category_name: '',
    description: '',
  });

  const [selectedProjectCategoryId, setSelectedProjectCategoryId] = useState<number | null>(null);

  const [editingExpenseCategory, setEditingExpenseCategory] = useState<ExpenseCategory | null>(null);

  const [editingProjectCategory, setEditingProjectCategory] = useState<ProjectCategory | null>(null);
  const [showProjectEditForm, setShowProjectEditForm] = useState(false);

  const selectedProjectCategory = selectedProjectCategoryId
    ? projectCategories.find((c) => c.id === selectedProjectCategoryId) || null
    : null;

  const visibleExpenseCategories = selectedProjectCategoryId
    ? expenseCategories.filter((c) => c.project_category_id === selectedProjectCategoryId)
    : [];

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await fetch('/api/v1/projects');

        const data = await res.json();

        if (data.status === 'success' && Array.isArray(data.projects)) {
          setProjects(data.projects as Project[]);
        } else {
          toast.error(data.message || 'Failed to load projects');
        }
      } catch (error) {
        toast.error('Failed to load projects');
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectCategories([]);
      setExpenseCategories([]);
      setFilteredExpenseCategories([]);
      setSelectedProjectCategoryId(null);
      return;
    }

    loadData(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectCategoryId && projectCategories.length > 0) {
      setSelectedProjectCategoryId(projectCategories[0].id);
    }
  }, [projectCategories, selectedProjectCategoryId]);

  const ensureDefaultCategoriesForProject = async (projectId: string) => {
    if (!projectId) return;
    if (defaultsEnsuredForProject.current.has(projectId)) return;

    defaultsEnsuredForProject.current.add(projectId);

    const presetsRes = await fetch('/api/v1/category-presets');
    const presetsData = await presetsRes.json();
    if (presetsData.status !== 'success' || !Array.isArray(presetsData.presets)) {
      return;
    }

    const presetIds = (presetsData.presets as ProjectCategoryPreset[])
      .map((p) => p.id)
      .filter((n) => Number.isFinite(n));

    if (presetIds.length === 0) return;

    await fetch('/api/v1/category-presets/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectCategoryPresetIds: presetIds,
        project_id: parseInt(projectId, 10),
      }),
    });
  };

  const loadData = async (projectId: string) => {
    try {
      setLoading(true);

      const [projectRes, expenseRes] = await Promise.all([
        fetch(`/api/v1/project-categories?projectId=${projectId}`),
        fetch(`/api/v1/expense-categories?projectId=${projectId}`),
      ]);

      const projectData = await projectRes.json();
      const expenseData = await expenseRes.json();

      const incomingProjectCategories = projectData.status === 'success'
        ? (projectData.categories || [])
        : [];

      const incomingExpenseCategories = expenseData.status === 'success'
        ? (expenseData.categories || [])
        : [];

      if (incomingProjectCategories.length === 0) {
        try {
          await ensureDefaultCategoriesForProject(projectId);
        } catch {
        }

        const [projectRes2, expenseRes2] = await Promise.all([
          fetch(`/api/v1/project-categories?projectId=${projectId}`),
          fetch(`/api/v1/expense-categories?projectId=${projectId}`),
        ]);

        const projectData2 = await projectRes2.json();
        const expenseData2 = await expenseRes2.json();

        if (projectData2.status === 'success') {
          setProjectCategories(projectData2.categories || []);
        } else {
          setProjectCategories([]);
        }

        if (expenseData2.status === 'success') {
          setExpenseCategories(expenseData2.categories || []);
          setFilteredExpenseCategories(expenseData2.categories || []);
        } else {
          setExpenseCategories([]);
          setFilteredExpenseCategories([]);
        }

        return;
      }

      setProjectCategories(incomingProjectCategories);
      setExpenseCategories(incomingExpenseCategories);
      setFilteredExpenseCategories(incomingExpenseCategories);
    } catch (error) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleNewExpenseSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedProjectCategoryId) {
      toast.error('Select a project category first');
      return;
    }

    const params = {
      category_name: newExpenseFormData.category_name,
      project_category_id: selectedProjectCategoryId,
      project_id: selectedProjectId ? parseInt(selectedProjectId, 10) : undefined,
      ...(newExpenseFormData.description && {
        description: newExpenseFormData.description,
      }),
    };

    try {
      const response = await fetch('/api/v1/expense-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (data.status === 'success' && data.category) {
        const created = data.category as ExpenseCategory;
        setExpenseCategories((prev) => [...prev, created]);
        toast.success('Expense category created successfully');
        setShowExpenseForm(false);
        setShowNewExpenseForm(false);
        setNewExpenseFormData({ category_name: '', description: '' });
      } else {
        toast.error(data.message || 'Failed to create expense category');
      }
    } catch (error) {
      toast.error('Failed to create expense category');
    }
  };

  const handleProjectEditSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!editingProjectCategory) {
      toast.error('No project category selected for editing');
      return;
    }

    const params = {
      id: editingProjectCategory.id,
      category_name: projectFormData.category_name,
      description: projectFormData.description,
      is_custom: editingProjectCategory.is_custom ?? true,
    };

    try {
      const response = await fetch('/api/v1/project-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (data.status === 'success' && data.category) {
        const updated = data.category as ProjectCategory;
        setProjectCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
        toast.success('Project category updated successfully');
        setShowProjectEditForm(false);
        setEditingProjectCategory(null);
        setProjectFormData({ category_name: '', description: '' });
      } else {
        toast.error(data.message || 'Failed to update project category');
      }
    } catch (error) {
      toast.error('Failed to update project category');
    }
  };

  const handleProjectSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedProjectId) {
      toast.error('Select a project first');
      return;
    }

    const params = {
      category_name: projectFormData.category_name,
      description: projectFormData.description,
      is_custom: 1,
      project_id: parseInt(selectedProjectId, 10),
    };

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'add_project_category',
          params
        })
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast.success('Project category created successfully');
        setShowProjectForm(false);
        setProjectFormData({ category_name: '', description: '' });
        if (selectedProjectId) {
          loadData(selectedProjectId);
        }
      } else {
        toast.error(data.message || 'Operation failed');
      }
    } catch (error) {
      toast.error('Failed to save project category');
    }
  };

  const handleExpenseSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!editingExpenseCategory) {
      toast.error('No expense category selected for editing');
      return;
    }

    const projectCategoryId =
      editingExpenseCategory.project_category_id || selectedProjectCategoryId;

    if (!projectCategoryId) {
      toast.error('Missing project category for this expense category');
      return;
    }

    const params = {
      id: editingExpenseCategory.id,
      category_name: expenseFormData.category_name,
      project_category_id: projectCategoryId,
      description: expenseFormData.description,
    };

    try {
      const response = await fetch('/api/v1/expense-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (data.status === 'success' && data.category) {
        const updated = data.category as ExpenseCategory;
        setExpenseCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
        toast.success('Expense category updated successfully');
        setShowExpenseForm(false);
        setEditingExpenseCategory(null);
        setExpenseFormData({
          category_name: '',
          description: '',
          project_category_id: '',
        });
      } else {
        toast.error(data.message || 'Failed to update expense category');
      }
    } catch (error) {
      toast.error('Failed to update expense category');
    }
  };

  const handleProjectDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this project category?')) return;

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'delete_project_category',
          params: { category_id: id },
        }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast.success('Project category deleted successfully');
        if (selectedProjectId) {
          loadData(selectedProjectId);
        }
      } else {
        toast.error(data.message || 'Failed to delete project category');
      }
    } catch (error) {
      toast.error('Failed to delete project category');
    }
  };

  const handleExpenseDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this expense category?')) return;

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'delete_expense_category',
          params: { category_id: id }
        })
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast.success('Expense category deleted successfully');
        if (selectedProjectId) {
          loadData(selectedProjectId);
        }
      } else {
        toast.error(data.message || 'Failed to delete expense category');
      }
    } catch (error) {
      toast.error('Failed to delete expense category');
    }
  };

  const getProjectCategoryName = (id?: number) => {
    if (!id) return 'N/A';
    const category = projectCategories.find(c => c.id === id);
    return category?.category_name || 'Unknown';
  };

  const handleFilterChange = (value: string) => {
    console.log('handleFilterChange - New filter value:', value);
    setProjectFilter(value);
    let newFilteredCategories: ExpenseCategory[];
    if (!value) {
      newFilteredCategories = expenseCategories;
    } else if (value === 'null') {
      newFilteredCategories = expenseCategories.filter(c => !c.project_category_id);
    } else {
      newFilteredCategories = expenseCategories.filter(c => c.project_category_id === parseInt(value));
    }
    console.log('handleFilterChange - Filtered expense categories:', newFilteredCategories);
    setFilteredExpenseCategories(newFilteredCategories);
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold">Categories</h1>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Select Project
          </label>
          <select
            value={selectedProjectId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              setSelectedProjectId(e.target.value);
            }}
            className="w-full md:w-80 px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id.toString()}>
                {project.project_name}
              </option>
            ))}
          </select>
        </div>

        {!selectedProjectId && (
          <div className="mt-4 text-sm text-muted-foreground">
            Select a project above to manage its project and expense categories.
          </div>
        )}

        {selectedProjectId && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column: Project categories */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-foreground">Project Categories</h2>
                <Button onClick={() => setShowProjectForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </div>

              <Dialog
                open={showProjectForm}
                onOpenChange={(open) => {
                  setShowProjectForm(open);
                  if (!open) {
                    setProjectFormData({ category_name: '', description: '' });
                  }
                }}
              >
                <DialogContent className="sm:max-w-5xl">
                  <DialogHeader>
                    <DialogTitle>
                      Add New Project Category and Expense Categories
                    </DialogTitle>
                  </DialogHeader>
                  <div className="mt-2">
                    <ProjectExpenseCategoriesForm
                      projectId={selectedProjectId ? parseInt(selectedProjectId, 10) : null}
                      onSuccess={() => {
                        setShowProjectForm(false);
                        setProjectFormData({ category_name: '', description: '' });
                        if (selectedProjectId) {
                          loadData(selectedProjectId);
                        }
                      }}
                      onCancel={() => {
                        setShowProjectForm(false);
                        setProjectFormData({ category_name: '', description: '' });
                      }}
                    />
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={showProjectEditForm}
                onOpenChange={(open) => {
                  setShowProjectEditForm(open);
                  if (!open) {
                    setEditingProjectCategory(null);
                    setProjectFormData({ category_name: '', description: '' });
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Project Category</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleProjectEditSubmit} className="space-y-4 mt-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Category Name
                        </label>
                        <Input
                          placeholder="Enter category name"
                          value={projectFormData.category_name}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setProjectFormData({
                              ...projectFormData,
                              category_name: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Description
                        </label>
                        <textarea
                          placeholder="Enter description (optional)"
                          value={projectFormData.description}
                          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                            setProjectFormData({
                              ...projectFormData,
                              description: e.target.value,
                            })
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowProjectEditForm(false);
                          setEditingProjectCategory(null);
                          setProjectFormData({ category_name: '', description: '' });
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={!editingProjectCategory}>
                        Save
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="space-y-4 h-[60vh] overflow-y-auto pr-1">
                {projectCategories.map((category) => {
                  const isSelected = category.id === selectedProjectCategoryId;
                  const description =
                    category.description && !category.description.startsWith('Custom category:')
                      ? category.description
                      : '';

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedProjectCategoryId(category.id)}
                      className={`w-full text-left rounded-lg border p-4 transition-colors bg-card ${
                        isSelected
                          ? 'border-blue-500 ring-1 ring-blue-500/40'
                          : 'border-border hover:border-border/80'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground">
                              {category.category_name}
                            </h3>
                            {!!category.is_custom && (
                              <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded">
                                Custom
                              </span>
                            )}
                          </div>
                          {description && (
                            <p className="text-muted-foreground">{description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProjectCategory(category);
                              setProjectFormData({
                                category_name: category.category_name,
                                description: category.description || '',
                              });
                              setShowProjectEditForm(true);
                            }}
                            className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProjectDelete(category.id);
                            }}
                            className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-sm font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {projectCategories.length === 0 && (
                  <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
                    No project categories found.
                  </div>
                )}
              </div>
            </div>

            {/* Right column: Expense categories for selected project category */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Expense Categories</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedProjectCategory
                      ? `Showing expense categories for "${selectedProjectCategory.category_name}"`
                      : 'Select a project category on the left to view its expense categories.'}
                  </p>
                </div>
                <Button
                  onClick={() => setShowNewExpenseForm(true)}
                  disabled={!selectedProjectCategoryId}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Expense Category
                </Button>
              </div>

              <Dialog
                open={showNewExpenseForm}
                onOpenChange={(open) => {
                  setShowNewExpenseForm(open);
                  if (!open) {
                    setNewExpenseFormData({ category_name: '', description: '' });
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Expense Category</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleNewExpenseSubmit} className="space-y-4 mt-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Project Category
                        </label>
                        <div className="text-sm text-foreground font-medium">
                          {selectedProjectCategory
                            ? selectedProjectCategory.category_name
                            : 'No project category selected'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Category Name
                        </label>
                        <Input
                          placeholder="Enter category name"
                          value={newExpenseFormData.category_name}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setNewExpenseFormData({
                              ...newExpenseFormData,
                              category_name: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Description
                        </label>
                        <textarea
                          placeholder="Enter description (optional)"
                          value={newExpenseFormData.description}
                          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                            setNewExpenseFormData({
                              ...newExpenseFormData,
                              description: e.target.value,
                            })
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowNewExpenseForm(false);
                          setNewExpenseFormData({ category_name: '', description: '' });
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={!selectedProjectCategoryId}>
                        Create
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog
                open={showExpenseForm}
                onOpenChange={(open) => {
                  setShowExpenseForm(open);
                  if (!open) {
                    setEditingExpenseCategory(null);
                    setExpenseFormData({
                      category_name: '',
                      description: '',
                      project_category_id: '',
                    });
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Expense Category</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleExpenseSubmit} className="space-y-4 mt-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Project Category
                        </label>
                        <div className="text-sm text-foreground font-medium">
                          {selectedProjectCategory
                            ? selectedProjectCategory.category_name
                            : 'No project category selected'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Category Name
                        </label>
                        <Input
                          placeholder="Enter category name"
                          value={expenseFormData.category_name}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setExpenseFormData({
                              ...expenseFormData,
                              category_name: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Description
                        </label>
                        <textarea
                          placeholder="Enter description (optional)"
                          value={expenseFormData.description}
                          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                            setExpenseFormData({
                              ...expenseFormData,
                              description: e.target.value,
                            })
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowExpenseForm(false);
                          setEditingExpenseCategory(null);
                          setExpenseFormData({
                            category_name: '',
                            description: '',
                            project_category_id: '',
                          });
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={!editingExpenseCategory}>
                        Save
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="space-y-4 h-[60vh] overflow-y-auto pr-1">
                {selectedProjectCategoryId && visibleExpenseCategories.length === 0 && (
                  <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
                    No expense categories found for this project category.
                  </div>
                )}

                {!selectedProjectCategoryId && (
                  <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
                    Select a project category to view its expense categories.
                  </div>
                )}

                {visibleExpenseCategories.map((category) => (
                  <div
                    key={category.id}
                    className="bg-card rounded-lg border border-border p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {category.category_name}
                        </h3>
                        {category.description && (
                          <p className="text-muted-foreground">{category.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingExpenseCategory(category);
                            setExpenseFormData({
                              category_name: category.category_name,
                              description: category.description || '',
                              project_category_id: category.project_category_id
                                ? category.project_category_id.toString()
                                : '',
                            });
                            setShowExpenseForm(true);
                          }}
                          className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleExpenseDelete(category.id)}
                          className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-sm font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

export default function CategoriesPage() {
  return <CategoriesPageContent />
}