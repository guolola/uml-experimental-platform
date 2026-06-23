// Keeps local model preferences hydrated from server-managed provider configs after login.
import { useEffect } from "react";
import {
  getProviderAllowedModels,
  getProviderLabel,
  getProviderModelCapabilities,
  resolveProviderModel,
  sortProviderConfigsByScope,
} from "../../../shared/lib/provider-config-models";
import {
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import {
  platformApi,
  type PlatformProviderConfig,
} from "../services/platform-api";

function sameSettings(left: UserSettings, right: UserSettings) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function resolveManagedProviderSettingsSync(
  current: UserSettings,
  providerConfigs: PlatformProviderConfig[],
): UserSettings | null {
  const activeConfigs = sortProviderConfigsByScope(
    providerConfigs.filter((config) => config.status === "active"),
  );
  const selectedProvider =
    activeConfigs.find((config) => config.id === current.providerConfigId.trim()) ??
    activeConfigs[0];

  if (!selectedProvider) {
    const cleared = {
      ...current,
      providerConfigId: "",
      providerModelCapabilities: {},
      providerModelOptions: [],
      providerLabel: "",
      providerDefaultModelSeededFor: "",
    };
    return sameSettings(current, cleared) ? null : cleared;
  }

  const shouldSeedProviderDefault =
    current.providerConfigId.trim() !== selectedProvider.id ||
    current.providerDefaultModelSeededFor !== selectedProvider.id;
  const nextDefaultModel = shouldSeedProviderDefault
    ? resolveProviderModel(selectedProvider, selectedProvider.defaultModel ?? "")
    : resolveProviderModel(selectedProvider, current.defaultModel);

  const next = {
    ...current,
    providerConfigId: selectedProvider.id,
    providerModelCapabilities: getProviderModelCapabilities(selectedProvider),
    providerModelOptions: getProviderAllowedModels(selectedProvider),
    providerLabel: getProviderLabel(selectedProvider),
    providerDefaultModelSeededFor: selectedProvider.id,
    defaultModel: nextDefaultModel,
  };
  return sameSettings(current, next) ? null : next;
}

export function ManagedProviderSettingsSync() {
  useEffect(() => {
    let cancelled = false;
    platformApi
      .listProviderConfigs()
      .then((response) => {
        if (cancelled) return;
        const next = resolveManagedProviderSettingsSync(
          loadUserSettings(),
          response.providerConfigs,
        );
        if (next) {
          saveUserSettings(next);
        }
      })
      .catch(() => {
        // Settings remain editable through the dialog; route rendering should not fail on sync errors.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
