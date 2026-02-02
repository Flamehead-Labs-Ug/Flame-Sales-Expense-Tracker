-- Migration: standalone inventory v2 (RM/WIP/FG) + production orders scaffolding

CREATE TABLE IF NOT EXISTS public.inventory_item_types (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 3-stage inventory types.
INSERT INTO public.inventory_item_types (code, name, is_active)
VALUES
  ('RAW_MATERIAL', 'Raw Materials', true),
  ('WORK_IN_PROGRESS', 'Work In Progress', true),
  ('FINISHED_GOODS', 'Product/Finished Goods', true)
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  inventory_item_type_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(255),
  image_url TEXT,
  uom VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_purchase_unit_cost NUMERIC(10,2),
  default_sale_price NUMERIC(10,2),
  description TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_organization_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_inventory_item_type_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_inventory_item_type_id_fkey
      FOREIGN KEY (inventory_item_type_id) REFERENCES public.inventory_item_types(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_created_by_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_items_org_id ON public.inventory_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_type_id ON public.inventory_items(inventory_item_type_id);

CREATE TABLE IF NOT EXISTS public.inventory_item_variants (
  id SERIAL PRIMARY KEY,
  inventory_item_id INTEGER NOT NULL,
  label VARCHAR(255),
  sku VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  unit_cost NUMERIC(10,2),
  selling_price NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_variants_inventory_item_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_item_variants
      ADD CONSTRAINT inventory_item_variants_inventory_item_id_fkey
      FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_item_variants_item_id ON public.inventory_item_variants(inventory_item_id);

CREATE TABLE IF NOT EXISTS public.inventory_balances (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  cycle_id INTEGER NOT NULL,
  inventory_item_variant_id INTEGER NOT NULL,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  avg_unit_cost NUMERIC(10,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_organization_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_project_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_cycle_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_inventory_item_variant_id_fkey
      FOREIGN KEY (inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'inventory_balances_unique_bin'
  ) THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_unique_bin
      UNIQUE (organization_id, project_id, cycle_id, inventory_item_variant_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_balances_org_id ON public.inventory_balances(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_project_cycle ON public.inventory_balances(project_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_variant_id ON public.inventory_balances(inventory_item_variant_id);

CREATE TABLE IF NOT EXISTS public.inventory_item_transactions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  cycle_id INTEGER NOT NULL,
  inventory_item_id INTEGER NOT NULL,
  inventory_item_variant_id INTEGER NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  quantity_delta INTEGER NOT NULL,
  unit_cost NUMERIC(10,2),
  source_type VARCHAR(50),
  source_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_transactions_organization_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_item_transactions
      ADD CONSTRAINT inventory_item_transactions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_transactions_project_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_item_transactions
      ADD CONSTRAINT inventory_item_transactions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_transactions_cycle_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_item_transactions
      ADD CONSTRAINT inventory_item_transactions_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_transactions_inventory_item_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_item_transactions
      ADD CONSTRAINT inventory_item_transactions_inventory_item_id_fkey
      FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_transactions_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_item_transactions
      ADD CONSTRAINT inventory_item_transactions_inventory_item_variant_id_fkey
      FOREIGN KEY (inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_transactions_created_by_fkey'
  ) THEN
    ALTER TABLE public.inventory_item_transactions
      ADD CONSTRAINT inventory_item_transactions_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_item_tx_org_id ON public.inventory_item_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_tx_project_cycle ON public.inventory_item_transactions(project_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_tx_variant_id ON public.inventory_item_transactions(inventory_item_variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_tx_created_at ON public.inventory_item_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS public.production_orders (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  cycle_id INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  output_inventory_item_variant_id INTEGER NOT NULL,
  output_quantity INTEGER NOT NULL,
  output_unit_cost NUMERIC(10,2),
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_organization_id_fkey'
  ) THEN
    ALTER TABLE public.production_orders
      ADD CONSTRAINT production_orders_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_project_id_fkey'
  ) THEN
    ALTER TABLE public.production_orders
      ADD CONSTRAINT production_orders_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_cycle_id_fkey'
  ) THEN
    ALTER TABLE public.production_orders
      ADD CONSTRAINT production_orders_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_output_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.production_orders
      ADD CONSTRAINT production_orders_output_inventory_item_variant_id_fkey
      FOREIGN KEY (output_inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_created_by_fkey'
  ) THEN
    ALTER TABLE public.production_orders
      ADD CONSTRAINT production_orders_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_production_orders_org_id ON public.production_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_project_cycle ON public.production_orders(project_id, cycle_id);

CREATE TABLE IF NOT EXISTS public.production_order_inputs (
  id SERIAL PRIMARY KEY,
  production_order_id INTEGER NOT NULL,
  input_inventory_item_variant_id INTEGER NOT NULL,
  quantity_required INTEGER NOT NULL,
  unit_cost_override NUMERIC(10,2),
  notes TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_order_inputs_production_order_id_fkey'
  ) THEN
    ALTER TABLE public.production_order_inputs
      ADD CONSTRAINT production_order_inputs_production_order_id_fkey
      FOREIGN KEY (production_order_id) REFERENCES public.production_orders(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_order_inputs_input_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.production_order_inputs
      ADD CONSTRAINT production_order_inputs_input_inventory_item_variant_id_fkey
      FOREIGN KEY (input_inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_production_order_inputs_order_id ON public.production_order_inputs(production_order_id);

-- Link existing Products/Variants to Finished Goods inventory items/variants.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS inventory_item_id INTEGER;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS inventory_item_variant_id INTEGER;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS inventory_item_variant_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_inventory_item_id_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_inventory_item_id_fkey
      FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_inventory_item_variant_id_fkey
      FOREIGN KEY (inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_inventory_item_variant_id_fkey
      FOREIGN KEY (inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_inventory_item_id ON public.products(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_products_inventory_item_variant_id ON public.products(inventory_item_variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_inventory_item_variant_id ON public.product_variants(inventory_item_variant_id);
