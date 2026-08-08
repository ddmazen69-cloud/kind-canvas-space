-- ============================================================================
-- customer_share_links: روابط عرض كشف حساب العميل (مشاركة عامة).
--
-- الأمان:
--  - الـ token هو «المفتاح» الوحيد: يُولَّد بقوة عالية في السيرفر (randomBytes)
--    ولا يُنقل أبداً للعميل قبل إنشائه، ويستخدم كـ capability فقط.
--  - RLS على المالك فقط (auth.uid() = user_id): القفل التام على anon.
--  - القراءة العامة بتتم من Server Function بـ supabaseAdmin (مثل
--    team.functions.ts) مع فحص revoked_at / expires_at، وترجع بيانات
--    العميل الواحد المرتبط بالتوكن فقط — بدون user_id أو بيانات مستخدمين آخرين.
--  - لا GRANT لأي دور خارج authenticated؛ ولا دوال SECURITY DEFINER جديدة.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT customer_share_links_token_not_blank CHECK (btrim(token) <> ''),
  CONSTRAINT customer_share_links_token_min_length CHECK (char_length(token) >= 32)
);

CREATE INDEX IF NOT EXISTS customer_share_links_customer_idx
  ON public.customer_share_links (customer_id);
CREATE INDEX IF NOT EXISTS customer_share_links_token_idx
  ON public.customer_share_links (token);

ALTER TABLE public.customer_share_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_share_links TO authenticated;

-- المالك فقط يدير روابطه.
DROP POLICY IF EXISTS "customer share links owner all" ON public.customer_share_links;
CREATE POLICY "customer share links owner all"
  ON public.customer_share_links
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ضمان ألا يقرأ أحد من خارج تطبيقنا هذه البيانات عبر RLS.
REVOKE ALL ON public.customer_share_links FROM public;
REVOKE ALL ON public.customer_share_links FROM anon;
