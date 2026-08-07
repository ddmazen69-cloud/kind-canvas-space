import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

export function RasdAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [sending, setSending] = useState(false);
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
      const detail = error?.message?.includes("OPENAI_API_KEY")
        ? "رَصْد يحتاج تفعيل مفتاح الذكاء الاصطناعي من إعدادات الخادم أولًا."
        : "تعذّر الاتصال برَصْد الآن. تأكد من تفعيل خدمة رَصْد ثم جرّب مجددًا.";
      setMessages((current) => [...current, { role: "assistant", content: detail }]);
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
