// Orchestrates design-model generation, PlantUML, and SVG rendering for design runs.

import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  diagramErrorSchema,
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignModelTraceabilityEntry,
  type DesignPlantUmlArtifact,
  type DesignRunSnapshot,
  type DesignSvgArtifact,
  type DiagramError,
  type DiagramKind,
  type DiagramModelSpec,
  type ModelElementRef,
  type ProviderSettings,
  type RequirementRule,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateDesignTraceabilityPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateDesignSequencePrompt,
  buildRepairDesignTraceabilityPrompt,
  buildRepairDesignModelsPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../llm.js";
import { type RenderClient } from "../../adapters/render/render-client.js";
import {
  getGenerateDesignModelsResponseFormat,
  getGenerateDesignTraceabilityResponseFormat,
} from "../../adapters/llm/response-formats/index.js";
import { generateDesignPlantUmlArtifacts } from "../../plantuml.js";
import {
  parseDesignDiagramModelsOnly,
  parseDesignDiagramModelsResult,
  parseDesignTraceabilityCoverageForSources,
} from "../../normalizers/design/design-model-normalizer.js";
import {
  collectModelRefs,
  deriveDesignRelationshipTraceability,
  formatTraceabilityMissingRefs,
  mergeDesignTraceability,
  normalizeDesignTraceabilityForSources,
  normalizeDesignTraceabilityWithCoverage,
} from "../../normalizers/traceability/traceability-normalizer.js";
import { formatParseError } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { attachEvidencePackage } from "../evidence/evidence-package.js";
import { renderArtifactWithRepair } from "./render/render-artifact-with-repair.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import {
  assertRequirementBaselineAllowsDownstream,
  buildRequirementBaseline,
} from "../baselines/requirement-baseline.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import { appendDesignTrace } from "./shared/trace-events.js";
import {
  assertTrustedChainAllowsCompletion,
  buildDesignStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const MAX_MODEL_REPAIR_ATTEMPTS = 2;
const DESIGN_TRACEABILITY_BATCH_SIZE = 24;
const DESIGN_SEQUENCE_CONCURRENCY = 2;
const LLM_CHUNK_EVENT_LIMIT = 240;
const LLM_CHUNK_CHAR_LIMIT = 24000;
const TRACE_RAW_OUTPUT_LIMIT = 20000;

function compactText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function autoFillDesignTraceability(
  missingSources: ModelElementRef[],
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const requirementRefs = collectModelRefs(requirementModels).refs;
  if (requirementRefs.length === 0) return [];

  const firstUseCaseRef =
    requirementRefs.find((ref) => ref.diagramKind === "usecase") ??
    requirementRefs[0];
  const byElementId = new Map(
    requirementRefs.map((ref) => [ref.elementId.toLowerCase(), ref]),
  );
  const designByModelId = new Map(
    designModels
      .map((model) => [
        compactText((model as unknown as Record<string, unknown>).modelId),
        model,
      ] as const)
      .filter(([modelId]) => modelId),
  );

  return missingSources.flatMap((source): DesignModelTraceabilityEntry[] => {
    const sourceModel = source.modelId ? designByModelId.get(source.modelId) : undefined;
    const sourceUseCaseId = compactText(
      (sourceModel as unknown as Record<string, unknown> | undefined)
        ?.sourceUseCaseId,
    );
    const directUseCaseTarget = sourceUseCaseId
      ? byElementId.get(sourceUseCaseId.toLowerCase())
      : undefined;
    const labelTarget = requirementRefs.find((ref) => {
      const sourceLabel = source.label.toLowerCase();
      return (
        sourceLabel.includes(ref.label.toLowerCase()) ||
        ref.label.toLowerCase().includes(sourceLabel)
      );
    });
    const target = directUseCaseTarget ?? labelTarget ?? firstUseCaseRef;
    if (!target) return [];
    return [
      {
        source,
        targets: [target],
        mappingSource: "auto-filled-pending-review",
        reviewStatus: "pending",
        confidence: "low",
        rationale:
          "LLM 修复后仍缺少该设计元素映射，系统按顺序图用例或最接近的需求元素自动补齐。",
      },
    ];
  });
}

function truncateTraceRawOutput(rawOutput: string) {
  if (rawOutput.length <= TRACE_RAW_OUTPUT_LIMIT) return rawOutput;
  return `${rawOutput.slice(0, TRACE_RAW_OUTPUT_LIMIT)}\n...[truncated ${rawOutput.length - TRACE_RAW_OUTPUT_LIMIT} chars]`;
}

function createLimitedLlmChunkEmitter(record: RunRecord, stage: RunStage) {
  let emittedChunks = 0;
  let emittedChars = 0;
  let truncationNotified = false;

  return (chunk: string) => {
    if (
      emittedChunks >= LLM_CHUNK_EVENT_LIMIT ||
      emittedChars >= LLM_CHUNK_CHAR_LIMIT
    ) {
      if (!truncationNotified) {
        truncationNotified = true;
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage,
            progress: stageProgressValue(stage),
            message: "模型流式输出较长，技术日志已折叠，后台继续解析完整结果",
          }),
        );
      }
      return;
    }
    emittedChunks += 1;
    emittedChars += chunk.length;
    emitEvent(
      record,
      llmChunkRunEventSchema.parse({
        type: "llm_chunk",
        stage,
        chunk,
      }),
    );
  };
}

