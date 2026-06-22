import type { ProviderModelCapability, ProviderSettings } from "@uml-platform/contracts";

export interface ModelCapability {
  supportsJsonSchema: boolean;
  modeLabel: string;
  warning?: string;
}

export type ModelCapabilitySource =
  | string
  | ProviderModelCapability
  | Pick<ProviderSettings, "model" | "modelCapability">;

const MODELS_WITHOUT_JSON_SCHEMA = new Set(["deepseek-v4-flash"]);

function normalizeModelId(modelId: string) {
  return modelId.trim().toLowerCase();
}

function isProviderModelCapability(
  value: ModelCapabilitySource,
): value is ProviderModelCapability {
  return typeof value === "object" && "supportsJsonSchema" in value && "modeLabel" in value;
}

function capabilityFromPersisted(capability: ProviderModelCapability): ModelCapability {
  return {
    supportsJsonSchema: capability.supportsJsonSchema,
    modeLabel: capability.modeLabel,
    warning: capability.warning,
  };
}

export function getModelCapability(input: ModelCapabilitySource): ModelCapability {
  if (isProviderModelCapability(input)) {
    return capabilityFromPersisted(input);
  }

  if (typeof input === "object" && input.modelCapability) {
    return capabilityFromPersisted(input.modelCapability);
  }

  const modelId = typeof input === "string" ? input : input.model;
  const normalizedModelId = normalizeModelId(modelId);
  if (MODELS_WITHOUT_JSON_SCHEMA.has(normalizedModelId)) {
    return {
      supportsJsonSchema: false,
      modeLabel: "JSON 模式",
      warning: "该模型当前不支持 OpenAI json_schema response_format。",
    };
  }

  return {
    supportsJsonSchema: true,
    modeLabel: "严格结构化",
  };
}
