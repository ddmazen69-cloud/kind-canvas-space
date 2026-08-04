import type { ColorTheme, ThemeMode } from "@/lib/store";

const THEME_KEY = "segilly:theme";
const COLOR_THEME_KEY = "segilly:color-theme";

/** Last theme the user picked on this device (instant paint before settings load). */
export function readStoredTheme(): ThemeMode | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(THEME_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : null;
}

export function storeTheme(mode: ThemeMode) {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* noop */ }
}

export function readStoredColorTheme(): ColorTheme | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(COLOR_THEME_KEY);
  return value && ["emerald", "ocean", "sapphire", "violet", "orchid", "rose", "amber", "copper", "lime", "graphite"].includes(value)
    ? value as ColorTheme
    : null;
}

export function storeColorTheme(colorTheme: ColorTheme) {
  try { localStorage.setItem(COLOR_THEME_KEY, colorTheme); } catch { /* noop */ }
}

/** Resolves a mode to the concrete surface currently shown. */
export function resolvedTheme(mode: ThemeMode): "dark" | "light" {
  const prefersLight =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return mode === "light" || (mode === "system" && prefersLight) ? "light" : "dark";
}

/** Applies the theme to <html>: dark tokens by default, light tokens via .theme-light. */
export function applyTheme(mode: ThemeMode, colorTheme: ColorTheme = readStoredColorTheme() ?? "emerald") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const light = resolvedTheme(mode) === "light";
  root.classList.toggle("theme-light", light);
  root.classList.toggle("dark", !light);
  root.dataset.colorTheme = colorTheme;
}