function useCasesFromModel(useCaseModel: DiagramModelSpec) {
  return useCaseModel.diagramKind === "usecase" ? useCaseModel.useCases : [];
}

function useCaseModelForSingleUseCase(
  useCaseModel: DiagramModelSpec,
  sourceUseCaseId: string,
) {
  if (useCaseModel.diagramKind !== "usecase") return useCaseModel;
  const useCase = useCaseModel.useCases.find((item) => item.id === sourceUseCaseId);
  if (!useCase) return useCaseModel;
  return {
    ...useCaseModel,
    useCases: [useCase],
    relationships: useCaseModel.relationships.filter(
      (relationship) =>
        relationship.sourceId === sourceUseCaseId ||
        relationship.targetId === sourceUseCaseId,
    ),
  };
}

function validateUseCaseSequenceCoverage(
  sequenceModels: Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }>[],
  useCaseModel: DiagramModelSpec,
) {
  const useCases = useCasesFromModel(useCaseModel);
  const covered = new Set(sequenceModels.map((model) => model.sourceUseCaseId));
  const missing = useCases.filter((useCase) => !covered.has(useCase.id));
  if (sequenceModels.length !== useCases.length || missing.length > 0) {
    const preview = missing
      .slice(0, 8)
      .map((useCase) => `${useCase.id}:${useCase.name}`)
      .join("、");
    throw new Error(
      `设计顺序图生成结果必须为每个用例生成一个独立顺序图；缺少 ${missing.length} 个用例顺序图：${preview}`,
    );
  }
}

