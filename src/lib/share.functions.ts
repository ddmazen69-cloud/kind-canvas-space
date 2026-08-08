import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const statementSchema = z.object({
  token: z.string().min(1).max(200),
});

// إدارة الروابط (إنشاء/قائمة/إلغاء/حذف) تعمل client-side عبر RLS
// في src/lib/share.client.ts — التوكن يُولَّد هناك عبر WebCrypto.

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
      .select("id, user_id, customer_id, expires_at, revoked_at")
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

    // بادئة أرقام الفواتير وترتيبها ضمن فواتير المتجر كاملة،
    // ليطابق كود الفاتورة المعروض في لوحة المحل (نفس منطق invoiceNumber في store.ts).
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
