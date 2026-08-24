// Runs model-backed feasibility stages with capability routing and section-scoped repair.
import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  llmChunkRunEventSchema,
  snapshotInputFingerprint,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type ContextDiagramSpec,
  type FeasibilityGenerationDiagnostics,
  type FeasibilityRepairSection,
  type FeasibilityRunSnapshot,
  type FeasibilityValidationIssue,
  type ProviderSettings,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateFeasibilityContextPrompt,
  buildGenerateFeasibilityImplementationPrompt,
  buildRepairFeasibilityJsonPrompt,
  buildRepairFeasibilitySectionPrompt,
} from "@uml-platform/prompts";
import type {
  ChatCompletionResponseFormat,
  LlmTransport,
  ResponseFormatFallbackEvent,
} from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import {
  GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT,
  GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT,
  FEASIBILITY_SECTION_REPAIR_RESPONSE_FORMATS,
} from "../../adapters/llm/response-formats/index.js";
import { getModelCapability } from "../../model-capabilities.js";
import { normalizeContextDiagram } from "../../normalizers/feasibility/context-normalizer.js";
import {
  normalizeFeasibilityImplementationDetailed,
} from "../../normalizers/feasibility/implementation-normalizer.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import { generatePlantUmlArtifacts } from "../../plantuml.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createRunError, throwRunError } from "./shared/errors.js";
import { renderArtifactWithRepair } from "./render/render-artifact-with-repair.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

function pathSection(path: Array<string | number>, promptStage: "context" | "implementation") {
  if (promptStage === "context") return "context" as const;
  const implementationIndex = path.indexOf("implementation");
  const key = implementationIndex >= 0 ? path[implementationIndex + 1] : path[2];
  if (
    key === "architecture" ||
    key === "dataStrategy" ||
    key === "integrations" ||
    key === "integrationRationale" ||
    key === "deploymentAndOperations" ||
    key === "securityAndCompliance"
  ) return "technical" as const;
  if (key === "milestones" || key === "risks") return "delivery" as const;
  if (
    key === "analysisPeriodAssumption" ||
    key === "costEstimates" ||
    key === "benefitEstimates" ||
    key === "absenceDeclarations" ||
    key === "oneTimeCosts" ||
    key === "recurringCosts" ||
    key === "quantitativeBenefits" ||
    key === "qualitativeBenefits"
  ) return "economics" as const;
  if (key === "verdicts" || key === "decision" || key === "preconditions") {
    return "verdict" as const;
  }
  return "plan" as const;
}

function chineseIssueReason(message: string) {
  return message
    .replace("Required", "缺少必填字段")
    .replace("Invalid input", "字段值不符合要求")
    .replace("Expected", "应为")
    .replace("received", "实际为");
}

function validationIssuesFromError(
  error: unknown,
  promptStage: "context" | "implementation",
): FeasibilityValidationIssue[] {
  const rawIssues = (error as {
    issues?: Array<{ path?: Array<string | number>; message?: string }>;
  } | null)?.issues;
  if (!Array.isArray(rawIssues) || rawIssues.length === 0) {
    return [{
      path: "",
      candidateIndex: null,
      section: promptStage === "context" ? "context" : "plan",
      reason: chineseIssueReason(formatParseError(error)),
    }];
  }
  return rawIssues.map((issue) => {
    const path = Array.isArray(issue.path) ? issue.path : [];
    const candidatesIndex = path.indexOf("candidates");
    const candidateIndex = candidatesIndex >= 0 && typeof path[candidatesIndex + 1] === "number"
      ? path[candidatesIndex + 1] as number
      : null;
    return {
      path: path.join("."),
      candidateIndex,
      section: pathSection(path, promptStage),
      reason: chineseIssueReason(issue.message ?? "字段不符合契约"),
    };
  });
}

function responseFormatFor(
  stage: "context" | "implementation",
  diagnostics: FeasibilityGenerationDiagnostics,
): ChatCompletionResponseFormat | null {
  if (diagnostics.effectiveMode === "compatible") return null;
  if (diagnostics.effectiveMode === "json_object") return { type: "json_object" };
  return stage === "context"
    ? GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT
    : GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT;
}