async function generateDesignTraceabilityWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  stage: RunStage,
) {
  const allRequiredSources =
    normalizeDesignTraceabilityWithCoverage([], designModels, requirementModels)
      .missingSources;
  const directSources = allRequiredSources.filter(
    (source) => source.elementKind !== "relationship",
  );
  const relationshipSources = allRequiredSources.filter(
    (source) => source.elementKind === "relationship",
  );
  let accumulatedTraceability: DesignModelTraceabilityEntry[] = [];
  const directBatches = chunkArray(directSources, DESIGN_TRACEABILITY_BATCH_SIZE);

  for (const [batchIndex, batchSources] of directBatches.entries()) {
    const batchTraceability = await generateDesignTraceabilityBatchWithRepair(
      record,
      providerSettings,
      llmTransport,
      requirementText,
      rules,
      requirementModels,
      designModels,
      batchSources,
      stage,
      batchIndex + 1,
      directBatches.length,
    );
    accumulatedTraceability = mergeDesignTraceability(
      accumulatedTraceability,
      batchTraceability,
    );
  }

  accumulatedTraceability = deriveDesignRelationshipTraceability(
    accumulatedTraceability,
    designModels,
  );

  const afterDerivedCoverage = normalizeDesignTraceabilityWithCoverage(
    accumulatedTraceability,
    designModels,
    requirementModels,
  );
  accumulatedTraceability = afterDerivedCoverage.traceability;
  const remainingRelationshipSources = afterDerivedCoverage.missingSources.filter(
    (source) =>
      source.elementKind === "relationship" ||
      relationshipSources.some(
        (relationship) =>
          relationship.diagramKind === source.diagramKind &&
          relationship.elementId === source.elementId,
      ),
  );

  const relationshipBatches = chunkArray(
    remainingRelationshipSources,
    DESIGN_TRACEABILITY_BATCH_SIZE,
  );
  for (const [batchIndex, batchSources] of relationshipBatches.entries()) {
    const batchTraceability = await generateDesignTraceabilityBatchWithRepair(
      record,
      providerSettings,
      llmTransport,
      requirementText,
      rules,
      requirementModels,
      designModels,
      batchSources,
      stage,
      batchIndex + 1,
      relationshipBatches.length,
    );
    accumulatedTraceability = mergeDesignTraceability(
      accumulatedTraceability,
      batchTraceability,
    );
  }

  accumulatedTraceability = deriveDesignRelationshipTraceability(
    accumulatedTraceability,
    designModels,
  );
  const finalCoverage = normalizeDesignTraceabilityWithCoverage(
    accumulatedTraceability,
    designModels,
    requirementModels,
  );
  const recoveredFinalTraceability =
    finalCoverage.traceability.length > 0 && finalCoverage.missingSources.length > 0
      ? mergeDesignTraceability(
          finalCoverage.traceability,
          autoFillDesignTraceability(
            finalCoverage.missingSources,
            designModels,
            requirementModels,
          ),
        )
      : finalCoverage.traceability;
  const recoveredFinalCoverage = normalizeDesignTraceabilityWithCoverage(
    recoveredFinalTraceability,
    designModels,
    requirementModels,
  );
  if (recoveredFinalCoverage.traceability.length === 0) {
    throw new Error(
      "design traceability structured output failed: generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  if (recoveredFinalCoverage.missingSources.length > 0) {
    throw new Error(
      `design traceability structured output failed: ${formatTraceabilityMissingRefs(
        "design",
        recoveredFinalCoverage.missingSources,
      )}`,
    );
  }
  if (finalCoverage.missingSources.length > 0) {
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message: `已自动补齐 ${finalCoverage.missingSources.length} 个设计模型元素映射`,
      }),
    );
  }

  appendDesignTrace(record, {
    stage:
      stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models",
    attempt: 1,
    kind: "parsed_model",
    parsedData: {
      models: designModels,
      designModelTraceability: recoveredFinalCoverage.traceability,
    },
  });
  return recoveredFinalCoverage.traceability;
}

async function generateDesignTraceabilityBatchWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  requiredSources: ModelElementRef[],
  stage: RunStage,
  batchIndex: number,
  totalBatches: number,
) {
  if (requiredSources.length === 0) return [];
  const responseFormat = getGenerateDesignTraceabilityResponseFormat(
    providerSettings.model,
  );
  let prompt = buildGenerateDesignTraceabilityPrompt(
    requirementText,
    rules,
    requirementModels,
    designModels,
    requiredSources,
  );
  let previousOutput = "";
  let lastErrorMessage = "";
  let accumulatedTraceability: DesignModelTraceabilityEntry[] = [];
  let missingSources: ModelElementRef[] = requiredSources;
  const traceStage =
    stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const emitLimitedChunk = createLimitedLlmChunkEmitter(record, stage);
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      emitLimitedChunk,
      responseFormat,
    );
    previousOutput = content;
    appendDesignTrace(record, {
      stage: traceStage,
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: truncateTraceRawOutput(content),
    });

    try {
      const parsed = parseDesignTraceabilityCoverageForSources(
        content,
        missingSources,
        requirementModels,
      );
      accumulatedTraceability = mergeDesignTraceability(
        accumulatedTraceability,
        parsed.traceability,
      );
      const coverage = normalizeDesignTraceabilityForSources(
        accumulatedTraceability,
        requiredSources,
        requirementModels,
      );
      accumulatedTraceability = coverage.traceability;
      missingSources = coverage.missingSources;
      if (accumulatedTraceability.length === 0) {
        throw new Error(
          "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
        );
      }
      if (missingSources.length > 0) {
        throw new Error(
          `第 ${batchIndex}/${totalBatches} 批${formatTraceabilityMissingRefs(
            "design",
            missingSources,
          )}`,
        );
      }
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: {
          models: designModels,
          designModelTraceability: accumulatedTraceability,
        },
      });
      return accumulatedTraceability;
    } catch (error) {
      logFailedStructuredOutput(
        stage,
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: truncateTraceRawOutput(content),
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        if (accumulatedTraceability.length === 0) {
          throw new Error(
            `design traceability structured output failed: ${lastErrorMessage}`,
          );
        }
        const recoveredTraceability = mergeDesignTraceability(
          accumulatedTraceability,
          autoFillDesignTraceability(
            missingSources,
            designModels,
            requirementModels,
          ),
        );
        const recoveredCoverage = normalizeDesignTraceabilityForSources(
          recoveredTraceability,
          requiredSources,
          requirementModels,
        );
        if (
          recoveredCoverage.traceability.length > 0 &&
          recoveredCoverage.missingSources.length === 0
        ) {
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage,
              progress: stageProgressValue(stage),
              message: `已自动补齐第 ${batchIndex}/${totalBatches} 批 ${missingSources.length} 个设计模型元素映射`,
            }),
          );
          appendDesignTrace(record, {
            stage: traceStage,
            attempt: attempt + 1,
            kind: "parsed_model",
            parsedData: {
              models: designModels,
              designModelTraceability: recoveredCoverage.traceability,
            },
          });
          return recoveredCoverage.traceability;
        }
        throw new Error(
          `design traceability structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage,
          progress: stageProgressValue(stage),
          message: `设计模型元素映射不合法，正在修复第 ${batchIndex}/${totalBatches} 批可追踪关系（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDesignTraceabilityPrompt(
        requirementText,
        rules,
        requirementModels,
        designModels,
        previousOutput,
        lastErrorMessage,
        missingSources,
      );
    }
  }

  throw new Error(
    `design traceability structured output failed: ${lastErrorMessage}`,
  );
}

