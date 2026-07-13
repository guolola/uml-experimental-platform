// Owns run request, snapshot, event, and action contracts shared by API pipelines and web clients.
import { z } from "zod";
import { evidencePackageSchema } from "./evidence.js";
import {
  designDiagramModelSpecSchema,
  designModelTraceabilityEntrySchema,
  designPlantUmlArtifactSchema,
  designSvgArtifactSchema,
  diagramModelSpecSchema,
  plantUmlArtifactSchema,
  requirementModelTraceabilityEntrySchema,
  svgArtifactSchema,
} from "./models.js";
import {
  atomicRequirementSchema,
  atomicRequirementStatusSchema,
  coverageMatrixSchema,
  designDiagramKindSchema,
  diagramKindSchema,
  requirementBaselineSchema,
  requirementFieldProvenanceEntrySchema,
  requirementQualityReportSchema,
  requirementRuleSchema,
  requirementRulesArraySchema,
  requirementRulesSchema,
  traceabilityMatrixSchema,
  umlDiagramKindSchema,
} from "./requirements.js";
import {
  codeAppBlueprintSchema,
  codeBusinessAssertionResultSchema,
  codeBusinessLogicSchema,
  codeComponentRegistrySchema,
  codeDesignTokensSchema,
  designModelCoverageReportSchema,
  designToCodeMappingSchema,
  codeFileGenerationDiagnosticSchema,
  codeFilePlanSchema,
  codeFileOperationManifestResultSchema,
  codeGenerationSpecSchema,
  codeImplementationBriefSchema,
  codeQualityDiagnosticSchema,
  codeRepairLoopSummarySchema,
  codeSkillContextSchema,
  codeSkillDiagnosticsSchema,
  codeSkillResourceDiscoveryPlanSchema,
  codeSkillResourcePlanSchema,
  codeSkillResourcePreviewResultSchema,
  codeSkillSelectionSchema,
  codeUiBlueprintSchema,
  codeUiFidelityReportSchema,
  codeUiIrSchema,
  codeUiMockupSchema,
  codeUiReferenceSpecSchema,
  codeVisualDiffReportSchema,
  codeVisualDirectionSchema,
  loadedCodeSkillSchema,
} from "./code-generation.js";
import {
  imageProviderSettingsSchema,
  providerSettingsSchema,
} from "./provider-configs.js";
import {
  documentKindSchema,
  documentSectionSchema,
  documentStyleSettingsSchema,
} from "./documents.js";

export const startRunRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  requirementText: z.string().min(1),
  selectedDiagrams: z.array(diagramKindSchema),
  requestedDiagrams: z.array(diagramKindSchema).optional(),
  dependencyDiagrams: z.array(diagramKindSchema).optional(),
  rules: requirementRulesSchema.default([]),
  contextModels: z.array(diagramModelSpecSchema).default([]),
  contextRequirementModelTraceability: z
    .array(requirementModelTraceabilityEntrySchema)
    .default([]),
  analysisTargetUseCaseIds: z.array(z.string().min(1)).default([]),
  providerSettings: providerSettingsSchema.optional(),
});
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const startRunCommandSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    selectedDiagrams: z.array(diagramKindSchema),
    requestedDiagrams: z.array(diagramKindSchema).optional(),
    dependencyDiagrams: z.array(diagramKindSchema).optional(),
    analysisTargetUseCaseIds: z.array(z.string().min(1)).default([]),
    providerSettings: providerSettingsSchema.optional(),
  })
  .strict();
export type StartRunCommand = z.infer<typeof startRunCommandSchema>;

export const requirementRuleRepairSuggestionSchema = z.object({
  fields: z
    .object({
      actor: requirementFieldProvenanceEntrySchema.optional(),
      subject: requirementFieldProvenanceEntrySchema.optional(),
      action: requirementFieldProvenanceEntrySchema.optional(),
      object: requirementFieldProvenanceEntrySchema.optional(),
      condition: requirementFieldProvenanceEntrySchema.optional(),
      outcome: requirementFieldProvenanceEntrySchema.optional(),
      acceptanceCriteria: requirementFieldProvenanceEntrySchema.optional(),
    })
    .default({}),
  confidence: z.number().min(0).max(1).optional(),
  status: atomicRequirementStatusSchema.optional(),
  rationale: z.string().min(1).optional(),
});
export type RequirementRuleRepairSuggestion = z.infer<
  typeof requirementRuleRepairSuggestionSchema
