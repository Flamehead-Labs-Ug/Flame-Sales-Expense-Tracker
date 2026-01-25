'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';
import { Trash2, Edit, Plus } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { useFilter } from '@/lib/context/filter-context';
import { ProductForm } from '@/components/forms/product-form';

interface VariantType {
  id: number;
  type_name: string;
  units: { id: number; unit_name: string }[];
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
  created_by: number;
  created_at: string;
  updated_at: string;
  project_id?: number;
  cycle_id?: number;
  project_category_id?: number;
  images?: string[];
  attributes?: VariantAttribute[];
  variants?: ProductVariant[];
}

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

interface ProductFormData {
  product_name: string;
  description: string;
  sku: string;
  reorder_level: string;
  category: string;
  unit_cost: string;
  selling_price: string;
  quantity_in_stock: string;
  variant_name: string;
  variant_value: string;
  unit_of_measurement: string;
}

const createEmptyFormData = (): ProductFormData => ({
  product_name: '',
  description: '',
  sku: '',
  reorder_level: '',
  category: '',
  unit_cost: '',
  selling_price: '',
  quantity_in_stock: '',
  variant_name: '',
  variant_value: '',
  unit_of_measurement: ''
});

const createEmptyVariant = () => ({
  variant_name: '',
  variant_value: '',
  unit_of_measurement: '',
  unit_cost: '',
  selling_price: '',
  quantity_in_stock: '',
  images: [] as string[]
});

function ProductsPageContent() {
  const { selectedProject, selectedCycle, projects, setSelectedProject, currentCurrencyCode } = useFilter();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [projectCategories, setProjectCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const getProjectName = (id?: string) => {
    if (!id) return 'No project selected';
    const project = projects.find(p => p.id === parseInt(id));
    return project?.project_name || 'Unknown';
  };

  const getProjectCategoryName = () => {
    if (!selectedProject) return 'No project selected';
    const project = projects.find(p => p.id === parseInt(selectedProject));
    if (!project?.project_category_id) return 'No category';
    const category = projectCategories.find(c => c.id === project.project_category_id);
    return category?.category_name || 'Unknown Category';
  };

  const loadData = async () => {
    try {
      const [productsRes, projectCategoriesRes] = await Promise.all([
        fetch('/api/v1/products'),
        fetch('/api/v1/project-categories')
      ]);
      
      const productsData = await productsRes.json();
      const projectCategoriesData = await projectCategoriesRes.json();
      
      if (productsData.status === 'success') {
        setProducts(productsData.products || []);
      }
      if (projectCategoriesData.status === 'success') {
        setProjectCategories(projectCategoriesData.categories || []);
      }
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    const matchesProject = selectedProject
      ? product.project_id === parseInt(selectedProject, 10)
      : true;

    const matchesSearch = normalizedSearch
      ? (product.product_name?.toLowerCase().includes(normalizedSearch) ||
          (product.sku || '').toLowerCase().includes(normalizedSearch))
      : true;

    return matchesProject && matchesSearch;
  });

  const productCount = filteredProducts.length;
  const totalCostOfProducts = filteredProducts.reduce((sum, product) => {
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const variantTotal = product.variants.reduce((variantSum, variant) => {
        const unitCost = Number(variant.unit_cost) || 0;
        const qty = Number(variant.quantity_in_stock) || 0;
        return variantSum + unitCost * qty;
      }, 0);
      return sum + variantTotal;
    }

    const unitCost = Number(product.unit_cost) || 0;
    const qty = Number(product.quantity_in_stock) || 0;
    return sum + unitCost * qty;
  }, 0);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const response = await fetch(`/api/v1/products?id=${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast.success('Product deleted successfully');
        loadData();
      } else {
        toast.error(data.message || 'Failed to delete product');
      }
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h1 className="text-3xl font-bold">Products</h1>
          <Button
            color="primary"
            onClick={() => {
              if (!selectedProject) {
                toast.error('Please select a project before creating a product');
                return;
              }
              setEditingProduct(null);
              setShowForm(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <select
              className="px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
              value={selectedProject || ''}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id.toString()}>
                  {project.project_name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-64">
            <input
              type="text"
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
              placeholder="Search by product name or SKU"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Number of Products</CardTitle>
              <CardDescription className="text-xs">Based on current filters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Number(productCount).toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-medium">Total Cost of Products</CardTitle>
              <CardDescription className="text-xs">Sum of unit cost x stock</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currentCurrencyCode
                  ? `${currentCurrencyCode} ${Number(totalCostOfProducts).toLocaleString()}`
                  : Number(totalCostOfProducts).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            </DialogHeader>
            <ProductForm 
              editingProduct={editingProduct}
              selectedProject={selectedProject}
              selectedCycle={selectedCycle}
              projects={projects}
              onSuccess={() => {
                setShowForm(false);
                setEditingProduct(null);
                loadData();
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingProduct(null);
              }}
            />
          </DialogContent>
        </Dialog>

        <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <Card key={product.id}>
                <CardHeader className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-semibold">
                      {product.product_name}
                    </CardTitle>
                    {product.sku && (
                      <span className="px-2 py-1 text-xs bg-muted text-foreground rounded">
                        SKU: {product.sku}
                      </span>
                    )}
                    {product.variants && product.variants.length > 0 && (
                      <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                        {product.variants.length} variant{product.variants.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {product.description && (
                    <CardDescription className="text-xs text-muted-foreground">
                      {product.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="px-6 py-0" />
                <CardFooter className="flex justify-end gap-2 px-6 pb-4 pt-3">
                  <button 
                    onClick={() => router.push(`/products/${product.id}`)}
                    className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                  >
                    View
                  </button>
                  <button 
                    onClick={() => handleEdit(product)}
                    className="inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded-md text-foreground bg-background hover:bg-muted"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(product.id)}
                    className="inline-flex items-center px-3 py-1.5 border border-destructive/40 text-sm font-medium rounded-md text-destructive bg-background hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </CardFooter>
              </Card>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
                No products found. Create your first product to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function ProductsPage() {
  return <ProductsPageContent />
}