// Orchestrates requirement extraction, model generation, PlantUML, and SVG rendering.

import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  diagramErrorSchema,
  diagramModelsResultSchema,
  llmChunkRunEventSchema,
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
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { attachEvidencePackage } from "../evidence/evidence-package.js";
import { renderArtifactWithRepair } from "./render/render-artifact-with-repair.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import {
  collectStructuredResult,
  collectTextResult,
  logFailedStructuredOutput,
} from "./shared/structured-output.js";
import { appendRequirementTrace } from "./shared/trace-events.js";
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
  const raw = process.env.UML_REQUIREMENT_ANALYSIS_CONCURRENCY?.trim();
  if (!raw) return DEFAULT_REQUIREMENT_ANALYSIS_CONCURRENCY;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_REQUIREMENT_ANALYSIS_CONCURRENCY;
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

type UseCaseForAnalysis = ReturnType<typeof useCasesFromModel>[number];
type AnalysisRequirementModel = Extract<DiagramModelSpec, { diagramKind: "analysis" }>;

function requirementModelId(model: DiagramModelSpec) {
  return compactText((model as unknown as { modelId?: string }).modelId) || model.diagramKind;
}

const REQUIREMENT_DIAGRAM_LABELS: Record<DiagramKind, string> = {
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

function findRequirementModelForArtifact(
  models: DiagramModelSpec[],
  artifact: Pick<PlantUmlArtifact, "diagramKind" | "modelId">,
) {
  const artifactModelId = compactText(artifact.modelId);
  return models.find((item) =>
    artifactModelId
      ? requirementModelId(item) === artifactModelId
      : item.diagramKind === artifact.diagramKind,
  );
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
  result: Awaited<ReturnType<typeof generateModelsWithRepair>>,
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

function missingUseCasesForAnalysis(
  analysisModels: AnalysisRequirementModel[],
  useCaseModel: DiagramModelSpec,
) {
  const covered = new Set(analysisModels.map(analysisSourceUseCaseId));
  return useCasesFromModel(useCaseModel).filter((useCase) => !covered.has(useCase.id));
}

function validateUseCaseAnalysisCoverage(
  analysisModels: AnalysisRequirementModel[],
  useCaseModel: DiagramModelSpec,
) {
  const useCases = useCasesFromModel(useCaseModel);
  const missing = missingUseCasesForAnalysis(analysisModels, useCaseModel);
  if (analysisModels.length !== useCases.length || missing.length > 0) {
    const preview = missing
      .slice(0, 8)
      .map((useCase) => `${useCase.id}:${useCase.name}`)
      .join("、");
    throw new Error(
      `需求分析模型必须为每个用例生成一个独立分析顺序图；缺少 ${missing.length} 个用例：${preview}`,
    );
  }
}

async function generateRequirementTraceabilityWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
  models: DiagramModelSpec[],
) {
  const responseFormat = getGenerateRequirementTraceabilityResponseFormat(
    providerSettings.model,
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
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "generate_models",
            chunk,
          }),
        );
      },
      responseFormat,
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
) {
  const responseFormat = getGenerateModelsResponseFormat(
    providerSettings.model,
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

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "generate_models",
            chunk,
          }),
        );
      },
      responseFormat,
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
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message: "模型元素映射缺失，正在单独生成可追踪关系",
          }),
        );
        let requirementModelTraceability: RequirementModelTraceabilityEntry[];
        try {
          requirementModelTraceability = await generateRequirementTraceabilityWithRepair(
            record,
            providerSettings,
            llmTransport,
            rules,
            requirementBaseline,
            selectedModels,
          );
        } catch (traceabilityError) {
          const traceabilityErrorMessage = formatParseError(traceabilityError);
          const initialCoverage = normalizeRequirementTraceabilityWithCoverage(
            [],
            rules,
            selectedModels,
          );
          const fallbackTargets =
            initialCoverage.missingTargets.length > 0
              ? initialCoverage.missingTargets
              : collectModelRefs(selectedModels).refs;
          const recoveredCoverage = normalizeRequirementTraceabilityWithCoverage(
            autoFillRequirementTraceability(fallbackTargets, rules),
            rules,
            selectedModels,
          );
          if (
            recoveredCoverage.traceability.length === 0 ||
            recoveredCoverage.missingTargets.length > 0
          ) {
            throw traceabilityError;
          }
          appendRequirementTrace(record, {
            stage: "generate_models",
            attempt: attempt + 1,
            kind: "parsed_model",
            parsedData: {
              models: selectedModels,
              requirementModelTraceability: recoveredCoverage.traceability,
              autoFilledRequirementTraceability: true,
              traceabilityErrorBeforeAutoFill: traceabilityErrorMessage,
              missingTargetsBeforeAutoFill: fallbackTargets,
            },
          });
          requirementModelTraceability = recoveredCoverage.traceability;
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
  let diagramErrors: Partial<Record<DiagramKind, DiagramError>> = {};

  throwIfRunCancelled(record);
  if (rules.length === 0 || snapshot.selectedDiagrams.length === 0) {
    updateStage("extract_rules", "正在抽取需求规则");
    const ruleResult = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(buildExtractRulesPrompt(snapshot.requirementText)),
      "extract_rules",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "extract_rules",
            chunk,
          }),
        );
      },
      (text) => normalizeRequirementRulesResult(parseJson(text)),
      getExtractRequirementRulesResponseFormat(providerSettings.model),
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
        const result = await generateModelsWithRepair(
          record,
          providerSettings,
          llmTransport,
          diagramRules.length > 0 ? diagramRules : rules,
          requirementBaseline,
          [diagram],
        );
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
        return { diagram, result };
      } catch (error) {
        throwIfRunCancelled(record);
        const message =
          error instanceof Error ? error.message : `${diagram} 模型生成失败`;
        diagramErrors[diagram] = diagramErrorSchema.parse({
          stage: "generate_models",
          message,
        });
        snapshot.diagramErrors = diagramErrors;
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message,
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
    }

    await Promise.all(prerequisiteDiagrams.map(generateRequirementDiagram));
    throwIfRunCancelled(record);

    if (needsAnalysis) {
      const useCaseModel = models.find((model) => model.diagramKind === "usecase");
      if (!useCaseModel) {
        throw new Error("缺少用例模型，无法基于事件流生成需求分析模型");
      }

      models = models.filter((model) => model.diagramKind !== "analysis");
      requirementModelTraceability = requirementModelTraceability.filter(
        (entry) => entry.target.diagramKind !== "analysis",
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
          const diagramRules = rules.filter((rule) =>
            rule.relatedDiagrams.includes("analysis"),
          );
          const rawResult = await generateModelsWithRepair(
            record,
            providerSettings,
            llmTransport,
            diagramRules.length > 0 ? diagramRules : rules,
            requirementBaseline,
            ["analysis"],
            buildGenerateRequirementAnalysisPrompt(
              rules,
              requirementBaseline,
              scopedUseCaseModel,
            ),
          );
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
          return result;
        } catch (error) {
          throwIfRunCancelled(record);
          const message =
            error instanceof Error
              ? error.message
              : `${useCase.name}需求分析模型生成失败`;
          diagramErrors.analysis = diagramErrorSchema.parse({
            stage: "generate_models",
            message,
          });
          snapshot.diagramErrors = diagramErrors;
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_models",
              progress: stageProgressValue("generate_models"),
              message,
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
        useCasesFromModel(useCaseModel),
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
      const coverageRetryLimit = 2;
      for (let attempt = 0; attempt < coverageRetryLimit; attempt += 1) {
        const missingUseCases = missingUseCasesForAnalysis(analysisModels, useCaseModel);
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
      }
      if (analysisModels.length === 0) {
        throw new Error("需求分析模型生成结果缺少 analysis 模型");
      }
      validateUseCaseAnalysisCoverage(analysisModels, useCaseModel);
      models = mergeRequirementModels(models, analysisModels);
      requirementModelTraceability = [
        ...requirementModelTraceability.filter(
          (entry) => entry.target.diagramKind !== "analysis",
        ),
        ...analysisResults.flatMap(
          (result) => result?.requirementModelTraceability ?? [],
        ),
      ];
    }

    if (snapshot.selectedDiagrams.length > 0 && models.length === 0) {
      throw new Error(
        Object.values(diagramErrors)
          .map((error) => error.message)
          .join("；") || "需求模型生成失败",
      );
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

  updateStage("generate_plantuml", "正在生成 PlantUML");
  throwIfRunCancelled(record);
  plantUml = generatePlantUmlArtifacts(models);
  snapshot.plantUml = plantUml;
  for (const artifact of plantUml) {
    const model = findRequirementModelForArtifact(models, artifact);
    const subtaskLabel = requirementArtifactSubtaskLabel(model, artifact);
    appendRequirementTrace(record, {
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
        subtaskLabel,
        subtaskStatus: "completed",
      }),
    );
  }

  updateStage("render_svg", "正在渲染 SVG");
  const repairedPlantUmlArtifacts: PlantUmlArtifact[] = [];
  const svgArtifacts: SvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    throwIfRunCancelled(record);
    const model = findRequirementModelForArtifact(models, artifact);
    if (!model) {
      throw new Error(
        `Missing diagram model for ${artifact.modelId || artifact.diagramKind}`,
      );
    }
    const subtaskLabel = requirementArtifactSubtaskLabel(model, artifact);
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
    repairedPlantUmlArtifacts.push(rendered.artifact as PlantUmlArtifact);
    snapshot.plantUml = repairedPlantUmlArtifacts;
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as SvgArtifact);
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
