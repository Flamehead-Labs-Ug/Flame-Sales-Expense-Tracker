-- Migration: create product_variants table for multi-variant support

CREATE TABLE IF NOT EXISTS public.product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label VARCHAR(255),
  unit_cost NUMERIC(10,2),
  selling_price NUMERIC(10,2),
  quantity_in_stock INTEGER DEFAULT 0,
  unit_of_measurement VARCHAR(100),
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: index to quickly fetch variants by product
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants(product_id);
