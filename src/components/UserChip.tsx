import { useProfile } from "@/lib/store";
import { useMyRole, ROLE_LABEL, useTeam } from "@/lib/roles";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function initials(label: string, email?: string) {
  const src = (label || email || "?").trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Signed-in avatar + name, so it's always obvious which account is active. */
export function UserAvatar({ size = 36, className = "" }: { size?: number; className?: string }) {
  const { avatar, label, user } = useProfile();
  const px = { width: size, height: size };
  return (
    <span
      style={px}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/12 ring-1 ring-[var(--hairline)]",
        "shadow-[inset_0_1px_1px_hsl(0_0%_100%/0.14)]",
        className,
      )}
    >
      {avatar ? (
        <img src={avatar} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-semibold tracking-wide text-primary" dir="ltr">
          {initials(label, user?.email)}
        </span>
      )}
    </span>
  );
}

export function UserChip({ className = "" }: { className?: string }) {
  const { label, user, loading } = useProfile();
  const { role, loading: roleLoading } = useMyRole();
  const { members, loading: teamLoading } = useTeam();


  if (loading) {
    return (
      <div className={cn("rounded-full bg-foreground/[0.04] p-1.5 ring-1 ring-[var(--hairline)]", className)}>
        <div className="flex items-center gap-2.5 rounded-full px-2 py-1.5">
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-foreground/10" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-2.5 w-24 animate-pulse rounded-full bg-foreground/10" />
            <span className="block h-2 w-32 animate-pulse rounded-full bg-foreground/[0.07]" />
          </span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      className={cn(
        "min-h-[4.25rem] rounded-[1.5rem] bg-transparent p-1.5 ring-1 ring-[var(--hairline)]",
        "transition-[background-color,box-shadow] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 rounded-[1.25rem] px-2 py-1.5 bg-[#2b0f14]/20">
        <UserAvatar />
        <span className="min-w-0 flex-1 text-right">
          <span className="block truncate text-sm font-semibold leading-tight">
            {label || "حسابي"}
          </span>
          <div className="mt-1 flex min-h-6 items-center gap-2">
            <span className="inline-flex min-w-16 items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
              <ShieldCheck className="h-3 w-3" strokeWidth={1.4} />
              {roleLoading ? "جارِ التحميل" : role ? ROLE_LABEL[role] : "بدون صلاحية"}
            </span>
            {/* مساحة ثابتة تمنع الكارت من تغيير عرضه عندما تصل بيانات الفريق. */}
            <div className="flex w-14 items-center justify-end -space-x-2">
              {!teamLoading && members.slice(0, 2).map((m) => (
                m.avatarUrl ? (
                  <img
                    key={m.userId}
                    src={m.avatarUrl}
                    alt={m.displayName}
                    className="h-6 w-6 rounded-full ring-1 ring-[var(--hairline)] object-cover"
                  />
                ) : (
                  <span
                    key={m.userId}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary ring-1 ring-[var(--hairline)]"
                    title={m.displayName}
                  >
                    {initials(m.displayName, m.email ?? undefined)}
                  </span>
                )
              ))}
            </div>
          </div>
        </span>
      </div>


    </div>
  );
}
