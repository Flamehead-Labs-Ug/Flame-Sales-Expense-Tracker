'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Trash2, Edit, Plus, Search, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogFooter } from '@/components/ui/dialog';
import { useFilter } from '@/lib/context/filter-context';
import { Switcher } from '@/components/ui/shadcn-io/navbar-12/Switcher';

interface InventoryVariantOption {
  id: number;
  product_id: number;
  product_name: string;
  label?: string;
  unit_cost?: number;
  selling_price?: number;
  quantity_in_stock: number;
  unit_of_measurement?: string;
  is_variant: boolean;
}

// Interfaces from expenses/page.tsx - consider moving to a shared types file
interface Expense {
  id: number;
  project_id?: number;
  cycle_id?: number;
  category_id?: number;
  vendor_id?: number;
  payment_method_id?: number;
  expense_name?: string;
  description: string;
  amount: number;
  product_id?: number | null;
  variant_id?: number | null;
  inventory_quantity?: number | null;
  inventory_unit_cost?: number | null;
  date_time_created: string;
  created_by: number;
  created_at: string;
}

interface Project {
  id: number;
  project_name: string;
  project_category_id?: number | null;
}

interface ExpenseCategory {
  id: number;
  category_name: string;
  project_category_id?: number | null;
}

interface Vendor {
  id: number;
  vendor_name: string;
}

interface PaymentMethod {
  id: number;
  payment_method: string;
}

interface ProjectCategory {
  id: number;
  category_name: string;
}

interface Cycle {
    id: number;
    cycle_name: string;
}

type ParsedExpenseItem = {
  expense_name: string
  description: string
  amount: string
  expense_date: string
  quantity?: number
}

type StructuredReceipt = {
  vendor: {
    name: string
    address?: string
    phone?: string
  }
  details: {
    receipt_number?: string
    date?: string
    time?: string
    terminal?: string
    app?: string
    reference?: string
    payment_method?: string
    raw_numbers: Record<string, string>
  }
  summary: {
    subtotal: number | null
    tax: number | null
    tip: number | null
    total_due: number | null
  }
  items: Array<{
    name: string
    amount: number
    quantity?: number
  }>
  text: {
    raw: string
    lines: string[]
  }
}

type ReceiptParseResult = {
  receipt_number: string
  receipt_date: string
  vendor_name: string
  vendor_address?: string
  vendor_phone?: string
  expenses: ParsedExpenseItem[]
  structured: StructuredReceipt
}

interface ExpenseFormProps {
    editingExpense: Expense | null;
    selectedProject?: string | null;
    selectedCycle?: string | null;
    projects: Project[];
    cycles: Cycle[];
    categories: ExpenseCategory[];
    vendors: Vendor[];
    paymentMethods: PaymentMethod[];
    projectCategories: ProjectCategory[];
    onSuccess: () => void;
    onCancel: () => void;
    // We need a way to update categories from the parent when a new one is created inline
    setCategories: (categories: ExpenseCategory[] | ((prev: ExpenseCategory[]) => ExpenseCategory[])) => void;
    setVendors: (vendors: Vendor[] | ((prev: Vendor[]) => Vendor[])) => void;
}

