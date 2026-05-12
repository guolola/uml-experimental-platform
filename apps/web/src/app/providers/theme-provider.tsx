import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  loadUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
  type UserSettings,
} from "../../shared/lib/user-settings";

type Theme = "light" | "dark";
const STORAGE_KEY = "ui-theme";
const FONT_SIZE_PX: Record<UserSettings["fontSize"], string> = {
  sm: "14px",
  md: "15px",
  lg: "16px",
};

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void } | null>(null);

function applyFontSize() {
  if (typeof window === "undefined") return;
  const fontSize = loadUserSettings().fontSize;
  document.documentElement.style.setProperty("--font-size", FONT_SIZE_PX[fontSize]);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyFontSize();
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, applyFontSize);
    return () => {
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, applyFontSize);
    };
  }, []);

  return (
    <ThemeCtx.Provider
      value={{
        theme,
        toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme must be inside ThemeProvider");
  return v;
}
