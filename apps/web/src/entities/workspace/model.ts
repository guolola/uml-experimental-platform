import type {
  DesignDiagramModelSpec,
  CodeGenerationSpec,
  CodeBusinessLogic,
  CodeRunSnapshot,
  CodeUiMockup,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramError,
  DiagramModelSpec,
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

export interface WorkspaceRecord {
  id: string;
  name: string;
  requirementText: string;
  selectedDiagramTypes: DiagramType[];
  rules: RequirementRule[];
  models: Partial<Record<DiagramType, DiagramModelSpec>>;
  generatedDiagramTypes: DiagramType[];
  plantUml: Partial<Record<DiagramType, string>>;
  svgArtifacts: Partial<Record<DiagramType, SvgArtifact>>;
  diagramErrors: Partial<Record<DiagramType, DiagramError>>;
  selectedDesignDiagramTypes: DesignDiagramType[];
  designModels: Partial<Record<DesignDiagramType, DesignDiagramModelSpec>>;
  generatedDesignDiagramTypes: DesignDiagramType[];
  designPlantUml: Partial<Record<DesignDiagramType, string>>;
  designSvgArtifacts: Partial<Record<DesignDiagramType, DesignSvgArtifact>>;
  designDiagramErrors: Partial<Record<DesignDiagramType, DiagramError>>;
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
