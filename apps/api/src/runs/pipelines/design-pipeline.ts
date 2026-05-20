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
  parseDesignTraceabilityCoverageResult,
} from "../../normalizers/design/design-model-normalizer.js";
import {
  formatTraceabilityMissingRefs,
  mergeDesignTraceability,
  normalizeDesignTraceabilityWithCoverage,
} from "../../normalizers/traceability/traceability-normalizer.js";
import { formatParseError } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { renderArtifactWithRepair } from "./render/render-artifact-with-repair.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import { appendDesignTrace } from "./shared/trace-events.js";

const MAX_MODEL_REPAIR_ATTEMPTS = 2;

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
  const responseFormat = getGenerateDesignTraceabilityResponseFormat(
    providerSettings.model,
  );
  let prompt = buildGenerateDesignTraceabilityPrompt(
    requirementText,
    rules,
    requirementModels,
    designModels,
  );
  let previousOutput = "";
  let lastErrorMessage = "";
  let accumulatedTraceability: DesignModelTraceabilityEntry[] = [];
  let missingSources: ModelElementRef[] =
    normalizeDesignTraceabilityWithCoverage([], designModels, requirementModels)
      .missingSources;
  const traceStage =
    stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";

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
            stage,
            chunk,
          }),
        );
      },
      responseFormat,
    );
    previousOutput = content;
    appendDesignTrace(record, {
      stage: traceStage,
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: content,
    });

    try {
      const parsed = parseDesignTraceabilityCoverageResult(
        content,
        designModels,
        requirementModels,
      );
      accumulatedTraceability = mergeDesignTraceability(
        accumulatedTraceability,
        parsed.traceability,
      );
      const coverage = normalizeDesignTraceabilityWithCoverage(
        accumulatedTraceability,
        designModels,
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
        throw new Error(formatTraceabilityMissingRefs("design", missingSources));
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
        rawOutput: content,
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
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
          message: `设计模型元素映射不合法，正在单独修复可追踪关系（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
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
    appendDesignTrace(record, {
      stage: traceStage,
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: content,
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
          rawOutput: content,
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
        rawOutput: content,
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

  let models: DesignDiagramModelSpec[] = [];
  let designModelTraceability: DesignRunSnapshot["designModelTraceability"] = [];
  let diagramErrors: Partial<Record<DesignDiagramKind, DiagramError>> = {};
  const useCaseModel = findRequirementModel(snapshot.requirementModels, "usecase");
  if (!useCaseModel) {
    throw new Error("缺少需求阶段用例模型，无法生成设计阶段顺序图");
  }

  updateStage("generate_design_sequence", "正在生成设计顺序图");
  const sequenceResult = await generateDesignModelsWithRepair(
    record,
    providerSettings,
    llmTransport,
    snapshot.requirementText,
    snapshot.rules,
    [useCaseModel],
    ["sequence"],
    buildGenerateDesignSequencePrompt(
      snapshot.requirementText,
      snapshot.rules,
      useCaseModel,
    ),
    "generate_design_sequence",
  );
  const sequenceModel = sequenceResult.models.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
      model.diagramKind === "sequence",
  );
  if (!sequenceModel) {
    throw new Error("设计顺序图生成结果缺少 sequence 模型");
  }
  models = [sequenceModel];
  designModelTraceability = [...sequenceResult.designModelTraceability];
  snapshot.models = models;
  snapshot.designModelTraceability = designModelTraceability;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_sequence",
      artifactKind: "model",
      diagramKind: "sequence",
    }),
  );

  const requestedDownstream = snapshot.selectedDiagrams.filter(
    (diagram): diagram is Exclude<DesignDiagramKind, "sequence"> =>
      diagram !== "sequence",
  );
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
    const sourceModels = downstreamWithSources
      .map((diagram) =>
        findRequirementModel(
          snapshot.requirementModels,
          sourceRequirementKindForDesign(diagram),
        ),
      )
      .filter((model): model is DiagramModelSpec => Boolean(model));
    const downstreamResult = await generateDesignModelsWithRepair(
      record,
      providerSettings,
      llmTransport,
      snapshot.requirementText,
      snapshot.rules,
      sourceModels,
      downstreamWithSources,
      buildGenerateDesignModelsPrompt(
        snapshot.requirementText,
        snapshot.rules,
        sourceModels,
        sequenceModel,
        downstreamWithSources,
      ),
      "generate_design_models",
    );
    models = [...models, ...downstreamResult.models];
    designModelTraceability = [
      ...designModelTraceability,
      ...downstreamResult.designModelTraceability,
    ];
    snapshot.models = models;
    snapshot.designModelTraceability = designModelTraceability;
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_design_models",
        artifactKind: "model",
      }),
    );
  }

  updateStage("generate_plantuml", "正在生成设计阶段 PlantUML");
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
      }),
    );
  }

  updateStage("render_svg", "正在渲染设计阶段 SVG");
  const repairedPlantUmlArtifacts: DesignPlantUmlArtifact[] = [];
  const svgArtifacts: DesignSvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    const model = models.find((item) => item.diagramKind === artifact.diagramKind);
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
    repairedPlantUmlArtifacts.push(rendered.artifact as DesignPlantUmlArtifact);
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as DesignSvgArtifact);
      emitEvent(
        record,
        artifactReadyRunEventSchema.parse({
          type: "artifact_ready",
          stage: "render_svg",
          artifactKind: "svg",
          diagramKind: artifact.diagramKind,
        }),
      );
      continue;
    }

    renderFailures.push(rendered.errorMessage);
    diagramErrors[artifact.diagramKind] = diagramErrorSchema.parse({
      stage: "render_svg",
      message: rendered.errorMessage,
    });
  }
  snapshot.plantUml = repairedPlantUmlArtifacts;
  snapshot.svgArtifacts = svgArtifacts;
  snapshot.diagramErrors = diagramErrors;

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  snapshot.currentStage = "render_svg";
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
