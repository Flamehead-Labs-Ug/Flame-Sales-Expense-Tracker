'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export interface Customer {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
}

interface CustomerFormProps {
  editingCustomer: Customer | null;
  onSuccess: (customer?: Customer) => void;
  onCancel: () => void;
}

export function CustomerForm({ editingCustomer, onSuccess, onCancel }: CustomerFormProps) {
  const [formData, setFormData] = useState({
    name: editingCustomer?.name || '',
    email: editingCustomer?.email || '',
    phone: editingCustomer?.phone || '',
    phone_number: editingCustomer?.phone_number || '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!formData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const method = editingCustomer ? 'PUT' : 'POST';
      const body = editingCustomer
        ? { id: editingCustomer.id, ...formData }
        : formData;

      const response = await fetch('/api/v1/customers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast.success(editingCustomer ? 'Customer updated' : 'Customer created');
        onSuccess(data.customer);
      } else {
        toast.error(data.message || 'Failed to save customer');
      }
    } catch (error) {
      toast.error('Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">Name *</label>
          <Input
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Customer name"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Email</label>
          <Input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="customer@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Phone</label>
          <Input
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Primary phone"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Alt Phone</label>
          <Input
            name="phone_number"
            value={formData.phone_number}
            onChange={handleChange}
            placeholder="Alternate phone"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {editingCustomer ? 'Update' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
