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
  },
): DesignRunSnapshot {
  return designRunSnapshotSchema.parse({
    runId,
    requirementText: input.requirementText,
    selectedDiagrams: withDesignDependencies(input.selectedDiagrams),
    rules: input.rules,
    requirementModels: input.requirementModels,
    models: [],
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
  const fileName =
    input.documentKind === "requirementsSpec"
      ? "需求规格说明书.docx"
      : "软件设计说明书.docx";
  return documentRunSnapshotSchema.parse({
    runId,
    documentKind: input.documentKind,
    requirementText: input.requirementText,
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
