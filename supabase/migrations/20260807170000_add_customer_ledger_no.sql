-- Add optional paper-ledger customer number (installment customers only).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS ledger_no text;
