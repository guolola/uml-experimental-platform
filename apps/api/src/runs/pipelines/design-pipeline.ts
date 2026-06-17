// Orchestrates design-model generation, PlantUML, and SVG rendering for design runs.

import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  diagramErrorSchema,
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
  type RequirementBaseline,
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
  deriveUpstreamDesignRefsFromTraceability,
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
} from "../baselines/requirement-baseline.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import {
  withModelTaskTimeout,
  type ModelTaskActivity,
} from "./shared/model-task-timeout.js";
import { createRunLlmChunkHandlers } from "./shared/llm-chunk-events.js";
import { appendDesignTrace } from "./shared/trace-events.js";
import {
  createRunError,
  isPlatformProviderRunError,
  normalizeRunError,
  throwRunError,
} from "./shared/errors.js";
import {
  assertTrustedChainAllowsCompletion,
  buildDesignStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const MAX_MODEL_REPAIR_ATTEMPTS = 2;
const MAX_SEQUENCE_USE_CASE_RETRIES = 2;
const DESIGN_TRACEABILITY_BATCH_SIZE = 24;
const DEFAULT_DESIGN_SEQUENCE_CONCURRENCY = 2;
const DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TASK_MAX_RUNTIME_MS = 1_200_000;
const LLM_CHUNK_EVENT_LIMIT = 240;
const LLM_CHUNK_CHAR_LIMIT = 24000;
const TRACE_RAW_OUTPUT_LIMIT = 20000;

const DESIGN_DIAGRAM_LABELS: Record<DesignDiagramKind, string> = {
  architecture: "总体架构图",
  sequence: "用例实现设计",
  class: "设计类图",
  activity: "界面关系图",
  component: "组件（构件）关系",
  deployment: "部署设计",
  table: "数据库设计",
};

function designDiagramKindFromErrorId(id: string): DesignDiagramKind | null {
  const [rawKind] = id.split(":");
  if (
    rawKind === "sequence" ||
    rawKind === "architecture" ||
    rawKind === "class" ||
    rawKind === "activity" ||
    rawKind === "component" ||
    rawKind === "deployment" ||
    rawKind === "table"
  ) {
    return rawKind;
  }
  return null;
}

function selectedDesignDiagramFailures(
  diagramErrors: Record<string, DiagramError>,
  selectedDiagrams: DesignDiagramKind[],
) {
  const selected = new Set(selectedDiagrams);
  return Object.entries(diagramErrors).filter(([id]) => {
    const kind = designDiagramKindFromErrorId(id);
    return Boolean(kind && selected.has(kind));
  });
}

function summarizeSelectedDesignDiagramFailures(
  failures: Array<[string, DiagramError]>,
) {
  return failures
    .map(([id, error]) => {
      const kind = designDiagramKindFromErrorId(id);
      const label = kind ? designDiagramLabel(kind) : id;
      return `${label}：${error.error.message ?? "生成失败"}`;
    })
    .join("；");
}

function firstSelectedPlatformProviderFailure(
  failures: Array<[string, DiagramError]>,
) {
  const failure = failures.find(([, error]) =>
    isPlatformProviderRunError(error.error),
  );
  return failure?.[1].error ?? null;
}

const REQUIREMENT_DIAGRAM_LABELS: Record<DiagramKind, string> = {
  function: "功能结构图",
  usecase: "用例模型",
  class: "领域概念模型",
  activity: "总体业务流程",
  deployment: "部署需求模型",
  prototype: "原型界面关系",
  analysis: "需求分析模型",
};

function designDiagramLabel(diagram: DesignDiagramKind) {
  return DESIGN_DIAGRAM_LABELS[diagram];
}

function requirementDiagramLabel(diagram: DiagramKind) {
  return REQUIREMENT_DIAGRAM_LABELS[diagram];
}

function positiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readDesignSequenceConcurrency() {
  const runConcurrency = positiveIntegerEnv(
    process.env.UML_LLM_RUN_CONCURRENCY,
    DEFAULT_DESIGN_SEQUENCE_CONCURRENCY,
  );
  return positiveIntegerEnv(process.env.UML_DESIGN_SEQUENCE_CONCURRENCY, runConcurrency);
}

function readDesignModelTaskTimeoutConfig() {
  const globalIdleTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_TIMEOUT_MS,
    DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS,
  );
  const idleTimeoutMs = positiveIntegerEnv(
    process.env.UML_DESIGN_MODEL_TASK_TIMEOUT_MS,
    globalIdleTimeout,
  );
  const globalBlankOutputTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS),
  );
  const blankOutputTimeoutMs = positiveIntegerEnv(
    process.env.UML_DESIGN_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, globalBlankOutputTimeout),
  );
  const globalMaxRuntime = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_MAX_RUNTIME_MS,
    DEFAULT_MODEL_TASK_MAX_RUNTIME_MS,
  );
  const maxRuntimeMs = positiveIntegerEnv(
    process.env.UML_DESIGN_MODEL_TASK_MAX_RUNTIME_MS,
    globalMaxRuntime,
  );
  return { idleTimeoutMs, blankOutputTimeoutMs, maxRuntimeMs };
}

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

  const fallbackRequirementRefs = [
    ...requirementRefs.filter((ref) => ref.diagramKind === "usecase"),
    ...requirementRefs.filter((ref) => ref.diagramKind !== "usecase"),
  ];
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

  return missingSources.flatMap((source, sourceIndex): DesignModelTraceabilityEntry[] => {
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
    const target =
      directUseCaseTarget ??
      labelTarget ??
      fallbackRequirementRefs[sourceIndex % fallbackRequirementRefs.length];
    if (!target) return [];
    const mappingIsDeterministic = Boolean(directUseCaseTarget ?? labelTarget);
    return [
      {
        source,
        targets: [target],
        mappingSource: mappingIsDeterministic
          ? "derived-from-endpoints"
          : "auto-filled-pending-review",
        reviewStatus: mappingIsDeterministic ? "confirmed" : "pending",
        confidence: mappingIsDeterministic ? "medium" : "low",
        rationale: mappingIsDeterministic
          ? "系统根据用例实现设计的来源用例或元素标签确定性补齐追踪关系。"
          : "LLM 修复后仍缺少该设计元素映射，系统按最接近的需求元素兜底补齐，需人工复核。",
      },
    ];
  });
}

