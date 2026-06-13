// Normalizes run request payloads before they leave the workspace repository.
type ProviderSettingsPresence = {
  providerConfigId?: string;
};

function shouldSendProviderSettings(
  providerSettings?: ProviderSettingsPresence | null,
) {
  return Boolean(providerSettings?.providerConfigId?.trim());
}

export function snapshotErrorMessage(
  snapshot: { error?: { message?: string } | null },
  fallback: string,
) {
  return snapshot.error?.message ?? fallback;
}

export function runPayloadWithoutUnmanagedProviderSettings<T extends object>(
  input: T & { providerSettings?: ProviderSettingsPresence | null },
) {
  if (shouldSendProviderSettings(input.providerSettings)) {
    return input;
  }
  const { providerSettings: _providerSettings, ...payload } = input;
  return payload;
}
