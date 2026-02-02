'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CustomerForm, Customer } from '@/components/forms/customer-form';

function CustomersPageContent() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (search?: string) => {
    setLoading(true);
    try {
      const url = new URL('/api/v1/customers', window.location.origin);
      if (search && search.trim()) {
        url.searchParams.set('search', search.trim());
      }

      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status === 'success') {
        setCustomers(data.customers || []);
      } else {
        toast.error(data.message || 'Failed to load customers');
      }
    } catch (error) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadData(searchTerm);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;

    try {
      const response = await fetch(`/api/v1/customers?id=${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.status === 'success') {
        toast.success('Customer deleted');
        loadData(searchTerm);
      } else {
        toast.error(data.message || 'Failed to delete customer');
      }
    } catch (error) {
      toast.error('Failed to delete customer');
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h1 className="text-3xl font-bold">Customers</h1>
          <Button
            onClick={() => {
              setEditingCustomer(null);
              setShowForm(true);
            }}
          >
            Add Customer
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end mt-2">
          <Input
            placeholder="Search customers by name, email, or phone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72"
          />
          <Button type="button" onClick={handleSearch}>
            Search
          </Button>
        </div>

        <Dialog
          open={showForm}
          onOpenChange={(open) => {
            setShowForm(open);
            if (!open) {
              setEditingCustomer(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
            </DialogHeader>
            <CustomerForm
              editingCustomer={editingCustomer}
              onSuccess={() => {
                setShowForm(false);
                setEditingCustomer(null);
                loadData(searchTerm);
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingCustomer(null);
              }}
            />
          </DialogContent>
        </Dialog>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          {customers.length > 0 ? (
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Email</th>
                  <th className="px-4 py-2 text-left font-semibold text-foreground">Phone</th>
                  <th className="px-4 py-2 text-right font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2 whitespace-nowrap">{customer.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{customer.email || '-'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{customer.phone || customer.phone_number || '-'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/customers/${customer.id}`)}
                          className="inline-flex items-center px-3 py-1.5 border border-border text-xs font-medium rounded-md text-foreground bg-background hover:bg-muted"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomer(customer);
                            setShowForm(true);
                          }}
                          className="inline-flex items-center px-3 py-1.5 border border-border text-xs font-medium rounded-md text-foreground bg-background hover:bg-muted"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(customer.id)}
                          className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-xs font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-muted-foreground">No customers found.</div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}

export default function CustomersPage() {
  return <CustomersPageContent />;
}
