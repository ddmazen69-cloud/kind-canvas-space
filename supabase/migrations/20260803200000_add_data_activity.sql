CREATE TABLE IF NOT EXISTS public.data_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('backup', 'export', 'import', 'delete')),
  details text NOT NULL,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_activity_user_created_idx ON public.data_activity (user_id, created_at DESC);
ALTER TABLE public.data_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own data activity" ON public.data_activity FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
