export const USER_SETTINGS_STORAGE_KEY = "uml-lab-settings";
export const USER_SETTINGS_CHANGED_EVENT = "uml-user-settings-changed";
import { DEFAULT_MODEL_ID, normalizeModelId } from "./model-catalog";

export type UserSettings = {
  providerConfigId: string;
  providerModelCapabilities: Record<
    string,
    {
      id?: string;
      supportsJsonSchema?: boolean;
    }
  >;
  providerModelOptions: string[];
  providerLabel: string;
  defaultModel: string;
  imageModel: "gpt-image-2" | "gemini-3.1-flash-image-preview-2k" | "nano-banana-pro";
  fontSize: "sm" | "md" | "lg";
  autoGenerate: boolean;
  showStaleBanner: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  providerConfigId: "",
  providerModelCapabilities: {},
  providerModelOptions: [],
  providerLabel: "",
  defaultModel: DEFAULT_MODEL_ID,
  imageModel: "gpt-image-2",
  fontSize: "md",
  autoGenerate: false,
  showStaleBanner: true,
};

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const next = {
      ...DEFAULT_USER_SETTINGS,
      ...JSON.parse(raw),
    };
    const sanitizedProviderModelOptions: string[] = Array.isArray(next.providerModelOptions)
      ? Array.from(
          new Set(
            next.providerModelOptions
              .map((model: unknown) => (typeof model === "string" ? model.trim() : ""))
              .filter((model: string): model is string => Boolean(model)),
          ),
        )
      : [];
    next.providerModelOptions = sanitizedProviderModelOptions;
    next.providerLabel =
      typeof next.providerLabel === "string" ? next.providerLabel.trim() : "";
    const sanitizedProviderModelCapabilities =
      next.providerModelCapabilities &&
      typeof next.providerModelCapabilities === "object" &&
      !Array.isArray(next.providerModelCapabilities)
        ? sanitizedProviderModelOptions.reduce<UserSettings["providerModelCapabilities"]>(
            (map, model) => {
              const rawCapability = (next.providerModelCapabilities as Record<string, unknown>)[model];
              if (!rawCapability || typeof rawCapability !== "object") return map;
              const capability = rawCapability as {
                id?: unknown;
                supportsJsonSchema?: unknown;
              };
              map[model] = {
                id: typeof capability.id === "string" ? capability.id : model,
                supportsJsonSchema:
                  typeof capability.supportsJsonSchema === "boolean"
                    ? capability.supportsJsonSchema
                    : false,
              };
              return map;
            },
            {},
          )
        : {};
    const trimmedDefaultModel =
      typeof next.defaultModel === "string" ? next.defaultModel.trim() : "";
    if (next.providerConfigId) {
      next.defaultModel =
        sanitizedProviderModelOptions.length > 0 &&
          !sanitizedProviderModelOptions.includes(trimmedDefaultModel)
          ? sanitizedProviderModelOptions[0]
          : trimmedDefaultModel || sanitizedProviderModelOptions[0] || DEFAULT_MODEL_ID;
    } else {
      next.defaultModel = normalizeModelId(trimmedDefaultModel);
      next.providerModelOptions = [];
      next.providerLabel = "";
      next.providerModelCapabilities = {};
    }
    if (next.providerConfigId) {
      next.providerModelCapabilities = sanitizedProviderModelCapabilities;
    }
    const {
      providerConfigId,
      providerModelCapabilities,
      providerModelOptions,
      providerLabel,
      defaultModel,
      imageModel,
      fontSize,
      autoGenerate,
      showStaleBanner,
    } = next;
    return {
      providerConfigId,
      providerModelCapabilities,
      providerModelOptions,
      providerLabel,
      defaultModel,
      imageModel,
      fontSize,
      autoGenerate,
      showStaleBanner,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings) {
  localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(USER_SETTINGS_CHANGED_EVENT));
}

export function patchUserSettings(patch: Partial<UserSettings>) {
  saveUserSettings({
    ...loadUserSettings(),
    ...patch,
  });
}
