import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "night";
export type ResolvedTheme = "light" | "night";

const STORAGE_KEY = "familialens.theme";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "night";
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function writeStoredPreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Theme is a convenience preference; failing to persist should not block UI.
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved === "night" ? "dark" : "light";
  }
  return resolved;
}

if (typeof document !== "undefined") {
  applyTheme(readStoredPreference());
}

export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredPreference())
  );

  useEffect(() => {
    setResolvedTheme(applyTheme(preference));

    if (preference !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolvedTheme(applyTheme(preference));
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredPreference(next);
    setPreferenceState(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setPreferenceState((current) => {
      const next: ThemePreference =
        current === "system" ? "night" : current === "night" ? "light" : "system";
      writeStoredPreference(next);
      return next;
    });
  }, []);

  return {
    preference,
    resolvedTheme,
    setPreference,
    cycleTheme
  };
}
