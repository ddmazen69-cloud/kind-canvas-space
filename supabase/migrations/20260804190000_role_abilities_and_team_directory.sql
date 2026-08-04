-- Configurable role abilities (owner can toggle what manager/seller may see).
CREATE TABLE IF NOT EXISTS public.role_abilities (
  ability_key text NOT NULL,
  role public.app_role NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ability_key, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_abilities TO authenticated;
GRANT ALL ON public.role_abilities TO service_role;

ALTER TABLE public.role_abilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role abilities select" ON public.role_abilities;
CREATE POLICY "role abilities select"
  ON public.role_abilities FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "role abilities write owner" ON public.role_abilities;
CREATE POLICY "role abilities write owner"
  ON public.role_abilities FOR ALL TO authenticated
  USING (public.has_role(_user_id := auth.uid(), _role := 'owner'))
  WITH CHECK (public.has_role(_user_id := auth.uid(), _role := 'owner') AND role <> 'owner');

-- Seed defaults matching the previous static matrix.
INSERT INTO public.role_abilities (ability_key, role, allowed) VALUES
  ('sales', 'owner', true),
  ('sales', 'manager', true),
  ('sales', 'seller', true),
  ('customers', 'owner', true),
  ('customers', 'manager', true),
  ('customers', 'seller', false),
  ('operations', 'owner', true),
  ('operations', 'manager', true),
  ('operations', 'seller', false),
  ('reports', 'owner', true),
  ('reports', 'manager', true),
  ('reports', 'seller', false),
  ('shop_settings', 'owner', true),
  ('shop_settings', 'manager', false),
  ('shop_settings', 'seller', false),
  ('manage_team', 'owner', true),
  ('manage_team', 'manager', false),
  ('manage_team', 'seller', false)
ON CONFLICT (ability_key, role) DO NOTHING;

-- Owner abilities are always allowed.
UPDATE public.role_abilities SET allowed = true, updated_at = now() WHERE role = 'owner';

-- Team directory: resolve real display name + avatar from profiles, then auth metadata.
DROP FUNCTION IF EXISTS public.team_directory();
CREATE OR REPLACE FUNCTION public.team_directory()
RETURNS TABLE (
  user_id uuid,
  role public.app_role,
  display_name text,
  avatar_url text,
  last_seen_at timestamptz,
  email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    ur.user_id,
    ur.role,
    COALESCE(
      NULLIF(btrim(p.display_name), ''),
      NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(btrim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
      'مستخدم'
    ) AS display_name,
    NULLIF(
      COALESCE(
        NULLIF(btrim(COALESCE(p.avatar_url, '')), ''),
        NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), ''),
        NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'picture', '')), '')
      ),
      ''
    ) AS avatar_url,
    COALESCE(u.last_sign_in_at, p.updated_at, ur.created_at) AS last_seen_at,
    u.email::text AS email
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.team_directory() TO authenticated;

-- Backfill empty profiles from auth metadata so the team list has names/photos.
INSERT INTO public.profiles (id, display_name, avatar_url)
SELECT
  u.id,
  COALESCE(
    NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    ''
  ),
  COALESCE(
    NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), ''),
    NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'picture', '')), '')
  )
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET
  display_name = CASE
    WHEN NULLIF(btrim(public.profiles.display_name), '') IS NULL
      THEN EXCLUDED.display_name
    ELSE public.profiles.display_name
  END,
  avatar_url = CASE
    WHEN NULLIF(btrim(COALESCE(public.profiles.avatar_url, '')), '') IS NULL
      THEN EXCLUDED.avatar_url
    ELSE public.profiles.avatar_url
  END;
