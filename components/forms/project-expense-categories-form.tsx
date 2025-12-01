'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogFooter } from '@/components/ui/dialog';

interface ExpenseCategoryFormRow {
  category_name: string;
  description: string;
}

interface ProjectExpenseCategoriesFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  onCreatedProjectCategory?: (projectCategoryId: number) => void;
  onCreatedExpenseCategories?: (expenseCategoryIds: number[]) => void;
  projectId?: number | null;
}

export function ProjectExpenseCategoriesForm({
  onSuccess,
  onCancel,
  onCreatedProjectCategory,
  onCreatedExpenseCategories,
  projectId,
}: ProjectExpenseCategoriesFormProps) {
  const [projectCategoryName, setProjectCategoryName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [expenseRows, setExpenseRows] = useState<ExpenseCategoryFormRow[]>([
    { category_name: '', description: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const handleAddExpenseRow = () => {
    setExpenseRows((prev) => [...prev, { category_name: '', description: '' }]);
  };

  const handleRemoveExpenseRow = (index: number) => {
    setExpenseRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExpenseRowChange = (
    index: number,
    field: keyof ExpenseCategoryFormRow,
    value: string,
  ) => {
    setExpenseRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!projectCategoryName.trim()) {
      toast.error('Project category name is required');
      return;
    }

    const validExpenseRows = expenseRows.filter((row) =>
      row.category_name.trim(),
    );

    if (validExpenseRows.length === 0) {
      toast.error('Add at least one expense category');
      return;
    }

    setSubmitting(true);

    try {
      const projectRes = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'add_project_category',
          params: {
            category_name: projectCategoryName.trim(),
            description: projectDescription.trim(),
            is_custom: 1,
            project_id: projectId,
          },
        }),
      });

      const projectData = await projectRes.json();

      if (projectData.status !== 'success' || !projectData.category?.id) {
        toast.error(projectData.message || 'Failed to create project category');
        return;
      }

      const projectCategoryId = projectData.category.id as number;

      let successCount = 0;
      const createdExpenseCategoryIds: number[] = [];
      for (const row of validExpenseRows) {
        const expenseRes = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'add_expense_category',
            params: {
              category_name: row.category_name.trim(),
              project_category_id: projectCategoryId,
              ...(row.description.trim() && { description: row.description.trim() }),
              project_id: projectId,
            },
          }),
        });

        const expenseData = await expenseRes.json();
        if (expenseData.status === 'success' && expenseData.category?.id) {
          successCount += 1;
          createdExpenseCategoryIds.push(expenseData.category.id as number);
        }
      }

      if (successCount === 0) {
        toast.error('Failed to create expense categories');
        return;
      }

      onCreatedProjectCategory?.(projectCategoryId);
      if (createdExpenseCategoryIds.length > 0) {
        onCreatedExpenseCategories?.(createdExpenseCategoryIds);
      }

      toast.success(
        successCount === 1
          ? 'Project and expense category created successfully'
          : 'Project and expense categories created successfully',
      );

      setProjectCategoryName('');
      setProjectDescription('');
      setExpenseRows([{ category_name: '', description: '' }]);
      onSuccess();
    } catch (error) {
      toast.error('Failed to save categories');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4 md:col-span-1">
          <div>
            <label className="block text-sm font-medium text-foreground">
              Project Category Name
            </label>
            <Input
              placeholder="Enter project category name"
              value={projectCategoryName}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setProjectCategoryName(e.target.value)
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">
              Project Category Description
            </label>
            <textarea
              placeholder="Enter description (optional)"
              value={projectDescription}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setProjectDescription(e.target.value)
              }
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            />
          </div>
        </div>
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Expense Categories for this Project Category
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddExpenseRow}
            >
              + Add Expense Category
            </Button>
          </div>

          <div className="space-y-3">
            {expenseRows.map((row, index) => (
              <div
                key={index}
                className="p-3 border border-border rounded-lg bg-card space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-foreground">
                      Category Name
                    </label>
                    <Input
                      placeholder="Enter expense category name"
                      value={row.category_name}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        handleExpenseRowChange(
                          index,
                          'category_name',
                          e.target.value,
                        )
                      }
                      required
                    />
                  </div>
                  {expenseRows.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveExpenseRow(index)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground">
                    Description
                  </label>
                  <textarea
                    placeholder="Enter description (optional)"
                    value={row.description}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      handleExpenseRowChange(index, 'description', e.target.value)
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setProjectCategoryName('');
            setProjectDescription('');
            setExpenseRows([{ category_name: '', description: '' }]);
            onCancel();
          }}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
