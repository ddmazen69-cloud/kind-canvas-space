-- Add optional discount (amount + percent) to invoices.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0;
