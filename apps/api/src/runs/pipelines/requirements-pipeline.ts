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
  type PlantUmlArtifact,
  type ProviderSettings,
  type RequirementRule,
  type RunSnapshot,
  type RunStage,
  type SvgArtifact,
} from "@uml-platform/contracts";
import {
  buildExtractRulesPrompt,
  buildGenerateModelsPrompt,
  buildRepairModelsPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../llm.js";
import { type RenderClient } from "../../adapters/render/render-client.js";
import { getGenerateModelsResponseFormat } from "../../adapters/llm/response-formats/index.js";
import { generatePlantUmlArtifacts } from "../../plantuml.js";
import { parseRequirementDiagramModelsResult } from "../../normalizers/requirements/requirement-model-normalizer.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { renderArtifactWithRepair } from "./render/render-artifact-with-repair.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import {
  collectStructuredResult,
  collectTextResult,
  logFailedStructuredOutput,
} from "./shared/structured-output.js";
import { appendRequirementTrace } from "./shared/trace-events.js";

const MAX_MODEL_REPAIR_ATTEMPTS = 2;

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
      const parsed = parseRequirementDiagramModelsResult(content);
      appendRequirementTrace(record, {
        stage: "generate_models",
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: parsed,
      });
      return parsed;
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
  let plantUml: PlantUmlArtifact[] = [];
  let diagramErrors: Partial<Record<DiagramKind, DiagramError>> = {};

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
    rules = ruleResult.rules;
    snapshot.rules = rules;
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "extract_rules",
        artifactKind: "rules",
      }),
    );
  }

  updateStage("generate_models", "正在生成结构化模型");
  if (snapshot.selectedDiagrams.length > 0) {
    const modelResult = await generateModelsWithRepair(
      record,
      providerSettings,
      llmTransport,
      snapshot.requirementText,
      rules,
      snapshot.selectedDiagrams,
    );
    models = modelResult.models;
  }
  snapshot.models = models;
  snapshot.diagramErrors = {};
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "model",
    }),
  );

  updateStage("generate_plantuml", "正在生成 PlantUML");
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
