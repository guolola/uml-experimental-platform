// Creates initial snapshots for each run kind before pipelines start mutating them.
import {
  codeRunSnapshotSchema,
  designRunSnapshotSchema,
  documentRunSnapshotSchema,
  runSnapshotSchema,
  type CodeRunSnapshot,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignRunSnapshot,
  type DiagramKind,
  type DiagramModelSpec,
  type DocumentKind,
  type DocumentRunSnapshot,
  type RequirementRule,
  type RunSnapshot,
} from "@uml-platform/contracts";

const DESIGN_DIAGRAM_ORDER: DesignDiagramKind[] = [
  "sequence",
  "class",
  "activity",
  "deployment",
  "table",
];

function withSequenceDependency(selectedDiagrams: DesignDiagramKind[]) {
  const unique = Array.from(new Set(selectedDiagrams));
  const needsSequence = unique.some((diagram) => diagram !== "sequence");
  return needsSequence && !unique.includes("sequence")
    ? (["sequence", ...unique] as DesignDiagramKind[])
    : unique;
}

function withDesignDependencies(selectedDiagrams: DesignDiagramKind[]) {
  const withSequence = new Set(withSequenceDependency(selectedDiagrams));
  if (withSequence.has("table")) {
    withSequence.add("class");
  }
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => withSequence.has(diagram));
}

function normalizeSnapshotFilePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function formatDocumentTimestamp(date = new Date()) {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}`;
  return `${datePart}-${timePart}-${pad(date.getMilliseconds(), 3)}`;
}

export function createEmptySnapshot(
  runId: string,
  requirementText: string,
  selectedDiagrams: DiagramKind[],
  rules: RequirementRule[] = [],
): RunSnapshot {
  return runSnapshotSchema.parse({
    runId,
    requirementText,
    selectedDiagrams,
    rules,
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

export function createEmptyDesignSnapshot(
  runId: string,
  input: {
    requirementText: string;
    selectedDiagrams: DesignDiagramKind[];
    rules: RequirementRule[];
    requirementModels: DiagramModelSpec[];
    requirementModelTraceability: RunSnapshot["requirementModelTraceability"];
  },
): DesignRunSnapshot {
  return designRunSnapshotSchema.parse({
    runId,
    requirementText: input.requirementText,
    selectedDiagrams: withDesignDependencies(input.selectedDiagrams),
    rules: input.rules,
    requirementModels: input.requirementModels,
    requirementModelTraceability: input.requirementModelTraceability,
    models: [],
    designModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

export function createEmptyCodeSnapshot(
  runId: string,
  input: {
    requirementText: string;
    rules: RequirementRule[];
    designModels: DesignDiagramModelSpec[];
    designPlantUml?: Array<{ diagramKind: DesignDiagramKind; source: string }>;
    existingFiles?: Record<string, string>;
    generationMode?: "continue" | "regenerate";
  },
): CodeRunSnapshot {
  const generationMode = input.generationMode ?? "continue";
  const existingFiles = Object.fromEntries(
    Object.entries(input.existingFiles ?? {}).filter(
      ([path]) => !normalizeSnapshotFilePath(path).startsWith("/src/docs/"),
    ),
  );
  return codeRunSnapshotSchema.parse({
    runId,
    requirementText: input.requirementText,
    rules: input.rules,
    designModels: input.designModels,
    designPlantUml: input.designPlantUml ?? [],
    spec: null,
    businessLogic: null,
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    files: generationMode === "regenerate" ? {} : existingFiles,
    entryFile: null,
    dependencies: {},
    agentPlan: [],
    generationMode,
    changedFileCount: 0,
    diagnostics: [],
    codeContextHash: null,
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

export function createEmptyDocumentSnapshot(
  runId: string,
  input: {
    documentKind: DocumentKind;
    requirementText: string;
  },
): DocumentRunSnapshot {
  const timestamp = formatDocumentTimestamp();
  const fileName =
    input.documentKind === "requirementsSpec"
      ? `需求规格说明书-${timestamp}.docx`
      : `软件设计说明书-${timestamp}.docx`;
  return documentRunSnapshotSchema.parse({
    runId,
    documentKind: input.documentKind,
    requirementText: input.requirementText,
    documentId: null,
    sections: [],
    fileName,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 0,
    missingArtifacts: [],
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}
