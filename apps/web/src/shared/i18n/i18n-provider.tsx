// Bridges persisted language preference, browser locale detection, and document language metadata.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./i18n";
import {
  LOCALE_HTML_LANG,
  type AppLocale,
  type LocalePreference,
} from "./types";
import {
  loadLocalePreference,
  resolveLocalePreference,
  saveLocalePreference,
} from "./locale";

type I18nContextValue = {
  locale: AppLocale;
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function shouldUsePrerenderSafeLocale() {
  if (typeof document === "undefined") return true;
  return document.getElementById("root")?.dataset.prerendered === "true";
}

function initialLocaleState() {
  if (typeof window === "undefined" || shouldUsePrerenderSafeLocale()) {
    return {
      preference: "system" as LocalePreference,
      locale: "zh-CN" as AppLocale,
    };
  }
  const preference = loadLocalePreference();
  return {
    preference,
    locale: resolveLocalePreference(preference),
  };
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LocalePreference>(
    () => initialLocaleState().preference,
  );
  const [locale, setLocale] = useState<AppLocale>(() => initialLocaleState().locale);

  useEffect(() => {
    const savedPreference = loadLocalePreference();
    setPreferenceState(savedPreference);
    setLocale(resolveLocalePreference(savedPreference));
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = LOCALE_HTML_LANG[locale];
  }, [locale]);

  useEffect(() => {
    if (preference !== "system") return;
    const refresh = () => setLocale(resolveLocalePreference("system"));
    window.addEventListener("languagechange", refresh);
    return () => window.removeEventListener("languagechange", refresh);
  }, [preference]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      preference,
      setPreference: (nextPreference) => {
        saveLocalePreference(nextPreference);
        setPreferenceState(nextPreference);
        setLocale(resolveLocalePreference(nextPreference));
      },
    }),
    [locale, preference],
  );

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}

export function useAppI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useAppI18n must be used inside AppI18nProvider");
  return value;
}
