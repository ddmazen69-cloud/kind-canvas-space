import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db, useDB, fmt, type StockItem } from "@/lib/store";
import { STOCK_CATEGORY_GROUPS, categoryLabel } from "@/lib/stock-categories";
import { useNavigate } from "@tanstack/react-router";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Warehouse, Sun, Snowflake, Package, Search, Store, Pencil,
  ArrowLeft, Wallet, Boxes, AlertTriangle, TrendingUp, Plus,
} from "lucide-react";

/* ─────────────────────── types ─────────────────────── */
type Season = "all" | "summer" | "winter" | "general";

/* ─────────────────────── helpers ─────────────────────── */
const SEASON_LABELS: Record<string, { label: string; icon: JSX.Element; color: string }> = {
  summer: { label: "صيفي ☀️", icon: <Sun className="w-4 h-4" />, color: "text-amber-500" },
  winter: { label: "شتوي ❄️", icon: <Snowflake className="w-4 h-4" />, color: "text-blue-400" },
  general: { label: "عام 📦", icon: <Package className="w-4 h-4" />, color: "text-muted-foreground" },
};

/* ─────────────────────── Page wrapper ─────────────────────── */
export default function Page() {
  return (
    <AppShell>
      <PageTransition>
        <WarehousePage />
      </PageTransition>
    </AppShell>
  );
}

