import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Printer, Barcode, Package, RotateCcw, Check, AlertTriangle, Shirt, Banknote,
} from "lucide-react";
import { db, fmt, type StockItem } from "@/lib/store";
import {
  ean13CheckDigit, upcaCheckDigit, generateEan13, generateUpcA, generateCode128,
  detectFormat, isValidBarcode, renderBarcode, barcodeViewBox, type BarcodeFormat,
} from "@/lib/barcode-svg";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SIZES = [
  { key: "58x40", label: "58×40 ملم", w: 58, h: 40 },
  { key: "50x30", label: "50×30 ملم", w: 50, h: 30 },
  { key: "40x20", label: "40×20 ملم", w: 40, h: 20 },
] as const;

type Settings = {
  format: BarcodeFormat;
  mode: "roll" | "sheet";
  sizeKey: string;
  customW: string;
  customH: string;
  defaultCopies: number;
  showPrice: boolean;
  showSize: boolean;
  textAbove: boolean;
  customText: string;
  saveOnPrint: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  format: "ean13",
  mode: "roll",
  sizeKey: "58x40",
  customW: "58",
  customH: "40",
  defaultCopies: 1,
  showPrice: true,
  showSize: true,
  textAbove: false,
  customText: "",
  saveOnPrint: false,
};

const LS_KEY = "barcode-gen-settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtLabel(f: BarcodeFormat): string {
  return f === "ean13" ? "EAN-13" : f === "upca" ? "UPC-A" : "Code128";
}

