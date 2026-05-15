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
  responseFormat?: ChatCompletionResponseFormat;
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

const IMAGE_PROMPT_CHAR_LIMIT = 24000;

function resolveChatCompletionsUrl(baseUrl: string) {
  return new URL("/v1/chat/completions", baseUrl).toString();
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

export function createRealLlmTransport(): LlmTransport {
  return {
    async *streamChatCompletion({
      providerSettings,
      messages,
      responseFormat,
    }: StreamChatCompletionInput) {
      const response = await fetch(resolveChatCompletionsUrl(providerSettings.apiBaseUrl), {
        method: "POST",
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
          response_format: responseFormat ?? { type: "json_object" },
          tools: [],
          tool_choice: "none",
        }),
      });

      for await (const text of parseChatCompletionSse(response)) {
        yield text;
      }
    },
  };
}

export function createRealImageGenerationClient(): ImageGenerationClient {
  return {
    async generateImage({ providerSettings, prompt }: GenerateImageInput) {
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
