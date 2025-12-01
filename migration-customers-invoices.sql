-- Migration: add customers and invoices tables, and link sales to customers and invoices

-- 1) Customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  phone_number VARCHAR(50),
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, name)
);

-- 2) Link sales to customers via customer_id
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_id INTEGER;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id);

-- 3) Backfill customers and customer_id from existing sales.customer_name
INSERT INTO public.customers (name, organization_id)
SELECT DISTINCT s.customer_name, s.organization_id
FROM public.sales s
WHERE s.customer_name IS NOT NULL
  AND s.customer_name <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.name = s.customer_name
      AND c.organization_id = s.organization_id
  );

UPDATE public.sales s
SET customer_id = c.id
FROM public.customers c
WHERE s.customer_name IS NOT NULL
  AND s.customer_name = c.name
  AND s.organization_id = c.organization_id
  AND s.customer_id IS NULL;

-- 4) Invoices table for storing generated invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES public.customers(id),
  invoice_number VARCHAR(100) NOT NULL,
  invoice_date DATE,
  due_date DATE,
  currency VARCHAR(10),
  net_amount NUMERIC(10,2),
  vat_amount NUMERIC(10,2),
  gross_amount NUMERIC(10,2),
  status VARCHAR(50) DEFAULT 'generated',
  pdf_url VARCHAR(500),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);

-- 5) Join table linking invoices to one or more sales
CREATE TABLE IF NOT EXISTS public.invoice_sales (
  invoice_id INTEGER NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sale_id INTEGER NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, sale_id)
);
