"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

export type Theme = "light" | "dark";

const STORAGE_KEY = "overtree-theme";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Tracks the theme applied on <html data-theme> (set by the boot script in app/layout.tsx). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(currentTheme());
    const obs = new MutationObserver(() => setTheme(currentTheme()));
    obs.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }
  return (
    <button
      onClick={toggle}
      className={className ?? "text-zinc-500 hover:text-zinc-200"}
      title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
    >
      {theme === "light" ? <MoonIcon width={14} height={14} /> : <SunIcon width={14} height={14} />}
    </button>
  );
}
