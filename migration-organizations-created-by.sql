-- Migration: add created_by to organizations and link to users
-- Run this against your existing expense_tracker database.

BEGIN;

ALTER TABLE IF EXISTS public.organizations
  ADD COLUMN IF NOT EXISTS created_by integer;

-- Optional: enforce that created_by references users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'organizations_created_by_fk'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_created_by_fk
      FOREIGN KEY (created_by)
      REFERENCES public.users(id);
  END IF;
END$$;

COMMIT;
