-- =============================================================
-- Security hardening — resolves database linter findings in order:
-- 1. role_abilities: only owners read the full matrix; other roles
--    can only read their own role's rows (no full disclosure).
-- 2. team_invites: invitees can read their own pending invite.
-- 3. anon can no longer EXECUTE any SECURITY DEFINER function.
-- 4. has_role / team_directory tightened so non-owners cannot probe
--    other users' roles or enumerate the whole team directory.
-- =============================================================

-- ---------- 1. role_abilities SELECT ----------
DROP POLICY IF EXISTS "role abilities select" ON public.role_abilities;
CREATE POLICY "role abilities select"
  ON public.role_abilities FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), (role)::public.app_role)
  );

-- ---------- 2. team_invites: invitee reads own pending invite ----------
DROP POLICY IF EXISTS "team invites self read" ON public.team_invites;
CREATE POLICY "team invites self read"
  ON public.team_invites FOR SELECT TO authenticated
  USING (
    status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ---------- 3. revoke anon EXECUTE on every SECURITY DEFINER fn ----------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- ---------- 4a. has_role: self-checks for everyone, owner may check others ----------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
        AND (
          _user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles me
            WHERE me.user_id = auth.uid() AND me.role = 'owner'
          )
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- ---------- 4b. team_directory: owners see everyone, others only themselves ----------
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
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles me
        WHERE me.user_id = auth.uid() AND me.role = 'owner'
      )
      OR ur.user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.team_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.team_directory() TO authenticated;

-- ---------- 4c. accept_invite_token / bootstrap_my_role: authenticated only ----------
REVOKE EXECUTE ON FUNCTION public.accept_invite_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_invite_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_my_role() TO authenticated;
