CREATE TABLE public.backup_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency_days integer NOT NULL DEFAULT 1,
  name_template text NOT NULL DEFAULT 'segilly-backup',
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_settings TO authenticated;
GRANT ALL ON public.backup_settings TO service_role;

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own backup settings" ON public.backup_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER backup_settings_set_updated_at
BEFORE UPDATE ON public.backup_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();