'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Trash2, Edit, Plus } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PaymentMethodForm } from '@/components/forms/payment-method-form';

interface PaymentMethod {
  id: number;
  method_name: string;
  method_type?: string;
  description?: string;
  created_by: number;
  created_at: string;
}

function PaymentMethodsPageContent() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'get_payment_methods',
          params: {}
        })
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        setPaymentMethods(data.data || []);
      }
    } catch (error) {
      toast.error('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingMethod(method);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this payment method?')) return;

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'delete_payment_method',
          params: { payment_method_id: id }
        })
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast.success('Payment method deleted successfully');
        loadData();
      } else {
        toast.error(data.message || 'Failed to delete payment method');
      }
    } catch (error) {
      toast.error('Failed to delete payment method');
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Payment Methods</h1>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Payment Method
          </Button>
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingMethod ? 'Edit Payment Method' : 'Add New Payment Method'}</DialogTitle>
            </DialogHeader>
            <PaymentMethodForm
              editingMethod={editingMethod}
              onSuccess={() => {
                setIsModalOpen(false);
                setEditingMethod(null);
                loadData();
              }}
              onCancel={() => {
                setIsModalOpen(false);
                setEditingMethod(null);
              }}
            />
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          {paymentMethods.map((method) => (
            <div key={method.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">{method.method_name}</h3>
                  {method.description && (
                    <p className="text-muted-foreground mt-2">{method.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(method)}
                    className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(method.id)}
                    className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-sm font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        {paymentMethods.length === 0 && (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            No payment methods found. Create your first payment method to get started.
          </div>
        )}
      </div>
      </div>
    </AuthGuard>
  );
}

export default function PaymentMethodsPage() {
  return <PaymentMethodsPageContent />
}