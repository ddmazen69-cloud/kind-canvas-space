import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { useDB } from "@/lib/store";
import { fmt } from "@/lib/store";
import { Link } from "@/lib/router-compat";

export default function Page() {
  const { payments, customers } = useDB();

  const paymentsWithCustomer = payments
    .slice()
    .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""))
    .map((p) => ({
      ...p,
      customer: customers.find((c) => c.id === p.customerId) ?? null,
    }));

  return (
    <AppShell>
      <PageTransition>
        <PageHeader title="المدفوعات" subtitle="سجل المدفوعات المسجلة" />

        <div className="mt-6">
          {paymentsWithCustomer.length === 0 ? (
            <div className="bezel-shell p-6 text-center text-muted-foreground">لم يتم تسجيل أي دفعات بعد.</div>
          ) : (
            <div className="bezel-shell p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2">التاريخ</th>
                    <th className="py-2">العميل</th>
                    <th className="py-2">المبلغ</th>
                    <th className="py-2">الطريقة</th>
                    <th className="py-2">الملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsWithCustomer.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--hairline)]">
                      <td className="py-3">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("ar-EG") : "-"}</td>
                      <td className="py-3">
                        {p.customer ? (
                          <Link to={`/customers/${p.customer.id}`} className="text-primary underline">{p.customer.name}</Link>
                        ) : (
                          <span className="text-muted-foreground">عميل محذوف</span>
                        )}
                      </td>
                      <td className="py-3">{fmt(p.amount)} ج.م</td>
                      <td className="py-3">{p.method || "—"}</td>
                      <td className="py-3">{p.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