function sectionResponseFormatFor(
  section: Exclude<FeasibilityRepairSection, "context" | "plan">,
  diagnostics: FeasibilityGenerationDiagnostics,
): ChatCompletionResponseFormat | null {
  if (diagnostics.effectiveMode === "compatible") return null;
  if (diagnostics.effectiveMode === "json_object") return { type: "json_object" };
  return FEASIBILITY_SECTION_REPAIR_RESPONSE_FORMATS[section];
}

const TECHNICAL_KEYS = [
  "architecture",
  "dataStrategy",
  "integrations",
  "integrationRationale",
  "deploymentAndOperations",
  "securityAndCompliance",
] as const;
const DELIVERY_KEYS = ["milestones", "risks"] as const;
const ECONOMICS_KEYS = [
  "analysisPeriodAssumption",
  "costEstimates",
  "benefitEstimates",
  "absenceDeclarations",
  "oneTimeCosts",
  "recurringCosts",
  "quantitativeBenefits",
  "qualitativeBenefits",
] as const;
const VERDICT_KEYS = ["verdicts", "decision", "preconditions"] as const;

function copyKeys(
  target: UnknownRecord,
  source: UnknownRecord,
  keys: readonly string[],
) {
  const next = { ...target };
  for (const key of keys) {
    if (key in source) next[key] = source[key];
  }
  return next;
}

function sectionKeys(
  section: Exclude<FeasibilityRepairSection, "context" | "plan">,
) {
  if (section === "technical") return TECHNICAL_KEYS;
  if (section === "delivery") return DELIVERY_KEYS;
  if (section === "economics") return ECONOMICS_KEYS;
  return VERDICT_KEYS;
}

function sectionPatchFromOutput(
  value: unknown,
  candidateIndex: number,
  section: Exclude<FeasibilityRepairSection, "context" | "plan">,
) {
  if (isRecord(value) && isRecord(value.patch)) return value.patch;
  if (!isRecord(value) || !Array.isArray(value.candidates)) return null;
  const candidate = value.candidates[candidateIndex];
  if (!isRecord(candidate) || !isRecord(candidate.implementation)) return null;
  return copyKeys({}, candidate.implementation, sectionKeys(section));
}

function applySectionPatch(
  value: unknown,
  candidateIndex: number,
  section: Exclude<FeasibilityRepairSection, "context" | "plan">,
  patch: UnknownRecord,
) {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return value;
  const candidates = [...value.candidates];
  const candidate = candidates[candidateIndex];
  if (!isRecord(candidate) || !isRecord(candidate.implementation)) return value;
  candidates[candidateIndex] = {
    ...candidate,
    implementation: copyKeys(
      candidate.implementation,
      patch,
      sectionKeys(section),
    ),
  };
  return { ...value, candidates };
}

