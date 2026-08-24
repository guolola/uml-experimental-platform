// Owns the fixed offline demo lifecycle for the student onboarding recording branch.
import {
  artifactReadyRunEventSchema,
  codeRunSnapshotSchema,
  completedRunEventSchema,
  designTraceabilityTouchesDiagramKinds,
  designRunSnapshotSchema,
  repairRequirementRuleResponseSchema,
  repairRequirementRulesResponseSchema,
  runSnapshotSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  startDocumentRunRequestSchema,
  type CodeRunSnapshot,
  type DesignDiagramKind,
  type DesignRunSnapshot,
  type DiagramKind,
  type ProviderSettings,
  type RepairRequirementRuleRequest,
  type RepairRequirementRulesRequest,
  type RequirementBaseline,
  type RunSnapshot,
  type RunStage,
  type StartCodeRunRequest,
  type StartDesignRunRequest,
  type StartDocumentRunRequest,
  type StartRunRequest,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../llm.js";
import {
  generateDesignPlantUmlArtifacts,
  generatePlantUmlArtifacts,
} from "../../plantuml.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { stageProgressValue } from "../pipelines/shared/pipeline-events.js";
import { librarySeatDemoFixture } from "./fixtures/library-seat-demo-fixture.js";
import {
  librarySeatRequirementPlantUmlArtifacts,
  librarySeatRequirementRenderedSvgArtifacts,
} from "./fixtures/library-seat-requirement-rendered-artifacts.js";

const fixture = {
  ...librarySeatDemoFixture,
  requirementSnapshot: runSnapshotSchema.parse(
    librarySeatDemoFixture.requirementSnapshot,
  ),
  designSnapshot: designRunSnapshotSchema.parse(
    librarySeatDemoFixture.designSnapshot,
  ),
  codeSnapshot: codeRunSnapshotSchema.parse(librarySeatDemoFixture.codeSnapshot),
};

export const offlineDemoProviderSettings: ProviderSettings = {
  apiBaseUrl: "https://offline-demo.local",
  apiKey: "offline-demo",
  model: "offline-demo-fixed-artifacts",
};

export const offlineDemoLlmTransport: LlmTransport = {
  async *streamChatCompletion() {
    throw new Error("Offline demo mode must not call an LLM provider.");
  },
};

function configuredOfflineDemoProjectIds() {
  return new Set(
    (process.env.UML_DEMO_OFFLINE_PROJECT_IDS ?? "")
      .split(",")
      .map((projectId) => projectId.trim())
      .filter(Boolean),
  );
}

function configuredOfflineDemoProjectNamePatterns() {
  return (process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS ?? "")
    .split(",")
    .map((pattern) => pattern.trim().toLocaleLowerCase())
    .filter(Boolean);
}

function offlineDemoStageDelayMs() {
  const parsed = Number(process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

async function waitForOfflineDemoStage() {
  const delayMs = offlineDemoStageDelayMs();
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isOfflineDemoProject(
  projectId: string | null | undefined,
  projectName?: string | null,
) {
  if (projectId && configuredOfflineDemoProjectIds().has(projectId)) {
    return true;
  }
  const name = projectName?.trim().toLocaleLowerCase();
  if (!name) return false;
  return configuredOfflineDemoProjectNamePatterns().some((pattern) =>
    name.includes(pattern),
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function retargetBaseline(
  baseline: RequirementBaseline | null | undefined,
  runId: string,
) {
  if (!baseline) return baseline ?? null;
  return {
    ...baseline,
    runId,
    qualityReport: {
      ...baseline.qualityReport,
      runId,
    },
  };
}

function retargetSnapshotIds(
  snapshot: RunSnapshot | DesignRunSnapshot | CodeRunSnapshot,
  runId: string,
) {
  snapshot.runId = runId;
  if ("requirementBaseline" in snapshot) {
    snapshot.requirementBaseline = retargetBaseline(
      snapshot.requirementBaseline,
      runId,
    );
  }
  if (snapshot.coverageMatrix) {
    snapshot.coverageMatrix = { ...snapshot.coverageMatrix, runId };
  }
  if (snapshot.traceabilityMatrix) {
    snapshot.traceabilityMatrix = { ...snapshot.traceabilityMatrix, runId };
  }
}

function selectedOrAvailable<T extends string>(requested: T[], available: T[]) {
  if (requested.length === 0) return [] as T[];
  const availableSet = new Set(available);
  const selected = requested.filter((kind) => availableSet.has(kind));
  return selected.length > 0 ? selected : available;
}

function demoRequirementBaseline() {
  const baseline = fixture.requirementSnapshot.requirementBaseline;
  if (!baseline) {
    throw new Error("Offline demo fixture is missing a requirement baseline.");
  }
  return baseline;
}

function requirementKinds(snapshot: RunSnapshot) {
  return Array.from(
    new Set([
      ...snapshot.models.map((model) => model.diagramKind),
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ]),
  ) as DiagramKind[];
}

function designKinds(snapshot: DesignRunSnapshot) {
  return Array.from(
    new Set([
      ...snapshot.models.map((model) => model.diagramKind),
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ]),
  ) as DesignDiagramKind[];
}

function artifactKey(artifact: { diagramKind: string; modelId?: string }) {
  return artifact.modelId ?? artifact.diagramKind;
}

function requirementArtifactBelongsToSnapshot(
  snapshot: RunSnapshot,
  artifact: { diagramKind: string; modelId?: string },
) {
  const artifactModelId = artifact.modelId;
  if (artifactModelId) {
    return snapshot.models.some((model) => artifactKey(model) === artifactModelId);
  }
  return snapshot.models.some((model) => model.diagramKind === artifact.diagramKind);
}

function ensureRequirementArtifacts(snapshot: RunSnapshot) {
  const plantByKey = new Map(
    snapshot.plantUml.map((artifact) => [artifactKey(artifact), artifact] as const),
  );
  for (const artifact of librarySeatRequirementPlantUmlArtifacts) {
    if (
      requirementArtifactBelongsToSnapshot(snapshot, artifact) &&
      !plantByKey.has(artifactKey(artifact))
    ) {
      plantByKey.set(artifactKey(artifact), artifact);
    }
  }
  for (const artifact of generatePlantUmlArtifacts(snapshot.models)) {
    if (!plantByKey.has(artifactKey(artifact))) {
      plantByKey.set(artifactKey(artifact), artifact);
    }
  }
  snapshot.plantUml = Array.from(plantByKey.values());

  const svgByKey = new Map(
    librarySeatRequirementRenderedSvgArtifacts.map(
      (artifact) => [artifactKey(artifact), artifact] as const,
    ),
  );
  const existingSvgKeys = new Set(snapshot.svgArtifacts.map(artifactKey));
  const missingSvg = snapshot.plantUml.flatMap((artifact) => {
    const key = artifactKey(artifact);
    if (existingSvgKeys.has(key)) return [];
    const renderedSvg = svgByKey.get(key);
    return renderedSvg ? [renderedSvg] : [];
  });
  snapshot.svgArtifacts = [...snapshot.svgArtifacts, ...missingSvg];
}

function ensureDesignArtifacts(snapshot: DesignRunSnapshot) {
  const plantByKey = new Map(
    snapshot.plantUml.map((artifact) => [artifactKey(artifact), artifact] as const),
  );
  for (const artifact of generateDesignPlantUmlArtifacts(snapshot.models)) {
    if (!plantByKey.has(artifactKey(artifact))) {
      plantByKey.set(artifactKey(artifact), artifact);
    }
  }
  snapshot.plantUml = Array.from(plantByKey.values());
}

async function emitDemoStage(record: RunRecord, stage: RunStage, message: string) {
  record.snapshot.currentStage = stage;
  record.snapshot.status = "running";
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
  await waitForOfflineDemoStage();
}

function completeRecord(
  record: RunRecord,
  snapshot: RunSnapshot | DesignRunSnapshot | CodeRunSnapshot,
) {
  snapshot.status = "completed";
  snapshot.error = null;
  record.snapshot = snapshot;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

export async function completeOfflineDemoRequirementRun(
  record: RunRecord,
  input: StartRunRequest,
) {
  const snapshot = clone(fixture.requirementSnapshot);
  retargetSnapshotIds(snapshot, record.snapshot.runId);
  const availableKinds = requirementKinds(snapshot);
  const selectedKinds = selectedOrAvailable(input.selectedDiagrams, availableKinds);
  snapshot.selectedDiagrams = selectedKinds;
  if (selectedKinds.length === 0) {
    snapshot.models = [];
    snapshot.plantUml = [];
    snapshot.svgArtifacts = [];
    snapshot.requirementModelTraceability = [];
    snapshot.diagramErrors = {};
    snapshot.currentStage = "extract_rules";
  } else {
    const selected = new Set(selectedKinds);
    snapshot.models = snapshot.models.filter((model) =>
      selected.has(model.diagramKind),
    );
    snapshot.plantUml = snapshot.plantUml.filter((artifact) =>
      selected.has(artifact.diagramKind),
    );
    snapshot.svgArtifacts = snapshot.svgArtifacts.filter((artifact) =>
      selected.has(artifact.diagramKind),
    );
    snapshot.requirementModelTraceability =
      snapshot.requirementModelTraceability.filter((entry) =>
        selected.has(entry.target.diagramKind as DiagramKind),
      );
    snapshot.diagramErrors = Object.fromEntries(
      Object.entries(snapshot.diagramErrors).filter(([kind]) =>
        selected.has(kind as DiagramKind),
      ),
    ) as RunSnapshot["diagramErrors"];
    ensureRequirementArtifacts(snapshot);
    snapshot.currentStage = "render_svg";
  }
  snapshot.status = "queued";
  record.snapshot = snapshot;
  await emitDemoStage(record, "extract_rules", "离线演示：已加载固定需求规则");
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
  if (selectedKinds.length > 0) {
    await emitDemoStage(record, "generate_models", "离线演示：已加载固定需求模型");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_models",
        artifactKind: "model",
      }),
    );
    await emitDemoStage(record, "render_svg", "离线演示：已加载 PlantUML 渲染 SVG 图");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "plantuml",
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "svg",
      }),
    );
  }
  completeRecord(record, runSnapshotSchema.parse(snapshot));
}

export async function completeOfflineDemoDesignRun(
  record: RunRecord,
  input: StartDesignRunRequest,
) {
  const snapshot = clone(fixture.designSnapshot);
  retargetSnapshotIds(snapshot, record.snapshot.runId);
  const availableKinds = designKinds(snapshot);
  const requestedKinds = input.requestedDiagrams ?? input.selectedDiagrams;
  const selectedKinds = selectedOrAvailable(requestedKinds, availableKinds);
  const selected = new Set(selectedKinds);
  snapshot.selectedDiagrams = selectedKinds;
  snapshot.requestedDiagrams = requestedKinds;
  snapshot.models = snapshot.models.filter((model) => selected.has(model.diagramKind));
  snapshot.plantUml = snapshot.plantUml.filter((artifact) =>
    selected.has(artifact.diagramKind),
  );
  snapshot.svgArtifacts = snapshot.svgArtifacts.filter((artifact) =>
    selected.has(artifact.diagramKind),
  );
  snapshot.designModelTraceability = snapshot.designModelTraceability.filter((entry) =>
    designTraceabilityTouchesDiagramKinds(entry, selectedKinds),
  );
  snapshot.diagramErrors = Object.fromEntries(
    Object.entries(snapshot.diagramErrors).filter(([kind]) =>
      selected.has(kind as DesignDiagramKind),
    ),
  ) as DesignRunSnapshot["diagramErrors"];
  ensureDesignArtifacts(snapshot);
  snapshot.currentStage = "render_svg";
  snapshot.status = "queued";
  record.snapshot = snapshot;
  await emitDemoStage(record, "generate_design_sequence", "离线演示：已加载用例实现设计");
  await emitDemoStage(record, "generate_design_models", "离线演示：已加载固定设计模型");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_models",
      artifactKind: "model",
    }),
  );
  await emitDemoStage(record, "render_svg", "离线演示：已加载 PlantUML 渲染设计 SVG 图");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "plantuml",
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "svg",
    }),
  );
  completeRecord(record, designRunSnapshotSchema.parse(snapshot));
}

