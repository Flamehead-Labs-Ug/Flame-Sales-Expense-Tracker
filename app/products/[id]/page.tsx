'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switcher } from '@/components/ui/shadcn-io/navbar-12/Switcher';
import { AuthGuard } from '@/components/auth-guard';
import { useFilter } from '@/lib/context/filter-context';
import { ProductForm } from '@/components/forms/product-form';

interface VariantAttribute {
  type: string;
  value: string;
  unit: string;
}

interface ProductVariant {
  id: number;
  product_id: number;
  label?: string;
  unit_cost?: number;
  selling_price?: number;
  quantity_in_stock: number;
  unit_of_measurement?: string;
  images?: string[];
  attributes?: VariantAttribute[];
}

interface Product {
  id: number;
  product_name: string;
  description?: string;
  sku?: string;
  unit_cost?: number;
  selling_price?: number;
  quantity_in_stock: number;
  reorder_level: number;
  category?: string;
  variant_name?: string;
  variant_value?: string;
  unit_of_measurement?: string;
  project_id?: number;
  cycle_id?: number;
  project_category_id?: number;
  images?: string[];
  attributes?: VariantAttribute[];
  variants?: ProductVariant[];
}

interface ExpenseCategory {
  id: number;
  category_name: string;
}

interface InventoryTransaction {
  id: number;
  organization_id: number;
  project_id?: number;
  cycle_id?: number;
  product_id: number;
  variant_id?: number;
  expense_id?: number;
  sale_id?: number;
  type: string;
  quantity_delta: number;
  unit_cost?: number;
  notes?: string;
  created_by?: number;
  created_at: string;
}

const INVENTORY_PURCHASE_CATEGORY_NAME = 'Product/ Inventory / Stock Purchases';

function ProductDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const productId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const { selectedCycle, selectedProject, projects } = useFilter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockMode, setStockMode] = useState<'purchase' | 'adjust'>('purchase');
  const [stockVariantId, setStockVariantId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockUnitCost, setStockUnitCost] = useState('');
  const [stockSellingPrice, setStockSellingPrice] = useState('');
  const [stockNotes, setStockNotes] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);

  const projectName = useMemo(() => {
    if (!product?.project_id) return 'N/A';
    const p = projects.find((x) => x.id === product.project_id);
    return p?.project_name || 'Unknown';
  }, [product?.project_id, projects]);

  const variantItems = useMemo(() => {
    const list = Array.isArray(product?.variants) ? product!.variants! : [];
    return list.map((v) => ({
      value: v.id.toString(),
      label: v.label ? v.label : 'Default variant',
    }));
  }, [product]);

  const selectedVariant = useMemo(() => {
    if (!product?.variants || !stockVariantId) return null
    return product.variants.find((v) => v.id === parseInt(stockVariantId, 10)) || null
  }, [product?.variants, stockVariantId])

  const variantLabelById = useMemo(() => {
    const map = new Map<number, string>()
    for (const v of product?.variants || []) {
      map.set(v.id, v.label ? v.label : 'Default variant')
    }
    return map
  }, [product?.variants])

  const purchaseCategoryId = useMemo(() => {
    const found = expenseCategories.find((c) => c.category_name === INVENTORY_PURCHASE_CATEGORY_NAME);
    return found?.id ?? null;
  }, [expenseCategories]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/products?id=${productId}`);
      const data = await response.json();
      if (data.status === 'success') {
        const p = (data.products || [])[0] as Product | undefined;
        if (!p) {
          toast.error('Product not found');
          setProduct(null);
          return;
        }
        setProduct(p);
      } else {
        toast.error(data.message || 'Failed to load product');
      }
    } catch {
      toast.error('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const loadExpenseCategories = async () => {
    try {
      const url = new URL('/api/v1/expense-categories', window.location.origin);
      if (selectedProject) {
        url.searchParams.set('projectId', selectedProject);
      } else if (product?.project_id) {
        url.searchParams.set('projectId', product.project_id.toString());
      }

      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status === 'success') {
        setExpenseCategories(data.categories || []);
      }
    } catch {
    }
  };

  const loadTransactions = async () => {
    try {
      const url = new URL('/api/v1/inventory-transactions', window.location.origin);
      url.searchParams.set('product_id', productId);
      if (selectedProject) url.searchParams.set('project_id', selectedProject);
      if (selectedCycle) url.searchParams.set('cycle_id', selectedCycle);
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status === 'success') {
        setTransactions(data.transactions || []);
      }
    } catch {
    }
  };

  useEffect(() => {
    if (!productId) return;
    void loadProduct();
  }, [productId]);

  useEffect(() => {
    void loadExpenseCategories();
  }, [selectedProject, product?.project_id]);

  useEffect(() => {
    if (!productId) return;
    void loadTransactions();
  }, [productId, selectedProject, selectedCycle]);

  const openStockDialog = (mode: 'purchase' | 'adjust') => {
    setStockMode(mode);
    setShowStockDialog(true);
    setStockVariantId('');
    setStockQuantity('');
    setStockUnitCost('');
    setStockSellingPrice('');
    setStockNotes('');
  };

  useEffect(() => {
    if (!selectedVariant) return
    if (stockMode === 'purchase') {
      setStockUnitCost((prev) => {
        if (prev && prev.trim() !== '') return prev
        return selectedVariant.unit_cost != null ? String(selectedVariant.unit_cost) : ''
      })
      setStockSellingPrice((prev) => {
        if (prev && prev.trim() !== '') return prev
        return selectedVariant.selling_price != null ? String(selectedVariant.selling_price) : ''
      })
    }
  }, [selectedVariant, stockMode])

  const handleSaveStock = async () => {
    if (!product) return;

    const qty = parseInt(stockQuantity || '0', 10) || 0;
    if (qty <= 0) {
      toast.error('Enter a quantity greater than 0');
      return;
    }

    if (!selectedProject || !selectedCycle) {
      toast.error('Please select a project and cycle from the top navigation first.');
      return;
    }

    if (!stockVariantId) {
      toast.error('Please select a variant');
      return;
    }

    if (stockMode === 'purchase') {
      const unitCost = parseFloat(stockUnitCost || '0') || 0;
      if (unitCost <= 0) {
        toast.error('Enter a unit cost greater than 0');
        return;
      }

      if (!purchaseCategoryId) {
        toast.error(`Missing expense category: ${INVENTORY_PURCHASE_CATEGORY_NAME}`);
        return;
      }
    }

    try {
      setIsSavingStock(true);

      const variant = product.variants?.find((v) => v.id === parseInt(stockVariantId, 10));
      const payload: any = {
        type: stockMode === 'purchase' ? 'PURCHASE' : 'ADJUSTMENT_IN',
        project_id: parseInt(selectedProject, 10),
        cycle_id: parseInt(selectedCycle, 10),
        product_id: product.id,
        variant_id: parseInt(stockVariantId, 10),
        quantity: qty,
        notes: stockNotes || null,
      };

      if (stockMode === 'purchase') {
        payload.create_expense = true;
        payload.expense_category_id = purchaseCategoryId;
        payload.expense_name = variant?.label
          ? `Stock Purchase - ${product.product_name} (${variant.label})`
          : `Stock Purchase - ${product.product_name}`;
        payload.unit_cost = parseFloat(stockUnitCost || '0') || 0;
        payload.update_variant_unit_cost = parseFloat(stockUnitCost || '0') || null;
        payload.update_variant_selling_price = stockSellingPrice.trim() === '' ? null : (parseFloat(stockSellingPrice) || null);
        payload.expense_date = new Date().toISOString();
      } else {
        payload.create_expense = false;
      }

      const response = await fetch('/api/v1/inventory-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to update stock');
      }

      toast.success(stockMode === 'purchase' ? 'Stock purchase recorded' : 'Stock adjusted');
      setShowStockDialog(false);
      await loadProduct();
      await loadTransactions();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update stock';
      toast.error(msg);
    } finally {
      setIsSavingStock(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!product) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-4">
          <Button variant="outline" onClick={() => router.push('/products')}>Back</Button>
          <div className="text-muted-foreground">Product not found.</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{product.product_name}</h1>
            <div className="text-sm text-muted-foreground">Project: {projectName}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/products')}>Back</Button>
            <Button variant="outline" onClick={() => setShowEditForm(true)}>Edit Details</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">SKU</CardTitle>
              <CardDescription className="text-xs">Unique identifier</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm">{product.sku || 'N/A'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Total Stock</CardTitle>
              <CardDescription className="text-xs">Current quantity in stock</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Number(product.quantity_in_stock || 0).toLocaleString()}</div>
            </CardContent>
            <CardFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => openStockDialog('adjust')}>Adjust Stock</Button>
              <Button onClick={() => openStockDialog('purchase')}>Add Stock (Purchase)</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Reorder Level</CardTitle>
              <CardDescription className="text-xs">Low stock alert threshold</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Number(product.reorder_level || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
              <CardDescription>View variant details (edit prices/attributes via Edit Details)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(product.variants || []).map((v) => (
                <div key={v.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-border rounded-md p-3">
                  <div>
                    <div className="font-medium">{v.label || 'Default variant'}</div>
                    <div className="text-xs text-muted-foreground">Stock: {Number(v.quantity_in_stock || 0).toLocaleString()}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Unit cost: {v.unit_cost ?? 'N/A'} | Selling: {v.selling_price ?? 'N/A'}
                  </div>
                </div>
              ))}
              {(!product.variants || product.variants.length === 0) && (
                <div className="text-sm text-muted-foreground">No variants found.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stock History</CardTitle>
              <CardDescription>Inventory transactions for this product (filtered by selected cycle/project)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium px-3 py-2">Date</th>
                      <th className="text-left font-medium px-3 py-2">Type</th>
                      <th className="text-left font-medium px-3 py-2">Variant</th>
                      <th className="text-right font-medium px-3 py-2">Qty</th>
                      <th className="text-right font-medium px-3 py-2">Unit Cost</th>
                      <th className="text-left font-medium px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-border/60">
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{t.type}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{t.variant_id ? (variantLabelById.get(t.variant_id) || `#${t.variant_id}`) : '—'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{t.quantity_delta > 0 ? `+${t.quantity_delta}` : t.quantity_delta}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{t.unit_cost ?? '—'}</td>
                        <td className="px-3 py-2">{t.notes || '—'}</td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-muted-foreground" colSpan={6}>No transactions yet for this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <ProductForm
              editingProduct={product}
              selectedProject={product.project_id?.toString() || selectedProject}
              selectedCycle={product.cycle_id?.toString() || selectedCycle}
              projects={projects}
              onSuccess={() => {
                setShowEditForm(false);
                void loadProduct();
              }}
              onCancel={() => setShowEditForm(false)}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={showStockDialog} onOpenChange={setShowStockDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{stockMode === 'purchase' ? 'Add Stock (Purchase)' : 'Adjust Stock'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Variant</label>
                <Switcher
                  items={variantItems}
                  value={stockVariantId}
                  onChange={(value) => setStockVariantId(value)}
                  placeholder="Select variant"
                  searchPlaceholder="Search variant..."
                  emptyText="No variants found."
                  widthClassName="w-full"
                  allowClear={false}
                />
                {selectedVariant && (
                  <div className="mt-1 text-xs text-muted-foreground">Available: {Number(selectedVariant.quantity_in_stock || 0).toLocaleString()}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Quantity</label>
                <Input type="number" min={1} value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} />
              </div>

              {stockMode === 'purchase' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground">Unit Cost</label>
                    <Input type="number" step="0.01" min={0} value={stockUnitCost} onChange={(e) => setStockUnitCost(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Selling Price</label>
                    <Input type="number" step="0.01" min={0} value={stockSellingPrice} onChange={(e) => setStockSellingPrice(e.target.value)} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground">Notes</label>
                <Input value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowStockDialog(false)} disabled={isSavingStock}>Cancel</Button>
              <Button onClick={handleSaveStock} disabled={isSavingStock}>
                {isSavingStock ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}

export default function ProductDetailsPage() {
  return <ProductDetailsPageContent />;
}
