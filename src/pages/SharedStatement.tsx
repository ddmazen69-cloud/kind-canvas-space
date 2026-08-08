import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSharedStatement } from "@/lib/share.functions";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Loader2, ShieldCheck, FileText, Clock3, XCircle, Ban, CheckCircle2 } from "lucide-react";

function isoToDDMMYYYY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("ar-EG").format(Math.round(n));
}

type Statement =
  | { status: "not_found" | "revoked" | "expired" }
  | {
      status: "ok";
      customer: {
        code: string | null;
        name: string;
        phone: string;
        address: string | null;
        customerType: string;
        joiningDate: string;
      };
      metrics: { balance: number; totalCharged: number; totalPaid: number; paidPct: number; worstLate: number };
      timeline: Array<{
        id: string;
        date: string;
        kind: "opening" | "purchase" | "payment";
        description: string;
        amount: number;
        runningBalance: number;
        invoiceNo?: string;
      }>;
    };

function SharedStatement({ token }: { token: string }) {
  const fetchStatement = useServerFn(getSharedStatement);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [statement, setStatement] = useState<Statement | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetchStatement({ data: { token } })
      .then((res) => {
        if (!active) return;
        setStatement(res as Statement);
        setState("done");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setMessage(e instanceof Error ? e.message : "تعذر تحميل الكشف");
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [token, fetchStatement]);

  const typeLabel = (kind: string) =>
    kind === "purchase" ? "فاتورة" : kind === "opening" ? "رصيد افتتاحي" : "سداد";

  return (
    <div dir="rtl" className="relative min-h-screen overflow-hidden bg-background px-5 py-10">
      <AmbientBackground />
      <div className="relative mx-auto w-full max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <div className="text-lg font-extrabold leading-none">سِجلّي</div>
              <div className="mt-1 text-xs text-muted-foreground">كشف حساب عميل</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString("ar-EG")}
          </div>
        </div>

        {state === "loading" && (
          <div className="bezel-shell">
            <div className="bezel-core flex items-center justify-center gap-3 p-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              بنجهّز الكشف…
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="bezel-shell">
            <div className="bezel-core p-8 text-center">
              <XCircle className="mx-auto mb-3 h-10 w-10 text-danger" />
              <div className="text-lg font-bold">تعذر تحميل الكشف</div>
              <div className="mt-1 text-sm text-muted-foreground">{message}</div>
            </div>
          </div>
        )}

        {state === "done" && statement?.status === "not_found" && (
          <div className="bezel-shell">
            <div className="bezel-core p-8 text-center">
              <XCircle className="mx-auto mb-3 h-10 w-10 text-danger" />
              <div className="text-lg font-bold">الرابط غير صالح</div>
              <div className="mt-1 text-sm text-muted-foreground">لو الرابط ده جه من المحل، تواصل معاهم للتحقق منه.</div>
            </div>
          </div>
        )}

        {state === "done" && statement?.status === "revoked" && (
          <div className="bezel-shell">
            <div className="bezel-core p-8 text-center">
              <Ban className="mx-auto mb-3 h-10 w-10 text-danger" />
              <div className="text-lg font-bold">تم إلغاء هذا الرابط</div>
              <div className="mt-1 text-sm text-muted-foreground">صاحب المحل ألغى هذا الرابط. اطلب رابط جديد من المحل لو محتاج الكشف.</div>
            </div>
          </div>
        )}

        {state === "done" && statement?.status === "expired" && (
          <div className="bezel-shell">
            <div className="bezel-core p-8 text-center">
              <Clock3 className="mx-auto mb-3 h-10 w-10 text-warning" />
              <div className="text-lg font-bold">انتهت صلاحية الرابط</div>
              <div className="mt-1 text-sm text-muted-foreground">الرابط ده منتهي. تواصل مع المحل ليطلعلك كشف جديد.</div>
            </div>
          </div>
        )}

        {state === "done" && statement?.status === "ok" && (
          <div className="space-y-4">
            <div className="bezel-shell">
              <div className="bezel-core p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="text-xl font-extrabold">
                          {statement.customer.code ? `${statement.customer.code} — ` : ""}
                          {statement.customer.name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground" dir="ltr">{statement.customer.phone}</div>
                      </div>
                    </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-2xl bg-foreground/[0.04] p-3 text-center">
                    <div className="text-muted-foreground">العنوان</div>
                    <div className="mt-1 font-bold break-words">{statement.customer.address || "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3 text-center">
                    <div className="text-muted-foreground">تاريخ الانضمام</div>
                    <div className="mt-1 font-bold" dir="ltr">{isoToDDMMYYYY(statement.customer.joiningDate)}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3 text-center">
                    <div className="text-muted-foreground">نوع الدفع</div>
                    <div className="mt-1 font-bold">{statement.customer.customerType === "cash" ? "فوري" : "أقساط"}</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3 text-center">
                    <div className="text-muted-foreground">مبلغ الديون</div>
                    <div className={`mt-1 font-bold ${statement.metrics.balance > 0 ? "text-danger" : "text-success"}`}>
                      {fmt(Math.abs(statement.metrics.balance))} ج.م
                    </div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3 text-center">
                    <div className="text-muted-foreground">إجمالي المعاملات</div>
                    <div className="mt-1 font-bold">{fmt(statement.metrics.totalCharged)} ج.م</div>
                  </div>
                  <div className="rounded-2xl bg-foreground/[0.04] p-3 text-center">
                    <div className="text-muted-foreground">أقصى تأخير</div>
                    <div className="mt-1 font-bold text-warning">{statement.metrics.worstLate > 0 ? `${statement.metrics.worstLate} يوم` : "—"}</div>
                  </div>
                </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bezel-shell">
              <div className="bezel-core p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    سجل الحركات التفصيلي
                  </div>
                  <div className="text-sm font-bold">بالترتيب الزمني</div>
                </div>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="bg-foreground/[0.04] text-muted-foreground">
                      <tr>
                        <th className="p-3 text-right">م</th>
                        <th className="p-3 text-right">التاريخ</th>
                        <th className="p-3 text-right">النوع</th>
                        <th className="p-3 text-right">كود الفاتورة</th>
                        <th className="p-3 text-right">التفاصيل</th>
                        <th className="p-3 text-right">المبلغ</th>
                        <th className="p-3 text-right">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.timeline.length === 0 && (
                        <tr className="border-t border-[var(--hairline)]">
                          <td colSpan={7} className="p-4 text-center text-muted-foreground">لا توجد حركات</td>
                        </tr>
                      )}
                      {statement.timeline.map((t, i) => (
                        <tr key={t.id} className="border-t border-[var(--hairline)]">
                          <td className="p-3">{i + 1}</td>
                          <td className="p-3" dir="ltr">{isoToDDMMYYYY(t.date.slice(0, 10))}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                t.kind === "payment" ? "bg-success/12 text-success" : t.kind === "opening" ? "bg-primary/10 text-primary" : "bg-warning/12 text-warning"
                              }`}
                            >
                              {typeLabel(t.kind)}
                            </span>
                          </td>
                          <td className="p-3">
                            {t.invoiceNo ? (
                              <span dir="ltr" className="rounded bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{t.invoiceNo}</span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground">{t.description}</td>
                          <td className={`p-3 font-bold ${t.kind === "payment" ? "text-success" : "text-danger"}`}>{fmt(Math.abs(t.amount))} ج.م</td>
                          <td className="p-3 font-bold text-white">{fmt(Math.abs(t.runningBalance))} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 lg:hidden">
                  {statement.timeline.length === 0 && (
                    <div className="rounded-2xl bg-foreground/[0.04] p-4 text-center text-sm text-muted-foreground">لا توجد حركات</div>
                  )}
                  {statement.timeline.map((t, i) => (
                    <div key={t.id} className="rounded-2xl border border-[var(--hairline)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              t.kind === "payment" ? "bg-success/12 text-success" : t.kind === "opening" ? "bg-primary/10 text-primary" : "bg-warning/12 text-warning"
                            }`}
                          >
                            {typeLabel(t.kind)}
                          </span>
                          {t.invoiceNo && (
                            <span dir="ltr" className="rounded bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{t.invoiceNo}</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground" dir="ltr">{isoToDDMMYYYY(t.date.slice(0, 10))}</span>
                      </div>
                      <div className="mt-1.5 text-sm text-muted-foreground">{t.description}</div>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className={`font-bold ${t.kind === "payment" ? "text-success" : "text-danger"}`}>{fmt(Math.abs(t.amount))} ج.م</span>
                        <span className="text-xs text-muted-foreground">
                          الرصيد: <span className="font-bold text-white">{fmt(Math.abs(t.runningBalance))} ج.م</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              تم إنشاء هذا الكشف تلقائياً من سِجلّي — للمراجعة أو الاستفسار تواصل مع المحل مباشرة.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SharedStatement;
