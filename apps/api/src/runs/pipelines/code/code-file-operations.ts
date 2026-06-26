// Owns LLM generation and repair for structured prototype file operations.

import {
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  type CodeBusinessLogic,
  type DesignModelCoverageReport,
  type DesignToCodeMapping,
  type CodeRunSnapshot,
  type CodeSkillContext,
  type CodeSkillResourceDiscoveryPlan,
  type CodeSkillResourcePlan,
  type CodeSkillResourcePreviewResult,
  type CodeSkillSelection,
  type CodeUiBlueprint,
  type CodeVisualDirection,
  type LoadedCodeSkill,
  type ProviderSettings,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateCodeFileOperationsPrompt,
  buildRepairCodeFileOperationsPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../../llm.js";
import { getGenerateCodeFileOperationsResponseFormat } from "../../../adapters/llm/response-formats/index.js";
import { formatParseError } from "../../../normalizers/json/parse-json.js";
import { parseCodeFileOperationsResult } from "../../../normalizers/code/code-operation-normalizer.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import {
  isRunCancelled,
  RunCancelledError,
} from "../../records/run-cancellation.js";
import { addFileGenerationDiagnostic } from "./code-run-diagnostics.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { createMessages } from "../shared/llm-messages.js";
import { collectTextResult, logFailedStructuredOutput } from "../shared/structured-output.js";
import { appendCodeTrace } from "../shared/trace-events.js";
import { withModelTaskTimeout } from "../shared/model-task-timeout.js";

const MAX_CODE_OPERATION_REPAIR_ATTEMPTS = 2;
const DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TASK_MAX_RUNTIME_MS = 1_200_000;

export type CodeFileGenerationContext = {
  businessLogic?: CodeBusinessLogic | null;
  uiBlueprint?: CodeUiBlueprint | null;
  loadedCodeSkill?: LoadedCodeSkill | null;
  visualDirection?: CodeVisualDirection | null;
  skillResourceDiscoveryPlan?: CodeSkillResourceDiscoveryPlan | null;
  skillResourcePreviews?: CodeSkillResourcePreviewResult | null;
  skillResourcePlan?: CodeSkillResourcePlan | null;
  codeSkillContext?: CodeSkillContext | null;
  qualityIssues?: string[];
  selectedCodeSkills?: CodeSkillSelection[];
  codeSkillInstructions?: string;
  designToCodeMapping?: DesignToCodeMapping | null;
  designModelCoverageReport?: DesignModelCoverageReport | null;
};

function positiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readCodeModelTaskTimeoutConfig() {
  const globalIdleTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_TIMEOUT_MS,
    DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS,
  );
  const idleTimeoutMs = positiveIntegerEnv(
    process.env.UML_CODE_MODEL_TASK_TIMEOUT_MS,
    globalIdleTimeout,
  );
  const globalBlankOutputTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS),
  );
  const blankOutputTimeoutMs = positiveIntegerEnv(
    process.env.UML_CODE_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, globalBlankOutputTimeout),
  );
  const globalMaxRuntime = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_MAX_RUNTIME_MS,
    DEFAULT_MODEL_TASK_MAX_RUNTIME_MS,
  );
  const maxRuntimeMs = positiveIntegerEnv(
    process.env.UML_CODE_MODEL_TASK_MAX_RUNTIME_MS,
    globalMaxRuntime,
  );
  return { idleTimeoutMs, blankOutputTimeoutMs, maxRuntimeMs };
}

// Code file operation repair keeps the JSON operation wire shape stable across retries.
export async function generateCodeFileOperationsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  codeContext: unknown,
  existingFiles: Record<string, string>,
  generationContext?: CodeFileGenerationContext,
  stage: RunStage = "generate_code_files",
) {
  const snapshot = record.snapshot as CodeRunSnapshot;
  const timeoutConfig = readCodeModelTaskTimeoutConfig();
  const responseFormat = getGenerateCodeFileOperationsResponseFormat(
      providerSettings,
    );
  let prompt = buildGenerateCodeFileOperationsPrompt(
    codeContext,
    existingFiles,
    generationContext,
  );
  let previousOutput = "";
  let lastErrorMessage = "";
  snapshot.codeGenerationMode = "json_schema_operations";
  snapshot.codeImplementationBrief = null;
  snapshot.codeFileOperationManifest = null;

  for (
    let attempt = 0;
    attempt <= MAX_CODE_OPERATION_REPAIR_ATTEMPTS;
    attempt += 1
  ) {
    const content = await withModelTaskTimeout(
      (markActivity, markBlankActivity, abortSignal) =>
        collectTextResult(
          llmTransport,
          providerSettings,
          createMessages(prompt),
          (chunk) => {
            if (chunk.trim()) {
              markActivity();
            } else {
              markBlankActivity();
            }
            emitEvent(
              record,
              llmChunkRunEventSchema.parse({
                type: "llm_chunk",
                stage,
                chunk,
              }),
            );
          },
          responseFormat,
          abortSignal,
        ),
      {
        ...timeoutConfig,
        label: `代码文件操作生成 ${stage}`,
        isCancelled: () => isRunCancelled(record),
        createCancelError: () => new RunCancelledError(snapshot.runId),
      },
    );
    previousOutput = content;
    appendCodeTrace(record, {
      stage: "generate_file_operations",
      attempt: attempt + 1,
      kind: attempt === 0 ? "llm_output" : "repair_output",
      rawOutput: content,
    });

    try {
      const result = parseCodeFileOperationsResult(content);
      appendCodeTrace(record, {
        stage: "generate_file_operations",
        attempt: attempt + 1,
        kind: attempt === 0 ? "parsed_data" : "repaired_data",
        parsedData: result,
      });
      addFileGenerationDiagnostic(snapshot, {
        stage: "file_operations",
        status: attempt === 0 ? "completed" : "repaired",
        message: `已生成 ${result.operations.length} 个代码文件操作`,
      });
      return result;
    } catch (error) {
      logFailedStructuredOutput(
        "write_code_files",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendCodeTrace(record, {
        stage: "generate_file_operations",
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: content,
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_CODE_OPERATION_REPAIR_ATTEMPTS) {
        addFileGenerationDiagnostic(snapshot, {
          stage: "file_operations",
          status: "failed",
          message: lastErrorMessage,
        });
        throw new Error(
          `write_code_files structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "repair_code_files",
          progress: stageProgressValue("repair_code_files"),
          message: `代码文件操作 JSON 结构不合法，正在修复（${attempt + 1}/${MAX_CODE_OPERATION_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairCodeFileOperationsPrompt(
        codeContext,
        existingFiles,
        previousOutput,
        lastErrorMessage,
        generationContext,
      );
    }
  }

  throw new Error(
    `write_code_files structured output failed: ${lastErrorMessage}`,
  );
}
