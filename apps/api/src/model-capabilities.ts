export interface ModelCapability {
  supportsJsonSchema: boolean;
  modeLabel: string;
  warning?: string;
}

export function getModelCapability(_modelId: string): ModelCapability {
  return {
    supportsJsonSchema: true,
    modeLabel: "严格结构化",
  };
}
