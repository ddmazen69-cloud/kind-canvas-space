import { useEffect, useMemo, useState } from "react";
import { useDB, fmt, invoiceNumber, useShopSettings } from "@/lib/store";
import { usePrivacy } from "@/lib/privacy";
import { createReturn, deleteReturn, fetchReturns, type ReturnEntry, type ReturnItem, type ReturnKind } from "@/lib/returns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PackageX, Plus, Trash2, Save, Undo2 } from "lucide-react";

interface ReturnRow {
  name: string;
  quantity: string;
  unitPrice: string;
}

function isoToDDMMYYYY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function ReturnsPanel() {
  const data = useDB();
  const { settings } = useShopSettings();
  const { privacy } = usePrivacy();
  const blurCls = privacy ? "privacy-blur" : "privacy-clear";

  const [returns, setReturns] = useState<ReturnEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<ReturnKind>("sale");
  const [invoiceId, setInvoiceId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<ReturnRow[]>([{ name: "", quantity: "1", unitPrice: "" }]);
  const [deleteFor, setDeleteFor] = useState<ReturnEntry | null>(null);

  const load = async () => {
    setLoadingList(true);
    try {
      setReturns(await fetchReturns());
    } catch {
      toast.error("تعذر تحميل المرتجعات");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const customerName = useMemo(() => {
    const m = new Map(data.customers.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [data.customers]);

  const invoiceOptions = useMemo(
    () => data.invoices.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data.invoices],
  );

  const invoiceItemsFor = useMemo(
    () => data.invoiceItems.filter((ii) => ii.invoiceId === invoiceId),
    [data.invoiceItems, invoiceId],
  );

  const supplierName = useMemo(() => {
    const m = new Map(data.suppliers.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [data.suppliers]);

  const addRow = () => setRows((r) => [...r, { name: "", quantity: "1", unitPrice: "" }]);
  const updateRow = (idx: number, patch: Partial<ReturnRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const parsed = rows.map((r) => ({
    name: r.name,
    quantity: Math.max(0, Number(r.quantity) || 0),
    unitPrice: Math.max(0, Number(r.unitPrice) || 0),
  }));
  const total = parsed.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
  const hasTotal = total > 0;

  const submit = async () => {
    const valid: ReturnItem[] = parsed
      .filter((r) => r.name && r.quantity > 0 && r.unitPrice > 0)
      .map((r) => ({ name: r.name, quantity: r.quantity, unitPrice: r.unitPrice, amount: r.quantity * r.unitPrice }));
    if (!valid.length) { toast.error("أضف بندًا واحدًا على الأقل بكمية وسعر أكبر من صفر"); return; }
    if (kind === "sale" && !invoiceId) { toast.error("اختر فاتورة البيع"); return; }
    if (kind === "supplier" && !supplierId) { toast.error("اختر المورد"); return; }
    setSaving(true);
    try {
      await createReturn({
        kind,
        invoiceId: kind === "sale" ? invoiceId : null,
        supplierId: kind === "supplier" ? supplierId : null,
        items: valid,
        total: valid.reduce((s, r) => s + r.amount, 0),
        reason: reason.trim() || null,
        returnedAt: new Date().toISOString(),
      });
      toast.success("تم تسجيل المرتجع");
      setRows([{ name: "", quantity: "1", unitPrice: "" }]);
      setInvoiceId("");
      setSupplierId("");
      setReason("");
      void load();
    } catch (e: unknown) {
      const message = e && typeof e === "object" && "message" in e ? String(e.message) : "تعذر تسجيل المرتجع";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteFor) return;
    try {
      await deleteReturn(deleteFor.id);
      toast.success("تم حذف المرتجع");
      void load();
    } catch (e: unknown) {
      const message = e && typeof e === "object" && "message" in e ? String(e.message) : "تعذر حذف المرتجع";
      toast.error(message);
    } finally {
      setDeleteFor(null);
    }
  };

  const referenceLabel = (r: ReturnEntry) => {
    if (r.kind === "sale") {
      const inv = data.invoices.find((i) => i.id === r.invoiceId);
      if (!inv) return "فاتورة محذوفة";
      return `#${invoiceNumber(data.invoices, inv.id, settings.invoicePrefix)} — ${customerName(inv.customerId)}`;
    }
    return supplierName(r.supplierId ?? "");
  };

  return (
    <div className="space-y-5">
      {/* ===== نموذج تسجيل مرتجع ===== */}
      <div className="bezel-shell">
        <div className="bezel-core p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Undo2 className="h-4 w-4 text-primary" />
              تسجيل مرتجع جديد
            </div>
            <div className="flex rounded-full bg-foreground/[0.04] p-1 ring-1 ring-white/[0.06]">
              <button
                type="button"
                onClick={() => setKind("sale")}
                className={cn("rounded-full px-4 py-1.5 text-xs font-bold transition", kind === "sale" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}
              >
                مرتجع بيع
              </button>
              <button
                type="button"
                onClick={() => setKind("supplier")}
                className={cn("rounded-full px-4 py-1.5 text-xs font-bold transition", kind === "supplier" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}
              >
                مرتجع مورد
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {kind === "sale" ? (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">فاتورة البيع</Label>
                <Select value={invoiceId} onValueChange={setInvoiceId}>
                  <SelectTrigger className="h-11 border-white/[0.06] bg-foreground/[0.035] shadow-none">
                    <SelectValue placeholder="اختر الفاتورة المرتجع عليها" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoiceOptions.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        #{invoiceNumber(data.invoices, inv.id, settings.invoicePrefix)} — {customerName(inv.customerId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {invoiceId && invoiceItemsFor.length === 0 && (
                  <p className="text-xs text-warning">لا توجد بنود مسجلة لهذه الفاتورة — اكتب اسم البند يدويًا.</p>
                )}
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">المورد</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-11 border-white/[0.06] bg-foreground/[0.035] shadow-none">
                    <SelectValue placeholder="اختر المورد" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* بنود المرتجع */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">البنود المرتجعة</Label>
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={addRow}>
                  <Plus className="h-3.5 w-3.5" /> إضافة بند
                </Button>
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_5.5rem_7rem_auto] items-center gap-2">
                  {kind === "sale" && invoiceItemsFor.length > 0 ? (
                    <Select value={row.name} onValueChange={(v) => updateRow(idx, { name: v, unitPrice: invoiceItemsFor.find((ii) => ii.name === v)?.price ? String(invoiceItemsFor.find((ii) => ii.name === v)!.price) : row.unitPrice })}>
                      <SelectTrigger className="h-10 border-white/[0.06] bg-foreground/[0.035] shadow-none text-sm">
                        <SelectValue placeholder="البند" />
                      </SelectTrigger>
                      <SelectContent>
                        {invoiceItemsFor.map((ii) => (
                          <SelectItem key={ii.id} value={ii.name}>{ii.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : kind === "supplier" && data.stockItems.length > 0 ? (
                    <Select value={row.name} onValueChange={(v) => updateRow(idx, { name: v, unitPrice: data.stockItems.find((s) => s.name === v)?.lastUnitCost ? String(data.stockItems.find((s) => s.name === v)!.lastUnitCost) : row.unitPrice })}>
                      <SelectTrigger className="h-10 border-white/[0.06] bg-foreground/[0.035] shadow-none text-sm">
                        <SelectValue placeholder="البند" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.stockItems.map((s) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                      placeholder="اسم البند"
                      className="h-10 border-white/[0.06] bg-foreground/[0.035] shadow-none"
                    />
                  )}
                  <Input
                    type="number"
                    min={0}
                    value={row.quantity}
                    onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                    placeholder="الكمية"
                    className="h-10 border-white/[0.06] bg-foreground/[0.035] shadow-none text-center"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={row.unitPrice}
                    onChange={(e) => updateRow(idx, { unitPrice: e.target.value })}
                    placeholder="السعر"
                    className="h-10 border-white/[0.06] bg-foreground/[0.035] shadow-none text-center"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-danger" onClick={() => removeRow(idx)} disabled={rows.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">سبب المرتجع (اختياري)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: عيب مصنع، استبدال مقاس…"
                className="h-10 border-white/[0.06] bg-foreground/[0.035] shadow-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] pt-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">إجمالي المرتجع:</span>
                <span className={cn("text-lg font-extrabold", hasTotal ? "text-danger" : "text-muted-foreground", blurCls)}>{fmt(total)} ج.م</span>
              </div>
              <Button onClick={submit} disabled={saving || loadingList} className="gap-1.5">
                <Save className="h-4 w-4" /> {saving ? "جاري التسجيل..." : "تسجيل المرتجع"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== قائمة المرتجعات ===== */}
      <div className="bezel-shell">
        <div className="bezel-core p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <PackageX className="h-4 w-4 text-primary" />
              سجل المرتجعات
            </div>
            <Badge variant="secondary" className="rounded-full">{returns.length} مرتجع</Badge>
          </div>
          {loadingList ? (
            <div className="py-10 text-center text-sm text-muted-foreground">جاري التحميل…</div>
          ) : returns.length === 0 ? (
            <EmptyState
              icon={PackageX}
              title="لا توجد مرتجعات بعد"
              hint="سجّل أول مرتجع من النموذج أعلاه — مرتجع بيع على فاتورة أو مرتجع لمورد."
              compact
            />
          ) : (
            <ScrollArea className="max-h-[55vh]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-foreground/[0.04] text-muted-foreground">
                    <tr>
                      <th className="p-3 text-right font-medium">التاريخ</th>
                      <th className="p-3 text-right font-medium">النوع</th>
                      <th className="p-3 text-right font-medium">المرجع</th>
                      <th className="p-3 text-right font-medium">البنود</th>
                      <th className="p-3 text-right font-medium">الإجمالي</th>
                      <th className="p-3 text-right font-medium">السبب</th>
                      <th className="p-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--hairline)] hover:bg-foreground/[0.035]">
                        <td className="p-3 whitespace-nowrap" dir="ltr">{isoToDDMMYYYY(r.returnedAt)}</td>
                        <td className="p-3">
                          <Badge className={r.kind === "sale" ? "bg-primary/15 text-primary border-primary/30" : "bg-violet-500/15 text-violet-400 border-violet-500/30"}>
                            {r.kind === "sale" ? "مرتجع بيع" : "مرتجع مورد"}
                          </Badge>
                        </td>
                        <td className="p-3 font-bold">{referenceLabel(r)}</td>
                        <td className="p-3 text-muted-foreground">
                          {r.items.slice(0, 2).map((it) => `${it.name} ×${it.quantity}`).join("، ")}
                          {r.items.length > 2 ? ` +${r.items.length - 2}` : ""}
                        </td>
                        <td className={cn("p-3 font-bold text-danger", blurCls)}>{fmt(r.total)} ج.م</td>
                        <td className="p-3 text-muted-foreground">{r.reason || "—"}</td>
                        <td className="p-3">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-danger" onClick={() => setDeleteFor(r)} aria-label="حذف المرتجع">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* تأكيد الحذف */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف المرتجع؟</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف هذا المرتجع؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-danger text-danger-foreground hover:bg-danger/90" onClick={onDelete}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
