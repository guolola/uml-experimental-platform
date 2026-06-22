export interface ModelCapability {
  supportsJsonSchema: boolean;
  modeLabel: string;
  warning?: string;
}

const MODELS_WITHOUT_JSON_SCHEMA = new Set(["deepseek-v4-flash"]);

function normalizeModelId(modelId: string) {
  return modelId.trim().toLowerCase();
}

export function getModelCapability(modelId: string): ModelCapability {
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
