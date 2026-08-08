import { useEffect, useMemo, useState } from "react";
import {
  useArchive, restoreArchived, restoreMany, purgeArchived, purgeAllArchived, getArchiveRetention, saveArchiveRetention,
  getArchiveAccess, getArchiveAuditLog,
  type ArchiveRetentionDays, type ArchiveAccess, type ArchiveAuditEntry,
  ENTITY_LABELS, type ArchiveEntity, type ArchivedRecord,
} from "@/lib/archive";
import { useDB } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Users, FileText, Truck, Package, Receipt, RotateCcw, Trash2, Search, Archive as ArchiveIcon, ArrowUpRight, CalendarDays, Database, Eye, ShieldAlert, SlidersHorizontal, CheckSquare, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pdfDocument, openPdfDocument, esc } from "@/lib/pdf-doc";

const ICONS: Record<ArchiveEntity, typeof Users> = {
  customer: Users,
  invoice: FileText,
  supplier: Truck,
  stock_item: Package,
  expense: Receipt,
};

const ORDER: ArchiveEntity[] = ["customer", "invoice", "supplier", "stock_item", "expense"];

function money(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(n);
}

function when(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return d.toLocaleDateString("ar-EG");
}

/** Outer shell + inner core: nested "double bezel" enclosure. */
function Bezel({ className, children, tone = "default" }: { className?: string; children: React.ReactNode; tone?: "default" | "accent" }) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border border-border/60 bg-muted/30 p-1.5 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
        tone === "accent" && "border-primary/25 bg-primary/5",
        className,
      )}
    >
      <div className="h-full rounded-[calc(2rem-0.375rem)] border border-border/50 bg-card shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
        {children}
      </div>
    </div>
  );
}

