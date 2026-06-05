import type { ImageProviderSettings, ProviderSettings } from "@uml-platform/contracts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface JsonObjectResponseFormat {
  type: "json_object";
}

export interface JsonSchemaResponseFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
}

export type ChatCompletionResponseFormat =
  | JsonObjectResponseFormat
  | JsonSchemaResponseFormat;

export interface StreamChatCompletionInput {
  providerSettings: ProviderSettings;
  messages: ChatMessage[];
  responseFormat?: ChatCompletionResponseFormat | null;
}

export interface LlmTransport {
  streamChatCompletion(
    input: StreamChatCompletionInput,
  ): AsyncIterable<string>;
}

export interface GenerateImageInput {
  providerSettings: ImageProviderSettings;
  prompt: string;
}

export interface GeneratedImageResult {
  content: string;
}

export interface ImageGenerationClient {
  generateImage(input: GenerateImageInput): Promise<GeneratedImageResult>;
}

export interface RealProviderClientOptions {
  baseUrlAllowlist?: string[];
  responseTimeoutMs?: number;
}

const IMAGE_PROMPT_CHAR_LIMIT = 24000;
const DEFAULT_LLM_RESPONSE_TIMEOUT_MS = 300_000;

function resolveChatCompletionsUrl(baseUrl: string) {
  return new URL("/v1/chat/completions", baseUrl).toString();
}

function normalizeOrigin(url: string) {
  return new URL(url).origin;
}

function assertProviderBaseUrlAllowed(
  baseUrl: string,
  baseUrlAllowlist: string[] | undefined,
) {
  if (!baseUrlAllowlist || baseUrlAllowlist.length === 0) return;
  const allowedOrigins = new Set(baseUrlAllowlist.map(normalizeOrigin));
  const origin = normalizeOrigin(baseUrl);
  if (!allowedOrigins.has(origin)) {
    throw new Error("Provider Base URL is not in the provider allowlist");
  }
}

function clampImagePrompt(prompt: string) {
  if (prompt.length <= IMAGE_PROMPT_CHAR_LIMIT) return prompt;
  return `${prompt.slice(0, IMAGE_PROMPT_CHAR_LIMIT - 32)}\n...（内容已截断）`;
}

function summarizeErrorText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, 240);
}

async function readErrorDetail(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();
  const textSummary = summarizeErrorText(rawText);

  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(rawText) as {
        message?: unknown;
        error?: { message?: unknown } | unknown;
      };
      if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message.trim();
      }
      if (
        typeof payload.error === "object" &&
        payload.error !== null &&
        "message" in payload.error &&
        typeof payload.error.message === "string" &&
        payload.error.message.trim()
      ) {
        return payload.error.message.trim();
      }
    } catch {
      // Fall back to raw text summary below.
    }
  }

  return textSummary;
}

function timeoutError(timeoutMs: number) {
  return new Error(`LLM request timed out after ${timeoutMs}ms`);
}

function effectiveResponseFormat(
  responseFormat: ChatCompletionResponseFormat | null | undefined,
) {
  if (responseFormat === null) return null;
  return responseFormat ?? { type: "json_object" as const };
}

function isJsonSchemaResponseFormat(
  responseFormat: ChatCompletionResponseFormat | null,
): responseFormat is JsonSchemaResponseFormat {
  return responseFormat?.type === "json_schema";
}

function shouldRetryJsonSchemaAsJsonObject(status: number, detail: string | null) {
  if (status !== 400 && status !== 422) return false;
  const normalized = (detail ?? "").toLowerCase();
  if (!normalized) return false;
  const mentionsSchema =
    normalized.includes("response_format") ||
    normalized.includes("json_schema") ||
    normalized.includes("json schema") ||
    normalized.includes("schema") ||
    normalized.includes("strict");
  const looksUnsupported =
    normalized.includes("unsupported") ||
    normalized.includes("not support") ||
    normalized.includes("not supported") ||
    normalized.includes("does not support") ||
    normalized.includes("invalid") ||
    normalized.includes("unrecognized") ||
    normalized.includes("unknown") ||
    normalized.includes("not allowed") ||
    normalized.includes("not permitted");
  return mentionsSchema && looksUnsupported;
}

function formatHttpLlmError(status: number, detail: string | null) {
  return detail
    ? `LLM request failed with HTTP ${status}: ${detail}`
    : `LLM request failed with HTTP ${status}`;
}