>;

export const requirementRuleBatchRepairSuggestionSchema = z.object({
  repairs: z.array(
    z
      .object({
        ruleId: z.string().min(1),
      })
      .passthrough(),
  ),
});
export type RequirementRuleBatchRepairSuggestion = z.infer<
  typeof requirementRuleBatchRepairSuggestionSchema
>;

export const repairRequirementRuleRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  requirementText: z.string().min(1),
  rule: requirementRuleSchema,
  baseline: requirementBaselineSchema,
  providerSettings: providerSettingsSchema.optional(),
});
export type RepairRequirementRuleRequest = z.infer<
  typeof repairRequirementRuleRequestSchema
>;

export const repairRequirementRuleResponseSchema = z.object({
  requirement: atomicRequirementSchema,
  qualityReport: requirementQualityReportSchema,
  repairRationale: z.string().min(1),
  blockingReasons: z.array(z.string().min(1)),
});
export type RepairRequirementRuleResponse = z.infer<
  typeof repairRequirementRuleResponseSchema
>;

export const repairRequirementRulesRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  requirementText: z.string().min(1),
  rules: requirementRulesArraySchema(1),
  targetRuleIds: z.array(z.string().min(1)).min(1),
  baseline: requirementBaselineSchema,
  providerSettings: providerSettingsSchema.optional(),
});
export type RepairRequirementRulesRequest = z.infer<
  typeof repairRequirementRulesRequestSchema
>;

export const repairRequirementRulesResponseSchema = z.object({
  candidates: z.array(
    repairRequirementRuleResponseSchema.extend({
      ruleId: z.string().min(1),
    }),
  ),
  failures: z.array(
    z.object({
      ruleId: z.string().min(1),
      errorMessage: z.string().min(1),
    }),
  ),
});
export type RepairRequirementRulesResponse = z.infer<
  typeof repairRequirementRulesResponseSchema
>;

export const startDesignRunRequestSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    requirementBaseline: requirementBaselineSchema,
    evidencePackage: evidencePackageSchema.nullable().optional(),
    requirementModels: z.array(diagramModelSpecSchema),
    requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema).min(1),
    selectedDiagrams: z.array(designDiagramKindSchema).min(1),
    requestedDiagrams: z.array(designDiagramKindSchema).optional(),
    existingDesignModels: z.array(designDiagramModelSpecSchema).default([]),
    existingDesignModelTraceability: z.array(designModelTraceabilityEntrySchema).default([]),
    existingDesignPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
    existingDesignSvgArtifacts: z.array(designSvgArtifactSchema).default([]),
    providerSettings: providerSettingsSchema.optional(),
  })
  .strict();
export type StartDesignRunRequest = z.infer<typeof startDesignRunRequestSchema>;

export const startDesignRunCommandSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    selectedDiagrams: z.array(designDiagramKindSchema).min(1),
    requestedDiagrams: z.array(designDiagramKindSchema).optional(),
    providerSettings: providerSettingsSchema.optional(),
  })
  .strict();
export type StartDesignRunCommand = z.infer<typeof startDesignRunCommandSchema>;

export const startCodeRunRequestSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    evidencePackage: evidencePackageSchema.nullable().optional(),
    designModels: z.array(designDiagramModelSpecSchema).min(1),
    designPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
    existingFiles: z.record(z.string().min(1), z.string()).default({}),
    generationMode: z.enum(["continue", "regenerate"]).default("continue"),
    providerSettings: providerSettingsSchema.optional(),
    imageProviderSettings: imageProviderSettingsSchema.optional(),
  })
  .strict();
export type StartCodeRunRequest = z.infer<typeof startCodeRunRequestSchema>;

