-- Migration: add country and currency fields to organizations
-- Run this against your existing expense_tracker database.

BEGIN;

ALTER TABLE IF EXISTS public.organizations
  ADD COLUMN IF NOT EXISTS country_code character varying(2),
  ADD COLUMN IF NOT EXISTS currency_code character varying(10),
  ADD COLUMN IF NOT EXISTS currency_symbol character varying(10);

-- Optional: enforce that organization currency_code references a known currency
-- (Assumes a public.currencies table with primary key or unique index on code.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'organizations_currency_code_fk'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_currency_code_fk
      FOREIGN KEY (currency_code)
      REFERENCES public.currencies(code);
  END IF;
END$$;

-- Prevent changing organization currency if there is existing financial data
CREATE OR REPLACE FUNCTION public.prevent_org_currency_change()
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

  -- Block change if there is any financial data for this organization
  IF EXISTS (SELECT 1 FROM public.cycles   c WHERE c.organization_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.products p WHERE p.organization_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.sales    s WHERE s.organization_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.expenses e WHERE e.organization_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.invoices i WHERE i.organization_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot change currency for organization % because there is existing financial data', OLD.id
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
    WHERE  tgname = 'trg_prevent_org_currency_change'
  ) THEN
    CREATE TRIGGER trg_prevent_org_currency_change
    BEFORE UPDATE OF currency_code ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_org_currency_change();
  END IF;
END$$;

COMMIT;
