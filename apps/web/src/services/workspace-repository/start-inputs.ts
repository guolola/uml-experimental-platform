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
  providerConfigId: string;
  model: ProviderSettings["model"];
}

export interface StartRunInput {
  requirementText: string;
  selectedDiagrams: DiagramType[];
  requestedDiagrams?: DiagramType[];
  dependencyDiagrams?: DiagramType[];
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

export interface StartFeasibilityRunInput {
  selectedArtifacts: Array<"context" | "implementation">;
  providerSettings: ProviderSettingsInput;
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
    requestedDiagrams: selectedDiagrams,
    dependencyDiagrams: [],
    rules,
    contextModels,
    contextRequirementModelTraceability,
    analysisTargetUseCaseIds,
    providerSettings,
  };
}

export function createProviderSettingsInput(): ProviderSettingsInput {
  const settings = loadUserSettings();
  const providerConfigId = settings.providerConfigId.trim();
  const model = settings.defaultModel.trim();
  const providerModelOptions = settings.providerModelOptions
    .map((option) => option.trim())
    .filter(Boolean);

  if (!providerConfigId) {
    throw new Error("请先在个人设置中选择托管 Provider");
  }
  if (!model) {
    throw new Error("请先在个人设置中选择默认模型");
  }
  if (!providerModelOptions.includes(model)) {
    throw new Error("默认模型必须来自当前托管 Provider 的模型目录");
  }

  return {
    providerConfigId,
    model,
  };
}

export function createStartFeasibilityRunInput(
  selectedArtifacts: Array<"context" | "implementation">,
): StartFeasibilityRunInput {
  return {
    selectedArtifacts: (["context", "implementation"] as const).filter((artifact) =>
      selectedArtifacts.includes(artifact),
    ),
    providerSettings: createProviderSettingsInput(),
  };
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
  evidencePackage: EvidencePackage | null = null,
): StartDesignRunInput {
  return {
    requirementBaseline,
    evidencePackage,
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
  designModels: DesignDiagramModelSpec[],
  designPlantUml: DesignPlantUmlArtifact[] = [],
  existingFiles: Record<string, string> = {},
  generationMode: "continue" | "regenerate" = "continue",
): StartCodeRunInput {
  return {
    designModels,
    designPlantUml,
    existingFiles: generationMode === "regenerate" ? {} : existingFiles,
    generationMode,
    providerSettings: createProviderSettingsInput(),
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
  evidencePackage: EvidencePackage | null = null,
): StartDocumentRunInput {
  const base = createStartRunInput(requirementText, []);
  return {
    documentKind,
    requirementText,
    evidencePackage,
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
