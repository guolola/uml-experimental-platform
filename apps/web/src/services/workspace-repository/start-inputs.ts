// Builds typed run-start payloads from workspace state and persisted user model settings.
import type {
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DesignPlantUmlArtifact,
  DesignSvgArtifact,
  DiagramModelSpec,
  DocumentKind,
  DocumentStyleSettings,
  EvidencePackage,
  PlantUmlArtifact,
  ProviderSettings,
  RequirementBaseline,
  RequirementModelTraceabilityEntry,
  SvgArtifact,
} from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../entities/diagram/model";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import { loadUserSettings } from "../../shared/lib/user-settings";

export interface ProviderSettingsInput {
  providerConfigId?: string;
  model: ProviderSettings["model"];
}

export interface StartRunInput {
  requirementText: string;
  selectedDiagrams: DiagramType[];
  rules: RequirementRule[];
  contextModels: DiagramModelSpec[];
  contextRequirementModelTraceability: RequirementModelTraceabilityEntry[];
  analysisTargetUseCaseIds?: string[];
  providerSettings: ProviderSettingsInput;
}

export interface StartDesignRunInput {
  requirementBaseline: RequirementBaseline;
  evidencePackage?: EvidencePackage | null;
  requirementModels: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  selectedDiagrams: DesignDiagramType[];
  requestedDiagrams?: DesignDiagramType[];
  existingDesignModels: DesignDiagramModelSpec[];
  existingDesignModelTraceability: DesignModelTraceabilityEntry[];
  existingDesignPlantUml: DesignPlantUmlArtifact[];
  existingDesignSvgArtifacts: DesignSvgArtifact[];
  providerSettings: ProviderSettingsInput;
}

export interface StartCodeRunInput {
  requirementText: string;
  rules: RequirementRule[];
  evidencePackage?: EvidencePackage | null;
  designModels: DesignDiagramModelSpec[];
  designPlantUml: DesignPlantUmlArtifact[];
  existingFiles: Record<string, string>;
  generationMode: "continue" | "regenerate";
  providerSettings: ProviderSettingsInput;
}

export interface StartDocumentRunInput {
  documentKind: DocumentKind;
  requirementText: string;
  evidencePackage?: EvidencePackage | null;
  rules: RequirementRule[];
  requirementModels: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  requirementPlantUml: PlantUmlArtifact[];
  requirementSvgArtifacts: SvgArtifact[];
  designModels: DesignDiagramModelSpec[];
  designPlantUml: DesignPlantUmlArtifact[];
  designSvgArtifacts: DesignSvgArtifact[];
  providerSettings: ProviderSettingsInput;
  useAiText: boolean;
  documentStyle?: DocumentStyleSettings;
}

export function createStartRunInput(
  requirementText: string,
  selectedDiagrams: DiagramType[],
  rules: RequirementRule[] = [],
  contextModels: DiagramModelSpec[] = [],
  contextRequirementModelTraceability: RequirementModelTraceabilityEntry[] = [],
  analysisTargetUseCaseIds: string[] = [],
): StartRunInput {
  const providerSettings = createProviderSettingsInput();
  return {
    requirementText,
    selectedDiagrams,
    rules,
    contextModels,
    contextRequirementModelTraceability,
    analysisTargetUseCaseIds,
    providerSettings,
  };
}

function createProviderSettingsInput(): ProviderSettingsInput {
  const settings = loadUserSettings();
  const providerConfigId = settings.providerConfigId.trim();
  const model = settings.defaultModel.trim();

  if (!model) {
    throw new Error("请先在设置中选择默认模型");
  }
  if (providerConfigId) {
    return {
      providerConfigId,
      model,
    };
  }

  return { model };
}

export function createStartDesignRunInput(
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  requirementModelTraceability: RequirementModelTraceabilityEntry[],
  selectedDiagrams: DesignDiagramType[],
  requestedDiagrams: DesignDiagramType[] = selectedDiagrams,
  existingDesignModels: DesignDiagramModelSpec[] = [],
  existingDesignModelTraceability: DesignModelTraceabilityEntry[] = [],
  existingDesignPlantUml: DesignPlantUmlArtifact[] = [],
  existingDesignSvgArtifacts: DesignSvgArtifact[] = [],
): StartDesignRunInput {
  return {
    requirementBaseline,
    requirementModels,
    requirementModelTraceability,
    selectedDiagrams,
    requestedDiagrams,
    existingDesignModels,
    existingDesignModelTraceability,
    existingDesignPlantUml,
    existingDesignSvgArtifacts,
    providerSettings: createProviderSettingsInput(),
  };
}

export function createStartCodeRunInput(
  requirementText: string,
  rules: RequirementRule[],
  designModels: DesignDiagramModelSpec[],
  designPlantUml: DesignPlantUmlArtifact[] = [],
  existingFiles: Record<string, string> = {},
  generationMode: "continue" | "regenerate" = "continue",
): StartCodeRunInput {
  const base = createStartRunInput(requirementText, []);
  return {
    requirementText,
    rules,
    designModels,
    designPlantUml,
    existingFiles: generationMode === "regenerate" ? {} : existingFiles,
    generationMode,
    providerSettings: base.providerSettings,
  };
}

export function createStartDocumentRunInput(
  documentKind: DocumentKind,
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  requirementModelTraceability: RequirementModelTraceabilityEntry[],
  requirementPlantUml: PlantUmlArtifact[],
  requirementSvgArtifacts: SvgArtifact[],
  designModels: DesignDiagramModelSpec[],
  designPlantUml: DesignPlantUmlArtifact[],
  designSvgArtifacts: DesignSvgArtifact[],
  documentStyle?: DocumentStyleSettings,
): StartDocumentRunInput {
  const base = createStartRunInput(requirementText, []);
  return {
    documentKind,
    requirementText,
    rules,
    requirementModels,
    requirementModelTraceability,
    requirementPlantUml,
    requirementSvgArtifacts,
    designModels,
    designPlantUml,
    designSvgArtifacts,
    providerSettings: base.providerSettings,
    useAiText: true,
    documentStyle,
  };
}
