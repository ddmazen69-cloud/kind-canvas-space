import { supabase } from "@/integrations/supabase/client";

export const DATA_TABLES = ["customers", "suppliers", "invoices", "invoice_items", "payments", "purchases", "purchase_items", "supplier_payments", "stock_items", "stock_adjustments", "expenses"] as const;
const BACKUP_TABLES = [...DATA_TABLES, "shop_settings"] as const;
const IMPORT_ORDER = ["customers", "suppliers", "stock_items", "invoices", "invoice_items", "payments", "purchases", "purchase_items", "supplier_payments", "stock_adjustments", "expenses", "shop_settings"] as const;
const DELETE_ORDER = ["payments", "invoice_items", "invoices", "purchase_items", "purchases", "supplier_payments", "stock_adjustments", "stock_items", "expenses", "customers", "suppliers"] as const;

export type DataTable = (typeof BACKUP_TABLES)[number];
export type BackupPayload = { app: "segilly"; version: 1; exportedAt: string; tables: Record<string, unknown[]> };
export type ExportOptions = { tables?: string[]; from?: string; to?: string };
export type ActivityEntry = { id: string; type: "backup" | "export" | "import" | "delete" | "setting"; details: string; actor: string; at: string };
const stamp = () => new Date().toISOString().slice(0, 10);

async function currentUser() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("مش مسجّل دخول"); return user; }
function rowDate(row: Record<string, unknown>) { const value = row.updated_at ?? row.created_at ?? row.purchase_date ?? row.expense_date ?? row.paid_at; return typeof value === "string" ? value.slice(0, 10) : null; }
function withinRange(row: unknown, options: ExportOptions) { if (!options.from && !options.to) return true; if (!row || typeof row !== "object") return true; const date = rowDate(row as Record<string, unknown>); if (!date) return true; return (!options.from || date >= options.from) && (!options.to || date <= options.to); }

