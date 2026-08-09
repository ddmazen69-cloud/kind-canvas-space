import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

const ROLE_NAMES = ["owner", "manager", "seller"] as const;
type RoleName = (typeof ROLE_NAMES)[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, message: string): Response {
  return json({ success: false, code, error: message }, status);
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseClient(authToken: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Invalid JSON body");
  }
  const { email: rawEmail, role, redirectTo } = (body ?? {}) as {
    email?: unknown;
    role?: unknown;
    redirectTo?: unknown;
  };

  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return fail(400, "invalid_email", "بريد إلكتروني غير صحيح");
  }
  if (typeof role !== "string" || !(ROLE_NAMES as readonly string[]).includes(role)) {
    return fail(400, "invalid_role", "دور غير صالح");
  }
  const finalRedirect = typeof redirectTo === "string" && redirectTo.length <= 500 ? redirectTo : undefined;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
  if (!token) return fail(401, "unauthorized", "Not authenticated");

  const supabase = createSupabaseClient(token);
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return fail(401, "unauthorized", "Invalid token");

  const { data: isOwner, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "owner",
  });
  if (roleErr) return fail(500, "role_check_failed", roleErr.message);
  if (!isOwner) return fail(403, "forbidden", "المالك بس اللي يقدر يدعو أعضاء");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // لو الحساب موجود بالفعل: ندّيله الصلاحية على طول
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

  if (existing) {
    const { error: roleErr2 } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: existing.id, role: role as RoleName }, { onConflict: "user_id,role" });
    if (roleErr2) return fail(500, "role_save_failed", roleErr2.message);
    await supabaseAdmin
      .from("team_invites")
      .insert({
        invited_by: user.id,
        email,
        role: role as RoleName,
        status: "accepted",
        accepted_by: existing.id,
        accepted_at: new Date().toISOString(),
      });
    return json({ success: true, status: "added" });
  }

  const { error: inviteRowErr } = await supabase
    .from("team_invites")
    .insert({ invited_by: user.id, email, role: role as RoleName });
  if (inviteRowErr) {
    if (inviteRowErr.code === "23505" || /duplicate/i.test(inviteRowErr.message)) {
      return fail(409, "duplicate_invite", "فيه دعوة سارية للبريد ده بالفعل");
    }
    return fail(500, "invite_save_failed", inviteRowErr.message);
  }

  const { error: mailErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: finalRedirect,
  });
  if (mailErr) return json({ success: true, status: "pending_no_email", message: mailErr.message });

  return json({ success: true, status: "invited" });
});
