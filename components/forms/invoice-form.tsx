"use client";

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DialogFooter,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CustomerForm } from '@/components/forms/customer-form';
import { useFilter } from '@/lib/context/filter-context';

interface InvoiceFormProps {
  saleIds: number[];
  defaultRecipientName?: string;
  defaultCurrency?: string;
  defaultInvoiceNumber?: string;
  onSuccess?: () => void;
  onCancel: () => void;
}

export function InvoiceForm({
  saleIds,
  defaultRecipientName,
  defaultCurrency = 'USD',
  defaultInvoiceNumber,
  onSuccess,
  onCancel,
}: InvoiceFormProps) {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const due = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const isoDue = due.toISOString().slice(0, 10);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    recipientName: defaultRecipientName || '',
    street: '',
    postalCode: '',
    city: '',
    invoiceNumber:
      defaultInvoiceNumber || `INV-${today.getFullYear()}-${saleIds[0] ?? '1'}`,
    invoiceDate: isoToday,
    dueDate: isoDue,
    currency: defaultCurrency,
  });

  const handleChange = (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!saleIds || saleIds.length === 0) {
      toast.error('At least one sale ID is required to generate an invoice');
      return;
    }

    if (!form.recipientName.trim()) {
      toast.error('Recipient name is required');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        saleIds,
        recipient: {
          name: form.recipientName,
          address: {
            street: form.street || undefined,
            postalCode: form.postalCode || undefined,
            city: form.city || undefined,
          },
        },
        invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate || undefined,
        dueDate: form.dueDate || undefined,
        currency: form.currency || undefined,
      };

      const response = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('application/json')) {
        const data = await response.json().catch(() => null);
        toast.error(data?.message || 'Failed to generate invoice');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.invoiceNumber || `invoice-${saleIds[0]}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success('Invoice generated');
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast.error('Failed to generate invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4 py-2">
        <div>
          <label className="block text-sm font-medium text-foreground">Recipient Name</label>
          <Input
            name="recipientName"
            value={form.recipientName}
            onChange={handleChange}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-foreground">Street</label>
            <Input
              name="street"
              value={form.street}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Postal Code</label>
            <Input
              name="postalCode"
              value={form.postalCode}
              onChange={handleChange}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground">City</label>
            <Input
              name="city"
              value={form.city}
              onChange={handleChange}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground">Invoice Number</label>
            <Input
              name="invoiceNumber"
              value={form.invoiceNumber}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Invoice Date</label>
            <Input
              type="date"
              name="invoiceDate"
              value={form.invoiceDate}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Due Date</label>
            <Input
              type="date"
              name="dueDate"
              value={form.dueDate}
              onChange={handleChange}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Currency</label>
          <Input
            name="currency"
            value={form.currency}
            onChange={handleChange}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Generating...' : 'Generate Invoice'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface InvoiceCustomer {
  id: number;
  name: string;
  email?: string | null;
}

interface CreateInvoiceFormProps {
  customers: InvoiceCustomer[];
  defaultCurrency?: string;
  onSuccess?: () => void;
  onCancel: () => void;
}

interface InvoiceItemFormRow {
  productName: string;
  variantId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

interface InvoiceProductVariant {
  id: number;
  product_id: number;
  product_name: string;
  label?: string;
  selling_price?: number;
  unit_cost?: number;
  quantity_in_stock?: number;
  unit_of_measurement?: string;
}

export function CreateInvoiceForm({
  customers,
  defaultCurrency = 'USD',
  onSuccess,
  onCancel,
}: CreateInvoiceFormProps) {
  const { selectedProject, selectedCycle } = useFilter();
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const due = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const isoDue = due.toISOString().slice(0, 10);

  const [loading, setLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerList, setCustomerList] = useState<InvoiceCustomer[]>(customers || []);
  const [products, setProducts] = useState<InvoiceProductVariant[]>([]);
  const [form, setForm] = useState({
    recipientName: '',
    street: '',
    postalCode: '',
    city: '',
    invoiceNumber: `INV-${today.getFullYear()}-${Date.now()}`,
    invoiceDate: isoToday,
    dueDate: isoDue,
    currency: defaultCurrency,
  });
  const [items, setItems] = useState<InvoiceItemFormRow[]>([
    { productName: '', variantId: '', description: '', quantity: '1', unit: 'pcs', unitPrice: '' },
  ]);

  useEffect(() => {
    setCustomerList(customers || []);
  }, [customers]);

  const loadCustomers = async (search?: string) => {
    try {
      const url = new URL('/api/customers', window.location.origin);
      if (search && search.trim()) {
        url.searchParams.set('search', search.trim());
      }
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status === 'success') {
        setCustomerList(data.customers || []);
      }
    } catch (error) {
      // customer search is a convenience feature; ignore errors
    }
  };

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('/api/products');
        const data = await response.json();
        if (data.status === 'success') {
          const rawProducts = data.products || [];
          const flattened: InvoiceProductVariant[] = [];

          for (const p of rawProducts) {
            const variants = Array.isArray(p.variants) ? p.variants : [];

            if (variants.length > 0) {
              for (const v of variants) {
                flattened.push({
                  id: v.id,
                  product_id: p.id,
                  product_name: p.product_name,
                  label: v.label || undefined,
                  unit_cost: v.unit_cost ?? undefined,
                  selling_price: v.selling_price ?? undefined,
                  quantity_in_stock: v.quantity_in_stock ?? 0,
                  unit_of_measurement: v.unit_of_measurement || undefined,
                });
              }
            } else {
              flattened.push({
                id: p.id,
                product_id: p.id,
                product_name: p.product_name,
                label: p.variant_name || undefined,
                unit_cost: p.unit_cost ?? undefined,
                selling_price: p.selling_price ?? undefined,
                quantity_in_stock: p.quantity_in_stock ?? 0,
                unit_of_measurement: p.unit_of_measurement || undefined,
              });
            }
          }

          setProducts(flattened);
        }
      } catch (error) {
        toast.error('Failed to load products');
      }
    };

    loadProducts();
  }, []);

  const handleHeaderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomerInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomerSearch(value);
    setShowCustomerDropdown(true);
    await loadCustomers(value);
  };

  const handleSelectCustomer = (customer: InvoiceCustomer) => {
    setSelectedCustomerId(customer.id.toString());
    setCustomerSearch(customer.name);
    setForm((prev) => ({ ...prev, recipientName: customer.name }));
    setShowCustomerDropdown(false);
  };

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItemFormRow,
    value: string,
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { productName: '', variantId: '', description: '', quantity: '1', unit: 'pcs', unitPrice: '' },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleProductSelect = (index: number, productName: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productName,
        variantId: '',
        description: productName,
        unit: 'pcs',
        unitPrice: '',
      };
      return next;
    });
  };

  const handleVariantSelect = (index: number, variantId: string) => {
    const variant = products.find((p) => p.id === parseInt(variantId, 10));
    setItems((prev) => {
      const next = [...prev];
      if (variant) {
        const derivedDescription = variant.label
          ? `${variant.product_name} - ${variant.label}`
          : variant.product_name;
        const derivedUnit = variant.unit_of_measurement || 'pcs';
        const existingUnitPrice = Number(next[index].unitPrice) || 0;
        const basePrice =
          (variant.selling_price ?? variant.unit_cost ?? existingUnitPrice);
        const derivedPrice = (basePrice || 0).toString();

        next[index] = {
          ...next[index],
          productName: variant.product_name,
          variantId,
          description: derivedDescription,
          unit: derivedUnit,
          unitPrice: derivedPrice,
        };
      } else {
        next[index] = {
          ...next[index],
          variantId,
        };
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }

    if (!form.recipientName.trim()) {
      toast.error('Recipient name is required');
      return;
    }

    const customerId = parseInt(selectedCustomerId, 10);

    const normalizedItems = items
      .map((item) => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        return {
          description: item.description || 'Item',
          quantity,
          unit: item.unit || 'pcs',
          unitPrice,
        };
      })
      .filter((item) => item.quantity > 0 && item.unitPrice > 0);

    if (normalizedItems.length === 0) {
      toast.error('Please add at least one invoice line with quantity and unit price');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        customerId,
        projectId: selectedProject ? parseInt(selectedProject, 10) : undefined,
        cycleId: selectedCycle ? parseInt(selectedCycle, 10) : undefined,
        recipient: {
          name: form.recipientName,
          address: {
            street: form.street || undefined,
            postalCode: form.postalCode || undefined,
            city: form.city || undefined,
          },
        },
        items: normalizedItems,
        invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate || undefined,
        dueDate: form.dueDate || undefined,
        currency: form.currency || undefined,
      };

      const response = await fetch('/api/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('application/json')) {
        const data = await response.json().catch(() => null);
        toast.error(data?.message || 'Failed to create invoice');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.invoiceNumber || 'invoice'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success('Invoice created');
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground">Customer</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search or enter customer name"
                    value={customerSearch}
                    onChange={handleCustomerInputChange}
                    onFocus={() => setShowCustomerDropdown(true)}
                    required
                  />
                  {showCustomerDropdown && customerList.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-md shadow max-h-40 overflow-y-auto">
                      {customerList.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => handleSelectCustomer(customer)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        >
                          <div className="font-medium text-foreground">{customer.name}</div>
                          {customer.email && (
                            <div className="text-xs text-muted-foreground">{customer.email}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCustomerDialog(true)}
                >
                  + New
                </Button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground">Recipient Name</label>
              <Input
                name="recipientName"
                value={form.recipientName}
                onChange={handleHeaderChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-foreground">Street</label>
              <Input name="street" value={form.street} onChange={handleHeaderChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Postal Code</label>
              <Input
                name="postalCode"
                value={form.postalCode}
                onChange={handleHeaderChange}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground">City</label>
              <Input name="city" value={form.city} onChange={handleHeaderChange} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground">Invoice Number</label>
              <Input
                name="invoiceNumber"
                value={form.invoiceNumber}
                onChange={handleHeaderChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Invoice Date</label>
              <Input
                type="date"
                name="invoiceDate"
                value={form.invoiceDate}
                onChange={handleHeaderChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Due Date</label>
              <Input
                type="date"
                name="dueDate"
                value={form.dueDate}
                onChange={handleHeaderChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Currency</label>
            <Input name="currency" value={form.currency} onChange={handleHeaderChange} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Invoice Items</h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                Add Item
              </Button>
            </div>
            {items.map((item, index) => {
              const variantsForProduct = products.filter(
                (p) => p.product_name === item.productName
              );

              const uniqueProducts = products.filter(
                (p, i, self) => self.findIndex((sp) => sp.product_name === p.product_name) === i
              );

              return (
                <div
                  key={index}
                  className="space-y-3 border border-border rounded-md p-3 bg-card"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-foreground">Product</label>
                      <Select
                        value={item.productName}
                        onValueChange={(value) => handleProductSelect(index, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueProducts.map((product) => (
                            <SelectItem
                              key={`${product.product_id}-${product.product_name}`}
                              value={product.product_name}
                            >
                              {product.product_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-foreground">Product Variant</label>
                      <Select
                        value={item.variantId}
                        onValueChange={(value) => handleVariantSelect(index, value)}
                        disabled={variantsForProduct.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select variant" />
                        </SelectTrigger>
                        <SelectContent>
                          {variantsForProduct.map((variant) => (
                            <SelectItem
                              key={variant.id.toString()}
                              value={variant.id.toString()}
                            >
                              {variant.label
                                ? `${variant.label}${
                                    variant.unit_of_measurement
                                      ? ` (${variant.unit_of_measurement})`
                                      : ''
                                  }`
                                : 'Default variant'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground">Quantity</label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground">Unit</label>
                      <Input
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        placeholder="e.g., pcs, kg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground">Unit Price</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeItem(index)}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground">Description</label>
                    <Input
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      placeholder="e.g., Product or service description"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Invoice'}
          </Button>
        </DialogFooter>
      </form>

      <Dialog
        open={showCustomerDialog}
        onOpenChange={(open) => setShowCustomerDialog(open)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <CustomerForm
            editingCustomer={null}
            onSuccess={() => {
              setShowCustomerDialog(false);
              loadCustomers(customerSearch);
            }}
            onCancel={() => {
              setShowCustomerDialog(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
