import { PageTransition } from "@/components/PageTransition";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useDB, fmt, invoiceNumber } from "@/lib/store";
import { Banknote, CalendarRange, Search, TrendingUp } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/lib/privacy";

export default function Page() { return (<AppShell><PageTransition><PaymentsPage /></PageTransition></AppShell>); }

type Period = "all" | "today" | "week" | "month";

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "today", label: "اليوم" },
  { value: "week", label: "آخر 7 أيام" },
  { value: "month", label: "هذا الشهر" },
];

function isInPeriod(iso: string, period: Period, now = new Date()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "today") return t >= today;
  if (period === "week") return t >= today - 6 * 86400000;
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return t >= start;
  }
  return true;
}

function PaymentsPage() {
  const { customers, invoices, payments, loading } = useDB();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const { privacy } = usePrivacy();

  // فهرس واحد فقط لكل صف، تُحسب فيه أرقام الفواتير مرة واحدة (لا كل render).
  const rows = useMemo(() => {
    if (loading) return [];
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    return payments
      .map((p) => {
        const inv = invoiceById.get(p.invoiceId);
        const cust = inv ? customerById.get(inv.customerId) : undefined;
        const ts = new Date(p.paidAt).getTime();
        return {
          p,
          inv,
          cust,
          ts: Number.isNaN(ts) ? 0 : ts,
          invNo: inv ? invoiceNumber(invoices, p.invoiceId) : "—",
        };
      })
      .sort((a, b) => b.ts - a.ts);
  }, [loading, payments, customers, invoices]);

  const filtered = useMemo(() => {
    return rows.filter(({ cust, ts }) => {
      if (q && !(cust?.name ?? "").includes(q)) return false;
      if (period !== "all" && !isInPeriod(new Date(ts).toISOString(), period)) return false;
      return true;
    });
  }, [rows, q, period]);

  const totalAll = rows.reduce((s, r) => s + r.p.amount, 0);
  const totalFiltered = filtered.reduce((s, r) => s + r.p.amount, 0);
  const todaySum = useMemo(() => rows.filter((r) => isInPeriod(new Date(r.ts).toISOString(), "today")).reduce((s, r) => s + r.p.amount, 0), [rows]);
  const monthSum = useMemo(() => rows.filter((r) => isInPeriod(new Date(r.ts).toISOString(), "month")).reduce((s, r) => s + r.p.amount, 0), [rows]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="المدفوعات" subtitle="سجل كل عمليات السداد المسجلة لكل العملاء." icon={<Banknote className="w-6 h-6 text-success" />} />
        <div className="bezel-shell">
          <div className="bezel-core grid gap-3 p-5 text-sm text-muted-foreground md:grid-cols-3">
            <div className="h-20 animate-pulse rounded-2xl bg-foreground/[0.05]" />
            <div className="h-20 animate-pulse rounded-2xl bg-foreground/[0.05]" />
            <div className="h-20 animate-pulse rounded-2xl bg-foreground/[0.05]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="المدفوعات"
        subtitle="سجل كل عمليات السداد المسجلة لكل العملاء."
        icon={<Banknote className="w-6 h-6 text-success" />}
      />

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl hairline bg-success/10 p-4">
          <div className="text-[11px] font-medium text-muted-foreground">إجمالي المسدد</div>
          <div className={cn("text-numeric mt-1 text-2xl font-extrabold text-success", privacy && "privacy-blur")}>{fmt(totalAll)} ج.م</div>
        </div>
        <div className="rounded-2xl hairline bg-primary/[0.07] p-4">
          <div className="text-[11px] font-medium text-muted-foreground">المسدد هذا الشهر</div>
          <div className={cn("text-numeric mt-1 text-2xl font-extrabold text-primary", privacy && "privacy-blur")}>{fmt(monthSum)} ج.م</div>
        </div>
        <div className="rounded-2xl hairline bg-warning/[0.08] p-4">
          <div className="text-[11px] font-medium text-muted-foreground">المسدد اليوم</div>
          <div className={cn("text-numeric mt-1 text-2xl font-extrabold text-warning", privacy && "privacy-blur")}>{fmt(todaySum)} ج.م</div>
        </div>
        <div className="rounded-2xl hairline bg-foreground/[0.035] p-4">
          <div className="text-[11px] font-medium text-muted-foreground">عدد العمليات</div>
          <div className="text-numeric mt-1 text-2xl font-extrabold">{rows.length}</div>
        </div>
      </div>

      {/* فلاتر: فترة + بحث */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="grid w-full grid-cols-4 md:w-auto">
            {PERIODS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العميل..." className="pr-9" />
        </div>
      </div>

      {/* ملخص الفترة المعروضة */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          {filtered.length} عملية معروضة
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-4 py-1.5 text-sm font-bold text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-success" />
          إجمالي المعروض: <span className={cn("text-success", privacy && "privacy-blur")}>{fmt(totalFiltered)} ج.م</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bezel-shell">
          <div className="bezel-core px-6 py-10">
            <EmptyState
              icon={Banknote}
              title="لا توجد مدفوعات."
              hint="أي سداد يُسجَّل على فاتورة سيظهر هنا في سجل شامل لكل العملاء."
            />
          </div>
        </div>
      ) : (
        <div className="bezel-shell">
          <div className="bezel-core p-2">
            <ScrollArea className="max-h-[60vh]">
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
                  {filtered.map(({ p, cust, invNo, ts }, i) => {
                    const d = new Date(ts);
                    return (
                      <tr key={p.id} className="border-t border-[var(--hairline)] hover:bg-foreground/[0.035]">
                        <td className="p-3 text-muted-foreground">{filtered.length - i}</td>
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
                        <td className="p-3 text-muted-foreground">{invNo}</td>
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
