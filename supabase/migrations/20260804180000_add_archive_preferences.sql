CREATE TABLE IF NOT EXISTS public.archive_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  retention_days integer NOT NULL DEFAULT 0 CHECK (retention_days IN (0, 30, 90, 180)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archive_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own archive preferences" ON public.archive_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
