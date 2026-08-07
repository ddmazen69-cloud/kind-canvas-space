import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { analyzeCustomerRisk, fmt, isDueSoonOrOverdue, useDB, useShopSettings } from "@/lib/store";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "إيه أهم 3 تنبيهات النهارده؟",
  "مين العملاء اللي محتاجين متابعة؟",
  "إيه الأصناف الناقصة؟",
  "المبيعات والتحصيلات الشهر ده كام؟",
  "هل الربح بيتحسن مقارنة بالشهر اللي فات؟",
];

const WELCOME: Message = {
  role: "assistant",
  content: "أنا رَصْد، مساعدك التحليلي في سِجلّي. أقدر أراجع التحصيلات والمخزون والمصروفات وأقترح الخطوة الأهم، لكن لن أغيّر أي بيانات من تلقاء نفسي.",
};

function startsThisMonth(value: string, now = new Date()) {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function startsLastMonth(value: string, now = new Date()) {
  const date = new Date(value);
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return date.getFullYear() === last.getFullYear() && date.getMonth() === last.getMonth();
}

/** Useful answers while the optional cloud AI service is being deployed. */
function localAnswer(question: string, data: ReturnType<typeof useDB>, settings: { lowStockThreshold: number; reminderDaysBefore: number }) {
  const normalized = question.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLowerCase();
  const overdue = data.invoices
    .filter((invoice) => isDueSoonOrOverdue(invoice, settings.reminderDaysBefore))
    .map((invoice) => {
      const customer = data.customers.find((item) => item.id === invoice.customerId);
      const days = Math.max(0, Math.floor((Date.now() - new Date(invoice.firstDueDate).getTime()) / 86400000));
      return { invoice, customer, remaining: Math.max(0, invoice.total - invoice.paid), days };
    })
    .sort((a, b) => b.days - a.days || b.remaining - a.remaining);
  const lowStock = data.stockItems.filter((item) => item.quantity <= (item.minQuantity ?? settings.lowStockThreshold));
  const salesThisMonth = data.invoices.filter((item) => startsThisMonth(item.createdAt)).reduce((sum, item) => sum + item.total, 0);
  const collectionsThisMonth = data.payments.filter((item) => startsThisMonth(item.paidAt)).reduce((sum, item) => sum + item.amount, 0)
    + data.invoices.filter((item) => startsThisMonth(item.createdAt)).reduce((sum, item) => sum + item.downPayment, 0);

  if (normalized.includes("تنبيه") || normalized.includes("اهم") || normalized.includes("النهارده")) {
    const parts = [
      overdue.length ? `${overdue.length} فاتورة مستحقة أو متأخرة` : "لا توجد أقساط مستحقة حاليًا",
      lowStock.length ? `${lowStock.length} صنف يحتاج متابعة في المخزون` : "المخزون فوق الحد الأدنى",
      `تحصيلات الشهر حتى الآن ${fmt(collectionsThisMonth)} ج.م`,
    ];
    return `أهم 3 نقاط الآن:\n1. ${parts[0]}.\n2. ${parts[1]}.\n3. ${parts[2]}.`;
  }
  if (normalized.includes("عميل") && (normalized.includes("متابع") || normalized.includes("متاخر") || normalized.includes("محتاج"))) {
    if (!overdue.length) return "لا يوجد عملاء لديهم أقساط مستحقة أو متأخرة حاليًا.";
    return `الأولوية للمتابعة:\n${overdue.slice(0, 5).map((item, index) => `${index + 1}. ${item.customer?.name ?? "عميل"}: متبقي ${fmt(item.remaining)} ج.م${item.days ? ` ومتأخر ${item.days} يوم` : " ومستحق الآن"}.`).join("\n")}`;
  }
  if (normalized.includes("صنف") || normalized.includes("مخزون") || normalized.includes("ناقص")) {
    if (!lowStock.length) return "لا توجد أصناف وصلت للحد الأدنى المحدد في الإعدادات.";
    return `الأصناف التي تحتاج إعادة طلب:\n${lowStock.slice(0, 8).map((item, index) => `${index + 1}. ${item.name}: المتاح ${fmt(item.quantity)}، والحد الأدنى ${fmt(item.minQuantity ?? settings.lowStockThreshold)}.`).join("\n")}`;
  }
  if (normalized.includes("تحصيل") || normalized.includes("مبيعات") || normalized.includes("الشهر")) {
    return `ملخص الشهر الحالي:\n• المبيعات: ${fmt(salesThisMonth)} ج.م\n• التحصيلات: ${fmt(collectionsThisMonth)} ج.م\n• إجمالي المديونيات المفتوحة: ${fmt(data.invoices.reduce((sum, item) => sum + Math.max(0, item.total - item.paid), 0))} ج.م.`;
  }
  if (normalized.includes("ربح") || normalized.includes("بيتحسن") || normalized.includes("مقارن")) {
    const profit = (isCurrent: (value: string) => boolean) => {
      const invoiceIds = new Set(data.invoices.filter((item) => isCurrent(item.createdAt)).map((item) => item.id));
      const gross = data.invoiceItems.filter((item) => invoiceIds.has(item.invoiceId)).reduce((sum, item) => sum + item.price - item.cost, 0);
      const expenses = data.expenses.filter((item) => isCurrent(item.expenseDate)).reduce((sum, item) => sum + item.amount, 0);
      return gross - expenses;
    };
    const current = profit((value) => startsThisMonth(value));
    const previous = profit((value) => startsLastMonth(value));
    const direction = current > previous ? "أفضل" : current < previous ? "أقل" : "مستقر";
    return `صافي الربح المحسوب هذا الشهر ${fmt(current)} ج.م، وكان ${fmt(previous)} ج.م الشهر الماضي. الاتجاه الحالي ${direction}.`;
  }
  if (normalized.includes("واتساب") || normalized.includes("رسالة")) {
    const target = data.customers.find((customer) => normalized.includes(customer.name.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLowerCase()));
    if (!target) return "اكتب اسم العميل مع طلب الرسالة، مثل: اكتب رسالة واتساب لطيفة للعميل أحمد.";
    const risk = analyzeCustomerRisk(target, data.invoices);
    const balance = data.invoices.filter((invoice) => invoice.customerId === target.id).reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), target.openingBalance);
    return `أهلًا أستاذ/ة ${target.name}، نتمنى تكون بخير. حابين نفكّرك إن المتبقي على حسابك ${fmt(balance)} ج.م. يهمنا نرتب مع حضرتك موعد مناسب للسداد. شكرًا لتعاونك.\n\nملاحظة: مستوى المتابعة المقترح ${risk.level === "high" ? "عالي" : risk.level === "medium" ? "متوسط" : "عادي"}.`;
  }
  return "أقدر أساعدك في التنبيهات، العملاء المتأخرين، الأصناف الناقصة، المبيعات والتحصيلات، مقارنة الربح، أو صياغة رسالة واتساب. اختَر سؤالًا محددًا من الاقتراحات أسفل المحادثة.";
}

