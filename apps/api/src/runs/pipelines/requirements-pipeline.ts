// Orchestrates requirement extraction, model generation, PlantUML, and SVG rendering.

import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  diagramErrorSchema,
  diagramModelsResultSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type DiagramError,
  type DiagramKind,
  type DiagramModelSpec,
  type ModelElementRef,
  type PlantUmlArtifact,
  type ProviderSettings,
  type RequirementBaseline,
  type RequirementModelTraceabilityEntry,
  type RequirementRule,
  type RunSnapshot,
  type RunStage,
  type SvgArtifact,
} from "@uml-platform/contracts";
import {
  buildExtractRulesPrompt,
  buildGenerateRequirementAnalysisPrompt,
  buildGenerateRequirementTraceabilityPrompt,
  buildGenerateModelsPrompt,
  buildRepairRequirementTraceabilityPrompt,
  buildRepairModelsPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../llm.js";
import { type RenderClient } from "../../adapters/render/render-client.js";
import {
  getExtractRequirementRulesResponseFormat,
  getGenerateModelsResponseFormat,
  getGenerateRequirementTraceabilityResponseFormat,
} from "../../adapters/llm/response-formats/index.js";
import { generatePlantUmlArtifacts } from "../../plantuml.js";
import {
  parseRequirementDiagramModelsOnly,
  parseRequirementDiagramModelsResult,
  parseRequirementTraceabilityCoverageResult,
} from "../../normalizers/requirements/requirement-model-normalizer.js";
import { normalizeRequirementRulesResult } from "../../normalizers/requirements/requirement-rule-normalizer.js";
import {
  autoFillRequirementTraceability,
  collectModelRefs,
  formatTraceabilityMissingRefs,
  mergeRequirementTraceability,
  normalizeRequirementTraceabilityWithCoverage,
} from "../../normalizers/traceability/traceability-normalizer.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import {
  isRunCancelled,
  RunCancelledError,
  throwIfRunCancelled,
} from "../records/run-cancellation.js";
import { attachEvidencePackage } from "../evidence/evidence-package.js";
import { renderArtifactWithRepair } from "./render/render-artifact-with-repair.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import {
  collectStructuredResult,
  collectTextResult,
  logFailedStructuredOutput,
} from "./shared/structured-output.js";
import {
  withModelTaskTimeout,
  type ModelTaskActivity,
} from "./shared/model-task-timeout.js";
import { createRunLlmChunkHandlers } from "./shared/llm-chunk-events.js";
import { appendRequirementTrace } from "./shared/trace-events.js";
import { createRunError, normalizeRunError, throwRunError } from "./shared/errors.js";
import {
  assertRequirementBaselineAllowsDownstream,
  buildEmptyRequirementBaseline,
  buildRequirementBaseline,
} from "../baselines/requirement-baseline.js";
import {
  assertTrustedChainAllowsCompletion,
  buildRequirementStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const MAX_MODEL_REPAIR_ATTEMPTS = 2;
const DEFAULT_REQUIREMENT_ANALYSIS_CONCURRENCY = 2;
const DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TASK_MAX_RUNTIME_MS = 1_200_000;

function positiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compactText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
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

function readRequirementAnalysisConcurrency() {
  const runConcurrency = positiveIntegerEnv(
    process.env.UML_LLM_RUN_CONCURRENCY,
    DEFAULT_REQUIREMENT_ANALYSIS_CONCURRENCY,
  );
  return positiveIntegerEnv(
    process.env.UML_REQUIREMENT_ANALYSIS_CONCURRENCY,
    runConcurrency,
  );
}

function readRequirementModelTaskTimeoutConfig() {
  const globalIdleTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_TIMEOUT_MS,
    DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS,
  );
  const idleTimeoutMs = positiveIntegerEnv(
    process.env.UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS,
    globalIdleTimeout,
  );
  const globalBlankOutputTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS),
  );
  const blankOutputTimeoutMs = positiveIntegerEnv(
    process.env.UML_REQUIREMENT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, globalBlankOutputTimeout),
  );
  const globalMaxRuntime = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_MAX_RUNTIME_MS,
    DEFAULT_MODEL_TASK_MAX_RUNTIME_MS,
  );
  const maxRuntimeMs = positiveIntegerEnv(
    process.env.UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS,
    globalMaxRuntime,
  );
  return { idleTimeoutMs, blankOutputTimeoutMs, maxRuntimeMs };
}

function useCasesFromModel(useCaseModel: DiagramModelSpec) {
  return useCaseModel.diagramKind === "usecase" ? useCaseModel.useCases : [];
}

