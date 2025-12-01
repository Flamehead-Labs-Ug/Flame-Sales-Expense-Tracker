-- Migration: create countries master table
-- Run this against your existing expense_tracker database.

BEGIN;

CREATE TABLE IF NOT EXISTS public.countries (
  code        character(2) PRIMARY KEY,
  name        text NOT NULL,
  currency_code character varying(10),
  created_at  timestamp without time zone DEFAULT now(),
  updated_at  timestamp without time zone DEFAULT now()
);

COMMIT;
