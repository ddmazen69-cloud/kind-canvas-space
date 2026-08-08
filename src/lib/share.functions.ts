import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const createShareSchema = z.object({
  customerId: z.string().min(1),
  days: z.number().int().min(0).max(365).default(7),
});

const listShareSchema = z.object({
  customerId: z.string().min(1),
});

const revokeShareSchema = z.object({
  id: z.string().min(1),
});

const statementSchema = z.object({
  token: z.string().min(1).max(200),
});

/** ينشئ رابط مشاركة لكشف حساب عميل. المالك فقط (عبر RLS). */
export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createShareSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // التأكد أن العميل يخص المستخدم (RLS يفرض هذا).
    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .select("id")
      .eq("id", data.customerId)
      .maybeSingle();
    if (customerErr || !customer) {
      throw new Error("العميل ده مش موجود أو مش بتاعك");
    }

    // التوكن يُولَّد في السيرفر بقوة عشوائية عالية.
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(24).toString("hex");

    const expiresAt = data.days > 0
      ? new Date(Date.now() + data.days * 86400000).toISOString()
      : null;

    const { data: link, error } = await supabase
      .from("customer_share_links")
      .insert({
        user_id: userId,
        customer_id: data.customerId,
        token,
        expires_at: expiresAt,
      })
      .select("id, token, created_at, expires_at, revoked_at")
      .single();
    if (error) throw new Error(error.message);

    return { id: link.id, token: link.token, expiresAt: link.expires_at };
  });

/** قائمة روابط مشاركة عميل معين (المالك فقط — RLS). */
export const listShareLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listShareSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: links, error } = await supabase
      .from("customer_share_links")
      .select("id, token, created_at, expires_at, revoked_at")
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (links ?? []).map((l) => ({
      id: l.id,
      token: l.token,
      createdAt: l.created_at,
      expiresAt: l.expires_at,
      revokedAt: l.revoked_at,
    }));
  });

/** إلغاء/تعطيل رابط مشاركة (المالك فقط — RLS). */
export const revokeShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revokeShareSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { error } = await supabase
      .from("customer_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * قراءة كشف حساب العميل عبر رابط المشاركة (عامة — بدون تسجيل دخول).
 *
 * الأمان: الـ token هو المفتاح. يُفحص أنه موجود وغير ملغي وغير منتهي،
 * ثم تُقرأ بيانات العميل الواحد المرتبط به فقط عبر supabaseAdmin
 * (service role) مثل team.functions.ts. لا تُرجع أي بيانات مستخدمين
 * آخرين ولا user_id ولا إعدادات المحل.
 */
export const getSharedStatement = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => statementSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("customer_share_links")
      .select("id, customer_id, expires_at, revoked_at")
      .eq("token", data.token.trim())
      .maybeSingle();

    if (linkErr || !link) {
      return { status: "not_found" as const };
    }
    if (link.revoked_at) {
      return { status: "revoked" as const };
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return { status: "expired" as const };
    }

    // قراءة العميل المرتبط بالتوكن فقط.
    const { data: customer, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id, code, name, phone, address, customer_type, joining_date, opening_balance, rating, frozen, status")
      .eq("id", link.customer_id)
      .maybeSingle();
    if (customerErr || !customer) {
      return { status: "not_found" as const };
    }

    const { data: invoices, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id, created_at, first_due_date, total, down_payment, paid, notes")
      .eq("customer_id", link.customer_id)
      .order("created_at", { ascending: true });
    if (invErr) return { status: "not_found" as const };

    const invoiceIds = (invoices ?? []).map((i) => i.id);
    const { data: payments, error: payErr } = invoiceIds.length
      ? await supabaseAdmin
          .from("payments")
          .select("id, invoice_id, amount, paid_at")
          .in("invoice_id", invoiceIds)
      : { data: [] as Array<{ id: string; invoice_id: string; amount: number; paid_at: string }>, error: null };
    if (payErr) return { status: "not_found" as const };

    // ── حساب المقاييس بنفس منطق صفحة العميل ──
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

    // ── بناء الجدول الزمني (نفس ترتيب buildTimeline في صفحة العميل) ──
    type Raw = { id: string; date: string; kind: "opening" | "purchase" | "payment"; description: string; amount: number };
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
      raw.push({ id: `inv-${inv.id}`, date: inv.created_at, kind: "purchase", description: desc, amount: inv.total });
      if (inv.down_payment > 0) {
        raw.push({
          id: `down-${inv.id}`,
          date: inv.created_at,
          kind: "payment",
          description: `مقدم على فاتورة (${(inv.notes || "").trim() || "بدون وصف"})`,
          amount: inv.down_payment,
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
      });
    }

    raw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let bal = 0;
    const timeline = raw
      .map((r) => {
        bal += r.kind === "payment" ? -r.amount : r.amount;
        return { ...r, runningBalance: bal };
      })
      .reverse();

    return {
      status: "ok" as const,
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
    };
  });
