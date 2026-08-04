import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Reveal } from "@/components/Reveal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/StatusBadge";
import { CustomerTypeBadge } from "@/components/CustomerTypeBadge";
import { StarRating } from "@/components/StarRating";
import { useDB, type Customer, type Invoice, type Payment, fmt, daysLate } from "@/lib/store";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, FileDown, Printer, Share2, User, Wallet } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { pdfDocument, openPdfDocument } from "@/lib/pdf-doc";
import { Route } from "@/routes/customers.$customerId";

function isoToDDMMYYYY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function customerMetrics(invoices: Invoice[], c: Customer) {
  const mine = invoices.filter((i) => i.customerId === c.id);
  const totalCharged = mine.reduce((s, i) => s + i.total, 0) + (c.openingBalance || 0);
  const totalPaid = mine.reduce((s, i) => s + i.paid, 0);
  const balance = totalCharged - totalPaid;
  const worstLate = Math.max(0, ...mine.map(daysLate));
  const paidPct = totalCharged > 0 ? Math.min(100, Math.round((totalPaid / totalCharged) * 100)) : 0;
  return { balance, worstLate, paidPct, totalCharged, totalPaid };
}

function buildTimeline(c: Customer, invoices: Invoice[], payments: Payment[]) {
  type Raw = { id: string; date: string; kind: "opening" | "purchase" | "payment"; description: string; amount: number };
  const raw: Raw[] = [];

  if (c.openingBalance && c.openingBalance > 0) {
    raw.push({ id: `opening-${c.id}`, date: `${c.joiningDate}T00:00:00`, kind: "opening", description: "رصيد افتتاحي عند الانضمام", amount: c.openingBalance });
  }

  for (const inv of invoices) {
    raw.push({ id: `inv-${inv.id}`, date: inv.createdAt, kind: "purchase", description: inv.notes?.trim() ? inv.notes : `فاتورة بتاريخ استحقاق ${isoToDDMMYYYY(inv.firstDueDate)}`, amount: inv.total });
    if (inv.downPayment > 0) {
      raw.push({ id: `down-${inv.id}`, date: inv.createdAt, kind: "payment", description: `مقدم على فاتورة (${(inv.notes || "").trim() || "بدون وصف"})`, amount: inv.downPayment });
    }
  }

  for (const p of payments) {
    const inv = invoices.find((i) => i.id === p.invoiceId);
    raw.push({ id: `pay-${p.id}`, date: p.paidAt, kind: "payment", description: `سداد على فاتورة ${inv?.notes ? `«${inv.notes}»` : `#${p.invoiceId.slice(0, 6)}`}`, amount: p.amount });
  }

  raw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let bal = 0;
  return raw.map((r) => {
    bal += r.kind === "payment" ? -r.amount : r.amount;
    return { ...r, runningBalance: bal };
  }).reverse();
}

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const data = useDB();
  const { privacy } = usePrivacy();

  const customer = data.customers.find((item) => item.id === customerId) ?? null;
  const m = customer ? customerMetrics(data.invoices, customer) : null;
  const myInvoices = customer ? data.invoices.filter((i) => i.customerId === customer.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];
  const myPayments = customer ? data.payments.filter((p) => myInvoices.some((i) => i.id === p.invoiceId)).sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()) : [];
  const timeline = customer ? buildTimeline(customer, myInvoices, myPayments) : [];
  const initials = customer ? customer.name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("") : "؟";
  const latePct = myInvoices.length ? Math.round((myInvoices.filter((inv) => daysLate(inv) > 0).length / myInvoices.length) * 100) : 0;
  const paymentConsistency = myInvoices.length ? Math.round((myPayments.length / myInvoices.length) * 100) : 0;
  const avgInvoice = myInvoices.length ? myInvoices.reduce((sum, inv) => sum + inv.total, 0) / myInvoices.length : 0;
  const avgPayment = myPayments.length ? myPayments.reduce((sum, p) => sum + p.amount, 0) / myPayments.length : 0;
  const riskLevel = m && m.worstLate > 30 ? "مرتفع" : m && m.worstLate > 7 ? "متوسط" : "منخفض";

  if (!customer || !m) {
    return (
      <AppShell>
        <PageTransition>
          <div className="bezel-shell">
            <div className="bezel-core p-8 text-center">
              <div className="mb-3 text-2xl font-extrabold">لم يتم العثور على العميل</div>
              <Button onClick={() => navigate({ to: "/customers" })}>العودة إلى قائمة العملاء</Button>
            </div>
          </div>
        </PageTransition>
      </AppShell>
    );
  }

  const exportStatement = (autoPrint = false) => {
    const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const rows = timeline.map((t, i) => {
      const typeLabel = t.kind === "purchase" ? "مشترى" : t.kind === "opening" ? "رصيد افتتاحي" : "سداد";
      const sign = t.kind === "payment" ? "−" : "+";
      return `
        <tr>
          <td>${i + 1}</td>
          <td dir="ltr">${isoToDDMMYYYY(t.date.slice(0, 10))}</td>
          <td><span class="tag ${t.kind}">${typeLabel}</span></td>
          <td>${t.description}</td>
          <td class="num ${t.kind === "payment" ? "pay" : "buy"}">${sign} ${fmt(t.amount)}</td>
          <td class="num ${t.runningBalance > 0 ? "due" : "ok"}">${fmt(t.runningBalance)}</td>
        </tr>`;
    }).join("");

    const html = pdfDocument({
      docTitle: `كشف حساب — ${customer.name}`,
      badge: "كشف حساب العميل",
      title: "ملف سلوك العميل",
      lede: `تاريخ التقرير: ${today}.`,
      meta: [
        { label: "اسم العميل", value: customer.name },
        { label: "الهاتف", value: customer.phone },
        { label: "الحالة", value: customer.status },
      ],
      kpis: [
        { label: "الرصيد المتبقي", value: `${fmt(m.balance)} ج.م`, tone: m.balance > 0 ? "danger" : "brand" },
        { label: "نسبة المسدد", value: `${m.paidPct}%` },
        { label: "أقصى تأخير", value: `${m.worstLate} يوم` },
      ],
      body: `
        <div class="info">
          <div class="box"><b>اسم العميل</b> ${customer.name}</div>
          <div class="box"><b>الهاتف</b> <span dir="ltr">${customer.phone}</span></div>
          <div class="box"><b>العنوان</b> ${customer.address || "—"}</div>
          <div class="box"><b>تاريخ الانضمام</b> <span dir="ltr">${isoToDDMMYYYY(customer.joiningDate)}</span></div>
        </div>
        <h2 class="sec">سجل الحركات</h2>
        <div class="t-wrap"><table>
          <thead><tr><th>م</th><th>التاريخ</th><th>النوع</th><th>البيان</th><th class="num">المبلغ</th><th class="num">الرصيد</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="empty">لا توجد حركات</td></tr>`}</tbody>
        </table></div>`,
      page: "A4",
    });

    if (!openPdfDocument(html, { autoPrint, features: "width=980,height=760" })) {
      toast.error("يجب السماح بفتح النوافذ المنبثقة لتصدير PDF");
      return;
    }
    toast.success(autoPrint ? "جاري تجهيز الطباعة..." : "تم تجهيز ملف العميل");
  };

  const shareProfile = () => {
    const text = [
      `📋 ملف العميل — ${customer.name}`,
      `📞 ${customer.phone}`,
      `📅 ${new Date().toLocaleDateString("ar-EG")}`,
      `💰 الرصيد: ${fmt(m.balance)} ج.م`,
      `✅ نسبة المسدد: ${m.paidPct}%`,
      `⏰ أقصى تأخير: ${m.worstLate} يوم`,
      `📈 سلوك الدفع: ${paymentConsistency}%`,
      `— سِجلّي`,
    ].join("\n");
    const phone = customer.phone.replace(/^0/, "20");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    toast.success("تم فتح واتساب لمشاركة الملف");
  };

  return (
    <AppShell>
      <PageTransition>
        <div className="space-y-6">
          <PageHeader
            title="تفاصيل العميل"
            subtitle="ملف مستقل يساعدك على فهم سلوك العميل ومعدل التزامه وملف معاملاته."
            action={
              <div className="flex items-center gap-2">
                <Link to="/customers" className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-sm font-bold hover:bg-foreground/[0.04]">
                  <ArrowLeft className="h-4 w-4" /> العودة للقائمة
                </Link>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportStatement(false)}>
                  <FileDown className="w-4 h-4" /> تصدير PDF
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportStatement(true)}>
                  <Printer className="w-4 h-4" /> طباعة
                </Button>
                <Button size="sm" className="gap-1.5" onClick={shareProfile}>
                  <Share2 className="w-4 h-4" /> مشاركة
                </Button>
              </div>
            }
          />

          <Reveal className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="bezel-shell">
              <div className="bezel-core p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 text-right">
                    <Avatar className="h-14 w-14 hairline">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials || <User className="w-5 h-5" />}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-xl font-extrabold">{customer.name}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{customer.phone}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <StatusBadge status={customer.status} />
                    <CustomerTypeBadge type={customer.customerType} />
                    <StarRating value={customer.rating} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-muted-foreground">العنوان</div>
                    <div className="mt-1 font-bold">{customer.address || "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-muted-foreground">تاريخ الانضمام</div>
                    <div className="mt-1 font-bold" dir="ltr">{isoToDDMMYYYY(customer.joiningDate)}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-muted-foreground">سقف المديونية</div>
                    <div className="mt-1 font-bold">{customer.creditLimit > 0 ? `${fmt(customer.creditLimit)} ج.م` : "بدون حد"}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-muted-foreground">نوع الدفع</div>
                    <div className="mt-1 font-bold">{customer.customerType === "cash" ? "فوري" : "أقساط"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bezel-shell">
              <div className="bezel-core p-5 space-y-3 text-right">
                <div className="text-sm font-bold">ملخص السلوك</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-[11px] text-muted-foreground">معدل التزام العميل</div>
                    <div className="text-lg font-extrabold text-success">{paymentConsistency}%</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-[11px] text-muted-foreground">مستوى الخطر</div>
                    <div className="text-lg font-extrabold text-warning">{riskLevel}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-[11px] text-muted-foreground">متوسط قيمة الفاتورة</div>
                    <div className="text-lg font-extrabold">{fmt(avgInvoice)} ج.م</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="text-[11px] text-muted-foreground">متوسط قيمة الدفعة</div>
                    <div className="text-lg font-extrabold">{fmt(avgPayment)} ج.م</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-primary/8 p-3 text-sm text-muted-foreground">
                  <div className="mb-1 flex items-center gap-2 font-bold text-foreground"><CircleAlert className="h-4 w-4 text-warning" /> تحليل سريع</div>
                  <div>العميل {paymentConsistency >= 75 ? "يُظهر التزامًا جيدًا" : paymentConsistency >= 45 ? "يتطلب متابعة أكثر" : "يعتمد على متابعة مستمرة"}، مع {m.worstLate > 0 ? `تأخر أقصاه ${m.worstLate} يوم` : "عدم وجود تأخر مسجل"} في آخر دورة.</div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal className="grid gap-4 md:grid-cols-4">
            <div className="bezel-shell">
              <div className="bezel-core p-4 text-right">
                <div className="text-[11px] text-muted-foreground">الرصيد الحالي</div>
                <div className={cn("mt-1 text-2xl font-extrabold", m.balance > 0 ? "text-danger" : "text-success", privacy && "privacy-blur")}>{fmt(m.balance)} ج.م</div>
              </div>
            </div>
            <div className="bezel-shell">
              <div className="bezel-core p-4 text-right">
                <div className="text-[11px] text-muted-foreground">إجمالي المعاملات</div>
                <div className={cn("mt-1 text-2xl font-extrabold", privacy && "privacy-blur")}>{fmt(m.totalCharged)} ج.م</div>
              </div>
            </div>
            <div className="bezel-shell">
              <div className="bezel-core p-4 text-right">
                <div className="text-[11px] text-muted-foreground">إجمالي المسدد</div>
                <div className={cn("mt-1 text-2xl font-extrabold text-success", privacy && "privacy-blur")}>{fmt(m.totalPaid)} ج.م</div>
              </div>
            </div>
            <div className="bezel-shell">
              <div className="bezel-core p-4 text-right">
                <div className="text-[11px] text-muted-foreground">أقصى تأخير</div>
                <div className="mt-1 text-2xl font-extrabold text-warning">{m.worstLate > 0 ? `${m.worstLate} يوم` : "—"}</div>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="bezel-shell">
              <div className="bezel-core p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4" />
                    الزمن الكلي للحركات
                  </div>
                  <div className="text-sm font-bold">سجل الحركات الكامل</div>
                </div>
                <ScrollArea className="max-h-[56vh]">
                  <div className="space-y-3 pr-2">
                    {timeline.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة بعد</div>
                    ) : timeline.map((t) => {
                      const isPurchase = t.kind === "purchase";
                      const isOpening = t.kind === "opening";
                      return (
                        <div key={t.id} className="rounded-2xl border border-[var(--hairline)] p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <Badge variant="outline" className={cn(
                              isPurchase ? "bg-danger/10 text-danger border-danger/30" : isOpening ? "bg-warning/10 text-warning border-warning/30" : "bg-success/10 text-success border-success/30"
                            )}>{isPurchase ? "شراء" : isOpening ? "رصيد افتتاحي" : "سداد"}</Badge>
                            <span className="text-[11px] text-muted-foreground" dir="ltr">{isoToDDMMYYYY(t.date.slice(0, 10))}</span>
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm text-muted-foreground">{t.description}</div>
                            <div className={cn("font-bold whitespace-nowrap", isPurchase || isOpening ? "text-danger" : "text-success", privacy && "privacy-blur")}>{isPurchase || isOpening ? "+" : "−"} {fmt(t.amount)} ج.م</div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">الرصيد المتبقي: <span className={cn("font-bold", t.runningBalance > 0 ? "text-danger" : "text-success", privacy && "privacy-blur")}>{fmt(t.runningBalance)} ج.م</span></div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="bezel-shell">
              <div className="bezel-core p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="h-4 w-4 text-success" /> توصية إدارية</div>
                <div className="rounded-2xl bg-success/8 p-3 text-sm text-muted-foreground">
                  {m.worstLate > 30 ? "العميل يحتاج إلى متابعة مباشرة بسبب تأخره المتكرر، مع منع أي شحن جديد حتى يتم stabilize السداد." : m.worstLate > 7 ? "الأفضل متابعة السداد خلال 72 ساعة وتقديم حافز صغير إن أمكن لتجديد الالتزام." : "العميل في وضع جيد، يمكن توجيه المزيد من المبيعات مع إبقاء المتابعة الشهرية."}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </PageTransition>
    </AppShell>
  );
}

export default CustomerDetailPage;
