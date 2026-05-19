// Defines the public workspace session context shape and local run diagnostics types.

import type {
  CodeBusinessLogic,
  CodeGenerationSpec,
  CodeRunSnapshot,
  CodeSkillContext,
  CodeSkillResourceDiscoveryPlan,
  CodeSkillResourcePreviewResult,
  CodeSkillResourcePlan,
  CodeTraceEntry,
  CodeVisualDirection,
  CodeUiFidelityReport,
  CodeUiMockup,
  CodeUiReferenceSpec,
  DesignTraceEntry,
  RequirementTraceEntry,
  DocumentKind,
  DocumentStyleSettings,
  DesignDiagramModelSpec,
  DiagramModelSpec,
  RunStage,
} from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { RunStatus, WorkspaceRecord } from "../../../entities/workspace/model";
import type { RunHistoryItem } from "../../history";

export interface DiagnosticEvent {
  id: string;
  at: string;
  label: string;
  detail: string | null;
}

export interface RunDiagnostics {
  runKind: "requirements" | "design" | "code" | "document" | null;
  runId: string | null;
  providerModel: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  activeStage: RunStage | null;
  streamText: string;
  chunkCount: number;
  stageStartedAt: Partial<Record<RunStage, string>>;
  stageMessages: Partial<Record<string, string>>;
  events: DiagnosticEvent[];
  uiMockup: CodeUiMockup | null;
  uiReferenceSpec: CodeUiReferenceSpec | null;
  uiFidelityReport: CodeUiFidelityReport | null;
  visualDirection: CodeVisualDirection | null;
  skillResourceDiscoveryPlan: CodeSkillResourceDiscoveryPlan | null;
  skillResourcePreviews: CodeSkillResourcePreviewResult | null;
  skillResourcePlan: CodeSkillResourcePlan | null;
  codeSkillContext: CodeSkillContext | null;
  requirementTrace: RequirementTraceEntry[];
  designTrace: DesignTraceEntry[];
  codeTrace: CodeTraceEntry[];
}

export type GenerationTaskKind = "requirements" | "design" | "code" | "document";

export interface GenerationTask {
  clientTaskId: string;
  runId: string | null;
  kind: GenerationTaskKind;
  documentKind?: DocumentKind;
  title: string;
  status: RunStatus;
  progress: number;
  message: string | null;
  errorMessage: string | null;
  diagnostics: RunDiagnostics;
  startedAt: string;
  finishedAt: string | null;
}

export interface WorkspaceSessionState {
  requirementText: string;
  setRequirementText: (value: string) => void;
  rules: RequirementRule[];
  addRequirementRule: () => void;
  createRequirementRule: (input: {
    category: RequirementRule["category"];
    text: string;
    relatedDiagrams: DiagramType[];
  }) => void;
  updateRequirementRule: (
    id: string,
    patch: Partial<RequirementRule>,
  ) => void;
  deleteRequirementRule: (id: string) => void;
  models: WorkspaceRecord["models"];
  selectedDiagrams: DiagramType[];
  setSelectedDiagrams: (value: DiagramType[]) => void;
  plantUml: Partial<Record<DiagramType, string>>;
  svgArtifacts: WorkspaceRecord["svgArtifacts"];
  diagramErrors: WorkspaceRecord["diagramErrors"];
  selectedDesignDiagrams: DesignDiagramType[];
  setSelectedDesignDiagrams: (value: DesignDiagramType[]) => void;
  designModels: WorkspaceRecord["designModels"];
  designPlantUml: WorkspaceRecord["designPlantUml"];
  designSvgArtifacts: WorkspaceRecord["designSvgArtifacts"];
  designDiagramErrors: WorkspaceRecord["designDiagramErrors"];
  codeSpec: CodeGenerationSpec | null;
  codeBusinessLogic: CodeBusinessLogic | null;
  codeFiles: Record<string, string>;
  codeEntryFile: string | null;
  codeDependencies: Record<string, string>;
  codeUiMockup: CodeUiMockup | null;
  codeAgentPlan: string[];
  codeSkills: CodeRunSnapshot["selectedCodeSkills"];
  codeSkillDiagnostics: CodeRunSnapshot["skillDiagnostics"];
  codeSkillResourcePlan: CodeRunSnapshot["skillResourcePlan"];
  codeSkillContext: CodeRunSnapshot["codeSkillContext"];
  codeDiagnostics: CodeRunSnapshot["diagnostics"];
  updateCodeFile: (path: string, value: string) => void;
  generatedDesignDiagrams: DesignDiagramType[];
  generatedDiagrams: DiagramType[];
  generating: boolean;
  runStatus: RunStatus;
  runProgress: number;
  runMessage: string | null;
  errorMessage: string | null;
  generationTasks: GenerationTask[];
  selectedGenerationTaskId: string | null;
  selectGenerationTask: (id: string) => void;
  clearCompletedGenerationTasks: () => void;
  generateRules: () => Promise<void>;
  generateDiagrams: (only?: DiagramType[]) => Promise<void>;
  generateDesignDiagrams: (only?: DesignDiagramType[]) => Promise<void>;
  generateCodePrototype: (mode?: "continue" | "regenerate") => Promise<void>;
  generateRequirementsSpec: (documentStyle?: DocumentStyleSettings) => Promise<void>;
  generateSoftwareDesignSpec: (documentStyle?: DocumentStyleSettings) => Promise<void>;
  rulesForDiagram: (diagram: DiagramType) => RequirementRule[];
  textVersion: number;
  rulesVersion: number;
  rulesBasedOnTextVersion: number | null;
  diagramVersions: Partial<Record<DiagramType, number>>;
  isRulesStale: boolean;
  staleDiagrams: DiagramType[];
  historyItems: RunHistoryItem[];
  refreshHistory: () => Promise<void>;
  restoreRunHistory: (id: string) => Promise<void>;
  deleteRunHistory: (id: string) => Promise<void>;
  clearRunHistory: () => Promise<void>;
  renderPlantUml: (diagram: DiagramType, source: string) => Promise<void>;
  currentRunDiagnostics: RunDiagnostics;
}

export type RunMode =
  | { kind: "rules-only" }
  | { kind: "full-diagrams" }
  | { kind: "partial-diagrams"; diagrams: DiagramType[] };