// Repair responses may contain unrelated rewrites. Only invalid groups are
// merged back, keeping every already-validated candidate section unchanged.
function mergeImplementationRepair(
  baseValue: unknown,
  repairedValue: unknown,
  issues: readonly FeasibilityValidationIssue[],
) {
  if (!isRecord(baseValue) || !isRecord(repairedValue)) return repairedValue;
  const next: UnknownRecord = { ...baseValue };
  const planIssue = issues.some((issue) => issue.section === "plan");
  if (planIssue) {
    for (const key of [
      "overview",
      "reducedCandidateReason",
      "recommendedCandidateId",
      "recommendationRationale",
    ]) {
      if (key in repairedValue) next[key] = repairedValue[key];
    }
  }
  if (!Array.isArray(baseValue.candidates) || !Array.isArray(repairedValue.candidates)) {
    return planIssue ? repairedValue : next;
  }
  const repairedCandidates = repairedValue.candidates;
  next.candidates = baseValue.candidates.map((baseCandidate, candidateIndex) => {
    const repairedCandidate = repairedCandidates[candidateIndex];
    if (!isRecord(baseCandidate) || !isRecord(repairedCandidate)) return baseCandidate;
    const candidateIssues = issues.filter(
      (issue) => issue.candidateIndex === candidateIndex || issue.candidateIndex === null,
    );
    let candidate = { ...baseCandidate };
    if (candidateIssues.some((issue) => issue.section === "plan")) {
      candidate = copyKeys(candidate, repairedCandidate, [
        "id",
        "name",
        "summary",
        "advantages",
        "disadvantages",
        "estimatedCost",
        "estimatedSchedule",
        "sourceRequirementIds",
        "assumption",
        "provenance",
      ]);
    }
    if (!isRecord(baseCandidate.implementation) || !isRecord(repairedCandidate.implementation)) {
      return candidateIssues.length > 0 ? repairedCandidate : candidate;
    }
    let implementation = { ...baseCandidate.implementation };
    const sections = new Set(candidateIssues.map((issue) => issue.section));
    if (sections.has("technical")) {
      implementation = copyKeys(implementation, repairedCandidate.implementation, TECHNICAL_KEYS);
    }
    if (sections.has("delivery")) {
      implementation = copyKeys(implementation, repairedCandidate.implementation, DELIVERY_KEYS);
    }
    if (sections.has("economics")) {
      implementation = copyKeys(implementation, repairedCandidate.implementation, ECONOMICS_KEYS);
    }
    if (sections.has("verdict")) {
      implementation = copyKeys(implementation, repairedCandidate.implementation, VERDICT_KEYS);
    }
    return { ...candidate, implementation };
  });
  return next;
}

