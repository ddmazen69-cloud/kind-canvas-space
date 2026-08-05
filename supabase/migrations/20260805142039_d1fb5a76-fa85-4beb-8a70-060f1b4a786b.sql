CREATE TABLE IF NOT EXISTS public.role_abilities (
  id uuid primary key default gen_random_uuid(),
  ability_key text not null,
  role text not null,
  allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ability_key, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_abilities TO authenticated;
GRANT ALL ON public.role_abilities TO service_role;
ALTER TABLE public.role_abilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read abilities" ON public.role_abilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "owners manage abilities" ON public.role_abilities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TABLE IF NOT EXISTS public.archive_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  retention_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_preferences TO authenticated;
GRANT ALL ON public.archive_preferences TO service_role;
ALTER TABLE public.archive_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own archive prefs" ON public.archive_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);