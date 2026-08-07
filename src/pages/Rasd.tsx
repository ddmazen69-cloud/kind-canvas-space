import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDB, useShopSettings, isDueSoonOrOverdue, lowStockCount, fmt } from "@/lib/store";
import { Link } from "@/lib/router-compat";
import { toArabicDigits } from "@/lib/arabic-digits";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  WELCOME, QUICK_QUESTIONS, localAnswer, askRasd, startsThisMonth,
  type Message,
} from "@/components/RasdAssistant";
import {
  Bot, Send, Sparkles, RotateCcw, Copy, Check, AlertTriangle, PackageX, Wallet, Keyboard,
} from "lucide-react";

const STORAGE_KEY = "segilly-rasd-chat";

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [WELCOME];
    const parsed = JSON.parse(raw) as Message[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [WELCOME];
    return parsed;
  } catch {
    return [WELCOME];
  }
}

export default function Page() {
  return (
    <AppShell>
      <PageTransition>
        <RasdPage />
      </PageTransition>
    </AppShell>
  );
}

function RasdPage() {
  const data = useDB();
  const { settings } = useShopSettings();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch { /* ignore quota */ }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const overdueCount = useMemo(
    () => data.invoices.filter((invoice) => isDueSoonOrOverdue(invoice, settings.reminderDaysBefore)).length,
    [data.invoices, settings.reminderDaysBefore],
  );
  const lowCount = useMemo(
    () => lowStockCount(data.stockItems, settings.lowStockThreshold),
    [data.stockItems, settings.lowStockThreshold],
  );
  const monthCollections = useMemo(
    () =>
      data.payments.filter((item) => startsThisMonth(item.paidAt)).reduce((sum, item) => sum + item.amount, 0) +
      data.invoices.filter((item) => startsThisMonth(item.createdAt)).reduce((sum, item) => sum + item.downPayment, 0),
    [data.payments, data.invoices],
  );

  const ask = async (question: string) => {
    const content = question.trim();
    if (!content || sending) return;
    const userMsg: Message = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setDraft("");
    setSending(true);
    let answer: { content: string; nav?: { label: string; to: string } };
    try {
      answer = await askRasd(messages, content);
    } catch {
      answer = localAnswer(content, data, settings);
    }
    setMessages((current) => [...current, userMsg, { role: "assistant", ...answer }]);
    setSending(false);
  };

  const newChat = () => {
    setMessages([WELCOME]);
    setDraft("");
  };

  const copyAnswer = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const showWelcome = messages.length === 1 && messages[0].role === "assistant";

  return (
    <div className="mx-auto flex max-w-4xl flex-col" style={{ height: "calc(100dvh - 9.5rem)" }}>
      <PageHeader
        eyebrow="المساعد التحليلي"
        title="رَصْد"
        subtitle="اسأل عن بيانات محلك وطريقة استخدام التطبيق. رَصْد للقراءة فقط — لن يغيّر أي سجل."
        icon={<Bot className="h-8 w-8 text-primary" />}
        action={
          <Button variant="outline" onClick={newChat} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            محادثة جديدة
          </Button>
        }
      />

      {/* بطاقات ملخص فورية */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={overdueCount > 0 ? "danger" : "muted"}
          label="فواتير مستحقة أو متأخرة"
          value={toArabicDigits(String(overdueCount))}
        />
        <SummaryCard
          icon={<PackageX className="h-4 w-4" />}
          tone={lowCount > 0 ? "warning" : "muted"}
          label="أصناف تحتاج متابعة"
          value={toArabicDigits(String(lowCount))}
        />
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          label="تحصيلات الشهر"
          value={`${fmt(monthCollections)} ج.م`}
        />
      </div>

      {/* المحادثة */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] bg-popover ring-1 ring-white/10">
        <div ref={scrollRef} className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={cn("flex flex-col gap-1.5", message.role === "user" ? "items-end" : "items-start")}>
              <div className={cn("flex", message.role === "user" ? "justify-start" : "justify-end")}>
                <p className={cn(
                  "max-w-[88%] whitespace-pre-wrap rounded-[1.35rem] px-4 py-3 text-sm leading-7",
                  message.role === "user"
                    ? "rounded-bl-md bg-primary text-primary-foreground"
                    : "rounded-br-md bg-muted/75 text-foreground ring-1 ring-border/70",
                )}>{message.content}</p>
              </div>
              {message.role === "assistant" && (
                <div className="flex items-center gap-2 px-1">
                  {message.nav && (
                    <Link
                      to={message.nav.to}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary ring-1 ring-primary/25 transition hover:bg-primary/20"
                    >
                      <Sparkles className="h-3 w-3" />
                      {message.nav.label}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyAnswer(`${message.role}-${index}`, message.content)}
                    className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border/60 transition hover:text-foreground"
                  >
                    {copiedId === `${message.role}-${index}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedId === `${message.role}-${index}` ? "تم النسخ" : "نسخ"}
                  </button>
                </div>
              )}
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

        {/* أسئلة جاهزة — تظهر في بداية المحادثة */}
        {showWelcome && !sending && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 md:px-6">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void ask(q)}
                className="press shrink-0 rounded-full bg-muted/60 px-4 py-2 text-xs text-muted-foreground ring-1 ring-border/70 transition hover:bg-primary/10 hover:text-primary"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border/70 px-4 pb-4 pt-3 md:px-6">
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
              placeholder="اكتب سؤالك هنا..."
              className="min-h-10 max-h-28 resize-none border-0 bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:ring-0"
            />
            <Button type="button" size="icon" disabled={!draft.trim() || sending} onClick={() => void ask(draft)} className="press h-10 w-10 shrink-0 rounded-xl">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 px-1 text-[10px] leading-5 text-muted-foreground">
            <Keyboard className="h-3 w-3" />
            رَصْد يجيب عن بيانات المحل وطريقة الاستخدام، ولا ينشئ أو يعدّل سجلات. اضغط Alt+R للفتح من أي صفحة.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, tone, label, value }: { icon: React.ReactNode; tone: "danger" | "warning" | "success" | "muted"; label: string; value: string }) {
  const tones = {
    danger: "border-danger/25 bg-danger/10 text-danger",
    warning: "border-warning/25 bg-warning/10 text-warning",
    success: "border-success/25 bg-success/10 text-success",
    muted: "border-border/70 bg-muted/40 text-muted-foreground",
  };
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3 ring-1 ring-inset", tones[tone])}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background/60">{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-base font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}
