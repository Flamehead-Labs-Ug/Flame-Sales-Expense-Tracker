-- Migration: add currency_code to projects and enforce currency immutability after data
-- Run this against your existing expense_tracker database.

BEGIN;

ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS currency_code character varying(10);

-- Optional: enforce that project currency_code references a known currency
-- (Assumes a public.currencies table with primary key or unique index on code.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'projects_currency_code_fk'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_currency_code_fk
      FOREIGN KEY (currency_code)
      REFERENCES public.currencies(code);
  END IF;
END$$;

-- Default project.currency_code from organization's currency_code on insert
CREATE OR REPLACE FUNCTION public.set_project_currency_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.currency_code IS NULL AND NEW.organization_id IS NOT NULL THEN
    SELECT o.currency_code
    INTO NEW.currency_code
    FROM public.organizations o
    WHERE o.id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_trigger
    WHERE  tgname = 'trg_set_project_currency_default'
  ) THEN
    CREATE TRIGGER trg_set_project_currency_default
    BEFORE INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_project_currency_default();
  END IF;
END$$;

-- Prevent changing project currency if there is existing financial data
CREATE OR REPLACE FUNCTION public.prevent_project_currency_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If currency_code is not actually changing, allow
  IF NEW.currency_code IS NOT DISTINCT FROM OLD.currency_code THEN
    RETURN NEW;
  END IF;

  -- Allow initial set from NULL -> value
  IF OLD.currency_code IS NULL THEN
    RETURN NEW;
  END IF;

  -- Block change if there is any financial data for this project
  IF EXISTS (SELECT 1 FROM public.cycles   c WHERE c.project_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.products p WHERE p.project_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.sales    s WHERE s.project_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.expenses e WHERE e.project_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot change currency for project % because there is existing financial data', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_trigger
    WHERE  tgname = 'trg_prevent_project_currency_change'
  ) THEN
    CREATE TRIGGER trg_prevent_project_currency_change
    BEFORE UPDATE OF currency_code ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_project_currency_change();
  END IF;
END$$;

COMMIT;
