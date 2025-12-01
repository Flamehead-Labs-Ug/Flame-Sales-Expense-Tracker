-- Migration: add variant_id to sales for per-variant stock tracking

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS variant_id integer;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);
