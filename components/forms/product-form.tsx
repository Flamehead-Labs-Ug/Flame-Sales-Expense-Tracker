'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switcher } from '@/components/ui/shadcn-io/navbar-12/Switcher';
import { useFilter } from '@/lib/context/filter-context';
import { Trash2, Plus, Info, Upload, X } from 'lucide-react';
import { DialogFooter } from '@/components/ui/dialog';

interface VariantType {
  id: number;
  type_name: string;
  units: { id: number; unit_name: string }[];
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
  // Normalized from the JSONB attributes column by the API
  attributes?: VariantAttribute[];
  // Attached by the GET /api/products handler from product_variants
  variants?: ProductVariant[];
}

interface VariantAttribute {
  type: string;
  value: string;
  unit: string;
}

interface ProductFormData {
  product_name: string;
  description: string;
  sku: string;
  reorder_level: string;
  category: string;
}

const createEmptyFormData = (): ProductFormData => ({
  product_name: '',
  description: '',
  sku: '',
  reorder_level: '',
  category: '',
});

const createEmptyVariant = () => ({
  id: null as number | null,
  label: '',
  unit_cost: '',
  selling_price: '',
  quantity_in_stock: '',
  images: [] as string[],
  attributes: [
    { type: '', value: '', unit: '' } as VariantAttribute,
  ],
});

interface ProductFormProps {
    editingProduct: Product | null;
    selectedProject?: string | null;
    selectedCycle?: string | null;
    projects: { id: number, project_name: string, project_category_id?: number }[];
    onSuccess: (product: Product) => void;
    onCancel: () => void;
}

