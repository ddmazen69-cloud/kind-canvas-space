-- Archive permissions and audit enhancements for owner/manager governance.
ALTER TABLE public.data_activity
  DROP CONSTRAINT IF EXISTS data_activity_action_check;

ALTER TABLE public.data_activity
  ADD CONSTRAINT data_activity_action_check
  CHECK (action IN ('backup', 'export', 'import', 'delete', 'restore', 'purge', 'bulk_restore', 'archive'));

INSERT INTO public.role_abilities (ability_key, role, allowed)
VALUES
  ('archive.view', 'owner', true),
  ('archive.view', 'manager', true),
  ('archive.view', 'seller', false),
  ('archive.restore', 'owner', true),
  ('archive.restore', 'manager', true),
  ('archive.restore', 'seller', false),
  ('archive.purge', 'owner', true),
  ('archive.purge', 'manager', false),
  ('archive.purge', 'seller', false)
ON CONFLICT (ability_key, role) DO NOTHING;

ALTER TABLE public.archived_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own archive select" ON public.archived_records;
DROP POLICY IF EXISTS "own archive insert" ON public.archived_records;
DROP POLICY IF EXISTS "own archive update" ON public.archived_records;
DROP POLICY IF EXISTS "own archive delete" ON public.archived_records;

CREATE POLICY "archive select with role"
  ON public.archived_records FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(_user_id := auth.uid(), _role := 'owner')
    OR (
      public.has_role(_user_id := auth.uid(), _role := 'manager')
      AND EXISTS (
        SELECT 1
        FROM public.role_abilities ra
        WHERE ra.ability_key = 'archive.view'
          AND ra.role = 'manager'
          AND ra.allowed = true
      )
    )
  );

CREATE POLICY "archive insert with role"
  ON public.archived_records FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(_user_id := auth.uid(), _role := 'owner')
  );

CREATE POLICY "archive update with role"
  ON public.archived_records FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(_user_id := auth.uid(), _role := 'owner')
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(_user_id := auth.uid(), _role := 'owner')
  );

CREATE POLICY "archive delete with role"
  ON public.archived_records FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(_user_id := auth.uid(), _role := 'owner')
  );

ALTER TABLE public.data_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own data activity" ON public.data_activity;

CREATE POLICY "archive audit select owner manager"
  ON public.data_activity FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(_user_id := auth.uid(), _role := 'owner')
    OR (
      public.has_role(_user_id := auth.uid(), _role := 'manager')
      AND EXISTS (
        SELECT 1
        FROM public.role_abilities ra
        WHERE ra.ability_key = 'archive.view'
          AND ra.role = 'manager'
          AND ra.allowed = true
      )
    )
  );

CREATE POLICY "archive audit insert owner manager"
  ON public.data_activity FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(_user_id := auth.uid(), _role := 'owner')
    OR (
      public.has_role(_user_id := auth.uid(), _role := 'manager')
      AND EXISTS (
        SELECT 1
        FROM public.role_abilities ra
        WHERE ra.ability_key = 'archive.restore'
          AND ra.role = 'manager'
          AND ra.allowed = true
      )
    )
  );