/* ─────────────────────── Main page ─────────────────────── */
function WarehousePage() {
  const data = useDB();
  const navigate = useNavigate();
  const { privacy } = usePrivacy();
  const blurCls = privacy ? "privacy-blur" : "privacy-clear";

  const [q, setQ] = useState("");
  const [season, setSeason] = useState<Season>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);

  /* warehouse items only */
  const warehouseItems = useMemo(
    () => data.stockItems.filter((it) => it.location === "warehouse"),
    [data.stockItems],
  );

  /* KPI stats */
  const stats = useMemo(() => {
    const total = warehouseItems.length;
    const summerVal = warehouseItems
      .filter((it) => it.season === "summer")
      .reduce((s, it) => s + it.quantity * it.lastUnitCost, 0);
    const winterVal = warehouseItems
      .filter((it) => it.season === "winter")
      .reduce((s, it) => s + it.quantity * it.lastUnitCost, 0);
    const totalVal = warehouseItems.reduce((s, it) => s + it.quantity * it.lastUnitCost, 0);
    const totalQty = warehouseItems.reduce((s, it) => s + it.quantity, 0);
    return { total, summerVal, winterVal, totalVal, totalQty };
  }, [warehouseItems]);

  /* filtered list */
  const list = useMemo(() => {
    return warehouseItems
      .filter((it) => (season !== "all" ? it.season === season : true))
      .filter((it) => (q ? it.name.includes(q) || it.category.includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [warehouseItems, season, q]);

  /* send item to shop */
  const sendToShop = async (id: string) => {
    try {
      await db.updateStockItem(id, { location: "shop" });
      toast.success("تم نقل الصنف للمحل 🏪");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر النقل");
    }
  };

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title="المخزن"
        subtitle="البضاعة المركونة — صيفي وشتوي وعام."
        icon={<Warehouse className="w-7 h-7" />}
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate({ to: "/inventory" })}
            >
              <ArrowLeft className="w-4 h-4" />
              المنتجات
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="w-4 h-4" />
              إضافة للمخزن
            </Button>
          </div>
        }
      />

      {/* ── KPI Cards ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* total items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0 }}
          className="bezel-shell bezel-lift"
        >
          <div className="bezel-core flex flex-col gap-2 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">إجمالي الأصناف</span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10">
                <Boxes className="w-4 h-4 text-primary" />
              </span>
            </div>
            <div className="text-numeric text-3xl font-bold tabular-nums text-primary">
              {stats.total}
            </div>
            <div className="text-xs text-muted-foreground">{stats.totalQty} قطعة مخزنة</div>
          </div>
        </motion.div>

        {/* summer value */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06 }}
          className="bezel-shell bezel-lift"
        >
          <div className="bezel-core flex flex-col gap-2 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">قيمة الصيفي ☀️</span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/10">
                <Sun className="w-4 h-4 text-amber-500" />
              </span>
            </div>
            <div className={cn("text-numeric text-2xl font-bold tabular-nums text-amber-500", blurCls)}>
              {fmt(stats.summerVal)} <span className="text-sm font-normal text-muted-foreground">ج.م</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {warehouseItems.filter((it) => it.season === "summer").length} صنف صيفي
            </div>
          </div>
        </motion.div>

        {/* winter value */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
          className="bezel-shell bezel-lift"
        >
          <div className="bezel-core flex flex-col gap-2 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">قيمة الشتوي ❄️</span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500/10">
                <Snowflake className="w-4 h-4 text-blue-400" />
              </span>
            </div>
            <div className={cn("text-numeric text-2xl font-bold tabular-nums text-blue-400", blurCls)}>
              {fmt(stats.winterVal)} <span className="text-sm font-normal text-muted-foreground">ج.م</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {warehouseItems.filter((it) => it.season === "winter").length} صنف شتوي
            </div>
          </div>
        </motion.div>

        {/* total capital */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="bezel-shell bezel-lift"
        >
          <div className="bezel-core flex flex-col gap-2 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">رأس المال المجمد</span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-success/10">
                <Wallet className="w-4 h-4 text-success" />
              </span>
            </div>
            <div className={cn("text-numeric text-2xl font-bold tabular-nums text-success", blurCls)}>
              {fmt(stats.totalVal)} <span className="text-sm font-normal text-muted-foreground">ج.م</span>
            </div>
            <div className="text-xs text-muted-foreground">إجمالي تكلفة المخزن</div>
          </div>
        </motion.div>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {/* search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن صنف..."
            className="pe-9 text-right"
          />
        </div>

        {/* season tabs */}
        <Tabs value={season} onValueChange={(v) => setSeason(v as Season)}>
          <TabsList>
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="summer" className="gap-1.5">
              <Sun className="w-3.5 h-3.5" /> صيفي
            </TabsTrigger>
            <TabsTrigger value="winter" className="gap-1.5">
              <Snowflake className="w-3.5 h-3.5" /> شتوي
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-1.5">
              <Package className="w-3.5 h-3.5" /> عام
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Items list ── */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {list.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="col-span-full pt-8"
            >
              <EmptyState
                icon={Warehouse}
                title="المخزن فاضي"
                description={q ? "لا توجد نتائج للبحث." : "لا توجد بضاعة مخزنة حالياً. اضغط «نقل للمخزن» من صفحة المنتجات لإضافة أصناف."}
              />
            </motion.div>
          ) : (
            list.map((it, idx) => {
              const s = SEASON_LABELS[it.season] ?? SEASON_LABELS.general;
              const value = it.quantity * it.lastUnitCost;
              return (
                <motion.div
                  key={it.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1], delay: Math.min(idx, 15) * 0.03 }}
                  className="bezel-shell bezel-lift group"
                >
                  <div className="bezel-core flex flex-col gap-3 p-4">
                    {/* top row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-primary truncate">{it.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{categoryLabel(it.category)}</div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 gap-1 text-[10px]", s.color)}
                      >
                        {s.icon} {s.label}
                      </Badge>
                    </div>

                    {/* stats */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-foreground/[0.04] py-2">
                        <div className={cn("text-numeric text-lg font-bold tabular-nums", it.quantity <= 0 ? "text-danger" : "text-foreground")}>
                          {fmt(it.quantity)}
                        </div>
                        <div className="text-muted-foreground">كمية</div>
                      </div>
                      <div className="rounded-lg bg-foreground/[0.04] py-2">
                        <div className={cn("text-numeric text-sm font-bold tabular-nums", blurCls)}>
                          {fmt(it.lastUnitCost)}
                        </div>
                        <div className="text-muted-foreground">تكلفة</div>
                      </div>
                      <div className="rounded-lg bg-foreground/[0.04] py-2">
                        <div className={cn("text-numeric text-sm font-bold tabular-nums text-success", blurCls)}>
                          {fmt(value)}
                        </div>
                        <div className="text-muted-foreground">قيمة</div>
                      </div>
                    </div>

                    {/* actions */}
                    <div className="flex gap-2 pt-1">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1 gap-1.5 bg-success/15 text-success hover:bg-success/25 border border-success/30"
                          >
                            <Store className="w-3.5 h-3.5" />
                            نقل للمحل
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>تأكيد النقل للمحل</AlertDialogTitle>
                            <AlertDialogDescription>
                              هيتم نقل «{it.name}» من المخزن للعرض في المحل وسيظهر في صفحة المنتجات.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={() => sendToShop(it.id)}>
                              نقل للمحل 🏪
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setEditItem(it)}
                        title="تعديل"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        تعديل
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* ── Add to Warehouse Dialog ── */}
      <AddWarehouseDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* ── Edit Dialog ── */}
      <EditWarehouseDialog item={editItem} onClose={() => setEditItem(null)} />
    </>
  );
}

