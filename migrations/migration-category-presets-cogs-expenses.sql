-- Migration: replace default category presets with COGS and EXPENSES

BEGIN;

-- Deactivate all existing presets so only the new list is offered in the UI.
UPDATE public.project_category_presets
SET is_active = false
WHERE name NOT IN ('COGS (Cost of Goods Sold)', 'EXPENSES (Operating Expenses)');

-- Ensure the two desired presets exist and are active.
INSERT INTO public.project_category_presets (name, description, is_active, sort_order)
VALUES
  ('COGS (Cost of Goods Sold)', NULL, true, 1),
  ('EXPENSES (Operating Expenses)', NULL, true, 2)
ON CONFLICT (name)
DO UPDATE SET
  description = EXCLUDED.description,
  is_active = true,
  sort_order = EXCLUDED.sort_order;

-- Deactivate expense presets belonging to inactive project presets.
UPDATE public.expense_category_presets e
SET is_active = false
FROM public.project_category_presets p
WHERE p.id = e.project_category_preset_id
  AND p.is_active = false;

-- COGS (Cost of Goods Sold)
INSERT INTO public.expense_category_presets (project_category_preset_id, name, description, is_active, sort_order)
VALUES
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Raw Materials', NULL, true, 1),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Product/ Inventory / Stock Purchases', NULL, true, 2),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Direct Labor', NULL, true, 3),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Production Costs', NULL, true, 4),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Cost of Services', NULL, true, 5),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Manufacturing Costs', NULL, true, 6),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Packaging Materials', NULL, true, 7),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Freight & Delivery (Inbound)', NULL, true, 8),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Job / Project Materials', NULL, true, 9),
  ((SELECT id FROM public.project_category_presets WHERE name = 'COGS (Cost of Goods Sold)'), 'Service Delivery Costs', NULL, true, 10)
ON CONFLICT (project_category_preset_id, name)
DO UPDATE SET
  description = EXCLUDED.description,
  is_active = true,
  sort_order = EXCLUDED.sort_order;

-- EXPENSES (Operating Expenses)
INSERT INTO public.expense_category_presets (project_category_preset_id, name, description, is_active, sort_order)
VALUES
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Salaries & Wages', NULL, true, 1),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Rent', NULL, true, 2),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Utilities (Water, Electricity)', NULL, true, 3),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Marketing & Advertising', NULL, true, 4),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Office Supplies', NULL, true, 5),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Transport & Fuel', NULL, true, 6),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Internet & Communication', NULL, true, 7),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Software Subscriptions', NULL, true, 8),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Legal & Accounting Fees', NULL, true, 9),
  ((SELECT id FROM public.project_category_presets WHERE name = 'EXPENSES (Operating Expenses)'), 'Repairs & Maintenance', NULL, true, 10)
ON CONFLICT (project_category_preset_id, name)
DO UPDATE SET
  description = EXCLUDED.description,
  is_active = true,
  sort_order = EXCLUDED.sort_order;

COMMIT;
