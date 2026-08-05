import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { BezelCard } from "@/components/BezelCard";
import { DateField } from "@/components/DateField";
import { AppShell } from "@/components/AppShell";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Wallet, Filter } from "lucide-react";
import { db, useDB, fmt, EXPENSE_CATEGORIES, expenseCategoryLabel, type ExpenseCategory } from "@/lib/store";
import { pdfDocument, openPdfDocument } from "@/lib/pdf-doc";
import { toast } from "sonner";

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
  const { invoices, customers, expenses, loading } = useDB();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [customerFilter, setCustomerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "cash" | "installment">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("other");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  const noteStorageKey = `daily-log-note:${selectedDate}`;

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

  const todaysInvoices = useMemo(
    () => invoices.filter((inv) => (inv.createdAt || "").slice(0, 10) === selectedDate),
    [invoices, selectedDate],
  );

  const todaysExpenses = useMemo(
    () => expenses.filter((exp) => exp.expenseDate === selectedDate),
    [expenses, selectedDate],
  );

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return todaysInvoices.filter((inv) => {
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
  }, [todaysInvoices, customerFilter, typeFilter, statusFilter, searchQuery, customers]);

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

  const expenseTotal = todaysExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const netCash = totals.totalPaid - expenseTotal;

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
      return [inv.id.slice(0, 8), time, name, inv.total, inv.paid, remaining, type, status];
    });

    const header = ["رقم","الوقت","العميل","الإجمالي","مدفوع","متبقي","نوع","الحالة"];
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-${selectedDate}.csv`;
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

    const expenseRows = todaysExpenses
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
      <h2 class="sec">تقرير اليومية — ${new Date(selectedDate).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</h2>
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
      docTitle: `تقرير اليومية - ${selectedDate}`,
      badge: "اليومية",
      title: "تقرير اليومية",
      lede: `ملخّص المبيعات والمصروفات لليوم ${new Date(selectedDate).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`,
      meta: [
        { label: "التاريخ", value: selectedDate },
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

  const addExpense = async () => {
    const amount = Number(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error("أدخل مبلغ مصروف صحيح");
      return;
    }
    setSavingExpense(true);
    try {
      await db.addExpense({
        amount,
        category: expenseCategory,
        expenseDate: selectedDate,
        notes: expenseNotes.trim() || null,
      });
      setExpenseAmount("");
      setExpenseNotes("");
      toast.success("تم إضافة المصروف");
    } catch (error: any) {
      toast.error(error?.message ?? "فشل إضافة المصروف");
    } finally {
      setSavingExpense(false);
    }
  };

  const PageContent = () => (
    <div>
      <PageHeader
        title="اليومية"
        subtitle="لوحة التحكم اليومية للمبيعات، المصروفات، والملاحظات"
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" onClick={exportCSV} className="gap-2"><FileText className="w-4 h-4" /> CSV</Button>
            <Button size="sm" onClick={exportPDF} className="gap-2"><Wallet className="w-4 h-4" /> PDF</Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_320px] mb-6">
        <BezelCard className="p-5">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">التاريخ</div>
                <DateField
                  value={selectedDate}
                  onChange={(iso) => setSelectedDate(iso)}
                  placeholder="اختر تاريخ"
                  quickActions={[
                    { label: "اليوم", date: () => new Date() },
                    { label: "أمس", date: () => new Date(Date.now() - 86400000) },
                  ]}
                />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">بحث</div>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالعميل أو رقم الفاتورة"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-full"><SelectValue placeholder="كل العملاء" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">كل العملاء</SelectItem>
                  {customersOptions.map((customer) => (
                    <SelectItem key={customer.value} value={customer.value}>{customer.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as any)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="نوع الفاتورة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="cash">فوري</SelectItem>
                  <SelectItem value="installment">قسط</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="حالة السداد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="paid">مدفوعة</SelectItem>
                  <SelectItem value="partial">مدفوعة جزئياً</SelectItem>
                  <SelectItem value="unpaid">غير مدفوعة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </BezelCard>

        <BezelCard className="p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Filter className="w-4 h-4 text-primary" />
              <span>فلترة السجلات الحالية</span>
            </div>
            <div className="grid gap-3 rounded-3xl border border-border bg-background/80 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>الفواتير المحددة</span>
                <span className="font-semibold">{filteredInvoices.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>الفواتير الإجمالية لهذا التاريخ</span>
                <span className="font-semibold">{todaysInvoices.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>إجمالي المصروفات</span>
                <span className="font-semibold">{fmtMoney(expenseTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>صافي التحصيل</span>
                <span className="font-semibold">{fmtMoney(netCash)}</span>
              </div>
            </div>
          </div>
        </BezelCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4 mb-6">
        <MetricCard label="الفواتير" value={totals.invoiceCount} format={(n) => String(Math.round(n))} icon={FileText} tone="neutral" isMoney={false} />
        <MetricCard label="إجمالي المبيعات" value={totals.totalSales} format={fmtMoney} icon={Wallet} tone="positive" />
        <MetricCard label="المدفوع" value={totals.totalPaid} format={fmtMoney} icon={Wallet} tone="positive" />
        <MetricCard label="المتبقي" value={totals.totalRemaining} format={fmtMoney} icon={FileText} tone="danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] mb-6">
        <BezelCard>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-muted-foreground text-[12px]">
                  <th className="py-3 pr-4">رقم</th>
                  <th className="py-3 pr-4">الوقت</th>
                  <th className="py-3 pr-4">العميل</th>
                  <th className="py-3 pr-4">الإجمالي</th>
                  <th className="py-3 pr-4">مدفوع</th>
                  <th className="py-3 pr-4">متبقي</th>
                  <th className="py-3 pr-4">نوع</th>
                  <th className="py-3 pr-4">الحالة</th>
                  <th className="py-3 pr-4">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">لا توجد فواتير تتوافق مع الفلاتر</td>
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
                    <tr key={inv.id} className="border-t border-[var(--hairline)] transition-colors duration-300 hover:bg-foreground/[0.03]">
                      <td className="py-3 pr-4 font-mono text-xs">{inv.id.slice(0, 8)}</td>
                      <td className="py-3 pr-4">{time}</td>
                      <td className="py-3 pr-4">{name}</td>
                      <td className="py-3 pr-4">{fmtMoney(inv.total)}</td>
                      <td className="py-3 pr-4">{fmtMoney(inv.paid)}</td>
                      <td className="py-3 pr-4">{fmtMoney(remaining)}</td>
                      <td className="py-3 pr-4">{type}</td>
                      <td className="py-3 pr-4">{status}</td>
                      <td className="py-3 pr-4">
                        <Link to="/invoices" className="text-primary hover:underline">اذهب للفواتير</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BezelCard>

        <div className="space-y-4">
          <BezelCard className="p-5">
            <div className="space-y-4">
              <div className="text-sm font-semibold">معلومات اليوم</div>
              <div className="grid gap-3">
                <div className="rounded-3xl border border-border bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">مصروفات اليوم</div>
                  <div className="mt-2 text-xl font-semibold">{fmtMoney(expenseTotal)}</div>
                </div>
                <div className="rounded-3xl border border-border bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">صافي بعد المصروفات</div>
                  <div className="mt-2 text-xl font-semibold">{fmtMoney(netCash)}</div>
                </div>
              </div>
            </div>
          </BezelCard>

          <BezelCard className="p-5">
            <div className="space-y-4">
              <div className="text-sm font-semibold">ملاحظة اليوم</div>
              <Textarea
                value={dailyNote}
                onChange={(e) => { setDailyNote(e.target.value); setNoteSaved(false); }}
                rows={6}
                placeholder="سجل ملاحظات أو أحداث اليوم هنا..."
              />
              <div className="flex items-center justify-between gap-3">
                <Button size="sm" onClick={saveNote} disabled={noteSaved}>
                  {noteSaved ? "محفوظ" : "حفظ الملاحظة"}
                </Button>
                <span className="text-xs text-muted-foreground">يمكنك العودة للملاحظة بعد تغيير التاريخ</span>
              </div>
            </div>
          </BezelCard>

          <BezelCard className="p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">إضافة مصروف</div>
                <span className="text-xs text-muted-foreground">التاريخ: {selectedDate}</span>
              </div>
              <div className="grid gap-3">
                <Input
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="المبلغ"
                  inputMode="decimal"
                />
                <Select value={expenseCategory} onValueChange={(value) => setExpenseCategory(value as ExpenseCategory)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  rows={3}
                  placeholder="ملاحظات المصروف (اختياري)"
                />
                <Button size="sm" onClick={addExpense} disabled={savingExpense}>
                  إضافة مصروف
                </Button>
              </div>
            </div>
          </BezelCard>
        </div>
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
