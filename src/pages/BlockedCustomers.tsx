import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Reveal } from "@/components/Reveal";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { CustomerTypeBadge } from "@/components/CustomerTypeBadge";
import { StarRating } from "@/components/StarRating";
import { useDB, db, fmt, analyzeCustomerRisk, type Customer, type Invoice } from "@/lib/store";
import { customerMetrics, blockedWhatsAppMessage, escapeHtml, isoToDDMMYYYY } from "@/lib/customer-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { usePrivacy } from "@/lib/privacy";
import { pdfDocument, openPdfDocument } from "@/lib/pdf-doc";
import { toArabicDigits } from "@/lib/arabic-digits";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown, Ban, FileDown, FileSpreadsheet, Info, Lock, MessageCircle, Pencil, Search, ShieldAlert, Unlock, Users, AlertTriangle, Radar, Shield } from "lucide-react";
import * as XLSX from "xlsx";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.86 11.86 0 0012.06 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.14 1.6 5.95L0 24l6.32-1.65a11.9 11.9 0 005.74 1.46h.01c6.55 0 11.88-5.33 11.88-11.9 0-3.18-1.24-6.16-3.43-8.43zM12.07 21.8h-.01a9.9 9.9 0 01-5.05-1.38l-.36-.21-3.75.98 1-3.65-.24-.38a9.86 9.86 0 01-1.51-5.26c0-5.46 4.45-9.9 9.92-9.9 2.65 0 5.14 1.03 7.01 2.91a9.84 9.84 0 012.9 7c0 5.47-4.44 9.89-9.91 9.89zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z" />
    </svg>
  );
}

type SortKey = "name" | "balance" | "worstLate";
type SortDir = "asc" | "desc";

