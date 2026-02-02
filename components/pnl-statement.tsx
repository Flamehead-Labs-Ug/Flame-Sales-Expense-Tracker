'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFilter } from '@/lib/context/filter-context';
import {
  calcExpenseTotalsByProjectCategory,
  calcGrossProfit,
  calcNetProfitFromGrossProfit,
  getProjectCategoryIdByName,
} from '@/lib/accounting/formulas';

interface Sale {
  id: number;
  product_id?: number | null;
  quantity?: number;
  price?: number;
  amount?: number | string;
  amount_org_ccy?: number | string | null;
  status?: string | null;
}

interface Product {
  id: number;
  product_name: string;
}

interface Expense {
  id: number;
  category_id?: number | null;
  expense_name?: string | null;
  description?: string | null;
  amount?: number | string;
  amount_org_ccy?: number | string | null;
}

interface ExpenseCategory {
  id: number;
  project_category_id?: number | null;
}

interface ProjectCategory {
  id: number;
  category_name: string;
}

interface LineItem {
  label: string;
  amount: number;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function PnlStatement() {
  const { selectedProject, selectedCycle, projects, currentCurrencyCode } = useFilter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currencyCode = currentCurrencyCode || 'USD';
  const isOrgLevelView = !selectedProject;

  const formatter = useMemo(() => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode });
  }, [currencyCode]);

  const selectedProjectName = useMemo(() => {
    if (!selectedProject) return 'All projects';
    const project = projects.find((p) => String(p.id) === String(selectedProject));
    return project?.project_name || 'Selected project';
  }, [projects, selectedProject]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const salesUrl = new URL('/api/v1/sales', window.location.origin);
        salesUrl.searchParams.set('status', 'completed');
        salesUrl.searchParams.set('limit', '5000');
        if (selectedProject) salesUrl.searchParams.set('project_id', selectedProject);
        if (selectedCycle) salesUrl.searchParams.set('cycle_id', selectedCycle);

        const expenseUrl = new URL('/api/v1/expenses', window.location.origin);
        expenseUrl.searchParams.set('limit', '5000');
        if (selectedProject) expenseUrl.searchParams.set('project_id', selectedProject);
        if (selectedCycle) expenseUrl.searchParams.set('cycle_id', selectedCycle);

        const categoriesUrl = new URL('/api/v1/expense-categories', window.location.origin);
        if (selectedProject) categoriesUrl.searchParams.set('projectId', selectedProject);

        const projectCategoriesUrl = new URL('/api/v1/project-categories', window.location.origin);
        if (selectedProject) projectCategoriesUrl.searchParams.set('projectId', selectedProject);

        const [salesRes, productsRes, expensesRes, categoriesRes, projectCategoriesRes] = await Promise.all([
          fetch(salesUrl.toString()),
          fetch('/api/v1/products'),
          fetch(expenseUrl.toString()),
          fetch(categoriesUrl.toString()),
          fetch(projectCategoriesUrl.toString()),
        ]);

        const [salesData, productsData, expensesData, categoriesData, projectCategoriesData] = await Promise.all([
          salesRes.json(),
          productsRes.json(),
          expensesRes.json(),
          categoriesRes.json(),
          projectCategoriesRes.json(),
        ]);

        setSales(salesData.status === 'success' ? (salesData.sales || []) : []);
        setProducts(productsData.status === 'success' ? (productsData.products || []) : []);
        setExpenses(expensesData.status === 'success' ? (expensesData.expenses || []) : []);
        setExpenseCategories(categoriesData.status === 'success' ? (categoriesData.categories || []) : []);
        setProjectCategories(projectCategoriesData.status === 'success' ? (projectCategoriesData.categories || []) : []);
      } catch {
        setSales([]);
        setProducts([]);
        setExpenses([]);
        setExpenseCategories([]);
        setProjectCategories([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedProject, selectedCycle]);

  const getSaleAmount = useCallback((sale: Sale) => {
    if (isOrgLevelView) {
      const converted = toNumber(sale.amount_org_ccy);
      if (converted) return converted;
    }
    const raw = toNumber(sale.amount);
    if (raw) return raw;
    return toNumber(sale.quantity) * toNumber(sale.price);
  }, [isOrgLevelView]);

  const getExpenseAmount = useCallback((expense: Expense) => {
    if (isOrgLevelView) {
      const converted = toNumber(expense.amount_org_ccy);
      if (converted) return converted;
    }
    return toNumber(expense.amount);
  }, [isOrgLevelView]);

  const netSalesItems: LineItem[] = useMemo(() => {
    const byProductId = new Map<number, number>();

    for (const s of sales) {
      if (String(s.status || '').toLowerCase() !== 'completed') continue;
      const productId = typeof s.product_id === 'number' ? s.product_id : null;
      if (!productId) continue;
      const amt = getSaleAmount(s);
      if (!amt) continue;

      const prev = byProductId.get(productId) ?? 0;
      byProductId.set(productId, prev + amt);
    }

    const nameById = new Map<number, string>();
    for (const p of products) {
      if (typeof p?.id === 'number') {
        nameById.set(p.id, p.product_name);
      }
    }

    return Array.from(byProductId.entries())
      .map(([productId, amount]) => ({
        label: nameById.get(productId) || 'Unknown product',
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [products, sales, getSaleAmount]);

  const netSalesTotal = useMemo(() => {
    return netSalesItems.reduce((sum, item) => sum + item.amount, 0);
  }, [netSalesItems]);

  const categoryById = useMemo(() => {
    const map = new Map<number, ExpenseCategory>();
    for (const c of expenseCategories) {
      if (typeof c?.id === 'number') {
        map.set(c.id, c);
      }
    }
    return map;
  }, [expenseCategories]);

  const cogsProjectCategoryId = useMemo(() => {
    return getProjectCategoryIdByName(projectCategories, 'cogs') ?? null;
  }, [projectCategories]);

  const operatingProjectCategoryId = useMemo(() => {
    return getProjectCategoryIdByName(projectCategories, 'operating expenses') ?? null;
  }, [projectCategories]);

  const cogsExpenseItems: LineItem[] = useMemo(() => {
    const list: LineItem[] = [];
    for (const e of expenses) {
      const categoryId = e.category_id ?? null;
      if (!categoryId) continue;
      const cat = categoryById.get(Number(categoryId));
      if (!cat) continue;
      if (!cogsProjectCategoryId) continue;
      if (cat.project_category_id !== cogsProjectCategoryId) continue;

      const amt = getExpenseAmount(e);
      if (!amt) continue;

      list.push({
        label: String(e.expense_name || e.description || 'Expense'),
        amount: amt,
      });
    }
    return list.sort((a, b) => b.amount - a.amount);
  }, [categoryById, cogsProjectCategoryId, expenses, getExpenseAmount]);

  const operatingExpenseItems: LineItem[] = useMemo(() => {
    const list: LineItem[] = [];
    for (const e of expenses) {
      const categoryId = e.category_id ?? null;
      if (!categoryId) continue;
      const cat = categoryById.get(Number(categoryId));
      if (!cat) continue;
      if (!operatingProjectCategoryId) continue;
      if (cat.project_category_id !== operatingProjectCategoryId) continue;

      const amt = getExpenseAmount(e);
      if (!amt) continue;

      list.push({
        label: String(e.expense_name || e.description || 'Expense'),
        amount: amt,
      });
    }
    return list.sort((a, b) => b.amount - a.amount);
  }, [categoryById, expenses, operatingProjectCategoryId, getExpenseAmount]);

  const normalizedExpensesForTotals = useMemo(() => {
    return expenses.map((e) => ({
      amount: getExpenseAmount(e),
      category_id: e.category_id ?? null,
    }));
  }, [expenses, getExpenseAmount]);

  const { totalCogs, totalOperatingExpenses } = useMemo(() => {
    return calcExpenseTotalsByProjectCategory(
      normalizedExpensesForTotals,
      expenseCategories,
      projectCategories,
    );
  }, [expenseCategories, normalizedExpensesForTotals, projectCategories]);

  const grossProfit = useMemo(() => {
    return calcGrossProfit(netSalesTotal, totalCogs);
  }, [netSalesTotal, totalCogs]);

  const netProfitLoss = useMemo(() => {
    return calcNetProfitFromGrossProfit(grossProfit, totalOperatingExpenses);
  }, [grossProfit, totalOperatingExpenses]);

  const handleExportPdf = () => {
    const win = window.open('', '_blank');
    if (!win) {
      return;
    }

    const format = (value: number) => escapeHtml(formatter.format(value));

    const netSalesRows = netSalesItems
      .map(
        (item) =>
          `<tr><td class="label">${escapeHtml(item.label)}</td><td class="amount">${format(item.amount)}</td></tr>`,
      )
      .join('');

    const cogsRows = cogsExpenseItems
      .map(
        (item) =>
          `<tr><td class="label">${escapeHtml(item.label)}</td><td class="amount">${format(item.amount)}</td></tr>`,
      )
      .join('');

    const operatingRows = operatingExpenseItems
      .map(
        (item) =>
          `<tr><td class="label">${escapeHtml(item.label)}</td><td class="amount">${format(item.amount)}</td></tr>`,
      )
      .join('');

    const title = `P&L Statement - ${selectedProjectName}`;

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 32px; color: #111827; }
      h1 { font-size: 20px; margin: 0; }
      .subtitle { margin-top: 4px; color: #6b7280; font-size: 12px; }
      .section { margin-top: 20px; }
      .section-title { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; font-weight: 600; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      td { padding: 6px 0; vertical-align: top; font-size: 12px; }
      .label { color: #6b7280; padding-right: 12px; }
      .amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .total-row td { padding-top: 10px; font-weight: 600; color: #111827; }
      .grand-total { margin-top: 18px; border-top: 1px solid #111827; padding-top: 12px; display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; }
      .positive { color: #16a34a; }
      .negative { color: #dc2626; }
      @media print { body { margin: 0.5in; } }
    </style>
  </head>
  <body>
    <h1>P&amp;L Statement</h1>
    <div class="subtitle">${escapeHtml(selectedProjectName)}</div>

    <div class="section">
      <div class="section-title"><span>Net Sales</span><span>${format(netSalesTotal)}</span></div>
      <table>
        ${netSalesRows || '<tr><td class="label">No sales found for this scope.</td><td class="amount"></td></tr>'}
      </table>
    </div>

    <div class="section">
      <div class="section-title"><span>COGS</span><span>${format(totalCogs)}</span></div>
      <table>
        ${cogsRows || '<tr><td class="label">No COGS expenses found.</td><td class="amount"></td></tr>'}
      </table>
    </div>

    <div class="section">
      <div class="section-title"><span>Gross Profit</span><span class="${grossProfit >= 0 ? 'positive' : 'negative'}">${format(grossProfit)}</span></div>
    </div>

    <div class="section">
      <div class="section-title"><span>Operating Expenses</span><span>${format(totalOperatingExpenses)}</span></div>
      <table>
        ${operatingRows || '<tr><td class="label">No operating expenses found.</td><td class="amount"></td></tr>'}
      </table>
    </div>

    <div class="grand-total">
      <span>Net Profit / Loss</span>
      <span class="${netProfitLoss >= 0 ? 'positive' : 'negative'}">${format(netProfitLoss)}</span>
    </div>
  </body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();

    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>P&amp;L Statement</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">Loading statement...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>P&amp;L Statement</CardTitle>
        <Button variant="outline" size="sm" type="button" onClick={handleExportPdf}>
          Export PDF
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        <div className="text-sm text-muted-foreground">{selectedProjectName}</div>

        <div className="mt-6 space-y-8">
          <div>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="text-sm font-semibold">Net Sales</div>
              <div className="text-sm font-semibold text-green-600 tabular-nums">
                {formatter.format(netSalesTotal)}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {netSalesItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No sales found for this scope.</div>
              ) : (
                netSalesItems.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-4 text-sm">
                    <div className="text-muted-foreground">{item.label}</div>
                    <div className="tabular-nums">{formatter.format(item.amount)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="text-sm font-semibold">COGS</div>
              <div className="text-sm font-semibold tabular-nums">{formatter.format(totalCogs)}</div>
            </div>
            <div className="mt-3 space-y-2">
              {cogsExpenseItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No COGS expenses found.</div>
              ) : (
                cogsExpenseItems.map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="flex items-start justify-between gap-4 text-sm">
                    <div className="text-muted-foreground">{item.label}</div>
                    <div className="tabular-nums">{formatter.format(item.amount)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="text-sm font-semibold">Gross Profit</div>
              <div
                className={`text-sm font-semibold tabular-nums ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {formatter.format(grossProfit)}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="text-sm font-semibold">Operating Expenses</div>
              <div className="text-sm font-semibold tabular-nums">{formatter.format(totalOperatingExpenses)}</div>
            </div>
            <div className="mt-3 space-y-2">
              {operatingExpenseItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No operating expenses found.</div>
              ) : (
                operatingExpenseItems.map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="flex items-start justify-between gap-4 text-sm">
                    <div className="text-muted-foreground">{item.label}</div>
                    <div className="tabular-nums">{formatter.format(item.amount)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-base font-semibold">Net Profit / Loss</div>
              <div
                className={`text-base font-semibold tabular-nums ${netProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {formatter.format(netProfitLoss)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
