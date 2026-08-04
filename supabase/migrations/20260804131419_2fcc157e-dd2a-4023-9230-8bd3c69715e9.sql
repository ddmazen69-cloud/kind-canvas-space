CREATE TABLE public.data_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  details text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_activity TO authenticated;
GRANT ALL ON public.data_activity TO service_role;

ALTER TABLE public.data_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own activity select" ON public.data_activity FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own activity insert" ON public.data_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own activity delete" ON public.data_activity FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX data_activity_user_created_idx ON public.data_activity (user_id, created_at DESC);