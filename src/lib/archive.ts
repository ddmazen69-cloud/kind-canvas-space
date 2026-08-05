import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ArchiveEntity = "customer" | "invoice" | "supplier" | "stock_item" | "expense";

export type ArchivedRecord = {
  id: string;
  entityType: ArchiveEntity;
  entityId: string;
  label: string;
  summary: string;
  amount: number;
  payload: any;
  deletedAt: string;
};

export type ArchiveAccess = {
  role: string;
  canView: boolean;
  canRestore: boolean;
  canPurge: boolean;
  isOwner: boolean;
};

export type ArchiveAuditEntry = {
  id: string;
  action: string;
  details: string;
  actor: string;
  createdAt: string;
};

export type ArchiveRetentionDays = 0 | 30 | 90 | 180;

export const ENTITY_LABELS: Record<ArchiveEntity, string> = {
  customer: "عميل",
  invoice: "فاتورة",
  supplier: "مورد",
  stock_item: "صنف مخزن",
  expense: "مصروف",
};

const TABLE: Record<ArchiveEntity, "customers" | "invoices" | "suppliers" | "stock_items" | "expenses"> = {
  customer: "customers",
  invoice: "invoices",
  supplier: "suppliers",
  stock_item: "stock_items",
  expense: "expenses",
};

function fmt(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(n);
}

async function describe(entity: ArchiveEntity, row: any): Promise<{ label: string; summary: string; amount: number }> {
  switch (entity) {
    case "customer":
      return { label: row.name ?? "عميل", summary: row.phone ?? "", amount: Number(row.opening_balance ?? 0) };
    case "supplier":
      return { label: row.name ?? "مورد", summary: row.contact ?? "", amount: Number(row.opening_balance ?? 0) };
    case "stock_item":
      return {
        label: row.name ?? "صنف",
        summary: `الكمية ${fmt(Number(row.quantity ?? 0))} · سعر البيع ${fmt(Number(row.sale_price ?? 0))}`,
        amount: Number(row.sale_price ?? 0) * Number(row.quantity ?? 0),
      };
    case "expense":
      return { label: row.category ?? "مصروف", summary: row.notes ?? row.expense_date ?? "", amount: Number(row.amount ?? 0) };
    case "invoice": {
      const { data: cust } = await supabase.from("customers").select("name").eq("id", row.customer_id).maybeSingle();
      return {
        label: cust?.name ? `فاتورة ${cust.name}` : "فاتورة",
        summary: `مدفوع ${fmt(Number(row.paid ?? 0))} من ${fmt(Number(row.total ?? 0))}`,
        amount: Number(row.total ?? 0),
      };
    }
  }
}

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("مش مسجّل دخول");
  return user.id;
}

async function currentActorName() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "المستخدم الحالي";
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return profile?.display_name || user.email || "المستخدم الحالي";
}

async function logArchiveActivity(action: "restore" | "purge" | "bulk_restore" | "archive", details: string, reason?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const actor = await currentActorName();
  const finalDetails = reason ? `${details} | السبب: ${reason}` : details;
  await supabase.from("data_activity").insert({ user_id: user.id, action, details: finalDetails, actor });
}

/** Snapshot an entity (and its children) before deletion. A failed snapshot blocks deletion. */
export async function archiveBeforeDelete(entity: ArchiveEntity, id: string) {
  const { data: row, error: readError } = await supabase.from(TABLE[entity]).select("*").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("السجل غير موجود أو لا تملك صلاحية أرشفته");
  const payload: any = { row };
  if (entity === "invoice") {
    const [{ data: items, error: itemsError }, { data: pays, error: paysError }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", id),
      supabase.from("payments").select("*").eq("invoice_id", id),
    ]);
    if (itemsError) throw itemsError;
    if (paysError) throw paysError;
    payload.invoice_items = items ?? [];
    payload.payments = pays ?? [];
  }
  const meta = await describe(entity, row);
  const { error } = await supabase.from("archived_records").insert({ user_id: (row as any).user_id, entity_type: entity, entity_id: id, label: meta.label, summary: meta.summary, amount: meta.amount, payload });
  if (error) throw error;
}

export async function getArchiveAccess(): Promise<ArchiveAccess> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { role: "guest", canView: false, canRestore: false, canPurge: false, isOwner: false };
  }

  const [{ data: userRoleData }, { data: abilityData }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("role_abilities").select("ability_key, allowed").eq("role", "owner"),
  ]);

  const role = userRoleData?.[0]?.role ?? "owner";
  const isOwner = role === "owner";
  const ownerAbilities = abilityData ?? [];
  const canView = isOwner || ownerAbilities.some((item) => item.ability_key === "archive.view" && item.allowed);
  const canRestore = isOwner || ownerAbilities.some((item) => item.ability_key === "archive.restore" && item.allowed);
  const canPurge = isOwner || ownerAbilities.some((item) => item.ability_key === "archive.purge" && item.allowed);

  return { role, canView, canRestore, canPurge, isOwner };
}

