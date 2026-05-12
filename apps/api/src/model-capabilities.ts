export interface ModelCapability {
  supportsJsonSchema: boolean;
  modeLabel: string;
  warning?: string;
}

const JSON_SCHEMA_MODELS = new Set([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.2-thinking",
]);

export function getModelCapability(modelId: string): ModelCapability {
  if (JSON_SCHEMA_MODELS.has(modelId)) {
    return {
      supportsJsonSchema: true,
      modeLabel: "严格结构化",
    };
  }

  return {
    supportsJsonSchema: false,
    modeLabel: "兼容模式",
    warning: "此模型不使用 json_schema，将走普通 JSON 输出与修复重试。",
  };
}
