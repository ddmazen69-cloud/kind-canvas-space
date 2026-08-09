import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUTO_BACKUP_WEBHOOK_SECRET = Deno.env.get("AUTO_BACKUP_WEBHOOK_SECRET");

const BACKUP_TABLES = [
  "customers", "suppliers", "invoices", "invoice_items", "payments",
  "purchases", "purchase_items", "supplier_payments", "stock_items",
  "stock_adjustments", "expenses", "shop_settings",
] as const;

const stamp = () => new Date().toISOString().slice(0, 10);
const safeName = (name: string) =>
  name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60) || "segilly-backup";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    ab,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, bb));
  return sig.every((byte, i) => byte === ab[i]);
}

async function runAutoBackups() {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings, error } = await supabaseAdmin
    .from("backup_settings")
    .select("user_id, enabled, frequency_days, name_template, last_run_at")
    .eq("enabled", true);
  if (error) throw new Error(error.message);

  const now = Date.now();
  let processed = 0;

  for (const setting of settings ?? []) {
    const due = !setting.last_run_at ||
      now - new Date(setting.last_run_at).getTime() >= setting.frequency_days * 86400000 - 60000;
    if (!due) continue;

    const tables: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { data } = await supabaseAdmin.from(table).select("*").eq("user_id", setting.user_id);
      tables[table] = data ?? [];
    }

    const payload = { app: "segilly", version: 1, exportedAt: new Date().toISOString(), tables };
    const path = `${setting.user_id}/${safeName(setting.name_template)}-${stamp()}.json`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("backups")
      .upload(path, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), { upsert: true });

    if (uploadError) {
      console.error("auto-backup upload failed", setting.user_id, uploadError.message);
      continue;
    }

    await supabaseAdmin.from("backup_settings").update({ last_run_at: new Date().toISOString() }).eq("user_id", setting.user_id);
    await supabaseAdmin.from("data_activity").insert({
      user_id: setting.user_id,
      action: "backup",
      details: `نسخة احتياطية تلقائية: ${path.split("/").pop()}`,
      actor: "النظام (تلقائي)",
    });
    processed += 1;
  }

  return processed;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = AUTO_BACKUP_WEBHOOK_SECRET;
  if (!secret) return json({ error: "not_configured" }, 503);

  const provided = req.headers.get("x-backup-secret") ?? "";
  if (!(await safeEqual(provided, secret))) return json({ error: "unauthorized" }, 401);

  try {
    const processed = await runAutoBackups();
    return json({ success: true, processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    return json({ success: false, error: message }, 500);
  }
});