function SortChip({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-[transform,color,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97]",
        active ? "bg-primary/12 text-primary ring-1 ring-primary/25" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active ? (
        dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

function BlockedCustomersPage() {
  const data = useDB();
  const navigate = useNavigate({ from: "/blocked" } as any);
  const { privacy } = usePrivacy();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("balance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [notesFor, setNotesFor] = useState<Customer | null>(null);
  const [draftNotes, setDraftNotes] = useState("");

  const enriched = useMemo(
    () => data.customers.map((c) => ({
      c,
      m: customerMetrics(data.invoices, c),
      risk: analyzeCustomerRisk(c, data.invoices),
    })),
    [data.customers, data.invoices],
  );

  const blockedList = useMemo(() => {
    return enriched.filter(x => x.c.frozen);
  }, [enriched]);

  const candidatesList = useMemo(() => {
    return enriched.filter(x => x.risk.recommendBlock && !x.c.frozen);
  }, [enriched]);

  const stats = useMemo(() => {
    const totalBlocked = blockedList.length;
    const totalPct = data.customers.length > 0 ? (totalBlocked / data.customers.length) * 100 : 0;
    const totalFrozenBalance = blockedList.reduce((sum, x) => sum + x.m.balance, 0);
    const maxWorstLate = blockedList.length > 0 ? Math.max(...blockedList.map(x => x.m.worstLate)) : 0;
    
    let sumPct = 0;
    let countPct = 0;
    for (const x of blockedList) {
      if (x.m.totalCharged > 0) {
        sumPct += x.m.paidPct;
        countPct++;
      }
    }
    const avgPaidPct = countPct > 0 ? Math.round(sumPct / countPct) : 0;

    return { totalBlocked, totalPct, totalFrozenBalance, maxWorstLate, avgPaidPct };
  }, [blockedList, data.customers]);

  const list = useMemo(() => {
    const filtered = blockedList.filter(({ c }) => (q ? c.name.includes(q) || c.phone.includes(q) : true));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "balance") return (a.m.balance - b.m.balance) * dir;
      if (sortKey === "worstLate") return (a.m.worstLate - b.m.worstLate) * dir;
      return a.c.name.localeCompare(b.c.name, "ar") * dir;
    });
  }, [blockedList, q, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const exportPDF = () => {
    const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const rows = list.map(({ c, m }, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(c.name)}</td>
        <td dir="ltr">${escapeHtml(c.phone)}</td>
        <td class="num">${fmt(m.totalCharged)}</td>
        <td class="num ok">${fmt(m.totalPaid)}</td>
        <td class="num ${m.balance > 0 ? "due" : ""}">${fmt(m.balance)}</td>
        <td>${m.worstLate > 0 ? `<span class="tag purchase">${m.worstLate} يوم</span>` : "—"}</td>
      </tr>`).join("");
    const totalDue = list.reduce((s, x) => s + Math.max(0, x.m.balance), 0);
    const totalCharged = list.reduce((s, x) => s + x.m.totalCharged, 0);
    const totalPaid = list.reduce((s, x) => s + x.m.totalPaid, 0);
    const body = `
<h2 class="sec">القائمة السوداء (العملاء المحظورون)</h2>
<div class="t-wrap"><table>
  <thead><tr>
    <th>م</th><th>اسم العميل</th><th>الهاتف</th>
    <th class="num">إجمالي المعاملات</th><th class="num">إجمالي المسدد</th><th class="num">الرصيد المجمد</th><th>أقصى تأخير</th>
  </tr></thead>
  <tbody>${rows || `<tr><td colspan="7" class="empty">لا توجد بيانات</td></tr>`}</tbody>
  <tfoot><tr>
    <td colspan="3">الإجماليات</td>
    <td class="num">${fmt(totalCharged)}</td>
    <td class="num">${fmt(totalPaid)}</td>
    <td class="num">${fmt(totalDue)}</td>
    <td>—</td>
  </tr></tfoot>
</table></div>
<div class="sig"><div>توقيع المسؤول</div><div>الختم الرسمي</div></div>`;
    const html = pdfDocument({
      docTitle: "تقرير المحظورين والقائمة السوداء — سِجلّي",
      badge: "القائمة السوداء",
      title: "تقرير المحظورين",
      lede: "تقرير رسمي يوضّح أرصدة العملاء المحظورين والديون المجمدة.",
      meta: [
        { label: "تاريخ التقرير", value: today },
        { label: "عدد المحظورين", value: String(list.length) },
      ],
      kpis: [
        { label: "عدد العملاء", value: String(list.length) },
        { label: "الديون المجمدة", value: `${fmt(totalDue)} ج.م`, tone: "danger" },
        { label: "أقصى تأخير", value: `${stats.maxWorstLate} يوم`, tone: "brand" },
      ],
      body,
      page: "A4 landscape",
    });
    if (!openPdfDocument(html, { autoPrint: true, features: "width=980,height=760" })) {
      toast.error("الرجاء السماح بفتح النوافذ المنبثقة لتصدير PDF");
      return;
    }
    toast.success("جاري تجهيز تقرير القائمة السوداء...");
  };

  const exportExcel = () => {
    const rows = list.map(({ c, m }, i) => ({
      "م": i + 1,
      "اسم العميل": c.name,
      "رقم الهاتف": c.phone,
      "الرصيد المجمد": m.balance,
      "أقصى تأخير (أيام)": m.worstLate,
      "نسبة السداد (%)": m.paidPct,
      "تاريخ الإضافة": c.joiningDate,
    }));
    
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "العملاء المحظورين");
    XLSX.writeFile(wb, "blocked_customers.xlsx");
    toast.success("تم تصدير ملف الإكسيل بنجاح");
  };

  const saveNotes = async () => {
    if (!notesFor) return;
    try {
      await db.updateCustomer(notesFor.id, { notes: draftNotes });
      toast.success("تم حفظ الملاحظات بنجاح");
      setNotesFor(null);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء حفظ الملاحظات");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-20">
      {/* Section 1: Header */}
      <PageHeader
        title="مركز إدارة المحظورين"
        subtitle="القائمة السوداء والديون المجمدة والتوصيات الذكية للحظر"
        action={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={exportExcel}
              disabled={list.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4 text-success" />
              تصدير Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={exportPDF}
              disabled={list.length === 0}
            >
              <FileDown className="w-4 h-4 text-danger" />
              تصدير PDF
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate({ to: "/customers" } as any)}
            >
              <ArrowLeft className="w-4 h-4" />
              العودة لجميع العملاء
            </Button>
          </div>
        }
      />

      {/* Section 2: KPI Cards */}
      <Reveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Blocked */}
        <div className="bezel-shell bezel-lift text-right transition-transform duration-300 hover:-translate-y-0.5">
          <div className="bezel-core p-5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 justify-end">
              <Ban className="h-3.5 w-3.5 text-danger" />
              إجمالي المحظورين
            </div>
            <div className="text-numeric mt-2 text-2xl font-extrabold leading-none text-danger">
              {stats.totalBlocked}
              <span className="ms-2 align-middle text-xs font-bold text-muted-foreground">
                ({stats.totalPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Frozen Balance */}
        <div className="bezel-shell bezel-lift text-right transition-transform duration-300 hover:-translate-y-0.5">
          <div className="bezel-core p-5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 justify-end">
              <Lock className="h-3.5 w-3.5 text-danger" />
              إجمالي الديون المجمدة
            </div>
            <div className={cn("text-numeric mt-2 text-2xl font-extrabold leading-none text-danger", privacy && "privacy-blur")}>
              {fmt(stats.totalFrozenBalance)}
              <span className="ms-2 align-middle text-xs font-bold text-muted-foreground">
                ج.م
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Max Worst Late */}
        <div className="bezel-shell bezel-lift text-right transition-transform duration-300 hover:-translate-y-0.5">
          <div className="bezel-core p-5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 justify-end">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              أقصى فترة تأخير
            </div>
            <div className="text-numeric mt-2 text-2xl font-extrabold leading-none text-warning">
              {stats.maxWorstLate}
              <span className="ms-2 align-middle text-xs font-bold text-muted-foreground">
                يوم
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Avg Paid Pct */}
        <div className="bezel-shell bezel-lift text-right transition-transform duration-300 hover:-translate-y-0.5">
          <div className="bezel-core p-5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 justify-end">
              <Shield className="h-3.5 w-3.5" />
              معدل استرداد المستحقات
            </div>
            <div className={cn("text-numeric mt-2 text-2xl font-extrabold leading-none", stats.avgPaidPct > 50 ? "text-success" : "text-danger")}>
              {stats.avgPaidPct}%
            </div>
          </div>
        </div>
      </Reveal>

      {/* Section 3: Ban Radar */}
      <Reveal>
        <div className="bezel-shell overflow-hidden bg-warning/5 ring-1 ring-warning/20">
          <div className="bezel-core p-5">
            <div className="flex items-center gap-2 mb-4 justify-end">
              <h3 className="text-lg font-bold text-warning flex items-center gap-2">
                التوصيات الذكية للحظر (رادار الخطر)
                <Radar className="h-5 w-5" />
              </h3>
            </div>
            
            {candidatesList.length === 0 ? (
              <EmptyState icon={Shield} title="لا يوجد عملاء مرشحين للحظر حالياً ✅" description="جميع عملائك النشطين ضمن الحدود الآمنة للائتمان." className="py-6" />
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-warning/20 scrollbar-track-transparent">
                {candidatesList.map(({ c, m, risk }) => (
                  <div key={c.id} className="bezel-shell shrink-0 w-[300px] bg-background">
                    <div className="bezel-core p-4 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-3">
                        <Badge variant="outline" className="bg-danger/10 text-danger border-danger/20 shrink-0">
                          {risk.score}% خطورة
                        </Badge>
                        <div className="text-right min-w-0 flex-1 ml-2">
                          <div className="font-bold truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate text-numeric" dir="ltr">{c.phone}</div>
                        </div>
                      </div>
                      
                      <div className="space-y-1 mb-4 flex-1">
                        <div className="text-xs font-bold text-right text-muted-foreground mb-2">أسباب التوصية:</div>
                        <ul className="text-[11px] list-disc list-inside text-right space-y-1 text-muted-foreground">
                          {risk.reasons.map((r, i) => (
                            <li key={i} className="truncate" title={r}>{r}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-3 mt-auto border-t border-border">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full gap-2 text-xs h-8">
                              <Ban className="h-3 w-3" />
                              حظر فوراً 🛑
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="text-right">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex justify-end items-center gap-2">
                                حظر العميل {c.name}
                                <ShieldAlert className="h-5 w-5 text-danger" />
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-right">
                                هل أنت متأكد من حظر العميل «{c.name}»؟
                                سيتم إيقاف الشراء الآجل لهذا العميل وتعيين شارة حظر على حسابه.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-row-reverse gap-2">
                              <AlertDialogAction
                                className="bg-danger text-danger-foreground hover:bg-danger/90"
                                onClick={async () => {
                                  try {
                                    await db.toggleFreezeCustomer(c.id, true);
                                    toast.success("تم حظر العميل بنجاح");
                                  } catch (err: any) {
                                    toast.error(err.message || "حدث خطأ");
                                  }
                                }}
                              >
                                تأكيد الحظر
                              </AlertDialogAction>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* Section 4: Blocked Master Table */}
      <Reveal className="space-y-4">
        {/* Search & Sort */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ابحث في القائمة السوداء..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 text-right"
              dir="rtl"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <SortChip label="الاسم" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
            <SortChip label="الرصيد" active={sortKey === "balance"} dir={sortDir} onClick={() => toggleSort("balance")} />
            <SortChip label="فترة التأخير" active={sortKey === "worstLate"} dir={sortDir} onClick={() => toggleSort("worstLate")} />
          </div>
        </div>

        {/* List */}
        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence mode="popLayout">
            {list.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                className="col-span-full pt-8"
              >
                <EmptyState
                  icon={Ban}
                  title="القائمة السوداء فارغة"
                  description={q ? "لم يتم العثور على نتائج للبحث." : "لا يوجد عملاء محظورين حالياً."}
                />
              </motion.div>
            ) : (
              list.map(({ c, m }, idx) => {
                const overdue7 = m.worstLate > 7;
                const initial = c.name.trim().slice(0, 1) || "؟";
                const waMessage = blockedWhatsAppMessage(c, m.balance, m.worstLate);
                const waPhone = c.phone.replace(/^0/, "20");
                const waUrl = \`https://wa.me/\${waPhone}?text=\${encodeURIComponent(waMessage)}\`;

                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1], delay: Math.min(idx, 12) * 0.03 }}
                    className="group bezel-shell bezel-lift bg-danger/[0.02] ring-1 ring-danger/30"
                  >
                    <div className="bezel-core grid grid-cols-1 items-center gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)] md:gap-6">
                      
                      {/* Actions */}
                      <div className="flex flex-wrap items-center justify-start gap-1.5 md:opacity-70 md:transition-opacity md:duration-500 md:ease-[cubic-bezier(0.32,0.72,0,1)] md:group-hover:opacity-100 md:focus-within:opacity-100">
                        <AlertDialog>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="action-btn rounded-full text-success hover:bg-success/15 hover:text-success"
                                  >
                                    <Unlock className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">فك حظر العميل واستعادة التعامل</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <AlertDialogContent className="text-right">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex justify-end items-center gap-2">
                                فك حظر العميل
                                <Unlock className="h-5 w-5 text-success" />
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-right">
                                هل تود إلغاء الحظر عن العميل «{c.name}» والسماح بإصدار فواتير وأقساط جديدة له؟
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-row-reverse gap-2">
                              <AlertDialogAction
                                className="bg-success text-success-foreground hover:bg-success/90"
                                onClick={async () => {
                                  try {
                                    await db.toggleFreezeCustomer(c.id, false);
                                    toast.success("تم فك الحظر بنجاح");
                                  } catch (err: any) {
                                    toast.error(err.message || "حدث خطأ");
                                  }
                                }}
                              >
                                تأكيد فك الحظر
                              </AlertDialogAction>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="action-btn grid h-9 w-9 place-items-center rounded-full text-success hover:bg-success/10"
                              >
                                <WhatsAppIcon className="h-4 w-4" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent side="top">إرسال إنذار رسمي على واتساب</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="action-btn rounded-full text-muted-foreground hover:bg-muted/50"
                                onClick={() => navigate({ to: "/customers/$customerId", params: { customerId: c.id } } as any)}
                              >
                                <Info className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">تفاصيل العميل وكشف الحساب</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="action-btn rounded-full"
                                onClick={() => {
                                  setNotesFor(c);
                                  setDraftNotes(c.notes || "");
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">ملاحظات العميل</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {/* Financials */}
                      <div className="min-w-0">
                        <div className="flex items-center justify-end gap-2">
                          <div className={cn("text-numeric text-xl font-extrabold leading-none", overdue7 ? "text-danger" : "text-foreground", privacy && "privacy-blur")}>
                            {fmt(m.balance)} <span className="text-xs font-bold text-muted-foreground">ج.م</span>
                          </div>
                          {m.worstLate > 0 && (
                            <span className="rounded-full bg-danger/12 px-2 py-0.5 text-[10px] font-bold text-danger ring-1 ring-danger/25">متأخر {m.worstLate} يوم</span>
                          )}
                        </div>
                        <Progress value={m.paidPct} className="mt-2.5 h-1" />
                        <div className={cn("mt-1.5 text-[11px] text-muted-foreground", privacy && "privacy-blur")}>
                          مسدد {m.paidPct}٪ من {fmt(m.totalCharged)}
                        </div>
                      </div>

                      {/* Identity */}
                      <div className="flex min-w-0 items-center justify-end gap-3 text-right">
                        <div className="min-w-0">
                          <div className="truncate font-bold leading-tight">{c.name}</div>
                          <div className="text-numeric mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">{c.phone}</div>
                          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                            <Badge variant="destructive" className="gap-1 bg-danger/20 text-danger border-danger/30 font-bold">
                              <Ban className="h-3 w-3" />
                              محظور
                            </Badge>
                            {c.notes && (
                              <Badge variant="outline" className="gap-1 border-primary/20 bg-primary/5 text-primary text-[10px]">
                                توجد ملاحظات
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className="text-display grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-bold bg-danger/20 text-danger ring-1 ring-danger/40">
                          {initial}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </Reveal>

      {/* Notes Dialog */}
      <Dialog open={!!notesFor} onOpenChange={(o) => !o && setNotesFor(null)}>
        <DialogContent className="sm:max-w-[425px] text-right">
          <DialogHeader>
            <DialogTitle className="text-right">ملاحظات العميل</DialogTitle>
            <DialogDescription className="text-right">
              {notesFor?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="notes" className="text-right block mb-2">الملاحظات</Label>
            <Textarea
              id="notes"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="اكتب ملاحظات حول أسباب الحظر أو شروط فك الحظر..."
              className="text-right min-h-[120px]"
              dir="rtl"
            />
          </div>
          <DialogFooter className="flex-row-reverse sm:justify-start gap-2">
            <Button type="button" onClick={saveNotes}>حفظ التعديلات</Button>
            <Button type="button" variant="outline" onClick={() => setNotesFor(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <AppShell>
      <PageTransition>
        <BlockedCustomersPage />
      </PageTransition>
    </AppShell>
  );
}
