import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/store";
import { ROLE_LABEL, ROLE_HINT, type AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";

export const PENDING_INVITE_KEY = "segilly:pending-invite";

/** يستهلك رمز الدعوة ويدّي المستخدم الحالي الدور اللي حدده المالك. */
export function useAcceptInvite() {
  return async (token: string) => {
    const { data, error } = await supabase.rpc("accept_invite_token", { _token: token });
    if (error) throw new Error(error.message);
    return data as AppRole;
  };
}

export default function Join({ token }: { token: string }) {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [role, setRole] = useState<AppRole | null>(null);
  const [message, setMessage] = useState("");
  const once = useRef(false);

  useEffect(() => {
    if (!ready || once.current) return;
    if (!user) {
      try { localStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* ignore */ }
      navigate("/auth", { replace: true });
      return;
    }
    once.current = true;
    accept(token)
      .then((r) => { setRole(r); setState("done"); })
      .catch((e: unknown) => {
        setMessage(e instanceof Error ? e.message : "رابط الدعوة غير صالح");
        setState("error");
      });
  }, [ready, user, token, accept, navigate]);

  return (
    <div dir="rtl" className="grid min-h-screen place-items-center px-5 text-center">
      <div className="glass w-full max-w-md rounded-[1.75rem] p-8">
        {state === "working" && (
          <>
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="font-semibold">بنفعّل دعوتك…</p>
          </>
        )}
        {state === "done" && (
          <>
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <p className="text-lg font-bold">أهلاً بيك في الفريق</p>
            <p className="mt-1 text-sm text-muted-foreground">
              صلاحيتك دلوقتي: {role ? ROLE_LABEL[role] : "—"}
            </p>
            {role && <p className="mt-1 text-xs text-muted-foreground">{ROLE_HINT[role]}</p>}
            <Button className="mt-6 rounded-full px-8" onClick={() => navigate("/")}>يلا نبدأ</Button>
          </>
        )}
        {state === "error" && (
          <>
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-danger/10 text-danger">
              <XCircle className="h-6 w-6" />
            </span>
            <p className="text-lg font-bold">الرابط مش شغال</p>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" className="mt-6 rounded-full px-8" onClick={() => navigate("/")}>رجوع</Button>
          </>
        )}
      </div>
    </div>
  );
}
