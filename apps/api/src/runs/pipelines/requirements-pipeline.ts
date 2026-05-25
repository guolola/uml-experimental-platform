// Orchestrates requirement extraction, model generation, PlantUML, and SVG rendering.

import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  diagramErrorSchema,
  diagramModelsResultSchema,
  llmChunkRunEventSchema,
  requirementRulesResultSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type DiagramError,
  type DiagramKind,
  type DiagramModelSpec,
  type ModelElementRef,
  type PlantUmlArtifact,
  type ProviderSettings,
  type RequirementModelTraceabilityEntry,
  type RequirementRule,
  type RunSnapshot,
  type RunStage,
  type SvgArtifact,
} from "@uml-platform/contracts";
import {
  buildExtractRulesPrompt,
  buildGenerateRequirementTraceabilityPrompt,
  buildGenerateModelsPrompt,
  buildRepairRequirementTraceabilityPrompt,
  buildRepairModelsPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../llm.js";
import { type RenderClient } from "../../adapters/render/render-client.js";
import {
  getGenerateModelsResponseFormat,
  getGenerateRequirementTraceabilityResponseFormat,
} from "../../adapters/llm/response-formats/index.js";
import { generatePlantUmlArtifacts } from "../../plantuml.js";
import {
  parseRequirementDiagramModelsOnly,
  parseRequirementDiagramModelsResult,
  parseRequirementTraceabilityCoverageResult,
} from "../../normalizers/requirements/requirement-model-normalizer.js";
import {
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
  buildRequirementBaseline,
} from "../baselines/requirement-baseline.js";
import {
  assertTrustedChainAllowsCompletion,
  buildRequirementStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const MAX_MODEL_REPAIR_ATTEMPTS = 2;

async function generateRequirementTraceabilityWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const responseFormat = getGenerateRequirementTraceabilityResponseFormat(
    providerSettings.model,
  );
  let prompt = buildGenerateRequirementTraceabilityPrompt(
    requirementText,
    rules,
    models,
  );
  let previousOutput = "";
  let lastErrorMessage = "";
  let accumulatedTraceability: RequirementModelTraceabilityEntry[] = [];
  let missingTargets: ModelElementRef[] =
    normalizeRequirementTraceabilityWithCoverage([], rules, models).missingTargets;

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
        throw new Error(
          `requirement traceability structured output failed: ${lastErrorMessage}`,
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
        requirementText,
        rules,
        models,
        previousOutput,
        lastErrorMessage,
        missingTargets,
      );
    }
  }

  throw new Error(
    `requirement traceability structured output failed: ${lastErrorMessage}`,
  );
}

// LLM structured output repair retries malformed requirement models without changing the run event contract.
export async function generateModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DiagramKind[],
) {
  const responseFormat = getGenerateModelsResponseFormat(providerSettings.model);
  let prompt = buildGenerateModelsPrompt(
    requirementText,
    rules,
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
        const requirementModelTraceability =
          await generateRequirementTraceabilityWithRepair(
            record,
            providerSettings,
            llmTransport,
            requirementText,
            rules,
            modelOnly.models,
          );
        const selectedSet = new Set(selectedDiagrams);
        return {
          models: modelOnly.models.filter((model) =>
            selectedSet.has(model.diagramKind),
          ),
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
        requirementText,
        rules,
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
  let models: DiagramModelSpec[] = [];
  let requirementModelTraceability: RunSnapshot["requirementModelTraceability"] = [];
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
      (text) => requirementRulesResultSchema.parse(parseJson(text)),
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
  assertRequirementBaselineAllowsDownstream(snapshot.requirementBaseline);

  updateStage("generate_models", "正在生成结构化模型");
  if (snapshot.selectedDiagrams.length > 0) {
    const generationResults = await Promise.all(
      snapshot.selectedDiagrams.map(async (diagram) => {
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
            snapshot.requirementText,
            diagramRules.length > 0 ? diagramRules : rules,
            [diagram],
          );
          emitEvent(
            record,
            artifactReadyRunEventSchema.parse({
              type: "artifact_ready",
              stage: "generate_models",
              artifactKind: "model",
              diagramKind: diagram,
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
          return null;
        }
      }),
    );
    throwIfRunCancelled(record);
    models = generationResults.flatMap((entry) => entry?.result.models ?? []);
    requirementModelTraceability = generationResults.flatMap(
      (entry) => entry?.result.requirementModelTraceability ?? [],
    );
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
    baseline: snapshot.requirementBaseline,
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
      }),
    );
  }

  updateStage("render_svg", "正在渲染 SVG");
  const repairedPlantUmlArtifacts: PlantUmlArtifact[] = [];
  const svgArtifacts: SvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    throwIfRunCancelled(record);
    const model = models.find((item) => item.diagramKind === artifact.diagramKind);
    if (!model) {
      throw new Error(`Missing diagram model for ${artifact.diagramKind}`);
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
    repairedPlantUmlArtifacts.push(rendered.artifact as PlantUmlArtifact);
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as SvgArtifact);
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
