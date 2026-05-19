// Owns LLM generation and repair for structured prototype file operations.

import {
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  type CodeBusinessLogic,
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
import { addFileGenerationDiagnostic } from "./code-run-diagnostics.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { createMessages } from "../shared/llm-messages.js";
import { collectTextResult, logFailedStructuredOutput } from "../shared/structured-output.js";
import { appendCodeTrace } from "../shared/trace-events.js";

const MAX_CODE_OPERATION_REPAIR_ATTEMPTS = 2;

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
};

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
  const responseFormat = getGenerateCodeFileOperationsResponseFormat(
    providerSettings.model,
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
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      (chunk) => {
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