export function RasdAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [sending, setSending] = useState(false);
  const data = useDB();
  const { settings } = useShopSettings();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const ask = async (question: string) => {
    const content = question.trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("rasd-assistant", {
        body: { messages: next.slice(-10) },
      });
      if (error) throw error;
      const answer = typeof data?.answer === "string" ? data.answer : "تعذّر على رَصْد تجهيز إجابة الآن. جرّب مرة أخرى.";
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
    } catch (error: any) {
      setMessages((current) => [...current, { role: "assistant", content: localAnswer(content, data, settings) }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="فتح رَصْد، المساعد التحليلي"
        className="press fixed bottom-36 left-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-card text-primary shadow-[0_18px_42px_-16px_hsl(var(--primary)/0.8)] ring-1 ring-primary/35 transition hover:-translate-y-1 hover:bg-primary hover:text-primary-foreground md:bottom-28"
      >
        <Sparkles className="h-5 w-5" strokeWidth={1.9} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" dir="rtl" role="dialog" aria-modal="true" aria-label="رَصْد، المساعد التحليلي">
          <button type="button" aria-label="إغلاق رَصْد" className="absolute inset-0 bg-background/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <section className="absolute inset-x-3 bottom-3 top-3 flex flex-col overflow-hidden rounded-[1.75rem] bg-popover shadow-[0_28px_100px_-35px_hsl(var(--background))] ring-1 ring-white/10 md:bottom-6 md:right-6 md:left-auto md:top-6 md:w-[27rem]">
            <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <button type="button" onClick={() => setOpen(false)} className="press grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <h2 className="text-display text-xl font-bold">رَصْد</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">مساعد تحليلي، للقراءة فقط</p>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
                  <Bot className="h-5 w-5" strokeWidth={1.75} />
                </span>
              </div>
            </header>

            <div ref={scrollRef} className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-5">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={cn("flex", message.role === "user" ? "justify-start" : "justify-end")}>
                  <p className={cn(
                    "max-w-[88%] whitespace-pre-wrap rounded-[1.35rem] px-4 py-3 text-sm leading-7",
                    message.role === "user"
                      ? "rounded-bl-md bg-primary text-primary-foreground"
                      : "rounded-br-md bg-muted/75 text-foreground ring-1 ring-border/70",
                  )}>{message.content}</p>
                </div>
              ))}
              {sending && (
                <div className="flex justify-end" aria-label="رَصْد يكتب الآن">
                  <div className="flex items-center gap-1.5 rounded-[1.35rem] rounded-br-md bg-muted/75 px-4 py-4 ring-1 ring-border/70">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border/70 px-4 pb-4 pt-3">
              <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1" dir="rtl">
                {STARTERS.slice(0, 3).map((starter) => (
                  <button key={starter} type="button" disabled={sending} onClick={() => void ask(starter)} className="press shrink-0 rounded-full border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground transition hover:border-primary/45 hover:text-primary disabled:opacity-50">
                    {starter}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2 rounded-[1.3rem] bg-muted/55 p-2 ring-1 ring-border/70">
                <Textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(draft); }
                  }}
                  disabled={sending}
                  rows={1}
                  maxLength={1000}
                  placeholder="اسأل رَصْد عن وضع المحل..."
                  className="min-h-10 max-h-28 resize-none border-0 bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:ring-0"
                />
                <Button type="button" size="icon" disabled={!draft.trim() || sending} onClick={() => void ask(draft)} className="press h-10 w-10 shrink-0 rounded-xl">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 px-1 text-[10px] leading-5 text-muted-foreground">رَصْد يقدّم تحليلًا واقتراحات، ولا ينشئ أو يعدّل سجلات.</p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