export default function Archive() {
  const { refresh: refreshDB } = useDB();
  const { records, loading, refresh } = useArchive();
  const [tab, setTab] = useState<ArchiveEntity | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "one"; rec: ArchivedRecord } | { kind: "all" } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [preview, setPreview] = useState<ArchivedRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<"all" | "7" | "30" | "90">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "value">("newest");
  const [retention, setRetention] = useState<ArchiveRetentionDays>(0);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");
  const [access, setAccess] = useState<ArchiveAccess | null>(null);
  const [auditEntries, setAuditEntries] = useState<ArchiveAuditEntry[]>([]);
  const [batchRestoreConfirm, setBatchRestoreConfirm] = useState<{ records: ArchivedRecord[]; reason: string } | null>(null);

  useEffect(() => { getArchiveRetention().then(setRetention).catch(() => undefined); }, []);
  useEffect(() => { getArchiveAccess().then(setAccess).catch(() => setAccess(null)); }, []);
  useEffect(() => { getArchiveAuditLog().then(setAuditEntries).catch(() => setAuditEntries([])); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: records.length };
    for (const e of ORDER) c[e] = records.filter((r) => r.entityType === e).length;
    return c;
  }, [records]);

  const filtered = useMemo(() => {
    const term = q.trim();
    const after = period === "all" ? null : Date.now() - Number(period) * 86400000;
    return records.filter(
      (r) =>
        (tab === "all" || r.entityType === tab) &&
        (!term || r.label.includes(term) || r.summary.includes(term)) &&
        (!after || new Date(r.deletedAt).getTime() >= after),
    ).sort((a, b) => sort === "oldest" ? new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime() : sort === "value" ? b.amount - a.amount : new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  }, [records, tab, q, period, sort]);

  async function onRestore(rec: ArchivedRecord, reason?: string) {
    if (!access?.canRestore) {
      toast.error("ليس لديك صلاحية لاسترجاع السجلات المؤرشفة");
      return;
    }
    setBusy(rec.id);
    try {
      await restoreArchived(rec, reason);
      await Promise.all([refresh(), refreshDB()]);
      toast.success(`تم استرجاع ${ENTITY_LABELS[rec.entityType]}: ${rec.label}`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الاسترجاع");
    } finally {
      setBusy(null);
    }
  }

  async function onPurge(reason?: string) {
    if (!confirm) return;
    if (!access?.canPurge) {
      toast.error("ليس لديك صلاحية للحذف النهائي من الأرشيف");
      return;
    }
    try {
      if (confirm.kind === "one") {
        await purgeArchived(confirm.rec.id, reason);
        toast.success("تم المسح النهائي");
      } else {
        await purgeAllArchived(tab === "all" ? undefined : tab, reason);
        toast.success("تم إفراغ الأرشيف");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر المسح");
    } finally {
      setConfirm(null);
    }
  }

  const toggleSelection = (id: string) => setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const selectedRecords = filtered.filter((record) => selectedIds.includes(record.id));
  const restoreSelected = async () => {
    if (!selectedRecords.length) return;
    if (!access?.canRestore) {
      toast.error("ليس لديك صلاحية لاسترجاع السجلات المؤرشفة");
      return;
    }
    setBatchRestoreConfirm({ records: selectedRecords, reason: "استرجاع جماعي من الأرشيف" });
  };
  const updateRetention = async (value: string) => { const days = Number(value) as ArchiveRetentionDays; setRetention(days); setRetentionBusy(true); try { await saveArchiveRetention(days); toast.success(days ? `سيتم الاحتفاظ بالسجلات لمدة ${days} يومًا` : "تم الاحتفاظ بالسجلات حتى الحذف اليدوي"); } catch { toast.error("تعذر حفظ سياسة الاحتفاظ"); } finally { setRetentionBusy(false); } };

  const exportArchive = async () => {
    const rows = filtered.map((record) => ({
      النوع: ENTITY_LABELS[record.entityType],
      الاسم: record.label,
      الملخص: record.summary,
      المبلغ: String(record.amount),
      تاريخ_الحذف: record.deletedAt,
    }));

    if (exportFormat === "csv") {
      const headers = ["النوع", "الاسم", "الملخص", "المبلغ", "تاريخ_الحذف"];
      const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => `"${String((row as any)[header] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `archive-export-${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير بيانات الأرشيف بصيغة CSV");
      return;
    }

    const html = pdfDocument({
      docTitle: "أرشيف السجلات",
      badge: "Archive Export",
      title: "تصدير الأرشيف",
      lede: `نوع التصدير: ${exportFormat.toUpperCase()} · البحث الحالي: ${esc(q || "الكل")} · الفترة: ${period === "all" ? "الكل" : `${period} يوم`}`,
      meta: [
        { label: "النوع", value: tab === "all" ? "الكل" : ENTITY_LABELS[tab] },
        { label: "عدد السجلات", value: String(rows.length) },
        { label: "التاريخ", value: new Date().toLocaleDateString("ar-EG") },
      ],
      kpis: [
        { label: "عدد السجلات", value: String(rows.length), tone: "brand" },
        { label: "إجمالي القيمة", value: money(filtered.reduce((sum, item) => sum + item.amount, 0)) },
      ],
      body: `<div class="t-wrap"><table><thead><tr><th>النوع</th><th>الاسم</th><th>الملخص</th><th>المبلغ</th><th>تاريخ الحذف</th></tr></thead><tbody>${filtered.map((record) => `<tr><td>${esc(ENTITY_LABELS[record.entityType])}</td><td>${esc(record.label)}</td><td>${esc(record.summary)}</td><td class="num">${money(record.amount)}</td><td>${new Date(record.deletedAt).toLocaleDateString("ar-EG")}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">لا توجد بيانات</td></tr>`}</tbody></table></div>`,
      page: "A4 landscape",
    });
    if (!openPdfDocument(html, { autoPrint: false, features: "width=980,height=760" })) {
      toast.error("يحتاج المتصفح إلى فتح نافذة منبثقة لتصدير PDF");
      return;
    }
    toast.success("تم تجهيز ملف PDF الخاص بالأرشيف");
  };

  const activeCount = counts[tab] ?? 0;
  const totalValue = useMemo(() => records.reduce((sum, record) => sum + record.amount, 0), [records]);

  return (
    <AppShell><PageTransition>
      <div className="w-full">
        <PageHeader title="الأرشيف" eyebrow="إدارة السجلات المحذوفة" icon={<ArchiveIcon className="w-7 h-7" />} subtitle="احتفظ بنسخة قابلة للاسترجاع من السجلات المحذوفة، ثم راجع تفاصيلها قبل استعادتها أو مسحها نهائيًا." action={<Button variant="outline" disabled={activeCount === 0} onClick={() => { setConfirmText(""); setConfirm({ kind: "all" }); }} className="group gap-3 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"><span>إفراغ {tab === "all" ? "الأرشيف" : ENTITY_LABELS[tab]} ({activeCount})</span><span className="grid h-7 w-7 place-items-center rounded-full bg-destructive/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105"><Trash2 className="h-3.5 w-3.5" /></span></Button>} />

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ArchiveMetric icon={<ArchiveIcon className="w-4 h-4" />} label="إجمالي العناصر" value={money(records.length)} />
          <ArchiveMetric icon={<Database className="w-4 h-4" />} label="القيمة المؤرشفة" value={money(totalValue)} />
          <ArchiveMetric icon={<CalendarDays className="w-4 h-4" />} label="آخر حذف" value={records[0] ? when(records[0].deletedAt) : "لا توجد سجلات"} />
          <ArchiveMetric icon={<ShieldAlert className="w-4 h-4" />} label="الصلاحية الحالية" value={access?.isOwner ? "مالك" : access?.role ?? "غير محدد"} />
        </div>

        {/* Filters */}
        <Bezel className="mb-8">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {(["all", ...ORDER] as const).map((k) => {
                const active = tab === k;
                const Icon = k === "all" ? ArchiveIcon : ICONS[k];
                return (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
                      active ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {k === "all" ? "الكل" : ENTITY_LABELS[k]}
                    <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-primary-foreground/20" : "bg-background/70")}>
                      {counts[k] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex w-full flex-col gap-2 md:w-96">
              <div className="relative">
                <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث في الأرشيف…"
                  className="w-full rounded-full border border-border/60 bg-background py-2.5 pe-10 ps-4 text-sm outline-none transition-all duration-500 focus:border-primary/40"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as "csv" | "pdf")}>
                  <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="gap-2" onClick={exportArchive}><Download className="w-4 h-4" /> تصدير</Button>
              </div>
            </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted-foreground"><SlidersHorizontal className="w-3.5 h-3.5" /> الفلاتر</span>
                <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}><SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الفترات</SelectItem><SelectItem value="7">آخر 7 أيام</SelectItem><SelectItem value="30">آخر 30 يومًا</SelectItem><SelectItem value="90">آخر 90 يومًا</SelectItem></SelectContent></Select>
                <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}><SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">الأحدث أولاً</SelectItem><SelectItem value="oldest">الأقدم أولاً</SelectItem><SelectItem value="value">الأعلى قيمة</SelectItem></SelectContent></Select>
              </div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">الاحتفاظ</span><Select value={String(retention)} onValueChange={updateRetention} disabled={retentionBusy}><SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">حتى الحذف اليدوي</SelectItem><SelectItem value="30">30 يومًا</SelectItem><SelectItem value="90">90 يومًا</SelectItem><SelectItem value="180">180 يومًا</SelectItem></SelectContent></Select></div>
            </div>
          </div>
        </Bezel>

        {selectedRecords.length ? <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-primary/8 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm"><CheckSquare className="w-4 h-4 text-primary" /> تم اختيار {selectedRecords.length} سجل للاسترجاع</div><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>إلغاء التحديد</Button><Button size="sm" disabled={busy !== null || !access?.canRestore} className="gap-2" onClick={restoreSelected}><RotateCcw className="w-4 h-4" /> استرجاع المحدد</Button></div></div> : null}

        {/* List */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Bezel key={i}><div className="h-28 animate-pulse rounded-[calc(2rem-0.375rem)] bg-muted/40" /></Bezel>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Bezel>
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center md:py-20">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
                <ArchiveIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.25} />
              </span>
              <p className="text-lg font-medium">الأرشيف فاضي</p>
              <p className="max-w-xs text-sm text-muted-foreground">أي عنصر تحذفه من أي قسم في التطبيق هيظهر هنا تلقائيًا.</p>
            </div>
          </Bezel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((r, i) => {
              const Icon = ICONS[r.entityType];
              return (
                <Bezel key={r.id} className="group hover:-translate-y-0.5">
                  <div className="flex h-full flex-col gap-5 p-5" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="flex items-start gap-4">
                      <label className="mt-1 grid h-5 w-5 shrink-0 cursor-pointer place-items-center"><input aria-label={`تحديد ${r.label}`} type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelection(r.id)} className="h-4 w-4 accent-primary" /></label>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/70 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105">
                        <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                            {ENTITY_LABELS[r.entityType]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{when(r.deletedAt)}</span>
                        </div>
                        <p className="mt-2 truncate text-base font-medium">{r.label}</p>
                        {r.summary && <p className="mt-1 truncate text-xs text-muted-foreground">{r.summary}</p>}
                      </div>
                      {r.amount > 0 && (
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.amount)}</span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center gap-2">
                      <button onClick={() => setPreview(r)} aria-label="عرض التفاصيل" className="grid h-10 w-10 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/10 hover:text-primary active:scale-[0.98]"><Eye className="h-4 w-4" strokeWidth={1.5} /></button>
                      <button
                        onClick={() => onRestore(r, "استرجاع فردي من الأرشيف")}
                        disabled={busy === r.id || !access?.canRestore}
                        className="group/btn inline-flex flex-1 items-center justify-between gap-3 rounded-full bg-primary py-2 pe-2 ps-5 text-sm font-medium text-primary-foreground transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
                      >
                        استرجاع
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/btn:-translate-y-[1px] group-hover/btn:translate-x-1 group-hover/btn:scale-105">
                          {busy === r.id ? <RotateCcw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />}
                        </span>
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: "one", rec: r })}
                        disabled={!access?.canPurge}
                        aria-label="مسح نهائي"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-destructive/40 hover:text-destructive active:scale-[0.98] disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </Bezel>
              );
            })}
          </div>
        )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">مسح نهائي بدون رجعة</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {confirm?.kind === "one"
                ? `هيتم مسح "${confirm.rec.label}" من الأرشيف نهائيًا ومش هينفع استرجاعه بعد كده.`
                : `هيتم إفراغ ${activeCount} عنصر نهائيًا من ${tab === "all" ? "الأرشيف" : ENTITY_LABELS[tab]}، ومش هينفع استرجاع أي عنصر بعد كده.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.kind === "all" ? <div className="grid gap-2"><label className="text-xs text-muted-foreground">اكتب <strong className="text-foreground">حذف</strong> لتأكيد إفراغ الأرشيف</label><Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="حذف" /></div> : null}
          <div className="rounded-2xl bg-foreground/[0.04] p-3 text-sm text-muted-foreground">السبب (اختياري): <span className="text-xs">سيُسجل في Audit Log مع اسم المستخدم والتاريخ</span></div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction disabled={confirm?.kind === "all" && confirmText.trim() !== "حذف"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onPurge("مسح نهائي من الأرشيف")}>مسح نهائي</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="text-right">تفاصيل السجل المؤرشف</DialogTitle><DialogDescription className="text-right">راجع البيانات قبل الاسترجاع. الاسترجاع يعيد السجل كما كان وقت الحذف.</DialogDescription></DialogHeader>{preview ? <ArchiveDetails record={preview} /> : null}<DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setPreview(null)}>إغلاق</Button>{preview ? <Button disabled={busy === preview.id || !access?.canRestore} className="gap-2" onClick={() => { setPreview(null); onRestore(preview, "استرجاع من تفاصيل السجل"); }}><RotateCcw className="w-4 h-4" /> استرجاع السجل</Button> : null}</DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={!!batchRestoreConfirm} onOpenChange={(open) => !open && setBatchRestoreConfirm(null)}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-right">تأكيد الاسترجاع الجماعي</DialogTitle>
            <DialogDescription className="text-right">سيتم استرجاع {batchRestoreConfirm?.records.length ?? 0} سجل من الأرشيف، وبعد التأكيد سيُعرض لك ملخص بالتغييرات.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-2xl bg-foreground/[0.04] p-3">
              <div className="font-bold mb-2">ملخص التغييرات</div>
              <ul className="space-y-1 text-muted-foreground">
                {batchRestoreConfirm?.records.map((record) => <li key={record.id}>• {ENTITY_LABELS[record.entityType]}: {record.label}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl bg-foreground/[0.04] p-3">سيتم تسجيل العملية في Audit Log مع اسم المستخدم والوقت.</div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setBatchRestoreConfirm(null)}>إلغاء</Button>
            <Button className="gap-2" onClick={async () => {
              if (!batchRestoreConfirm) return;
              setBusy("batch");
              try {
                const { restored, failed } = await restoreMany(batchRestoreConfirm.records, batchRestoreConfirm.reason);
                await Promise.all([refresh(), refreshDB()]);
                setSelectedIds([]);
                toast.success(`تم استرجاع ${restored} سجل`);
                if (failed.length) toast.error(`تعذر استرجاع: ${failed.slice(0, 2).join("، ")}`);
              } catch (e: any) {
                toast.error(e?.message ?? "تعذر الاسترجاع الجماعي");
              } finally {
                setBusy(null);
                setBatchRestoreConfirm(null);
              }
            }}><RotateCcw className="w-4 h-4" /> تأكيد الاسترجاع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Bezel className="mt-6">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">Audit Log</p>
            <span className="text-xs text-muted-foreground">آخر 40 عملية</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-auto">
            {auditEntries.length === 0 ? <div className="text-sm text-muted-foreground">لا توجد عمليات مسجلة بعد</div> : auditEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-foreground/[0.04] p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{entry.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString("ar-EG")}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{entry.details}</div>
                <div className="mt-1 text-xs text-muted-foreground">بواسطة: {entry.actor}</div>
              </div>
            ))}
          </div>
        </div>
      </Bezel>
      </div>
    </PageTransition></AppShell>
  );
}

function ArchiveMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="plate flex min-h-[150px] flex-col justify-between p-6 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 md:p-7"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-4 text-2xl font-extrabold leading-tight tabular-nums md:text-3xl">{value}</div></div>; }
function ArchiveDetails({ record }: { record: ArchivedRecord }) { const row = record.payload?.row ?? {}; const children = record.entityType === "invoice" ? `بنود: ${record.payload?.invoice_items?.length ?? 0}، دفعات: ${record.payload?.payments?.length ?? 0}` : null; return <div className="grid gap-3"><div className="rounded-2xl bg-foreground/[0.04] p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">النوع</span><span className="text-sm font-bold">{ENTITY_LABELS[record.entityType]}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">تاريخ الحذف</span><span className="text-sm">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "long", timeStyle: "short" }).format(new Date(record.deletedAt))}</span></div></div><div className="rounded-2xl bg-foreground/[0.04] p-4"><p className="text-sm font-bold">{record.label}</p><p className="mt-1 text-xs text-muted-foreground">{record.summary || "لا توجد ملاحظات إضافية"}</p>{children ? <p className="mt-3 text-xs text-muted-foreground">{children}</p> : null}</div><div className="rounded-2xl bg-foreground/[0.04] p-4 text-xs leading-6 text-muted-foreground">{Object.entries(row).filter(([key]) => !["id", "user_id", "created_at", "updated_at"].includes(key)).slice(0, 8).map(([key, value]) => <p key={key}><span className="text-foreground/70">{key}:</span> {String(value ?? "-")}</p>)}</div></div>; }
