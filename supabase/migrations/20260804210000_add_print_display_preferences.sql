-- Print display preferences keep invoices and reports configurable per shop.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS print_show_logo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_show_tax_number boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_show_footer_note boolean NOT NULL DEFAULT true;
