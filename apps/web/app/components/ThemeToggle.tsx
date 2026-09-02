"use client";

import React from "react";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "huddle-theme";

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): "light" | "dark" {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function readStoredPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const ORDER: ThemePreference[] = ["system", "light", "dark"];

const LABEL: Record<ThemePreference, string> = {
  system: "Theme: system",
  light: "Theme: light",
  dark: "Theme: dark",
};

/**
 * Cycles system → light → dark. "System" is kept as a real state rather than
 * inferred once at load, so a user who has not chosen keeps following their OS
 * when it switches at sunset — which is exactly when this app gets used.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [preference, setPreference] = React.useState<ThemePreference>("system");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setPreference(readStoredPreference());
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme(resolveTheme(preference, media.matches));
    sync();
    if (preference !== "system") return;
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preference, mounted]);

  const cycle = () => {
    const next =
      ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length] ?? "system";
    setPreference(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A blocked storage API must not stop the theme from changing.
    }
  };

  return (
    <button
      type="button"
      onClick={cycle}
      // Before mount the stored preference is unknown, so render the neutral
      // label rather than guess and flip it a frame later.
      title={mounted ? LABEL[preference] : "Theme"}
      aria-label={mounted ? LABEL[preference] : "Theme"}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline text-ink-muted hover:text-ink hover:border-hairline-strong transition-colors ${className}`}
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {preference === "dark" ? (
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        ) : preference === "light" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <>
            <rect x="2.5" y="4" width="19" height="13" rx="1.5" />
            <path d="M8 20h8" />
          </>
        )}
      </svg>
    </button>
  );
}
