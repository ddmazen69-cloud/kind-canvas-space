import { PageTransition } from "@/components/PageTransition";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useDB, fmt, invoiceNumber } from "@/lib/store";
import { Banknote, Search } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/lib/privacy";

export default function Page() { return (<AppShell><PageTransition><PaymentsPage /></PageTransition></AppShell>); }

function PaymentsPage() {
  const { customers, invoices, payments } = useDB();
  const [q, setQ] = useState("");
  const { privacy } = usePrivacy();

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  const rows = useMemo(() => {
    return payments
      .map((p) => {
        const inv = invoiceById.get(p.invoiceId);
        const cust = inv ? customerById.get(inv.customerId) : undefined;
        return { p, inv, cust };
      })
      .filter(({ cust }) => (q ? (cust?.name ?? "").includes(q) : true))
      .sort((a, b) => new Date(b.p.paidAt).getTime() - new Date(a.p.paidAt).getTime());
  }, [payments, invoiceById, customerById, q]);

  const total = rows.reduce((s, r) => s + r.p.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="المدفوعات"
        subtitle="سجل كل عمليات السداد المسجلة لكل العملاء."
        icon={<Banknote className="w-6 h-6 text-success" />}
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم العميل..."
          className="pr-9"
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{rows.length} عملية</div>
        <div className="rounded-full bg-success/10 px-4 py-1.5 text-sm font-bold text-success ring-1 ring-success/20">
          الإجمالي: <span className={cn(privacy && "privacy-blur")}>{fmt(total)} ج.م</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bezel-shell">
          <div className="bezel-core px-6 py-10">
            <EmptyState icon={Banknote} title="لا توجد مدفوعات." hint="أي سداد يُسجَّل على فاتورة سيظهر هنا في سجل شامل لكل العملاء." />
          </div>
        </div>
      ) : (
        <div className="bezel-shell">
          <div className="bezel-core p-2">
            <ScrollArea className="max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="bg-foreground/[0.04] text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-right p-3 font-medium">#</th>
                    <th className="text-right p-3 font-medium">التاريخ</th>
                    <th className="text-right p-3 font-medium">العميل</th>
                    <th className="text-right p-3 font-medium">الفاتورة</th>
                    <th className="text-right p-3 font-medium">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, inv, cust }, i) => {
                    const d = new Date(p.paidAt);
                    return (
                      <tr key={p.id} className="border-t border-[var(--hairline)] hover:bg-foreground/[0.035]">
                        <td className="p-3 text-muted-foreground">{rows.length - i}</td>
                        <td className="p-3" dir="ltr">
                          {d.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" })}
                          <span className="text-xs text-muted-foreground"> {d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                        </td>
                        <td className="p-3">
                          {cust ? (
                            <Link to="/customers/$customerId" params={{ customerId: cust.id }} className="font-semibold text-primary hover:underline">
                              {cust.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{inv ? invoiceNumber(invoices, p.invoiceId) : "—"}</td>
                        <td className={cn("p-3 font-bold text-success", privacy && "privacy-blur")}>+ {fmt(p.amount)} ج.م</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