// LLM structured output repair retries malformed design models while preserving trace schema.
export async function generateDesignModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  selectedDiagrams: DesignDiagramKind[],
  initialPrompt: string,
  stage: RunStage,
) {
  const responseFormat = getGenerateDesignModelsResponseFormat(providerSettings.model);
  let prompt = initialPrompt;
  let previousOutput = "";
  let lastErrorMessage = "";
  const traceStage =
    stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const emitLimitedChunk = createLimitedLlmChunkEmitter(record, stage);
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      emitLimitedChunk,
      responseFormat,
    );
    previousOutput = content;
    appendDesignTrace(record, {
      stage: traceStage,
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: truncateTraceRawOutput(content),
    });

    try {
      const parsed = parseDesignDiagramModelsResult(content, requirementModels);
      const filteredModels = parsed.models.filter((model) =>
        selectedDiagrams.includes(model.diagramKind),
      );
      const filteredDiagramKinds = new Set(filteredModels.map((model) => model.diagramKind));
      let filteredTraceability = parsed.designModelTraceability.filter((entry) =>
        filteredDiagramKinds.has(entry.source.diagramKind as DesignDiagramKind),
      );
      if (filteredModels.length > 0 && filteredTraceability.length === 0) {
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage,
            progress: stageProgressValue(stage),
            message: "设计模型元素映射缺失，正在单独生成可追踪关系",
          }),
        );
        filteredTraceability = await generateDesignTraceabilityWithRepair(
          record,
          providerSettings,
          llmTransport,
          requirementText,
          rules,
          requirementModels,
          filteredModels,
          stage,
        );
      }
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: {
          models: filteredModels,
          designModelTraceability: filteredTraceability,
        },
      });
      return {
        models: filteredModels,
        designModelTraceability: filteredTraceability,
      };
    } catch (error) {
      const modelOnly = (() => {
        try {
          return parseDesignDiagramModelsOnly(content);
        } catch {
          return null;
        }
      })();
      if (modelOnly) {
        const filteredModels = modelOnly.models.filter((model) =>
          selectedDiagrams.includes(model.diagramKind),
        );
        lastErrorMessage = formatParseError(error);
        appendDesignTrace(record, {
          stage: traceStage,
          attempt: attempt + 1,
          kind: "parse_error",
          rawOutput: truncateTraceRawOutput(content),
          errorMessage: lastErrorMessage,
        });
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage,
            progress: stageProgressValue(stage),
            message: "设计模型元素映射缺失，正在单独生成可追踪关系",
          }),
        );
        const designModelTraceability = await generateDesignTraceabilityWithRepair(
          record,
          providerSettings,
          llmTransport,
          requirementText,
          rules,
          requirementModels,
          filteredModels,
          stage,
        );
        return {
          models: filteredModels,
          designModelTraceability,
        };
      }

      logFailedStructuredOutput(
        stage,
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: truncateTraceRawOutput(content),
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        throw new Error(
          `${stage} structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage,
          progress: stageProgressValue(stage),
          message: `设计模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDesignModelsPrompt(
        requirementText,
        rules,
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(`${stage} structured output failed: ${lastErrorMessage}`);
}

export function findRequirementModel(
  models: DiagramModelSpec[],
  diagramKind: DiagramKind,
) {
  return models.find((model) => model.diagramKind === diagramKind);
}

function getDesignModelId(model: Pick<DesignDiagramModelSpec, "diagramKind" | "modelId">) {
  return model.modelId ?? model.diagramKind;
}

function mergeDesignModels(
  existing: DesignDiagramModelSpec[],
  incoming: DesignDiagramModelSpec[],
) {
  const merged = new Map(existing.map((model) => [getDesignModelId(model), model]));
  for (const model of incoming) {
    merged.set(getDesignModelId(model), model);
  }
  return [...merged.values()];
}

function findDesignModelForArtifact(
  models: DesignDiagramModelSpec[],
  artifact: Pick<DesignPlantUmlArtifact, "diagramKind" | "modelId">,
) {
  const artifactId = artifact.modelId ?? artifact.diagramKind;
  return models.find((model) => getDesignModelId(model) === artifactId);
}

function existingSequenceModelsForUseCases(
  models: DesignDiagramModelSpec[],
  useCaseModel: DiagramModelSpec,
) {
  const sequences = models.filter(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
      model.diagramKind === "sequence",
  );
  try {
    validateUseCaseSequenceCoverage(sequences, useCaseModel);
    return sequences;
  } catch {
    return [];
  }
}

export function sourceRequirementKindForDesign(
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
): DiagramKind {
  switch (diagramKind) {
    case "activity":
      return "activity";
    case "class":
      return "class";
    case "deployment":
      return "deployment";
    case "table":
      return "class";
  }
}

// route -> pipeline -> record store contract: design runs update their snapshot and emit compatible SSE events.
export async function runDesignStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as DesignRunSnapshot;
  throwIfRunCancelled(record);
  if (!snapshot.requirementBaseline && snapshot.rules.length > 0) {
    snapshot.requirementBaseline = buildRequirementBaseline({
      runId: snapshot.runId,
      requirementText: snapshot.requirementText,
      rules: snapshot.rules,
    });
  }
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

  let models: DesignDiagramModelSpec[] = [...snapshot.models];
  let designModelTraceability: DesignRunSnapshot["designModelTraceability"] = [
    ...snapshot.designModelTraceability,
  ];
  let diagramErrors: Partial<Record<DesignDiagramKind, DiagramError>> = {};
  const publishDesignModelSnapshot = () => {
    snapshot.models = models;
    snapshot.designModelTraceability = designModelTraceability;
    snapshot.diagramErrors = diagramErrors;
  };
  const useCaseModel = findRequirementModel(snapshot.requirementModels, "usecase");
  if (!useCaseModel) {
    throw new Error("缺少需求阶段用例模型，无法生成设计阶段顺序图");
  }

  let sequenceModels = existingSequenceModelsForUseCases(models, useCaseModel);
  const selectedDesignDiagrams = new Set(snapshot.selectedDiagrams);
  const shouldGenerateSequence = selectedDesignDiagrams.has("sequence");
  const selectedDownstreamDiagrams = snapshot.selectedDiagrams.filter(
    (diagram): diagram is Exclude<DesignDiagramKind, "sequence"> =>
      diagram !== "sequence",
  );

  if (shouldGenerateSequence) {
    updateStage("generate_design_sequence", "正在生成设计顺序图");
    const sequenceResults = await mapWithConcurrency(
      useCasesFromModel(useCaseModel),
      DESIGN_SEQUENCE_CONCURRENCY,
      async (useCase) => {
        throwIfRunCancelled(record);
        const scopedUseCaseModel = useCaseModelForSingleUseCase(
          useCaseModel,
          useCase.id,
        );
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_design_sequence",
            progress: stageProgressValue("generate_design_sequence"),
            message: `正在生成顺序图：${useCase.name}`,
            diagramKind: "sequence",
            modelId: `sequence:${useCase.id}`,
            subtaskId: `sequence:${useCase.id}`,
            subtaskLabel: `顺序图：${useCase.name}`,
            subtaskStatus: "running",
          }),
        );
        try {
          const result = await generateDesignModelsWithRepair(
            record,
            providerSettings,
            llmTransport,
            snapshot.requirementText,
            snapshot.rules,
            [scopedUseCaseModel],
            ["sequence"],
            buildGenerateDesignSequencePrompt(
              snapshot.requirementText,
              snapshot.rules,
              scopedUseCaseModel,
            ),
            "generate_design_sequence",
          );
          const modelId = `sequence:${useCase.id}`;
          models = mergeDesignModels(models, result.models);
          designModelTraceability = [
            ...designModelTraceability.filter(
              (entry) => entry.source.modelId !== modelId,
            ),
            ...result.designModelTraceability,
          ];
          delete diagramErrors.sequence;
          publishDesignModelSnapshot();
          emitEvent(
            record,
            artifactReadyRunEventSchema.parse({
              type: "artifact_ready",
              stage: "generate_design_sequence",
              artifactKind: "model",
              diagramKind: "sequence",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `顺序图：${useCase.name}`,
              subtaskStatus: "running",
            }),
          );
          return result;
        } catch (error) {
          throwIfRunCancelled(record);
          const modelId = `sequence:${useCase.id}`;
          const message =
            error instanceof Error ? error.message : `${useCase.name}顺序图生成失败`;
          diagramErrors.sequence = diagramErrorSchema.parse({
            stage: "generate_design_sequence",
            message,
          });
          publishDesignModelSnapshot();
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_design_sequence",
              progress: stageProgressValue("generate_design_sequence"),
              message,
              diagramKind: "sequence",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `顺序图：${useCase.name}`,
              subtaskStatus: "failed",
            }),
          );
          return null;
        }
      },
    );
    throwIfRunCancelled(record);
    sequenceModels = sequenceResults.flatMap((result) => result?.models ?? []).filter(
      (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
        model.diagramKind === "sequence",
    );
    if (sequenceModels.length === 0) {
      throw new Error("设计顺序图生成结果缺少 sequence 模型");
    }
    validateUseCaseSequenceCoverage(sequenceModels, useCaseModel);
    models = mergeDesignModels(models, sequenceModels);
    designModelTraceability = [
      ...designModelTraceability.filter(
        (entry) => entry.source.diagramKind !== "sequence",
      ),
      ...sequenceResults.flatMap((result) => result?.designModelTraceability ?? []),
    ];
  } else if (selectedDownstreamDiagrams.length > 0 && sequenceModels.length === 0) {
    throw new Error("缺少设计顺序图，无法生成所选设计模型；请先生成顺序图或在本次请求中包含顺序图");
  }
  publishDesignModelSnapshot();
  if (shouldGenerateSequence) {
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_design_sequence",
        artifactKind: "model",
        diagramKind: "sequence",
        subtaskId: "sequence",
        subtaskStatus: "running",
      }),
    );
  }

  const requestedDownstream = selectedDownstreamDiagrams;
  if (
    requestedDownstream.includes("table") &&
    !selectedDesignDiagrams.has("class") &&
    !models.some((model) => model.diagramKind === "class")
  ) {
    throw new Error("缺少设计类图，无法生成表关系图；请先生成设计类图或在本次请求中包含设计类图");
  }
  const downstreamWithSources = requestedDownstream.filter((diagram) => {
    const sourceKind = sourceRequirementKindForDesign(diagram);
    if (findRequirementModel(snapshot.requirementModels, sourceKind)) {
      return true;
    }
    diagramErrors[diagram] = diagramErrorSchema.parse({
      stage: "generate_design_models",
      message: `缺少需求阶段${sourceKind}模型，无法生成对应设计图`,
    });
    return false;
  });

  if (downstreamWithSources.length > 0) {
    updateStage("generate_design_models", "正在生成设计阶段结构化模型");
    const generateDownstreamDiagram = async (
      diagram: Exclude<DesignDiagramKind, "sequence">,
      designContextModels: DesignDiagramModelSpec[] = [],
    ) => {
      throwIfRunCancelled(record);
      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_design_models",
          progress: stageProgressValue("generate_design_models"),
          message: `正在生成：${diagram}`,
          diagramKind: diagram,
          subtaskId: diagram,
          subtaskStatus: "running",
        }),
      );
      const sourceModels = [
        findRequirementModel(
          snapshot.requirementModels,
          sourceRequirementKindForDesign(diagram),
        ),
      ].filter((model): model is DiagramModelSpec => Boolean(model));
      try {
        const result = await generateDesignModelsWithRepair(
          record,
          providerSettings,
          llmTransport,
          snapshot.requirementText,
          snapshot.rules,
          sourceModels,
          [diagram],
          buildGenerateDesignModelsPrompt(
            snapshot.requirementText,
            snapshot.rules,
            sourceModels,
            sequenceModels,
            [diagram],
            designContextModels,
          ),
          "generate_design_models",
        );
        throwIfRunCancelled(record);
        models = mergeDesignModels(models, result.models);
        designModelTraceability = [
          ...designModelTraceability.filter(
            (entry) => entry.source.diagramKind !== diagram,
          ),
          ...result.designModelTraceability,
        ];
        delete diagramErrors[diagram];
        publishDesignModelSnapshot();
        emitEvent(
          record,
          artifactReadyRunEventSchema.parse({
            type: "artifact_ready",
            stage: "generate_design_models",
            artifactKind: "model",
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskStatus: "running",
          }),
        );
        return result;
      } catch (error) {
        throwIfRunCancelled(record);
        const message =
          error instanceof Error ? error.message : `${diagram} 设计模型生成失败`;
        diagramErrors[diagram] = diagramErrorSchema.parse({
          stage: "generate_design_models",
          message,
        });
        publishDesignModelSnapshot();
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_design_models",
            progress: stageProgressValue("generate_design_models"),
            message,
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskStatus: "failed",
          }),
        );
        return null;
      }
    };

    const parallelDownstream = downstreamWithSources.filter(
      (diagram) => diagram !== "table",
    );
    await Promise.all(
      parallelDownstream.map((diagram) => generateDownstreamDiagram(diagram)),
    );
    throwIfRunCancelled(record);
    if (downstreamWithSources.includes("table")) {
      const classModel = models.find((model) => model.diagramKind === "class");
      if (!classModel) {
        diagramErrors.table = diagramErrorSchema.parse({
          stage: "generate_design_models",
          message: "缺少设计类图，无法生成表关系图",
        });
        publishDesignModelSnapshot();
      } else {
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_design_models",
            progress: stageProgressValue("generate_design_models"),
            message: "表关系图依赖设计类图，正在基于设计类图生成：table",
          }),
        );
        const tableResult = await generateDownstreamDiagram("table", [classModel]);
        throwIfRunCancelled(record);
        const tableModels = tableResult?.models ?? [];
        if (tableModels.length === 0 && !diagramErrors.table) {
          diagramErrors.table = diagramErrorSchema.parse({
            stage: "generate_design_models",
            message: "表关系图生成结果为空",
          });
          publishDesignModelSnapshot();
        }
      }
    }
    publishDesignModelSnapshot();
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_design_models",
        artifactKind: "model",
      }),
    );
  }

  const trustedChain = buildDesignStageTrustedChain({
    runId: snapshot.runId,
    baseline: snapshot.requirementBaseline,
    models: snapshot.requirementModels,
    requirementModelTraceability: snapshot.requirementModelTraceability,
    designModels: models,
    designModelTraceability,
  });
  snapshot.coverageMatrix = trustedChain.coverageMatrix;
  snapshot.traceabilityMatrix = trustedChain.traceabilityMatrix;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_models",
      artifactKind: "coverageMatrix",
      coverageMatrix: trustedChain.coverageMatrix,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_models",
      artifactKind: "traceabilityMatrix",
      traceabilityMatrix: trustedChain.traceabilityMatrix,
    }),
  );
  assertTrustedChainAllowsCompletion(trustedChain);

  updateStage("generate_plantuml", "正在生成设计阶段 PlantUML");
  throwIfRunCancelled(record);
  let plantUml = generateDesignPlantUmlArtifacts(models);
  snapshot.plantUml = plantUml;
  for (const artifact of plantUml) {
    appendDesignTrace(record, {
      stage: "generate_plantuml",
      attempt: 1,
      kind: "plantuml_source",
      diagramKind: artifact.diagramKind,
      plantUmlSource: artifact.source,
    });
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: artifact.diagramKind,
        modelId: artifact.modelId,
        subtaskId: artifact.modelId ?? artifact.diagramKind,
        subtaskStatus: "rendering",
      }),
    );
  }

  updateStage("render_svg", "正在渲染设计阶段 SVG");
  const repairedPlantUmlArtifacts: DesignPlantUmlArtifact[] = [];
  const svgArtifacts: DesignSvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    throwIfRunCancelled(record);
    const model = findDesignModelForArtifact(models, artifact);
    if (!model) {
      throw new Error(`Missing design diagram model for ${artifact.diagramKind}`);
    }

    const rendered = await renderArtifactWithRepair(
      record,
      providerSettings,
      llmTransport,
      renderClient,
      model,
      artifact,
    );
    throwIfRunCancelled(record);
    repairedPlantUmlArtifacts.push(rendered.artifact as DesignPlantUmlArtifact);
    snapshot.plantUml = repairedPlantUmlArtifacts;
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as DesignSvgArtifact);
      snapshot.svgArtifacts = svgArtifacts;
      emitEvent(
        record,
        artifactReadyRunEventSchema.parse({
          type: "artifact_ready",
          stage: "render_svg",
          artifactKind: "svg",
          diagramKind: artifact.diagramKind,
          modelId: artifact.modelId,
          subtaskId: artifact.modelId ?? artifact.diagramKind,
          subtaskStatus: "completed",
        }),
      );
      continue;
    }

    renderFailures.push(rendered.errorMessage);
    diagramErrors[artifact.diagramKind] = diagramErrorSchema.parse({
      stage: "render_svg",
      message: rendered.errorMessage,
    });
    snapshot.diagramErrors = diagramErrors;
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage: "render_svg",
        progress: stageProgressValue("render_svg"),
        message: rendered.errorMessage,
        diagramKind: artifact.diagramKind,
        modelId: artifact.modelId,
        subtaskId: artifact.modelId ?? artifact.diagramKind,
        subtaskStatus: "failed",
      }),
    );
  }
  snapshot.plantUml = repairedPlantUmlArtifacts;
  snapshot.svgArtifacts = svgArtifacts;
  snapshot.diagramErrors = diagramErrors;

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  snapshot.currentStage = "render_svg";
  throwIfRunCancelled(record);
  const evidencePackage = attachEvidencePackage(snapshot);
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "evidencePackage",
      evidencePackage,
    }),
  );
  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}
