import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Printer, Barcode, Package } from "lucide-react";
import type { StockItem } from "@/lib/store";
import { ean13Svg, generateEan13, EAN13_ASPECT } from "@/lib/barcode-svg";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SIZES = [
  { key: "58x40", label: "58×40 ملم", w: 58, h: 40 },
  { key: "50x30", label: "50×30 ملم", w: 50, h: 30 },
  { key: "40x20", label: "40×20 ملم", w: 40, h: 20 },
] as const;

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function BarcodeGenerator({ open, onOpenChange, items }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: StockItem[];
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [sizeKey, setSizeKey] = useState<string>("58x40");
  const [customW, setCustomW] = useState("58");
  const [customH, setCustomH] = useState("40");

  useEffect(() => {
    if (open) { setQ(""); setSelected({}); setCopies({}); }
  }, [open]);

  const allCodes = useMemo(() => items.map((i) => i.barcode), [items]);

  const filtered = useMemo(
    () => items
      .filter((it) => (q ? it.name.includes(q) || (it.barcode ?? "").includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [items, q],
  );

  const toggle = (item: StockItem) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item.barcode ?? generateEan13([...allCodes, ...Object.values(next)]);
      return next;
    });
  };

  const setCode = (id: string, code: string) => setSelected((p) => ({ ...p, [id]: code }));
  const setCopy = (id: string, n: number) => setCopies((p) => ({ ...p, [id]: Math.max(1, Math.min(99, n || 1)) }));

  const selectedIds = Object.keys(selected);
  const previewId = selectedIds[0];
  const previewItem = items.find((i) => i.id === previewId);
  const previewCode = previewId ? selected[previewId] : "";

  const size = SIZES.find((s) => s.key === sizeKey)
    ?? { key: "custom", label: "مخصص", w: Number(customW) || 58, h: Number(customH) || 40 };

  const print = () => {
    if (!selectedIds.length) { toast.error("اختر صنفًا واحدًا على الأقل"); return; }
    const W = size.w;
    const H = size.h;
    const pad = 2.5;
    const availW = W - pad * 2;
    const availH = H - pad * 2 - 9;
    const r = EAN13_ASPECT.h / EAN13_ASPECT.w;
    let sw = availW, sh = sw * r;
    if (sh > availH) { sh = availH; sw = sh / r; }
    const labels: string[] = [];
    for (const id of selectedIds) {
      const item = items.find((i) => i.id === id);
      const code = (selected[id] ?? "").trim();
      if (!/^\d{6,}$/.test(code)) {
        toast.error(`الكود غير صالح (أرقام فقط): ${item?.name ?? ""}`);
        return;
      }
      const svg = ean13Svg(code, { mmWidth: Math.max(8, sw) });
      const n = copies[id] || 1;
      for (let i = 0; i < n; i++) {
        labels.push(`<div class="label"><div class="nm">${escHtml(item?.name ?? "")}</div>${svg}<div class="cd">${escHtml(code)}</div></div>`);
      }
    }
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>طباعة الباركود</title>
<style>
@page { size: ${W}mm ${H}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
.label {
  width: ${W}mm; height: ${H}mm; box-sizing: border-box; padding: ${pad}mm;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1mm; page-break-after: always; overflow: hidden;
}
.label:last-child { page-break-after: auto; }
.label .nm { font: bold 9pt "Segoe UI", Arial, sans-serif; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label .cd { font: 8pt "Courier New", monospace; }
</style></head><body>${labels.join("")}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("اسمح بفتح النوافذ المنبثقة"); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.onafterprint = () => { try { w.close(); } catch { /* noop */ } };
      try { w.print(); } catch { /* noop */ }
    }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Barcode className="w-5 h-5 text-primary" />
            مولد الباركود
          </DialogTitle>
          <DialogDescription className="text-right">
            اختر الأصناف، حدد عدد اللـيبل، واطبع باركود EAN-13 بطابعة اللـيبل الحرارية.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mb-2">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الصنف أو الباركود..." className="pr-10" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Item picker */}
          <div className="border border-[var(--hairline)] rounded-2xl overflow-hidden">
            <div className="max-h-56 overflow-y-auto divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-10">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  لا توجد أصناف مطابقة.
                </div>
              )}
              {filtered.map((it) => {
                const on = !!selected[it.id];
                return (
                  <label key={it.id} className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors", on ? "bg-primary/5" : "hover:bg-foreground/[0.03]")}>
                    <Checkbox checked={on} onCheckedChange={() => toggle(it)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{it.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                        {it.barcode ?? <span className="text-warning">بلا باركود — سيُولّد تلقائيًا</span>}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="border border-[var(--hairline)] rounded-2xl p-4 flex flex-col items-center justify-center min-h-40 bg-foreground/[0.02]">
            {previewItem ? (
              <>
                <div className="text-sm font-bold mb-2 truncate max-w-full">{previewItem.name}</div>
                <div
                  className="w-full flex justify-center"
                  dangerouslySetInnerHTML={{ __html: previewCode ? ean13Svg(previewCode, { pxWidth: 300 }) : "" }}
                />
                {previewCode && (
                  <div className="text-xs font-mono text-muted-foreground mt-1" dir="ltr">{previewCode}</div>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground text-sm">
                <Barcode className="w-10 h-10 mx-auto mb-2 opacity-40" />
                اختر صنفًا لعرض معاينة الباركود.
              </div>
            )}
          </div>
        </div>

        {/* Selected items */}
        {selectedIds.length > 0 && (
          <div className="mt-3 space-y-2">
            <Label>الأصناف المحددة</Label>
            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
              {selectedIds.map((id) => {
                const it = items.find((i) => i.id === id);
                const code = selected[id];
                const n = copies[id] || 1;
                return (
                  <div key={id} className="flex items-center gap-2 rounded-2xl border border-[var(--hairline)] p-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{it?.name}</div>
                      <Input
                        value={code}
                        onChange={(e) => setCode(id, e.target.value.replace(/\D/g, "").slice(0, 13))}
                        className="mt-1 h-8 font-mono text-sm"
                        dir="ltr"
                        maxLength={13}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">عدد النسخ</Label>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={n}
                        onChange={(e) => setCopy(id, Number(e.target.value))}
                        className="h-8 w-16 text-center tabular-nums"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Label size */}
        <div className="mt-3 grid gap-1.5">
          <Label>مقاس اللـيبل</Label>
          <div className="flex flex-wrap items-center gap-2">
            {SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSizeKey(s.key)}
                className={cn(
                  "rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition-all duration-200",
                  sizeKey === s.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-foreground/[0.04]",
                )}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSizeKey("custom")}
              className={cn(
                "rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition-all duration-200",
                sizeKey === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-foreground/[0.04]",
              )}
            >
              مخصص
            </button>
            {sizeKey === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} className="h-8 w-16 text-center" min={20} max={200} />
                <span className="text-xs text-muted-foreground">×</span>
                <Input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} className="h-8 w-16 text-center" min={10} max={200} />
                <span className="text-xs text-muted-foreground">ملم</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button onClick={print} disabled={!selectedIds.length} className="gap-1.5">
            <Printer className="w-4 h-4" /> طباعة اللـيبلات ({selectedIds.reduce((s, id) => s + (copies[id] || 1), 0)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
