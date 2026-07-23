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
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { type PngRenderClient } from "../../adapters/render/png-render-client.js";
import { getDocumentContentResponseFormat } from "../../adapters/llm/response-formats/index.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import {
  buildDocumentContext,
  diagramPlantUmlForDocument,
  diagramSvgKindsForDocument,
  ensureDocumentDiagramSections,
  fallbackDocumentSections,
  findForbiddenDocumentPhrases,
  mergeDocumentSectionsWithTemplate,
  sanitizeDocumentSections,
} from "../../documents/context/document-context.js";
import { renderDocumentBuffer } from "../../documents/render/document-renderer.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { attachEvidencePackage } from "../evidence/evidence-package.js";
import { assertRequirementBaselineAllowsDownstream } from "../baselines/requirement-baseline.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import {
  collectTextResult,
  logFailedStructuredOutput,
} from "./shared/structured-output.js";

const MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS = 2;

function normalizeDocumentContentOutput(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const record = raw as { sections?: unknown };
  if (!Array.isArray(record.sections)) return raw;
  return {
    ...record,
    sections: record.sections.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        return section;
      }
      const next = { ...(section as Record<string, unknown>) };
      if (next.table === null) delete next.table;
      if (next.diagramKind === null) delete next.diagramKind;
      return next;
    }),
  };
}

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
  const responseFormat = getDocumentContentResponseFormat(providerSettings);

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
      responseFormat,
    );
    previousOutput = content;

    try {
      const sections = documentContentResultSchema.parse(
        normalizeDocumentContentOutput(parseJson(content)),
      ).sections;
      const forbiddenPhrases = findForbiddenDocumentPhrases(sections);
      if (forbiddenPhrases.length === 0) {
        return sections;
      }

      lastErrorMessage = `说明书正文包含禁用占位或跳转话术：${forbiddenPhrases.join("、")}`;
      if (attempt === MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS) {
        return sections;
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_document_text",
          progress: stageProgressValue("generate_document_text"),
          message: `说明书正文包含占位或跳转话术，正在尝试改写（${attempt + 1}/${MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDocumentContentPrompt(
        input.documentKind,
        context,
        previousOutput,
        lastErrorMessage,
      );
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
  documentLibrary: DocumentLibrary,
  workspaceId: string,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  pngRenderClient: PngRenderClient,
) {
  const snapshot = record.snapshot as DocumentRunSnapshot;
  snapshot.feasibilityImplementationPlan = input.feasibilityImplementationPlan;
  snapshot.feasibilityInputs = input.feasibilityInputs;
  assertRequirementBaselineAllowsDownstream(snapshot.requirementBaseline);
  const updateStage = (stage: RunStage, message?: string) => {
    throwIfRunCancelled(record);
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

  throwIfRunCancelled(record);
  updateStage("generate_document_text", "正在生成说明书正文");
  let sections = fallbackDocumentSections(input);
  if (input.useAiText && input.documentKind !== "feasibilityStudy") {
    const generatedSections = await generateDocumentSectionsWithRepair(
      record,
      input,
      providerSettings,
      llmTransport,
    );
    throwIfRunCancelled(record);
    sections = mergeDocumentSectionsWithTemplate(sections, generatedSections);
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
    input.feasibilityInputs,
  );
  throwIfRunCancelled(record);
  record.documentBuffer = buffer;
  const document = await documentLibrary.saveGeneratedDocument({
    workspaceId,
    projectId: record.metadata?.projectId ?? null,
    createdByUserId: record.metadata?.userId ?? null,
    documentKind: input.documentKind,
    sourceRunId: snapshot.runId,
    fileName: snapshot.fileName ?? `${input.documentKind}.docx`,
    mimeType: snapshot.mimeType,
    buffer,
  });
  throwIfRunCancelled(record);
  snapshot.documentId = document.id;
  snapshot.fileName = document.fileName;
  snapshot.mimeType = document.mimeType;
  snapshot.missingArtifacts = [...new Set(missingArtifacts)];
  snapshot.byteLength = buffer.byteLength;
  const evidencePackage = attachEvidencePackage(snapshot);
  throwIfRunCancelled(record);
  snapshot.status = "completed";
  snapshot.error = null;
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
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_document_file",
      artifactKind: "evidencePackage",
      evidencePackage,
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