function useCaseHasEventFlows(useCase: UseCaseForAnalysis) {
  return Array.isArray(useCase.eventFlows) && useCase.eventFlows.length > 0;
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

type UseCaseForAnalysis = ReturnType<typeof useCasesFromModel>[number];
type AnalysisRequirementModel = Extract<DiagramModelSpec, { diagramKind: "analysis" }>;

function requirementModelId(model: DiagramModelSpec) {
  return compactText((model as unknown as { modelId?: string }).modelId) || model.diagramKind;
}

const REQUIREMENT_DIAGRAM_LABELS: Record<DiagramKind, string> = {
  context: "上下文图",
  function: "功能结构图",
  usecase: "用例模型",
  class: "领域概念模型",
  activity: "总体业务流程",
  deployment: "部署需求模型",
  prototype: "原型界面关系",
  analysis: "需求分析模型",
};

function requirementDiagramLabel(diagram: DiagramKind) {
  return REQUIREMENT_DIAGRAM_LABELS[diagram];
}

function requirementArtifactSubtaskLabel(
  model: DiagramModelSpec | undefined,
  artifact: Pick<PlantUmlArtifact, "diagramKind" | "modelId">,
) {
  const title = compactText((model as { title?: unknown } | undefined)?.title);
  if (title) return title;
  if (
    model?.diagramKind === "analysis" &&
    compactText((model as AnalysisRequirementModel).sourceUseCaseName)
  ) {
    return `需求分析模型：${compactText(
      (model as AnalysisRequirementModel).sourceUseCaseName,
    )}`;
  }
  return requirementDiagramLabel(artifact.diagramKind);
}

function requirementArtifactKey(
  artifact: Pick<PlantUmlArtifact | SvgArtifact, "diagramKind" | "modelId">,
) {
  return compactText(artifact.modelId) || artifact.diagramKind;
}

function replaceRequirementPlantUmlArtifact(
  artifacts: PlantUmlArtifact[],
  patch: PlantUmlArtifact,
) {
  const key = requirementArtifactKey(patch);
  return [...artifacts.filter((artifact) => requirementArtifactKey(artifact) !== key), patch];
}

function replaceRequirementSvgArtifact(
  artifacts: SvgArtifact[],
  patch: SvgArtifact,
) {
  const key = requirementArtifactKey(patch);
  return [...artifacts.filter((artifact) => requirementArtifactKey(artifact) !== key), patch];
}

function analysisModelIdForUseCase(useCase: UseCaseForAnalysis) {
  return `analysis:${useCase.id}`;
}

function analysisSourceUseCaseId(model: AnalysisRequirementModel) {
  const sourceUseCaseId = compactText(model.sourceUseCaseId);
  if (sourceUseCaseId) return sourceUseCaseId;
  const modelId = compactText(model.modelId);
  return modelId.startsWith("analysis:") ? modelId.slice("analysis:".length) : modelId;
}

function mergeRequirementModels(
  current: DiagramModelSpec[],
  patch: DiagramModelSpec[],
) {
  const merged = new Map<string, DiagramModelSpec>();
  for (const model of [...current, ...patch]) {
    merged.set(requirementModelId(model), model);
  }
  return Array.from(merged.values());
}

function coerceAnalysisModelForUseCase(
  result: Awaited<ReturnType<typeof generateAnalysisModelWithRepair>>,
  useCase: UseCaseForAnalysis,
) {
  const analysisModels = result.models.filter(
    (model): model is AnalysisRequirementModel => model.diagramKind === "analysis",
  );
  const expectedModelId = analysisModelIdForUseCase(useCase);
  const selected =
    analysisModels.find(
      (model) =>
        model.sourceUseCaseId === useCase.id || model.modelId === expectedModelId,
    ) ?? analysisModels[0];
  if (!selected) {
    throw new Error(`${useCase.name}需求分析模型生成结果为空`);
  }

  const model: AnalysisRequirementModel = {
    ...selected,
    modelId: expectedModelId,
    sourceUseCaseId: useCase.id,
    sourceUseCaseName: useCase.name,
    title: selected.title?.trim() || `${useCase.name}需求分析模型`,
    summary:
      selected.summary?.trim() || `${useCase.name}用例事件流的需求阶段交互分析。`,
  };
  const requirementModelTraceability = result.requirementModelTraceability
    .filter((entry) => entry.target.diagramKind === "analysis")
    .map((entry) => ({
      ...entry,
      target: {
        ...entry.target,
        modelId: expectedModelId,
        diagramKind: "analysis" as const,
      },
    }));

  return {
    models: [model],
    requirementModelTraceability,
  };
}

async function generateAnalysisModelWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  scopedUseCaseModel: DiagramModelSpec,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
  promptOverride?: string,
) {
  const selectedDiagrams: DiagramKind[] = ["analysis"];
  const responseFormat = getGenerateModelsResponseFormat(
      providerSettings,
      selectedDiagrams,
    );
  const sourceUseCase =
    scopedUseCaseModel.diagramKind === "usecase"
      ? scopedUseCaseModel.useCases[0]
      : null;
  const modelId = sourceUseCase ? analysisModelIdForUseCase(sourceUseCase) : undefined;
  let prompt = promptOverride ?? buildGenerateRequirementAnalysisPrompt(scopedUseCaseModel);
  let previousOutput = "";
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      createRunLlmChunkHandlers({
        record,
        stage: "generate_models",
        onActivity,
        onBlankActivity,
        diagramKind: "analysis",
        modelId,
        subtaskId: modelId,
        subtaskLabel: sourceUseCase
          ? `需求分析模型：${sourceUseCase.name}`
          : "需求分析模型",
      }),
      responseFormat,
      abortSignal,
    );
    previousOutput = content;
    appendRequirementTrace(record, {
      stage: "generate_models",
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: content,
    });

    try {
      const parsed = parseRequirementDiagramModelsOnly(content);
      const analysisModels = parsed.models.filter(
        (model) => model.diagramKind === "analysis",
      );
      if (analysisModels.length === 0) {
        const received =
          parsed.models.map((model) => model.diagramKind).join(", ") || "none";
        throw new Error(
          `generate_models returned no selected models; expected analysis, received ${received}`,
        );
      }
      const result: {
        models: AnalysisRequirementModel[];
        requirementModelTraceability: RequirementModelTraceabilityEntry[];
      } = {
        models: analysisModels,
        requirementModelTraceability: [],
      };
      appendRequirementTrace(record, {
        stage: "generate_models",
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: result,
      });
      return result;
    } catch (error) {
      logFailedStructuredOutput(
        "generate_models",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendRequirementTrace(record, {
        stage: "generate_models",
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: content,
        errorMessage: lastErrorMessage,
      });
      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        throw new Error(`generate_models structured output failed: ${lastErrorMessage}`);
      }
      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_models",
          progress: stageProgressValue("generate_models"),
          message: `需求分析模型结构不合法，正在修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );
      onActivity?.();
      prompt = buildRepairModelsPrompt(
        [],
        buildEmptyRequirementBaseline({ runId: record.snapshot.runId }),
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(`generate_models structured output failed: ${lastErrorMessage}`);
}

function missingUseCasesForAnalysis(
  analysisModels: AnalysisRequirementModel[],
  useCaseModel: DiagramModelSpec,
  targetUseCaseIds = new Set<string>(),
) {
  const covered = new Set(analysisModels.map(analysisSourceUseCaseId));
  return useCasesFromModel(useCaseModel).filter(
    (useCase) =>
      (targetUseCaseIds.size === 0 || targetUseCaseIds.has(useCase.id)) &&
      !covered.has(useCase.id),
  );
}

function analysisTargetUseCaseIds(snapshot: RunSnapshot) {
  return new Set(
    (snapshot.analysisTargetUseCaseIds ?? [])
      .map((id) => compactText(id))
      .filter((id) => id.length > 0),
  );
}

function analysisModelMatchesTarget(
  model: AnalysisRequirementModel,
  targetUseCaseIds: Set<string>,
) {
  return targetUseCaseIds.has(analysisSourceUseCaseId(model));
}

function analysisTraceabilityMatchesTarget(
  entry: RequirementModelTraceabilityEntry,
  targetUseCaseIds: Set<string>,
) {
  if (entry.target.diagramKind !== "analysis") return false;
  const modelId = compactText(entry.target.modelId);
  if (!modelId.startsWith("analysis:")) return false;
  return targetUseCaseIds.has(modelId.slice("analysis:".length));
}

function validateUseCaseAnalysisCoverage(
  analysisModels: AnalysisRequirementModel[],
  useCaseModel: DiagramModelSpec,
  targetUseCaseIds = new Set<string>(),
) {
  const useCases = useCasesFromModel(useCaseModel).filter(
    (useCase) => targetUseCaseIds.size === 0 || targetUseCaseIds.has(useCase.id),
  );
  const missing = missingUseCasesForAnalysis(
    analysisModels,
    useCaseModel,
    targetUseCaseIds,
  );
  if (
    (targetUseCaseIds.size === 0 && analysisModels.length !== useCases.length) ||
    missing.length > 0
  ) {
    const preview = missing
      .slice(0, 8)
      .map((useCase) => `${useCase.id}:${useCase.name}`)
      .join("、");
    throw new Error(
      `需求分析模型必须为每个用例生成一个独立分析顺序图；缺少 ${missing.length} 个用例：${preview}`,
    );
  }
}

function autoFillTraceabilityForParsedModels(
  record: RunRecord,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
  attempt: number,
  traceabilityErrorBeforeAutoFill: string,
) {
  const initialCoverage = normalizeRequirementTraceabilityWithCoverage(
    [],
    rules,
    models,
  );
  const fallbackTargets =
    initialCoverage.missingTargets.length > 0
      ? initialCoverage.missingTargets
      : collectModelRefs(models).refs;
  const recoveredCoverage = normalizeRequirementTraceabilityWithCoverage(
    autoFillRequirementTraceability(fallbackTargets, rules),
    rules,
    models,
  );
  if (
    recoveredCoverage.traceability.length === 0 ||
    recoveredCoverage.missingTargets.length > 0
  ) {
    return null;
  }
  appendRequirementTrace(record, {
    stage: "generate_models",
    attempt,
    kind: "parsed_model",
    parsedData: {
      models,
      requirementModelTraceability: recoveredCoverage.traceability,
      autoFilledRequirementTraceability: true,
      traceabilityErrorBeforeAutoFill,
      missingTargetsBeforeAutoFill: fallbackTargets,
    },
  });
  return recoveredCoverage.traceability;
}

function buildCompactActivityModelPrompt(
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
) {
  const compactRequirements = requirementBaseline.requirements.map((requirement) => ({
    id: requirement.id,
    type: requirement.type,
    actor: requirement.actor,
    action: requirement.action,
    object: requirement.object,
    condition: requirement.condition,
    outcome: requirement.outcome,
    acceptanceCriteria: requirement.acceptanceCriteria,
  }));
  return [
    "请只生成需求阶段总体业务流程 activity 模型。",
    "这是 activity 子任务超时后的精简重试：优先返回完整、合法、较小的 JSON，不要输出解释、Markdown 或代码块。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[]}。",
    "models 必须且只能包含一个 diagramKind=\"activity\" 的模型。",
    "activity 模型字段必须包含 diagramKind, title, summary, notes, swimlanes, nodes, relationships。",
    "nodes 建议 8-16 个，必须覆盖主流程、关键状态流、权限/异常分支和超时触发。",
    "节点类型只能使用 start, end, activity, decision, merge, fork, join。",
    "activity 节点字段：id, type, name, description(可选), actorOrLane(可选), input(string[]), output(string[])。",
    "decision 节点字段：id, type, name, question。",
    "relationships 字段：id, type(control_flow|object_flow), sourceId, targetId, guard/trigger/description(可选)。",
    "所有 relationship 的 sourceId/targetId 必须引用 nodes 中存在的 id。",
    "必须包含一个 start 节点和至少一个 end 节点；不要把所有业务节点都标成 start 或 end。",
    "requirementModelTraceability 固定返回 []，系统会自动补齐追踪关系。",
    "",
    "Activity 相关规则：",
    JSON.stringify(rules, null, 2),
    "",
    "压缩后的 RequirementBaseline 需求项：",
    JSON.stringify(compactRequirements, null, 2),
  ].join("\n");
}

function buildCompactAnalysisModelPrompt(useCase: UseCaseForAnalysis) {
  const compactUseCase = {
    id: useCase.id,
    name: useCase.name,
    goal: useCase.goal,
    preconditions: useCase.preconditions,
    postconditions: useCase.postconditions,
    eventFlows: useCase.eventFlows,
  };
  return [
    "请只为单个用例生成需求分析顺序图 analysis 模型。",
    "这是 analysis 子任务超时后的精简重试：优先返回完整、合法、较小的 JSON，不要输出解释、Markdown 或代码块。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[]}。",
    "models 必须且只能包含一个 diagramKind=\"analysis\" 的模型。",
    `analysis 模型必须使用 modelId=\"${analysisModelIdForUseCase(useCase)}\"、sourceUseCaseId=\"${useCase.id}\"、sourceUseCaseName=\"${useCase.name}\"。`,
    "analysis 模型字段必须包含 diagramKind, modelId, sourceUseCaseId, sourceUseCaseName, title, summary, notes, participants, messages, fragments。",
    "participants 建议 3-6 个，participantType 只能使用 actor, boundary, control, entity, external。",
    "messages 建议 4-10 条，必须覆盖主成功场景、关键权限/异常分支和系统响应；sourceId/targetId 必须引用 participants 中存在的 id。",
    "fragments 可以为空数组；如使用 alt/loop/opt，必须保持 messageIds 引用 messages 中存在的 id。",
    "requirementModelTraceability 固定返回 []。",
    "",
    "单个用例上下文：",
    JSON.stringify(compactUseCase, null, 2),
  ].join("\n");
}

