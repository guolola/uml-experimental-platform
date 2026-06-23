// Normalizes run request payloads before they leave the workspace repository.
type ProviderSettingsPresence = {
  providerConfigId?: string;
};

export function snapshotErrorMessage(
  snapshot: { error?: { message?: string } | null },
  fallback: string,
) {
  return snapshot.error?.message ?? fallback;
}

export function runPayloadWithoutUnmanagedProviderSettings<T extends object>(
  input: T & { providerSettings?: ProviderSettingsPresence | null },
) {
  return input;
}
