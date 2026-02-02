"use client";

import { useState, useEffect, useMemo, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CustomerForm, Customer as CustomerType } from '@/components/forms/customer-form';
import { calcBalance, calcSaleStatusFromBalance, calcSaleTotal } from '@/lib/accounting/formulas';
import { useFilter } from '@/lib/context/filter-context';
import { Switcher } from '@/components/ui/shadcn-io/navbar-12/Switcher';

interface Sale {
  id: number;
  project_id?: number;
  product_id?: number;
  // Specific variant used in the sale (may be undefined for legacy rows)
  variant_id?: number;
  customer: string;
  quantity: number;
  unit_cost: number;
  price: number;
  status: string;
  date: string;
  cycle_id?: number;
  cash_at_hand?: number;
  balance?: number;
  sale_date?: string;
  notes?: string;
}

// Variant-level product option passed from the Sales page
interface Product {
  // Variant id (from product_variants.id)
  id: number;
  // Parent product id
  product_id: number;
  product_name: string;
  label?: string;
  selling_price?: number;
  unit_cost?: number;
  quantity_in_stock: number;
  unit_of_measurement?: string;
}

const createEmptySaleFormData = (projectId?: string | null) => ({
  project_id: projectId || '',
  // Parent product id
  product_id: '',
  // Specific variant id
  variant_id: '',
  customer: '',
  quantity: '',
  unit_cost: '',
  price: '',
  status: 'pending',
  sale_date: '',
  quantity_in_stock: '',
  cash_at_hand: '',
  balance: '',
  notes: '',
});

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

interface SaleFormProps {
    editingSale: Sale | null;
    selectedProject?: string | null;
    selectedCycle?: string | null;
    projects: { id: number; project_name: string }[];
    cycles: { id: number; cycle_name: string }[];
    products: Product[];
    onSuccess: (mode?: 'close' | 'stay') => void;
    onCancel: () => void;
}

