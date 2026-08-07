-- Add optional size field to stock items (for price/label tags).
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS size text;