async function generateFeasibilityJson<T>(input: {
  record: RunRecord;
  stage: RunStage;
  promptStage: "context" | "implementation";
  prompt: string;
  providerSettings: ProviderSettings;
  llmTransport: LlmTransport;
  diagnostics: FeasibilityGenerationDiagnostics;
  parse: (value: unknown) => { value: T; normalizationActions?: string[] };
}) {
  let prompt = input.prompt;
  let fullRetryUsed = false;
  let repairRound = 0;
  let baseParsedValue: unknown = null;
  let pendingIssues: FeasibilityValidationIssue[] = [];
  let lastIssues: FeasibilityValidationIssue[] = [];
  let preparedRepairValue: unknown = null;
  let attempt = 0;

  while (true) {
    attempt += 1;
    throwIfRunCancelled(input.record);
    const fallback = (event: ResponseFormatFallbackEvent) => {
      input.diagnostics.effectiveMode = "json_object";
      input.diagnostics.downgradeReasons.push(
        `HTTP ${event.status}: ${event.reason}`,
      );
      emitEvent(input.record, stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage: input.stage,
        progress: stageProgressValue(input.stage),
        message: "Provider 不支持严格 JSON Schema，本次任务已降级为 JSON 模式",
        subtaskStatus: "repairing",
      }));
    };
    let raw = "";
    let parsedValue: unknown;
    if (preparedRepairValue !== null) {
      parsedValue = preparedRepairValue;
      preparedRepairValue = null;
    } else {
      raw = await collectTextResult(
        input.llmTransport,
        input.providerSettings,
        [
          {
            role: "system",
            content: "你是严谨的软件可行性分析师，只能基于给定事实输出契约要求的 JSON。",
          },
          { role: "user", content: prompt },
        ],
        (chunk) => emitEvent(input.record, llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage: input.stage,
          chunk,
        })),
        responseFormatFor(input.promptStage, input.diagnostics),
        undefined,
        fallback,
      );
      try {
        parsedValue = parseJson(raw);
      } catch (error) {
        logFailedStructuredOutput(input.stage, input.providerSettings.model, error, raw, attempt);
        if (fullRetryUsed) {
          lastIssues = validationIssuesFromError(error, input.promptStage);
          break;
        }
        fullRetryUsed = true;
        emitEvent(input.record, stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: input.stage,
          progress: stageProgressValue(input.stage),
          message: "模型输出无法解析为 JSON，正在进行一次完整重试",
          subtaskStatus: "repairing",
        }));
        prompt = buildRepairFeasibilityJsonPrompt({
          stage: input.promptStage,
          previousOutput: raw,
          error: formatParseError(error),
          originalPrompt: input.prompt,
        });
        continue;
      }
    }

    if (baseParsedValue !== null && pendingIssues.length > 0) {
      parsedValue = input.promptStage === "implementation"
        ? mergeImplementationRepair(baseParsedValue, parsedValue, pendingIssues)
        : parsedValue;
    }

    try {
      const result = input.parse(parsedValue);
      input.diagnostics.normalizationActions.push(
        ...(result.normalizationActions ?? []),
      );
      for (const repair of input.diagnostics.repairs) {
        if (
          repair.stage === input.promptStage &&
          repair.round === repairRound
        ) repair.succeeded = true;
      }
      input.diagnostics.normalizationActions = [
        ...new Set(input.diagnostics.normalizationActions),
      ];
      return result.value;
    } catch (error) {
      logFailedStructuredOutput(input.stage, input.providerSettings.model, error, raw, attempt);
      lastIssues = validationIssuesFromError(error, input.promptStage);
      if (repairRound >= 2) break;
      repairRound += 1;
      baseParsedValue = parsedValue;
      pendingIssues = lastIssues;
      const groups = new Map<string, FeasibilityValidationIssue>();
      for (const issue of lastIssues) {
        groups.set(`${issue.candidateIndex ?? "all"}:${issue.section}`, issue);
      }
      for (const issue of groups.values()) {
        input.diagnostics.repairs.push({
          stage: input.promptStage,
          candidateIndex: issue.candidateIndex,
          section: issue.section,
          round: repairRound,
          succeeded: false,
        });
      }
      emitEvent(input.record, stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage: input.stage,
        progress: stageProgressValue(input.stage),
        message: `正在定点修复：${[...groups.values()]
          .map((issue) => `候选${issue.candidateIndex === null ? "全部" : issue.candidateIndex + 1}/${issue.section}`)
          .join("、")}`,
        subtaskStatus: "repairing",
      }));
      const targetedGroups = [...groups.values()].filter(
        (issue): issue is FeasibilityValidationIssue & {
          candidateIndex: number;
          section: Exclude<FeasibilityRepairSection, "context" | "plan">;
        } =>
          input.promptStage === "implementation" &&
          issue.candidateIndex !== null &&
          issue.section !== "context" &&
          issue.section !== "plan",
      );
      if (targetedGroups.length === groups.size) {
        const patches = await Promise.all(targetedGroups.map(async (issue) => {
          const sectionPrompt = buildRepairFeasibilitySectionPrompt({
            candidateIndex: issue.candidateIndex,
            section: issue.section,
            currentPlan: parsedValue,
            issues: lastIssues
              .filter((item) =>
                item.candidateIndex === issue.candidateIndex &&
                item.section === issue.section)
              .map((item) => `${item.path}: ${item.reason}`),
            originalPrompt: input.prompt,
          });
          const sectionRaw = await collectTextResult(
            input.llmTransport,
            input.providerSettings,
            [
              {
                role: "system",
                content: "你是严谨的软件可行性分析师，只能输出指定候选章节的 JSON patch。",
              },
              { role: "user", content: sectionPrompt },
            ],
            (chunk) => emitEvent(input.record, llmChunkRunEventSchema.parse({
              type: "llm_chunk",
              stage: input.stage,
              chunk,
            })),
            sectionResponseFormatFor(issue.section, input.diagnostics),
            undefined,
            fallback,
          );
          try {
            return {
              issue,
              patch: sectionPatchFromOutput(
                parseJson(sectionRaw),
                issue.candidateIndex,
                issue.section,
              ),
            };
          } catch (error) {
            logFailedStructuredOutput(
              input.stage,
              input.providerSettings.model,
              error,
              sectionRaw,
              repairRound,
            );
            return { issue, patch: null };
          }
        }));
        preparedRepairValue = patches.reduce(
          (current, { issue, patch }) =>
            patch
              ? applySectionPatch(
                  current,
                  issue.candidateIndex,
                  issue.section,
                  patch,
                )
              : current,
          parsedValue,
        );
        pendingIssues = [];
        baseParsedValue = preparedRepairValue;
        continue;
      }
      prompt = buildRepairFeasibilityJsonPrompt({
        stage: input.promptStage,
        previousOutput: JSON.stringify(parsedValue),
        error: lastIssues
          .map((issue) => `${issue.path || "<root>"} [${issue.section}]: ${issue.reason}`)
          .join("\n"),
        originalPrompt: input.prompt,
      });
    }
  }

  throwRunError(createRunError(
    "RUN_STRUCTURED_OUTPUT_INVALID",
    `所选模型返回的${input.promptStage === "context" ? "系统上下文图（系统环境图）" : "实现方案"}结构不符合要求，定点修复后仍未通过校验。`,
    {
      details: {
        validationIssues: lastIssues,
        requestedMode: input.diagnostics.requestedMode,
        effectiveMode: input.diagnostics.effectiveMode,
        downgradeReasons: input.diagnostics.downgradeReasons,
        normalizationActions: input.diagnostics.normalizationActions,
        repairs: input.diagnostics.repairs,
      },
    },
  ));
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
  const capability = getModelCapability(providerSettings);
  const diagnostics = snapshot.generationDiagnostics ?? {
    requestedMode: capability.structuredOutputMode,
    effectiveMode: capability.structuredOutputMode,
    downgradeReasons: [],
    normalizationActions: [],
    repairs: [],
  };
  snapshot.generationDiagnostics = diagnostics;
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
    const contextModel = await generateFeasibilityJson({
      record,
      stage: "generate_context",
      promptStage: "context",
      prompt: buildGenerateFeasibilityContextPrompt(snapshot),
      providerSettings,
      llmTransport,
      diagnostics,
      parse: (value) => ({
        value: normalizeContextDiagram(value, validRequirementIds),
      }),
    });
    snapshot.contextModel = contextModel;
    snapshot.contextTraceability = traceabilityFromContext(contextModel);

    updateStage("render_context", "正在生成并渲染系统上下文图（系统环境图）");
    const artifact = generatePlantUmlArtifacts([contextModel])[0];
    if (!artifact) throw new Error("系统上下文图（系统环境图）未生成有效的 PlantUML");
    snapshot.contextPlantUml = artifact;
    emitEvent(record, artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_context",
      artifactKind: "feasibilityContext",
      modelId: artifact.modelId ?? "context",
      subtaskId: "context",
      subtaskLabel: "系统上下文图（系统环境图）",
      subtaskStatus: "rendering",
    }));
    const renderResult = await renderArtifactWithRepair(
      record,
      providerSettings,
      llmTransport,
      renderClient,
      contextModel,
      artifact,
    );
    if (renderResult.status === "failed") {
      throwRunError(createRunError("RUN_RENDER_FAILED", renderResult.errorMessage, {
        details: {
          diagramKind: artifact.diagramKind,
          reason: renderResult.errorMessage,
        },
      }));
    }
    snapshot.contextPlantUml = renderResult.artifact as typeof artifact;
    snapshot.contextSvg = renderResult.svgArtifact as NonNullable<
      FeasibilityRunSnapshot["contextSvg"]
    >;
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
      subtaskLabel: "系统上下文图（系统环境图）",
      subtaskStatus: "completed",
    }));
  }

  if (snapshot.selectedArtifacts.includes("implementation")) {
    if (!snapshot.contextModel || !snapshot.contextPlantUml || !snapshot.contextSvg) {
      throwRunError(createRunError(
        "RUN_DEPENDENCY_MISSING",
        "请先生成最新有效的系统上下文图（系统环境图）。",
      ));
    }
    updateStage("generate_implementation", "正在使用所选模型生成实现方案");
    const contextExternalSystems = snapshot.contextModel.externalSystems.map(({ id, name }) => ({
      id,
      name,
    }));
    snapshot.implementationPlan = await generateFeasibilityJson({
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
      diagnostics,
      parse: (value) => {
        const normalized = normalizeFeasibilityImplementationDetailed(
          value,
          validRequirementIds,
          contextExternalSystems,
        );
        return {
          value: normalized.plan,
          normalizationActions: normalized.actions,
        };
      },
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
