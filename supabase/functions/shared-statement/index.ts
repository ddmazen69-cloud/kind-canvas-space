import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (typeof token !== "string" || !token.trim()) {
      return json({ status: "not_found" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ status: "error", message: "Edge function is not configured" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("customer_share_links")
      .select("id, user_id, customer_id, expires_at, revoked_at")
      .eq("token", token.trim())
      .maybeSingle();

    if (linkErr || !link) {
      return json({ status: "not_found" });
    }
    if (link.revoked_at) {
      return json({ status: "revoked" });
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return json({ status: "expired" });
    }

    const { data: settingsRow } = await supabaseAdmin
      .from("shop_settings")
      .select("invoice_prefix")
      .eq("user_id", link.user_id)
      .maybeSingle();
    const invoicePrefix = (settingsRow?.invoice_prefix as string | null) ?? "";

    const { data: allInvoices } = await supabaseAdmin
      .from("invoices")
      .select("id, created_at")
      .eq("user_id", link.user_id)
      .order("created_at", { ascending: true });
    const orderedIds = (allInvoices ?? []).map((i) => i.id);
    const serialOf = (invoiceId: string) => {
      const idx = orderedIds.indexOf(invoiceId);
      const serial = String(idx >= 0 ? idx + 1 : orderedIds.length + 1).padStart(4, "0");
      const p = invoicePrefix.trim();
      return p ? `${p}-${serial}` : `#${serial}`;
    };

    const { data: customer, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id, code, name, phone, address, customer_type, joining_date, opening_balance, rating, frozen, status")
      .eq("id", link.customer_id)
      .maybeSingle();
    if (customerErr || !customer) {
      return json({ status: "not_found" });
    }

    const { data: invoices, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id, created_at, first_due_date, total, down_payment, paid, notes")
      .eq("customer_id", link.customer_id)
      .order("created_at", { ascending: true });
    if (invErr) {
      return json({ status: "not_found" });
    }

    const invoiceIds = (invoices ?? []).map((i) => i.id);
    const { data: payments, error: payErr } = invoiceIds.length
      ? await supabaseAdmin
          .from("payments")
          .select("id, invoice_id, amount, paid_at")
          .in("invoice_id", invoiceIds)
      : { data: [] as Array<{ id: string; invoice_id: string; amount: number; paid_at: string }>, error: null };
    if (payErr) {
      return json({ status: "not_found" });
    }

    const totalCharged = (invoices ?? []).reduce((s, i) => s + i.total, 0) + (customer.opening_balance || 0);
    const totalPaid = (invoices ?? []).reduce((s, i) => s + i.paid, 0);
    const balance = totalCharged - totalPaid;
    const worstLate = Math.max(
      0,
      ...(invoices ?? [])
        .filter((i) => i.paid < i.total)
        .map((i) => Math.max(0, Math.floor((Date.now() - new Date(i.first_due_date).getTime()) / 86400000))),
    );
    const paidPct = totalCharged > 0 ? Math.min(100, Math.round((totalPaid / totalCharged) * 100)) : 0;

    type Raw = { id: string; date: string; kind: "opening" | "purchase" | "payment"; description: string; amount: number; invoiceNo?: string };
    const raw: Raw[] = [];

    if (customer.opening_balance && customer.opening_balance > 0) {
      raw.push({
        id: `opening-${customer.id}`,
        date: `${customer.joining_date}T00:00:00`,
        kind: "opening",
        description: "رصيد افتتاحي عند الانضمام",
        amount: customer.opening_balance,
      });
    }

    for (const inv of invoices ?? []) {
      const desc = inv.notes?.trim() ? inv.notes : "فاتورة آجلة";
      const invoiceNo = serialOf(inv.id);
      raw.push({ id: `inv-${inv.id}`, date: inv.created_at, kind: "purchase", description: desc, amount: inv.total, invoiceNo });
      if (inv.down_payment > 0) {
        raw.push({
          id: `down-${inv.id}`,
          date: inv.created_at,
          kind: "payment",
          description: `مقدم على فاتورة (${(inv.notes || "").trim() || "بدون وصف"})`,
          amount: inv.down_payment,
          invoiceNo,
        });
      }
    }

    for (const p of payments ?? []) {
      const inv = (invoices ?? []).find((i) => i.id === p.invoice_id);
      raw.push({
        id: `pay-${p.id}`,
        date: p.paid_at,
        kind: "payment",
        description: `سداد على فاتورة ${inv?.notes ? `«${inv.notes}»` : ""}`,
        amount: p.amount,
        invoiceNo: inv ? serialOf(inv.id) : undefined,
      });
    }

    raw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let bal = 0;
    const timeline = raw.map((r) => {
      bal += r.kind === "payment" ? -r.amount : r.amount;
      return { ...r, runningBalance: bal };
    });

    return json({
      status: "ok",
      customer: {
        code: customer.code,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        customerType: customer.customer_type,
        joiningDate: customer.joining_date,
        rating: customer.rating,
        frozen: customer.frozen,
        status: customer.status,
      },
      metrics: { balance, totalCharged, totalPaid, paidPct, worstLate },
      timeline,
    });
  } catch {
    return json({ status: "not_found" });
  }
});
