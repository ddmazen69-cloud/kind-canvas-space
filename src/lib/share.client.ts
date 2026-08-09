import { supabase } from "@/integrations/supabase/client";

export interface ShareLinkRow {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

const REQUEST_TIMEOUT_MS = 10000;

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("استغرقت العملية وقتًا طويلًا — تأكد من اتصال الإنترنت ثم أعد المحاولة")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function explainError(error: { message?: string; code?: string } | null | undefined, action: string): Error {
  const raw = error?.message ?? "";
  if (/relation .* does not exist|PGRST205|PGRST301/i.test(raw)) {
    return new Error("ميزة المشاركة محتاجة تحديث قاعدة البيانات — أعد النشر من Lovable لتطبيق الـ migration (customer_share_links)");
  }
  if (/permission denied|row-level security|RLS|PGRST104/i.test(raw)) {
    return new Error("لا تملك صلاحية هذه العملية على الروابط");
  }
  if (action === "create" && /constraint|duplicate/i.test(raw)) {
    return new Error("فيه رابط مكرر — حاول مرة أخرى");
  }
  return new Error(raw || "حدث خطأ غير متوقع، حاول مرة أخرى");
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listShareLinksClient(customerId: string): Promise<ShareLinkRow[]> {
  const { data: links, error } = await withTimeout(
    supabase
      .from("customer_share_links")
      .select("id, token, created_at, expires_at, revoked_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  );
  if (error) throw explainError(error, "list");
  return (links ?? []).map((l) => ({
    id: l.id,
    token: l.token,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    revokedAt: l.revoked_at,
  }));
}

export async function createShareLinkClient(customerId: string, days: number) {
  const { data: { user } } = await withTimeout(supabase.auth.getUser());
  if (!user) throw new Error("سجّل الدخول أولاً");

  const { data: customer, error: customerErr } = await withTimeout(
    supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .maybeSingle(),
  );
  if (customerErr || !customer) {
    throw new Error("العميل ده مش موجود أو مش بتاعك");
  }

  const token = randomHex(24);
  const expiresAt = days > 0
    ? new Date(Date.now() + days * 86400000).toISOString()
    : null;

  const { data: link, error } = await withTimeout(
    supabase
      .from("customer_share_links")
      .insert({
        user_id: user.id,
        customer_id: customerId,
        token,
        expires_at: expiresAt,
      })
      .select("id, token, created_at, expires_at, revoked_at")
      .single(),
  );
  if (error) throw explainError(error, "create");

  return { id: link.id, token: link.token, expiresAt: link.expires_at };
}

export async function revokeShareLinkClient(id: string) {
  const { error } = await withTimeout(
    supabase
      .from("customer_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id),
  );
  if (error) throw explainError(error, "update");
  return { ok: true };
}

export async function deleteShareLinkClient(id: string) {
  const { error } = await withTimeout(
    supabase
      .from("customer_share_links")
      .delete()
      .eq("id", id),
  );
  if (error) throw explainError(error, "delete");
  return { ok: true };
}
