import { supabase } from "@/integrations/supabase/client";

export type ReturnKind = "sale" | "supplier";

export interface ReturnItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ReturnEntry {
  id: string;
  kind: ReturnKind;
  invoiceId: string | null;
  supplierId: string | null;
  items: ReturnItem[];
  total: number;
  reason: string | null;
  returnedAt: string;
  createdAt: string;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function mapRow(row: Record<string, unknown>): ReturnEntry {
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const items: ReturnItem[] = rawItems.map((it: any) => ({
    name: String(it?.name ?? ""),
    quantity: num(it?.quantity, 0),
    unitPrice: num(it?.unitPrice, 0),
    amount: num(it?.amount, 0),
  }));
  return {
    id: String(row.id ?? ""),
    kind: row.kind === "supplier" ? "supplier" : "sale",
    invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    items,
    total: num(row.total, 0),
    reason: row.reason ? String(row.reason) : null,
    returnedAt: String(row.returned_at ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export async function fetchReturns(): Promise<ReturnEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("returns")
    .select("*")
    .order("returned_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function createReturn(input: {
  kind: ReturnKind;
  invoiceId: string | null;
  supplierId: string | null;
  items: ReturnItem[];
  total: number;
  reason: string | null;
  returnedAt: string;
}): Promise<ReturnEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("تسجيل الدخول مطلوب أولًا");
  const { data, error } = await supabase
    .from("returns")
    .insert({
      user_id: user.id,
      kind: input.kind,
      invoice_id: input.invoiceId,
      supplier_id: input.supplierId,
      items: input.items as unknown as import("@/integrations/supabase/types").Json,
      total: input.total,
      reason: input.reason,
      returned_at: input.returnedAt,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteReturn(id: string): Promise<void> {
  const { error } = await supabase.from("returns").delete().eq("id", id);
  if (error) throw error;
}
