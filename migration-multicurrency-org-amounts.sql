BEGIN;

ALTER TABLE IF EXISTS public.sales
  ADD COLUMN IF NOT EXISTS amount_org_ccy numeric(14,2);

ALTER TABLE IF EXISTS public.expenses
  ADD COLUMN IF NOT EXISTS amount_org_ccy numeric(14,2);

ALTER TABLE IF EXISTS public.cycles
  ADD COLUMN IF NOT EXISTS budget_allotment_org_ccy numeric(14,2);

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id              serial PRIMARY KEY,
  base_currency   varchar(10) NOT NULL,
  quote_currency  varchar(10) NOT NULL,
  rate_date       date        NOT NULL,
  rate            numeric(18,8) NOT NULL,
  source          varchar(50)   DEFAULT 'fawaz_api',
  created_at      timestamptz   DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_unique_idx
  ON public.exchange_rates (base_currency, quote_currency, rate_date);

COMMIT;
