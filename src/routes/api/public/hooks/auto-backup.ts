import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const BACKUP_TABLES = [
  "customers", "suppliers", "invoices", "invoice_items", "payments",
  "purchases", "purchase_items", "supplier_payments", "stock_items",
  "stock_adjustments", "expenses", "shop_settings",
] as const;

const stamp = () => new Date().toISOString().slice(0, 10);
const safeName = (name: string) =>
  name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60) || "segilly-backup";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function runAutoBackups() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

export const Route = createFileRoute("/api/public/hooks/auto-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["AUTO_BACKUP_WEBHOOK_SECRET"];
        if (!secret) {
          return new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers: { "Content-Type": "application/json" } });
        }
        const provided = request.headers.get("x-backup-secret") ?? "";
        if (!safeEqual(provided, secret)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
        try {
          const processed = await runAutoBackups();
          return new Response(JSON.stringify({ success: true, processed }), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          const message = e instanceof Error ? e.message : "failed";
          return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
