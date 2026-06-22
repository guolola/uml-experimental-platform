// Discovers OpenAI-compatible chat model capabilities from raw /v1/models IDs.
import type {
  ProviderDiscoveredModel,
  ProviderModelCapability,
  ProviderModelCategory,
  ProviderModelDiscoveryResponse,
  ProviderModelDiscoveryProgressEvent,
  ProviderModelStrictJson,
} from "@uml-platform/contracts";
import {
  type ChatCompletionResponseFormat,
  type OpenAiCompatibleClientFactory,
  ProviderHttpError,
  listOpenAiCompatibleModels,
  probeOpenAiCompatibleStreamingChat,
} from "../llm.js";

type RawProviderModel = Pick<
  ProviderDiscoveredModel,
  "id" | "object" | "created" | "ownedBy"
>;

type NameClassification =
  | { kind: "candidate"; category: ProviderModelCategory; reason: string }
  | {
      kind: "exclude";
      category: "image" | "video" | "embedding" | "code" | "deep_research" | "unknown";
      reason: string;
    };

type ProbeBoolean = boolean | "unknown";
type DiscoveryProgressHandler = (
  event: ProviderModelDiscoveryProgressEvent,
) => void;

export interface ProviderModelDiscoverySummary {
  rawCount: number;
  excludedByNameCount: number;
  chatProbeFailedCount: number;
  chatProbeUnknownCount: number;
  strictCount: number;
  compatibleCount: number;
  unknownStrictCount: number;
}

const STRICT_JSON_PROBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    probe: { type: "string", enum: ["strict-json-ok"] },
    n: { type: "integer", enum: [1] },
  },
  required: ["probe", "n"],
} as const;

const STRICT_JSON_PROBE_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "strict_json_probe",
    strict: true,
    schema: STRICT_JSON_PROBE_SCHEMA as unknown as Record<string, unknown>,
  },
};

function compactReason(value: string | null | undefined) {
  return value?.replace(/\s+/gu, " ").trim().slice(0, 240) || undefined;
}

function throwIfAborted(abortSignal: AbortSignal | undefined) {
  if (!abortSignal?.aborted) return;
  const error = new Error("Provider model discovery aborted");
  error.name = "AbortError";
  throw error;
}

function emitProgress(
  onProgress: DiscoveryProgressHandler | undefined,
  event: ProviderModelDiscoveryProgressEvent,
) {
  onProgress?.(event);
}

export function classifyProviderModelName(modelId: string): NameClassification {
  const id = modelId.toLowerCase();

  if (/(embedding|embed|rerank|bge|e5)/iu.test(id)) {
    return { kind: "exclude", category: "embedding", reason: "embedding/rerank model id" };
  }
  if (
    /(sora|veo|vidu|seedance|video|t2v|i2v|r2v|kf2v|animate|kling-video|kling-v|wan\d|wanx)/iu.test(id) &&
    /(sora|veo|vidu|seedance|video|t2v|i2v|r2v|kf2v|animate|kling|wan)/iu.test(id)
  ) {
    return { kind: "exclude", category: "video", reason: "video generation model id" };
  }
  if (
    /(image|dall-e|imagen|cogview|kolors|stable|diffusion|flux|seedream|t2i|i2i|imageedit|z-image|riverflow|reve-|uni-1|joyai)/iu.test(id)
  ) {
    return { kind: "exclude", category: "image", reason: "image generation/editing model id" };
  }
  if (/deep-research/iu.test(id)) {
    return { kind: "exclude", category: "deep_research", reason: "deep research model id" };
  }
  if (/(codex|coder|code-preview|devstral|grok-code)/iu.test(id)) {
    return { kind: "exclude", category: "code", reason: "code-specialized model id" };
  }
  if (
    /(^|[-_.])(vl|vision)([-_.]|$)/iu.test(id) ||
    /glm-[\w.-]*v([-_.]|$)?/iu.test(id) ||
    /hunyuan.*vision/iu.test(id) ||
    /omni/iu.test(id)
  ) {
    return { kind: "candidate", category: "vision_chat", reason: "vision chat candidate id" };
  }
  if (
    /(gpt|o3|o4|chat|instruct|think|thinking|nothink|sonnet|opus|haiku|claude|gemini|gemma|qwen|qwq|glm|deepseek|kimi|doubao|hunyuan|ernie|grok|mistral|ministral|minimax|mimo|llama|baichuan|internlm|spark|xunfei|phi|step-|seed-oss|360)/iu.test(id)
  ) {
    return { kind: "candidate", category: "text_chat", reason: "text chat/instruction candidate id" };
  }

  return { kind: "exclude", category: "unknown", reason: "no reliable chat model name rule matched" };
}

