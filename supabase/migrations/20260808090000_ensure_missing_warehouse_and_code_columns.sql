-- Ensure all warehouse / seasonal / ledger / code columns exist.
-- Consolidates previously-unapplied migrations so Lovable's sync applies them.
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS location text DEFAULT 'shop',
  ADD COLUMN IF NOT EXISTS season text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS min_quantity integer;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS ledger_no text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS code text;