export function ProductForm({ editingProduct, selectedProject, selectedCycle, projects, onSuccess, onCancel }: ProductFormProps) {
    const [formData, setFormData] = useState<ProductFormData>(() => createEmptyFormData());
    const [variants, setVariants] = useState(() => [createEmptyVariant()]);
    const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentCurrencyCode } = useFilter();

  useEffect(() => {
    loadVariantTypes();
  }, []);

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        product_name: editingProduct.product_name,
        description: editingProduct.description || '',
        sku: editingProduct.sku || '',
        reorder_level: editingProduct.reorder_level?.toString() || '',
        category: editingProduct.category || '',
      });
      // Prefer rebuilding variants from the dedicated product_variants table if available
      if (Array.isArray(editingProduct.variants) && editingProduct.variants.length > 0) {
        const rebuilt = editingProduct.variants.map((v) => {
          const rawAttrs = (v.attributes || []) as VariantAttribute[];
          const safeAttrs = rawAttrs.length > 0
            ? rawAttrs.map((attr) => ({
                type: attr.type || '',
                value: attr.value || '',
                unit: attr.unit || '',
              }))
            : [
                {
                  type: editingProduct.variant_name || '',
                  value: editingProduct.variant_value || '',
                  unit: editingProduct.unit_of_measurement || '',
                },
              ];

          return {
            id: v.id,
            label: v.label || '',
            unit_cost: v.unit_cost?.toString() || '',
            selling_price: v.selling_price?.toString() || '',
            quantity_in_stock: (v.quantity_in_stock ?? 0).toString(),
            images: Array.isArray(v.images) ? v.images : [],
            attributes: safeAttrs,
          };
        });

        setVariants(rebuilt);
      } else {
        // Legacy fallback: rebuild variant state from attributes JSON plus the legacy flat fields
        const rawAttrs = (editingProduct as any).attributes as VariantAttribute[] | undefined;

        let labelFromAttributes = '';
        let nonLabelAttributes: VariantAttribute[] = [];

        if (Array.isArray(rawAttrs) && rawAttrs.length > 0) {
          rawAttrs.forEach((attr) => {
            if (attr && attr.type === 'Variant Name') {
              labelFromAttributes = attr.value || '';
            } else if (attr && (attr.type || attr.value || attr.unit)) {
              nonLabelAttributes.push({
                type: attr.type || '',
                value: attr.value || '',
                unit: attr.unit || '',
              });
            }
          });
        }

        // Fallback: if we have no non-label attributes, synthesize one from legacy flat fields
        if (nonLabelAttributes.length === 0) {
          nonLabelAttributes = [
            {
              type: editingProduct.variant_name || '',
              value: editingProduct.variant_value || '',
              unit: editingProduct.unit_of_measurement || '',
            },
          ];
        }

        setVariants([
          {
            id: null,
            label: labelFromAttributes,
            unit_cost: editingProduct.unit_cost?.toString() || '',
            selling_price: editingProduct.selling_price?.toString() || '',
            quantity_in_stock: editingProduct.quantity_in_stock.toString(),
            images: Array.isArray(editingProduct.images) ? editingProduct.images : [],
            attributes: nonLabelAttributes,
          },
        ]);
      }
    } else {
      setFormData(createEmptyFormData());
      setVariants([createEmptyVariant()]);
    }
  }, [editingProduct]);

  const loadVariantTypes = async () => {
    try {
      const response = await fetch('/api/v1/variant-types');
      const data = await response.json();
      if (data.status === 'success') {
        setVariantTypes(data.variantTypes);
      }
    } catch (error) {
      console.error('Failed to load variant types:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!editingProduct && !selectedProject) {
      toast.error('Please select a project before creating a product');
      return;
    }

    // Require Variant 1 to have at least one fully defined attribute when creating a new product
    if (!editingProduct) {
      const firstVariant = variants[0];
      const hasValidAttribute = (firstVariant?.attributes || []).some((attr) =>
        Boolean(attr.type && attr.unit && attr.value)
      );

      if (!hasValidAttribute) {
        toast.error('Please define at least one attribute for Variant 1 (type, value, and unit) before creating the product');
        return;
      }
    }

    const selectedProjectObj = projects.find((p) => p.id === parseInt(selectedProject || '0', 10));

    const attributes = variants.flatMap((variant) => {
      const baseAttrs = (variant.attributes || []).map((attr: VariantAttribute) => ({
        type: attr.type,
        value: attr.value,
        unit: attr.unit,
      }));

      if (variant.label) {
        return [
          ...baseAttrs,
          {
            type: 'Variant Name',
            value: variant.label,
            unit: '',
          },
        ];
      }

      return baseAttrs;
    });

    const params = {
      product_name: formData.product_name,
      description: formData.description,
      reorder_level: parseInt(formData.reorder_level || '0', 10) || 0,
      category: formData.category,
      project_id: selectedProject ? parseInt(selectedProject, 10) : null,
      cycle_id: selectedCycle ? parseInt(selectedCycle, 10) : null,
      project_category_id: selectedProjectObj?.project_category_id || null,
      attributes,
      variants: variants.map((variant) => {
        const primaryAttr: VariantAttribute =
          (variant.attributes && variant.attributes[0]) || {
            type: '',
            value: '',
            unit: '',
          };
        return {
          ...(variant.id ? { id: variant.id } : {}),
          label: variant.label,
          attributes: variant.attributes,
          variant_name: primaryAttr.type,
          variant_value: primaryAttr.value,
          unit_of_measurement: primaryAttr.unit,
          unit_cost: variant.unit_cost ? parseFloat(variant.unit_cost) : null,
          selling_price: variant.selling_price ? parseFloat(variant.selling_price) : null,
          quantity_in_stock: parseInt(variant.quantity_in_stock || '0', 10) || 0,
          images: variant.images,
        };
      }),
    };

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/v1/products', {
        method: editingProduct ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingProduct ? { id: editingProduct.id, ...params } : params),
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast.success(editingProduct ? 'Product updated successfully' : 'Product created successfully');
        onSuccess(data.product);
      } else {
        toast.error(data.message || 'Operation failed');
      }
    } catch (error) {
      toast.error('Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addVariant = () => {
    setVariants((prev) => [...prev, createEmptyVariant()]);
  };

  const removeVariant = (index: number) => {
    setVariants((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const updateVariant = (index: number, field: string, value: string | string[]) => {
    setVariants((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleImageUpload = (index: number, files: FileList | null) => {
    if (!files) return;

    const currentImages = variants[index].images;
    if (currentImages.length + files.length > 10) {
      toast.error('Maximum 10 images allowed per variant');
      return;
    }

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const newImages = [...variants[index].images, e.target?.result as string];
        updateVariant(index, 'images', newImages);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (variantIndex: number, imageIndex: number) => {
    const newImages = variants[variantIndex].images.filter((_, i) => i !== imageIndex);
    updateVariant(variantIndex, 'images', newImages);
  };

  const addAttribute = (variantIndex: number) => {
    setVariants((prev) => {
      const copy = [...prev];
      const attrs: VariantAttribute[] = copy[variantIndex].attributes || [];
      copy[variantIndex] = {
        ...copy[variantIndex],
        attributes: [...attrs, { type: '', value: '', unit: '' }],
      };
      return copy;
    });
  };

  const updateAttribute = (
    variantIndex: number,
    attributeIndex: number,
    field: keyof VariantAttribute,
    value: string,
  ) => {
    setVariants((prev) => {
      const copy = [...prev];
      const variant = copy[variantIndex];
      const attrs: VariantAttribute[] = [...(variant.attributes || [])];
      attrs[attributeIndex] = { ...attrs[attributeIndex], [field]: value };
      copy[variantIndex] = { ...variant, attributes: attrs };
      return copy;
    });
  };

  const handleAttributeTypeChange = (
    variantIndex: number,
    attributeIndex: number,
    variantType: string,
  ) => {
    setVariants((prev) => {
      const copy = [...prev];
      const variant = copy[variantIndex];
      const attrs: VariantAttribute[] = [...(variant.attributes || [])];
      attrs[attributeIndex] = {
        ...attrs[attributeIndex],
        type: variantType,
        value: '',
        unit: '',
      };
      copy[variantIndex] = { ...variant, attributes: attrs };
      return copy;
    });
  };

  const getAvailableUnits = (variantTypeName: string) => {
    const variantType = variantTypes.find((vt) => vt.type_name === variantTypeName);
    return variantType?.units || [];
  };

  const removeAttribute = (variantIndex: number, attributeIndex: number) => {
    setVariants((prev) => {
      const copy = [...prev];
      const variant = copy[variantIndex];
      const attrs: VariantAttribute[] = [...(variant.attributes || [])];
      if (attrs.length <= 1) {
        return prev;
      }
      attrs.splice(attributeIndex, 1);
      copy[variantIndex] = { ...variant, attributes: attrs };
      return copy;
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: core product fields + description */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-sm font-medium text-foreground">Product Name *</label>
                <div className="group relative">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                    Overall name of the product (e.g., &quot;Office Chair&quot;, &quot;Rice 25kg&quot;)
                  </div>
                </div>
              </div>
              <Input
                value={formData.product_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, product_name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-sm font-medium text-foreground">SKU *</label>
                <div className="group relative">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                    System-generated stock keeping unit used to uniquely identify this product
                  </div>
                </div>
              </div>
              <Input
                value={formData.sku || 'Auto-generated after saving'}
                readOnly
                className="bg-background text-foreground"
              />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-sm font-medium text-foreground">Reorder Level</label>
                <div className="group relative">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                    Minimum stock level that should trigger a restock alert
                  </div>
                </div>
              </div>
              <Input
                type="number"
                value={formData.reorder_level}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, reorder_level: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="block text-sm font-medium text-foreground">Description</label>
              <div className="group relative">
                <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                </div>
                <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                  Optional extra details about the product to help you and others recognize it
                </div>
              </div>
            </div>
            <textarea
              value={formData.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            />
          </div>
        </div>

        {/* Right column: product variants */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-foreground">Product Variants</h3>
            <Button type="button" onClick={addVariant} variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Variant
            </Button>
          </div>

          {variants.map((variant, index) => (
          <div key={index} className="bg-card p-4 rounded-lg border border-border">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-foreground">
                {variant.label || `Variant ${index + 1}`}
              </h4>
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  className="text-destructive hover:text-destructive/80"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-sm font-medium text-foreground">Variant Name</label>
                <div className="group relative">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                    Friendly name for this specific variant (e.g., &quot;Red Medium&quot;, &quot;5kg Bag&quot;)
                  </div>
                </div>
              </div>
              <Input
                value={variant.label}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateVariant(index, 'label', e.target.value)
                }
                placeholder="e.g., Red T-Shirt, 5kg Bag"
                required
              />
            </div>

            {(variant.attributes || []).map((attr: VariantAttribute, attrIndex: number) => (
              <div key={attrIndex} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 items-end">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="block text-sm font-medium text-foreground">Attribute</label>
                    <div className="group relative">
                      <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                        <Info className="w-3.5 h-3.5" />
                      </div>
                      <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                        Choose what kind of attribute this is (e.g., Size, Color, Weight)
                      </div>
                    </div>
                  </div>
                  <Switcher
                    items={variantTypes.map((type) => ({ value: type.type_name, label: type.type_name }))}
                    value={attr.type}
                    onChange={(value) => handleAttributeTypeChange(index, attrIndex, value)}
                    placeholder="Select attribute"
                    searchPlaceholder="Search attribute..."
                    emptyText="No attributes found."
                    widthClassName="w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="block text-sm font-medium text-foreground">Attribute Value</label>
                    <div className="group relative">
                      <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                        <Info className="w-3.5 h-3.5" />
                      </div>
                      <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                        Select the predefined value for this attribute (e.g., cm, kg, Red)
                      </div>
                    </div>
                  </div>
                  <Switcher
                    items={
                      attr.type
                        ? getAvailableUnits(attr.type).map((unit) => ({
                            value: unit.unit_name,
                            label: unit.unit_name,
                          }))
                        : []
                    }
                    value={attr.unit}
                    onChange={(value) => updateAttribute(index, attrIndex, 'unit', value)}
                    disabled={!attr.type}
                    placeholder="Select value"
                    searchPlaceholder="Search value..."
                    emptyText="No values found."
                    widthClassName="w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="block text-sm font-medium text-foreground">Value</label>
                    <div className="group relative">
                      <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                        <Info className="w-3.5 h-3.5" />
                      </div>
                      <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                        Text or number that goes with the attribute value (e.g., 5 cm, Red, Large)
                      </div>
                    </div>
                  </div>
                  <Input
                    placeholder="e.g., 5 or Red"
                    value={attr.value}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateAttribute(index, attrIndex, 'value', e.target.value)
                    }
                  />
                </div>
                <div className="flex justify-end">
                  {(variant.attributes || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAttribute(index, attrIndex)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="mb-4">
              <Button type="button" variant="outline" size="sm" onClick={() => addAttribute(index)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Attribute
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-sm font-medium text-foreground">
                    {currentCurrencyCode
                      ? `Unit Cost (${currentCurrencyCode})`
                      : 'Unit Cost'}
                  </label>
                  <div className="group relative">
                    <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                      How much it costs you to buy one unit of this variant
                    </div>
                  </div>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={
                    currentCurrencyCode
                      ? `Cost per unit in ${currentCurrencyCode}`
                      : 'Cost per unit'
                  }
                  value={variant.unit_cost}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateVariant(index, 'unit_cost', e.target.value)
                  }
                  required
                />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-sm font-medium text-foreground">
                    {currentCurrencyCode
                      ? `Selling Price (${currentCurrencyCode})`
                      : 'Selling Price'}
                  </label>
                  <div className="group relative">
                    <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                      Price you charge your customer for one unit of this variant
                    </div>
                  </div>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={
                    currentCurrencyCode
                      ? `Price per unit in ${currentCurrencyCode}`
                      : 'Price per unit'
                  }
                  value={variant.selling_price}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateVariant(index, 'selling_price', e.target.value)
                  }
                  required
                />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-sm font-medium text-foreground">Quantity in Stock</label>
                  <div className="group relative">
                    <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-background text-muted-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <div className="hidden md:block pointer-events-none absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-xs whitespace-normal z-50">
                      Current number of units available in inventory for this variant
                    </div>
                  </div>
                </div>
                <Input
                  type="number"
                  placeholder="Stock quantity"
                  value={variant.quantity_in_stock}
                  readOnly
                  className="bg-muted text-muted-foreground"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground">Product Images</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(Array.isArray(variant.images) ? variant.images : []).map((image, imgIndex) => (
                  <div key={imgIndex} className="relative">
                    <img
                      src={image}
                      alt={`Variant ${index + 1} image ${imgIndex + 1}`}
                      className="w-16 h-16 object-cover rounded border"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index, imgIndex)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {variant.images.length < 10 && (
                  <label className="w-16 h-16 border-2 border-dashed border-border rounded flex items-center justify-center cursor-pointer hover:border-border/80">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(index, e.target.files)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {editingProduct ? 'Update' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
