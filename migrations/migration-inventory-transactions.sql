CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER,
  cycle_id INTEGER,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES public.product_variants(id) ON DELETE SET NULL,
  expense_id INTEGER REFERENCES public.expenses(id) ON DELETE SET NULL,
  sale_id INTEGER REFERENCES public.sales(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  quantity_delta INTEGER NOT NULL,
  unit_cost NUMERIC(10,2),
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_org_id ON public.inventory_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_project_id ON public.inventory_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_cycle_id ON public.inventory_transactions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_id ON public.inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_variant_id ON public.inventory_transactions(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_expense_id ON public.inventory_transactions(expense_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_sale_id ON public.inventory_transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at ON public.inventory_transactions(created_at);