export function ExpenseForm({ 
    editingExpense, 
    selectedProject: initialSelectedProject, 
    selectedCycle: initialSelectedCycle, 
    projects, 
    cycles,
    categories,
    vendors,
    paymentMethods,
    projectCategories,
    onSuccess, 
    onCancel,
    setCategories,
    setVendors
}: ExpenseFormProps) {
    const [formData, setFormData] = useState({
        project_id: initialSelectedProject,
        category_id: '',
        vendor_id: '',
        payment_method_id: '',
        cycle_id: initialSelectedCycle,
        receipt_number: '',
        receipt_date: '',
        receipt_image: ''
    });

    const [expenseItems, setExpenseItems] = useState<ParsedExpenseItem[]>([{
        expense_name: '',
        description: '',
        amount: '',
        expense_date: ''
    }]);

    const [selectedProject, setSelectedProject] = useState(initialSelectedProject || '');
    const [selectedCycle, setSelectedCycle] = useState(initialSelectedCycle || '');
    const [selectedProjectCategoryId, setSelectedProjectCategoryId] = useState<string>('');

    const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    const INVENTORY_PURCHASE_CATEGORY_NAME = 'Product/Finished Goods';
    const COGS_CATEGORY_NAMES = [
      'Raw Materials',
      'Work In Progress',
      'Product/Finished Goods',
    ];
    const [inventoryProducts, setInventoryProducts] = useState<InventoryVariantOption[]>([]);
    const [inventorySelectedProductName, setInventorySelectedProductName] = useState('');
    const [inventoryAvailableVariants, setInventoryAvailableVariants] = useState<InventoryVariantOption[]>([]);
    const [inventoryVariantId, setInventoryVariantId] = useState('');
    const [inventoryQuantity, setInventoryQuantity] = useState('');
    const [inventoryUnitCost, setInventoryUnitCost] = useState('');

    const addExpenseItem = () => {
        setExpenseItems([...expenseItems, { expense_name: '', description: '', amount: '', expense_date: '' }]);
    };

    const removeExpenseItem = (index: number) => {
        if (expenseItems.length > 1) {
            setExpenseItems(expenseItems.filter((_, i) => i !== index));
        }
    };

    const updateExpenseItem = (index: number, field: keyof ParsedExpenseItem, value: string) => {
        const newItems = [...expenseItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setExpenseItems(newItems);
    };

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrText, setOcrText] = useState('');
    const [ocrStructured, setOcrStructured] = useState<StructuredReceipt | null>(null);
    const [ocrImageDataUrl, setOcrImageDataUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { currentCurrencyCode } = useFilter();

    const selectedCategory = formData.category_id
      ? categories.find((c) => c.id === parseInt(formData.category_id, 10))
      : undefined;
    const isCogsCategory = !!selectedCategory?.category_name && COGS_CATEGORY_NAMES.includes(selectedCategory.category_name);
    const isInventoryPurchase = selectedCategory?.category_name === INVENTORY_PURCHASE_CATEGORY_NAME;

    useEffect(() => {
      const loadProducts = async () => {
        try {
          const response = await fetch('/api/v1/products');
          const data = await response.json();
          if (data.status === 'success') {
            const rawProducts = data.products || [];
            const flattened: InventoryVariantOption[] = [];

            for (const p of rawProducts) {
              const variants = Array.isArray(p.variants) ? p.variants : [];

              if (variants.length > 0) {
                flattened.push({
                  id: 0,
                  product_id: p.id,
                  product_name: p.product_name,
                  label: 'No Variant',
                  unit_cost: p.unit_cost ?? undefined,
                  selling_price: p.selling_price ?? undefined,
                  quantity_in_stock: p.quantity_in_stock ?? 0,
                  unit_of_measurement: p.unit_of_measurement || undefined,
                  is_variant: false,
                });
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
                    is_variant: true,
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
                  is_variant: false,
                });
              }
            }

            setInventoryProducts(flattened);
          }
        } catch {
          // Silent: inventory purchase UI is optional
        }
      };

      if (isCogsCategory && inventoryProducts.length === 0) {
        void loadProducts();
      }
    }, [isCogsCategory, inventoryProducts.length]);

    useEffect(() => {
      if (!isCogsCategory) {
        setInventorySelectedProductName('');
        setInventoryAvailableVariants([]);
        setInventoryVariantId('');
        setInventoryQuantity('');
        setInventoryUnitCost('');
        return;
      }

      // COGS is product-linked; keep exactly one item
      if (expenseItems.length !== 1) {
        setExpenseItems([{ expense_name: '', description: '', amount: '', expense_date: '' }]);
      }
    }, [isCogsCategory]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files ? e.target.files[0] : null;
        setSelectedFile(file);
        if (!file) {
            setOcrImageDataUrl(null);
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                setOcrImageDataUrl(reader.result);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleOCR = async () => {
        if (!selectedFile) return;

        setOcrLoading(true);
        try {
            const { createWorker } = await import('tesseract.js');
            const worker = await createWorker('eng');
            const { data: { text } } = await worker.recognize(selectedFile);
            await worker.terminate();
            
            setOcrText(text);
            
            const { receipt_number, vendor_name, receipt_date, expenses, structured } = parseExpenseText(text);

            const updatedFields: Partial<typeof formData> = {}
            if (receipt_number) {
                updatedFields.receipt_number = receipt_number
            }
            if (receipt_date) {
                updatedFields.receipt_date = receipt_date
            }

            if (Object.keys(updatedFields).length > 0) {
                setFormData(prev => ({ ...prev, ...updatedFields }))
            }

            if (vendor_name) {
                const existingVendor = vendors.find(v => v.vendor_name.toLowerCase() === vendor_name.toLowerCase());
                if (existingVendor) {
                    setFormData(prev => ({ ...prev, vendor_id: existingVendor.id.toString() }));
                } else {
                    // Auto-create vendor if it doesn't exist
                    const response = await fetch('/api/v1/vendors', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ vendor_name }),
                    });
                    const data = await response.json();
                    if (data.status === 'success' && data.vendor) {
                        const newVendor = data.vendor;
                        // Update parent vendors so the new vendor appears in the dropdown
                        setVendors((prev) => [...prev, newVendor]);
                        setFormData(prev => ({ ...prev, vendor_id: newVendor.id.toString() }));
                        toast.success(`New vendor created: ${vendor_name}`);
                    }
                }
            }

            if (structured.details.payment_method && paymentMethods.length > 0) {
                const normalizeCompact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
                const normalizedTarget = normalizeCompact(structured.details.payment_method)
                let matchedMethod = paymentMethods.find((method) => {
                    const normalizedMethod = normalizeCompact(method.payment_method)
                    return normalizedMethod === normalizedTarget || normalizedMethod.includes(normalizedTarget) || normalizedTarget.includes(normalizedMethod)
                })

                if (matchedMethod) {
                    setFormData((prev) => ({ ...prev, payment_method_id: matchedMethod.id.toString() }))
                }
            }

            setOcrStructured(structured)

            if (expenses.length > 0) {
                const normalizedExpenses = expenses.map((item) => ({
                    ...item,
                    expense_date: item.expense_date || receipt_date || '',
                }))
                setExpenseItems(normalizedExpenses);
                toast.success(`Receipt processed! Found ${normalizedExpenses.length} expense items.`);
            } else {
                if (receipt_date) {
                    setExpenseItems((current) =>
                        current.map((item) => ({
                            ...item,
                            expense_date: item.expense_date || receipt_date,
                        })),
                    )
                }
                toast.success('Receipt data extracted successfully!');
            }
        } catch (error) {
            toast.error('Failed to process receipt image');
        } finally {
            setOcrLoading(false);
        }
    };

    const parseExpenseText = (text: string): ReceiptParseResult => {
        const expenses: ParsedExpenseItem[] = []
        const lines = text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
    
        const structured: StructuredReceipt = {
          vendor: {
            name: '',
          },
          details: {
            receipt_number: undefined,
            date: undefined,
            time: undefined,
            terminal: undefined,
            app: undefined,
            reference: undefined,
            payment_method: undefined,
            raw_numbers: {},
          },
          summary: {
            subtotal: null,
            tax: null,
            tip: null,
            total_due: null,
          },
          items: [],
          text: {
            raw: text,
            lines,
          },
        }
    
        const quantityRegex = /^(\d+(?:\.\d+)?)\s+(.*)$/
    
        const monthMap: Record<string, number> = {
          jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
        }
    
        const normalizeYear = (value: string) => {
          let year = parseInt(value, 10)
          if (Number.isNaN(year)) return null
          if (value.length === 2) {
            year += year >= 70 ? 1900 : 2000
          }
          return year
        }
    
        const buildIsoDate = (year: number | null, month: number | null, day: number | null) => {
          if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          return !Number.isNaN(new Date(iso).getTime()) ? iso : null
        }
    
        const parseDateCandidate = (candidate: string) => {
          const stripped = candidate.replace(/(\d{1,2})(st|nd|rd|th)/gi, '$1').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim()
          let match = stripped.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)
          if (match) return buildIsoDate(normalizeYear(match[1]), parseInt(match[2], 10), parseInt(match[3], 10))
          match = stripped.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
          if (match) {
            const year = normalizeYear(match[3])
            const first = parseInt(match[1], 10), second = parseInt(match[2], 10)
            if (!year) return null
            const mmdd = buildIsoDate(year, first, second)
            const ddmm = buildIsoDate(year, second, first)
            if (first > 12) return ddmm
            if (second > 12) return mmdd
            return ddmm ?? mmdd
          }
          match = stripped.match(/([a-zA-Z]{3,9})\s+(\d{1,2})\s+(\d{2,4})/)
          if (match) return buildIsoDate(normalizeYear(match[3]), monthMap[match[1].toLowerCase()], parseInt(match[2], 10))
          match = stripped.match(/(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{2,4})/)
          if (match) return buildIsoDate(normalizeYear(match[3]), monthMap[match[2].toLowerCase()], parseInt(match[1], 10))
          return null
        }
    
        const normalizeAmount = (raw: string) => {
          const cleaned = raw.replace(/[^0-9.,]/g, '')
          if (!cleaned) return null
          if (cleaned.includes('.') && cleaned.includes(',')) return parseFloat(cleaned.replace(/,/g, '')) || null
          if (cleaned.includes(',')) {
            const parts = cleaned.split(',')
            if (parts[parts.length - 1]?.length === 2) return parseFloat(cleaned.replace(/\./g, '').replace(/,/g, '.')) || null
            return parseFloat(cleaned.replace(/,/g, '')) || null
          }
          const value = parseFloat(cleaned)
          return Number.isNaN(value) ? null : value
        }

        const looksLikePriceToken = (raw: string, fullLine: string) => {
          const cleaned = raw.replace(/[^0-9.,]/g, '')
          if (!cleaned) return false
          const hasDecimalCents = /[.,]\d{2}$/.test(cleaned)
          const hasCurrencyMarker = /(?:[$£€₹]|KES|USD|EUR|GBP|UGX|TZS|ZAR|NGN)/i.test(fullLine)
          return hasDecimalCents || hasCurrencyMarker
        }
    
        const extractLineItem = (line: string): { label: string; amount: number; raw: string; quantity?: number } | null => {
          const trimmed = line.trim()
          if (!trimmed) return null
          const trailingRegex = /^(.+?)\s+(?:[$£€₹]|[A-Z]{2,3})?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)$/i
          let match = trimmed.match(trailingRegex)
          if (match) {
            const rawAmountText = match[2]
            if (!looksLikePriceToken(rawAmountText, trimmed)) return null
            const amount = normalizeAmount(rawAmountText)
            if (amount !== null) {
              let label = match[1].replace(/[-:]+$/, '').trim()
              let quantity: number | undefined
              const quantityMatch = label.match(quantityRegex)
              if (quantityMatch) {
                quantity = parseFloat(quantityMatch[1])
                label = quantityMatch[2].trim()
              }
              return { label, amount, raw: rawAmountText, quantity }
            }
          }
          const tokens = trimmed.split(/\s+/)
          const lastToken = tokens[tokens.length - 1]
          if (!looksLikePriceToken(lastToken, trimmed)) return null
          const amount = normalizeAmount(lastToken)
          if (amount !== null) {
            const label = trimmed.slice(0, trimmed.lastIndexOf(lastToken)).replace(/[-:]+$/, '').trim()
            if (label) {
              let cleanLabel = label, quantity: number | undefined
              const quantityMatch = cleanLabel.match(quantityRegex)
              if (quantityMatch) {
                quantity = parseFloat(quantityMatch[1])
                cleanLabel = quantityMatch[2].trim()
              }
              return { label: cleanLabel, amount, raw: lastToken, quantity }
            }
          }
          return null
        }
    
        const findAmountInLine = (line: string) => {
          const matches = line.match(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|-?\d+(?:[.,]\d{2})/g)
          if (!matches) return null
          return normalizeAmount(matches[matches.length - 1])
        }
    
        structured.vendor.name = lines[0]?.trim() ?? ''
    
        let receipt_date = ''
        for (const line of lines) {
          if (receipt_date) break
          const candidate = parseDateCandidate(line)
          if (candidate) receipt_date = candidate
        }
        structured.details.date = receipt_date || undefined

        // Try to infer payment method from the text so OCR can auto-select it
        const paymentKeywords: { key: string; value: string }[] = [
          { key: 'mpesa', value: 'Mobile Money' },
          { key: 'm-pesa', value: 'Mobile Money' },
          { key: 'm pesa', value: 'Mobile Money' },
          { key: 'mobile money', value: 'Mobile Money' },
          { key: 'cash', value: 'Cash' },
          { key: 'paid cash', value: 'Cash' },
          { key: 'cash payment', value: 'Cash' },
          { key: 'credit card', value: 'Credit Card' },
          { key: 'debit card', value: 'Debit Card' },
          { key: 'visa', value: 'Credit Card' },
          { key: 'mastercard', value: 'Credit Card' },
          { key: 'paypal', value: 'Digital Wallet' },
          { key: 'apple pay', value: 'Digital Wallet' },
          { key: 'google pay', value: 'Digital Wallet' },
        ]

        if (!structured.details.payment_method) {
          for (const line of lines) {
            const lowerLine = line.toLowerCase()
            for (const { key, value } of paymentKeywords) {
              if (lowerLine.includes(key)) {
                structured.details.payment_method = value
                break
              }
            }
            if (structured.details.payment_method) break
          }
        }

        let fallbackAmount: number | null = null
        const parsedItems: { label: string; amount: number; raw: string; quantity?: number }[] = []
    
        lines.forEach(line => {
          const lower = line.toLowerCase()

          if (!structured.details.receipt_number) {
            const recMatch = line.match(/(?:\brec(?:eipt)?\s*(?:no|number|#)?\s*[:\-]?\s*)([0-9]{3,})/i)
            if (recMatch) {
              structured.details.receipt_number = recMatch[1]
            }
          }

          const item = extractLineItem(line)
          const amountInLine = findAmountInLine(line)
    
          if (amountInLine !== null) {
            if (lower.includes('sub-total') || lower.includes('subtotal')) structured.summary.subtotal = amountInLine
            else if (lower.includes('tax') && !lower.includes('after tax')) structured.summary.tax = amountInLine
            else if (lower.includes('tip')) structured.summary.tip = amountInLine
            else if (lower.includes('total') || lower.includes('amount due')) structured.summary.total_due = amountInLine
          }
    
          if (!item) return
          if (['subtotal', 'tax', 'balance', 'total', 'amount due'].some(keyword => lower.includes(keyword))) {
            if (lower.includes('total') || lower.includes('amount due')) fallbackAmount = item.amount
            return
          }
          if (item.label.length < 2) return
          parsedItems.push(item)
        })
    
        structured.items = parsedItems.map(({ label, amount, quantity }) => ({ name: label, amount, quantity }))
    
        parsedItems.forEach(item => {
          expenses.push({
            expense_name: item.label,
            description: `${item.quantity ? `${item.quantity} × ` : ''}${item.label} from ${structured.vendor.name}`,
            amount: item.amount.toFixed(2),
            expense_date: structured.details.date || '',
            quantity: item.quantity,
          })
        })
    
        if (expenses.length === 0 && fallbackAmount !== null) {
          const fallbackLabel = structured.vendor.name || 'Receipt Total'
          expenses.push({
            expense_name: fallbackLabel,
            description: `Total from ${structured.vendor.name}`,
            amount: Number(fallbackAmount).toFixed(2),
            expense_date: structured.details.date || '',
          })
        }

        const receipt_number = structured.details.receipt_number || ''
        return { receipt_number, vendor_name: structured.vendor.name, receipt_date, expenses, structured }
    };

    useEffect(() => {
        if (editingExpense) {
            setFormData({
                project_id: editingExpense.project_id?.toString() || '',
                category_id: editingExpense.category_id?.toString() || '',
                vendor_id: editingExpense.vendor_id?.toString() || '',
                payment_method_id: editingExpense.payment_method_id?.toString() || '',
                cycle_id: editingExpense.cycle_id?.toString() || '',
                receipt_number: '', // Receipt data is not edited
                receipt_date: '',
                receipt_image: ''
            });
            setExpenseItems([{
                expense_name: editingExpense.expense_name || '',
                description: editingExpense.description,
                amount: editingExpense.amount.toString(),
                expense_date: editingExpense.date_time_created ? editingExpense.date_time_created.split('T')[0] : ''
            }]);

            if (editingExpense.product_id) {
                const matching = inventoryProducts.find((p) => p.product_id === editingExpense.product_id);
                if (matching?.product_name) {
                    setInventorySelectedProductName(matching.product_name);
                    const variants = inventoryProducts.filter((p) => p.product_name === matching.product_name);
                    setInventoryAvailableVariants(variants);

                    if (editingExpense.variant_id) {
                        setInventoryVariantId(editingExpense.variant_id.toString());
                    } else {
                        const noVar = variants.find((v) => v.id === 0);
                        setInventoryVariantId(noVar ? '0' : '');
                    }

                    if (editingExpense.inventory_quantity !== undefined && editingExpense.inventory_quantity !== null) {
                        setInventoryQuantity(editingExpense.inventory_quantity.toString());
                    }
                    if (editingExpense.inventory_unit_cost !== undefined && editingExpense.inventory_unit_cost !== null) {
                        setInventoryUnitCost(editingExpense.inventory_unit_cost.toString());
                    }
                }
            }

            const cat = categories.find(c => c.id === editingExpense.category_id);
            if (cat?.project_category_id) {
                setSelectedProjectCategoryId(cat.project_category_id.toString());
            } else if (editingExpense.project_id) {
                const project = projects.find(p => p.id === editingExpense.project_id);
                setSelectedProjectCategoryId(project?.project_category_id?.toString() || '');
            }
        } else {
            // New expense logic
            if (initialSelectedProject) {
                const project = projects.find((p) => p.id === parseInt(initialSelectedProject));
                setSelectedProjectCategoryId(project?.project_category_id?.toString() || '');
            }
        }
    }, [editingExpense, projects, categories, initialSelectedProject, inventoryProducts]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (isSubmitting) {
            return;
        }

        if (!formData.category_id) {
            toast.error('Please select an expense category.');
            return;
        }

        try {
            setIsSubmitting(true);

            const selectedInventoryOption = inventoryVariantId
              ? inventoryProducts.find((p) => p.id === parseInt(inventoryVariantId, 10))
              : undefined;

            const inventoryPayload = isCogsCategory
              ? {
                  product_id: selectedInventoryOption?.product_id ?? null,
                  variant_id: selectedInventoryOption?.is_variant ? (selectedInventoryOption?.id ?? null) : null,
                  inventory_quantity: inventoryQuantity ? parseInt(inventoryQuantity, 10) : null,
                  inventory_unit_cost: inventoryUnitCost ? parseFloat(inventoryUnitCost) : null,
                }
              : {};

            if (isCogsCategory) {
              if (!inventoryVariantId) {
                toast.error('Please select a product.');
                return;
              }
              if (!selectedInventoryOption?.product_id) {
                toast.error('Please select a product.');
                return;
              }
            }

            if (isInventoryPurchase) {
              const qty = parseInt(inventoryQuantity || '0', 10) || 0;
              const unitCost = parseFloat(inventoryUnitCost || '0') || 0;
              if (qty <= 0) {
                toast.error('Please enter a quantity greater than 0.');
                return;
              }
              if (unitCost <= 0) {
                toast.error('Please enter a unit cost greater than 0.');
                return;
              }
            }

            if (editingExpense) {
                const item = expenseItems[0];
                const description = item.description || item.expense_name;

                if (isInventoryPurchase) {
                    const oldQty = editingExpense.inventory_quantity ?? 0;
                    const newQty = parseInt(inventoryQuantity || '0', 10) || 0;
                    const newUnitCost = parseFloat(inventoryUnitCost || '0') || 0;
                    const oldOptionProductId = editingExpense.product_id ?? null;
                    const oldOptionVariantId = editingExpense.variant_id ?? null;

                    if (!oldOptionProductId || oldQty <= 0) {
                        throw new Error('This stock purchase is missing inventory linkage.');
                    }

                    // 1) Reverse old stock movement (linked to same expense)
                    await fetch('/api/v1/inventory-transactions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'REVERSAL',
                            project_id: formData.project_id ? parseInt(formData.project_id, 10) : null,
                            cycle_id: formData.cycle_id ? parseInt(formData.cycle_id, 10) : null,
                            product_id: oldOptionProductId,
                            variant_id: oldOptionVariantId,
                            quantity: oldQty,
                            unit_cost: editingExpense.inventory_unit_cost ?? null,
                            notes: `Reversal for expense #${editingExpense.id}`,
                            create_expense: false,
                            expense_id: editingExpense.id,
                            apply_stock: true,
                        }),
                    }).then(async (res) => {
                        const data = await res.json();
                        if (data.status !== 'success') throw new Error(data.message || 'Failed to reverse stock');
                    });

                    // 2) Update the expense row (same id)
                    const updatedAmount = newQty * newUnitCost;
                    const updateResponse = await fetch('/api/v1/expenses', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: editingExpense.id,
                            expense_name: item.expense_name,
                            description,
                            amount: updatedAmount,
                            expense_date: item.expense_date,
                            project_id: formData.project_id ? parseInt(formData.project_id) : null,
                            category_id: formData.category_id ? parseInt(formData.category_id) : null,
                            vendor_id: formData.vendor_id ? parseInt(formData.vendor_id) : null,
                            payment_method_id: formData.payment_method_id ? parseInt(formData.payment_method_id) : null,
                            cycle_id: formData.cycle_id ? parseInt(formData.cycle_id) : null,
                            ...inventoryPayload,
                        }),
                    });
                    const updateData = await updateResponse.json();
                    if (updateData.status !== 'success') throw new Error(updateData.message || 'Failed to update expense');

                    // 3) Apply new purchase stock movement (linked to same expense)
                    await fetch('/api/v1/inventory-transactions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'PURCHASE',
                            project_id: formData.project_id ? parseInt(formData.project_id, 10) : null,
                            cycle_id: formData.cycle_id ? parseInt(formData.cycle_id, 10) : null,
                            product_id: selectedInventoryOption?.product_id,
                            variant_id: selectedInventoryOption?.is_variant ? selectedInventoryOption?.id : null,
                            quantity: newQty,
                            unit_cost: newUnitCost,
                            notes: description || item.expense_name || null,
                            create_expense: false,
                            expense_id: editingExpense.id,
                            apply_stock: true,
                        }),
                    }).then(async (res) => {
                        const data = await res.json();
                        if (data.status !== 'success') throw new Error(data.message || 'Failed to apply new stock purchase');
                    });

                    toast.success('Inventory purchase updated successfully');
                } else {
                    const computedAmount = parseFloat(item.amount);
                    const response = await fetch('/api/v1/expenses', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: editingExpense.id,
                            expense_name: item.expense_name,
                            description,
                            amount: computedAmount,
                            expense_date: item.expense_date,
                            project_id: formData.project_id ? parseInt(formData.project_id) : null,
                            category_id: formData.category_id ? parseInt(formData.category_id) : null,
                            vendor_id: formData.vendor_id ? parseInt(formData.vendor_id) : null,
                            payment_method_id: formData.payment_method_id ? parseInt(formData.payment_method_id) : null,
                            cycle_id: formData.cycle_id ? parseInt(formData.cycle_id) : null,
                            ...inventoryPayload,
                        }),
                    });
                    const data = await response.json();
                    if (data.status !== 'success') throw new Error(data.message || 'Failed to update expense');

                    if (isCogsCategory) {
                        // Log-only inventory transaction linked to this expense
                        await fetch('/api/v1/inventory-transactions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                type: 'COGS',
                                project_id: formData.project_id ? parseInt(formData.project_id, 10) : null,
                                cycle_id: formData.cycle_id ? parseInt(formData.cycle_id, 10) : null,
                                product_id: selectedInventoryOption?.product_id,
                                variant_id: selectedInventoryOption?.is_variant ? selectedInventoryOption?.id : null,
                                quantity: 0,
                                unit_cost: null,
                                notes: `COGS allocation: ${selectedCategory?.category_name || ''}`,
                                create_expense: false,
                                expense_id: editingExpense.id,
                                apply_stock: false,
                            }),
                        });
                    }

                    toast.success('Expense updated successfully');
                }
            } else {
                // Handle creating multiple new expenses
                if ((isInventoryPurchase || isCogsCategory) && expenseItems.length !== 1) {
                  toast.error('COGS entries must be recorded as a single expense line.');
                  return;
                }

                if (isInventoryPurchase) {
                    const item = expenseItems[0];
                    const qty = parseInt(inventoryQuantity || '0', 10) || 0;
                    const unitCost = parseFloat(inventoryUnitCost || '0') || 0;

                    const response = await fetch('/api/v1/inventory-transactions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'PURCHASE',
                            project_id: formData.project_id ? parseInt(formData.project_id, 10) : null,
                            cycle_id: formData.cycle_id ? parseInt(formData.cycle_id, 10) : null,
                            product_id: selectedInventoryOption?.product_id,
                            variant_id: selectedInventoryOption?.is_variant ? selectedInventoryOption?.id : null,
                            quantity: qty,
                            unit_cost: unitCost,
                            notes: item.description || item.expense_name || null,
                            create_expense: true,
                            expense_category_id: formData.category_id ? parseInt(formData.category_id, 10) : null,
                            expense_name: item.expense_name || 'Stock Purchase',
                            expense_date: item.expense_date || null,
                            vendor_id: formData.vendor_id ? parseInt(formData.vendor_id, 10) : null,
                            payment_method_id: formData.payment_method_id ? parseInt(formData.payment_method_id, 10) : null,
                        }),
                    });

                    const data = await response.json();
                    if (data.status !== 'success') throw new Error(data.message || 'Failed to create inventory purchase');
                    toast.success('Inventory purchase recorded successfully');
                    onSuccess();
                    return;
                }

                if (isCogsCategory) {
                    const item = expenseItems[0];
                    const description = item.description || item.expense_name;
                    const computedAmount = parseFloat(item.amount);

                    const createExpenseRes = await fetch('/api/v1/expenses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            expense_name: item.expense_name,
                            description,
                            amount: computedAmount,
                            expense_date: item.expense_date,
                            project_id: formData.project_id ? parseInt(formData.project_id) : null,
                            category_id: formData.category_id ? parseInt(formData.category_id) : null,
                            vendor_id: formData.vendor_id ? parseInt(formData.vendor_id) : null,
                            payment_method_id: formData.payment_method_id ? parseInt(formData.payment_method_id) : null,
                            cycle_id: formData.cycle_id ? parseInt(formData.cycle_id) : null,
                            ...inventoryPayload,
                        }),
                    });
                    const createExpenseData = await createExpenseRes.json();
                    if (createExpenseData.status !== 'success') throw new Error(createExpenseData.message || 'Failed to create expense');

                    const createdExpense = createExpenseData.expense as Expense;

                    await fetch('/api/v1/inventory-transactions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'COGS',
                            project_id: formData.project_id ? parseInt(formData.project_id, 10) : null,
                            cycle_id: formData.cycle_id ? parseInt(formData.cycle_id, 10) : null,
                            product_id: selectedInventoryOption?.product_id,
                            variant_id: selectedInventoryOption?.is_variant ? selectedInventoryOption?.id : null,
                            quantity: 0,
                            unit_cost: null,
                            notes: `COGS allocation: ${selectedCategory?.category_name || ''}`,
                            create_expense: false,
                            expense_id: createdExpense.id,
                            apply_stock: false,
                        }),
                    });

                    toast.success('COGS expense recorded successfully');
                    onSuccess();
                    return;
                }

                const creationPromises = expenseItems.map(item => {
                    const description = item.description || item.expense_name;
                    const computedAmount = isInventoryPurchase
                      ? ((parseInt(inventoryQuantity || '0', 10) || 0) * (parseFloat(inventoryUnitCost || '0') || 0))
                      : parseFloat(item.amount);
                    const body = {
                        expense_name: item.expense_name,
                        description,
                        amount: computedAmount,
                        expense_date: item.expense_date,
                        project_id: formData.project_id ? parseInt(formData.project_id) : null,
                        category_id: formData.category_id ? parseInt(formData.category_id) : null,
                        vendor_id: formData.vendor_id ? parseInt(formData.vendor_id) : null,
                        payment_method_id: formData.payment_method_id ? parseInt(formData.payment_method_id) : null,
                        cycle_id: formData.cycle_id ? parseInt(formData.cycle_id) : null,
                        ...inventoryPayload,
                    };
                    return fetch('/api/v1/expenses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    }).then(res => res.json().then(data => {
                        if (data.status !== 'success') throw new Error(data.message || `Failed to create expense: ${item.expense_name}`);
                        return data.expense as Expense;
                    }));
                });

                const createdExpenses = await Promise.all(creationPromises);
                toast.success(`${createdExpenses.length} expense(s) created successfully`);

                if (ocrImageDataUrl && (ocrText || ocrStructured) && createdExpenses.length > 0) {
                    try {
                        await fetch('/api/v1/receipts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                expense_id: createdExpenses[0].id,
                                file_path: ocrImageDataUrl,
                                raw_text: ocrText || null,
                                structured_data: ocrStructured,
                            }),
                        });
                    } catch (err) {
                        console.error('Failed to create receipt record', err);
                    }
                }
            }
            onSuccess();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateInlineExpenseCategory = async () => {
        if (!newCategoryName.trim()) {
            toast.error('Expense category name is required');
            return;
        }
        let projectCategoryId: number | null = null;
        if (selectedProjectCategoryId) {
            projectCategoryId = parseInt(selectedProjectCategoryId, 10);
        } else if (selectedProject) {
            const project = projects.find((p) => p.id === parseInt(selectedProject));
            if (project?.project_category_id) {
                projectCategoryId = project.project_category_id;
            }
        }

        try {
            const response = await fetch('/api/v1/expense-categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category_name: newCategoryName.trim(),
                    description: `Custom expense category: ${newCategoryName.trim()}`,
                    project_category_id: projectCategoryId,
                    project_id: selectedProject ? parseInt(selectedProject, 10) : null,
                }),
            });
            const data = await response.json();
            if (data.status === 'success' && data.category) {
                const created = data.category;
                setCategories((prev) => [...prev, created]);
                setFormData((prev) => ({ ...prev, category_id: created.id.toString() }));
                setNewCategoryName('');
                setShowNewCategoryForm(false);
                toast.success('Expense category created');
            } else {
                toast.error(data.message || 'Failed to create expense category');
            }
        } catch (error) {
            toast.error('Failed to create expense category');
        }
    };

    const filteredExpenseCategories = selectedProjectCategoryId
        ? categories.filter((category) => category.project_category_id === parseInt(selectedProjectCategoryId, 10))
        : categories;

    const showFullForm = formData.project_id && selectedProjectCategoryId && formData.category_id && selectedCycle;

    return (
        <form onSubmit={handleSubmit}>
            {/* Step 1: Initial Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-8">
                {/* Column 1 */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground">1. Select Project<span className="text-red-500"> *</span></label>
                        <Switcher
                            items={projects.map((project) => ({
                                value: project.id.toString(),
                                label: project.project_name,
                            }))}
                            value={selectedProject || ''}
                            onChange={(newProjectId) => {
                                setSelectedProject(newProjectId);
                                setSelectedCycle('');
                                if (newProjectId) {
                                    const project = projects.find((p) => p.id === parseInt(newProjectId));
                                    setSelectedProjectCategoryId(project?.project_category_id?.toString() || '');
                                } else {
                                    setSelectedProjectCategoryId('');
                                }
                                setFormData((prev) => ({ ...prev, project_id: newProjectId, category_id: '', vendor_id: '', payment_method_id: '', cycle_id: '' }));
                            }}
                            placeholder="Select project"
                            searchPlaceholder="Search project..."
                            emptyText="No projects found."
                            widthClassName="w-full"
                            allowClear={false}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground">2. Select Cycle<span className="text-red-500"> *</span></label>
                        <Switcher
                            items={cycles.map((cycle) => ({
                                value: cycle.id.toString(),
                                label: cycle.cycle_name,
                            }))}
                            value={selectedCycle || ''}
                            onChange={(newCycleId) => {
                                setSelectedCycle(newCycleId);
                                setFormData((prev) => ({ ...prev, cycle_id: newCycleId }));
                            }}
                            disabled={!selectedProject}
                            placeholder="Select cycle"
                            searchPlaceholder="Search cycle..."
                            emptyText="No cycles found."
                            widthClassName="w-full"
                            allowClear={false}
                        />
                    </div>
                </div>
                {/* Column 2 */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground">3. Select Project Category<span className="text-red-500"> *</span></label>
                        <Switcher
                            items={projectCategories.map((category) => ({
                                value: category.id.toString(),
                                label: category.category_name,
                            }))}
                            value={selectedProjectCategoryId}
                            onChange={(value) => {
                                setSelectedProjectCategoryId(value);
                                setFormData((prev) => ({ ...prev, category_id: '' }));
                            }}
                            disabled={!selectedProject}
                            placeholder="Select project category"
                            searchPlaceholder="Search project category..."
                            emptyText="No project categories found."
                            widthClassName="w-full"
                            allowClear={false}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2 text-foreground">4. Select Expense Category<span className="text-red-500"> *</span></label>
                        <Switcher
                            items={filteredExpenseCategories.map((category) => ({
                                value: category.id.toString(),
                                label: category.category_name,
                            }))}
                            value={formData.category_id}
                            onChange={(value) => setFormData({ ...formData, category_id: value })}
                            disabled={!selectedProjectCategoryId}
                            placeholder="Select category"
                            searchPlaceholder="Search category..."
                            emptyText="No categories found."
                            widthClassName="w-full"
                            allowClear={false}
                        />
                        <div className="mt-2 space-y-2">
                            {!showNewCategoryForm && (
                                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowNewCategoryForm(true)}>
                                    + Add new expense category
                                </button>
                            )}
                            {showNewCategoryForm && (
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="text"
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        placeholder="New category name"
                                        className="h-8"
                                    />
                                    <Button type="button" size="sm" onClick={handleCreateInlineExpenseCategory}>Save</Button>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewCategoryForm(false)}>Cancel</Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Step 2: Full Form Content */}
            {showFullForm && (
                <>
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Left Column */}
                        <div className="w-full lg:w-[45%] space-y-6">
                            {/* OCR Section */}
                            <div>
                                <label className="block text-sm font-medium text-foreground">Scan Receipt (Optional)</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="flex-grow"
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleOCR}
                                        disabled={!selectedFile || ocrLoading}
                                    >
                                        {ocrLoading ? 'Scanning...' : <Scan className="w-4 h-4" />}
                                    </Button>
                                </div>
                                {ocrText && (
                                    <div className="mt-3 p-3 bg-muted rounded border border-border space-y-3 max-h-64 overflow-y-auto">
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1">Extracted Text:</label>
                                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ocrText}</p>
                                        </div>
                                        {ocrStructured && (
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-1">Structured JSON:</label>
                                                <textarea
                                                    value={JSON.stringify(ocrStructured, null, 2)}
                                                    readOnly
                                                    rows={10}
                                                    className="w-full font-mono text-xs px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Other Details */}
                            <div className="space-y-4">
                                {ocrText && (
                                    <div>
                                        <label className="block text-sm font-medium text-foreground">Receipt Number</label>
                                        <Input
                                            type="text"
                                            value={formData.receipt_number}
                                            onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                                            placeholder="Auto-detected from receipt"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-foreground">Vendor</label>
                                    <Switcher
                                        items={vendors.map((vendor) => ({
                                            value: vendor.id.toString(),
                                            label: vendor.vendor_name,
                                        }))}
                                        value={formData.vendor_id}
                                        onChange={(value) => setFormData({ ...formData, vendor_id: value })}
                                        placeholder="Select vendor"
                                        searchPlaceholder="Search vendor..."
                                        emptyText="No vendors found."
                                        widthClassName="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground">Payment Method</label>
                                    <Switcher
                                        items={paymentMethods.map((method) => ({
                                            value: method.id.toString(),
                                            label: method.payment_method,
                                        }))}
                                        value={formData.payment_method_id}
                                        onChange={(value) => setFormData({ ...formData, payment_method_id: value })}
                                        placeholder="Select payment method"
                                        searchPlaceholder="Search payment method..."
                                        emptyText="No payment methods found."
                                        widthClassName="w-full"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="w-full lg:w-[55%] space-y-4">
                            <h3 className="text-lg font-medium text-foreground">Expense Items</h3>

                            {isCogsCategory && (
                              <div className="space-y-4 rounded-md border border-border p-4 bg-card">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-foreground">Product</label>
                                    <Switcher
                                      items={inventoryProducts
                                        .filter((p, index, self) => self.findIndex(sp => sp.product_name === p.product_name) === index)
                                        .map((p) => ({ value: p.product_name, label: p.product_name }))}
                                      value={inventorySelectedProductName}
                                      onChange={(value) => {
                                        setInventorySelectedProductName(value);
                                        const variants = inventoryProducts.filter((p) => p.product_name === value);
                                        setInventoryAvailableVariants(variants);
                                        const noVar = variants.find((v) => v.id === 0);
                                        const nextVariantId = !isInventoryPurchase && noVar ? '0' : '';
                                        setInventoryVariantId(nextVariantId);
                                        setInventoryQuantity('');
                                        setInventoryUnitCost(!isInventoryPurchase && noVar ? ((noVar.unit_cost ?? 0).toString()) : '');
                                      }}
                                      placeholder="Select product"
                                      searchPlaceholder="Search product..."
                                      emptyText="No products found."
                                      widthClassName="w-full"
                                      allowClear={false}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-foreground">Variant</label>
                                    <Switcher
                                      items={inventoryAvailableVariants.map((v) => ({
                                        value: v.id.toString(),
                                        label: v.label
                                          ? `${v.label}${v.unit_of_measurement ? ` (${v.unit_of_measurement})` : ''}`
                                          : 'Default variant',
                                      }))}
                                      value={inventoryVariantId}
                                      onChange={(value) => {
                                        setInventoryVariantId(value);
                                        const variant = inventoryProducts.find((p) => p.id === parseInt(value, 10));
                                        if (isInventoryPurchase) {
                                          setInventoryUnitCost((variant?.unit_cost ?? 0).toString());
                                        }
                                      }}
                                      disabled={inventoryAvailableVariants.length === 0}
                                      placeholder="Select variant"
                                      searchPlaceholder="Search variant..."
                                      emptyText="No variants found."
                                      widthClassName="w-full"
                                      allowClear={false}
                                    />
                                  </div>
                                  {isInventoryPurchase && (
                                    <>
                                      <div>
                                        <label className="block text-sm font-medium text-foreground">Quantity Purchased</label>
                                        <Input
                                          type="number"
                                          min={1}
                                          value={inventoryQuantity}
                                          onChange={(e) => setInventoryQuantity(e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-foreground">
                                          {currentCurrencyCode
                                            ? `Unit Cost (${currentCurrencyCode})`
                                            : 'Unit Cost'}
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          value={inventoryUnitCost}
                                          onChange={(e) => setInventoryUnitCost(e.target.value)}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                                {isInventoryPurchase && (
                                  <div>
                                    <label className="block text-sm font-medium text-foreground">
                                      {currentCurrencyCode
                                        ? `Total (${currentCurrencyCode})`
                                        : 'Total'}
                                    </label>
                                    <Input
                                      value={(() => {
                                        const qty = parseInt(inventoryQuantity || '0', 10) || 0;
                                        const unitCost = parseFloat(inventoryUnitCost || '0') || 0;
                                        const total = qty * unitCost;
                                        return total ? total.toFixed(2) : '';
                                      })()}
                                      readOnly
                                      className="bg-muted text-muted-foreground"
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-4">
                                {expenseItems.map((item, index) => (
                                    <div key={index} className="space-y-4 rounded-md border border-border p-4 relative bg-card">
                                        {expenseItems.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute top-1 right-1 text-muted-foreground hover:text-destructive"
                                                onClick={() => removeExpenseItem(index)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr,1.2fr] gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-foreground">Expense Name</label>
                                                <Input
                                                    value={item.expense_name}
                                                    onChange={(e) => updateExpenseItem(index, 'expense_name', e.target.value)}
                                                    placeholder="e.g., Purchase of seeds"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground">
                                                    {currentCurrencyCode
                                                        ? `Amount (${currentCurrencyCode})`
                                                        : 'Amount'}
                                                    <span className="text-red-500"> *</span>
                                                </label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min={0}
                                                    value={item.amount}
                                                    onChange={(e) => updateExpenseItem(index, 'amount', e.target.value)}
                                                    placeholder={currentCurrencyCode ? `Amount in ${currentCurrencyCode}` : 'Amount'}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground">Expense Date<span className="text-red-500"> *</span></label>
                                                <Input
                                                    type="date"
                                                    value={item.expense_date}
                                                    onChange={(e) => updateExpenseItem(index, 'expense_date', e.target.value)}
                                                    className="min-w-[9rem]"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-foreground">Description</label>
                                            <textarea
                                                value={item.description}
                                                onChange={(e) => updateExpenseItem(index, 'description', e.target.value)}
                                                rows={2}
                                                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                                                placeholder="Enter a description (optional)"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={addExpenseItem}>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Another Item
                            </Button>
                        </div>
                    </div>
                    <DialogFooter className="mt-8">
                        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !showFullForm}>
                            {editingExpense ? 'Update Expense' : 'Create Expense'}
                        </Button>
                    </DialogFooter>
                </>
            )}
        </form>
    );
}
