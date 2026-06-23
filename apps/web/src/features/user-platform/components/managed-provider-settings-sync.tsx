// Keeps persisted model settings aligned with the server-managed provider catalog after login.
import { useEffect } from "react";
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import {
  getProviderAllowedModels,
  getProviderLabel,
  getProviderModelCapabilities,
  resolveProviderModel,
} from "../../../shared/lib/provider-config-models";
import {
  platformApi,
  type PlatformAccountProfileResponse,
  type PlatformProviderConfig,
} from "../services/platform-api";

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameJsonValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasManagedProviderSettingsChanged(current: UserSettings, next: UserSettings) {
  return (
    current.providerConfigId !== next.providerConfigId ||
    current.providerLabel !== next.providerLabel ||
    current.defaultModel !== next.defaultModel ||
    !sameStringArray(current.providerModelOptions, next.providerModelOptions) ||
    !sameJsonValue(current.providerModelCapabilities, next.providerModelCapabilities)
  );
}

export function resolveManagedProviderSettingsSync(
  providerConfigs: PlatformProviderConfig[],
  current: UserSettings,
) {
  const providerConfigId = current.providerConfigId.trim();
  if (!providerConfigId) return null;

  const activeConfigs = providerConfigs.filter((config) => config.status === "active");
  const selectedProvider = activeConfigs.find((config) => config.id === providerConfigId);
  const next = selectedProvider
    ? {
        ...current,
        providerConfigId: selectedProvider.id,
        providerModelCapabilities: getProviderModelCapabilities(selectedProvider),
        providerModelOptions: getProviderAllowedModels(selectedProvider),
        providerLabel: getProviderLabel(selectedProvider),
        defaultModel: resolveProviderModel(selectedProvider, current.defaultModel),
      }
    : {
        ...current,
        providerConfigId: "",
        providerModelCapabilities: {},
        providerModelOptions: [],
        providerLabel: "",
        defaultModel: DEFAULT_USER_SETTINGS.defaultModel,
      };

  return hasManagedProviderSettingsChanged(current, next) ? next : null;
}

export function ManagedProviderSettingsSync({
  session,
}: {
  session: PlatformAccountProfileResponse | null;
}) {
  const userId = session?.user?.id ?? "";

  useEffect(() => {
    if (!userId) return;
    const current = loadUserSettings();
    if (!current.providerConfigId.trim()) return;

    let cancelled = false;
    platformApi
      .listProviderConfigs()
      .then((response) => {
        if (cancelled) return;
        const next = resolveManagedProviderSettingsSync(
          response.providerConfigs,
          loadUserSettings(),
        );
        if (next) {
          saveUserSettings(next);
        }
      })
      .catch(() => {
        // Keep the current local setting when the catalog cannot be refreshed.
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
