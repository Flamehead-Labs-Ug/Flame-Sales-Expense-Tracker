-- Migration: support invoice-first flow, customer contact info, and project/cycle linkage via sales
-- Run this against your existing expense_tracker database.

BEGIN;

-- 1) Ensure customers table has phone + phone_number (already present in latest schema,
--    but kept here as idempotent safety if run against an older DB).

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS phone character varying(50),
  ADD COLUMN IF NOT EXISTS phone_number character varying(50);

-- 2) Ensure invoices table exists with expected columns.
--    Your dump already has this, but this keeps the migration safe on older DBs.

CREATE TABLE IF NOT EXISTS public.invoices (
    id              integer NOT NULL,
    organization_id integer NOT NULL,
    customer_id     integer,
    invoice_number  character varying(100) NOT NULL,
    invoice_date    date,
    due_date        date,
    currency        character varying(10),
    net_amount      numeric(10,2),
    vat_amount      numeric(10,2),
    gross_amount    numeric(10,2),
    status          character varying(50) DEFAULT 'generated',
    pdf_url         character varying(500),
    created_at      timestamp without time zone DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    WHERE  c.relkind = 'S'
    AND    c.relname = 'invoices_id_seq'
  ) THEN
    CREATE SEQUENCE public.invoices_id_seq
      AS integer
      START WITH 1
      INCREMENT BY 1
      NO MINVALUE
      NO MAXVALUE
      CACHE 1;

    ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;
  END IF;
END
$$;

ALTER TABLE public.invoices
  ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);

-- Unique constraint used by the code for UPSERT on (organization_id, invoice_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'invoices_organization_id_invoice_number_key'
  ) THEN
    ALTER TABLE ONLY public.invoices
      ADD CONSTRAINT invoices_organization_id_invoice_number_key
      UNIQUE (organization_id, invoice_number);
  END IF;
END
$$;

-- 3) Ensure invoice_sales mapping table exists (for invoice  sale linkage).

CREATE TABLE IF NOT EXISTS public.invoice_sales (
    invoice_id integer NOT NULL,
    sale_id    integer NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'invoice_sales_pkey'
  ) THEN
    ALTER TABLE ONLY public.invoice_sales
      ADD CONSTRAINT invoice_sales_pkey PRIMARY KEY (invoice_id, sale_id);
  END IF;
END
$$;

-- Foreign keys to link invoices and sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'invoice_sales_invoice_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.invoice_sales
      ADD CONSTRAINT invoice_sales_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'invoice_sales_sale_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.invoice_sales
      ADD CONSTRAINT invoice_sales_sale_id_fkey
      FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- 4) Ensure sales has the columns needed for synthetic invoice-link sales.
--    Most of these already exist in your schema; statements are idempotent.

ALTER TABLE IF EXISTS public.sales
  ADD COLUMN IF NOT EXISTS project_id integer,
  ADD COLUMN IF NOT EXISTS cycle_id integer,
  ADD COLUMN IF NOT EXISTS product_id integer,
  ADD COLUMN IF NOT EXISTS variant_id integer,
  ADD COLUMN IF NOT EXISTS customer_name character varying(255),
  ADD COLUMN IF NOT EXISTS amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS sale_date date,
  ADD COLUMN IF NOT EXISTS created_by character varying(255),
  ADD COLUMN IF NOT EXISTS organization_id integer,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS price numeric(10,2),
  ADD COLUMN IF NOT EXISTS status character varying(50),
  ADD COLUMN IF NOT EXISTS cash_at_hand numeric(10,2),
  ADD COLUMN IF NOT EXISTS balance numeric(10,2),
  ADD COLUMN IF NOT EXISTS customer_id integer;

COMMIT;
