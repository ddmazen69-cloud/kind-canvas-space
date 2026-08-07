-- Add location and season columns to stock_items table to support warehouse seasonal items
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS location text DEFAULT 'shop';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS season text DEFAULT 'general';
