-- Migration: update COGS preset categories to 3-stage inventory categories

BEGIN;

-- Keep the main COGS preset itself active.
UPDATE public.project_category_presets
SET is_active = true
WHERE name = 'COGS (Cost of Goods Sold)';

-- Deactivate any existing COGS expense category presets not in the new list.
UPDATE public.expense_category_presets e
SET is_active = false
WHERE e.project_category_preset_id = (SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)')
  AND e.name NOT IN ('Raw Materials', 'Work In Progress', 'Product/Finished Goods');

-- Upsert the desired 3 COGS categories.
INSERT INTO public.expense_category_presets (project_category_preset_id, name, description, is_active, sort_order)
VALUES
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Raw Materials', NULL, true, 1),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Work In Progress', NULL, true, 2),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Product/Finished Goods', NULL, true, 3)
ON CONFLICT (project_category_preset_id, name)
DO UPDATE SET
  description = EXCLUDED.description,
  is_active = true,
  sort_order = EXCLUDED.sort_order;

COMMIT;
