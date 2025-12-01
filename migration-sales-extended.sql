-- Migration: extend sales table with detailed fields for quantity, pricing, and balances

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS price numeric(10,2),
  ADD COLUMN IF NOT EXISTS status character varying(50),
  ADD COLUMN IF NOT EXISTS cash_at_hand numeric(10,2),
  ADD COLUMN IF NOT EXISTS balance numeric(10,2);