export const startCodeRunCommandSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    generationMode: z.enum(["continue", "regenerate"]).default("continue"),
    providerSettings: providerSettingsSchema.optional(),
    imageProviderSettings: imageProviderSettingsSchema.optional(),
  })
  .strict();
export type StartCodeRunCommand = z.infer<typeof startCodeRunCommandSchema>;

export const startDocumentRunRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  documentKind: documentKindSchema,
  requirementText: z.string().min(1),
  requirementBaseline: requirementBaselineSchema.nullable().optional(),
  evidencePackage: evidencePackageSchema.nullable().optional(),
  rules: requirementRulesSchema.default([]),
  requirementModels: z.array(diagramModelSpecSchema).default([]),
  requirementModelTraceability: z
    .array(requirementModelTraceabilityEntrySchema)
    .default([]),
  requirementPlantUml: z.array(plantUmlArtifactSchema).default([]),
  requirementSvgArtifacts: z.array(svgArtifactSchema).default([]),
  designModels: z.array(designDiagramModelSpecSchema).default([]),
  designModelTraceability: z.array(designModelTraceabilityEntrySchema).default([]),
  designPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
  designSvgArtifacts: z.array(designSvgArtifactSchema).default([]),
  providerSettings: providerSettingsSchema.optional(),
  useAiText: z.boolean().default(true),
  documentStyle: documentStyleSettingsSchema.optional(),
});
export type StartDocumentRunRequest = z.infer<typeof startDocumentRunRequestSchema>;

export const startDocumentRunCommandSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    documentKind: documentKindSchema,
    providerSettings: providerSettingsSchema.optional(),
    useAiText: z.boolean().default(true),
    documentStyle: documentStyleSettingsSchema.optional(),
  })
  .strict();
export type StartDocumentRunCommand = z.infer<typeof startDocumentRunCommandSchema>;

export const runStageSchema = z.enum([
  "extract_rules",
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
  "generate_tests",
  "analyze_code_business_logic",
  "analyze_code_product",
  "plan_code_ui",
  "generate_code_ui_mockup",
  "analyze_code_ui_mockup",
  "generate_code_ui_ir",
  "load_web_design_skill",
  "select_code_skills",
  "plan_code_files",
  "generate_code_spec",
  "generate_code_files",
  "plan_code",
  "write_code_files",
  "audit_code_quality",
  "verify_code_ui_fidelity",
  "verify_code_rendered_preview",
  "verify_code_business_assertions",
  "verify_code_preview",
  "repair_code_files",
  "generate_document_text",
  "render_document_file",
  "generate_plantuml",
  "render_svg",
]);
export type RunStage = z.infer<typeof runStageSchema>;

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runErrorCodeSchema = z.enum([
  "USER_ENTITLEMENT_REQUIRED",
  "USER_ENTITLEMENT_NEGATIVE_BALANCE",
  "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT",
  "PLATFORM_PROVIDER_AUTH_FAILED",
  "PLATFORM_PROVIDER_RATE_LIMITED",
  "PLATFORM_PROVIDER_UNAVAILABLE",
  "PLATFORM_PROVIDER_TIMEOUT",
  "RUN_MODEL_OUTPUT_EMPTY",
  "RUN_STRUCTURED_OUTPUT_INVALID",
  "RUN_DEPENDENCY_MISSING",
  "RUN_RENDER_FAILED",
  "RUN_CANCELLED",
  "RUN_INTERNAL_ERROR",
  "RUN_LEGACY_FAILURE",
]);
export type RunErrorCode = z.infer<typeof runErrorCodeSchema>;

export const runErrorCategorySchema = z.enum([
  "user_entitlement",
  "platform_provider",
  "generation",
  "render",
  "access",
  "internal",
]);
export type RunErrorCategory = z.infer<typeof runErrorCategorySchema>;

export const runErrorSchema = z.object({
  code: runErrorCodeSchema,
  message: z.string().min(1),
  category: runErrorCategorySchema,
  retryable: z.boolean(),
  details: z.record(z.string().min(1), z.unknown()).optional(),
});
export type RunError = z.infer<typeof runErrorSchema>;