export async function buildBackup(options: ExportOptions = {}): Promise<BackupPayload> {
  const user = await currentUser(); const selected = new Set(options.tables?.length ? options.tables : BACKUP_TABLES); const tables: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) { if (!selected.has(table)) continue; const { data, error } = await supabase.from(table).select("*").eq("user_id", user.id); if (error) throw error; tables[table] = (data ?? []).filter((row) => withinRange(row, options)); }
  return { app: "segilly", version: 1, exportedAt: new Date().toISOString(), tables };
}
export function downloadBlob(content: BlobPart, filename: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
export async function downloadJsonBackup(options: ExportOptions = {}) { const backup = await buildBackup(options); downloadBlob(JSON.stringify(backup, null, 2), `segilly-backup-${stamp()}.json`, "application/json"); return backup; }
export async function downloadExcelBackup(options: ExportOptions = {}) { const [{ utils, write }, backup] = await Promise.all([import("xlsx"), buildBackup(options)]); const workbook = utils.book_new(); for (const [name, rows] of Object.entries(backup.tables)) utils.book_append_sheet(workbook, utils.json_to_sheet(rows.length ? rows as object[] : [{}]), name.slice(0, 31)); const output = write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer; downloadBlob(output, `segilly-backup-${stamp()}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); return backup; }
export async function uploadJsonBackupToStorage(options: ExportOptions = {}) {
  const user = await currentUser();
  const backup = await buildBackup(options);
  const filename = `segilly-backup-${stamp()}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const path = `${user.id}/${filename}`;
  const { error } = await supabase.storage.from("backups").upload(path, blob, { upsert: true });
  if (error) throw error;
  return { path, filename, backup };
}
export async function dataCounts(): Promise<Record<string, number>> { const user = await currentUser(); const entries = await Promise.all(DATA_TABLES.map(async (table) => { const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id); if (error) throw error; return [table, count ?? 0] as const; })); return Object.fromEntries(entries); }
export async function dataMeta() { const user = await currentUser(); const backup = await buildBackup(); const bytes = new TextEncoder().encode(JSON.stringify(backup)).byteLength; let newest = ""; for (const rows of Object.values(backup.tables)) for (const row of rows) { const date = row && typeof row === "object" ? rowDate(row as Record<string, unknown>) : null; if (date && date > newest) newest = date; } return { bytes, latest: newest || null, userId: user.id }; }
export async function getActivity(): Promise<ActivityEntry[]> { const user = await currentUser(); const { data, error } = await supabase.from("data_activity").select("id, action, details, actor, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30); if (error) throw error; return (data ?? []).map((entry) => ({ id: entry.id, type: entry.action as ActivityEntry["type"], details: entry.details, actor: entry.actor, at: entry.created_at })); }
export async function logActivity(type: ActivityEntry["type"], details: string) { const user = await currentUser(); const { data, error } = await supabase.from("data_activity").insert({ user_id: user.id, action: type, details, actor: user.email ?? "المستخدم الحالي" }).select("id, action, details, actor, created_at").single(); if (error) throw error; return { id: data.id, type: data.action as ActivityEntry["type"], details: data.details, actor: data.actor, at: data.created_at }; }
export async function readImportFile(file: File): Promise<BackupPayload> { let parsed: unknown; if (file.name.toLowerCase().endsWith(".json")) parsed = JSON.parse(await file.text()); else if (/\.(xlsx|xls)$/i.test(file.name)) { const { read, utils } = await import("xlsx"); const workbook = read(await file.arrayBuffer(), { type: "array" }); parsed = { app: "segilly", version: 1, exportedAt: new Date().toISOString(), tables: Object.fromEntries(workbook.SheetNames.filter((name) => BACKUP_TABLES.includes(name as DataTable)).map((name) => [name, utils.sheet_to_json(workbook.Sheets[name], { defval: null })])) }; } else throw new Error("اختر ملف JSON أو Excel"); if (!parsed || typeof parsed !== "object") throw new Error("الملف غير صالح"); const candidate = parsed as Partial<BackupPayload>; if (!candidate.tables || typeof candidate.tables !== "object") throw new Error("لم نجد بيانات قابلة للاستيراد في الملف"); const tables = Object.fromEntries(Object.entries(candidate.tables).filter(([name, rows]) => BACKUP_TABLES.includes(name as DataTable) && Array.isArray(rows))); if (!Object.keys(tables).length) throw new Error("الملف لا يحتوي على جداول النظام"); return { app: "segilly", version: 1, exportedAt: candidate.exportedAt ?? new Date().toISOString(), tables }; }
const ARCHIVE_ENTITY_BY_TABLE: Partial<Record<DataTable, "customer" | "invoice" | "supplier" | "stock_item" | "expense">> = {
  customers: "customer",
  invoices: "invoice",
  suppliers: "supplier",
  stock_items: "stock_item",
  expenses: "expense",
};

export async function importBackup(backup: BackupPayload, selected: string[]) {
  const user = await currentUser();
  let imported = 0;
  for (const table of IMPORT_ORDER) {
    if (!selected.includes(table)) continue;
    const rows = (backup.tables[table] ?? []).filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
    if (!rows.length) continue;
    const safeRows: Record<string, unknown>[] = rows.map(({ user_id: _userId, ...row }) => ({ ...row, user_id: user.id }));
    const { error } = await supabase.from(table).upsert(safeRows as never, { onConflict: "id" });
    if (error) throw new Error(`تعذر استيراد ${table}: ${error.message}`);

    const archiveEntity = ARCHIVE_ENTITY_BY_TABLE[table as DataTable];
    if (archiveEntity) {
      for (const row of safeRows) {
        const rowId = typeof row.id === "string" ? row.id : null;
        if (!rowId) continue;
        await supabase.from("archived_records").delete().eq("entity_type", archiveEntity).eq("entity_id", rowId);
      }
    }

    imported += rows.length;
  }
  return imported;
}
export async function wipeAllData() { const user = await currentUser(); let deleted = 0; for (const table of DELETE_ORDER) { const { count, error } = await supabase.from(table).delete({ count: "exact" }).eq("user_id", user.id); if (error) throw error; deleted += count ?? 0; } return deleted; }

/* ------------------------- تسمية النسخ والنسخ التلقائي ------------------------- */
export type BackupSettings = { enabled: boolean; frequencyDays: number; nameTemplate: string; lastRunAt: string | null };
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { enabled: false, frequencyDays: 1, nameTemplate: "segilly-backup", lastRunAt: null };
export const FREQUENCY_OPTIONS = [
  { days: 1, label: "كل يوم" },
  { days: 2, label: "كل يومين" },
  { days: 7, label: "كل أسبوع" },
  { days: 14, label: "كل أسبوعين" },
  { days: 30, label: "كل شهر" },
] as const;

export function safeBackupName(name: string | undefined, fallback = "segilly-backup") {
  const cleaned = (name ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60);
  return cleaned || fallback;
}
export function backupFileName(name: string | undefined, ext: "json" | "xlsx") {
  return `${safeBackupName(name)}-${stamp()}.${ext}`;
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const user = await currentUser();
  const { data, error } = await supabase.from("backup_settings").select("enabled, frequency_days, name_template, last_run_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_BACKUP_SETTINGS;
  return { enabled: data.enabled, frequencyDays: data.frequency_days, nameTemplate: data.name_template, lastRunAt: data.last_run_at };
}
export async function saveBackupSettings(settings: Omit<BackupSettings, "lastRunAt">) {
  const user = await currentUser();
  const { error } = await supabase.from("backup_settings").upsert({
    user_id: user.id,
    enabled: settings.enabled,
    frequency_days: settings.frequencyDays,
    name_template: safeBackupName(settings.nameTemplate),
  }, { onConflict: "user_id" });
  if (error) throw error;
}
export function nextBackupAt(settings: BackupSettings) {
  if (!settings.enabled) return null;
  const base = settings.lastRunAt ? new Date(settings.lastRunAt) : new Date();
  return new Date(base.getTime() + settings.frequencyDays * 86400000);
}
export type CloudBackup = { name: string; path: string; size: number; createdAt: string };
export async function listCloudBackups(): Promise<CloudBackup[]> {
  const user = await currentUser();
  const { data, error } = await supabase.storage.from("backups").list(user.id, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  return (data ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder").map((f) => ({
    name: f.name,
    path: `${user.id}/${f.name}`,
    size: (f.metadata as { size?: number } | null)?.size ?? 0,
    createdAt: f.created_at ?? new Date().toISOString(),
  }));
}
export async function downloadCloudBackup(path: string) {
  const { data, error } = await supabase.storage.from("backups").download(path);
  if (error) throw error;
  downloadBlob(await data.arrayBuffer(), path.split("/").pop() ?? "backup.json", "application/json");
}
export async function deleteCloudBackup(path: string) {
  const { error } = await supabase.storage.from("backups").remove([path]);
  if (error) throw error;
}