function recoverCompleteDesignTraceabilityFromSources(
  missingSources: ModelElementRef[],
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  if (missingSources.length === 0) return [];
  const recovered = normalizeDesignTraceabilityWithCoverage(
    autoFillDesignTraceability(missingSources, designModels, requirementModels),
    designModels,
    requirementModels,
  );
  return recovered.traceability.length > 0 && recovered.missingSources.length === 0
    ? recovered.traceability
    : null;
}

function autoFillCompleteDesignTraceability(
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const coverage = normalizeDesignTraceabilityWithCoverage(
    [],
    designModels,
    requirementModels,
  );
  return recoverCompleteDesignTraceabilityFromSources(
    coverage.missingSources,
    designModels,
    requirementModels,
  );
}

function truncateTraceRawOutput(rawOutput: string) {
  if (rawOutput.length <= TRACE_RAW_OUTPUT_LIMIT) return rawOutput;
  return `${rawOutput.slice(0, TRACE_RAW_OUTPUT_LIMIT)}\n...[truncated ${rawOutput.length - TRACE_RAW_OUTPUT_LIMIT} chars]`;
}

function createLimitedLlmChunkEmitter(
  record: RunRecord,
  stage: RunStage,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
) {
  return createRunLlmChunkHandlers({
    record,
    stage,
    onActivity,
    onBlankActivity,
    maxVisibleChunks: LLM_CHUNK_EVENT_LIMIT,
    maxVisibleChars: LLM_CHUNK_CHAR_LIMIT,
  });
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

type UseCaseForSequence = ReturnType<typeof useCasesFromModel>[number];
type SequenceDesignModel = Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }>;

function sequenceModelIdForUseCase(useCase: UseCaseForSequence) {
  return `sequence:${useCase.id}`;
}

function coerceSequenceModelForUseCase(
  result: Awaited<ReturnType<typeof generateDesignModelsWithRepair>>,
  useCase: UseCaseForSequence,
) {
  const sequenceModels = result.models.filter(
    (model): model is SequenceDesignModel => model.diagramKind === "sequence",
  );
  const expectedModelId = sequenceModelIdForUseCase(useCase);
  const selected =
    sequenceModels.find(
      (model) =>
        model.sourceUseCaseId === useCase.id || model.modelId === expectedModelId,
    ) ?? sequenceModels[0];
  if (!selected) {
    throw new Error(`${useCase.name}用例实现设计生成结果为空`);
  }

  const model: SequenceDesignModel = {
    ...selected,
    modelId: expectedModelId,
    sourceUseCaseId: useCase.id,
    sourceUseCaseName: useCase.name,
    title: selected.title?.trim() || `${useCase.name}用例实现设计`,
    summary:
      selected.summary?.trim() || `${useCase.name}用例的对象交互流程。`,
  };
  const designModelTraceability = result.designModelTraceability
    .filter((entry) => entry.source.diagramKind === "sequence")
    .map((entry) => ({
      ...entry,
      source: {
        ...entry.source,
        modelId: expectedModelId,
        diagramKind: "sequence" as const,
      },
    }));

  return {
    models: [model],
    designModelTraceability,
  };
}