function isInconclusiveStatus(status: number) {
  return [401, 402, 403, 408, 409, 429, 500, 502, 503, 504].includes(status);
}

function isUnsupportedStrictJsonError(status: number, detail: string | null) {
  return (
    [400, 404, 415, 422].includes(status) &&
    /response_format|json_schema|json schema|strict|schema|unsupported|not supported|invalid/iu.test(detail ?? "")
  );
}

function isUnsupportedChatError(status: number, detail: string | null) {
  return (
    [400, 404, 422].includes(status) &&
    /not.*chat|unsupported.*chat|model.*not.*support|image|video|embedding|not found|does not exist/iu.test(detail ?? "")
  );
}

function validateStrictProbeContent(content: string) {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 2 &&
      value.probe === "strict-json-ok" &&
      value.n === 1
    );
  } catch {
    return false;
  }
}

async function probeStrictJson(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  abortSignal?: AbortSignal;
  clientFactory?: OpenAiCompatibleClientFactory;
  responseTimeoutMs?: number;
}): Promise<{ strictJson: ProbeBoolean; reason?: string }> {
  try {
    const content = await probeOpenAiCompatibleStreamingChat({
      ...input,
      messages: [
        {
          role: "user",
          content:
            "Capability probe. Return exactly the schema-conforming JSON payload.",
        },
      ],
      responseFormat: STRICT_JSON_PROBE_RESPONSE_FORMAT,
    });
    return validateStrictProbeContent(content)
      ? { strictJson: true }
      : {
          strictJson: false,
          reason: `strict response content did not match probe schema: ${content.slice(0, 160)}`,
        };
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      if (isUnsupportedStrictJsonError(error.status, error.detail)) {
        return { strictJson: false, reason: compactReason(error.detail) };
      }
      if (isInconclusiveStatus(error.status)) {
        return { strictJson: "unknown", reason: compactReason(error.detail ?? error.message) };
      }
    }
    return {
      strictJson: "unknown",
      reason: error instanceof Error ? compactReason(error.message) : "strict JSON probe failed",
    };
  }
}

async function probePlainChat(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  abortSignal?: AbortSignal;
  clientFactory?: OpenAiCompatibleClientFactory;
  responseTimeoutMs?: number;
}): Promise<{ chat: ProbeBoolean; reason?: string }> {
  try {
    await probeOpenAiCompatibleStreamingChat({
      ...input,
      messages: [{ role: "user", content: "Reply with one word: ok" }],
      responseFormat: null,
    });
    return { chat: true };
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      if (isUnsupportedChatError(error.status, error.detail)) {
        return { chat: false, reason: compactReason(error.detail) };
      }
      if (isInconclusiveStatus(error.status)) {
        return { chat: "unknown", reason: compactReason(error.detail ?? error.message) };
      }
    }
    return {
      chat: false,
      reason: error instanceof Error ? compactReason(error.message) : "chat probe failed",
    };
  }
}

