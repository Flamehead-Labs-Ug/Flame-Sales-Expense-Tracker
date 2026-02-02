ALTER TABLE public.cycles
  ADD COLUMN IF NOT EXISTS carry_forward_from_cycle_id INTEGER,
  ADD COLUMN IF NOT EXISTS opening_balance_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opening_balance_posted_by INTEGER,
  ADD COLUMN IF NOT EXISTS inventory_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_locked_by INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'cycles_carry_forward_from_cycle_id_fkey'
  ) THEN
    ALTER TABLE public.cycles
      ADD CONSTRAINT cycles_carry_forward_from_cycle_id_fkey
      FOREIGN KEY (carry_forward_from_cycle_id)
      REFERENCES public.cycles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'cycles_opening_balance_posted_by_fkey'
  ) THEN
    ALTER TABLE public.cycles
      ADD CONSTRAINT cycles_opening_balance_posted_by_fkey
      FOREIGN KEY (opening_balance_posted_by)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'cycles_inventory_locked_by_fkey'
  ) THEN
    ALTER TABLE public.cycles
      ADD CONSTRAINT cycles_inventory_locked_by_fkey
      FOREIGN KEY (inventory_locked_by)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cycles_inventory_locked_at ON public.cycles(inventory_locked_at);
CREATE INDEX IF NOT EXISTS idx_cycles_carry_forward_from_cycle_id ON public.cycles(carry_forward_from_cycle_id);
