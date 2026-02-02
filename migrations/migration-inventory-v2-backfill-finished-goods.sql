ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS source_product_id INTEGER;

ALTER TABLE public.inventory_item_variants
  ADD COLUMN IF NOT EXISTS source_product_variant_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_source_product_id_key'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_source_product_id_key
      UNIQUE (source_product_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_variants_source_product_variant_id_key'
  ) THEN
    ALTER TABLE public.inventory_item_variants
      ADD CONSTRAINT inventory_item_variants_source_product_variant_id_key
      UNIQUE (source_product_variant_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_source_product_id
  ON public.inventory_items(source_product_id)
  WHERE source_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_item_variants_source_product_variant_id
  ON public.inventory_item_variants(source_product_variant_id)
  WHERE source_product_variant_id IS NOT NULL;

-- Create FINISHED_GOODS inventory items for products that don't have them yet.
INSERT INTO public.inventory_items (
  organization_id,
  inventory_item_type_id,
  name,
  sku,
  image_url,
  uom,
  is_active,
  default_purchase_unit_cost,
  default_sale_price,
  description,
  created_by,
  source_product_id
)
SELECT
  p.organization_id,
  (SELECT id FROM public.inventory_item_types WHERE code = 'FINISHED_GOODS' LIMIT 1),
  p.product_name,
  p.sku,
  p.images,
  p.unit_of_measurement,
  (COALESCE(p.status, 'enabled') = 'enabled'),
  p.unit_cost,
  p.selling_price,
  p.description,
  NULL,
  p.id
FROM public.products p
WHERE p.organization_id IS NOT NULL
  AND p.inventory_item_id IS NULL
ON CONFLICT (source_product_id) DO NOTHING;

-- Link products to their inventory item.
UPDATE public.products p
SET inventory_item_id = ii.id
FROM public.inventory_items ii
WHERE ii.source_product_id = p.id
  AND (p.inventory_item_id IS NULL OR p.inventory_item_id <> ii.id);

-- Create a default inventory variant per product (so non-variant sales can map).
INSERT INTO public.inventory_item_variants (
  inventory_item_id,
  label,
  sku,
  is_active,
  unit_cost,
  selling_price,
  source_product_variant_id
)
SELECT
  p.inventory_item_id,
  'Default',
  p.sku,
  true,
  p.unit_cost,
  p.selling_price,
  NULL
FROM public.products p
WHERE p.inventory_item_id IS NOT NULL
  AND p.inventory_item_variant_id IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.inventory_item_variants v
     WHERE v.inventory_item_id = p.inventory_item_id
       AND v.source_product_variant_id IS NULL
       AND COALESCE(v.label, '') = 'Default'
  );

-- Link products to their default inventory variant.
UPDATE public.products p
SET inventory_item_variant_id = v.id
FROM public.inventory_item_variants v
WHERE v.inventory_item_id = p.inventory_item_id
  AND v.source_product_variant_id IS NULL
  AND COALESCE(v.label, '') = 'Default'
  AND (p.inventory_item_variant_id IS NULL OR p.inventory_item_variant_id <> v.id);

-- Create inventory variants for each product variant.
INSERT INTO public.inventory_item_variants (
  inventory_item_id,
  label,
  sku,
  is_active,
  unit_cost,
  selling_price,
  source_product_variant_id
)
SELECT
  p.inventory_item_id,
  pv.label,
  NULL,
  true,
  pv.unit_cost,
  pv.selling_price,
  pv.id
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
WHERE p.inventory_item_id IS NOT NULL
  AND pv.inventory_item_variant_id IS NULL
ON CONFLICT (source_product_variant_id) DO NOTHING;

-- Link product_variants to their inventory variant.
UPDATE public.product_variants pv
SET inventory_item_variant_id = v.id
FROM public.inventory_item_variants v
WHERE v.source_product_variant_id = pv.id
  AND (pv.inventory_item_variant_id IS NULL OR pv.inventory_item_variant_id <> v.id);