export const diagramErrorSchema = z.object({
  stage: runStageSchema,
  error: runErrorSchema,
});
export type DiagramError = z.infer<typeof diagramErrorSchema>;

export const designTraceEntrySchema = z.object({
  stage: z.enum([
    "generate_design_sequence",
    "generate_design_models",
    "generate_plantuml",
    "render_svg",
  ]),
  attempt: z.number().int().min(1),
  kind: z.enum([
    "llm_output",
    "parse_error",
    "parsed_model",
    "plantuml_source",
    "render_error",
    "repair_output",
    "repaired_plantuml",
  ]),
  diagramKind: designDiagramKindSchema.optional(),
  rawOutput: z.string().optional(),
  rawOutputTruncated: z.boolean().optional(),
  rawOutputOriginalLength: z.number().int().min(0).optional(),
  parsedData: z.unknown().optional(),
  plantUmlSource: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().min(1),
});
export type DesignTraceEntry = z.infer<typeof designTraceEntrySchema>;

export const requirementTraceEntrySchema = z.object({
  stage: z.enum([
    "generate_models",
    "generate_plantuml",
    "render_svg",
  ]),
  attempt: z.number().int().min(1),
  kind: z.enum([
    "llm_output",
    "parse_error",
    "parsed_model",
    "plantuml_source",
    "render_error",
    "repair_output",
    "repaired_plantuml",
  ]),
  diagramKind: diagramKindSchema.optional(),
  rawOutput: z.string().optional(),
  rawOutputTruncated: z.boolean().optional(),
  rawOutputOriginalLength: z.number().int().min(0).optional(),
  parsedData: z.unknown().optional(),
  plantUmlSource: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().min(1),
});
export type RequirementTraceEntry = z.infer<typeof requirementTraceEntrySchema>;

export const codeTraceEntrySchema = z.object({
  stage: z.enum([
    "generate_file_operations",
    "generate_implementation_brief",
    "generate_file_manifest",
    "generate_file_content",
  ]),
  attempt: z.number().int().min(1),
  kind: z.enum([
    "llm_output",
    "parse_error",
    "parsed_data",
    "validation_error",
    "repair_output",
    "repaired_data",
    "file_content",
  ]),
  path: z.string().min(1).optional(),
  rawOutput: z.string().optional(),
  rawOutputTruncated: z.boolean().optional(),
  rawOutputOriginalLength: z.number().int().min(0).optional(),
  parsedData: z.unknown().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().min(1),
});
export type CodeTraceEntry = z.infer<typeof codeTraceEntrySchema>;

export const runSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string(),
  selectedDiagrams: z.array(diagramKindSchema),
  requestedDiagrams: z.array(diagramKindSchema).optional(),
  dependencyDiagrams: z.array(diagramKindSchema).optional(),
  analysisTargetUseCaseIds: z.array(z.string().min(1)).default([]),
  rules: requirementRulesSchema,
  requirementBaseline: requirementBaselineSchema.nullable().default(null),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  evidencePackage: evidencePackageSchema.nullable().default(null),
  models: z.array(diagramModelSpecSchema),
  requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema),
  plantUml: z.array(plantUmlArtifactSchema),
  svgArtifacts: z.array(svgArtifactSchema),
  diagramErrors: z.record(diagramKindSchema, diagramErrorSchema).default({}),
  requirementTrace: z.array(requirementTraceEntrySchema).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  error: runErrorSchema.nullable(),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

export const designRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string(),
  selectedDiagrams: z.array(designDiagramKindSchema),
  requestedDiagrams: z.array(designDiagramKindSchema).optional(),
  rules: requirementRulesSchema,
  requirementBaseline: requirementBaselineSchema.nullable().default(null),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  evidencePackage: evidencePackageSchema.nullable().default(null),
  requirementModels: z.array(diagramModelSpecSchema),
  requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema),
  models: z.array(designDiagramModelSpecSchema),
  designModelTraceability: z.array(designModelTraceabilityEntrySchema),
  plantUml: z.array(designPlantUmlArtifactSchema),
  svgArtifacts: z.array(designSvgArtifactSchema),
  diagramErrors: z.record(z.string().min(1), diagramErrorSchema).default({}),
  designTrace: z.array(designTraceEntrySchema).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  error: runErrorSchema.nullable(),
});
export type DesignRunSnapshot = z.infer<typeof designRunSnapshotSchema>;

