import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { BezelCard } from "@/components/BezelCard";
import { DateField } from "@/components/DateField";
import { AppShell } from "@/components/AppShell";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  FileDown,
  Plus,
  ReceiptText,
  Search,
  Wallet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDB, fmt, expenseCategoryLabel, invoiceNumber } from "@/lib/store";
import { pdfDocument, openPdfDocument } from "@/lib/pdf-doc";
import { toast } from "sonner";
import { usePrivacy } from "@/lib/privacy";

function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c] ?? c));
}

function fmtMoney(n: number) {
  return `${Math.round(n).toLocaleString("ar-EG")} ج.م`;
}

function invoiceStatus(inv: { total: number; paid: number }) {
  const remaining = Math.max(0, inv.total - inv.paid);
  if (inv.paid <= 0) return "غير مدفوعة";
  if (remaining <= 0) return "مدفوعة";
  return "مدفوعة جزئياً";
}

function invoiceStatusKey(inv: { total: number; paid: number }) {
  const remaining = Math.max(0, inv.total - inv.paid);
  if (inv.paid <= 0) return "unpaid";
  if (remaining <= 0) return "paid";
  return "partial";
}

export default function DailyLog() {
  const { invoices, customers, expenses, payments } = useDB();
  const navigate = useNavigate();
  const { privacy, toggle } = usePrivacy();
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [customerFilter, setCustomerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "cash" | "installment">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);

  const noteStorageKey = `daily-log-note:${fromDate}:${toDate}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(noteStorageKey);
      setDailyNote(saved ?? "");
      setNoteSaved(false);
    } catch {
      setDailyNote("");
      setNoteSaved(false);
    }
  }, [noteStorageKey]);

  const periodInvoices = useMemo(
    () => invoices.filter((inv) => {
      const invoiceDate = (inv.createdAt || "").slice(0, 10);
      return invoiceDate >= fromDate && invoiceDate <= toDate;
    }),
    [invoices, fromDate, toDate],
  );

  const periodExpenses = useMemo(
    () => expenses.filter((exp) => exp.expenseDate >= fromDate && exp.expenseDate <= toDate),
    [expenses, fromDate, toDate],
  );

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return periodInvoices.filter((inv) => {
      if (customerFilter && inv.customerId !== customerFilter) return false;
      if (typeFilter === "cash" && inv.monthlyInstallment && inv.monthlyInstallment > 0) return false;
      if (typeFilter === "installment" && !(inv.monthlyInstallment && inv.monthlyInstallment > 0)) return false;
      if (statusFilter !== "all" && invoiceStatusKey(inv) !== statusFilter) return false;
      if (!query) return true;
      const customer = customers.find((c) => c.id === inv.customerId);
      return [customer?.name, customer?.phone, inv.id].some((value) =>
        String(value ?? "").toLowerCase().includes(query),
      );
    });
  }, [periodInvoices, customerFilter, typeFilter, statusFilter, searchQuery, customers]);

  const totals = useMemo(() => {
    const cashInvoices = filteredInvoices.filter((inv) => !inv.monthlyInstallment || inv.monthlyInstallment === 0);
    const installmentInvoices = filteredInvoices.filter((inv) => inv.monthlyInstallment && inv.monthlyInstallment > 0);
    const totalSales = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = filteredInvoices.reduce((sum, inv) => sum + inv.paid, 0);
    const totalRemaining = filteredInvoices.reduce((sum, inv) => sum + Math.max(0, inv.total - inv.paid), 0);
    return {
      invoiceCount: filteredInvoices.length,
      cashSales: cashInvoices.reduce((s, inv) => s + inv.total, 0),
      installmentSales: installmentInvoices.reduce((s, inv) => s + inv.total, 0),
      totalSales,
      totalPaid,
      totalRemaining,
      unpaidCount: filteredInvoices.filter((inv) => invoiceStatusKey(inv) === "unpaid").length,
      partialCount: filteredInvoices.filter((inv) => invoiceStatusKey(inv) === "partial").length,
      paidCount: filteredInvoices.filter((inv) => invoiceStatusKey(inv) === "paid").length,
    };
  }, [filteredInvoices]);

  const expenseTotal = periodExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const paymentTotals = useMemo(() => {
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const paymentsInPeriod = payments.filter((payment) => {
      const paymentDate = (payment.paidAt || "").slice(0, 10);
      return paymentDate >= fromDate && paymentDate <= toDate;
    });
    const followUpPaid = paymentsInPeriod.reduce(
      (result, payment) => {
        const invoice = invoiceById.get(payment.invoiceId);
        if (!invoice) return result;
        if (invoice.monthlyInstallment > 0) result.installment += payment.amount;
        else result.cash += payment.amount;
        return result;
      },
      { cash: 0, installment: 0 },
    );
    const downPaymentsInPeriod = periodInvoices.reduce(
      (result, invoice) => {
        if (invoice.monthlyInstallment > 0) result.installment += invoice.downPayment;
        else result.cash += invoice.downPayment;
        return result;
      },
      { cash: 0, installment: 0 },
    );
    const cash = followUpPaid.cash + downPaymentsInPeriod.cash;
    const installment = followUpPaid.installment + downPaymentsInPeriod.installment;
    return { cash, installment, total: cash + installment };
  }, [invoices, payments, fromDate, toDate, periodInvoices]);
  const netCash = paymentTotals.total - expenseTotal;
  const hasFilters = Boolean(customerFilter || typeFilter !== "all" || statusFilter !== "all" || searchQuery.trim());
  const formatPeriodDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const selectedDateLabel = fromDate === toDate
    ? formatPeriodDate(fromDate)
    : `من ${formatPeriodDate(fromDate)} إلى ${formatPeriodDate(toDate)}`;

  const updateFromDate = (date: string) => {
    setFromDate(date);
    if (date > toDate) setToDate(date);
  };

  const updateToDate = (date: string) => {
    setToDate(date);
    if (date < fromDate) setFromDate(date);
  };

  const resetFilters = () => {
    setCustomerFilter("");
    setTypeFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
  };

  const goToExpenses = () => navigate("/expenses");

  const customersOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers],
  );

  const exportCSV = () => {
    const rows = filteredInvoices.map((inv) => {
      const customer = customers.find((c) => c.id === inv.customerId);
      const name = customer?.name ?? "زبون";
      const time = (inv.createdAt || "").slice(11, 16);
      const type = inv.monthlyInstallment && inv.monthlyInstallment > 0 ? "قسط" : "فوري";
      const remaining = Math.max(0, inv.total - inv.paid);
      const status = invoiceStatus(inv);
      return [invoiceNumber(invoices, inv.id), time, name, inv.total, inv.paid, remaining, type, status];
    });

    const header = ["رقم","الوقت","العميل","الإجمالي","مدفوع","متبقي","نوع","الحالة"];
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-${fromDate}-to-${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const rows = filteredInvoices
      .map((inv, index) => {
        const customer = customers.find((c) => c.id === inv.customerId);
        const name = customer?.name ?? "زبون";
        const time = (inv.createdAt || "").slice(11, 16);
        const type = inv.monthlyInstallment && inv.monthlyInstallment > 0 ? "قسط" : "فوري";
        const remaining = Math.max(0, inv.total - inv.paid);
        const status = invoiceStatus(inv);
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${time}</td>
            <td>${escapeHtml(name)}</td>
            <td class="num">${fmt(inv.total)}</td>
            <td class="num ok">${fmt(inv.paid)}</td>
            <td class="num ${remaining > 0 ? "due" : ""}">${fmt(remaining)}</td>
            <td>${type}</td>
            <td>${status}</td>
          </tr>`;
      })
      .join("");

    const expenseRows = periodExpenses
      .map((exp, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(exp.expenseDate)}</td>
          <td>${escapeHtml(expenseCategoryLabel(exp.category))}</td>
          <td class="num due">${fmt(exp.amount)} ج.م</td>
          <td>${escapeHtml(exp.notes ?? "—")}</td>
        </tr>`)
      .join("");

    const htmlBody = `
      <h2 class="sec">تقرير اليومية — ${escapeHtml(selectedDateLabel)}</h2>
      <div class="info">
        <div class="box"><b>عدد الفواتير</b> ${totals.invoiceCount}</div>
        <div class="box"><b>إجمالي المبيعات</b> ${fmt(totals.totalSales)} ج.م</div>
        <div class="box"><b>المسدد</b> ${fmt(totals.totalPaid)} ج.م</div>
        <div class="box"><b>المتبقي</b> ${fmt(totals.totalRemaining)} ج.م</div>
      </div>
      <div class="t-wrap"><table>
        <thead><tr><th>م</th><th>الوقت</th><th>العميل</th><th class="num">الإجمالي</th><th class="num">مدفوع</th><th class="num">متبقي</th><th>نوع</th><th>الحالة</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8" class="empty">لا توجد فواتير للتاريخ المحدد</td></tr>`}</tbody>
      </table></div>
      <h2 class="sec">مصروفات اليوم</h2>
      <div class="t-wrap"><table>
        <thead><tr><th>م</th><th>التاريخ</th><th>التصنيف</th><th class="num">المبلغ</th><th>ملاحظات</th></tr></thead>
        <tbody>${expenseRows || `<tr><td colspan="5" class="empty">لا توجد مصروفات لهذا اليوم</td></tr>`}</tbody>
      </table></div>
      <div class="total-bar"><span>صافي التحصيل بعد المصروفات</span><span class="v">${fmt(netCash)} ج.م</span></div>
    `;

    const html = pdfDocument({
      docTitle: `تقرير اليومية - ${fromDate} إلى ${toDate}`,
      badge: "اليومية",
      title: "تقرير اليومية",
      lede: `ملخّص المبيعات والمصروفات للفترة ${selectedDateLabel}`,
      meta: [
        { label: "الفترة", value: `${fromDate} — ${toDate}` },
        { label: "عدد الفواتير", value: String(totals.invoiceCount) },
        { label: "إجمالي المصروفات", value: `${fmt(expenseTotal)} ج.م` },
      ],
      kpis: [
        { label: "إجمالي المبيعات", value: `${fmt(totals.totalSales)} ج.م`, tone: "brand" },
        { label: "المسدد", value: `${fmt(totals.totalPaid)} ج.م` },
        { label: "المتبقي", value: `${fmt(totals.totalRemaining)} ج.م`, tone: "danger" },
        { label: "مصروفات اليوم", value: `${fmt(expenseTotal)} ج.م`, tone: "warn" },
      ],
      body: htmlBody,
      page: "A4",
    });

    if (!openPdfDocument(html, { autoPrint: true, features: "width=980,height=760" })) {
      toast.error("الرجاء السماح بفتح النوافذ المنبثقة لتصدير PDF");
      return;
    }
    toast.success("جاري تجهيز نسخة PDF... استعمل نافذة الطباعة لحفظها.");
  };

  const saveNote = () => {
    try {
      localStorage.setItem(noteStorageKey, dailyNote.trim());
      setNoteSaved(true);
      toast.success("تم حفظ الملاحظة");
    } catch {
      toast.error("حدث خطأ أثناء حفظ الملاحظة");
    }
  };

  const PageContent = () => (
    <div className="pb-8">
      <header className="mb-7 flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 text-right">
          <div className="mb-3 flex flex-wrap items-center justify-start gap-2 text-xs text-muted-foreground">
            <span className="eyebrow bg-primary/[0.08] text-primary shadow-none">تشغيل يومي</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" /> آخر تحديث الآن</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-start gap-x-4 gap-y-1">
            <h1 className="text-display text-4xl font-extrabold text-foreground sm:text-5xl">اليومية</h1>
            <p className="text-sm font-medium text-muted-foreground">{selectedDateLabel}</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">ملخص الحركة المالية والملاحظات في مكان واحد.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="group h-11 gap-2 px-4">
                <Download className="h-4 w-4" strokeWidth={1.4} />
                تصدير <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={1.4} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40 rounded-2xl border-white/[0.09] bg-popover p-1.5 shadow-[0_20px_45px_-28px_rgba(0,0,0,.9)]">
              <DropdownMenuItem onSelect={exportPDF} className="cursor-pointer rounded-xl px-3 py-2.5"><FileDown className="h-4 w-4" strokeWidth={1.4} /> تصدير PDF</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportCSV} className="cursor-pointer rounded-xl px-3 py-2.5"><FileText className="h-4 w-4" strokeWidth={1.4} /> تصدير CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant={privacy ? "default" : "outline"} onClick={toggle} aria-pressed={privacy} className="h-11 gap-2 px-4" title={privacy ? "إظهار الأرقام" : "إخفاء الأرقام"}>
            {privacy ? <EyeOff className="h-4 w-4" strokeWidth={1.4} /> : <Eye className="h-4 w-4" strokeWidth={1.4} />}
            <span className="hidden sm:inline">{privacy ? "إظهار الأرقام" : "إخفاء الأرقام"}</span>
          </Button>
          <Button onClick={goToExpenses} className="group h-11 gap-2 px-2 pr-5">
            <span>إضافة مصروف</span><span className="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-x-0.5 group-hover:scale-105"><Plus className="h-4 w-4" strokeWidth={1.5} /></span>
          </Button>
        </div>
      </header>

      <BezelCard className="mb-6" innerClassName="p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4 text-primary" strokeWidth={1.4} /> فلترة اليومية</div>
            {hasFilters && <button type="button" onClick={resetFilters} className="text-xs font-semibold text-muted-foreground transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-primary">مسح الفلاتر</button>}
          </div>
          <div className="grid items-center gap-3 lg:grid-cols-[minmax(330px,1.25fr)_minmax(220px,1fr)_repeat(3,minmax(0,.7fr))]">
            <div className="flex h-11 items-center gap-2 rounded-2xl bg-foreground/[0.035] px-3 ring-1 ring-white/[0.06]">
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">من</span>
              <DateField value={fromDate} onChange={updateFromDate} placeholder="تاريخ البداية" className="min-w-0 flex-1 [&_button]:h-9 [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-1 [&_button]:shadow-none" />
              <span className="h-4 w-px shrink-0 bg-white/[0.1]" />
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">إلى</span>
              <DateField value={toDate} onChange={updateToDate} placeholder="تاريخ النهاية" className="min-w-0 flex-1 [&_button]:h-9 [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-1 [&_button]:shadow-none" />
            </div>
            <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.4} /><Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-11 border-white/[0.06] bg-foreground/[0.035] pr-10 shadow-none" placeholder="ابحث باسم العميل أو رقم الفاتورة" /></div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}><SelectTrigger className="h-11 border-white/[0.06] bg-foreground/[0.035] shadow-none"><SelectValue placeholder="كل العملاء" /></SelectTrigger><SelectContent><SelectItem value="">كل العملاء</SelectItem>{customersOptions.map((customer) => <SelectItem key={customer.value} value={customer.value}>{customer.label}</SelectItem>)}</SelectContent></Select>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}><SelectTrigger className="h-11 border-white/[0.06] bg-foreground/[0.035] shadow-none"><SelectValue placeholder="كل الأنواع" /></SelectTrigger><SelectContent><SelectItem value="all">كل الأنواع</SelectItem><SelectItem value="cash">فوري</SelectItem><SelectItem value="installment">قسط</SelectItem></SelectContent></Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}><SelectTrigger className="h-11 border-white/[0.06] bg-foreground/[0.035] shadow-none"><SelectValue placeholder="كل الحالات" /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="paid">مدفوعة</SelectItem><SelectItem value="partial">مدفوعة جزئياً</SelectItem><SelectItem value="unpaid">غير مدفوعة</SelectItem></SelectContent></Select>
          </div>
        </div>
      </BezelCard>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        {[
          { label: "الفواتير", value: String(totals.invoiceCount), hint: totals.invoiceCount ? `${totals.invoiceCount} حركة في الفترة` : "لا توجد حركة في الفترة", icon: ReceiptText, tone: "text-muted-foreground", chip: "bg-white/[0.06]" },
          { label: "إجمالي المبيعات", value: fmtMoney(totals.totalSales), hint: totals.totalSales ? "إجمالي قيمة الفواتير" : "لا توجد مبيعات في الفترة", icon: CircleDollarSign, tone: "text-amber-300", chip: "bg-amber-300/10" },
          { label: "مبيعات الفوري", value: fmtMoney(totals.cashSales), hint: totals.cashSales ? "فواتير فورية في الفترة" : "لا توجد مبيعات فورية", icon: CircleDollarSign, tone: "text-amber-200", chip: "bg-amber-200/10" },
          { label: "مبيعات القسط", value: fmtMoney(totals.installmentSales), hint: totals.installmentSales ? "فواتير تقسيط في الفترة" : "لا توجد مبيعات بالأقساط", icon: CircleDollarSign, tone: "text-amber-400", chip: "bg-amber-400/10" },
          { label: "المدفوع", value: fmtMoney(paymentTotals.total), hint: paymentTotals.total ? "كل تحصيلات الفترة" : "لا توجد تحصيلات في الفترة", icon: CheckCircle2, tone: "text-emerald-400", chip: "bg-emerald-400/10" },
          { label: "مدفوع الفوري", value: fmtMoney(paymentTotals.cash), hint: paymentTotals.cash ? "تحصيلات الفوري في الفترة" : "لا يوجد تحصيل فوري", icon: CheckCircle2, tone: "text-emerald-300", chip: "bg-emerald-300/10" },
          { label: "مدفوع القسط", value: fmtMoney(paymentTotals.installment), hint: paymentTotals.installment ? "أقساط مُحصّلة في الفترة" : "لا توجد أقساط مُحصّلة", icon: CheckCircle2, tone: "text-emerald-500", chip: "bg-emerald-500/10" },
          { label: "المتبقي", value: fmtMoney(totals.totalRemaining), hint: totals.totalRemaining ? "يحتاج إلى متابعة" : "لا توجد مستحقات في الفترة", icon: Wallet, tone: "text-primary", chip: "bg-primary/10" },
        ].map(({ label, value, hint, icon: Icon, tone, chip }) => (
          <section key={label} className="rounded-[1.45rem] bg-card/70 px-4 py-4 ring-1 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] sm:px-5">
            <div className="flex items-start justify-between gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{label}</span><span className={`grid h-8 w-8 place-items-center rounded-full ${chip} ${tone}`}><Icon className="h-4 w-4" strokeWidth={1.35} /></span></div>
            <div className={`text-numeric mt-4 text-xl font-extrabold leading-none sm:text-2xl ${tone} ${privacy ? "privacy-blur" : "privacy-clear"}`}>{value}</div>
            <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(290px,3fr)]">
        <BezelCard innerClassName="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <div><h2 className="text-base font-bold">حركة الفترة</h2><p className="mt-1 text-xs text-muted-foreground">{filteredInvoices.length} من {periodInvoices.length} فاتورة مطابقة</p></div>
            <span className="rounded-full bg-foreground/[0.05] px-3 py-1 text-[11px] font-semibold text-muted-foreground">{selectedDateLabel}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[730px] text-right text-[13px]">
              <thead>
                <tr className="bg-foreground/[0.025] text-[11px] font-semibold text-muted-foreground">
                  <th className="py-3.5 pr-5 sm:pr-6">رقم</th>
                  <th className="py-3.5 pr-4">الوقت</th>
                  <th className="py-3.5 pr-4">العميل</th>
                  <th className="py-3.5 pr-4">الإجمالي</th>
                  <th className="py-3.5 pr-4">مدفوع</th>
                  <th className="py-3.5 pr-4">متبقي</th>
                  <th className="py-3.5 pr-4">نوع</th>
                  <th className="py-3.5 pr-4">الحالة</th>
                  <th className="py-3.5 pr-4">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-0">
                      <div className="flex min-h-[330px] flex-col items-center justify-center px-6 text-center">
                        <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15"><ReceiptText className="h-6 w-6" strokeWidth={1.25} /></span>
                        <h3 className="mt-5 text-lg font-bold">لا توجد حركة مسجلة في هذه الفترة</h3>
                        <p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">غيّر نطاق التاريخ أو أزل الفلاتر، أو ابدأ بتسجيل مصروف جديد.</p>
                        <Button size="sm" onClick={goToExpenses} className="mt-5 gap-2"><Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> إضافة مصروف</Button>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredInvoices.map((inv) => {
                  const customer = customers.find((c) => c.id === inv.customerId);
                  const name = customer?.name ?? "زبون";
                  const time = (inv.createdAt || "").slice(11, 16);
                  const type = inv.monthlyInstallment && inv.monthlyInstallment > 0 ? "قسط" : "فوري";
                  const remaining = Math.max(0, inv.total - inv.paid);
                  const status = invoiceStatus(inv);
                  return (
                    <tr key={inv.id} className="border-t border-white/[0.05] transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-foreground/[0.025]">
                      <td className="py-4 pr-5 font-mono text-xs sm:pr-6" data-latin-digits dir="ltr">{invoiceNumber(invoices, inv.id)}</td>
                      <td className="py-3 pr-4">{time}</td>
                      <td className="py-3 pr-4">{name}</td>
                      <td className={`py-3 pr-4 ${privacy ? "privacy-blur" : "privacy-clear"}`}>{fmtMoney(inv.total)}</td>
                      <td className={`py-4 pr-4 text-emerald-400 ${privacy ? "privacy-blur" : "privacy-clear"}`}>{fmtMoney(inv.paid)}</td>
                      <td className={`py-4 pr-4 text-primary ${privacy ? "privacy-blur" : "privacy-clear"}`}>{fmtMoney(remaining)}</td>
                      <td className="py-4 pr-4"><span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px]">{type}</span></td>
                      <td className="py-4 pr-4"><span className="text-xs">{status}</span></td>
                      <td className="py-4 pr-4">
                        <Link to="/invoices" className="text-xs font-semibold text-primary transition-colors hover:text-primary/75">عرض</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BezelCard>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <BezelCard innerClassName="p-5 sm:p-6">
            <div className="space-y-6">
              <section>
                <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold">نبذة الفترة</h2><span className="text-xs text-muted-foreground">{fromDate} — {toDate}</span></div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl bg-foreground/[0.035] p-3.5 ring-1 ring-white/[0.05]"><div className="text-[11px] text-muted-foreground">مصروفات الفترة</div><div className={`text-numeric mt-2 text-lg font-extrabold text-amber-300 ${privacy ? "privacy-blur" : "privacy-clear"}`}>{fmtMoney(expenseTotal)}</div></div>
                  <div className="rounded-2xl bg-foreground/[0.035] p-3.5 ring-1 ring-white/[0.05]"><div className="text-[11px] text-muted-foreground">الصافي</div><div className={`text-numeric mt-2 text-lg font-extrabold text-emerald-400 ${privacy ? "privacy-blur" : "privacy-clear"}`}>{fmtMoney(netCash)}</div></div>
                </div>
              </section>
              <div className="h-px bg-white/[0.06]" />
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold">ملاحظة اليوم</h2><span className="text-[11px] text-muted-foreground">تُحفظ تلقائيًا حسب التاريخ</span></div>
              <Textarea
                value={dailyNote}
                onChange={(e) => { setDailyNote(e.target.value); setNoteSaved(false); }}
                rows={4}
                className="border-white/[0.06] bg-foreground/[0.035] shadow-none"
                placeholder="سجل ملاحظات أو أحداث اليوم هنا..."
              />
              <div className="flex items-center justify-between gap-3">
                <Button size="sm" variant={noteSaved ? "outline" : "secondary"} onClick={saveNote} disabled={noteSaved}>
                  {noteSaved ? "محفوظ" : "حفظ الملاحظة"}
                </Button>
              </div>
              </section>
            </div>
          </BezelCard>
        </aside>
      </div>
    </div>
  );

  return (
    <AppShell>
      <PageTransition>
        <PageContent />
      </PageTransition>
    </AppShell>
  );
}