/* ─────────────────────── Add Dialog ─────────────────────── */
function AddWarehouseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("0");
  const [cost, setCost] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [season, setSeason] = useState<"summer" | "winter" | "general">("general");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName(""); setQty("0"); setCost("0"); setSalePrice("0");
    setSeason("general"); setCategory("other");
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("اكتب اسم الصنف"); return; }
    setBusy(true);
    try {
      await db.addStockItem({
        name: name.trim(),
        quantity: Number(qty) || 0,
        lastUnitCost: Number(cost) || 0,
        salePrice: Number(salePrice) || 0,
        category,
        location: "warehouse",
        season,
      });
      toast.success("تمت إضافة الصنف للمخزن 📦");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الإضافة");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">إضافة صنف للمخزن</DialogTitle>
          <DialogDescription className="text-right">أضف بضاعة مركونة جديدة مع تحديد موسمها.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>اسم الصنف</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: بنطلون صيفي..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>الكمية</Label>
              <Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>سعر التكلفة (ج.م)</Label>
              <Input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>سعر البيع (ج.م) — اختياري</Label>
            <Input type="number" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>الموسم</Label>
            <Select value={season} onValueChange={(v) => setSeason(v as "summer" | "winter" | "general")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summer">☀️ صيفي</SelectItem>
                <SelectItem value="winter">❄️ شتوي</SelectItem>
                <SelectItem value="general">📦 عام / مستمر</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>الفئة / القسم</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_CATEGORY_GROUPS.map((g) =>
                  g.items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            <Plus className="w-4 h-4" />
            {busy ? "جاري الإضافة..." : "إضافة للمخزن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Edit Dialog ─────────────────────── */
function EditWarehouseDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("0");
  const [cost, setCost] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [season, setSeason] = useState<"summer" | "winter" | "general">("general");
  const [busy, setBusy] = useState(false);

  useMemo(() => {
    if (item) {
      setName(item.name);
      setQty(String(item.quantity));
      setCost(String(item.lastUnitCost));
      setSalePrice(String(item.salePrice));
      setSeason(item.season as "summer" | "winter" | "general");
    }
  }, [item]);

  const submit = async () => {
    if (!item) return;
    if (!name.trim()) { toast.error("اكتب اسم الصنف"); return; }
    setBusy(true);
    try {
      const newQty = Number(qty) || 0;
      const delta = newQty - item.quantity;
      await db.updateStockItem(
        item.id,
        { name: name.trim(), quantity: newQty, lastUnitCost: Number(cost) || 0, salePrice: Number(salePrice) || 0, season },
        delta !== 0 ? { delta, reason: "تصحيح جرد" } : undefined,
      );
      toast.success("تم تحديث الصنف");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحفظ");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">تعديل الصنف — {item?.name}</DialogTitle>
          <DialogDescription className="text-right">عدّل الكمية أو الموسم أو الأسعار.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>اسم الصنف</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>الكمية</Label>
              <Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>سعر التكلفة (ج.م)</Label>
              <Input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>سعر البيع (ج.م)</Label>
            <Input type="number" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>الموسم</Label>
            <Select value={season} onValueChange={(v) => setSeason(v as "summer" | "winter" | "general")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summer">☀️ صيفي</SelectItem>
                <SelectItem value="winter">❄️ شتوي</SelectItem>
                <SelectItem value="general">📦 عام / مستمر</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "جاري الحفظ..." : "حفظ التعديلات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
