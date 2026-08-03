CREATE OR REPLACE FUNCTION public.bootstrap_my_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.team_invites;
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid
  ORDER BY CASE role WHEN 'owner' THEN 3 WHEN 'manager' THEN 2 ELSE 1 END DESC LIMIT 1;
  IF v_role IS NOT NULL THEN RETURN v_role; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.profiles (id, display_name, avatar_url)
  SELECT v_uid,
         COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''),
         COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture')
  FROM auth.users WHERE id = v_uid
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_invite
  FROM public.team_invites
  WHERE status = 'pending' AND lower(email) = lower(v_email) AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

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

GRANT EXECUTE ON FUNCTION public.bootstrap_my_role() TO authenticated;

-- Backfill: any existing account without a role becomes owner
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'owner'::public.app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;