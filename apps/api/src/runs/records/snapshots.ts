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
  type RequirementBaseline,
  type RunSnapshot,
} from "@uml-platform/contracts";
import {
  buildEmptyRequirementBaseline,
  buildRequirementBaseline,
} from "../baselines/requirement-baseline.js";

const DESIGN_DIAGRAM_ORDER: DesignDiagramKind[] = [
  "sequence",
  "class",
  "activity",
  "deployment",
  "table",
];

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
  context: {
    models?: DiagramModelSpec[];
    requirementModelTraceability?: RunSnapshot["requirementModelTraceability"];
  } = {},
): RunSnapshot {
  const requirementBaseline = rules.length > 0
    ? buildRequirementBaseline({ runId, requirementText, rules })
    : buildEmptyRequirementBaseline({ runId });
  return runSnapshotSchema.parse({
    runId,
    requirementText,
    selectedDiagrams,
    rules,
    requirementBaseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    models: context.models ?? [],
    requirementModelTraceability: context.requirementModelTraceability ?? [],
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
    selectedDiagrams: DesignDiagramKind[];
    requirementBaseline: RequirementBaseline;
    requirementModels: DiagramModelSpec[];
    requirementModelTraceability: RunSnapshot["requirementModelTraceability"];
    requestedDiagrams?: DesignDiagramKind[];
    existingDesignModels?: DesignRunSnapshot["models"];
    existingDesignModelTraceability?: DesignRunSnapshot["designModelTraceability"];
    existingDesignPlantUml?: DesignRunSnapshot["plantUml"];
    existingDesignSvgArtifacts?: DesignRunSnapshot["svgArtifacts"];
  },
): DesignRunSnapshot {
  return designRunSnapshotSchema.parse({
    runId,
    requirementText: "",
    selectedDiagrams: DESIGN_DIAGRAM_ORDER.filter((diagram) =>
      input.selectedDiagrams.includes(diagram),
    ),
    requestedDiagrams: input.requestedDiagrams
      ? DESIGN_DIAGRAM_ORDER.filter((diagram) =>
          input.requestedDiagrams?.includes(diagram),
        )
      : undefined,
    rules: [],
    requirementBaseline: input.requirementBaseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    requirementModels: input.requirementModels,
    requirementModelTraceability: input.requirementModelTraceability,
    models: input.existingDesignModels ?? [],
    designModelTraceability: input.existingDesignModelTraceability ?? [],
    plantUml: input.existingDesignPlantUml ?? [],
    svgArtifacts: input.existingDesignSvgArtifacts ?? [],
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
    requirementBaseline?: RequirementBaseline | null;
    designModels: DesignDiagramModelSpec[];
    designPlantUml?: Array<{ diagramKind: DesignDiagramKind; source: string }>;
    existingFiles?: Record<string, string>;
    generationMode?: "continue" | "regenerate";
  },
): CodeRunSnapshot {
  const generationMode = input.generationMode ?? "continue";
  const requirementBaseline = input.requirementBaseline ??
    (input.rules.length > 0
      ? buildRequirementBaseline({
          runId,
          requirementText: input.requirementText,
          rules: input.rules,
        })
      : buildEmptyRequirementBaseline({ runId }));
  const existingFiles = Object.fromEntries(
    Object.entries(input.existingFiles ?? {}).filter(
      ([path]) => !normalizeSnapshotFilePath(path).startsWith("/src/docs/"),
    ),
  );
  return codeRunSnapshotSchema.parse({
    runId,
    requirementText: input.requirementText,
    rules: input.rules,
    requirementBaseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
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
    businessAssertionResults: null,
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
    requirementBaseline?: RequirementBaseline | null;
  },
): DocumentRunSnapshot {
  const requirementBaseline =
    input.requirementBaseline ?? buildEmptyRequirementBaseline({ runId });
  const timestamp = formatDocumentTimestamp();
  const fileName =
    input.documentKind === "requirementsSpec"
      ? `需求规格说明书-${timestamp}.docx`
      : `软件设计说明书-${timestamp}.docx`;
  return documentRunSnapshotSchema.parse({
    runId,
    documentKind: input.documentKind,
    requirementText: input.requirementText,
    requirementBaseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
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
