// Runs model-backed feasibility stages and emits common run lifecycle events.
import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  llmChunkRunEventSchema,
  snapshotInputFingerprint,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type ContextDiagramSpec,
  type FeasibilityRunSnapshot,
  type ProviderSettings,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateFeasibilityContextPrompt,
  buildGenerateFeasibilityImplementationPrompt,
  buildRepairFeasibilityJsonPrompt,
} from "@uml-platform/prompts";
import type { LlmTransport } from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { normalizeContextDiagram } from "../../normalizers/feasibility/context-normalizer.js";
import { normalizeFeasibilityImplementation } from "../../normalizers/feasibility/implementation-normalizer.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import { generatePlantUmlArtifacts } from "../../plantuml.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createRunError, throwRunError } from "./shared/errors.js";

function traceabilityFromContext(model: ContextDiagramSpec) {
  return [
    ...model.people.flatMap((element) => element.sourceRequirementIds.map((requirementId) => ({
      requirementId,
      targetId: element.id,
      targetKind: "person" as const,
      targetLabel: element.name,
    }))),
    ...model.externalSystems.flatMap((element) => element.sourceRequirementIds.map((requirementId) => ({
      requirementId,
      targetId: element.id,
      targetKind: "external-system" as const,
      targetLabel: element.name,
    }))),
    ...model.relationships.flatMap((relationship) => relationship.sourceRequirementIds.map((requirementId) => ({
      requirementId,
      targetId: relationship.id,
      targetKind: "relationship" as const,
      targetLabel: relationship.label,
    }))),
  ];
}

async function generateJsonWithOneRepair<T>(input: {
  record: RunRecord;
  stage: RunStage;
  promptStage: "context" | "implementation";
  prompt: string;
  providerSettings: ProviderSettings;
  llmTransport: LlmTransport;
  parse: (value: unknown) => T;
}) {
  let prompt = input.prompt;
  let previousOutput = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    throwIfRunCancelled(input.record);
    const raw = await collectTextResult(
      input.llmTransport,
      input.providerSettings,
      [
        { role: "system", content: "你是严谨的软件可行性分析师，只能基于给定事实输出契约要求的 JSON。" },
        { role: "user", content: prompt },
      ],
      (chunk) => emitEvent(input.record, llmChunkRunEventSchema.parse({
        type: "llm_chunk",
        stage: input.stage,
        chunk,
      })),
      { type: "json_object" },
    );
    try {
      return input.parse(parseJson(raw));
    } catch (error) {
      logFailedStructuredOutput(input.stage, input.providerSettings.model, error, raw, attempt);
      if (attempt === 2) {
        throwRunError(createRunError(
          "RUN_STRUCTURED_OUTPUT_INVALID",
          `所选模型返回的${input.promptStage === "context" ? "上下文图" : "实现方案"}结构不符合要求，已尝试修复一次。`,
          { details: { validationError: formatParseError(error) } },
        ));
      }
      previousOutput = raw;
      emitEvent(input.record, stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage: input.stage,
        progress: stageProgressValue(input.stage),
        message: "模型 JSON 结构不合法，正在进行一次结构修复",
        subtaskStatus: "repairing",
      }));
      prompt = buildRepairFeasibilityJsonPrompt({
        stage: input.promptStage,
        previousOutput,
        error: formatParseError(error),
        originalPrompt: input.prompt,
      });
    }
  }
  throw new Error(`${input.stage} structured output failed`);
}

// route -> pipeline -> record store: only validated artifacts are committed to the snapshot.
export async function runFeasibilityStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as FeasibilityRunSnapshot;
  const validRequirementIds = new Set(snapshot.rules.map((rule) => rule.id));
  const updateStage = (stage: RunStage, message: string) => {
    throwIfRunCancelled(record);
    snapshot.currentStage = stage as FeasibilityRunSnapshot["currentStage"];
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(record, stageProgressRunEventSchema.parse({
      type: "stage_progress",
      stage,
      progress: stageProgressValue(stage),
      message,
    }));
  };

  if (snapshot.selectedArtifacts.includes("context")) {
    updateStage("generate_context", "正在使用所选模型生成系统上下文");
    const contextModel = await generateJsonWithOneRepair({
      record,
      stage: "generate_context",
      promptStage: "context",
      prompt: buildGenerateFeasibilityContextPrompt(snapshot),
      providerSettings,
      llmTransport,
      parse: (value) => normalizeContextDiagram(value, validRequirementIds),
    });
    snapshot.contextModel = contextModel;
    snapshot.contextTraceability = traceabilityFromContext(contextModel);

    updateStage("render_context", "正在生成并渲染系统上下文图");
    const artifact = generatePlantUmlArtifacts([contextModel])[0];
    if (!artifact) throw new Error("上下文图未生成有效的 PlantUML");
    snapshot.contextPlantUml = artifact;
    emitEvent(record, artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_context",
      artifactKind: "feasibilityContext",
      modelId: artifact.modelId ?? "context",
      subtaskId: "context",
      subtaskLabel: "上下文图",
      subtaskStatus: "rendering",
    }));
    const rendered = await renderClient(artifact);
    snapshot.contextSvg = { ...artifact, svg: rendered.svg, renderMeta: rendered.renderMeta };
    snapshot.contextFingerprint = snapshotInputFingerprint({
      rules: snapshot.rules,
      requirementBaseline: snapshot.requirementBaseline,
    });
    emitEvent(record, artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_context",
      artifactKind: "feasibilityContext",
      modelId: artifact.modelId ?? "context",
      subtaskId: "context",
      subtaskLabel: "上下文图",
      subtaskStatus: "completed",
    }));
  }

  if (snapshot.selectedArtifacts.includes("implementation")) {
    if (!snapshot.contextModel || !snapshot.contextPlantUml || !snapshot.contextSvg) {
      throw new Error("RUN_DEPENDENCY_MISSING: 请先生成最新有效的上下文图。");
    }
    updateStage("generate_implementation", "正在使用所选模型生成实现方案");
    snapshot.implementationPlan = await generateJsonWithOneRepair({
      record,
      stage: "generate_implementation",
      promptStage: "implementation",
      prompt: buildGenerateFeasibilityImplementationPrompt({
        rules: snapshot.rules,
        requirementBaseline: snapshot.requirementBaseline,
        inputs: snapshot.inputs,
        contextModel: snapshot.contextModel,
      }),
      providerSettings,
      llmTransport,
      parse: (value) => normalizeFeasibilityImplementation(value, validRequirementIds),
    });
    snapshot.implementationFingerprint = snapshotInputFingerprint({
      rules: snapshot.rules,
      contextModel: snapshot.contextModel,
      inputs: snapshot.inputs,
    });
    emitEvent(record, artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_implementation",
      artifactKind: "feasibilityImplementation",
      subtaskId: "implementation",
      subtaskLabel: "实现方案",
      subtaskStatus: "completed",
    }));
  }

  snapshot.currentStage = null;
  snapshot.status = "completed";
  snapshot.error = null;
  emitEvent(record, completedRunEventSchema.parse({ type: "completed", snapshot }));
}
