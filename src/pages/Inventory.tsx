import { EmptyState } from "@/components/EmptyState";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { STOCK_CATEGORY_GROUPS, categoryLabel } from "@/lib/stock-categories";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db, useDB, fmt, fetchStockHistory, findStockByBarcode, lowStockThreshold, useShopSettings, type StockItem, type StockHistoryEntry } from "@/lib/store";
import {
  Package, Search, Eye, EyeOff, AlertTriangle, Boxes, Wallet, Pencil, Trash2,
  History, Download, FileSpreadsheet, FileText, ArrowUp, ArrowDown, TrendingUp, TrendingDown,
  ScanLine, Plus, Sparkles, PackagePlus, Scale, Shirt, Warehouse, Sun, Snowflake,
  Barcode as BarcodeIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { pdfDocument, openPdfDocument, esc } from "@/lib/pdf-doc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/lib/privacy";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { generateBarcode } from "@/lib/barcode";
import { BarcodeGenerator } from "@/components/BarcodeGenerator";


const LOW_STOCK = lowStockThreshold;

const REASONS = [
  { value: "damage", label: "تلف / كسر" },
  { value: "correction", label: "تصحيح جرد" },
  { value: "gift", label: "هدية / عينة" },
  { value: "return", label: "مرتجع" },
  { value: "loss", label: "فقدان" },
  { value: "other", label: "أخرى" },
];

export default function Page() {
  return (
    <AppShell>
        <PageTransition>
          <InventoryPage />
        </PageTransition>
      </AppShell>
  );
}

type Tab = "all" | "out" | "low";

function InventoryPage() {
  useShopSettings(); // re-render when the low-stock threshold changes
  const data = useDB();
  const { privacy, toggle } = usePrivacy();
  const blurCls = privacy ? "privacy-blur" : "privacy-clear";
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefillBarcode, setAddPrefillBarcode] = useState<string | undefined>(undefined);
  const [warehouseItem, setWarehouseItem] = useState<StockItem | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  const onScanned = (code: string) => {
    setScanOpen(false);
    const found = findStockByBarcode(data.stockItems, code);
    if (found) {
      setQ(found.name);
      toast.success(`تم العثور على: ${found.name}`);
    } else {
      toast.error("الكود غير موجود في المخزن", {
        description: `الباركود: ${code}`,
        action: {
          label: "إضافة منتج جديد",
          onClick: () => { setAddPrefillBarcode(code); setAddOpen(true); },
        },
      });
    }
  };

  const totals = useMemo(() => {
    const totalItems = data.stockItems.length;
    const value = data.stockItems.reduce((s, it) => s + it.quantity * it.lastUnitCost, 0);
    const avgCost = totalItems > 0
      ? data.stockItems.reduce((s, it) => s + it.lastUnitCost, 0) / totalItems
      : 0;
    const low = data.stockItems.filter((it) => it.quantity < LOW_STOCK()).length;
    return { totalItems, value, low, avgCost };
  }, [data.stockItems]);

  const navigate = useNavigate();

  const list = useMemo(() => {
    return data.stockItems
      .filter((it) => it.location !== "warehouse")
      .filter((it) => {
        if (tab === "out") return it.quantity <= 0;
        if (tab === "low") return it.quantity > 0 && it.quantity < LOW_STOCK();
        return true;
      })
      .filter((it) => (q ? (it.name.includes(q) || (it.barcode ?? "").includes(q)) : true))
      .sort((a, b) => a.quantity - b.quantity);
  }, [data.stockItems, q, tab]);

  const sendToWarehouse = async (id: string, season: "summer" | "winter" | "general") => {
    try {
      await db.updateStockItem(id, { location: "warehouse", season });
      toast.success("تم نقل الصنف للمخزن 📦", { description: "يمكنك إعادته للمحل في أي وقت من صفحة المخزن." });
    } catch (e: any) {
      toast.error(e?.message ?? "تعذرت عملية النقل");
    }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = list.map((it) => ({
        "اسم الصنف": it.name,
        "الكمية": it.quantity,
        "سعر الشراء": it.lastUnitCost,
        "سعر البيع": it.salePrice,
        "قيمة المخزن": it.quantity * it.lastUnitCost,
        "هامش الربح": it.salePrice - it.lastUnitCost,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "المخزن");
      XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("تم تصدير ملف Excel");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر التصدير");
    }
  };

  const exportPDF = () => {
    const totalValue = list.reduce((s, it) => s + it.quantity * it.lastUnitCost, 0);
    const lowCount = list.filter((it) => it.quantity > 0 && it.quantity < LOW_STOCK()).length;
    const outCount = list.filter((it) => it.quantity <= 0).length;
    const body = `
<h2 class="sec">قائمة الأصناف</h2>
<div class="t-wrap"><table><thead><tr>
  <th>اسم الصنف</th><th class="num">الكمية النظامية</th><th class="num">سعر الشراء</th><th class="num">سعر البيع</th>
  <th class="num">قيمة المخزن</th><th>جرد فعلي</th><th>فرق</th>
</tr></thead><tbody>
${list.map((it) => {
  const cls = it.quantity <= 0 ? "out" : it.quantity < LOW_STOCK() ? "low" : "";
  return `<tr class="${cls}">
    <td>${esc(it.name)}</td>
    <td class="num">${fmt(it.quantity)}</td>
    <td class="num">${fmt(it.lastUnitCost)}</td>
    <td class="num">${fmt(it.salePrice)}</td>
    <td class="num">${fmt(it.quantity * it.lastUnitCost)}</td>
    <td style="min-width:70px"></td><td style="min-width:70px"></td>
  </tr>`;
}).join("") || `<tr><td colspan="7" class="empty">لا توجد أصناف</td></tr>`}
</tbody></table></div>
<div class="sig"><div>توقيع القائم بالجرد</div><div>توقيع المراجع</div></div>`;
    const html = pdfDocument({
      docTitle: "تقرير المخزن — سِجلّي",
      badge: "كشف جرد",
      title: "تقرير المخزن — جرد فعلي",
      lede: "قائمة الأصناف مع الكميات النظامية وخانات فارغة لتسجيل الجرد الفعلي والفروقات.",
      meta: [
        { label: "تاريخ التقرير", value: new Date().toLocaleDateString("ar-EG") },
        { label: "عدد الأصناف", value: String(list.length) },
      ],
      kpis: [
        { label: "عدد الأصناف", value: String(list.length) },
        { label: "قيمة المخزن", value: `${fmt(totalValue)} ج.م`, tone: "brand" },
        { label: "أصناف قاربت النفاد", value: String(lowCount), tone: "warn" },
        { label: "أصناف منتهية", value: String(outCount), tone: "danger" },
      ],
      body,
      page: "A4 landscape",
    });
    if (!openPdfDocument(html, { autoPrint: true })) toast.error("اسمح بفتح النوافذ المنبثقة");
  };


  return (
    <>
      <PageHeader
        title="المنتجات"
        subtitle="إدارة المنتجات والكميات وأسعار الشراء والبيع."
        icon={<Package className="w-7 h-7" />}
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">تصدير</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportExcel} className="gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-success" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF} className="gap-2">
                  <FileText className="w-4 h-4 text-danger" /> PDF (للجرد)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant={privacy ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={toggle}
              title="إخفاء الأرقام"
            >
              {privacy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">إخفاء الأرقام</span>
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGenOpen(true)}>
              <BarcodeIcon className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline">مولد الباركود</span>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => { setAddPrefillBarcode(undefined); setAddOpen(true); }}>
              <PackagePlus className="w-4 h-4" />
              <span className="hidden sm:inline">إضافة صنف</span>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        <StatBox label="إجمالي الأصناف" value={String(totals.totalItems)} icon={<Boxes className="w-5 h-5" />} tone="primary" sub="عدد الأصناف الفريدة" />
        <StatBox label="قيمة المخزن" value={`${fmt(totals.value)} ج.م`} icon={<Wallet className="w-5 h-5" />} tone="success" valueClassName={blurCls} sub="الكمية × سعر الشراء" />
        <StatBox label="متوسط سعر الشراء" value={`${fmt(totals.avgCost)} ج.م`} icon={<TrendingUp className="w-5 h-5" />} tone="primary" valueClassName={blurCls} sub="متوسط على كل الأصناف" />
        <StatBox label="نواقص" value={String(totals.low)} icon={<AlertTriangle className="w-5 h-5" />} tone={totals.low > 0 ? "danger" : "primary"} sub={`أقل من ${LOW_STOCK()} وحدات • مرتبط بالمنبه`} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList className="grid grid-cols-3 w-full h-auto">
          <TabsTrigger value="all" className="gap-1.5">
            الكل <Badge variant="secondary" className="rounded-full">{data.stockItems.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="low" className="gap-1.5 data-[state=active]:bg-warning/15 data-[state=active]:text-warning">
            ناقص <Badge variant="secondary" className="rounded-full">{data.stockItems.filter((it) => it.quantity > 0 && it.quantity < LOW_STOCK()).length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="out" className="gap-1.5 data-[state=active]:bg-danger/15 data-[state=active]:text-danger">
            نفذ <Badge variant="secondary" className="rounded-full">{data.stockItems.filter((it) => it.quantity <= 0).length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-5">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الصنف أو الباركود..." className="pr-10 pl-10" />
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            title="مسح باركود"
          >
            <ScanLine className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-card plate overflow-hidden animate-[fade-in_0.4s_ease-out]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-foreground/[0.04] text-muted-foreground">
              <tr>
                <th className="text-right p-4 font-medium">اسم الصنف</th>
                <th className="text-right p-4 font-medium">الكمية المتوفرة</th>
                <th className="text-right p-4 font-medium">متوسط سعر الشراء</th>
                <th className="text-right p-4 font-medium">سعر البيع</th>
                <th className="text-right p-4 font-medium">الربح / الوحدة</th>
                <th className="text-right p-4 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={Package}
                        title="المخزن فاضي."
                        hint="أضف فاتورة شراء وهيتعبّى المخزن تلقائيًا بأصنافها."
                      />
                    </td>
                  </tr>
                )}

                {list.map((it) => {
                  const out = it.quantity <= 0;
                  const low = !out && it.quantity < LOW_STOCK();
                  const profit = it.salePrice - it.lastUnitCost;
                  const margin = it.salePrice > 0 ? (profit / it.salePrice) * 100 : 0;
                  return (
                    <motion.tr
                      key={it.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        "border-t border-[var(--hairline)] transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                        out ? "bg-danger/5 hover:bg-danger/10" : low ? "bg-warning/5 hover:bg-warning/10" : "hover:bg-foreground/[0.035]",
                      )}
                    >
                      <td className="p-4">
                        <div className="font-bold text-primary">{it.name}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{categoryLabel(it.category)}</div>
                        {it.barcode && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 inline-flex items-center gap-1">
                            <ScanLine className="w-3 h-3" /> {it.barcode}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 font-bold tabular-nums",
                          out ? "text-danger" : low ? "text-warning" : "text-foreground",
                          blurCls,
                        )}>
                          {(out || low) && <AlertTriangle className="w-4 h-4" />}
                          {fmt(it.quantity)}
                        </span>
                      </td>
                      <td className={cn("p-4 tabular-nums", blurCls)}>{fmt(it.lastUnitCost)} ج.م</td>
                      <td className={cn("p-4 tabular-nums", blurCls)}>{fmt(it.salePrice)} ج.م</td>
                      <td className={cn("p-4 tabular-nums", blurCls)}>
                        <span className={cn("inline-flex items-center gap-1 font-bold", profit >= 0 ? "text-success" : "text-danger")}>
                          {profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {fmt(profit)} ج.م
                          {it.salePrice > 0 && (
                            <span className="text-[11px] text-muted-foreground">({margin.toFixed(0)}%)</span>
                          )}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-0.5">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-success hover:bg-success/10" title="تسوية كمية" onClick={() => setAdjustItem(it)}>
                            <Scale className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" title="سجل الحركة" onClick={() => setHistoryItem(it)}>
                            <History className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-warning hover:bg-warning/10" title="تعديل" onClick={() => setEditing(it)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10" title="نقل للمخزن" onClick={() => setWarehouseItem(it)}>
                            <Warehouse className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-danger hover:bg-danger/10" title="حذف" onClick={() => setDeleteId(it.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <AdjustDialog item={adjustItem} onClose={() => setAdjustItem(null)} />
      <EditDialog item={editing} onClose={() => setEditing(null)} />
      <AddProductDialog
        open={addOpen}
        onOpenChange={(v: boolean) => { setAddOpen(v); if (!v) setAddPrefillBarcode(undefined); }}
        prefillBarcode={addPrefillBarcode}
        existingBarcodes={data.stockItems.map((s) => s.barcode)}
      />
      <HistoryDialog item={historyItem} onClose={() => setHistoryItem(null)} />
      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} title="مسح باركود — بحث في المخزن" />
      <BarcodeGenerator open={genOpen} onOpenChange={setGenOpen} items={data.stockItems} />
      <SendToWarehouseDialog
        item={warehouseItem}
        onClose={() => setWarehouseItem(null)}
        onConfirm={sendToWarehouse}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الصنف؟</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم حذف الصنف من المخزن. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try { await db.removeStockItem(deleteId); toast.success("تم حذف الصنف"); }
                catch (e: any) { toast.error(e?.message ?? "تعذر الحذف"); }
                finally { setDeleteId(null); }
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Quick manual reconciliation: signed delta + required reason, logged in stock_adjustments. */
function AdjustDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const [mode, setMode] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("correction");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) { setMode("out"); setAmount("1"); setReason("correction"); setNotes(""); }
  }, [item]);

  const qty = Math.abs(Number(amount) || 0);
  const delta = mode === "in" ? qty : -qty;
  const next = item ? Math.max(0, item.quantity + delta) : 0;

  const submit = async () => {
    if (!item) return;
    if (qty <= 0) { toast.error("أدخل كمية أكبر من صفر"); return; }
    setBusy(true);
    try {
      await db.adjustStock(
        item.id,
        delta,
        REASONS.find((r) => r.value === reason)?.label ?? reason,
        notes.trim() || undefined,
      );
      toast.success("تمت تسوية الكمية");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر حفظ التسوية");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">تسوية كمية — {item?.name}</DialogTitle>
          <DialogDescription className="text-right">
            زوّد أو نقّص الكمية بسبب واضح، والحركة هتتسجل في سجل الصنف.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "in" ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setMode("in")}
            >
              <ArrowUp className="w-4 h-4" /> إضافة
            </Button>
            <Button
              type="button"
              variant={mode === "out" ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setMode("out")}
            >
              <ArrowDown className="w-4 h-4" /> خصم
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label>الكمية</Label>
            <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>سبب التسوية <span className="text-danger">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>ملاحظات (اختياري)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="تفاصيل إضافية..." maxLength={200} />
          </div>
          <div className="rounded-2xl border-2 border-border bg-foreground/[0.03] p-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">الكمية بعد التسوية</span>
            <span className="font-extrabold tabular-nums">
              {fmt(item?.quantity ?? 0)} ← {fmt(next)}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy}>حفظ التسوية</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [minQty, setMinQty] = useState("");
  const [customPrefix, setCustomPrefix] = useState("");
  const [reason, setReason] = useState<string>("correction");
  const [reasonNotes, setReasonNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setSize(item.size ?? "");
      setQty(String(item.quantity));
      setCost(String(item.lastUnitCost));
      setPrice(String(item.salePrice));
      setBarcode(item.barcode ?? "");
      setMinQty(item.minQuantity ? String(item.minQuantity) : "");
      setCustomPrefix(item.customBarcode ?? "");
      setReason("correction");
      setReasonNotes("");
    }
  }, [item]);

  const newQty = Number(qty) || 0;
  const newCost = Number(cost) || 0;
  const newPrice = Number(price) || 0;
  const delta = item ? newQty - item.quantity : 0;
  const profit = newPrice - newCost;
  const margin = newPrice > 0 ? (profit / newPrice) * 100 : 0;
  const reasonRequired = delta !== 0;

  const submit = async () => {
    if (!item) return;
    if (!name.trim()) { toast.error("اكتب اسم الصنف"); return; }
    if (reasonRequired && !reason) { toast.error("اختر سبب التعديل"); return; }
    setBusy(true);
    try {
      // compute custom barcode if prefix provided
      let customBarcodeValue: string | undefined = undefined;
      let finalBarcode = barcode.trim() || null;
      if (customPrefix.trim()) {
        customBarcodeValue = `${customPrefix.trim()}${Math.round((newCost || 0) * 2)}`;
        finalBarcode = customBarcodeValue;
      }
      await db.updateStockItem(
        item.id,
        { name: name.trim(), size: size.trim() || null, quantity: newQty, lastUnitCost: newCost, salePrice: newPrice, barcode: finalBarcode, minQuantity: minQty ? Math.max(0, Math.round(Number(minQty))) : undefined, customBarcode: customPrefix ? customBarcodeValue : undefined },
        reasonRequired ? {
          delta,
          reason: REASONS.find((r) => r.value === reason)?.label ?? reason,
          notes: reasonNotes.trim() || undefined,
        } : undefined,
      );
      toast.success("تم تحديث الصنف");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحفظ");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">تعديل الصنف</DialogTitle>
          <DialogDescription className="text-right">حدّث الكمية والأسعار. أي تغيير في الكمية يحتاج سبب.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>اسم الصنف</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>المقاس (اختياري)</Label>
              <Input value={size} onChange={(e) => setSize(e.target.value)} maxLength={20} placeholder="مثال: L / 42 / XXL" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <ScanLine className="w-3.5 h-3.5 text-primary" />
              الباركود (اختياري)
            </Label>
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="امسح أو اكتب الكود..."
                dir="ltr"
                className="font-mono"
                maxLength={64}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { setBarcode(generateBarcode([barcode])); toast.success("تم توليد كود فريد"); }}
                title="توليد كود تلقائي"
              >
                <Sparkles className="w-4 h-4 text-primary" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => setScanOpen(true)} title="مسح بالكاميرا">
                <ScanLine className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>الكمية</Label>
              <Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>سعر الشراء</Label>
              <Input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>سعر البيع</Label>
              <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          {/* Profit preview */}
          <div className={cn(
            "rounded-2xl border-2 p-3 flex items-center justify-between gap-3",
            profit >= 0 ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5",
          )}>
            <div className="flex items-center gap-2">
              {profit >= 0 ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-danger" />}
              <span className="text-xs text-muted-foreground">الربح المتوقع للوحدة</span>
            </div>
            <div className={cn("font-extrabold tabular-nums", profit >= 0 ? "text-success" : "text-danger")}>
              {fmt(profit)} ج.م
              {newPrice > 0 && (
                <span className="text-xs font-normal text-muted-foreground mr-2">(هامش {margin.toFixed(1)}%)</span>
              )}
            </div>
          </div>

          {/* Adjustment reason — appears when qty changes */}
          {reasonRequired && (
            <div className="rounded-2xl border-2 border-warning/30 bg-warning/5 p-3 grid gap-2.5 animate-[fade-in_0.2s_ease-out]">
              <div className="flex items-center gap-2 text-xs font-semibold text-warning">
                <AlertTriangle className="w-4 h-4" />
                تعديل كمية: {delta > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                <span className="tabular-nums">{fmt(Math.abs(delta))} وحدة</span>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">سبب التعديل <span className="text-danger">*</span></Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">ملاحظات (اختياري)</Label>
                <Input value={reasonNotes} onChange={(e) => setReasonNotes(e.target.value)} placeholder="تفاصيل إضافية..." maxLength={200} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy}>حفظ</Button>
        </DialogFooter>
        <BarcodeScanner
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onDetected={(code) => { setBarcode(code); setScanOpen(false); toast.success("تم التقاط الكود"); }}
          title="مسح باركود الصنف"
        />
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const [entries, setEntries] = useState<StockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    fetchStockHistory(item.id, item.name)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [item]);

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            سجل حركة الصنف
          </DialogTitle>
          <DialogDescription className="text-right">
            {item?.name} — كل زيادة (شراء) ونقص (بيع/تعديل).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2 -mx-2 px-2">
          {loading && <div className="text-center text-muted-foreground py-8 text-sm">جاري التحميل...</div>}
          {!loading && entries.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
              لا يوجد حركة مسجلة لهذا الصنف.
            </div>
          )}
          {entries.map((e) => {
            const positive = e.qty > 0;
            const cls = e.type === "purchase"
              ? "border-success/30 bg-success/5"
              : e.type === "sale"
              ? "border-primary/30 bg-primary/5"
              : positive ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5";
            const Icon = positive ? ArrowUp : ArrowDown;
            const iconCls = positive ? "text-success" : e.type === "sale" ? "text-primary" : "text-warning";
            const label = e.type === "purchase" ? "شراء" : e.type === "sale" ? "بيع" : "تعديل";
            return (
              <div key={e.id} className={cn("flex items-center justify-between gap-3 rounded-2xl border-2 p-3", cls)}>
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={cn("w-5 h-5 shrink-0", iconCls)} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold flex items-center gap-2">
                      {label}
                      {e.reason && <span className="text-xs font-normal text-muted-foreground">— {e.reason}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {new Date(e.date).toLocaleDateString("ar-EG", { day: "2-digit", month: "long", year: "numeric" })}
                      {e.notes ? ` • ${e.notes}` : e.ref ? ` • ${e.ref}` : ""}
                    </div>
                  </div>
                </div>
                <div className={cn("font-extrabold tabular-nums shrink-0", iconCls)}>
                  {positive ? "+" : ""}{fmt(e.qty)}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({
  label, value, icon, tone, valueClassName, sub,
}: { label: string; value: string; icon: React.ReactNode; tone: "primary" | "success" | "danger"; valueClassName?: string; sub?: string }) {
  const toneCls = tone === "success"
    ? { border: "border-success/30 hover:border-success/60", chip: "bg-success/10 border-success/30 text-success", text: "text-success", grad: "bg-linear-to-bl from-success to-transparent" }
    : tone === "danger"
    ? { border: "border-danger/30 hover:border-danger/60", chip: "bg-danger/10 border-danger/30 text-danger", text: "text-danger", grad: "bg-linear-to-bl from-danger to-transparent" }
    : { border: "border-primary/30 hover:border-primary/60", chip: "bg-primary/10 border-primary/30 text-primary", text: "text-primary", grad: "bg-linear-to-bl from-primary to-transparent" };
  return (
    <div className={cn("relative overflow-hidden bg-card plate p-5 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] duration-300 hover:-translate-y-1", toneCls.border)}>
      <div className={cn("absolute inset-0 opacity-[0.06] pointer-events-none", toneCls.grad)} />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className={cn("w-10 h-10 rounded-2xl border flex items-center justify-center", toneCls.chip)}>{icon}</div>
          <div className="text-xs text-muted-foreground text-left max-w-[55%]">{label}</div>
        </div>
        <div className={cn("text-2xl lg:text-3xl font-extrabold mt-4 tabular-nums text-right", toneCls.text, valueClassName)}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1.5 text-right">{sub}</div>}
      </div>
    </div>
  );
}

function AddProductDialog({ open, onOpenChange, prefillBarcode, existingBarcodes }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillBarcode?: string;
  existingBarcodes: Array<string | null>;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("other");
  const [barcode, setBarcode] = useState("");
  const [minQty, setMinQty] = useState("");
  const [customPrefix, setCustomPrefix] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setSize(""); setQty(""); setCost(""); setPrice(""); setCategory("other");
      setBarcode(prefillBarcode ?? "");
      setMinQty(""); setCustomPrefix("");
    }
  }, [open, prefillBarcode]);

  const nQty = Number(qty) || 0;
  const nCost = Number(cost) || 0;
  const nPrice = Number(price) || 0;
  const totalCost = nQty * nCost;
  const totalSale = nQty * nPrice;
  const netProfit = totalSale - totalCost;
  const profitPct = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

  const submit = async () => {
    if (!name.trim()) { toast.error("اكتب اسم الصنف"); return; }
    setBusy(true);
    try {
      // compute custom barcode if prefix provided
      let customBarcodeValue: string | undefined = undefined;
      if (customPrefix.trim()) {
        customBarcodeValue = `${customPrefix.trim()}${Math.round((nCost || 0) * 2)}`;
      }
      await db.addStockItem({
        name: name.trim(),
        size: size.trim() || null,
        quantity: nQty,
        lastUnitCost: nCost,
        salePrice: nPrice,
        category,
        barcode: (customBarcodeValue ?? barcode.trim()) || null,
        minQuantity: minQty ? Math.max(0, Math.round(Number(minQty))) : undefined,
        customBarcode: customPrefix ? customBarcodeValue : undefined,
      });
      toast.success("تمت إضافة الصنف");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحفظ");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-primary" /> إضافة صنف جديد
          </DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pl-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>اسم الصنف</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="مثال: قميص رجالي قطن..." />
            </div>
            <div className="grid gap-1.5">
              <Label>المقاس (اختياري)</Label>
              <Input value={size} onChange={(e) => setSize(e.target.value)} maxLength={20} placeholder="مثال: L / 42 / XXL" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Shirt className="w-3.5 h-3.5 text-primary" />
              نوع الصنف
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
              <SelectContent dir="rtl" className="max-h-72">
                {STOCK_CATEGORY_GROUPS.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel className="text-[11px] text-primary">{g.label}</SelectLabel>
                    {g.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <ScanLine className="w-3.5 h-3.5 text-primary" />
              الباركود
            </Label>
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="امسح، اكتب، أو ولّد كودًا..."
                dir="ltr"
                className="font-mono"
                maxLength={64}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { setBarcode(generateBarcode([barcode, ...existingBarcodes])); toast.success("تم توليد كود فريد"); }}
                title="توليد كود تلقائي"
              >
                <Sparkles className="w-4 h-4 text-primary" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => setScanOpen(true)} title="مسح بالكاميرا">
                <ScanLine className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              لا يوجد باركود على المنتج؟ اضغط <Sparkles className="inline w-3 h-3 text-primary" /> لتوليد كود فريد يمكن طباعته ولصقه على الصنف.
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">الباركود المخصص (بادئة)</Label>
                <Input value={customPrefix} onChange={(e) => setCustomPrefix(e.target.value)} placeholder="مثال: 040770" dir="ltr" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">معاينة الباركود</Label>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-sm">{customPrefix.trim() ? `${customPrefix.trim()}${Math.round((nCost || 0) * 2)}` : "-"}</div>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (!customPrefix.trim()) { toast.error('أدخل بادئة للباركود'); return; }
                    const cb = `${customPrefix.trim()}${Math.round((nCost || 0) * 2)}`;
                    setBarcode(cb); toast.success('تم تعيين الباركود المخصص');
                  }}>استخدم</Button>
                </div>
              </div>
            </div>
            <div className="grid gap-1.5 mt-3">
              <Label>الحد الأدنى للمخزون</Label>
              <Input type="number" inputMode="numeric" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="مثال: 5" />
              <div className="text-[11px] text-muted-foreground">يُعتبر الصنف منخفضًا إذا كانت الكمية أقل من هذا الرقم.</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label>الكمية</Label><Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>سعر الشراء</Label><Input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>سعر البيع</Label><Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>

          {/* حساب تلقائي */}
          <div className="rounded-2xl border border-border/70 bg-foreground/[0.03] p-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-[11px] text-muted-foreground">إجمالي التكلفة</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{fmt(totalCost)} ج.م</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">إجمالي سعر البيع</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{fmt(totalSale)} ج.م</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">صافي الربح</div>
                <div className={cn("mt-1 text-xl font-extrabold tabular-nums", netProfit >= 0 ? "text-success" : "text-danger")}>
                  {fmt(netProfit)} ج.م
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">نسبة الربح</div>
                <div className={cn("mt-1 text-xl font-extrabold tabular-nums", netProfit >= 0 ? "text-success" : "text-danger")}>
                  {profitPct.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            <Plus className="w-4 h-4" /> إضافة
          </Button>
        </DialogFooter>
        <BarcodeScanner
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onDetected={(code) => { setBarcode(code); setScanOpen(false); toast.success("تم التقاط الكود"); }}
          title="مسح باركود الصنف الجديد"
        />
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────
   SendToWarehouseDialog — اختيار الموسم قبل نقل الصنف للمخزن
──────────────────────────────────────────────────────────────── */
function SendToWarehouseDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: StockItem | null;
  onClose: () => void;
  onConfirm: (id: string, season: "summer" | "winter" | "general") => Promise<void>;
}) {
  const [season, setSeason] = useState<"summer" | "winter" | "general">("general");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await onConfirm(item.id, season);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-blue-400" />
            نقل للمخزن — {item?.name}
          </DialogTitle>
          <DialogDescription className="text-right">
            اختر موسم هذا الصنف وسيختفي من صفحة المنتجات ويظهر في المخزن.
            يمكنك إعادته للمحل في أي وقت من صفحة المخزن.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Label>موسم الصنف</Label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "summer", label: "صيفي", icon: <Sun className="w-5 h-5 text-amber-400" />, color: "border-amber-400/50 bg-amber-400/10 text-amber-400" },
              { value: "winter", label: "شتوي", icon: <Snowflake className="w-5 h-5 text-blue-400" />, color: "border-blue-400/50 bg-blue-400/10 text-blue-400" },
              { value: "general", label: "عام", icon: <Package className="w-5 h-5 text-muted-foreground" />, color: "border-border bg-foreground/5 text-muted-foreground" },
            ] as const).map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeason(s.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-sm font-semibold transition-all duration-200",
                  season === s.value ? s.color : "border-transparent bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.06]",
                )}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="gap-1.5 bg-blue-500/15 border border-blue-400/30 text-blue-400 hover:bg-blue-500/25 hover:text-blue-300"
          >
            <Warehouse className="w-4 h-4" />
            {busy ? "جاري النقل..." : "نقل للمخزن 📦"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
