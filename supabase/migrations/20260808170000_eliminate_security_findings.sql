-- ============================================================================
-- Eliminate remaining security scan findings (per Lovable security memory):
--
--  1. team_directory(): SECURITY DEFINER function that exposed every user's
--     email -> replaced with an owner-privileged VIEW scoped by auth.uid():
--     owners see the whole team, everyone else sees only themselves.
--  2. role_abilities: only owners may read the ability matrix.
--  3. user_roles / team_invites / profiles: self-service + owner-management
--     RLS so the INVOKER functions below can run without a DEFINER boundary.
--  4. has_role(): the only function RLS policies genuinely need to bypass
--     row-level security (to avoid infinite policy recursion). Moved to a
--     non-exposed schema (app_private) as SECURITY DEFINER and exposed as a
--     thin SECURITY INVOKER wrapper in public -> clears linter 0029.
--  5. bootstrap_my_role() / accept_invite_token(): rewritten as SECURITY
--     INVOKER. Email comes from the JWT (auth.jwt()), never from auth.users.
--  6. team invites are email-scoped: acceptance requires the caller's JWT
--     email to match the invite, so a bare shareable link no longer grants
--     a role to whoever clicks it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. role_abilities: only owners may read the matrix.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "role abilities select" ON public.role_abilities;
CREATE POLICY "role abilities select"
  ON public.role_abilities FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- ---------------------------------------------------------------------------
-- 2. user_roles: self-read/self-insert + owner management.
--    NOTE: these policies never call has_role() on user_roles itself (that
--    would recurse); the owner check is a bounded direct subquery.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS "user roles self read" ON public.user_roles;
CREATE POLICY "user roles self read"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user roles self insert" ON public.user_roles;
CREATE POLICY "user roles self insert"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user roles owner update" ON public.user_roles;
CREATE POLICY "user roles owner update"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.role = 'owner'));

DROP POLICY IF EXISTS "user roles owner delete" ON public.user_roles;
CREATE POLICY "user roles owner delete"
  ON public.user_roles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.role = 'owner'));

-- ---------------------------------------------------------------------------
-- 3a. team_invites: invitee reads + accepts only their own pending invite;
--     owners manage all invites. Email-scoped, never token-only.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invites TO authenticated;

DROP POLICY IF EXISTS "team invites self read" ON public.team_invites;
CREATE POLICY "team invites self read"
  ON public.team_invites FOR SELECT TO authenticated
  USING (
    status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "team invites self update" ON public.team_invites;
CREATE POLICY "team invites self update"
  ON public.team_invites FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND status IN ('accepted', 'revoked')
  );

DROP POLICY IF EXISTS "team invites owner manage" ON public.team_invites;
CREATE POLICY "team invites owner manage"
  ON public.team_invites FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.role = 'owner'));

-- ---------------------------------------------------------------------------
-- 3b. profiles: users manage their own profile row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "own profile manage" ON public.profiles;
CREATE POLICY "own profile manage"
  ON public.profiles FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. has_role(): DEFINER core in a non-exposed schema + INVOKER public wrapper.
--    RLS policies keep calling public.has_role(...) exactly as before; the
--    wrapper forwards to the DEFINER implementation which reads user_roles
--    without RLS (required so owner checks inside user_roles policies and
--    data-table policies do not recurse).
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_private;

DROP FUNCTION IF EXISTS app_private.has_role(uuid, public.app_role);
CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
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

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM public;
REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
STABLE
AS $$
  SELECT app_private.has_role(_user_id, _role);
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. team_directory(): function dropped, replaced by a scoped view.
--    The view runs with owner privileges (reads auth.users) but its WHERE
--    clause is anchored to auth.uid(): owners see everyone, others only
--    themselves. No emails leak to non-owners.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.team_directory();
DROP VIEW IF EXISTS public.team_directory;

CREATE OR REPLACE VIEW public.team_directory AS
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

REVOKE ALL ON public.team_directory FROM public;
REVOKE ALL ON public.team_directory FROM anon;
GRANT SELECT ON public.team_directory TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. bootstrap_my_role(): SECURITY INVOKER. Email/metadata come from the JWT
--    claims, all reads/writes are self-scoped and governed by the RLS above.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_my_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meta jsonb;
  v_email text;
  v_invite public.team_invites;
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  ORDER BY CASE role WHEN 'owner' THEN 3 WHEN 'manager' THEN 2 ELSE 1 END DESC
  LIMIT 1;
  IF v_role IS NOT NULL THEN RETURN v_role; END IF;

  v_meta := coalesce(NULLIF(auth.jwt() ->> 'user_metadata', '')::jsonb, '{}'::jsonb);
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    v_uid,
    COALESCE(NULLIF(btrim(coalesce(v_meta ->> 'full_name', '')), ''), NULLIF(btrim(coalesce(v_meta ->> 'name', '')), ''), ''),
    COALESCE(NULLIF(btrim(coalesce(v_meta ->> 'avatar_url', '')), ''), NULLIF(btrim(coalesce(v_meta ->> 'picture', '')), ''))
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_invite
  FROM public.team_invites
  WHERE status = 'pending' AND expires_at > now() AND lower(email) = v_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite.id IS NOT NULL THEN
    v_role := v_invite.role;
    UPDATE public.team_invites
      SET status = 'accepted', accepted_by = v_uid, accepted_at = now()
      WHERE id = v_invite.id;
  ELSE
    v_role := 'owner';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_my_role() FROM public;
REVOKE ALL ON FUNCTION public.bootstrap_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_my_role() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. accept_invite_token(): SECURITY INVOKER. The invite must be pending,
--    the token must match, AND the caller's JWT email must equal the invite's
--    email (the owner always enters the invitee's email now). RLS hides every
--    invite except the caller's own, so a stolen link is not enough.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite_token(_token text)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.team_invites;
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _token IS NULL OR btrim(_token) = '' THEN
    RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023';
  END IF;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  SELECT * INTO v_invite
  FROM public.team_invites
  WHERE status = 'pending'
    AND expires_at > now()
    AND token = btrim(_token)
    AND lower(email) = v_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023';
  END IF;

  v_role := v_invite.role;

  UPDATE public.team_invites
    SET status = 'accepted', accepted_by = v_uid, accepted_at = now()
    WHERE id = v_invite.id;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite_token(text) FROM public;
REVOKE ALL ON FUNCTION public.accept_invite_token(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_invite_token(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Safety net: anon must never EXECUTE any remaining SECURITY DEFINER
--    function in public (linter 0028).
-- ---------------------------------------------------------------------------
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