export function BarcodeGenerator({ open, onOpenChange, items }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: StockItem[];
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const setSetting = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

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

  const genCode = (f: BarcodeFormat, existing: Array<string | null | undefined>): string => {
    if (f === "upca") return generateUpcA(existing);
    if (f === "code128") return generateCode128(existing);
    return generateEan13(existing);
  };

  const toggle = (item: StockItem) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item.barcode ?? genCode(settings.format, [...allCodes, ...Object.values(next)]);
      return next;
    });
    setCopies((p) => ({ ...p, [item.id]: p[item.id] ?? settings.defaultCopies }));
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const it of filtered) {
        if (!next[it.id]) next[it.id] = it.barcode ?? genCode(settings.format, [...allCodes, ...Object.values(next)]);
      }
      return next;
    });
    setCopies((p) => {
      const next = { ...p };
      for (const it of filtered) next[it.id] = next[it.id] ?? settings.defaultCopies;
      return next;
    });
  };

  const clearAll = () => { setSelected({}); setCopies({}); };

  const setCode = (id: string, v: string) => setSelected((p) => ({ ...p, [id]: v }));

  const finalizeCode = (id: string, raw: string) => {
    let v = raw.trim();
    if (/^\d{12}$/.test(v)) v += ean13CheckDigit(v);
    else if (/^\d{11}$/.test(v)) v += upcaCheckDigit(v);
    setSelected((p) => ({ ...p, [id]: v }));
  };

  const regenerate = (id: string) => {
    setSelected((prev) => {
      const others = Object.entries(prev).filter(([k]) => k !== id).map(([, v]) => v);
      return { ...prev, [id]: genCode(settings.format, [...allCodes, ...others]) };
    });
  };

  const selectedIds = Object.keys(selected);
  const size = SIZES.find((s) => s.key === settings.sizeKey)
    ?? { key: "custom", label: "مخصص", w: Number(settings.customW) || 58, h: Number(settings.customH) || 40 };

  const totalLabels = selectedIds.reduce((s, id) => s + (copies[id] || 1), 0);

  /* ────────────── label parts ────────────── */
  function buildParts(item: StockItem | undefined, code: string, mmWidth?: number, pxWidth?: number) {
    const lines: string[] = [];
    if (settings.showSize && item?.size) lines.push(item.size);
    if (settings.showPrice && item && item.salePrice > 0) lines.push(`${fmt(item.salePrice)} ج.م`);
    if (settings.customText.trim()) lines.push(settings.customText.trim());
    const above = settings.textAbove ? lines : [];
    const below = settings.textAbove ? [] : lines;
    const svg = renderBarcode(code, mmWidth ? { mmWidth } : pxWidth ? { pxWidth } : {});
    return { name: item?.name ?? "", above, below, svg };
  }

  /* ────────────── print window ────────────── */
  const print = async () => {
    if (!selectedIds.length) { toast.error("اختر صنفًا واحدًا على الأقل"); return; }
    for (const id of selectedIds) {
      const code = (selected[id] ?? "").trim();
      const f = detectFormat(code);
      if (!isValidBarcode(f, code)) {
        toast.error(`الكود غير صالح: ${items.find((i) => i.id === id)?.name ?? ""}`);
        return;
      }
    }

    if (settings.saveOnPrint) {
      const toSave = selectedIds.filter((id) => {
        const item = items.find((i) => i.id === id);
        return !!item && (item.barcode ?? "") !== (selected[id] ?? "").trim();
      });
      if (toSave.length) {
        try {
          await Promise.all(toSave.map((id) => db.updateStockItem(id, { barcode: selected[id].trim() })));
          toast.success(`تم حفظ ${toSave.length} كود على الأصناف — السكان هيقدر يلاقيهم`);
        } catch (e: any) {
          toast.error(e?.message ?? "تعذر حفظ الأكواد");
          return;
        }
      }
    }

    const W = size.w;
    const H = size.h;
    const pad = 2.5;
    const availW = W - pad * 2;
    const availH = H - pad * 2 - 9;
    const labels: string[] = [];
    for (const id of selectedIds) {
      const item = items.find((i) => i.id === id);
      const code = (selected[id] ?? "").trim();
      const f = detectFormat(code);
      const vb = barcodeViewBox(f, code);
      let sw = availW, sh = (vb.h * sw) / vb.w;
      if (sh > availH) { sh = availH; sw = (vb.w * sh) / vb.h; }
      const parts = buildParts(item, code, Math.max(8, sw));
      const n = copies[id] || 1;
      for (let i = 0; i < n; i++) {
        labels.push(
          `<div class="label"><div class="nm">${esc(parts.name)}</div>${parts.above.map((t) => `<div class="ln">${esc(t)}</div>`).join("")}${parts.svg}${parts.below.map((t) => `<div class="ln">${esc(t)}</div>`).join("")}</div>`,
        );
      }
    }

    const html = settings.mode === "sheet" ? sheetHtml(labels, W, H) : rollHtml(labels, W, H);
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

  /* ────────────── preview ────────────── */
  const previewCells = useMemo(() => {
    const cells: Array<{ name: string; lines: string[]; svg: string; fmt: BarcodeFormat }> = [];
    for (const id of selectedIds) {
      const item = items.find((i) => i.id === id);
      const code = (selected[id] ?? "").trim();
      if (!code) continue;
      const parts = buildParts(item, code, undefined, 150);
      const n = copies[id] || 1;
      for (let i = 0; i < n && cells.length < 40; i++) {
        cells.push({ name: parts.name, lines: [...parts.above, ...parts.below], svg: parts.svg, fmt: detectFormat(code) });
      }
      if (cells.length >= 40) break;
    }
    return cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, copies, items, settings.showPrice, settings.showSize, settings.textAbove, settings.customText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Barcode className="w-5 h-5 text-primary" />
            مولد الباركود
          </DialogTitle>
          <DialogDescription className="text-right">
            قالب ليبل كامل: اسم المنتج + السعر + المقاس + باركود، واطبعه على طابعة اللـيبل الحرارية أو شيت A4.
          </DialogDescription>
        </DialogHeader>

        {/* Settings */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>صيغة الباركود (للأكواد الجديدة)</Label>
            <Select value={settings.format} onValueChange={(v) => setSetting("format", v as BarcodeFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="ean13">EAN-13 — 13 رقم (الأكثر توافقًا)</SelectItem>
                <SelectItem value="upca">UPC-A — 12 رقم</SelectItem>
                <SelectItem value="code128">Code128 — أرقام وحروف</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>نوع الطباعة</Label>
            <Select value={settings.mode} onValueChange={(v) => setSetting("mode", v as "roll" | "sheet")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="roll">رول حراري — كل ليبل صفحة</SelectItem>
                <SelectItem value="sheet">شيت A4 — شبكة لـيبلات</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>مقاس اللـيبل</Label>
            <div className="flex flex-wrap items-center gap-2">
              {SIZES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSetting("sizeKey", s.key)}
                  className={cn(
                    "rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition-all duration-200",
                    settings.sizeKey === s.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-foreground/[0.04]",
                  )}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSetting("sizeKey", "custom")}
                className={cn(
                  "rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition-all duration-200",
                  settings.sizeKey === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-foreground/[0.04]",
                )}
              >
                مخصص
              </button>
              {settings.sizeKey === "custom" && (
                <div className="flex items-center gap-1.5">
                  <Input type="number" value={settings.customW} onChange={(e) => setSetting("customW", e.target.value)} className="h-8 w-16 text-center" min={20} max={200} />
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input type="number" value={settings.customH} onChange={(e) => setSetting("customH", e.target.value)} className="h-8 w-16 text-center" min={10} max={200} />
                  <span className="text-xs text-muted-foreground">ملم</span>
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>العدد الافتراضي لكل صنف</Label>
            <Input
              type="number"
              min={1}
              max={99}
              value={settings.defaultCopies}
              onChange={(e) => setSetting("defaultCopies", Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
              className="h-9 w-24 text-center tabular-nums"
            />
          </div>
        </div>

        {/* Template options */}
        <div className="grid gap-2 sm:grid-cols-2 rounded-2xl border border-[var(--hairline)] p-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={settings.showPrice} onCheckedChange={(v) => setSetting("showPrice", !!v)} />
            <Banknote className="w-4 h-4 text-success" /> السعر على اللـيبل
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={settings.showSize} onCheckedChange={(v) => setSetting("showSize", !!v)} />
            <Shirt className="w-4 h-4 text-primary" /> المقاس على اللـيبل
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={settings.textAbove} onCheckedChange={(v) => setSetting("textAbove", !!v)} />
            النصوص فوق الباركود (وإلا تظهر تحته)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={settings.saveOnPrint} onCheckedChange={(v) => setSetting("saveOnPrint", !!v)} />
            احفظ الكود على الصنف بعد الطباعة
          </label>
          <div className="sm:col-span-2 grid gap-1.5">
            <Label className="text-xs">نص مخصص على اللـيبل (اختياري — يظهر لكل اللـيبلات)</Label>
            <Input value={settings.customText} onChange={(e) => setSetting("customText", e.target.value)} maxLength={40} placeholder="مثال: تخفيض 20% / جديد الموسم..." />
          </div>
        </div>

        {/* Search + select all */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الصنف أو الباركود..." className="pr-10" />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={selectAllFiltered}>تحديد الكل من النتائج ({filtered.length})</Button>
          {selectedIds.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={clearAll} className="text-muted-foreground">إلغاء التحديد</Button>
          )}
        </div>

        {/* Item picker */}
        <div className="border border-[var(--hairline)] rounded-2xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto divide-y divide-[var(--hairline)]">
            {filtered.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
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
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span className="font-mono" dir="ltr" data-latin-digits>{it.barcode ?? <span className="text-warning">بلا باركود — سيُولّد تلقائيًا</span>}</span>
                      {it.size && <span className="inline-flex items-center gap-0.5"><Shirt className="w-3 h-3" />{it.size}</span>}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Selected items */}
        {selectedIds.length > 0 && (
          <div className="space-y-2">
            <Label>الأصناف المحددة</Label>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {selectedIds.map((id) => {
                const it = items.find((i) => i.id === id);
                const code = selected[id];
                const f = code ? detectFormat(code) : settings.format;
                const ok = isValidBarcode(f, code);
                return (
                  <div key={id} className="flex items-center gap-2 rounded-2xl border border-[var(--hairline)] p-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                        <span className="truncate">{it?.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-foreground/[0.05] text-muted-foreground shrink-0" dir="ltr">{fmtLabel(f)}</span>
                        {ok
                          ? <Check className="w-3.5 h-3.5 text-success shrink-0" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />}
                      </div>
                      <div className="flex gap-1.5 mt-1">
                        <Input
                          value={code}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCode(id, f === "code128" ? v.slice(0, 80) : v.replace(/\D/g, "").slice(0, 14));
                          }}
                          onBlur={(e) => finalizeCode(id, e.target.value)}
                          className="h-8 font-mono text-sm"
                          dir="ltr"
                          inputMode={f === "code128" ? "text" : "numeric"}
                        />
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => regenerate(id)} title="إعادة توليد كود">
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">عدد النسخ</Label>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={copies[id] || 1}
                        onChange={(e) => setCopies((p) => ({ ...p, [id]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) }))}
                        className="h-8 w-16 text-center tabular-nums"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Preview */}
        {previewCells.length > 0 && (
          <div className="space-y-2">
            <Label>معاينة الشيت</Label>
            <div className="flex flex-wrap gap-2">
              {previewCells.map((c, i) => (
                <div key={i} className="w-[168px] rounded-xl border border-[var(--hairline)] bg-white p-2 flex flex-col items-center justify-center">
                  <div className="text-[11px] font-bold truncate max-w-full text-foreground">{c.name}</div>
                  {c.lines.map((l, j) => <div key={j} className="text-[10px] text-foreground">{l}</div>)}
                  <div dangerouslySetInnerHTML={{ __html: c.svg }} />
                </div>
              ))}
              {totalLabels > 40 && <div className="text-xs text-muted-foreground self-center">…و {totalLabels - 40} ليبل إضافي</div>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button onClick={print} disabled={!selectedIds.length} className="gap-1.5">
            <Printer className="w-4 h-4" /> طباعة اللـيبلات ({totalLabels})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── print HTML builders ───────────────────────── */

function baseCss(): string {
  return `
html, body { margin: 0; padding: 0; }
.label { box-sizing: border-box; padding: 2.5mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1mm; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.label .nm { font: bold 10pt "Segoe UI", Arial, sans-serif; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label .ln { font: 9pt "Segoe UI", Arial, sans-serif; }
.label svg { display: block; }
`;
}

function rollHtml(labels: string[], W: number, H: number): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>طباعة الباركود</title>
<style>
@page { size: ${W}mm ${H}mm; margin: 0; }
${baseCss()}
.label { width: ${W}mm; height: ${H}mm; page-break-after: always; }
.label:last-child { page-break-after: auto; }
</style></head><body>${labels.join("")}</body></html>`;
}

function sheetHtml(labels: string[], W: number, H: number): string {
  const pageW = 210, pageH = 297, pad = 5;
  const availW = pageW - pad * 2;
  const availH = pageH - pad * 2;
  const cols = Math.max(1, Math.floor(availW / W));
  const rows = Math.max(1, Math.floor(availH / H));
  const gapX = cols > 1 ? (availW - cols * W) / (cols - 1) : 0;
  const gapY = rows > 1 ? (availH - rows * H) / (rows - 1) : 0;
  const perPage = cols * rows;
  const pages: string[] = [];
  for (let i = 0; i < labels.length; i += perPage) {
    pages.push(`<div class="page"><div class="grid">${labels.slice(i, i + perPage).join("")}</div></div>`);
  }
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>طباعة الباركود</title>
<style>
@page { size: A4; margin: 0; }
${baseCss()}
.page { width: ${pageW}mm; height: ${pageH}mm; box-sizing: border-box; padding: ${pad}mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.grid { display: flex; flex-wrap: wrap; column-gap: ${gapX}mm; row-gap: ${gapY}mm; }
.label { width: ${W}mm; height: ${H}mm; }
</style></head><body>${pages.join("")}</body></html>`;
}