export async function completeOfflineDemoCodeRun(record: RunRecord, input: StartCodeRunRequest) {
  const snapshot = clone(fixture.codeSnapshot);
  retargetSnapshotIds(snapshot, record.snapshot.runId);
  snapshot.generationMode = input.generationMode;
  snapshot.changedFileCount = Object.keys(snapshot.files).length;
  snapshot.currentStage = "verify_code_business_assertions";
  snapshot.status = "queued";
  record.snapshot = snapshot;
  await emitDemoStage(record, "analyze_code_business_logic", "离线演示：已加载业务逻辑");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "analyze_code_business_logic",
      artifactKind: "businessLogic",
      businessLogic: snapshot.businessLogic ?? undefined,
    }),
  );
  await emitDemoStage(record, "generate_code_spec", "离线演示：已加载代码规格");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_code_spec",
      artifactKind: "codeSpec",
    }),
  );
  await emitDemoStage(record, "generate_code_files", "离线演示：已加载固定 React 原型文件");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_code_files",
      artifactKind: "codeFiles",
    }),
  );
  await emitDemoStage(record, "verify_code_business_assertions", "离线演示：代码业务断言已通过");
  if (snapshot.businessAssertionResults) {
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "verify_code_business_assertions",
        artifactKind: "businessAssertionResults",
        businessAssertionResults: snapshot.businessAssertionResults,
      }),
    );
  }
  completeRecord(record, codeRunSnapshotSchema.parse(snapshot));
}

