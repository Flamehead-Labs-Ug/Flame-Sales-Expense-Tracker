'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface VendorFormData {
  vendor_name: string;
  contact_person: string;
  email: string;
  phone_number: string;
  address: string;
  notes: string;
}

interface EditableVendor {
  id: number;
  vendor_name: string;
  contact_person?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  notes?: string;
}

interface VendorFormProps {
  editingVendor?: EditableVendor | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const createEmptyFormData = (): VendorFormData => ({
  vendor_name: '',
  contact_person: '',
  email: '',
  phone_number: '',
  address: '',
  notes: '',
});

export function VendorForm({ editingVendor, onSuccess, onCancel }: VendorFormProps) {
  const [formData, setFormData] = useState<VendorFormData>(() => createEmptyFormData());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingVendor) {
      setFormData({
        vendor_name: editingVendor.vendor_name,
        contact_person: editingVendor.contact_person || '',
        email: editingVendor.email || '',
        phone_number: editingVendor.phone_number || '',
        address: editingVendor.address || '',
        notes: editingVendor.notes || '',
      });
    } else {
      setFormData(createEmptyFormData());
    }
  }, [editingVendor]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    const params: any = {
      vendor_name: formData.vendor_name,
      ...(formData.contact_person && { contact_person: formData.contact_person }),
      ...(formData.email && { email: formData.email }),
      ...(formData.phone_number && { phone_number: formData.phone_number }),
      ...(formData.address && { address: formData.address }),
      ...(formData.notes && { notes: formData.notes }),
    };

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: editingVendor ? 'update_vendor' : 'add_vendor',
          params: editingVendor ? { vendor_id: editingVendor.id, ...params } : params,
        }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast.success(
          editingVendor ? 'Vendor updated successfully' : 'Vendor created successfully',
        );
        onSuccess();
      } else {
        toast.error(data.message || 'Operation failed');
      }
    } catch (error) {
      toast.error('Failed to save vendor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Vendor Name *</label>
          <input
            type="text"
            value={formData.vendor_name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({ ...prev, vendor_name: e.target.value }))
            }
            required
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Contact Person</label>
          <input
            type="text"
            value={formData.contact_person}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({ ...prev, contact_person: e.target.value }))
            }
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Phone Number</label>
          <input
            type="tel"
            value={formData.phone_number}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData((prev) => ({ ...prev, phone_number: e.target.value }))
            }
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Address</label>
        <textarea
          value={formData.address}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setFormData((prev) => ({ ...prev, address: e.target.value }))
          }
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setFormData((prev) => ({ ...prev, notes: e.target.value }))
          }
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
        />
      </div>
      <div className="flex gap-2 pt-4">
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
          {editingVendor ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
