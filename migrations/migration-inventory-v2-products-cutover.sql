ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_category_id INTEGER,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS reorder_level INTEGER,
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_project_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_project_category_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_project_category_id_fkey
      FOREIGN KEY (project_category_id) REFERENCES public.project_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_items_project_id ON public.inventory_items(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_project_category_id ON public.inventory_items(project_category_id);

ALTER TABLE public.inventory_item_variants
  ADD COLUMN IF NOT EXISTS unit_of_measurement VARCHAR(100),
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_inventory_item_variants_source_product_variant_id ON public.inventory_item_variants(source_product_variant_id);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS inventory_item_variant_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_inventory_item_variant_id_fkey
      FOREIGN KEY (inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_inventory_item_variant_id ON public.sales(inventory_item_variant_id);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS inventory_item_variant_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_inventory_item_variant_id_fkey'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_inventory_item_variant_id_fkey
      FOREIGN KEY (inventory_item_variant_id) REFERENCES public.inventory_item_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_inventory_item_variant_id ON public.expenses(inventory_item_variant_id);

CREATE OR REPLACE FUNCTION public.flame_safe_jsonb(input text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN input::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

UPDATE public.inventory_items ii
SET
  project_id = COALESCE(ii.project_id, p.project_id),
  project_category_id = COALESCE(ii.project_category_id, p.project_category_id),
  category = COALESCE(ii.category, p.category),
  reorder_level = COALESCE(ii.reorder_level, p.reorder_level),
  images = COALESCE(
    NULLIF(ii.images, '[]'::jsonb),
    CASE
      WHEN p.images IS NULL OR btrim(p.images::text) = '' THEN '[]'::jsonb
      ELSE COALESCE(public.flame_safe_jsonb(p.images::text), '[]'::jsonb)
    END,
    '[]'::jsonb
  ),
  attributes = COALESCE(
    NULLIF(ii.attributes, '[]'::jsonb),
    CASE
      WHEN p.attributes IS NULL THEN '[]'::jsonb
      ELSE COALESCE(public.flame_safe_jsonb(p.attributes::text), '[]'::jsonb)
    END,
    '[]'::jsonb
  )
FROM public.products p
WHERE ii.source_product_id = p.id;

UPDATE public.inventory_item_variants v
SET
  unit_of_measurement = COALESCE(v.unit_of_measurement, pv.unit_of_measurement),
  images = COALESCE(NULLIF(v.images, '[]'::jsonb), pv.images, '[]'::jsonb),
  attributes = COALESCE(NULLIF(v.attributes, '[]'::jsonb), pv.attributes, '[]'::jsonb),
  unit_cost = COALESCE(v.unit_cost, pv.unit_cost),
  selling_price = COALESCE(v.selling_price, pv.selling_price)
FROM public.product_variants pv
WHERE v.source_product_variant_id = pv.id;

UPDATE public.sales s
SET inventory_item_variant_id = pv.inventory_item_variant_id
FROM public.product_variants pv
WHERE s.inventory_item_variant_id IS NULL
  AND s.variant_id IS NOT NULL
  AND pv.id = s.variant_id
  AND pv.inventory_item_variant_id IS NOT NULL;

UPDATE public.sales s
SET inventory_item_variant_id = p.inventory_item_variant_id
FROM public.products p
WHERE s.inventory_item_variant_id IS NULL
  AND (s.variant_id IS NULL OR s.variant_id = 0)
  AND s.product_id IS NOT NULL
  AND p.id = s.product_id
  AND p.inventory_item_variant_id IS NOT NULL;

UPDATE public.expenses e
SET inventory_item_variant_id = pv.inventory_item_variant_id
FROM public.product_variants pv
WHERE e.inventory_item_variant_id IS NULL
  AND e.variant_id IS NOT NULL
  AND pv.id = e.variant_id
  AND pv.inventory_item_variant_id IS NOT NULL;

UPDATE public.expenses e
SET inventory_item_variant_id = p.inventory_item_variant_id
FROM public.products p
WHERE e.inventory_item_variant_id IS NULL
  AND (e.variant_id IS NULL OR e.variant_id = 0)
  AND e.product_id IS NOT NULL
  AND p.id = e.product_id
  AND p.inventory_item_variant_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.flame_safe_jsonb(text);
