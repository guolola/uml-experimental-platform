// Owns shared LLM text collection and structured output parse diagnostics.
import { type ProviderSettings, type RunStage } from "@uml-platform/contracts";
import { type ChatCompletionResponseFormat, type ChatMessage, type LlmTransport } from "../../../llm.js";
import { formatParseError } from "../../../normalizers/json/parse-json.js";

const RAW_OUTPUT_LOG_LIMIT = 8000;

export type StructuredOutputFailureType =
  | "json_parse"
  | "model_schema"
  | "traceability_schema"
  | "traceability_ref"
  | "empty_selected_model"
  | "external_transport";

function truncateForLog(rawText: string) {
  if (rawText.length <= RAW_OUTPUT_LOG_LIMIT) return rawText;
  return `${rawText.slice(0, RAW_OUTPUT_LOG_LIMIT)}\n...[truncated ${rawText.length - RAW_OUTPUT_LOG_LIMIT} chars]`;
}

export function classifyStructuredOutputFailure(
  error: unknown,
  rawText = "",
): StructuredOutputFailureType {
  const message = formatParseError(error);
  const normalized = `${message}\n${rawText}`.toLowerCase();

  if (
    normalized.includes("fetch failed") ||
    /http\s+5\d\d/.test(normalized) ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("abort") ||
    normalized.includes("refusal") ||
    normalized.includes("refused")
  ) {
    return "external_transport";
  }

  if (
    error instanceof SyntaxError ||
    normalized.includes(" in json at position ") ||
    normalized.includes("unexpected token") ||
    normalized.includes("expected property name")
  ) {
    return "json_parse";
  }

  if (
    normalized.includes("must return at least one model") ||
    normalized.includes("returned no selected models")
  ) {
    return "empty_selected_model";
  }

  const mentionsTraceability =
    normalized.includes("traceability") ||
    normalized.includes("requirementmodeltraceability") ||
    normalized.includes("designmodeltraceability") ||
    normalized.includes('"target"') ||
    normalized.includes('"targets"') ||
    normalized.includes('"source"') ||
    /缺少\s+\d+\s+个(?:需求|设计)元素映射/.test(normalized);

  if (mentionsTraceability) {
    if (
      normalized.includes("invalid_type") ||
      normalized.includes("expected") ||
      normalized.includes("received") ||
      normalized.includes("schema") ||
      normalized.includes("modelid") ||
      normalized.includes("elementid") ||
      normalized.includes("diagramkind")
    ) {
      return "traceability_schema";
    }
    return "traceability_ref";
  }

  return "model_schema";
}

export function logFailedStructuredOutput(
  stage: RunStage,
  model: string,
  error: unknown,
  rawText: string,
  attempt?: number,
) {
  const header = [
    "[llm-structured-output-failed]",
    `stage=${stage}`,
    `model=${model}`,
    attempt ? `attempt=${attempt}` : null,
    `failureType=${classifyStructuredOutputFailure(error, rawText)}`,
    `error=${formatParseError(error)}`,
  ]
    .filter(Boolean)
    .join(" ");

  console.error(
    `${header}\n--- begin raw output ---\n${truncateForLog(rawText)}\n--- end raw output ---`,
  );
}

// LLM structured output repair loops depend on this throwing parse errors after logging raw output.
export async function collectStructuredResult<T>(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  stage: RunStage,
  onChunk: (chunk: string) => void,
  parse: (text: string) => T,
  responseFormat?: ChatCompletionResponseFormat | null,
  attempt?: number,
) {
  let content = "";
  for await (const chunk of llmTransport.streamChatCompletion({
    providerSettings,
    messages,
    responseFormat,
  })) {
    content += chunk;
    onChunk(chunk);
  }
  try {
    return parse(content);
  } catch (error) {
    logFailedStructuredOutput(
      stage,
      providerSettings.model,
      error,
      content,
      attempt,
    );
    throw error;
  }
}

export async function collectTextResult(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  responseFormat?: ChatCompletionResponseFormat | null,
) {
  let content = "";
  for await (const chunk of llmTransport.streamChatCompletion({
    providerSettings,
    messages,
    responseFormat,
  })) {
    content += chunk;
    onChunk(chunk);
  }
  return content;
}
