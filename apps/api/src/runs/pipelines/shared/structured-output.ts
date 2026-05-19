// Owns shared LLM text collection and structured output parse diagnostics.
import { type ProviderSettings, type RunStage } from "@uml-platform/contracts";
import { type ChatCompletionResponseFormat, type ChatMessage, type LlmTransport } from "../../../llm.js";
import { formatParseError } from "../../../normalizers/json/parse-json.js";

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
    `error=${formatParseError(error)}`,
  ]
    .filter(Boolean)
    .join(" ");

  console.error(
    `${header}\n--- begin raw output ---\n${rawText}\n--- end raw output ---`,
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
