-- Add auto-generated entity codes (paper-ledger style) for customers and suppliers.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS code text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS code text;
