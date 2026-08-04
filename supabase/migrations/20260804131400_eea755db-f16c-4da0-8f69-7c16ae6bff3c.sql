CREATE TABLE public.archived_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  label text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archived_records TO authenticated;
GRANT ALL ON public.archived_records TO service_role;

ALTER TABLE public.archived_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own archive select" ON public.archived_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own archive insert" ON public.archived_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own archive update" ON public.archived_records FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own archive delete" ON public.archived_records FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX archived_records_user_deleted_idx ON public.archived_records (user_id, deleted_at DESC);