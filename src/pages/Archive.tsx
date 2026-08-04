import { useMemo, useState } from "react";
import {
  useArchive, restoreArchived, purgeArchived, purgeAllArchived,
  ENTITY_LABELS, type ArchiveEntity, type ArchivedRecord,
} from "@/lib/archive";
import { useDB } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { Users, FileText, Truck, Package, Receipt, RotateCcw, Trash2, Search, Archive as ArchiveIcon, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: records.length };
    for (const e of ORDER) c[e] = records.filter((r) => r.entityType === e).length;
    return c;
  }, [records]);

  const filtered = useMemo(() => {
    const term = q.trim();
    return records.filter(
      (r) =>
        (tab === "all" || r.entityType === tab) &&
        (!term || r.label.includes(term) || r.summary.includes(term)),
    );
  }, [records, tab, q]);

  async function onRestore(rec: ArchivedRecord) {
    setBusy(rec.id);
    try {
      await restoreArchived(rec);
      await Promise.all([refresh(), refreshDB()]);
      toast.success(`تم استرجاع ${ENTITY_LABELS[rec.entityType]}: ${rec.label}`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الاسترجاع");
    } finally {
      setBusy(null);
    }
  }

  async function onPurge() {
    if (!confirm) return;
    try {
      if (confirm.kind === "one") {
        await purgeArchived(confirm.rec.id);
        toast.success("تم المسح النهائي");
      } else {
        await purgeAllArchived(tab === "all" ? undefined : tab);
        toast.success("تم إفراغ الأرشيف");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر المسح");
    } finally {
      setConfirm(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-16">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              <ArchiveIcon className="h-3 w-3" strokeWidth={1.5} />
              التقارير / الأرشيف
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">سلة الأرشيف</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              كل ما تم حذفه من عملاء وفواتير وموردين وأصناف ومصروفات محفوظ هنا بالكامل — استرجعه بضغطة، أو امسحه نهائيًا.
            </p>
          </div>
          <button
            onClick={() => setConfirm({ kind: "all" })}
            disabled={filtered.length === 0}
            className="group inline-flex w-max items-center gap-3 rounded-full border border-border/60 bg-card py-2 pe-2 ps-5 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-destructive/40 active:scale-[0.98] disabled:opacity-40"
          >
            إفراغ {tab === "all" ? "الأرشيف" : ENTITY_LABELS[tab]}
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105 group-hover:bg-destructive/10 group-hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </span>
          </button>
        </div>

        {/* Filters */}
        <Bezel className="mb-8">
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
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
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث في الأرشيف…"
                className="w-full rounded-full border border-border/60 bg-background py-2.5 pe-10 ps-4 text-sm outline-none transition-all duration-500 focus:border-primary/40"
              />
            </div>
          </div>
        </Bezel>

        {/* List */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Bezel key={i}><div className="h-28 animate-pulse rounded-[calc(2rem-0.375rem)] bg-muted/40" /></Bezel>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Bezel>
            <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
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
                      <button
                        onClick={() => onRestore(r)}
                        disabled={busy === r.id}
                        className="group/btn inline-flex flex-1 items-center justify-between gap-3 rounded-full bg-primary py-2 pe-2 ps-5 text-sm font-medium text-primary-foreground transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
                      >
                        استرجاع
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/btn:-translate-y-[1px] group-hover/btn:translate-x-1 group-hover/btn:scale-105">
                          {busy === r.id ? <RotateCcw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />}
                        </span>
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: "one", rec: r })}
                        aria-label="مسح نهائي"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-destructive/40 hover:text-destructive active:scale-[0.98]"
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
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>مسح نهائي بدون رجعة</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "one"
                ? `هيتم مسح "${confirm.rec.label}" من الأرشيف نهائيًا ومش هينفع استرجاعه بعد كده.`
                : "هيتم إفراغ الأرشيف نهائيًا ومش هينفع استرجاع أي عنصر بعد كده."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={onPurge}>مسح نهائي</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
