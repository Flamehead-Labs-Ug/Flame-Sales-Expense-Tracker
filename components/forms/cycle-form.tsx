"use client";

import { useState, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogFooter } from '@/components/ui/dialog';
import { useFilter } from '@/lib/context/filter-context';

interface Cycle {
  id: number;
  cycle_name: string;
  cycle_number: number;
  project_id: number;
  start_date?: string;
  end_date?: string;
  budget_allotment?: number;
}

interface CycleFormProps {
  projectId: number;
  onSuccess: (cycle: Cycle) => void;
  onCancel: () => void;
}

export function CycleForm({ projectId, onSuccess, onCancel }: CycleFormProps) {
  const [formData, setFormData] = useState({
    cycle_number: 1,
    start_date: '',
    end_date: '',
    budget_allotment: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentCurrencyCode } = useFilter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycle_name: `Cycle ${formData.cycle_number}`,
          cycle_number: formData.cycle_number,
          project_id: projectId,
          budget_allotment: formData.budget_allotment
            ? parseFloat(formData.budget_allotment)
            : null,
          ...(formData.start_date && { start_date: formData.start_date }),
          ...(formData.end_date && { end_date: formData.end_date }),
        }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        toast.success('Cycle created successfully');
        onSuccess(data.cycle);
      } else {
        toast.error(data.message || 'Failed to create cycle');
      }
    } catch (error) {
      toast.error('Failed to create cycle');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground">
          Cycle Number
        </label>
        <Input
          type="number"
          placeholder="Enter cycle number"
          value={formData.cycle_number.toString()}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, cycle_number: parseInt(e.target.value) || 1 })
          }
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            Start Date
          </label>
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, start_date: e.target.value })
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
              setFormData({ ...formData, end_date: e.target.value })
            }
          />
        </div>
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
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, budget_allotment: e.target.value })
          }
        />
      </div>
      <DialogFooter className='pt-4'>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Back
        </Button>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Create Cycle
        </Button>
      </DialogFooter>
    </form>
  );
}
