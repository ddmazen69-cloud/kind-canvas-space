/**
 * Roles & permissions.
 *
 * Roles live in the `user_roles` table (never on profiles) and are checked
 * server-side by the `has_role()` security-definer function used inside RLS.
 * Role ability matrix (what each role may see) is stored in `role_abilities`
 * and can be edited by the owner. The helpers here drive UI affordances —
 * the database remains the gate for data access.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/store";

export type AppRole = "owner" | "manager" | "seller";

export type AbilityKey =
  | "sales"
  | "customers"
  | "operations"
  | "reports"
  | "shop_settings"
  | "manage_team";

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "مالك",
  manager: "مدير",
  seller: "بايع",
};

export const ROLE_HINT: Record<AppRole, string> = {
  owner: "صلاحية كاملة على كل البيانات والإعدادات وإدارة الفريق.",
  manager: "إدارة الفواتير والمخزون والموردين بدون التحكم في الفريق.",
  seller: "تسجيل المبيعات والدفعات فقط.",
};

const ROLE_RANK: Record<AppRole, number> = { owner: 3, manager: 2, seller: 1 };

export const ALL_ROLES: AppRole[] = ["owner", "manager", "seller"];
export const EDITABLE_ROLES: AppRole[] = ["manager", "seller"];

export interface AbilityDef {
  key: AbilityKey;
  label: string;
  /** Routes this ability unlocks in the shell nav. */
  routes?: string[];
  /** Settings tabs this ability unlocks. */
  settingsTabs?: string[];
}

export const ABILITY_DEFS: AbilityDef[] = [
  { key: "sales", label: "تسجيل مبيعات ودفعات", routes: ["/", "/alerts"] },
  { key: "sales", label: "تسجيل مبيعات ودفعات", routes: ["/", "/alerts", "/daily"] },
  { key: "customers", label: "إدارة العملاء والفواتير", routes: ["/customers", "/payments", "/invoices", "/blocked"] },
  { key: "operations", label: "المخزون والموردين والمصروفات", routes: ["/suppliers", "/inventory", "/expenses", "/warehouse"] },
  { key: "reports", label: "التقارير والنسخ الاحتياطي", routes: ["/reports", "/archive"], settingsTabs: ["data"] },
  { key: "shop_settings", label: "إعدادات المحل", routes: ["/settings"], settingsTabs: ["shop", "billing", "alerts", "appearance"] },
  { key: "manage_team", label: "دعوة أعضاء وتغيير الصلاحيات", settingsTabs: ["team"] },
];

/** Default matrix used before the DB row loads (and as seed fallback). */
export const DEFAULT_ABILITY_ROLES: Record<AbilityKey, AppRole[]> = {
  sales: ["owner", "manager", "seller"],
  customers: ["owner", "manager"],
  operations: ["owner", "manager"],
  reports: ["owner", "manager"],
  shop_settings: ["owner"],
  manage_team: ["owner"],
};

/** Legacy shape kept for any old imports. */
export const ABILITIES: Array<{ key: AbilityKey; label: string; roles: AppRole[] }> =
  ABILITY_DEFS.map((a) => ({ key: a.key, label: a.label, roles: DEFAULT_ABILITY_ROLES[a.key] }));

export interface TeamMember {
  userId: string;
  role: AppRole;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  lastSeenAt: string | null;
  isMe: boolean;
}

export interface TeamInvite {
  id: string;
  email: string | null;
  role: AppRole;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
  token: string | null;
}

type AbilityMatrix = Record<AbilityKey, AppRole[]>;

function matrixFromRows(rows: Array<{ ability_key: string; role: string; allowed: boolean }> | null): AbilityMatrix {
  const next: AbilityMatrix = { ...DEFAULT_ABILITY_ROLES };
  for (const def of ABILITY_DEFS) next[def.key] = ["owner"];
  for (const row of rows ?? []) {
    const key = row.ability_key as AbilityKey;
    if (!ABILITY_DEFS.some((d) => d.key === key)) continue;
    const role = row.role as AppRole;
    if (!ALL_ROLES.includes(role)) continue;
    if (role === "owner") continue;
    if (row.allowed) {
      if (!next[key].includes(role)) next[key] = [...next[key], role];
    } else {
      next[key] = next[key].filter((r) => r !== role);
    }
    if (!next[key].includes("owner")) next[key] = ["owner", ...next[key]];
  }
  return next;
}

/** Highest role of the signed-in user (null while loading / signed out). */
export function useMyRole() {
  const { user, ready } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setRole(null); setLoading(false); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (data ?? []).map((r) => r.role as AppRole);
    roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
    let best: AppRole | null = roles[0] ?? null;
    if (!best) {
      const { data: bootstrapped } = await supabase.rpc("bootstrap_my_role");
      best = (bootstrapped as AppRole | null) ?? null;
    }
    setRole(best);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (ready) void load(); }, [ready, load]);

  return { role, loading, reload: load, isOwner: role === "owner", canManage: role === "owner" || role === "manager" };
}

