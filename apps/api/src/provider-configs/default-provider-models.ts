// Defines the platform-default model allowlist applied to managed provider configs.
export const DEFAULT_ALLOWED_PROVIDER_MODELS = [
  "gpt-5.5-pro",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.2-thinking",
  "claude-opus-4-7",
  "claude-opus-4-6-thinking",
  "claude-opus-4-5-20251101",
  "gemini-3.1-flash-lite-preview-thinking-high",
  "gemini-3.1-pro-preview-thinking-medium",
  "gemini-3.1-flash-lite-preview",
  "deepseek-v4-pro",
  "MiniMax-M2.7",
  "qwen3.5-plus",
  "glm-5.1",
];

function isSiliconFlowProvider(context?: {
  baseUrl?: string | null;
  provider?: string | null;
}) {
  if (context?.provider?.trim().toLowerCase() === "siliconflow") return true;
  if (!context?.baseUrl) return false;
  try {
    return new URL(context.baseUrl.trim()).hostname === "api.siliconflow.cn";
  } catch {
    return false;
  }
}

export function normalizeProviderAllowedModels(
  defaultModel: string,
  allowedModels?: string[] | null,
  context?: {
    baseUrl?: string | null;
    provider?: string | null;
  },
) {
  const defaults = isSiliconFlowProvider(context) ? [] : DEFAULT_ALLOWED_PROVIDER_MODELS;
  const normalized = new Set(
    [defaultModel, ...(allowedModels ?? []), ...defaults]
      .map((model) => model.trim())
      .filter(Boolean),
  );
  return Array.from(normalized);
}