export function SaleForm({ editingSale, selectedProject, selectedCycle, projects, cycles, products, onSuccess, onCancel }: SaleFormProps) {
    const [formData, setFormData] = useState(() => createEmptySaleFormData(selectedProject));
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [availableVariants, setAvailableVariants] = useState<Product[]>([]);
    const [originalStock, setOriginalStock] = useState(0);
    const [customers, setCustomers] = useState<CustomerType[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDialog, setShowCustomerDialog] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(false);

    const { currentCurrencyCode } = useFilter();

    useEffect(() => {
        // Initial load of customers for customer search/dropdown
        loadCustomers();
    }, []);

    const loadCustomers = async (search?: string) => {
        try {
            const url = new URL('/api/v1/customers', window.location.origin);
            if (search && search.trim()) {
                url.searchParams.set('search', search.trim());
            }
            const response = await fetch(url.toString());
            const data = await response.json();
            if (data.status === 'success') {
                setCustomers(data.customers || []);
            }
        } catch (error) {
            // Silent failure – customer search is a convenience
        }
    };

    useEffect(() => {
        if (editingSale && products.length > 0) {
            setIsInitialLoad(true);

            // Prefer matching by variant_id when present; otherwise fall back
            // to any variant for the original product_id.
            let variant: Product | undefined;
            if (editingSale.variant_id) {
                variant = products.find(p => p.id === editingSale.variant_id);
            }
            if (!variant && editingSale.product_id) {
                variant = products.find(p => p.product_id === editingSale.product_id);
            }

            if (variant) {
                const allVariants = products.filter(p => p.product_name === variant!.product_name);
                setAvailableVariants(allVariants);
                setSelectedProduct(variant);

                const stockForEditing = variant.quantity_in_stock + (editingSale.quantity || 0);
                setOriginalStock(stockForEditing);

                setFormData({
                    project_id: editingSale.project_id?.toString() || '',
                    product_id: variant.product_id.toString(),
                    variant_id: variant.id.toString(),
                    customer: editingSale.customer || '',
                    quantity: (editingSale.quantity ?? 0).toString(),
                    // Use selling price as the unit cost shown on the form
                    unit_cost: editingSale.unit_cost != null
                      ? editingSale.unit_cost.toString()
                      : (editingSale.price != null ? editingSale.price.toString() : ''),
                    price: editingSale.price != null ? editingSale.price.toString() : '',
                    status: editingSale.status || 'pending',
                    sale_date: (editingSale.sale_date || editingSale.date)?.split('T')[0] || '',
                    quantity_in_stock: variant.quantity_in_stock.toString(), // Show current stock
                    cash_at_hand: editingSale.cash_at_hand?.toString() || '',
                    balance: editingSale.balance?.toString() || '',
                    notes: editingSale.notes || '',
                });
                setCustomerSearch(editingSale.customer || '');
            } else {
                setFormData(createEmptySaleFormData(selectedProject));
                setSelectedProduct(null);
                setAvailableVariants([]);
            }

            // Set initial load to false after a short delay to allow the form to populate
            setTimeout(() => setIsInitialLoad(false), 100);
        } else {
            setIsInitialLoad(false);
            setFormData(createEmptySaleFormData(selectedProject));
            setSelectedProduct(null);
            setAvailableVariants([]);
        }
    }, [editingSale, products, selectedProject]);

    const handleSubmit = async (e: any, mode: 'close' | 'stay' = 'close') => {
        if (e && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }

        if (isSubmitting) {
          return;
        }
        
        const requestedQuantity = parseInt(formData.quantity);
        if (!requestedQuantity || requestedQuantity <= 0) {
          toast.error('Please enter a quantity greater than 0');
          return;
        }

        if (formData.cash_at_hand === '') {
          toast.error('Please enter Cash at Hand (use 0 if no cash received yet)');
          return;
        }

        const availableStock = parseInt(formData.quantity_in_stock);
        
        // For new sales, a product and specific variant must be selected.
        // For existing sales (editingSale), allow saving even if variant_id is
        // missing to avoid forcing the user to reselect for legacy rows.
        if (!editingSale && (!formData.product_id || !formData.variant_id)) {
          toast.error('Please select a product variant before saving the sale');
          return;
        }

        if (requestedQuantity > availableStock) {
          toast.error(`Requested quantity (${requestedQuantity}) exceeds available stock (${availableStock})`);
          return;
        }

        const unitCostForAmount = parseFloat(formData.unit_cost) || 0;
        const unitPriceForAmount = parseFloat(formData.price) || 0;
        const quantityForAmount = parseInt(formData.quantity) || 0;
        const totalAmountForBalance = calcSaleTotal(quantityForAmount, unitPriceForAmount);
        const cashAtHandNum = parseFloat(formData.cash_at_hand) || 0;
        const remainingBalance = calcBalance(totalAmountForBalance, cashAtHandNum);
        
        const params = {
          customer: formData.customer,
          quantity: quantityForAmount,
          unit_cost: unitCostForAmount,
          price: unitPriceForAmount,
          // Auto status: pending when there is remaining balance, completed when fully paid
          status: calcSaleStatusFromBalance(remainingBalance),
          sale_date: formData.sale_date,
          cash_at_hand: cashAtHandNum,
          balance: remainingBalance,
          ...(formData.project_id && { project_id: parseInt(formData.project_id) }),
          ...(selectedCycle && { cycle_id: parseInt(selectedCycle) }),
          ...(formData.product_id && { product_id: parseInt(formData.product_id) }),
          ...(formData.variant_id && { variant_id: parseInt(formData.variant_id) }),
        };

        try {
          setIsSubmitting(true);

          const token = localStorage.getItem('mcp_token');
          const response = await fetch('/api/v1/sales', {
            method: editingSale ? 'PUT' : 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify(editingSale ? { id: editingSale.id, ...params } : params)
          });

          const data = await response.json();
          
          if (data.status === 'success') {
            toast.success(editingSale ? 'Sale updated successfully' : 'Sale created successfully');

            if (!editingSale && mode === 'stay') {
              setFormData(createEmptySaleFormData(selectedProject));
              setSelectedProduct(null);
              setAvailableVariants([]);
              setOriginalStock(0);
            }

            onSuccess(mode);
          } else {
            toast.error(data.message || 'Operation failed');
          }
        } catch (error) {
          toast.error('Failed to save sale');
        } finally {
          setIsSubmitting(false);
        }
    };

    const handleProductChange = (productName: string) => {
        const variants = products.filter(p => p.product_name === productName);
        setAvailableVariants(variants);
        // Just remember a representative variant for display; actual ids are
        // set when the user picks a specific variant.
        const first = variants[0] || null;
        setSelectedProduct(first);
        setFormData(prev => ({
          ...prev,
          product_id: '',
          variant_id: '',
          unit_cost: '',
          quantity_in_stock: ''
        }));
    };
    
    const handleVariantChange = (variantId: string) => {
        const variant = products.find(p => p.id === parseInt(variantId));
        if (variant) {
            setSelectedProduct(variant);
            setOriginalStock(variant.quantity_in_stock);
            setFormData(prev => ({
                ...prev,
                product_id: variant.product_id.toString(),
                variant_id: variant.id.toString(),
                // Treat Unit Cost on the form as the selling price
                unit_cost: (variant.unit_cost ?? variant.selling_price ?? 0).toString(),
                price: variant.selling_price?.toString() || '',
                quantity_in_stock: variant.quantity_in_stock.toString(),
                quantity: '0' // Default quantity to 0 so user must choose
            }));
        } else {
            setSelectedProduct(null);
            setOriginalStock(0);
        }
    };

    const getProjectName = (id?: string | null) => {
        if (!id) return 'N/A';
        const project = projects.find(p => p.id === parseInt(id));
        return project?.project_name || 'Unknown';
    };

    const getCycleName = (id?: string | null) => {
        if (!id) return 'No cycle selected';
        const cycle = cycles.find(c => c.id === parseInt(id));
        return cycle?.cycle_name || 'Unknown Cycle';
    };

    const unitPriceForAmount = parseFloat(formData.price) || 0;
    const quantity = parseInt(formData.quantity) || 0;
    const totalAmount = unitPriceForAmount * quantity;
    const cashAtHandNum = parseFloat(formData.cash_at_hand) || 0;
    const remainingBalance = totalAmount - cashAtHandNum;

    const autoStatus = remainingBalance > 0 ? 'pending' : 'completed';

    const showFullForm = !!(editingSale || (formData.project_id && selectedCycle && formData.variant_id));

    // Ensure product Select reflects the current product based on formData/product_id
    const selectedProductName =
      selectedProduct?.product_name ||
      (formData.product_id
        ? products.find(p => p.product_id === parseInt(formData.product_id))?.product_name || ''
        : '');

    const uniqueProducts = products.filter(
      (p, index, self) => self.findIndex(sp => sp.product_name === p.product_name) === index,
    );

    const productItems = uniqueProducts.map((p) => ({ value: p.product_name, label: p.product_name }));

    const variantItems = availableVariants.map((variant) => ({
      value: variant.id.toString(),
      label: variant.label
        ? `${variant.label}${variant.unit_of_measurement ? ` (${variant.unit_of_measurement})` : ''}`
        : 'Default variant',
    }));

    const customerItems = useMemo(() => {
      const base = customers.map((c) => ({ value: c.name, label: c.name }));
      const typed = (customerSearch || formData.customer || '').trim();
      if (!typed) return base;
      const exists = base.some((i) => i.value.toLowerCase() === typed.toLowerCase());
      return exists ? base : [{ value: typed, label: typed }, ...base];
    }, [customers, customerSearch, formData.customer]);

    return (
      <>
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Product *</label>
                <Switcher
                  items={productItems}
                  value={selectedProductName}
                  onChange={(value) => {
                    if (!isInitialLoad) {
                      handleProductChange(value);
                    }
                  }}
                  placeholder="Select product"
                  searchPlaceholder="Search product..."
                  emptyText="No products found."
                  widthClassName="w-full"
                  allowClear={false}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Product Variant *</label>
                <Switcher
                  items={variantItems}
                  value={formData.variant_id}
                  onChange={(value) => handleVariantChange(value)}
                  disabled={availableVariants.length === 0}
                  placeholder="Select variant"
                  searchPlaceholder="Search variant..."
                  emptyText="No variants found."
                  widthClassName="w-full"
                  allowClear={false}
                />
              </div>

              {showFullForm && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Customer</label>
                    <Switcher
                      items={customerItems}
                      value={formData.customer}
                      onChange={(value) => {
                        setFormData((prev) => ({ ...prev, customer: value }));
                        setCustomerSearch(value);
                      }}
                      placeholder="Search or enter customer name"
                      searchPlaceholder="Search customer..."
                      onSearchChange={(query) => {
                        setCustomerSearch(query);
                        setFormData((prev) => ({ ...prev, customer: query }));
                        void loadCustomers(query);
                      }}
                      emptyText="No customers found."
                      widthClassName="w-full"
                      actionLabel="+ New customer"
                      onAction={() => setShowCustomerDialog(true)}
                      allowClear={false}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Quantity in Stock</label>
                    <Input
                      value={formData.quantity_in_stock}
                      readOnly
                      className="bg-muted text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Project</label>
                    <Input
                      value={getProjectName(selectedProject)}
                      readOnly
                      className="bg-muted text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Cycle</label>
                    <Input
                      value={getCycleName(selectedCycle)}
                      readOnly
                      className="bg-muted text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Quantity *</label>
                    <Input
                      type="number"
                      min={1}
                      max={formData.quantity_in_stock ? parseInt(formData.quantity_in_stock) : undefined}
                      value={formData.quantity}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const newQuantity = parseInt(e.target.value, 10) || 0;
                        const stock = originalStock;
                        const remainingStock = stock - newQuantity;
                        setFormData({ 
                            ...formData, 
                            quantity: e.target.value,
                            quantity_in_stock: remainingStock.toString()
                        });
                      }}
                      required
                    />
                    {formData.quantity_in_stock && (
                      <p className="text-xs text-muted-foreground mt-1">Max available: {formData.quantity_in_stock}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      {currentCurrencyCode
                        ? `Selling Price (${currentCurrencyCode}) *`
                        : 'Selling Price *'}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formData.price}
                      readOnly
                      className="bg-muted text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      {currentCurrencyCode
                        ? `Amount (${currentCurrencyCode}) *`
                        : 'Amount *'}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={totalAmount ? totalAmount.toFixed(2) : ''}
                      readOnly
                      className="bg-muted text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Status *</label>
                    <Switcher
                      items={statusOptions.map((option) => ({ value: option.value, label: option.label }))}
                      value={autoStatus}
                      onChange={() => {
                        // status is auto-derived from remaining balance
                      }}
                      disabled
                      placeholder="Select status"
                      searchPlaceholder="Search status..."
                      emptyText="No statuses found."
                      widthClassName="w-full"
                      allowClear={false}
                    />
                    {formData.product_id && formData.quantity && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ⚠️ Stock will be automatically reduced by {formData.quantity} units when saved
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-foreground">Sale Date *</label>
                    <input
                      type="date"
                      value={formData.sale_date}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, sale_date: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      {currentCurrencyCode
                        ? `Cash at Hand (${currentCurrencyCode}) *`
                        : 'Cash at Hand *'}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formData.cash_at_hand}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, cash_at_hand: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      {currentCurrencyCode
                        ? `Remaining Balance (${currentCurrencyCode})`
                        : 'Remaining Balance'}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={remainingBalance ? remainingBalance.toFixed(2) : ''}
                      readOnly
                      className="bg-muted text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Notes</label>
                    <textarea
                      placeholder="Enter notes (optional)"
                      value={formData.notes}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              {!editingSale && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={(e) => handleSubmit(e, 'stay')}
                  disabled={isSubmitting}
                >
                  Save & Add Another
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {editingSale ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
          <Dialog
            open={showCustomerDialog}
            onOpenChange={(open) => {
              setShowCustomerDialog(open);
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Customer</DialogTitle>
              </DialogHeader>
              <CustomerForm
                editingCustomer={null}
                onSuccess={(createdCustomer) => {
                  setShowCustomerDialog(false);

                  const name = (createdCustomer?.name || '').trim();
                  if (name) {
                    setCustomerSearch(name);
                    setFormData((prev) => ({ ...prev, customer: name }));
                    void loadCustomers(name);
                  } else {
                    void loadCustomers(customerSearch);
                  }
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