function isProviderTimeout(runError: ReturnType<typeof normalizeRunError>) {
  return (
    runError.code === "PLATFORM_PROVIDER_TIMEOUT" ||
    runError.message.includes("长时间无有效输出") ||
    runError.message.includes("响应超时")
  );
}

async function generateRequirementTraceabilityWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
  models: DiagramModelSpec[],
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
) {
  const responseFormat = getGenerateRequirementTraceabilityResponseFormat(
      providerSettings,
    );
  let prompt = buildGenerateRequirementTraceabilityPrompt(
    rules,
    requirementBaseline,
    models,
  );
  let previousOutput = "";
  let lastErrorMessage = "";
  let accumulatedTraceability: RequirementModelTraceabilityEntry[] = [];
  let missingTargets: ModelElementRef[] =
    normalizeRequirementTraceabilityWithCoverage([], rules, models).missingTargets;
  if (missingTargets.length === 0) {
    appendRequirementTrace(record, {
      stage: "generate_models",
      attempt: 1,
      kind: "parsed_model",
      parsedData: {
        models,
        requirementModelTraceability: [],
        skippedRequirementTraceability: true,
        skipReason: "no-mappable-requirement-model-elements",
      },
    });
    return [];
  }

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      createRunLlmChunkHandlers({
        record,
        stage: "generate_models",
        onActivity,
        onBlankActivity,
      }),
      responseFormat,
      abortSignal,
    );
    previousOutput = content;
    appendRequirementTrace(record, {
      stage: "generate_models",
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: content,
    });

    try {
      const parsed = parseRequirementTraceabilityCoverageResult(
        content,
        rules,
        models,
      );
      accumulatedTraceability = mergeRequirementTraceability(
        accumulatedTraceability,
        parsed.traceability,
      );
      const coverage = normalizeRequirementTraceabilityWithCoverage(
        accumulatedTraceability,
        rules,
        models,
      );
      accumulatedTraceability = coverage.traceability;
      missingTargets = coverage.missingTargets;
      if (accumulatedTraceability.length === 0) {
        throw new Error(
          "generate_models must return non-empty requirementModelTraceability with valid rule-to-element references",
        );
      }
      if (missingTargets.length > 0) {
        throw new Error(formatTraceabilityMissingRefs("requirement", missingTargets));
      }
      appendRequirementTrace(record, {
        stage: "generate_models",
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: {
          models,
          requirementModelTraceability: accumulatedTraceability,
        },
      });
      return accumulatedTraceability;
    } catch (error) {
      logFailedStructuredOutput(
        "generate_models",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendRequirementTrace(record, {
        stage: "generate_models",
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: content,
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        const missingTargetsBeforeAutoFill = missingTargets;
        const recoveredTraceability = mergeRequirementTraceability(
          accumulatedTraceability,
          autoFillRequirementTraceability(missingTargets, rules),
        );
        const recoveredCoverage = normalizeRequirementTraceabilityWithCoverage(
          recoveredTraceability,
          rules,
          models,
        );
        if (
          recoveredCoverage.traceability.length > 0 &&
          recoveredCoverage.missingTargets.length === 0
        ) {
          appendRequirementTrace(record, {
            stage: "generate_models",
            attempt: attempt + 1,
            kind: "parsed_model",
            parsedData: {
              models,
              requirementModelTraceability: recoveredCoverage.traceability,
              autoFilledRequirementTraceability: true,
              invalidTraceabilityAttempts: attempt + 1,
              missingTargetsBeforeAutoFill,
            },
          });
          return recoveredCoverage.traceability;
        }
        throw new Error(
          `requirement traceability structured output failed: ${lastErrorMessage}; ${formatTraceabilityMissingRefs("requirement", recoveredCoverage.missingTargets.length > 0 ? recoveredCoverage.missingTargets : missingTargetsBeforeAutoFill)}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_models",
          progress: stageProgressValue("generate_models"),
          message: `模型元素映射不合法，正在单独修复可追踪关系（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );
      onActivity?.();

      prompt = buildRepairRequirementTraceabilityPrompt(
        rules,
        requirementBaseline,
        models,
        previousOutput,
        lastErrorMessage,
        missingTargets,
      );
    }
  }

  throw new Error(
    `requirement traceability structured output failed: ${lastErrorMessage}; ${formatTraceabilityMissingRefs("requirement", missingTargets)}`,
  );
}

// LLM structured output repair retries malformed requirement models without changing the run event contract.
export async function generateModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
  selectedDiagrams: DiagramKind[],
  promptOverride?: string,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
) {
  const responseFormat = getGenerateModelsResponseFormat(
      providerSettings,
      selectedDiagrams,
    );
  let prompt =
    promptOverride ??
    buildGenerateModelsPrompt(
      rules,
      requirementBaseline,
      selectedDiagrams,
    );
  let previousOutput = "";
  let lastErrorMessage = "";
  const singleDiagram = selectedDiagrams.length === 1 ? selectedDiagrams[0] : undefined;

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      createRunLlmChunkHandlers({
        record,
        stage: "generate_models",
        onActivity,
        onBlankActivity,
        diagramKind: singleDiagram,
        subtaskId: singleDiagram,
      }),
      responseFormat,
      abortSignal,
    );
    previousOutput = content;
    appendRequirementTrace(record, {
      stage: "generate_models",
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: content,
    });

    try {
      const parsed = parseRequirementDiagramModelsResult(content, rules);
      const selectedSet = new Set(selectedDiagrams);
      const filteredModels = parsed.models.filter((model) =>
        selectedSet.has(model.diagramKind),
      );
      if (selectedDiagrams.length > 0 && filteredModels.length === 0) {
        const received = parsed.models
          .map((model) => model.diagramKind)
          .filter(Boolean)
          .join(", ") || "none";
        throw new Error(
          `generate_models returned no selected models; expected ${selectedDiagrams.join(", ")}, received ${received}`,
        );
      }
      const filteredTraceability = parsed.requirementModelTraceability.filter((entry) =>
        selectedSet.has(entry.target.diagramKind as DiagramKind),
      );
      const filteredParsed = {
        models: filteredModels,
        requirementModelTraceability: filteredTraceability,
      };
      appendRequirementTrace(record, {
        stage: "generate_models",
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: filteredParsed,
      });
      return filteredParsed;
    } catch (error) {
      const modelOnly = (() => {
        try {
          return parseRequirementDiagramModelsOnly(content);
        } catch {
          return null;
        }
      })();
      if (modelOnly) {
        lastErrorMessage = formatParseError(error);
        const selectedSet = new Set(selectedDiagrams);
        const selectedModels = modelOnly.models.filter((model) =>
          selectedSet.has(model.diagramKind),
        );
        if (selectedDiagrams.length > 0 && selectedModels.length === 0) {
          const received = modelOnly.models
            .map((model) => model.diagramKind)
            .filter(Boolean)
            .join(", ") || "none";
          lastErrorMessage =
            `generate_models returned no selected models; expected ${selectedDiagrams.join(", ")}, received ${received}`;
          appendRequirementTrace(record, {
            stage: "generate_models",
            attempt: attempt + 1,
            kind: "parse_error",
            rawOutput: content,
            errorMessage: lastErrorMessage,
          });
          if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
            throw new Error(`generate_models structured output failed: ${lastErrorMessage}`);
          }
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_models",
              progress: stageProgressValue("generate_models"),
              message: `模型类型不匹配，正在修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
            }),
          );
          onActivity?.();
          prompt = buildRepairModelsPrompt(
            rules,
            requirementBaseline,
            selectedDiagrams,
            previousOutput,
            lastErrorMessage,
          );
          continue;
        }
        appendRequirementTrace(record, {
          stage: "generate_models",
          attempt: attempt + 1,
          kind: "parse_error",
          rawOutput: content,
          errorMessage: lastErrorMessage,
        });
        const autoFilledTraceability = autoFillTraceabilityForParsedModels(
          record,
          rules,
          selectedModels,
          attempt + 1,
          lastErrorMessage,
        );
        if (autoFilledTraceability) {
          return {
            models: selectedModels,
            requirementModelTraceability: autoFilledTraceability.filter((entry) =>
              selectedSet.has(entry.target.diagramKind as DiagramKind),
            ),
          };
        }
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message: "模型元素映射缺失，正在单独生成可追踪关系",
          }),
        );
        onActivity?.();
        let requirementModelTraceability: RequirementModelTraceabilityEntry[];
        try {
          requirementModelTraceability = await generateRequirementTraceabilityWithRepair(
            record,
            providerSettings,
            llmTransport,
            rules,
            requirementBaseline,
            selectedModels,
            onActivity,
            onBlankActivity,
            abortSignal,
          );
        } catch (traceabilityError) {
          const traceabilityErrorMessage = formatParseError(traceabilityError);
          const autoFilledTraceability = autoFillTraceabilityForParsedModels(
            record,
            rules,
            selectedModels,
            attempt + 1,
            traceabilityErrorMessage,
          );
          if (!autoFilledTraceability) {
            throw traceabilityError;
          }
          requirementModelTraceability = autoFilledTraceability;
        }
        return {
          models: selectedModels,
          requirementModelTraceability: requirementModelTraceability.filter((entry) =>
            selectedSet.has(entry.target.diagramKind as DiagramKind),
          ),
        };
      }

      logFailedStructuredOutput(
        "generate_models",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendRequirementTrace(record, {
        stage: "generate_models",
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: content,
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        throw new Error(
          `generate_models structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_models",
          progress: stageProgressValue("generate_models"),
          message: `模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );
      onActivity?.();

      prompt = buildRepairModelsPrompt(
        rules,
        requirementBaseline,
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(`generate_models structured output failed: ${lastErrorMessage}`);
}

// route -> pipeline -> record store contract: this pipeline mutates the run snapshot and emits stage/artifact events.
export async function runStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as RunSnapshot;

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

  let rules: RequirementRule[] = [...snapshot.rules];
  let models: DiagramModelSpec[] = [...snapshot.models];
  let requirementModelTraceability: RunSnapshot["requirementModelTraceability"] = [
    ...snapshot.requirementModelTraceability,
  ];
  let plantUml: PlantUmlArtifact[] = [];
  let svgArtifacts: SvgArtifact[] = [];
  const renderFailures: string[] = [];
  let diagramErrors: Partial<Record<DiagramKind, DiagramError>> = {};

  const renderRequirementModelArtifact = async (model: DiagramModelSpec) => {
    throwIfRunCancelled(record);
    const artifacts = generatePlantUmlArtifacts([model]);
    for (const artifact of artifacts) {
      const subtaskLabel = requirementArtifactSubtaskLabel(model, artifact);
      appendRequirementTrace(record, {
        stage: "generate_plantuml",
        attempt: 1,
        kind: "plantuml_source",
        diagramKind: artifact.diagramKind,
        plantUmlSource: artifact.source,
      });
      plantUml = replaceRequirementPlantUmlArtifact(plantUml, artifact);
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
      plantUml = replaceRequirementPlantUmlArtifact(
        plantUml,
        rendered.artifact as PlantUmlArtifact,
      );
      snapshot.plantUml = plantUml;
      if (rendered.status === "success") {
        svgArtifacts = replaceRequirementSvgArtifact(
          svgArtifacts,
          rendered.svgArtifact as SvgArtifact,
        );
        snapshot.svgArtifacts = svgArtifacts;
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
      diagramErrors[artifact.diagramKind] = diagramErrorSchema.parse({
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

  throwIfRunCancelled(record);
  if (rules.length === 0 || snapshot.selectedDiagrams.length === 0) {
    updateStage("extract_rules", "正在抽取需求规则");
    const timeoutConfig = readRequirementModelTaskTimeoutConfig();
    const ruleResult = await withModelTaskTimeout(
      (markActivity, markBlankActivity, abortSignal) => {
        const chunkHandlers = createRunLlmChunkHandlers({
          record,
          stage: "extract_rules",
        });
        return collectStructuredResult(
          llmTransport,
          providerSettings,
          createMessages(buildExtractRulesPrompt(snapshot.requirementText)),
          "extract_rules",
          {
            onChunk: (chunk) => {
              markActivity();
              chunkHandlers.onChunk(chunk);
            },
            onBlankChunk: (chunk) => {
              markBlankActivity();
              chunkHandlers.onBlankChunk?.(chunk);
            },
          },
          (text) => normalizeRequirementRulesResult(parseJson(text)),
          getExtractRequirementRulesResponseFormat(providerSettings),
          undefined,
          abortSignal,
        );
      },
      {
        ...timeoutConfig,
        label: "需求规则抽取",
        isCancelled: () => isRunCancelled(record),
        createCancelError: () => new RunCancelledError(snapshot.runId),
      },
    );
    throwIfRunCancelled(record);
    rules = ruleResult.rules;
    snapshot.rules = rules;
    snapshot.requirementBaseline = buildRequirementBaseline({
      runId: snapshot.runId,
      requirementText: snapshot.requirementText,
      rules,
    });
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "extract_rules",
        artifactKind: "rules",
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "extract_rules",
        artifactKind: "requirementBaseline",
      }),
    );
  }

  if (!snapshot.requirementBaseline && rules.length > 0) {
    snapshot.requirementBaseline = buildRequirementBaseline({
      runId: snapshot.runId,
      requirementText: snapshot.requirementText,
      rules,
    });
  }
  const requirementBaseline =
    snapshot.requirementBaseline ?? buildEmptyRequirementBaseline({ runId: snapshot.runId });
  snapshot.requirementBaseline = requirementBaseline;
  assertRequirementBaselineAllowsDownstream(requirementBaseline);

  updateStage("generate_models", "正在生成结构化模型");
  if (snapshot.selectedDiagrams.length > 0) {
    const generateRequirementDiagram = async (
      diagram: Exclude<DiagramKind, "analysis">,
    ) => {
      const diagramRules = rules.filter((rule) =>
        rule.relatedDiagrams.includes(diagram),
      );
      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_models",
          progress: stageProgressValue("generate_models"),
          message: `正在生成：${diagram}`,
          diagramKind: diagram,
          subtaskId: diagram,
          subtaskStatus: "running",
        }),
      );
      try {
        throwIfRunCancelled(record);
        const modelRules = diagramRules.length > 0 ? diagramRules : rules;
        const timeoutConfig = readRequirementModelTaskTimeoutConfig();
        const runModelGeneration = (promptOverride?: string, labelSuffix = "") =>
          withModelTaskTimeout(
            (markActivity, markBlankActivity, abortSignal) => generateModelsWithRepair(
              record,
              providerSettings,
              llmTransport,
              modelRules,
              requirementBaseline,
              [diagram],
              promptOverride,
              markActivity,
              markBlankActivity,
              abortSignal,
            ),
            {
              ...timeoutConfig,
              label: `${diagram}需求模型生成${labelSuffix}`,
              isCancelled: () => isRunCancelled(record),
              createCancelError: () => new RunCancelledError(snapshot.runId),
            },
          );
        let result: Awaited<ReturnType<typeof generateModelsWithRepair>>;
        try {
          result = await runModelGeneration();
        } catch (error) {
          const runError = normalizeRunError(error);
          if (diagram !== "activity" || !isProviderTimeout(runError)) {
            throw error;
          }
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_models",
              progress: stageProgressValue("generate_models"),
              message: "activity 需求模型长时间无有效输出，正在使用精简活动图提示重试",
              diagramKind: diagram,
              subtaskId: diagram,
              subtaskStatus: "repairing",
            }),
          );
          result = await runModelGeneration(
            buildCompactActivityModelPrompt(modelRules, requirementBaseline),
            "（精简重试）",
          );
        }
        models = [
          ...models.filter((model) => model.diagramKind !== diagram),
          ...result.models,
        ];
        requirementModelTraceability = [
          ...requirementModelTraceability.filter(
            (entry) => entry.target.diagramKind !== diagram,
          ),
          ...result.requirementModelTraceability,
        ];
        delete diagramErrors[diagram];
        snapshot.models = models;
        snapshot.requirementModelTraceability = requirementModelTraceability;
        snapshot.diagramErrors = diagramErrors;
        emitEvent(
          record,
          artifactReadyRunEventSchema.parse({
            type: "artifact_ready",
            stage: "generate_models",
            artifactKind: "model",
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskStatus: "completed",
          }),
        );
        throwIfRunCancelled(record);
        await Promise.all(result.models.map(renderRequirementModelArtifact));
        return { diagram, result };
      } catch (error) {
        throwIfRunCancelled(record);
        const runError = normalizeRunError(error);
        const message = runError.message || `${diagram} 模型生成失败`;
        diagramErrors[diagram] = diagramErrorSchema.parse({
          stage: "generate_models",
          error: runError,
        });
        snapshot.diagramErrors = diagramErrors;
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message,
            error: runError,
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskStatus: "failed",
          }),
        );
        return null;
      }
    };

    const selectedSet = new Set(snapshot.selectedDiagrams);
    const needsAnalysis = selectedSet.has("analysis");
    const prerequisiteDiagrams = snapshot.selectedDiagrams.filter(
      (diagram): diagram is Exclude<DiagramKind, "analysis"> =>
        diagram !== "analysis",
    );
    const hasUseCaseContext = models.some((model) => model.diagramKind === "usecase");
    if (needsAnalysis && !hasUseCaseContext && !prerequisiteDiagrams.includes("usecase")) {
      prerequisiteDiagrams.unshift("usecase");
      snapshot.requestedDiagrams ??= ["analysis"];
      snapshot.dependencyDiagrams = [
        ...new Set([...(snapshot.dependencyDiagrams ?? []), "usecase"]),
      ] as DiagramKind[];
      snapshot.selectedDiagrams = [
        ...new Set(["usecase", ...snapshot.selectedDiagrams]),
      ] as DiagramKind[];
    }

    const prerequisiteTasks = new Map(
      prerequisiteDiagrams.map((diagram) => [
        diagram,
        generateRequirementDiagram(diagram),
      ] as const),
    );
    if (needsAnalysis && prerequisiteTasks.has("usecase")) {
      await prerequisiteTasks.get("usecase");
      throwIfRunCancelled(record);
    }

    if (needsAnalysis) {
      const useCaseModel = models.find((model) => model.diagramKind === "usecase");
      if (!useCaseModel) {
        await Promise.all(prerequisiteTasks.values());
        throw new Error("缺少用例模型，无法基于事件流生成需求分析模型");
      }

      const targetUseCaseIds = analysisTargetUseCaseIds(snapshot);
      const allAnalysisUseCases = useCasesFromModel(useCaseModel);
      const analysisUseCases =
        targetUseCaseIds.size > 0
          ? allAnalysisUseCases.filter((useCase) => targetUseCaseIds.has(useCase.id))
          : allAnalysisUseCases;
      if (targetUseCaseIds.size > 0 && analysisUseCases.length === 0) {
        throw new Error(
          `未找到可补跑的需求分析用例：${Array.from(targetUseCaseIds).join("、")}`,
        );
      }

      const preservedAnalysisModels = models.filter(
        (model): model is AnalysisRequirementModel =>
          model.diagramKind === "analysis" &&
          targetUseCaseIds.size > 0 &&
          !analysisModelMatchesTarget(model, targetUseCaseIds),
      );
      models = models.filter(
        (model) =>
          model.diagramKind !== "analysis" ||
          (targetUseCaseIds.size > 0 &&
            !analysisModelMatchesTarget(model as AnalysisRequirementModel, targetUseCaseIds)),
      );
      requirementModelTraceability = requirementModelTraceability.filter(
        (entry) =>
          entry.target.diagramKind !== "analysis" ||
          (targetUseCaseIds.size > 0 &&
            !analysisTraceabilityMatchesTarget(entry, targetUseCaseIds)),
      );

      const generateAnalysisForUseCase = async (useCase: UseCaseForAnalysis) => {
        throwIfRunCancelled(record);
        const modelId = analysisModelIdForUseCase(useCase);
        const scopedUseCaseModel = useCaseModelForSingleUseCase(
          useCaseModel,
          useCase.id,
        );
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message: `正在生成需求分析模型：${useCase.name}`,
            diagramKind: "analysis",
            modelId,
            subtaskId: modelId,
            subtaskLabel: `需求分析模型：${useCase.name}`,
            subtaskStatus: "running",
          }),
        );
        try {
          if (!useCaseHasEventFlows(useCase)) {
            throw new Error(`${useCase.name}缺少事件流，无法生成需求分析模型`);
          }
          const timeoutConfig = readRequirementModelTaskTimeoutConfig();
          const runAnalysisGeneration = (promptOverride?: string, labelSuffix = "") =>
            withModelTaskTimeout(
              (markActivity, markBlankActivity, abortSignal) =>
                generateAnalysisModelWithRepair(
                  record,
                  providerSettings,
                  llmTransport,
                  scopedUseCaseModel,
                  markActivity,
                  markBlankActivity,
                  abortSignal,
                  promptOverride,
                ),
              {
                ...timeoutConfig,
                label: `${useCase.name}需求分析模型生成${labelSuffix}`,
                isCancelled: () => isRunCancelled(record),
                createCancelError: () => new RunCancelledError(snapshot.runId),
              },
            );
          let rawResult: Awaited<ReturnType<typeof generateAnalysisModelWithRepair>>;
          try {
            rawResult = await runAnalysisGeneration();
          } catch (error) {
            const runError = normalizeRunError(error);
            if (!isProviderTimeout(runError)) {
              throw error;
            }
            emitEvent(
              record,
              stageProgressRunEventSchema.parse({
                type: "stage_progress",
                stage: "generate_models",
                progress: stageProgressValue("generate_models"),
                message: `需求分析模型 ${useCase.name} 长时间无有效输出，正在使用精简单用例提示重试`,
                diagramKind: "analysis",
                modelId,
                subtaskId: modelId,
                subtaskLabel: `需求分析模型：${useCase.name}`,
                subtaskStatus: "repairing",
              }),
            );
            rawResult = await runAnalysisGeneration(
              buildCompactAnalysisModelPrompt(useCase),
              "（精简重试）",
            );
          }
          const result = coerceAnalysisModelForUseCase(rawResult, useCase);
          models = mergeRequirementModels(models, result.models);
          requirementModelTraceability = [
            ...requirementModelTraceability.filter(
              (entry) => entry.target.modelId !== modelId,
            ),
            ...result.requirementModelTraceability,
          ];
          delete diagramErrors.analysis;
          snapshot.models = models;
          snapshot.requirementModelTraceability = requirementModelTraceability;
          snapshot.diagramErrors = diagramErrors;
          emitEvent(
            record,
            artifactReadyRunEventSchema.parse({
              type: "artifact_ready",
              stage: "generate_models",
              artifactKind: "model",
              diagramKind: "analysis",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `需求分析模型：${useCase.name}`,
              subtaskStatus: "completed",
            }),
          );
          await Promise.all(result.models.map(renderRequirementModelArtifact));
          return result;
        } catch (error) {
          throwIfRunCancelled(record);
          const runError = normalizeRunError(error);
          const message = runError.message || `${useCase.name}需求分析模型生成失败`;
          diagramErrors.analysis = diagramErrorSchema.parse({
            stage: "generate_models",
            error: runError,
          });
          snapshot.diagramErrors = diagramErrors;
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_models",
              progress: stageProgressValue("generate_models"),
              message,
              error: runError,
              diagramKind: "analysis",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `需求分析模型：${useCase.name}`,
              subtaskStatus: "failed",
            }),
          );
          return null;
        }
      };

      let analysisResults = await mapWithConcurrency(
        analysisUseCases,
        readRequirementAnalysisConcurrency(),
        generateAnalysisForUseCase,
      );
      throwIfRunCancelled(record);
      let analysisModels = analysisResults
        .flatMap((result) => result?.models ?? [])
        .filter(
          (model): model is AnalysisRequirementModel =>
            model.diagramKind === "analysis",
        );
      analysisModels = mergeRequirementModels(
        preservedAnalysisModels,
        analysisModels,
      ).filter(
        (model): model is AnalysisRequirementModel => model.diagramKind === "analysis",
      );
      const coverageRetryLimit = 2;
      for (let attempt = 0; attempt < coverageRetryLimit; attempt += 1) {
        const missingUseCases = missingUseCasesForAnalysis(
          analysisModels,
          useCaseModel,
          targetUseCaseIds,
        );
        if (missingUseCases.length === 0) break;
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message: `正在补跑缺失的需求分析模型：${missingUseCases
              .map((useCase) => useCase.name)
              .join("、")}`,
            diagramKind: "analysis",
            subtaskId: "analysis:coverage-retry",
            subtaskLabel: "需求分析模型覆盖补跑",
            subtaskStatus: "running",
          }),
        );
        const retryResults = await mapWithConcurrency(
          missingUseCases,
          readRequirementAnalysisConcurrency(),
          generateAnalysisForUseCase,
        );
        analysisResults = [...analysisResults, ...retryResults];
        analysisModels = analysisResults
          .flatMap((result) => result?.models ?? [])
          .filter(
            (model): model is AnalysisRequirementModel =>
              model.diagramKind === "analysis",
          );
        analysisModels = mergeRequirementModels(
          preservedAnalysisModels,
          analysisModels,
        ).filter(
          (model): model is AnalysisRequirementModel => model.diagramKind === "analysis",
        );
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message: "需求分析模型覆盖补跑完成",
            diagramKind: "analysis",
            subtaskId: "analysis:coverage-retry",
            subtaskLabel: "需求分析模型覆盖补跑",
            subtaskStatus: "completed",
          }),
        );
      }
      if (analysisModels.length === 0) {
        throw new Error("需求分析模型生成结果缺少 analysis 模型");
      }
      validateUseCaseAnalysisCoverage(analysisModels, useCaseModel, targetUseCaseIds);
      models = mergeRequirementModels(models, analysisModels);
      requirementModelTraceability = [
        ...requirementModelTraceability.filter(
          (entry) => entry.target.diagramKind !== "analysis",
        ),
      ];
    }
    await Promise.all(prerequisiteTasks.values());
    throwIfRunCancelled(record);

    if (snapshot.selectedDiagrams.length > 0 && models.length === 0) {
      const firstError = Object.values(diagramErrors)[0]?.error;
      if (firstError) throwRunError(firstError);
      throwRunError(createRunError("RUN_MODEL_OUTPUT_EMPTY", "需求模型生成失败"));
    }
  }
  snapshot.models = models;
  snapshot.requirementModelTraceability = requirementModelTraceability;
  snapshot.diagramErrors = diagramErrors;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "model",
    }),
  );
  const trustedChain = buildRequirementStageTrustedChain({
    runId: snapshot.runId,
    baseline: requirementBaseline,
    models,
    requirementModelTraceability,
  });
  snapshot.coverageMatrix = trustedChain.coverageMatrix;
  snapshot.traceabilityMatrix = trustedChain.traceabilityMatrix;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "coverageMatrix",
      coverageMatrix: trustedChain.coverageMatrix,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "traceabilityMatrix",
      traceabilityMatrix: trustedChain.traceabilityMatrix,
    }),
  );
  assertTrustedChainAllowsCompletion(trustedChain);

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
  snapshot.error = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}
