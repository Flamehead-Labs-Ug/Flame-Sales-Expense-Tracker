CREATE TABLE IF NOT EXISTS cycle_budget_transactions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER,
  cycle_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_delta NUMERIC(10,2) NOT NULL,
  amount_delta_org_ccy NUMERIC(14,2) NOT NULL,
  budget_before NUMERIC(10,2),
  budget_after NUMERIC(10,2),
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cycle_budget_tx_org_id ON cycle_budget_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_cycle_budget_tx_cycle_id ON cycle_budget_transactions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_budget_tx_created_at ON cycle_budget_transactions(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'cycle_budget_transactions_cycle_id_fkey'
  ) THEN
    ALTER TABLE cycle_budget_transactions
      ADD CONSTRAINT cycle_budget_transactions_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'cycle_budget_transactions_project_id_fkey'
  ) THEN
    ALTER TABLE cycle_budget_transactions
      ADD CONSTRAINT cycle_budget_transactions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'cycle_budget_transactions_organization_id_fkey'
  ) THEN
    ALTER TABLE cycle_budget_transactions
      ADD CONSTRAINT cycle_budget_transactions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;
