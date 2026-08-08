import { supabase } from "@/integrations/supabase/client";

export interface ShareLinkRow {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listShareLinksClient(customerId: string): Promise<ShareLinkRow[]> {
  const { data: links, error } = await supabase
    .from("customer_share_links")
    .select("id, token, created_at, expires_at, revoked_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (links ?? []).map((l) => ({
    id: l.id,
    token: l.token,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    revokedAt: l.revoked_at,
  }));
}

export async function createShareLinkClient(customerId: string, days: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("سجّل الدخول أولاً");

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  if (customerErr || !customer) {
    throw new Error("العميل ده مش موجود أو مش بتاعك");
  }

  const token = randomHex(24);
  const expiresAt = days > 0
    ? new Date(Date.now() + days * 86400000).toISOString()
    : null;

  const { data: link, error } = await supabase
    .from("customer_share_links")
    .insert({
      user_id: user.id,
      customer_id: customerId,
      token,
      expires_at: expiresAt,
    })
    .select("id, token, created_at, expires_at, revoked_at")
    .single();
  if (error) throw new Error(error.message);

  return { id: link.id, token: link.token, expiresAt: link.expires_at };
}

export async function revokeShareLinkClient(id: string) {
  const { error } = await supabase
    .from("customer_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteShareLinkClient(id: string) {
  const { error } = await supabase
    .from("customer_share_links")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