export function createOfflineDemoDocumentInput(input: StartDocumentRunRequest) {
  const requirementSnapshot = clone(fixture.requirementSnapshot);
  ensureRequirementArtifacts(requirementSnapshot);
  const designSnapshot = clone(fixture.designSnapshot);
  ensureDesignArtifacts(designSnapshot);
  return startDocumentRunRequestSchema.parse({
    ...input,
    requirementText: requirementSnapshot.requirementText,
    requirementBaseline: requirementSnapshot.requirementBaseline,
    coverageMatrix: designSnapshot.coverageMatrix,
    traceabilityMatrix: designSnapshot.traceabilityMatrix,
    rules: requirementSnapshot.rules,
    requirementModels: requirementSnapshot.models,
    requirementModelTraceability:
      requirementSnapshot.requirementModelTraceability,
    requirementPlantUml: requirementSnapshot.plantUml,
    requirementSvgArtifacts: requirementSnapshot.svgArtifacts,
    designModels: designSnapshot.models,
    designModelTraceability: designSnapshot.designModelTraceability,
    designPlantUml: designSnapshot.plantUml,
    designSvgArtifacts: designSnapshot.svgArtifacts,
    useAiText: false,
  });
}

export function createOfflineDemoRequirementRuleRepair(
  input: RepairRequirementRuleRequest,
) {
  const baseline = demoRequirementBaseline();
  const requirement =
    baseline.requirements.find(
      (item) => item.sourceRuleId === input.rule.id || item.id === input.rule.id,
    ) ?? baseline.requirements[0];
  return repairRequirementRuleResponseSchema.parse({
    requirement,
    qualityReport: baseline.qualityReport,
    repairRationale: "离线演示：使用预演项目中已确认的需求规则修复结果。",
    blockingReasons: [],
  });
}

export function createOfflineDemoRequirementRulesRepair(
  input: RepairRequirementRulesRequest,
) {
  const baseline = demoRequirementBaseline();
  const candidates = input.targetRuleIds.map((ruleId) => {
    const requirement =
      baseline.requirements.find(
        (item) => item.sourceRuleId === ruleId || item.id === ruleId,
      ) ?? baseline.requirements[0];
    return {
      ruleId,
      requirement,
      qualityReport: baseline.qualityReport,
      repairRationale: "离线演示：使用预演项目中已确认的批量修复结果。",
      blockingReasons: [],
    };
  });
  return repairRequirementRulesResponseSchema.parse({
    candidates,
    failures: [],
  });
}
