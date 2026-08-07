/**
 * Minimal Upstash Redis REST client for browser usage.
 * If the env vars are missing, all calls become silent no-ops so the app
 * keeps working without Redis.
 */
const base = String(import.meta.env["VITE_UPSTASH_REDIS_REST_URL"] || "").replace(/\/+$/, "");
const token = import.meta.env["VITE_UPSTASH_REDIS_REST_TOKEN"] || "";
const enabled = Boolean(base && token);

async function cmd(command: string, args: string[], opts: Record<string, string> = {}): Promise<unknown> {
  if (!enabled) return null;
  const path = `/${command}/${args.map(encodeURIComponent).join("/")}`;
  const qs = new URLSearchParams(opts).toString();
  try {
    const res = await fetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return (json as { result?: unknown })?.result ?? null;
  } catch {
    return null;
  }
}

export async function redisGet(key: string): Promise<string | null> {
  const r = await cmd("get", [key]);
  return typeof r === "string" ? r : null;
}

export async function redisSet(key: string, value: string, ttlSeconds = 3600): Promise<void> {
  await cmd("set", [key, value], { EX: String(ttlSeconds) });
}

export async function redisDel(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  await cmd("del", keys);
}

export const redisEnabled = enabled;
