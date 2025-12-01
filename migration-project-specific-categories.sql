-- Migration to add project_id to category tables for project-specific categories

BEGIN;

-- Step 1: Add project_id to project_categories
ALTER TABLE public.project_categories
ADD COLUMN project_id INTEGER,
ADD CONSTRAINT fk_project_categories_project_id
FOREIGN KEY (project_id)
REFERENCES public.projects(id)
ON DELETE CASCADE;

COMMENT ON COLUMN public.project_categories.project_id IS 'If set, this category is specific to the referenced project. If NULL, it is shared across the organization.';

-- Step 2: Add project_id to expense_category
ALTER TABLE public.expense_category
ADD COLUMN project_id INTEGER,
ADD CONSTRAINT fk_expense_category_project_id
FOREIGN KEY (project_id)
REFERENCES public.projects(id)
ON DELETE CASCADE;

COMMENT ON COLUMN public.expense_category.project_id IS 'If set, this category is specific to the referenced project. If NULL, it is shared across the organization.';

COMMIT;
