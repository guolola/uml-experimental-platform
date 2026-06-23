export type ModelVendorId = "openai" | "claude" | "google" | "deepseek" | "minimax" | "aliyun" | "zhipu";

export interface ModelOption {
  id: string;
  vendorId: ModelVendorId;
  shortLabel: string;
  fullLabel: string;
  supportsJsonSchema: boolean;
}

export interface ModelCapability {
  supportsJsonSchema: boolean;
  supportsJsonObject: boolean;
  structuredOutputMode: "strict_json" | "json_object" | "compatible";
  modeLabel: string;
  warning?: string;
}

export interface ModelVendor {
  id: ModelVendorId;
  label: string;
  models: ModelOption[];
}

export const MODEL_VENDORS: ModelVendor[] = [
  {
    id: "openai",
    label: "OpenAI",
    models: [
      {
        id: "gpt-5.5-pro",
        vendorId: "openai",
        shortLabel: "GPT 5.5 Pro",
        fullLabel: "gpt-5.5-pro",
        supportsJsonSchema: true,
      },
      {
        id: "gpt-5.5",
        vendorId: "openai",
        shortLabel: "GPT 5.5",
        fullLabel: "gpt-5.5",
        supportsJsonSchema: true,
      },
      {
        id: "gpt-5.4",
        vendorId: "openai",
        shortLabel: "GPT 5.4",
        fullLabel: "gpt-5.4",
        supportsJsonSchema: true,
      },
      {
        id: "gpt-5.2-thinking",
        vendorId: "openai",
        shortLabel: "5.2 Think",
        fullLabel: "gpt-5.2-thinking",
        supportsJsonSchema: true,
      },
    ],
  },
  {
    id: "claude",
    label: "Claude",
    models: [
      {
        id: "claude-opus-4-7",
        vendorId: "claude",
        shortLabel: "Opus 4.7",
        fullLabel: "claude-opus-4-7",
        supportsJsonSchema: true,
      },
      {
        id: "claude-opus-4-6-thinking",
        vendorId: "claude",
        shortLabel: "Opus 4.6",
        fullLabel: "claude-opus-4-6-thinking",
        supportsJsonSchema: true,
      },
      {
        id: "claude-opus-4-5-20251101",
        vendorId: "claude",
        shortLabel: "Opus 4.5",
        fullLabel: "claude-opus-4-5-20251101",
        supportsJsonSchema: true,
      },
    ],
  },
  {
    id: "google",
    label: "Google",
    models: [
      {
        id: "gemini-3.1-flash-lite-preview-thinking-high",
        vendorId: "google",
        shortLabel: "Lite High",
        fullLabel: "gemini-3.1-flash-lite-preview-thinking-high",
        supportsJsonSchema: true,
      },
      {
        id: "gemini-3.1-pro-preview-thinking-medium",
        vendorId: "google",
        shortLabel: "Pro Medium",
        fullLabel: "gemini-3.1-pro-preview-thinking-medium",
        supportsJsonSchema: true,
      },
      {
        id: "gemini-3.1-flash-lite-preview",
        vendorId: "google",
        shortLabel: "Flash Lite",
        fullLabel: "gemini-3.1-flash-lite-preview",
        supportsJsonSchema: true,
      },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    models: [
      {
        id: "deepseek-v4-pro",
        vendorId: "deepseek",
        shortLabel: "V4 Pro",
        fullLabel: "deepseek-v4-pro",
        supportsJsonSchema: true,
      },
    ],
  },
  {
    id: "minimax",
    label: "Minimax",
    models: [
      {
        id: "MiniMax-M2.7",
        vendorId: "minimax",
        shortLabel: "M2.7",
        fullLabel: "MiniMax-M2.7",
        supportsJsonSchema: true,
      },
    ],
  },
  {
    id: "aliyun",
    label: "Aliyun",
    models: [
      {
        id: "qwen3.5-plus",
        vendorId: "aliyun",
        shortLabel: "Qwen 3.5 Plus",
        fullLabel: "qwen3.5-plus",
        supportsJsonSchema: true,
      },
    ],
  },
  {
    id: "zhipu",
    label: "智谱",
    models: [
      {
        id: "glm-5.1",
        vendorId: "zhipu",
        shortLabel: "GLM 5.1",
        fullLabel: "glm-5.1",
        supportsJsonSchema: true,
      },
    ],
  },
];

const MODEL_OPTIONS = MODEL_VENDORS.flatMap((vendor) => vendor.models);

export const DEFAULT_MODEL_ID = "gpt-5.4";

export function getModelOption(modelId: string) {
  return MODEL_OPTIONS.find((model) => model.id === modelId) ?? null;
}

export function getModelCapability(modelId: string): ModelCapability {
  const option = getModelOption(modelId);
  if (!option?.supportsJsonSchema) {
    return {
      supportsJsonSchema: false,
      supportsJsonObject: false,
      structuredOutputMode: "compatible",
      modeLabel: "兼容模式",
      warning: "此模型将使用普通输出，并通过校验与修复重试保证结构。",
    };
  }

  return {
    supportsJsonSchema: true,
    supportsJsonObject: true,
    structuredOutputMode: "strict_json",
    modeLabel: "严格 JSON",
  };
}

export function getModelVendor(modelId: string) {
  const option = getModelOption(modelId);
  if (!option) return MODEL_VENDORS[0];
  return MODEL_VENDORS.find((vendor) => vendor.id === option.vendorId) ?? MODEL_VENDORS[0];
}

export function getModelDisplayName(modelId: string) {
  const option = getModelOption(modelId);
  if (!option) {
    return {
      triggerLabel: "选择模型",
      vendorLabel: MODEL_VENDORS[0].label,
      shortLabel: "未设置",
    };
  }

  const vendor = getModelVendor(modelId);
  return {
    triggerLabel: `${vendor.label} · ${option.shortLabel}`,
    vendorLabel: vendor.label,
    shortLabel: option.shortLabel,
  };
}

export function normalizeModelId(modelId: string) {
  return getModelOption(modelId)?.id ?? DEFAULT_MODEL_ID;
}
