import type { ProviderSettings } from "@uml-platform/contracts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

function resolveChatCompletionsUrl(baseUrl: string) {
  return new URL("/v1/chat/completions", baseUrl).toString();
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

export { resolveChatCompletionsUrl };