function toCapability(input: {
  model: RawProviderModel;
  category: ProviderModelCategory;
  strictJson: ProviderModelStrictJson;
  probeReason?: string;
  probedAt: string;
}): ProviderDiscoveredModel {
  const supportsJsonSchema = input.strictJson === true;
  const capability: ProviderModelCapability = {
    id: input.model.id,
    category: input.category,
    supportsJsonSchema,
    strictJson: input.strictJson,
    modeLabel: supportsJsonSchema ? "严格结构化" : "兼容模式",
    warning: supportsJsonSchema
      ? undefined
      : input.strictJson === "unknown"
        ? "Strict JSON 能力未验证，将使用普通 JSON 输出和服务端校验修复。"
        : "该模型不支持 Strict JSON Schema，将使用普通 JSON 输出和服务端校验修复。",
    probeStatus: supportsJsonSchema
      ? "strict"
      : input.strictJson === "unknown"
        ? "unknown"
        : "compatible",
    probeReason: input.probeReason,
    probedAt: input.probedAt,
  };

  return {
    ...input.model,
    ...capability,
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  abortSignal?: AbortSignal,
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      throwIfAborted(abortSignal);
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function discoverOpenAiCompatibleModelCapabilities({
  apiBaseUrl,
  apiKey,
  clientFactory,
  probeConcurrency = 4,
  probeTimeoutMs = 30_000,
  onProgress,
  abortSignal,
}: {
  apiBaseUrl: string;
  apiKey: string;
  clientFactory?: OpenAiCompatibleClientFactory;
  probeConcurrency?: number;
  probeTimeoutMs?: number;
  onProgress?: DiscoveryProgressHandler;
  abortSignal?: AbortSignal;
}): Promise<Pick<ProviderModelDiscoveryResponse, "models" | "summary">> {
  throwIfAborted(abortSignal);
  const rawModels = await listOpenAiCompatibleModels({
    apiBaseUrl,
    apiKey,
    abortSignal,
    options: { clientFactory, responseTimeoutMs: probeTimeoutMs },
  });
  emitProgress(onProgress, { type: "models_listed", rawCount: rawModels.length });
  const summary: ProviderModelDiscoverySummary = {
    rawCount: rawModels.length,
    excludedByNameCount: 0,
    chatProbeFailedCount: 0,
    chatProbeUnknownCount: 0,
    strictCount: 0,
    compatibleCount: 0,
    unknownStrictCount: 0,
  };
  const candidates = rawModels.flatMap((model) => {
    const classification = classifyProviderModelName(model.id);
    if (classification.kind === "exclude") {
      summary.excludedByNameCount += 1;
      return [];
    }
    return [{ model, category: classification.category }];
  });
  emitProgress(onProgress, {
    type: "name_filtered",
    rawCount: rawModels.length,
    candidateCount: candidates.length,
    excludedByNameCount: summary.excludedByNameCount,
  });

  const total = candidates.length;
  const indexedCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    index: index + 1,
    total,
  }));
  const probed = await mapLimit(indexedCandidates, probeConcurrency, async ({ model, category, index, total }) => {
    throwIfAborted(abortSignal);
    const probedAt = new Date().toISOString();
    emitProgress(onProgress, {
      type: "probe_started",
      modelId: model.id,
      index,
      total,
      stage: "strict_json",
    });
    const strict = await probeStrictJson({
      apiBaseUrl,
      apiKey,
      model: model.id,
      abortSignal,
      clientFactory,
      responseTimeoutMs: probeTimeoutMs,
    });
    if (strict.strictJson === true) {
      const discovered = toCapability({ model, category, strictJson: true, probedAt });
      emitProgress(onProgress, {
        type: "probe_completed",
        modelId: model.id,
        index,
        total,
        probeStatus: "strict",
        strictJson: true,
        supportsJsonSchema: true,
      });
      return discovered;
    }

    emitProgress(onProgress, {
      type: "probe_started",
      modelId: model.id,
      index,
      total,
      stage: "chat",
    });
    const chat = await probePlainChat({
      apiBaseUrl,
      apiKey,
      model: model.id,
      abortSignal,
      clientFactory,
      responseTimeoutMs: probeTimeoutMs,
    });
    if (chat.chat !== true) {
      if (chat.chat === "unknown") summary.chatProbeUnknownCount += 1;
      else summary.chatProbeFailedCount += 1;
      emitProgress(onProgress, {
        type: "probe_completed",
        modelId: model.id,
        index,
        total,
        probeStatus: chat.chat === "unknown" ? "unknown" : "failed",
        strictJson: strict.strictJson,
        supportsJsonSchema: false,
        reason: chat.reason ?? strict.reason,
      });
      return null;
    }

    const discovered = toCapability({
      model,
      category,
      strictJson: strict.strictJson,
      probeReason: strict.reason,
      probedAt,
    });
    emitProgress(onProgress, {
      type: "probe_completed",
      modelId: model.id,
      index,
      total,
      probeStatus: discovered.probeStatus ?? "compatible",
      strictJson: discovered.strictJson,
      supportsJsonSchema: discovered.supportsJsonSchema,
      reason: strict.reason,
    });
    return discovered;
  }, abortSignal);

  const models = probed.flatMap((model) => (model ? [model] : []));
  models.forEach((model) => {
    if (model.strictJson === true) summary.strictCount += 1;
    else if (model.strictJson === "unknown") summary.unknownStrictCount += 1;
    else summary.compatibleCount += 1;
  });

  return { models, summary };
}
