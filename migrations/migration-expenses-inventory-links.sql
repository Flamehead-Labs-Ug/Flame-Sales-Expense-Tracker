ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS product_id INTEGER,
  ADD COLUMN IF NOT EXISTS variant_id INTEGER,
  ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS inventory_unit_cost NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'expenses_product_id_fkey'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_product_id_fkey
        FOREIGN KEY (product_id)
        REFERENCES public.products(id)
        ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'expenses_variant_id_fkey'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_variant_id_fkey
        FOREIGN KEY (variant_id)
        REFERENCES public.product_variants(id)
        ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_expenses_product_id ON public.expenses(product_id);
CREATE INDEX IF NOT EXISTS idx_expenses_variant_id ON public.expenses(variant_id);
