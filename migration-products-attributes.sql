-- Migration: add attributes and status to products

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS status character varying(50) DEFAULT 'enabled',
ADD COLUMN IF NOT EXISTS attributes jsonb;
