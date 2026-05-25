import type {
  DesignDiagramModelSpec,
  CodeGenerationSpec,
  CodeBusinessLogic,
  CodeRunSnapshot,
  CodeUiMockup,
  DesignRunSnapshot,
  DesignModelTraceabilityEntry,
  DesignSvgArtifact,
  DiagramError,
  DiagramModelSpec,
  RequirementModelTraceabilityEntry,
  RequirementBaseline,
  RequirementQualityReport,
  RunSnapshot,
  RunStage,
  RunStatus as ContractRunStatus,
  SvgArtifact,
} from "@uml-platform/contracts";
import type { DiagramType } from "../diagram/model";
import type { DesignDiagramType } from "../diagram/model";
import type { RequirementRule } from "../requirement-rule/model";

export type WorkspaceRunSnapshot = RunSnapshot;
export type WorkspaceDesignRunSnapshot = DesignRunSnapshot;
export type WorkspaceCodeRunSnapshot = CodeRunSnapshot;
export type RunStatus = "idle" | ContractRunStatus;

export interface ManualModelEditStatus {
  status: "dirty" | "rerendered";
  warning: string | null;
  editedAt: string;
  rerenderedAt?: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  requirementText: string;
  selectedDiagramTypes: DiagramType[];
  rules: RequirementRule[];
  requirementBaseline: RequirementBaseline | null;
  requirementQualityReport: RequirementQualityReport | null;
  models: Partial<Record<DiagramType, DiagramModelSpec>>;
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  generatedDiagramTypes: DiagramType[];
  plantUml: Partial<Record<DiagramType, string>>;
  svgArtifacts: Partial<Record<DiagramType, SvgArtifact>>;
  diagramErrors: Partial<Record<DiagramType, DiagramError>>;
  selectedDesignDiagramTypes: DesignDiagramType[];
  designModels: Record<string, DesignDiagramModelSpec>;
  designModelTraceability: DesignModelTraceabilityEntry[];
  generatedDesignDiagramTypes: DesignDiagramType[];
  designPlantUml: Record<string, string>;
  designSvgArtifacts: Record<string, DesignSvgArtifact>;
  designDiagramErrors: Partial<Record<DesignDiagramType, DiagramError>>;
  manualModelEditStatus: Record<string, ManualModelEditStatus>;
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
  rulesVersion: number;
  rulesBasedOnTextVersion: number | null;
  diagramVersions: Partial<Record<DiagramType, number>>;
  currentStage: RunStage | null;
  runStatus: RunStatus;
  runProgress: number;
  runMessage: string | null;
  errorMessage: string | null;
}
