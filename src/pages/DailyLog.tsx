import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { BezelCard } from "@/components/BezelCard";
import { FileText, Wallet } from "lucide-react";
import { useDB } from "@/lib/store";

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

  return (
    <div>
      <PageHeader title="اليومية" subtitle="ملخّص فواتير ومبيعات اليوم" />

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
}