function normalizedSequenceTerms(values: string[]) {
  return new Set(
    values
      .map((value) => value.replace(/[\s_()[\]（）【】确认成功失败结果]/gu, "").toLowerCase())
      .filter((value) => value.length > 0),
  );
}

function overlapRatio(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) overlap += 1;
  }
  return overlap / Math.min(left.size, right.size);
}

function hasDesignImplementationSignal(model: SequenceDesignModel) {
  const participantTypes = new Set(model.participants.map((participant) => participant.participantType));
  const hasDesignParticipant =
    participantTypes.has("service") || participantTypes.has("database");
  const hasMethodLikeMessage = model.messages.some((message) =>
    /^[a-z][a-z0-9_]*(?:[A-Z][a-z0-9_]*)*(?:\s*\(|$)/u.test(message.name.trim()),
  );
  return hasDesignParticipant || hasMethodLikeMessage;
}

function assertSequenceDiffersFromRequirementAnalysis(
  model: SequenceDesignModel,
  analysisModels: DiagramModelSpec[],
) {
  const analysis = analysisModels.find((candidate) => candidate.diagramKind === "analysis");
  if (!analysis || analysis.diagramKind !== "analysis") return;

  const participantOverlap = overlapRatio(
    normalizedSequenceTerms(model.participants.map((participant) => participant.name)),
    normalizedSequenceTerms(analysis.participants.map((participant) => participant.name)),
  );
  const messageOverlap = overlapRatio(
    normalizedSequenceTerms(model.messages.map((message) => message.name)),
    normalizedSequenceTerms(analysis.messages.map((message) => message.name)),
  );
  if (
    participantOverlap >= 0.75 &&
    messageOverlap >= 0.75 &&
    !hasDesignImplementationSignal(model)
  ) {
    throw new Error(
      `${model.sourceUseCaseName ?? model.title}用例实现设计与需求分析模型过于相似，缺少设计阶段对象职责、服务/数据库参与者或方法调用时序`,
    );
  }
}

function validateUseCaseSequenceCoverage(
  sequenceModels: SequenceDesignModel[],
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
      `用例实现设计生成结果必须为每个用例生成一个独立模型；缺少 ${missing.length} 个用例实现设计：${preview}`,
    );
  }
}

