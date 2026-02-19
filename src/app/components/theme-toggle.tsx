"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "focusflow-theme";

const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute("data-theme", theme);
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <button
      onClick={toggle}
      className="ff-btn ff-btn-ghost rounded-full px-3 py-1 text-xs font-semibold"
      suppressHydrationWarning
      style={{
        borderColor: "var(--card-border)",
        background: "var(--surface-2)",
        color: "var(--text-primary)",
      }}
    >
      {theme === "dark" ? "Light Theme" : "Dark Theme"}
    </button>
  );
}
