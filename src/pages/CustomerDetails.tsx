import { useMemo, useState } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDB, db, type Customer, type Invoice, type Payment, fmt, daysLate, analyzeCustomerRisk, invoiceNumber, getShopSettings } from "@/lib/store";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createShareLinkClient, listShareLinksClient, revokeShareLinkClient, deleteShareLinkClient } from "@/lib/share.client";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileDown,
  Link2,
  Loader2,
  Copy,
  Check,
  Share2,
  User,
  Wallet,
  TrendingUp,
  Landmark,
  Activity,
  ShieldAlert,
  Lock,
  Unlock,
  Ban,
  Undo2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { pdfDocument, openPdfDocument } from "@/lib/pdf-doc";
import { Route } from "@/routes/customers.$customerId";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function isoToDDMMYYYY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function formatMonthLabel(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("ar-EG", { month: "short" }).format(date);
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

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildTimeline(c: Customer, invoices: Invoice[], payments: Payment[]) {
  type Raw = { id: string; date: string; kind: "opening" | "purchase" | "payment"; description: string; amount: number; invoiceId?: string };
  const raw: Raw[] = [];

  if (c.openingBalance && c.openingBalance > 0) {
    raw.push({ id: `opening-${c.id}`, date: `${c.joiningDate}T00:00:00`, kind: "opening", description: "رصيد افتتاحي عند الانضمام", amount: c.openingBalance });
  }

  for (const inv of invoices) {
    raw.push({ id: `inv-${inv.id}`, date: inv.createdAt, kind: "purchase", description: inv.notes?.trim() ? inv.notes : `فاتورة بتاريخ استحقاق ${isoToDDMMYYYY(inv.firstDueDate)}`, amount: inv.total, invoiceId: inv.id });
    if (inv.downPayment > 0) {
      raw.push({ id: `down-${inv.id}`, date: inv.createdAt, kind: "payment", description: `مقدم على فاتورة (${(inv.notes || "").trim() || "بدون وصف"})`, amount: inv.downPayment, invoiceId: inv.id });
    }
  }

  for (const p of payments) {
    const inv = invoices.find((i) => i.id === p.invoiceId);
    raw.push({ id: `pay-${p.id}`, date: p.paidAt, kind: "payment", description: `سداد على فاتورة ${inv?.notes ? `«${inv.notes}»` : `${invoiceNumber(invoices, p.invoiceId)}`}`, amount: p.amount, invoiceId: p.invoiceId });
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

  const risk = customer ? analyzeCustomerRisk(customer, data.invoices) : null;
  const lateRate = myInvoices.length ? Math.round((myInvoices.filter((inv) => daysLate(inv) > 0).length / myInvoices.length) * 100) : 0;
  const paymentConsistency = myInvoices.length ? Math.round((myPayments.length / myInvoices.length) * 100) : 0;
  const avgInvoice = myInvoices.length ? myInvoices.reduce((sum, inv) => sum + inv.total, 0) / myInvoices.length : 0;
  const avgPayment = myPayments.length ? myPayments.reduce((sum, p) => sum + p.amount, 0) / myPayments.length : 0;
  const riskLevel = customer?.frozen ? "حظر تلميحي" : risk?.level === "high" ? "مرتفع" : risk?.level === "medium" ? "متوسط" : "منخفض";
  const actionRecommendation = customer?.frozen
    ? "العميل مجمّد حالياً ومحظور من التعامل الشديد والبيع الآجل."
    : risk?.recommendBlock
      ? `ينصح بالحظر فوراً للأسباب التالية: ${risk.reasons.join(" ، ")}`
      : m && m.worstLate > 7
        ? "ينصح بمتابعة السداد خلال 72 ساعة مع تذكير مباشر."
        : "العميل في وضع جيد، ويمكن متابعة التوسع مع مراقبة الالتزام الشهري.";

  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, idx) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (5 - idx));
      return date.toISOString().slice(0, 10);
    });

    const map = months.map((monthIso) => ({
      month: formatMonthLabel(monthIso),
      charged: 0,
      paid: 0,
      balance: 0,
    }));

    for (const invoice of myInvoices) {
      const monthKey = invoice.createdAt.slice(0, 7);
      const idx = months.findIndex((item) => item.startsWith(monthKey));
      if (idx >= 0) {
        map[idx].charged += invoice.total;
        map[idx].paid += invoice.paid;
      }
    }

    for (const payment of myPayments) {
      const monthKey = payment.paidAt.slice(0, 7);
      const idx = months.findIndex((item) => item.startsWith(monthKey));
      if (idx >= 0) map[idx].paid += payment.amount;
    }

    for (const item of map) {
      item.balance = Math.max(0, item.charged - item.paid);
    }

    return map;
  }, [myInvoices, myPayments]);

  const invoiceStatusSummary = useMemo(() => {
    const opened = myInvoices.length;
    const settled = myInvoices.filter((inv) => inv.paid >= inv.total).length;
    const active = myInvoices.filter((inv) => inv.paid < inv.total).length;
    return [
      { name: "مكتمل", value: settled, color: "#22c55e" },
      { name: "قيد السداد", value: active, color: "#f59e0b" },
      { name: "مفتوح", value: Math.max(0, opened - settled - active), color: "#ef4444" },
    ];
  }, [myInvoices]);

  const latestInvoice = myInvoices[0];
  const latestPayment = myPayments[0];

  // ── رابط مشاركة كشف الحساب ──
  type ShareLinkRow = {
    id: string;
    token: string;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
  };
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDays, setShareDays] = useState<string>("7");
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const exportStatement = () => {
    const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const shop = getShopSettings();
    const ordered = [...timeline].reverse();
    const rows = ordered.map((t, i) => {
      const typeLabel = t.kind === "purchase" ? "فاتورة" : t.kind === "opening" ? "رصيد افتتاحي" : "سداد";
      let detail = `<b>${escapeHtml(t.description)}</b>`;
      if (t.invoiceId) {
        detail += `<div class="inv-no">رقم الفاتورة: <b>${invoiceNumber(data.invoices, t.invoiceId)}</b></div>`;
      }
      return `
        <tr>
          <td>${i + 1}</td>
          <td dir="ltr" class="nowrap">${isoToDDMMYYYY(t.date.slice(0, 10))}</td>
          <td><span class="tag ${t.kind}">${typeLabel}</span></td>
          <td>${detail}</td>
          <td class="num ${t.kind === "payment" ? "pay" : "buy"}">${fmt(Math.abs(t.amount))}</td>
          <td class="num" style="color:#0b1220">${fmt(Math.abs(t.runningBalance))}</td>
        </tr>`;
    }).join("");

    const html = pdfDocument({
      docTitle: "كشف حساب العميل",
      badge: "كشف حساب تفصيلي",
      title: "كشف حساب العميل",
      lede: `سجل تفصيلي بكل الفواتير والمدفوعات بالترتيب الزمني — تاريخ التقرير: ${today}.`,
      meta: [
        { label: "رقم الهاتف", value: shop.phone || "—" },
        { label: "العنوان", value: shop.address || "—" },
      ],
      centered: true,
      hideFooter: true,
      body: `
        <div class="info">
          <div class="box"><b>كود العميل</b> ${escapeHtml(customer.code || "—")}</div>
          <div class="box"><b>اسم العميل</b> ${escapeHtml(customer.name)}</div>
          <div class="box"><b>الهاتف</b> <span dir="ltr">${escapeHtml(customer.phone || "—")}</span></div>
          <div class="box"><b>العنوان</b> ${customer.address || "—"}</div>
          <div class="box"><b>حالة العميل</b> ${customer.customerType === "installment" ? "قسط" : "فورى"}</div>
        </div>
        <style>
          .nowrap { white-space: nowrap; }
          .inv-no { margin-top: 3px; font-size: 10.5px; color: var(--muted); }
          .closing { margin-top: 26px; text-align: center; font-family: 'Cairo', sans-serif; font-size: 12.5px; font-weight: 700; color: #334155; line-height: 1.9; }
          .closing .brand-line { color: var(--brand); font-weight: 800; }
        </style>
        <h2 class="sec">سجل الحركات التفصيلي (بالترتيب الزمني)</h2>
        <div class="t-wrap"><table>
          <thead><tr><th>م</th><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th class="num">المبلغ</th><th class="num">الرصيد</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="empty">لا توجد حركات</td></tr>`}</tbody>
        </table></div>
        <div class="closing">
          شكراً لتعاملكم معنا، ويسعدنا خدمتكم دائماً.<br/>
          للمراجعة أو أي استفسار يرجى مراجعة المحل.<br/>
          <span class="brand-line">سِجلّي</span>
        </div>`,
      page: "A4",
    });

    if (!openPdfDocument(html, { features: "width=1100,height=800" })) {
      toast.error("يجب السماح بفتح النوافذ المنبثقة لتصدير PDF");
      return;
    }
    toast.success("تم تجهيز كشف حساب العميل");
  };

  // ── رابط مشاركة كشف الحساب ──
  const openShareDialog = async () => {
    setShareOpen(true);
    setCreatedLink(null);
    setCopied(false);
    setLoadingLinks(true);
    try {
      const res = await listShareLinksClient(customer.id);
      setLinks(res);
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل الروابط");
    } finally {
      setLoadingLinks(false);
    }
  };

  const generateShareLink = async () => {
    setCreating(true);
    try {
      const res = await createShareLinkClient(customer.id, Number(shareDays));
      const url = `${window.location.origin}/share/${res.token}`;
      setCreatedLink(url);
      const refreshed = await listShareLinksClient(customer.id);
      setLinks(refreshed);
      toast.success("تم توليد رابط المشاركة");
    } catch (e: any) {
      toast.error(e?.message || "تعذر توليد الرابط");
    } finally {
      setCreating(false);
    }
  };

  const copyShareLink = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("تم نسخ الرابط");
    } catch {
      toast.error("انسخ الرابط يدوياً");
    }
  };

  const sendShareLinkWhatsApp = () => {
    if (!createdLink) return;
    const phone = (customer.phone || "").replace(/^0/, "20");
    const text = `مرحباً ${customer.name}، دي روابط كشف حسابك على سِجلّي:\n${createdLink}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const revokeLink = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeShareLinkClient(id);
      const refreshed = await listShareLinksClient(customer.id);
      setLinks(refreshed);
      toast.success("تم إلغاء الرابط");
    } catch (e: any) {
      toast.error(e?.message || "تعذر إلغاء الرابط");
    } finally {
      setRevokingId(null);
    }
  };

  const deleteLink = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteShareLinkClient(id);
      const refreshed = await listShareLinksClient(customer.id);
      setLinks(refreshed);
      if (createdLink) setCreatedLink(null);
      toast.success("تم حذف الرابط نهائياً");
    } catch (e: any) {
      toast.error(e?.message || "تعذر حذف الرابط");
    } finally {
      setDeletingId(null);
    }
  };

  const shareLinkStatus = (l: ShareLinkRow): { label: string; tone: string } => {
    if (l.revokedAt) return { label: "ملغي", tone: "bg-danger/12 text-danger" };
    if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return { label: "منتهي", tone: "bg-warning/12 text-warning" };
    return { label: "نشط", tone: "bg-success/12 text-success" };
  };

  return (
    <AppShell>
      <PageTransition>
        <div className="space-y-6">
          <PageHeader
            title="ملف العميل الذكي"
            subtitle="تحليل سلوكي احترافي، حركة حساب كاملة، وفواتير مدمجة لاتخاذ قرار إداري أسرع."
            action={
              <div className="flex items-center gap-2">
                <Link to="/customers" className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-sm font-bold hover:bg-foreground/[0.04]">
                  <ArrowLeft className="h-4 w-4" /> العودة للقائمة
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant={customer.frozen ? "default" : "destructive"}
                      size="sm"
                      className={cn("gap-1.5 font-bold", customer.frozen ? "bg-success text-success-foreground hover:bg-success/90" : "bg-danger text-danger-foreground hover:bg-danger/90")}
                    >
                      {customer.frozen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      {customer.frozen ? "فك الحظر" : "حظر العميل"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="text-right">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 justify-end">
                        {customer.frozen ? "فك حظر العميل" : "حظر وتجميد التعامل مع العميل"}
                        {customer.frozen ? <Unlock className="h-5 w-5 text-success" /> : <ShieldAlert className="h-5 w-5 text-danger" />}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-right whitespace-pre-wrap">
                        {customer.frozen
                          ? `هل تود إلغاء الحظر عن العميل «${customer.name}» والسماح بإصدار فواتير وأقساط جديدة له؟`
                          : `هل أنت متأكد من حظر العميل «${customer.name}»؟\nسيتم إيقاف الشراء الآجل لهذا العميل وتعيين شارة الحظر على حسابه.`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row-reverse gap-2">
                      <AlertDialogAction
                        className={customer.frozen ? "bg-success text-success-foreground hover:bg-success/90" : "bg-danger text-danger-foreground hover:bg-danger/90"}
                        onClick={async () => {
                          try {
                            await db.toggleFreezeCustomer(customer.id, !customer.frozen);
                            toast.success(customer.frozen ? "تم فك الحظر عن العميل" : "تم حظر العميل وتجميد حسابه");
                          } catch (err: any) {
                            toast.error(err.message || "حدث خطأ أثناء تغيير حالة الحظر");
                          }
                        }}
                      >
                        {customer.frozen ? "تأكيد فك الحظر" : "تأكيد الحظر"}
                      </AlertDialogAction>
                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportStatement()}>
                  <FileDown className="w-4 h-4" /> تصدير كشف حساب (PDF)
                </Button>
                <Button size="sm" className="gap-1.5" onClick={openShareDialog}>
                  <Share2 className="w-4 h-4" /> مشاركة
                </Button>
              </div>
            }
          />

          {customer.frozen && (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-danger flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-6 w-6 shrink-0" />
                <div>
                  <div className="font-extrabold text-base">🛑 هذا العميل محظور حالياً من التعامل الشديد والبيع الآجل</div>
                  <div className="text-xs text-danger/80 mt-0.5">تم تجميد حساب العميل لمنع إصدار أي فواتير أقساط جديدة حتى تسوية مديونيته.</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-danger/40 text-danger hover:bg-danger/20 font-bold shrink-0"
                onClick={async () => {
                  await db.toggleFreezeCustomer(customer.id, false);
                  toast.success("تم فك الحظر عن العميل");
                }}
              >
                فك الحظر الآن
              </Button>
            </div>
          )}

          {!customer.frozen && risk?.recommendBlock && (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-danger flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-6 w-6 shrink-0" />
                <div>
                  <div className="font-extrabold text-base">⚠️ توصية النظام التحليلي: يُنصح بحظر هذا العميل فوراً</div>
                  <div className="text-xs text-danger/90 mt-1">
                    الأسباب الحسابية: {risk.reasons.join(" • ")}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-danger text-danger-foreground hover:bg-danger/90 font-bold shrink-0"
                onClick={async () => {
                  await db.toggleFreezeCustomer(customer.id, true);
                  toast.success("تم حظر العميل بنجاح بناءً على التوصية");
                }}
              >
                حظر العميل فوراً
              </Button>
            </div>
          )}

          <Reveal className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="bezel-shell">
              <div className="bezel-core p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 text-right">
                    <Avatar className="h-14 w-14 hairline">
                      <AvatarFallback className={cn("font-bold", customer.frozen ? "bg-danger/20 text-danger" : "bg-primary/10 text-primary")}>
                        {initials || <User className="w-5 h-5" />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-xl font-extrabold flex items-center gap-2">
                        {customer.code && <span data-latin-digits dir="ltr" className="font-mono">{customer.code}</span>}
                        {customer.code ? " — " : ""}{customer.name}
                        {customer.frozen && (
                          <Badge variant="destructive" className="gap-1 bg-danger/20 text-danger border-danger/30 text-xs font-bold">
                            <Ban className="h-3 w-3" /> محظور
                          </Badge>
                        )}
                      </div>
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
                  {customer.ledgerNo && (
                    <div className="rounded-2xl bg-foreground/[0.04] p-3">
                      <div className="text-muted-foreground">رقم الدفتر الورقي</div>
                      <div className="mt-1 font-bold" dir="ltr" data-latin-digits>{customer.ledgerNo}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bezel-shell">
              <div className="bezel-core p-5 space-y-3 text-right">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Activity className="h-4 w-4 text-primary" />
                  تحليل سريع
                </div>
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
                  <div className="mb-1 flex items-center gap-2 font-bold text-foreground"><CircleAlert className="h-4 w-4 text-warning" /> التوصية الإدارية</div>
                  <div>{actionRecommendation}</div>
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

          <Reveal className="grid gap-4 xl:grid-cols-2">
            <div className="bezel-shell">
              <div className="bezel-core p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    اتجاه الرصيد خلال الأشهر الأخيرة
                  </div>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="chargedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => [`${fmt(value)} ج.م`, "القيمة"]} />
                      <Area type="monotone" dataKey="charged" stroke="#22c55e" fill="url(#chargedFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bezel-shell">
              <div className="bezel-core p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Landmark className="h-4 w-4 text-primary" />
                    توزيع الأرصدة حسب نوع الفاتورة
                  </div>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={invoiceStatusSummary}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        paddingAngle={4}
                      >
                        {invoiceStatusSummary.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value} فاتورة`, "العدد"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  {invoiceStatusSummary.map((entry) => (
                    <div key={entry.name} className="rounded-xl bg-foreground/[0.04] p-2 text-center">
                      <div className="font-bold text-foreground">{entry.value}</div>
                      <div>{entry.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="bezel-shell">
              <div className="bezel-core p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wallet className="h-4 w-4 text-primary" />
                    سداد العميل شهريًا
                  </div>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => [`${fmt(value)} ج.م`, "المدفوع"]} />
                      <Bar dataKey="paid" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bezel-shell">
              <div className="bezel-core p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <CheckCircle2 className="h-4 w-4 text-success" /> وجهة نظر إدارية
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="font-bold text-foreground">الحالة الحالية</div>
                    <div className="mt-1">العميل {m.balance > 0 ? "يملك رصيدًا مستحقًا" : "لا يوجد عليه رصيد مستحق الآن"}، وبنسبة سداد تصل إلى {m.paidPct}%.</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="font-bold text-foreground">أخر حركة</div>
                    <div className="mt-1">{latestPayment ? `دفعة بمبلغ ${fmt(latestPayment.amount)} ج.م بتاريخ ${isoToDDMMYYYY(latestPayment.paidAt.slice(0, 10))}` : "لا توجد دفعات مسجلة بعد"}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3">
                    <div className="font-bold text-foreground">أخر فاتورة</div>
                    <div className="mt-1">{latestInvoice ? `${fmt(latestInvoice.total)} ج.م — ${latestInvoice.notes || "بدون وصف"}` : "لا توجد فواتير مسجلة بعد"}</div>
                  </div>
                  <div className="rounded-2xl bg-success/8 p-3">
                    <div className="font-bold text-foreground">التركيز المطلوب</div>
                    <div className="mt-1">{lateRate > 20 ? "تحتاج متابعة سريعة للتأخرات." : "مستوى استقرار جيد، التزام متوازن."}</div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="bezel-shell">
              <div className="bezel-core p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4" />
                    جدول الفواتير والمدفوعات
                  </div>
                  <div className="text-sm font-bold">جدول الحركات المفصل</div>
                </div>
                <ScrollArea className="max-h-[56vh]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-foreground/[0.04] text-muted-foreground">
                        <tr>
                          <th className="p-3 text-right">كود الفاتورة</th>
                          <th className="p-3 text-right">التاريخ</th>
                          <th className="p-3 text-right">الإجمالي</th>
                          <th className="p-3 text-right">المسدد</th>
                          <th className="p-3 text-right">المتبقي</th>
                          <th className="p-3 text-right">الحالة</th>
                          <th className="p-3 text-right">الوصف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myInvoices.map((invoice) => {
                          const remaining = Math.max(0, invoice.total - invoice.paid);
                          const status = invoice.paid >= invoice.total ? "مكتمل" : invoice.paid > 0 ? "جزئي" : "مفتوح";
                          const tone = invoice.paid >= invoice.total ? "bg-success/12 text-success" : invoice.paid > 0 ? "bg-warning/12 text-warning" : "bg-danger/12 text-danger";
                          return (
                            <tr key={invoice.id} className="border-t border-[var(--hairline)]">
                              <td className="p-3 font-bold" data-latin-digits dir="ltr">{invoiceNumber(data.invoices, invoice.id)}</td>
                              <td className="p-3" dir="ltr">{isoToDDMMYYYY(invoice.firstDueDate)}</td>
                              <td className="p-3 font-bold">{fmt(invoice.total)} ج.م</td>
                              <td className="p-3 text-success font-bold">{fmt(invoice.paid)} ج.م</td>
                              <td className="p-3 text-danger font-bold">{fmt(remaining)} ج.م</td>
                              <td className="p-3"><Badge className={tone}>{status}</Badge></td>
                              <td className="p-3 text-muted-foreground">{invoice.notes || "بدون وصف"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </Reveal>
        </div>
      </PageTransition>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-2xl text-right">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-end">
              <Share2 className="h-5 w-5 text-primary" /> مشاركة كشف حساب العميل
            </DialogTitle>
            <DialogDescription>
              ولّد رابط يفتح كشف الحساب الكامل (الرصيد + جدول الحركات) لأي حد يفتحه — بدون تسجيل دخول. تقدر تلغي الرابط في أي وقت.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">مدة صلاحية الرابط</Label>
              <RadioGroup
                value={shareDays}
                onValueChange={(v) => setShareDays(v)}
                className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2"
              >
                {[
                  { value: "1", label: "يوم واحد" },
                  { value: "7", label: "7 أيام" },
                  { value: "30", label: "30 يوم" },
                  { value: "0", label: "بدون انتهاء" },
                ].map((opt) => (
                  <Label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-2xl border border-border/60 bg-foreground/[0.03] p-3 text-sm font-semibold has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/8"
                  >
                    <RadioGroupItem value={opt.value} id={`share-days-${opt.value}`} />
                    {opt.label}
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <Button
              onClick={generateShareLink}
              disabled={creating}
              className="w-full gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {creating ? "بنولّد الرابط…" : "توليد رابط المشاركة"}
            </Button>

            {createdLink && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input readOnly dir="ltr" value={createdLink} className="min-w-0 flex-1 text-xs" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={copyShareLink}>
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" className="w-full gap-2" onClick={sendShareLinkWhatsApp}>
                  إرسال الرابط واتساب
                </Button>
              </div>
            )}

            <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-bold">الروابط النشطة</div>
                {loadingLinks && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {!loadingLinks && links.length === 0 && (
                <div className="text-sm text-muted-foreground">مفيش روابط مشاركة لسه.</div>
              )}
              {links.map((l) => {
                const st = shareLinkStatus(l);
                const active = !l.revokedAt && !(l.expiresAt && new Date(l.expiresAt).getTime() < Date.now());
                return (
                  <div key={l.id} className="flex flex-col gap-2 border-t border-[var(--hairline)] py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={st.tone}>{st.label}</Badge>
                        <span className="truncate text-xs text-muted-foreground" dir="ltr">
                          {`${window.location.origin}/share/${l.token.slice(0, 8)}…`}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        أُنشئ {new Date(l.createdAt).toLocaleDateString("ar-EG")}
                        {l.expiresAt && active ? ` — ينتهي ${new Date(l.expiresAt).toLocaleDateString("ar-EG")}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-primary hover:bg-primary/10"
                        onClick={() => window.open(`${window.location.origin}/share/${l.token}`, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        فتح
                      </Button>
                      {active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-danger hover:bg-danger/10"
                          onClick={() => revokeLink(l.id)}
                          disabled={revokingId === l.id}
                        >
                          {revokingId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                          إلغاء
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-danger hover:bg-danger/10"
                        onClick={() => deleteLink(l.id)}
                        disabled={deletingId === l.id}
                      >
                        {deletingId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        حذف
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default CustomerDetailPage;