async function generateDesignTraceabilityWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  stage: RunStage,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
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
      requirementBaseline,
      requirementModels,
      designModels,
      batchSources,
      stage,
      batchIndex + 1,
      directBatches.length,
      onActivity,
      onBlankActivity,
      abortSignal,
    );
    accumulatedTraceability = mergeDesignTraceability(
      accumulatedTraceability,
      batchTraceability,
    );
  }

  accumulatedTraceability = deriveUpstreamDesignRefsFromTraceability(
    deriveDesignRelationshipTraceability(accumulatedTraceability, designModels),
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
      requirementBaseline,
      requirementModels,
      designModels,
      batchSources,
      stage,
      batchIndex + 1,
      relationshipBatches.length,
      onActivity,
      onBlankActivity,
      abortSignal,
    );
    accumulatedTraceability = mergeDesignTraceability(
      accumulatedTraceability,
      batchTraceability,
    );
  }

  accumulatedTraceability = deriveUpstreamDesignRefsFromTraceability(
    deriveDesignRelationshipTraceability(accumulatedTraceability, designModels),
  );
  const finalCoverage = normalizeDesignTraceabilityWithCoverage(
    accumulatedTraceability,
    designModels,
    requirementModels,
  );
  const recoveredFinalTraceability = deriveUpstreamDesignRefsFromTraceability(
    finalCoverage.traceability.length > 0 && finalCoverage.missingSources.length > 0
      ? mergeDesignTraceability(
          finalCoverage.traceability,
          autoFillDesignTraceability(
            finalCoverage.missingSources,
            designModels,
            requirementModels,
          ),
        )
      : finalCoverage.traceability,
  );
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
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  requiredSources: ModelElementRef[],
  stage: RunStage,
  batchIndex: number,
  totalBatches: number,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
) {
  if (requiredSources.length === 0) return [];
  const responseFormat = getGenerateDesignTraceabilityResponseFormat(
    providerSettings.model,
  );
  let prompt = buildGenerateDesignTraceabilityPrompt(
    requirementBaseline,
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
    const emitLimitedChunk = createLimitedLlmChunkEmitter(
      record,
      stage,
      onActivity,
      onBlankActivity,
    );
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      emitLimitedChunk,
      responseFormat,
      abortSignal,
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
      if (missingSources.length > 0 || accumulatedTraceability.length === 0) {
        const recoveredTraceability = mergeDesignTraceability(
          accumulatedTraceability,
          autoFillDesignTraceability(
            missingSources.length > 0 ? missingSources : requiredSources,
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
              message: `已自动补齐第 ${batchIndex}/${totalBatches} 批 ${missingSources.length || requiredSources.length} 个设计模型元素映射`,
            }),
          );
          onActivity?.();
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
        if (accumulatedTraceability.length === 0) {
          throw new Error(
            "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
          );
        }
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
          onActivity?.();
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
        if (accumulatedTraceability.length === 0) {
          throw new Error(
            `design traceability structured output failed: ${lastErrorMessage}`,
          );
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
      onActivity?.();

      prompt = buildRepairDesignTraceabilityPrompt(
        requirementBaseline,
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
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  selectedDiagrams: DesignDiagramKind[],
  initialPrompt: string,
  stage: RunStage,
  options: {
    modelRepairAttempts?: number;
    skipEmptyModelRepair?: boolean;
  } = {},
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
) {
  const modelRepairAttempts =
    options.modelRepairAttempts ?? MAX_MODEL_REPAIR_ATTEMPTS;
  const responseFormat = getGenerateDesignModelsResponseFormat(providerSettings.model);
  let prompt = initialPrompt;
  let previousOutput = "";
  let lastErrorMessage = "";
  const traceStage =
    stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";

  for (let attempt = 0; attempt <= modelRepairAttempts; attempt += 1) {
    const emitLimitedChunk = createLimitedLlmChunkEmitter(
      record,
      stage,
      onActivity,
      onBlankActivity,
    );
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      emitLimitedChunk,
      responseFormat,
      abortSignal,
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
        const recoveredTraceability = autoFillCompleteDesignTraceability(
          filteredModels,
          requirementModels,
        );
        if (recoveredTraceability) {
          filteredTraceability = recoveredTraceability;
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage,
              progress: stageProgressValue(stage),
              message: "设计模型元素映射缺失，已系统自动补齐并标记待确认",
            }),
          );
          onActivity?.();
        } else {
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage,
              progress: stageProgressValue(stage),
              message: "设计模型元素映射缺失，正在单独生成可追踪关系",
            }),
          );
          onActivity?.();
          filteredTraceability = await generateDesignTraceabilityWithRepair(
            record,
            providerSettings,
            llmTransport,
            requirementBaseline,
            requirementModels,
            filteredModels,
            stage,
            onActivity,
            onBlankActivity,
            abortSignal,
          );
        }
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
            message: "设计模型元素映射缺失，正在恢复可追踪关系",
          }),
        );
        onActivity?.();
        const designModelTraceability =
          autoFillCompleteDesignTraceability(filteredModels, requirementModels) ??
          (await generateDesignTraceabilityWithRepair(
            record,
            providerSettings,
            llmTransport,
            requirementBaseline,
            requirementModels,
            filteredModels,
            stage,
            onActivity,
            onBlankActivity,
            abortSignal,
          ));
        appendDesignTrace(record, {
          stage: traceStage,
          attempt: attempt + 1,
          kind: "parsed_model",
          parsedData: {
            models: filteredModels,
            designModelTraceability,
          },
        });
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
      if (
        options.skipEmptyModelRepair &&
        lastErrorMessage.includes("must return at least one model")
      ) {
        throw new Error(
          `${stage} structured output failed: ${lastErrorMessage}`,
        );
      }
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: truncateTraceRawOutput(content),
        errorMessage: lastErrorMessage,
      });

      if (attempt === modelRepairAttempts) {
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
            message: `设计模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${modelRepairAttempts}）`,
          }),
        );
      onActivity?.();

      prompt = buildRepairDesignModelsPrompt(
        requirementBaseline,
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

function designArtifactSubtaskLabel(
  model: DesignDiagramModelSpec | undefined,
  artifact: Pick<DesignPlantUmlArtifact, "diagramKind" | "modelId">,
) {
  const title =
    typeof (model as { title?: unknown } | undefined)?.title === "string"
      ? ((model as { title?: string }).title ?? "").trim()
      : "";
  if (title) return title;
  if (
    model?.diagramKind === "sequence" &&
    typeof model.sourceUseCaseName === "string" &&
    model.sourceUseCaseName.trim()
  ) {
    return `用例实现设计：${model.sourceUseCaseName.trim()}`;
  }
  return designDiagramLabel(artifact.diagramKind);
}

function designArtifactKey(
  artifact: Pick<DesignPlantUmlArtifact | DesignSvgArtifact, "diagramKind" | "modelId">,
) {
  return artifact.modelId ?? artifact.diagramKind;
}

function replaceDesignPlantUmlArtifact(
  artifacts: DesignPlantUmlArtifact[],
  patch: DesignPlantUmlArtifact,
) {
  const key = designArtifactKey(patch);
  return [...artifacts.filter((artifact) => designArtifactKey(artifact) !== key), patch];
}

function replaceDesignSvgArtifact(
  artifacts: DesignSvgArtifact[],
  patch: DesignSvgArtifact,
) {
  const key = designArtifactKey(patch);
  return [...artifacts.filter((artifact) => designArtifactKey(artifact) !== key), patch];
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
): DiagramKind | undefined {
  return sourceRequirementKindsForDesign(diagramKind)[0];
}

function sourceRequirementKindsForDesign(
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
): DiagramKind[] {
  switch (diagramKind) {
    case "architecture":
      return ["function"];
    case "activity":
      return ["prototype"];
    case "class":
      return ["class"];
    case "component":
      return [];
    case "deployment":
      return ["deployment"];
    case "table":
      return [];
  }
}

function findRequirementModelsForDesign(
  models: DiagramModelSpec[],
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
) {
  const sourceKinds = sourceRequirementKindsForDesign(diagramKind);
  if (sourceKinds.length === 0) {
    return models;
  }
  return sourceKinds
    .map((kind) => findRequirementModel(models, kind))
    .filter((model): model is DiagramModelSpec => Boolean(model));
}

function analysisModelsForUseCase(models: DiagramModelSpec[], useCaseId: string) {
  return models.filter((model) => {
    if (model.diagramKind !== "analysis") return false;
    const modelId = model.modelId ?? "";
    return model.sourceUseCaseId === useCaseId || modelId === `analysis:${useCaseId}`;
  });
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
  if (!snapshot.requirementBaseline) {
    throw new Error("设计生成缺少当前需求基线，无法兼容旧设计快照结构");
  }
  const requirementBaseline = snapshot.requirementBaseline;
  assertRequirementBaselineAllowsDownstream(requirementBaseline);

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
  let diagramErrors: Record<string, DiagramError> = {};
  let plantUml: DesignPlantUmlArtifact[] = [];
  let svgArtifacts: DesignSvgArtifact[] = [];
  const renderFailures: string[] = [];
  const publishDesignModelSnapshot = () => {
    snapshot.models = models;
    snapshot.designModelTraceability = designModelTraceability;
    snapshot.diagramErrors = diagramErrors;
  };
  const renderDesignModelArtifact = async (model: DesignDiagramModelSpec) => {
    throwIfRunCancelled(record);
    const artifacts = generateDesignPlantUmlArtifacts([model]);
    for (const artifact of artifacts) {
      const subtaskLabel = designArtifactSubtaskLabel(model, artifact);
      appendDesignTrace(record, {
        stage: "generate_plantuml",
        attempt: 1,
        kind: "plantuml_source",
        diagramKind: artifact.diagramKind,
        plantUmlSource: artifact.source,
      });
      plantUml = replaceDesignPlantUmlArtifact(plantUml, artifact);
      snapshot.plantUml = plantUml;
      emitEvent(
        record,
        artifactReadyRunEventSchema.parse({
          type: "artifact_ready",
          stage: "generate_plantuml",
          artifactKind: "plantuml",
          diagramKind: artifact.diagramKind,
          modelId: artifact.modelId,
          subtaskId: artifact.modelId ?? artifact.diagramKind,
          subtaskLabel,
          subtaskStatus: "completed",
        }),
      );

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "render_svg",
          progress: stageProgressValue("render_svg"),
          message: `正在渲染：${subtaskLabel}`,
          diagramKind: artifact.diagramKind,
          modelId: artifact.modelId,
          subtaskId: artifact.modelId ?? artifact.diagramKind,
          subtaskLabel,
          subtaskStatus: "rendering",
        }),
      );
      const rendered = await renderArtifactWithRepair(
        record,
        providerSettings,
        llmTransport,
        renderClient,
        model,
        artifact,
      );
      throwIfRunCancelled(record);
      plantUml = replaceDesignPlantUmlArtifact(
        plantUml,
        rendered.artifact as DesignPlantUmlArtifact,
      );
      snapshot.plantUml = plantUml;
      if (rendered.status === "success") {
        svgArtifacts = replaceDesignSvgArtifact(
          svgArtifacts,
          rendered.svgArtifact as DesignSvgArtifact,
        );
        snapshot.svgArtifacts = svgArtifacts;
        delete diagramErrors[artifact.modelId ?? artifact.diagramKind];
        delete diagramErrors[artifact.diagramKind];
        snapshot.diagramErrors = diagramErrors;
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
      const renderError = createRunError("RUN_RENDER_FAILED", rendered.errorMessage);
      diagramErrors[artifact.modelId ?? artifact.diagramKind] = diagramErrorSchema.parse({
        stage: "render_svg",
        error: renderError,
      });
      snapshot.diagramErrors = diagramErrors;
      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "render_svg",
          progress: stageProgressValue("render_svg"),
          message: rendered.errorMessage,
          error: renderError,
          diagramKind: artifact.diagramKind,
          modelId: artifact.modelId,
          subtaskId: artifact.modelId ?? artifact.diagramKind,
          subtaskStatus: "failed",
        }),
      );
    }
  };
  const selectedDesignDiagrams = new Set(snapshot.selectedDiagrams);
  const selectedDownstreamDiagrams = snapshot.selectedDiagrams.filter(
    (diagram): diagram is Exclude<DesignDiagramKind, "sequence"> =>
      diagram !== "sequence",
  );
  const selectedDiagramsRequireUseCase =
    selectedDesignDiagrams.has("sequence") ||
    selectedDownstreamDiagrams.some(
      (diagram) => diagram === "class" || diagram === "activity",
    );
  const useCaseModel = findRequirementModel(snapshot.requirementModels, "usecase");
  if (!useCaseModel && selectedDiagramsRequireUseCase) {
    throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少需求阶段用例模型，无法生成用例实现设计"));
  }

  let sequenceModels = useCaseModel
    ? existingSequenceModelsForUseCases(models, useCaseModel)
    : [];
  const shouldGenerateSequence = selectedDesignDiagrams.has("sequence");
  const modelTaskTimeoutConfig = readDesignModelTaskTimeoutConfig();

  if (shouldGenerateSequence) {
    if (!useCaseModel) {
      throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少需求阶段用例模型，无法生成用例实现设计"));
    }
    updateStage("generate_design_sequence", "正在生成用例实现设计");
    const sequenceRunErrors: ReturnType<typeof normalizeRunError>[] = [];
    const sequenceResults = await mapWithConcurrency(
      useCasesFromModel(useCaseModel),
      readDesignSequenceConcurrency(),
      async (useCase) => {
        throwIfRunCancelled(record);
        const modelId = sequenceModelIdForUseCase(useCase);
        const scopedUseCaseModel = useCaseModelForSingleUseCase(
          useCaseModel,
          useCase.id,
        );
        let lastErrorMessage = "";
        let lastRunError: ReturnType<typeof normalizeRunError> | null = null;
        for (let attempt = 0; attempt <= MAX_SEQUENCE_USE_CASE_RETRIES; attempt += 1) {
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_design_sequence",
              progress: stageProgressValue("generate_design_sequence"),
              message:
                attempt === 0
                  ? `正在生成用例实现设计：${useCase.name}`
                  : `正在重试用例实现设计：${useCase.name}（${attempt}/${MAX_SEQUENCE_USE_CASE_RETRIES}）`,
              diagramKind: "sequence",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `用例实现设计：${useCase.name}`,
              subtaskStatus: attempt === 0 ? "running" : "repairing",
            }),
          );
          try {
            const scopedAnalysisModels = analysisModelsForUseCase(
              snapshot.requirementModels,
              useCase.id,
            );
            const rawResult = await withModelTaskTimeout(
              (markActivity, markBlankActivity, abortSignal) => generateDesignModelsWithRepair(
                record,
                providerSettings,
                llmTransport,
                requirementBaseline,
                [scopedUseCaseModel],
                ["sequence"],
                buildGenerateDesignSequencePrompt(
                  requirementBaseline,
                  scopedUseCaseModel,
                  scopedAnalysisModels,
                ),
                "generate_design_sequence",
                { skipEmptyModelRepair: true },
                markActivity,
                markBlankActivity,
                abortSignal,
              ),
              {
                ...modelTaskTimeoutConfig,
                label: `${useCase.name}用例实现设计`,
              },
            );
            const result = coerceSequenceModelForUseCase(rawResult, useCase);
            assertSequenceDiffersFromRequirementAnalysis(
              result.models[0]!,
              scopedAnalysisModels,
            );
            models = mergeDesignModels(models, result.models);
            designModelTraceability = [
              ...designModelTraceability.filter(
                (entry) => entry.source.modelId !== modelId,
              ),
              ...result.designModelTraceability,
            ];
            delete diagramErrors.sequence;
            delete diagramErrors[modelId];
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
                subtaskLabel: `用例实现设计：${useCase.name}`,
                subtaskStatus: "completed",
              }),
            );
            await Promise.all(result.models.map(renderDesignModelArtifact));
            return result;
          } catch (error) {
            throwIfRunCancelled(record);
            lastRunError = normalizeRunError(error);
            lastErrorMessage = lastRunError.message;
          }
        }

        const message = lastErrorMessage || `${useCase.name}用例实现设计生成失败`;
        const runError = lastRunError ?? createRunError("RUN_MODEL_OUTPUT_EMPTY", message);
        sequenceRunErrors.push(runError);
        diagramErrors[modelId] = diagramErrorSchema.parse({
          stage: "generate_design_sequence",
          error: runError,
        });
        publishDesignModelSnapshot();
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_design_sequence",
            progress: stageProgressValue("generate_design_sequence"),
            message,
            error: runError,
            diagramKind: "sequence",
            modelId,
            subtaskId: modelId,
            subtaskLabel: `用例实现设计：${useCase.name}`,
            subtaskStatus: "failed",
          }),
        );
        return null;
      },
    );
    throwIfRunCancelled(record);
    sequenceModels = sequenceResults.flatMap((result) => result?.models ?? []).filter(
      (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
        model.diagramKind === "sequence",
    );
    if (sequenceModels.length === 0) {
      throwRunError(
        sequenceRunErrors[0] ??
          createRunError(
            "RUN_MODEL_OUTPUT_EMPTY",
            "用例实现设计未生成有效结果，请重试或检查模型输出。",
          ),
      );
    }
    validateUseCaseSequenceCoverage(sequenceModels, useCaseModel);
    models = mergeDesignModels(models, sequenceModels);
    designModelTraceability = [
      ...designModelTraceability.filter(
        (entry) => entry.source.diagramKind !== "sequence",
      ),
      ...sequenceResults.flatMap((result) => result?.designModelTraceability ?? []),
    ];
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
        subtaskStatus: "completed",
      }),
    );
  }

  const requestedDownstream = selectedDownstreamDiagrams;
  const sequenceRequiredDiagrams = requestedDownstream.filter(
    (diagram) => diagram === "class" || diagram === "activity",
  );
  if (sequenceRequiredDiagrams.length > 0 && sequenceModels.length === 0) {
    throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少用例实现设计，无法生成所选设计模型；请先生成用例实现设计或在本次请求中包含用例实现设计"));
  }
  if (
    (requestedDownstream.includes("table") || requestedDownstream.includes("component")) &&
    !selectedDesignDiagrams.has("class") &&
    !models.some((model) => model.diagramKind === "class")
  ) {
    throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少设计类图，无法生成数据库设计或组件（构件）关系；请先生成设计类图或在本次请求中包含设计类图"));
  }
  if (
    requestedDownstream.includes("deployment") &&
    !selectedDesignDiagrams.has("component") &&
    !models.some((model) => model.diagramKind === "component")
  ) {
    throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少组件（构件）关系，无法生成部署设计；请先生成组件（构件）关系或在本次请求中包含组件（构件）关系"));
  }
  const downstreamWithSources = requestedDownstream.filter((diagram) => {
    const sourceKinds = sourceRequirementKindsForDesign(diagram);
    if (sourceKinds.length === 0) {
      return true;
    }
    const sourceModels = findRequirementModelsForDesign(
      snapshot.requirementModels,
      diagram,
    );
    if (sourceModels.length > 0) {
      return true;
    }
    const sourceKind = sourceRequirementKindForDesign(diagram);
    const dependencyError = createRunError(
      "RUN_DEPENDENCY_MISSING",
      sourceKind
        ? `缺少需求阶段${requirementDiagramLabel(sourceKind)}，无法生成${designDiagramLabel(diagram)}`
        : `缺少上游设计来源，无法生成${designDiagramLabel(diagram)}`,
    );
    diagramErrors[diagram] = diagramErrorSchema.parse({
      stage: "generate_design_models",
      error: dependencyError,
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
          message: `正在生成${designDiagramLabel(diagram)}`,
          diagramKind: diagram,
          subtaskId: diagram,
          subtaskLabel: designDiagramLabel(diagram),
          subtaskStatus: "running",
        }),
      );
      const sourceModels = findRequirementModelsForDesign(
        snapshot.requirementModels,
        diagram,
      );
      try {
        const result = await withModelTaskTimeout(
          (markActivity, markBlankActivity, abortSignal) => generateDesignModelsWithRepair(
            record,
            providerSettings,
            llmTransport,
            requirementBaseline,
            sourceModels,
            [diagram],
            buildGenerateDesignModelsPrompt(
              requirementBaseline,
              sourceModels,
              sequenceModels,
              [diagram],
              designContextModels,
            ),
            "generate_design_models",
            {},
            markActivity,
            markBlankActivity,
            abortSignal,
          ),
          {
            ...modelTaskTimeoutConfig,
            label: designDiagramLabel(diagram),
          },
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
            subtaskStatus: "completed",
          }),
        );
        await Promise.all(result.models.map(renderDesignModelArtifact));
        return result;
      } catch (error) {
        throwIfRunCancelled(record);
        const runError = normalizeRunError(error);
        const message = runError.message || `${designDiagramLabel(diagram)}生成失败`;
        diagramErrors[diagram] = diagramErrorSchema.parse({
          stage: "generate_design_models",
          error: runError,
        });
        publishDesignModelSnapshot();
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_design_models",
            progress: stageProgressValue("generate_design_models"),
            message,
            error: runError,
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskLabel: designDiagramLabel(diagram),
            subtaskStatus: "failed",
          }),
        );
        return null;
      }
    };

    const markEmptyResult = (
      diagram: Exclude<DesignDiagramKind, "sequence">,
    ) => {
      if (diagramErrors[diagram]) return;
      const emptyError = createRunError(
        "RUN_MODEL_OUTPUT_EMPTY",
        `${designDiagramLabel(diagram)}生成结果为空`,
      );
      diagramErrors[diagram] = diagramErrorSchema.parse({
        stage: "generate_design_models",
        error: emptyError,
      });
      publishDesignModelSnapshot();
    };
    const runDownstreamDiagram = async (
      diagram: Exclude<DesignDiagramKind, "sequence">,
      designContextModels: DesignDiagramModelSpec[] = [],
    ) => {
      const result = await generateDownstreamDiagram(diagram, designContextModels);
      throwIfRunCancelled(record);
      const resultModels = result?.models.filter(
        (model) => model.diagramKind === diagram,
      ) ?? [];
      if (result && resultModels.length === 0) {
        markEmptyResult(diagram);
      }
      return result;
    };
    const downstreamOrder: Array<Exclude<DesignDiagramKind, "sequence">> = [
      "architecture",
      "class",
      "activity",
      "table",
      "component",
      "deployment",
    ];
    for (const diagram of downstreamOrder) {
      if (!downstreamWithSources.includes(diagram)) continue;
      if (diagram === "table") {
        const classModel = models.find((model) => model.diagramKind === "class");
        if (!classModel) {
          const dependencyError = createRunError(
            "RUN_DEPENDENCY_MISSING",
            "缺少设计类图，无法生成数据库设计",
          );
          diagramErrors.table = diagramErrorSchema.parse({
            stage: "generate_design_models",
            error: dependencyError,
          });
          publishDesignModelSnapshot();
          continue;
        }
        await runDownstreamDiagram("table", [classModel]);
        continue;
      }
      if (diagram === "component") {
        const classModel = models.find((model) => model.diagramKind === "class");
        if (!classModel) {
          const dependencyError = createRunError(
            "RUN_DEPENDENCY_MISSING",
            "缺少设计类图，无法生成组件（构件）关系",
          );
          diagramErrors.component = diagramErrorSchema.parse({
            stage: "generate_design_models",
            error: dependencyError,
          });
          publishDesignModelSnapshot();
          continue;
        }
        await runDownstreamDiagram("component", [classModel]);
        continue;
      }
      if (diagram === "deployment") {
        const componentModel = models.find((model) => model.diagramKind === "component");
        if (!componentModel) {
          const dependencyError = createRunError(
            "RUN_DEPENDENCY_MISSING",
            "缺少组件（构件）关系，无法生成部署设计",
          );
          diagramErrors.deployment = diagramErrorSchema.parse({
            stage: "generate_design_models",
            error: dependencyError,
          });
          publishDesignModelSnapshot();
          continue;
        }
        await runDownstreamDiagram("deployment", [componentModel]);
        continue;
      }
      await runDownstreamDiagram(diagram);
    }
    throwIfRunCancelled(record);
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
    baseline: requirementBaseline,
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

  snapshot.diagramErrors = diagramErrors;
  const selectedFailures = selectedDesignDiagramFailures(
    diagramErrors,
    snapshot.selectedDiagrams,
  );
  if (selectedFailures.length > 0) {
    const providerFailure = firstSelectedPlatformProviderFailure(selectedFailures);
    if (providerFailure) throwRunError(providerFailure);
    throw new Error(
      `设计模型生成未全部完成：${summarizeSelectedDesignDiagramFailures(
        selectedFailures,
      )}`,
    );
  }

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
  snapshot.error = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}
