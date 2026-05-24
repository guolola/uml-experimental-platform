// Normalizes model choices against server-managed provider config policy.
export type ProviderModelPolicy = {
  defaultModel?: string | null;
  allowedModels?: string[] | null;
};

export function getProviderAllowedModels(config: ProviderModelPolicy | null | undefined) {
  const normalized = new Set(
    [config?.defaultModel ?? "", ...(config?.allowedModels ?? [])]
      .map((model) => model.trim())
      .filter(Boolean),
  );
  return Array.from(normalized);
}

export function resolveProviderModel(
  config: ProviderModelPolicy | null | undefined,
  currentModel: string,
) {
  const allowedModels = getProviderAllowedModels(config);
  const trimmedCurrent = currentModel.trim();
  if (trimmedCurrent && allowedModels.includes(trimmedCurrent)) {
    return trimmedCurrent;
  }
  return allowedModels[0] ?? trimmedCurrent;
}
