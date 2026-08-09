-- ============================================================================
-- returns: سجل المرتجعات (مرتجع بيع على فاتورة / مرتجع شراء لمورد).
--
-- الأمان:
--  - RLS على المالك فقط (auth.uid() = user_id) — كل صف ملك صاحبه.
--  - لا دوال SECURITY DEFINER جديدة ولا GRANT خارج authenticated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sale', 'supplier')),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  reason text,
  returned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS returns_user_idx
  ON public.returns (user_id, returned_at DESC);
CREATE INDEX IF NOT EXISTS returns_invoice_idx
  ON public.returns (invoice_id);
CREATE INDEX IF NOT EXISTS returns_supplier_idx
  ON public.returns (supplier_id);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.returns TO authenticated;

-- المالك فقط يدير مرتجعاته.
DROP POLICY IF EXISTS "returns owner all" ON public.returns;
CREATE POLICY "returns owner all"
  ON public.returns
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.returns FROM public;
REVOKE ALL ON public.returns FROM anon;
