import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { BezelCard } from "@/components/BezelCard";
import { FileText, Wallet } from "lucide-react";
import { useDB, fmt } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { PageTransition } from "@/components/PageTransition";
import { pdfDocument, openPdfDocument } from "@/lib/pdf-doc";
import { toast } from "sonner";

function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>\"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c] ?? c));
}

function fmtMoney(n: number) {
  return `${Math.round(n).toLocaleString()} ج.م`;
}

export default function DailyLog() {
  const { invoices, customers, loading } = useDB();
  const today = new Date().toISOString().slice(0, 10);
  const todays = invoices.filter((i) => (i.createdAt || "").slice(0, 10) === today);

  const count = todays.length;
  const cashInvoices = todays.filter((inv) => !inv.monthlyInstallment || inv.monthlyInstallment === 0);
  const installmentInvoices = todays.filter((inv) => inv.monthlyInstallment && inv.monthlyInstallment > 0);
  const sumCash = cashInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const sumInst = installmentInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalPaid = todays.reduce((s, i) => s + Number(i.paid || 0), 0);
  const totalRemaining = todays.reduce((s, i) => s + Math.max(0, Number(i.total || 0) - Number(i.paid || 0)), 0);

  function exportCSV() {
    const rows = todays.map((inv) => {
      const cust = customers.find((c) => c.id === inv.customerId);
      const name = cust?.name ?? "زبون";
      const time = (inv.createdAt || "").slice(11, 16);
      const type = inv.monthlyInstallment && inv.monthlyInstallment > 0 ? "قسط" : "فوري";
      const remaining = Math.max(0, Number(inv.total || 0) - Number(inv.paid || 0));
      const status = remaining <= 0 ? "مسددة" : "مفتوحة";
      return [
        (inv.id || "").slice(0, 8),
        time,
        name,
        String(inv.total || 0),
        String(inv.paid || 0),
        String(remaining),
        type,
        status,
      ];
    });
    const header = ["رقم","الوقت","العميل","الإجمالي","مدفوع","متبقي","نوع","الحالة"];
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const rows = todays.map((inv, i) => {
      const cust = customers.find((c) => c.id === inv.customerId);
      const name = cust?.name ?? "زبون";
      const time = (inv.createdAt || "").slice(11, 16);
      const type = inv.monthlyInstallment && inv.monthlyInstallment > 0 ? "قسط" : "فوري";
      const remaining = Math.max(0, Number(inv.total || 0) - Number(inv.paid || 0));
      const status = remaining <= 0 ? "مسددة" : "مفتوحة";
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${time}</td>
          <td>${escapeHtml(name)}</td>
          <td class="num">${fmt(Number(inv.total || 0))}</td>
          <td class="num ok">${fmt(Number(inv.paid || 0))}</td>
          <td class="num ${remaining > 0 ? "due" : ""}">${fmt(remaining)}</td>
          <td>${type}</td>
          <td>${status}</td>
        </tr>`;
    }).join("");

    const totalDue = todays.reduce((s, x) => s + Math.max(0, Number(x.total || 0) - Number(x.paid || 0)), 0);
    const totalSales = todays.reduce((s, x) => s + Number(x.total || 0), 0);
    const totalPaidAll = todays.reduce((s, x) => s + Number(x.paid || 0), 0);

    const body = `
      <h2 class="sec">بيانات الفواتير — اليومية</h2>
      <div class="t-wrap"><table>
        <thead><tr>
          <th>م</th><th>الوقت</th><th>العميل</th><th class="num">الإجمالي</th><th class="num">مدفوع</th><th class="num">متبقي</th><th>نوع</th><th>حالة</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="8" class="empty">لا توجد فواتير اليوم</td></tr>`}</tbody>
        <tfoot><tr>
          <td colspan="3">الإجماليات</td>
          <td class="num">${fmt(totalSales)}</td>
          <td class="num ok">${fmt(totalPaidAll)}</td>
          <td class="num">${fmt(totalDue)}</td>
          <td colspan="2">—</td>
        </tr></tfoot>
      </table></div>
      <div class="sig"><div>توقيع المسؤول</div><div>الختم الرسمي</div></div>`;

    const todayLabel = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const html = pdfDocument({
      docTitle: `تقرير اليومية - ${today}`,
      badge: "اليومية",
      title: "تقرير اليومية",
      lede: `ملخّص جميع الفواتير الصادرة في اليوم ${todayLabel}`,
      meta: [
        { label: "تاريخ", value: todayLabel },
        { label: "عدد الفواتير", value: String(todays.length) },
      ],
      kpis: [
        { label: "عدد الفواتير", value: String(todays.length) },
        { label: "إجمالي المبيعات", value: `${fmt(totalSales)} ج.م`, tone: "brand" },
        { label: "إجمالي المدفوع", value: `${fmt(totalPaidAll)} ج.م` },
        { label: "المديونية المتبقية", value: `${fmt(totalDue)} ج.م`, tone: "danger" },
      ],
      body,
      page: "A4",
    });
    if (!openPdfDocument(html, { autoPrint: true, features: "width=980,height=760" })) {
      toast.error("الرجاء السماح بفتح النوافذ المنبثقة لتصدير PDF");
      return;
    }
    toast.success("جاري تجهيز نسخة PDF... استعمل حوار الطباعة لحفظها.");
  }

  const PageContent = () => (
    <div>
      <PageHeader
        title="اليومية"
        subtitle="ملخّص فواتير ومبيعات اليوم"
        action={<div className="flex gap-2"><Button onClick={exportCSV}>تصدير CSV</Button><Button onClick={exportPDF}>تصدير PDF</Button></div>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
        <MetricCard
          label="عدد الفواتير"
          value={count}
          format={(n) => String(Math.round(n))}
          icon={FileText}
          isMoney={false}
          tone="neutral"
        />
        <MetricCard
          label="مبيعات فوري"
          value={sumCash}
          format={fmtMoney}
          icon={Wallet}
          tone="positive"
        />
        <MetricCard
          label="مبيعات قسط"
          value={sumInst}
          format={fmtMoney}
          icon={FileText}
          tone="neutral"
        />
        <MetricCard
          label="المدفوع اليوم"
          value={totalPaid}
          format={fmtMoney}
          icon={Wallet}
          tone="positive"
        />
      </div>

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
              </tr>
            </thead>
            <tbody>
              {todays.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">لا توجد فواتير اليوم</td>
                </tr>
              )}
              {todays.map((inv) => {
                const cust = customers.find((c) => c.id === inv.customerId);
                const name = cust?.name ?? "زبون";
                const time = (inv.createdAt || "").slice(11, 16);
                const type = inv.monthlyInstallment && inv.monthlyInstallment > 0 ? "قسط" : "فوري";
                const remaining = Math.max(0, Number(inv.total || 0) - Number(inv.paid || 0));
                const status = remaining <= 0 ? "مسددة" : "مفتوحة";
                return (
                  <tr key={inv.id} className="border-t border-[var(--hairline)]">
                    <td className="py-3 pr-4">{inv.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{time}</td>
                    <td className="py-3 pr-4">{name}</td>
                    <td className="py-3 pr-4">{fmtMoney(Number(inv.total || 0))}</td>
                    <td className="py-3 pr-4">{fmtMoney(Number(inv.paid || 0))}</td>
                    <td className="py-3 pr-4">{fmtMoney(remaining)}</td>
                    <td className="py-3 pr-4">{type}</td>
                    <td className="py-3 pr-4">{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BezelCard>
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
