-- Stores the selected palette separately from the light/dark surface mode.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS color_theme text NOT NULL DEFAULT 'emerald'
  CHECK (color_theme IN ('emerald', 'ocean', 'sapphire', 'violet', 'orchid', 'rose', 'amber', 'copper', 'lime', 'graphite'));