function warnJsonSchemaFallback(model: string, status: number, detail: string | null) {
  console.warn(
    [
      "[llm-json-schema-fallback]",
      `model=${model}`,
      `status=${status}`,
      `reason=${summarizeErrorText(detail ?? "") ?? "provider rejected json_schema"}`,
    ].join(" "),
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      onTimeout();
      reject(timeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timer]);
  } catch (error) {
    if (timedOut) {
      throw timeoutError(timeoutMs);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function* withIdleTimeout<T>(
  source: AsyncIterable<T>,
  timeoutMs: number,
  onTimeout: () => void,
) {
  const iterator = source[Symbol.asyncIterator]();
  let timedOut = false;

  try {
    while (true) {
      const result = await withTimeout(iterator.next(), timeoutMs, () => {
        timedOut = true;
        onTimeout();
      });
      if (result.done) return;
      yield result.value;
    }
  } finally {
    if (timedOut) {
      void iterator.return?.().catch(() => undefined);
    }
  }
}

export async function* parseChatCompletionSse(response: Response) {
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      detail
        ? `LLM request failed with HTTP ${response.status}: ${detail}`
        : `LLM request failed with HTTP ${response.status}`,
    );
  }
  if (!response.body) {
    throw new Error("LLM response body is empty");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });

    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex < 0) break;

      const rawBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const data = rawBlock
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim();

      if (!data) continue;
      if (data === "[DONE]") return;

      const payload = JSON.parse(data);
      const text =
        payload.choices?.[0]?.delta?.content ??
        payload.choices?.[0]?.message?.content ??
        "";

      if (text) {
        yield text as string;
      }
    }
  }
}

export function createRealLlmTransport(
  options: RealProviderClientOptions = {},
): LlmTransport {
  return {
    async *streamChatCompletion({
      providerSettings,
      messages,
      responseFormat,
    }: StreamChatCompletionInput) {
      assertProviderBaseUrlAllowed(
        providerSettings.apiBaseUrl,
        options.baseUrlAllowlist,
      );
      const responseTimeoutMs =
        options.responseTimeoutMs ?? DEFAULT_LLM_RESPONSE_TIMEOUT_MS;
      const requestResponseFormat = effectiveResponseFormat(responseFormat);
      let activeAbortController = new AbortController();
      const fetchCompletion = (
        nextResponseFormat: ChatCompletionResponseFormat | null,
      ) => withTimeout(
        fetch(resolveChatCompletionsUrl(providerSettings.apiBaseUrl), {
          method: "POST",
          signal: activeAbortController.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${providerSettings.apiKey}`,
          },
          body: JSON.stringify({
            model: providerSettings.model,
            messages,
            stream: true,
            temperature: 0.2,
            ...(nextResponseFormat === null
              ? {}
              : { response_format: nextResponseFormat }),
            tools: [],
            tool_choice: "none",
          }),
        }),
        responseTimeoutMs,
        () => activeAbortController.abort(),
      );
      let response = await fetchCompletion(requestResponseFormat);

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        if (
          isJsonSchemaResponseFormat(requestResponseFormat) &&
          shouldRetryJsonSchemaAsJsonObject(response.status, detail)
        ) {
          warnJsonSchemaFallback(providerSettings.model, response.status, detail);
          activeAbortController = new AbortController();
          response = await fetchCompletion({ type: "json_object" });
        } else {
          throw new Error(formatHttpLlmError(response.status, detail));
        }
      }

      for await (const text of withIdleTimeout(
        parseChatCompletionSse(response),
        responseTimeoutMs,
        () => activeAbortController.abort(),
      )) {
        yield text;
      }
    },
  };
}

export function createRealImageGenerationClient(
  options: RealProviderClientOptions = {},
): ImageGenerationClient {
  return {
    async generateImage({ providerSettings, prompt }: GenerateImageInput) {
      assertProviderBaseUrlAllowed(
        providerSettings.apiBaseUrl,
        options.baseUrlAllowlist,
      );
      const safePrompt = clampImagePrompt(prompt);
      const response = await fetch(resolveChatCompletionsUrl(providerSettings.apiBaseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${providerSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: providerSettings.model,
          messages: [{ role: "user", content: safePrompt }],
          stream: false,
        }),
      });

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(
          detail
            ? `Image request failed with HTTP ${response.status}: ${detail}`
            : `Image request failed with HTTP ${response.status}`,
        );
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        return { content };
      }
      if (content !== undefined && content !== null) {
        return { content: JSON.stringify(content) };
      }
      throw new Error("Image response did not include message content");
    },
  };
}

export { resolveChatCompletionsUrl };
