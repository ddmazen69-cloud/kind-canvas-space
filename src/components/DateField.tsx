import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * منتقي تاريخ بنفس تصميم «تاريخ أول قسط» في إنشاء فاتورة جديدة.
 * يشتغل بقيمة ISO (YYYY-MM-DD) عشان يتخزن في الداتابيز مباشرة.
 */
export function DateField({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
  quickActions,
  className,
}: {
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** أزرار اختصار اختيارية (زي «النهارده»). */
  quickActions?: Array<{ label: string; date: () => Date }>;
  className?: string;
}) {
  const parsed = value ? new Date(`${value}T00:00:00`) : undefined;
  const date = parsed && !isNaN(parsed.getTime()) ? parsed : undefined;

  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-between font-normal text-right", !date && "text-muted-foreground")}
          >
            {date ? <span dir="ltr">{format(date, "dd/MM/yyyy")}</span> : <span>{placeholder}</span>}
            <CalendarIcon className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && onChange(toIso(d))}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      {quickActions && quickActions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {quickActions.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => onChange(toIso(q.date()))}
              className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/10 hover:text-primary active:scale-[0.96]"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
