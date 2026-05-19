// Orchestrates document text, diagram image rendering, and DOCX export for document runs.

import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  documentContentResultSchema,
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type DocumentRunSnapshot,
  type ProviderSettings,
  type StartDocumentRunRequest,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateDocumentContentPrompt,
  buildRepairDocumentContentPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../llm.js";
import { type PngRenderClient } from "../../adapters/render/png-render-client.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import {
  buildDocumentContext,
  diagramPlantUmlForDocument,
  diagramSvgKindsForDocument,
  ensureDocumentDiagramSections,
  fallbackDocumentSections,
  sanitizeDocumentSections,
} from "../../documents/context/document-context.js";
import { renderDocumentBuffer } from "../../documents/render/document-renderer.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import {
  collectTextResult,
  logFailedStructuredOutput,
} from "./shared/structured-output.js";

const MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS = 2;

// LLM structured output repair keeps the document sections wire shape stable across retries.
async function generateDocumentSectionsWithRepair(
  record: RunRecord,
  input: StartDocumentRunRequest,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
) {
  const context = buildDocumentContext(input);
  let prompt = buildGenerateDocumentContentPrompt(input.documentKind, context);
  let previousOutput = "";
  let lastErrorMessage = "";

  for (
    let attempt = 0;
    attempt <= MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS;
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
            stage: "generate_document_text",
            chunk,
          }),
        );
      },
    );
    previousOutput = content;

    try {
      return documentContentResultSchema.parse(parseJson(content)).sections;
    } catch (error) {
      logFailedStructuredOutput(
        "generate_document_text",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);

      if (attempt === MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS) {
        throw new Error(
          `generate_document_text structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_document_text",
          progress: stageProgressValue("generate_document_text"),
          message: `说明书正文 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDocumentContentPrompt(
        input.documentKind,
        context,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(
    `generate_document_text structured output failed: ${lastErrorMessage}`,
  );
}

// DOCX assembly boundary: this pipeline prepares sections, render buffers, then emits document artifacts.
export async function runDocumentStagePipeline(
  record: RunRecord,
  input: StartDocumentRunRequest,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  pngRenderClient: PngRenderClient,
) {
  const snapshot = record.snapshot as DocumentRunSnapshot;
  const updateStage = (stage: RunStage, message?: string) => {
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  updateStage("generate_document_text", "正在生成说明书正文");
  let sections = fallbackDocumentSections(input);
  if (input.useAiText) {
    sections = await generateDocumentSectionsWithRepair(
      record,
      input,
      providerSettings,
      llmTransport,
    );
  }
  sections = ensureDocumentDiagramSections(input.documentKind, sections);
  sections = sanitizeDocumentSections(input, sections);
  snapshot.sections = sections;

  updateStage("render_document_file", "正在写入说明书文件");
  const missingArtifacts: string[] = [];
  const buffer = await renderDocumentBuffer(
    input.documentKind,
    sections,
    diagramPlantUmlForDocument(input),
    diagramSvgKindsForDocument(input),
    pngRenderClient,
    missingArtifacts,
    input.documentStyle,
  );
  record.documentBuffer = buffer;
  snapshot.missingArtifacts = [...new Set(missingArtifacts)];
  snapshot.byteLength = buffer.byteLength;
  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_document_file",
      artifactKind: "document",
    }),
  );
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}
