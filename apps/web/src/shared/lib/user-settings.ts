export const USER_SETTINGS_STORAGE_KEY = "uml-lab-settings";
export const USER_SETTINGS_CHANGED_EVENT = "uml-user-settings-changed";
import { DEFAULT_MODEL_ID, normalizeModelId } from "./model-catalog";

export type UserSettings = {
  apiBaseUrl: string;
  apiKey: string;
  defaultModel: string;
  fontSize: "sm" | "md" | "lg";
  autoGenerate: boolean;
  showStaleBanner: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  apiBaseUrl: "https://ai.comfly.chat",
  apiKey: "",
  defaultModel: DEFAULT_MODEL_ID,
  fontSize: "md",
  autoGenerate: false,
  showStaleBanner: true,
};

export function normalizeApiBaseUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const normalized = new URL(trimmed);
  return normalized.origin;
}

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const next = {
      ...DEFAULT_USER_SETTINGS,
      ...JSON.parse(raw),
    };
    next.defaultModel = normalizeModelId(next.defaultModel);
    next.apiBaseUrl = normalizeApiBaseUrl(next.apiBaseUrl);
    return next;
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings) {
  localStorage.setItem(
    USER_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...settings,
      apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
    }),
  );
  window.dispatchEvent(new Event(USER_SETTINGS_CHANGED_EVENT));
}

export function patchUserSettings(patch: Partial<UserSettings>) {
  saveUserSettings({
    ...loadUserSettings(),
    ...patch,
  });
}