/** Owner-editable ability matrix + helpers for the signed-in role. */
export function useRoleAbilities() {
  const { role, loading: roleLoading, isOwner } = useMyRole();
  const { ready } = useAuth();
  const [matrix, setMatrix] = useState<AbilityMatrix>(DEFAULT_ABILITY_ROLES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("role_abilities")
      .select("ability_key, role, allowed");
    if (!error && data) setMatrix(matrixFromRows(data));
    else setMatrix(DEFAULT_ABILITY_ROLES);
    setLoading(false);
  }, []);

  useEffect(() => { if (ready) void load(); }, [ready, load]);

  const can = useCallback((ability: AbilityKey) => {
    if (!role) return false;
    if (role === "owner") return true;
    return (matrix[ability] ?? []).includes(role);
  }, [matrix, role]);

  const setAbility = useCallback(async (ability: AbilityKey, targetRole: AppRole, allowed: boolean) => {
    if (targetRole === "owner") return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("role_abilities")
        .upsert({ ability_key: ability, role: targetRole, allowed, updated_at: new Date().toISOString() }, {
          onConflict: "ability_key,role",
        });
      if (error) throw error;
      setMatrix((prev) => {
        const roles = new Set(prev[ability] ?? ["owner"]);
        roles.add("owner");
        if (allowed) roles.add(targetRole);
        else roles.delete(targetRole);
        return { ...prev, [ability]: ALL_ROLES.filter((r) => roles.has(r)) };
      });
    } finally {
      setSaving(false);
    }
  }, []);

  const allowedRoutes = useMemo(() => {
    const routes = new Set<string>();
    for (const def of ABILITY_DEFS) {
      if (!can(def.key)) continue;
      for (const route of def.routes ?? []) routes.add(route);
    }
    // Account settings always reachable; settings shell if any settings tab is allowed.
    routes.add("/settings");
    return routes;
  }, [can]);

  const allowedSettingsTabs = useMemo(() => {
    const tabs = new Set<string>(["account"]);
    for (const def of ABILITY_DEFS) {
      if (!can(def.key)) continue;
      for (const tab of def.settingsTabs ?? []) tabs.add(tab);
    }
    if (can("manage_team")) tabs.add("team");
    if (can("shop_settings")) {
      tabs.add("shop");
      tabs.add("billing");
      tabs.add("alerts");
      tabs.add("appearance");
    }
    if (can("reports")) tabs.add("data");
    return tabs;
  }, [can]);

  return {
    matrix,
    loading: loading || roleLoading,
    saving,
    isOwner,
    role,
    can,
    setAbility,
    reload: load,
    allowedRoutes,
    allowedSettingsTabs,
    abilities: ABILITY_DEFS.map((a) => ({ ...a, roles: matrix[a.key] })),
  };
}

/** All members visible to the signed-in user, via the security-definer directory. */
export function useTeam() {
  const { user, ready } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setMembers([]); setInvites([]); setLoading(false); return; }
    setLoading(true);
    const [{ data: rows }, { data: inviteRows }] = await Promise.all([
      supabase.from("team_directory").select("*"),
      supabase.from("team_invites").select("id, email, role, status, expires_at, created_at, token").order("created_at", { ascending: false }),
    ]);
    setMembers(
      (rows ?? []).map((r) => {
        const email = ((r as { email?: string | null }).email ?? null) as string | null;
        const rawName = (r.display_name as string) || "";
        const displayName = rawName.trim() || (email ? email.split("@")[0] : "") || "مستخدم";
        return {
          userId: r.user_id as string,
          role: r.role as AppRole,
          displayName,
          avatarUrl: (r.avatar_url as string | null) ?? null,
          email,
          lastSeenAt: (r.last_seen_at as string | null) ?? null,
          isMe: r.user_id === user.id,
        };
      }).sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role]),
    );
    setInvites(
      (inviteRows ?? []).map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role as AppRole,
        status: r.status as TeamInvite["status"],
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        token: (r as { token: string | null }).token ?? null,
      })),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => { if (ready) void load(); }, [ready, load]);

  const setRole = useCallback(async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").update({ role }).eq("user_id", userId);
    if (error) throw error;
    await load();
  }, [load]);

  const removeMember = useCallback(async (userId: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) throw error;
    await load();
  }, [load]);

  const revokeInvite = useCallback(async (id: string) => {
    const { error } = await supabase.from("team_invites").update({ status: "revoked" }).eq("id", id);
    if (error) throw error;
    await load();
  }, [load]);

  /**
   * يولّد رابط دعوة بدور محدد (المالك بس — RLS بتفرض ده).
   * البريد إجباري: القبول بيتحقق إن الشخص اللي مسجّل دخول بنفس البريد،
   * فلن تنفع أي حد غير صاحب البريد يستخدم الرابط.
   */
  const createInviteLink = useCallback(async (role: AppRole, email: string) => {
    if (!user) throw new Error("لازم تسجّل دخول");
    const recipient = (email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new Error("ادخل بريد إلكتروني صحيح للشخص اللي هياخد الرابط");
    }
    const token = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "");
    const { error } = await supabase
      .from("team_invites")
      .insert({ invited_by: user.id, role, token, email: recipient });
    if (error) throw error;
    await load();
    return `${window.location.origin}/join/${token}`;
  }, [load, user]);

  return { members, invites, loading, reload: load, setRole, removeMember, revokeInvite, createInviteLink };
}

/** "آخر نشاط" بصيغة بشرية. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "لسه مدخلش";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${d} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG");
}