export const codeRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string().optional(),
  rules: requirementRulesSchema.optional(),
  requirementBaseline: requirementBaselineSchema.nullable().optional(),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  evidencePackage: evidencePackageSchema.nullable().default(null),
  designModels: z.array(designDiagramModelSpecSchema),
  designPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
  spec: codeGenerationSpecSchema.nullable(),
  businessLogic: codeBusinessLogicSchema.nullable().default(null),
  designToCodeMapping: designToCodeMappingSchema.nullable().default(null),
  designModelCoverageReport: designModelCoverageReportSchema.nullable().default(null),
  loadedCodeSkill: loadedCodeSkillSchema.nullable().default(null),
  visualDirection: codeVisualDirectionSchema.nullable().default(null),
  skillResourceDiscoveryPlan: codeSkillResourceDiscoveryPlanSchema.nullable().default(null),
  skillResourcePreviews: codeSkillResourcePreviewResultSchema.nullable().default(null),
  skillResourcePlan: codeSkillResourcePlanSchema.nullable().default(null),
  codeSkillContext: codeSkillContextSchema.nullable().default(null),
  appBlueprint: codeAppBlueprintSchema.nullable().default(null),
  uiBlueprint: codeUiBlueprintSchema.nullable().default(null),
  uiMockup: codeUiMockupSchema.nullable().default(null),
  uiReferenceSpec: codeUiReferenceSpecSchema.nullable().default(null),
  uiFidelityReport: codeUiFidelityReportSchema.nullable().default(null),
  designTokens: codeDesignTokensSchema.nullable().default(null),
  componentRegistry: codeComponentRegistrySchema.nullable().default(null),
  uiIr: codeUiIrSchema.nullable().default(null),
  visualDiffReport: codeVisualDiffReportSchema.nullable().default(null),
  businessAssertionResults: codeBusinessAssertionResultSchema.nullable().default(null),
  repairLoopSummary: codeRepairLoopSummarySchema.nullable().default(null),
  selectedCodeSkills: z.array(codeSkillSelectionSchema).default([]),
  skillDiagnostics: z.array(codeSkillDiagnosticsSchema).default([]),
  filePlan: codeFilePlanSchema.nullable().default(null),
  codeImplementationBrief: codeImplementationBriefSchema.nullable().default(null),
  codeFileOperationManifest: codeFileOperationManifestResultSchema.nullable().default(null),
  fileGenerationDiagnostics: z.array(codeFileGenerationDiagnosticSchema).default([]),
  codeTrace: z.array(codeTraceEntrySchema).default([]),
  codeGenerationMode: z.enum(["json_schema_operations", "segmented_file_generation"]).default("json_schema_operations"),
  qualityDiagnostics: z.array(codeQualityDiagnosticSchema).default([]),
  files: z.record(z.string().min(1), z.string()),
  entryFile: z.string().min(1).nullable(),
  dependencies: z.record(z.string().min(1), z.string().min(1)).default({}),
  agentPlan: z.array(z.string().min(1)).default([]),
  generationMode: z.enum(["continue", "regenerate"]).default("continue"),
  changedFileCount: z.number().int().min(0).default(0),
  diagnostics: z.array(
    z.object({
      stage: runStageSchema,
      message: z.string().min(1),
      at: z.string().min(1),
    }),
  ).default([]),
  codeContextHash: z.string().nullable().default(null),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  error: runErrorSchema.nullable(),
});
export type CodeRunSnapshot = z.infer<typeof codeRunSnapshotSchema>;

export const documentRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  documentKind: documentKindSchema,
  requirementText: z.string(),
  requirementBaseline: requirementBaselineSchema.nullable().default(null),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  evidencePackage: evidencePackageSchema.nullable().default(null),
  documentId: z.string().min(1).nullable().default(null),
  sections: z.array(documentSectionSchema).default([]),
  fileName: z.string().min(1).nullable(),
  mimeType: z.string().min(1).nullable(),
  byteLength: z.number().int().min(0).default(0),
  missingArtifacts: z.array(z.string()).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  error: runErrorSchema.nullable(),
});
export type DocumentRunSnapshot = z.infer<typeof documentRunSnapshotSchema>;

