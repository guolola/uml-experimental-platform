// Normalizes model choices against server-managed provider config policy.
export type ProviderModelPolicy = {
  defaultModel?: string | null;
  allowedModels?: string[] | null;
  modelCapabilities?: Record<
    string,
    {
      id?: string;
      supportsJsonSchema?: boolean;
    }
  > | null;
  provider?: string | null;
  name?: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  "openai": "OpenAI",
  "openai-compatible": "OpenAI Compatible",
  "siliconflow": "SiliconFlow",
  "comfly": "Comfly",
  "anthropic": "Claude",
  "claude": "Claude",
  "google": "Google",
  "deepseek": "DeepSeek",
  "minimax": "Minimax",
  "aliyun": "Aliyun",
  "zhipu": "智谱",
};

export function getProviderAllowedModels(config: ProviderModelPolicy | null | undefined) {
  const normalized = new Set(
    [config?.defaultModel ?? "", ...(config?.allowedModels ?? [])]
      .map((model) => model.trim())
      .filter(Boolean),
  );
  return Array.from(normalized);
}

export function getProviderModelCapabilities(
  config: ProviderModelPolicy | null | undefined,
) {
  const allowedModels = new Set(getProviderAllowedModels(config));
  return Object.fromEntries(
    Object.entries(config?.modelCapabilities ?? {}).flatMap(([model, capability]) => {
      const normalizedModel = model.trim();
      if (!normalizedModel || !allowedModels.has(normalizedModel)) return [];
      return [
        [
          normalizedModel,
          {
            ...capability,
            id: capability.id ?? normalizedModel,
            supportsJsonSchema: capability.supportsJsonSchema === true,
          },
        ],
      ];
    }),
  );
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

export function getProviderLabel(config: ProviderModelPolicy | null | undefined) {
  const provider = config?.provider?.trim();
  if (provider) {
    const normalized = provider.toLowerCase();
    if (PROVIDER_LABELS[normalized]) return PROVIDER_LABELS[normalized];
    return provider
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return config?.name?.trim() || "托管 Provider";
}
