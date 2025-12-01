-- Migration: create currencies master table
-- Run this against your existing expense_tracker database.

BEGIN;

CREATE TABLE IF NOT EXISTS public.currencies (
  code        character varying(10) PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamp without time zone DEFAULT now(),
  updated_at  timestamp without time zone DEFAULT now()
);

COMMIT;