export const queuedRunEventSchema = z.object({
  type: z.literal("queued"),
  queuePosition: z.number().int().min(0).optional(),
  queueAhead: z.number().int().min(0).optional(),
  waitMs: z.number().int().min(0).optional(),
  estimatedWaitMs: z.number().int().min(0).optional(),
  queueReason: z.enum(["global", "provider", "project", "user", "run"]).optional(),
});

export const stageStartedRunEventSchema = z.object({
  type: z.literal("stage_started"),
  stage: runStageSchema,
});

export const llmChunkRunEventSchema = z.object({
  type: z.literal("llm_chunk"),
  stage: runStageSchema,
  chunk: z.string(),
});

export const stageProgressRunEventSchema = z.object({
  type: z.literal("stage_progress"),
  stage: runStageSchema,
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  error: runErrorSchema.optional(),
  diagramKind: umlDiagramKindSchema.optional(),
  modelId: z.string().min(1).optional(),
  subtaskId: z.string().min(1).optional(),
  subtaskLabel: z.string().min(1).optional(),
  subtaskStatus: z
    .enum([
      "queued",
      "running",
      "repairing",
      "rendering",
      "completed",
      "failed",
      "pending_review",
    ])
    .optional(),
  parallelGroup: z.string().min(1).optional(),
  queuePosition: z.number().int().min(0).optional(),
  queueAhead: z.number().int().min(0).optional(),
  waitMs: z.number().int().min(0).optional(),
  estimatedWaitMs: z.number().int().min(0).optional(),
  queueReason: z.enum(["global", "provider", "project", "user", "run"]).optional(),
});

export const artifactReadyRunEventSchema = z.object({
  type: z.literal("artifact_ready"),
  stage: runStageSchema,
  artifactKind: z.enum([
    "requirementBaseline",
    "coverageMatrix",
    "traceabilityMatrix",
    "evidencePackage",
    "rules",
    "model",
    "plantuml",
    "svg",
    "testCases",
    "codeSpec",
    "codeFiles",
    "businessLogic",
    "designToCodeMapping",
    "designModelCoverageReport",
    "uiMockup",
    "uiReferenceSpec",
    "uiFidelityReport",
    "designTokens",
    "componentRegistry",
    "uiIr",
    "codeSkills",
    "codeSkill",
    "visualDirection",
    "skillResourceDiscoveryPlan",
    "skillResourcePreviews",
    "skillResourcePlan",
    "codeSkillContext",
    "visualDiffReport",
    "businessAssertionResults",
    "document",
  ]),
  diagramKind: umlDiagramKindSchema.optional(),
  modelId: z.string().min(1).optional(),
  subtaskId: z.string().min(1).optional(),
  subtaskLabel: z.string().min(1).optional(),
  subtaskStatus: z
    .enum([
      "queued",
      "running",
      "repairing",
      "rendering",
      "completed",
      "failed",
      "pending_review",
    ])
    .optional(),
  parallelGroup: z.string().min(1).optional(),
  businessLogic: codeBusinessLogicSchema.optional(),
  designToCodeMapping: designToCodeMappingSchema.optional(),
  designModelCoverageReport: designModelCoverageReportSchema.optional(),
  loadedCodeSkill: loadedCodeSkillSchema.optional(),
  visualDirection: codeVisualDirectionSchema.optional(),
  skillResourceDiscoveryPlan: codeSkillResourceDiscoveryPlanSchema.optional(),
  skillResourcePreviews: codeSkillResourcePreviewResultSchema.optional(),
  skillResourcePlan: codeSkillResourcePlanSchema.optional(),
  codeSkillContext: codeSkillContextSchema.optional(),
  uiMockup: codeUiMockupSchema.optional(),
  uiReferenceSpec: codeUiReferenceSpecSchema.optional(),
  uiFidelityReport: codeUiFidelityReportSchema.optional(),
  designTokens: codeDesignTokensSchema.optional(),
  componentRegistry: codeComponentRegistrySchema.optional(),
  uiIr: codeUiIrSchema.optional(),
  codeSkills: z.array(codeSkillSelectionSchema).optional(),
  skillDiagnostics: z.array(codeSkillDiagnosticsSchema).optional(),
  visualDiffReport: codeVisualDiffReportSchema.optional(),
  businessAssertionResults: codeBusinessAssertionResultSchema.optional(),
  coverageMatrix: coverageMatrixSchema.optional(),
  traceabilityMatrix: traceabilityMatrixSchema.optional(),
  evidencePackage: evidencePackageSchema.optional(),
});

