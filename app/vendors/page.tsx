'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Trash2, Edit, Plus } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { VendorForm } from '@/components/forms/vendor-form';

interface Vendor {
  id: number;
  vendor_name: string;
  contact_person?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  notes?: string;
  created_by: number;
  created_at: string;
}

function VendorsPageContent() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'get_vendors',
          params: {}
        })
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        setVendors(data.vendors || []);
      }
    } catch (error) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'delete_vendor',
          params: { vendor_id: id }
        })
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast.success('Vendor deleted successfully');
        loadData();
      } else {
        toast.error(data.message || 'Failed to delete vendor');
      }
    } catch (error) {
      toast.error('Failed to delete vendor');
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Vendors</h1>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {showForm && (
        <div className="bg-card rounded-lg border border-border shadow-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
          </div>
          <div className="p-6">
            <VendorForm
              editingVendor={editingVendor}
              onSuccess={() => {
                setShowForm(false);
                setEditingVendor(null);
                loadData();
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingVendor(null);
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        {vendors.map((vendor) => (
          <div key={vendor.id} className="bg-card rounded-lg border border-border p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">{vendor.vendor_name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div><span className="font-medium">Contact:</span> {vendor.contact_person || 'N/A'}</div>
                  <div><span className="font-medium">Email:</span> {vendor.email || 'N/A'}</div>
                  <div><span className="font-medium">Phone:</span> {vendor.phone_number || 'N/A'}</div>
                  <div><span className="font-medium">Address:</span> {vendor.address || 'N/A'}</div>
                </div>
                {vendor.notes && (
                  <p className="text-muted-foreground mt-2">{vendor.notes}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(vendor)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(vendor.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
        {vendors.length === 0 && (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            No vendors found. Create your first vendor to get started.
          </div>
        )}
      </div>
      </div>
    </AuthGuard>
  );
}

export default function VendorsPage() {
  return <VendorsPageContent />
}