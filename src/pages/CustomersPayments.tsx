import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { useDB, db } from "@/lib/store";
import { fmt } from "@/lib/store";
import { Link } from "@/lib/router-compat";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function Page() {
  const { payments, customers, invoices } = useDB();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const paymentsWithDetails = useMemo(() =>
    payments
      .slice()
      .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""))
      .map((p) => {
        const inv = invoices.find((i) => i.id === p.invoiceId) ?? null;
        const customer = inv ? customers.find((c) => c.id === inv.customerId) ?? null : null;
        const paidAtMs = p.paidAt ? Date.parse(p.paidAt) : null;
        return { ...p, invoice: inv, customer, paidAtMs };
      }),
    [payments, invoices, customers],
  );

  const filtered = paymentsWithDetails.filter((p) => {
    if (q && !(p.customer?.name || "").toLowerCase().includes(q.toLowerCase()) && !(p.invoice?.id || "").toLowerCase().includes(q.toLowerCase())) return false;
    if (selectedCustomer && p.customer?.id !== selectedCustomer) return false;
    if (from && (!p.paidAtMs || p.paidAtMs < Date.parse(from))) return false;
    if (to && (!p.paidAtMs || p.paidAtMs > Date.parse(to))) return false;
    return true;
  });

  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <AppShell>
      <PageTransition>
        <PageHeader title="المدفوعات" subtitle="سجل المدفوعات المسجلة" />

        <div className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <Dialog open={showNew} onOpenChange={setShowNew}>
              <DialogTrigger asChild>
                <button className="btn btn-primary">سجل دفعة جديدة</button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
                  <DialogDescription>أدخل بيانات الدفعة لحفظها.</DialogDescription>
                </DialogHeader>
                <NewPaymentForm invoices={invoices} customers={customers} onClose={() => setShowNew(false)} />
                <DialogFooter />
              </DialogContent>
            </Dialog>

            <ExportPaymentsButton filtered={filtered} page={page} pageSize={pageSize} fmt={fmt} />

            <div className="ml-auto flex items-center gap-2">
              <input placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} className="input" />
              <select value={selectedCustomer ?? ""} onChange={(e) => setSelectedCustomer(e.target.value || null)} className="input">
                <option value="">كل العملاء</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </div>
          </div>

          <div className="mb-3 text-sm text-muted-foreground">مجموع النتائج: <strong>{filtered.length}</strong> — إجمالي المبالغ: <strong>{fmt(total)} ج.م</strong></div>

          <div className="bezel-shell p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">التاريخ</th>
                  <th className="py-2">العميل</th>
                  <th className="py-2">الرقم/فاتورة</th>
                  <th className="py-2">المبلغ</th>
                  <th className="py-2">الطريقة</th>
                  <th className="py-2">الملاحظة</th>
                  <th className="py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(page * pageSize, (page + 1) * pageSize).map((p) => (
                  <tr key={p.id} className="border-t border-[var(--hairline)]">
                    <td className="py-3">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("ar-EG") : "-"}</td>
                    <td className="py-3">
                      {p.customer ? (
                        <Link to={`/customers/${p.customer.id}`} className="text-primary underline">{p.customer.name}</Link>
                      ) : (
                        <span className="text-muted-foreground">عميل محذوف</span>
                      )}
                    </td>
                    <td className="py-3"><Link to={`/invoices/${p.invoice?.id ?? ""}`} className="underline text-primary">{p.invoice?.id ?? "—"}</Link></td>
                    <td className="py-3">{fmt(p.amount)} ج.م</td>
                    <td className="py-3">{p.method ?? "—"}</td>
                    <td className="py-3">{p.note ?? "—"}</td>
                    <td className="py-3">
                      <button className="btn" onClick={async () => {
                        if (!confirm("حذف الدفعة؟ هذا الإجراء لا يمكن التراجع عنه.")) return;
                        try { await db.removePayment(p.id); } catch (err) { alert(String(err)); }
                      }}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-muted-foreground">الصفحة {page + 1} / {Math.max(1, Math.ceil(filtered.length / pageSize))}</div>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setPage((s) => Math.max(0, s - 1))}>السابق</button>
                <button className="btn" onClick={() => setPage((s) => Math.min(Math.ceil(filtered.length / pageSize) - 1, s + 1))}>التالي</button>
              </div>
            </div>
          </div>

          {/* Dialog (Radix) handles the new-payment UI; removed duplicate manual modal fallback. */}
        </div>
      </PageTransition>
    </AppShell>
  );
}

function NewPaymentForm({ invoices, customers, onClose }: { invoices: any[]; customers: any[]; onClose: () => void }) {
  const [cust, setCust] = useState<string>("");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const myInvoices = useMemo(() => invoices.filter((i) => !cust || i.customerId === cust), [invoices, cust]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">العميل</label>
        <select className="input" value={cust} onChange={(e) => { setCust(e.target.value); setInvoiceId(""); }}>
          <option value="">اختر عميلًا (اختياري)</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label className="text-sm">الفاتورة</label>
        <select className="input" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
          <option value="">اختر فاتورة</option>
          {myInvoices.map((inv) => (
            <option key={inv.id} value={inv.id}>{inv.id} — {inv.customerId}</option>
          ))}
        </select>

        <label className="text-sm">المبلغ</label>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />

        <label className="text-sm">التاريخ</label>
        <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />

        <label className="text-sm">طريقة الدفع</label>
        <input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="نقدي / حوالة / بطاقة" />

        <label className="text-sm">ملاحظة</label>
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="mt-4 flex gap-2 justify-end">
        <button className="btn" onClick={onClose} disabled={loading}>إلغاء</button>
        <button className="btn btn-primary" onClick={async () => {
          if (!invoiceId) return alert("اختر فاتورة");
          const n = Number(amount);
          if (!(n > 0)) return alert("أدخل مبلغًا صحيحًا");
          setLoading(true);
          try {
            await db.recordPayment(invoiceId, n, { paidAt: paidAt || undefined, method: method || null, note: note || null });
            onClose();
          } catch (err) { alert(String(err)); }
          setLoading(false);
        }} disabled={loading}>حفظ</button>
      </div>
    </div>
  );
}

function ExportPaymentsButton({ filtered, page, pageSize, fmt }: { filtered: any[]; page: number; pageSize: number; fmt: (v: any) => string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button className="btn" disabled={loading} onClick={async () => {
      if (loading) return;
      setLoading(true);
      const exportRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
      try {
        const { jsPDF } = await import('jspdf');
        const html2canvas = (await import('html2canvas')).default;
        // build a printable node for the current page only
        const node = document.createElement('div');
        node.style.padding = '24px';
        node.innerHTML = `
          <h3>تصدير المدفوعات (صفحة ${page + 1})</h3>
          <table style="width:100%;border-collapse:collapse" border="1">
            <thead><tr><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>فاتورة</th></thead>
            <tbody>
              ${exportRows.map((r) => `<tr><td>${r.paidAt ?? ''}</td><td>${r.customer?.name ?? '-'}</td><td>${fmt(r.amount)} ج.م</td><td>${r.invoice?.id ?? ''}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
        document.body.appendChild(node);
        // allow browser to render the node
        await new Promise((res) => setTimeout(res, 50));
        const canvas = await html2canvas(node, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('payments-page.pdf');
        document.body.removeChild(node);
      } catch (err) {
        console.error(err);
        alert('فشل التصدير: ' + String(err));
      } finally {
        setLoading(false);
      }
    }}>{loading ? 'جارٍ التصدير...' : 'تصدير PDF'}</button>
  );
}