export const codeFileChangedRunEventSchema = z.object({
  type: z.literal("code_file_changed"),
  path: z.string().min(1),
  content: z.string(),
  reason: z.string().min(1),
});

export const completedRunEventSchema: z.ZodObject<{
  type: z.ZodLiteral<"completed">;
  snapshot: z.ZodUnion<
    [
      typeof runSnapshotSchema,
      typeof designRunSnapshotSchema,
      typeof codeRunSnapshotSchema,
      typeof documentRunSnapshotSchema,
    ]
  >;
}> = z.object({
  type: z.literal("completed"),
  snapshot: z.union([
    runSnapshotSchema,
    designRunSnapshotSchema,
    codeRunSnapshotSchema,
    documentRunSnapshotSchema,
  ]),
});

export const failedRunEventSchema = z.object({
  type: z.literal("failed"),
  stage: runStageSchema.optional(),
  error: runErrorSchema,
});

export const cancelledRunEventSchema = z.object({
  type: z.literal("cancelled"),
  stage: runStageSchema.optional(),
  message: z.string().min(1),
});

export const runActionSchema = z.enum(["cancel", "retry", "rerun"]);
export type RunAction = z.infer<typeof runActionSchema>;

export const runActionRunEventSchema = z.object({
  type: z.literal("run_action"),
  action: runActionSchema,
  sourceRunId: z.string().min(1),
  newRunId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});

export type RunEvent =
  | z.infer<typeof queuedRunEventSchema>
  | z.infer<typeof stageStartedRunEventSchema>
  | z.infer<typeof llmChunkRunEventSchema>
  | z.infer<typeof stageProgressRunEventSchema>
  | z.infer<typeof artifactReadyRunEventSchema>
  | z.infer<typeof codeFileChangedRunEventSchema>
  | z.infer<typeof completedRunEventSchema>
  | z.infer<typeof failedRunEventSchema>
  | z.infer<typeof cancelledRunEventSchema>
  | z.infer<typeof runActionRunEventSchema>;

export const runEventSchema: z.ZodType<RunEvent, z.ZodTypeDef, unknown> = z.discriminatedUnion("type", [
  queuedRunEventSchema,
  stageStartedRunEventSchema,
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  artifactReadyRunEventSchema,
  codeFileChangedRunEventSchema,
  completedRunEventSchema,
  failedRunEventSchema,
  cancelledRunEventSchema,
  runActionRunEventSchema,
]);

export const runActionResultSchema = z.object({
  action: runActionSchema,
  sourceRunId: z.string().min(1),
  runId: z.string().min(1),
  status: runStatusSchema,
});
export type RunActionResult = z.infer<typeof runActionResultSchema>;

export const startRunResponseSchema = z.object({
  runId: z.string().min(1),
});
export type StartRunResponse = z.infer<typeof startRunResponseSchema>;
export const startDesignRunResponseSchema = startRunResponseSchema;
export type StartDesignRunResponse = z.infer<typeof startDesignRunResponseSchema>;
export const startCodeRunResponseSchema = startRunResponseSchema;
export type StartCodeRunResponse = z.infer<typeof startCodeRunResponseSchema>;
export const startDocumentRunResponseSchema = startRunResponseSchema;
export type StartDocumentRunResponse = z.infer<typeof startDocumentRunResponseSchema>;