export async function restoreArchived(rec: ArchivedRecord, reason?: string) {
  const table = TABLE[rec.entityType];
  const { row, invoice_items, payments } = rec.payload ?? {};
  if (!row) throw new Error("لا توجد بيانات محفوظة لهذا العنصر");

  if (rec.entityType === "invoice") {
    const { data: cust } = await supabase.from("customers").select("id").eq("id", row.customer_id).maybeSingle();
    if (!cust) throw new Error("لا يمكن استرجاع الفاتورة: العميل نفسه محذوف — استرجع العميل أولًا");
  }

  const upsertPayload = { ...row };
  const { error } = await supabase.from(table).upsert(upsertPayload as any, { onConflict: "id" });
  if (error) throw error;

  if (rec.entityType === "invoice") {
    if (invoice_items?.length) {
      await supabase.from("invoice_items").upsert(invoice_items as any, { onConflict: "id" });
    }
    if (payments?.length) {
      await supabase.from("payments").upsert(payments as any, { onConflict: "id" });
    }
  }
  await supabase.from("archived_records").delete().eq("id", rec.id);
  await logArchiveActivity("restore", `استرجاع ${ENTITY_LABELS[rec.entityType]}: ${rec.label}`, reason);
}

export async function restoreMany(records: ArchivedRecord[], reason?: string) {
  let restored = 0;
  const failed: string[] = [];
  for (const record of records) {
    try { await restoreArchived(record, reason); restored++; }
    catch { failed.push(record.label); }
  }
  if (restored > 0) await logArchiveActivity("bulk_restore", `استرجاع جماعي لـ ${restored} سجل`, reason);
  return { restored, failed };
}

export async function purgeArchived(id: string, reason?: string) {
  const { error } = await supabase.from("archived_records").delete().eq("id", id);
  if (error) throw error;
  await logArchiveActivity("purge", "مسح نهائي للسجل المؤرشف", reason);
}

export async function purgeAllArchived(entity?: ArchiveEntity, reason?: string) {
  let q = supabase.from("archived_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (entity) q = q.eq("entity_type", entity);
  const { error } = await q;
  if (error) throw error;
  await logArchiveActivity("purge", `مسح نهائي جماعي${entity ? ` لـ ${ENTITY_LABELS[entity]}` : " للأرشيف"}`, reason);
}

export async function getArchiveRetention() {
  const userId = await currentUserId();
  const { data, error } = await supabase.from("archive_preferences").select("retention_days").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data?.retention_days ?? 0) as ArchiveRetentionDays;
}

export async function saveArchiveRetention(days: ArchiveRetentionDays) {
  const userId = await currentUserId();
  const { error } = await supabase.from("archive_preferences").upsert({ user_id: userId, retention_days: days, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function applyArchiveRetention(days: ArchiveRetentionDays) {
  if (!days) return 0;
  const userId = await currentUserId();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { count, error } = await supabase.from("archived_records").delete({ count: "exact" }).eq("user_id", userId).lt("deleted_at", cutoff);
  if (error) throw error;
  if (count) await logArchiveActivity("purge", `تطبيق سياسة الاحتفاظ وحذف ${count} سجل مؤرشف تجاوز ${days} يومًا`);
  return count ?? 0;
}

export async function getArchiveAuditLog() {
  const { data, error } = await supabase
    .from("data_activity")
    .select("id, action, details, actor, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    id: item.id,
    action: item.action,
    details: item.details,
    actor: item.actor,
    createdAt: item.created_at,
  })) as ArchiveAuditEntry[];
}

export function useArchive() {
  const [records, setRecords] = useState<ArchivedRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const retention = await getArchiveRetention();
      await applyArchiveRetention(retention);
    } catch {
      // The archive remains available even if retention preferences have not migrated yet.
    }
    const { data } = await supabase
      .from("archived_records")
      .select("*")
      .order("deleted_at", { ascending: false });
    setRecords(
      (data ?? []).map((r: any) => ({
        id: r.id,
        entityType: r.entity_type as ArchiveEntity,
        entityId: r.entity_id,
        label: r.label,
        summary: r.summary,
        amount: Number(r.amount ?? 0),
        payload: r.payload,
        deletedAt: r.deleted_at,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { records, loading, refresh };
}
