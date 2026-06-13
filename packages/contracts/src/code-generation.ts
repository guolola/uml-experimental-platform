// Shared code-generation contract schemas used by API pipelines, prompts, and web run snapshots.
import { z } from "zod";

export const codeThemeSchema = z.object({
  name: z.string().min(1),
  primaryColor: z.string().min(1),
  backgroundColor: z.string().min(1),
  surfaceColor: z.string().min(1),
  textColor: z.string().min(1),
  accentColor: z.string().min(1),
  density: z.enum(["compact", "comfortable"]).default("compact"),
  tone: z.string().min(1),
});
export type CodeTheme = z.infer<typeof codeThemeSchema>;

export const codePageSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  route: z.string().min(1),
  purpose: z.string().min(1),
  sourceDiagramIds: z.array(z.string().min(1)),
});
export type CodePageSpec = z.infer<typeof codePageSpecSchema>;

export const codeComponentSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  responsibility: z.string().min(1),
  sourceDiagramIds: z.array(z.string().min(1)),
});
export type CodeComponentSpec = z.infer<typeof codeComponentSpecSchema>;

export const codeInteractionSpecSchema = z.object({
  id: z.string().min(1),
  trigger: z.string().min(1),
  behavior: z.string().min(1),
  sourceDiagramIds: z.array(z.string().min(1)),
});
export type CodeInteractionSpec = z.infer<typeof codeInteractionSpecSchema>;

export const codeDataEntitySpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fields: z.array(
    z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      required: z.boolean().default(false),
    }),
  ),
  sourceDiagramIds: z.array(z.string().min(1)),
});
export type CodeDataEntitySpec = z.infer<typeof codeDataEntitySpecSchema>;

export const codeAppBlueprintSchema = z.object({
  appName: z.string().min(1),
  domain: z.string().min(1),
  targetUsers: z.array(z.string().min(1)).min(1),
  coreWorkflow: z.string().min(1),
  pages: z.array(codePageSpecSchema).min(2).max(6),
  successCriteria: z.array(z.string().min(1)).min(1),
});
export type CodeAppBlueprint = z.infer<typeof codeAppBlueprintSchema>;

export const codeAppBlueprintResultSchema = z.object({
  appBlueprint: codeAppBlueprintSchema,
});
export type CodeAppBlueprintResult = z.infer<typeof codeAppBlueprintResultSchema>;

export const codeUiBlueprintSchema = z.object({
  theme: codeThemeSchema,
  visualLanguage: z.string().min(1),
  navigationModel: z.string().min(1),
  layoutPrinciples: z.array(z.string().min(1)).min(1),
  componentGuidelines: z.array(z.string().min(1)).min(1),
  stateGuidelines: z.array(z.string().min(1)).min(1),
});
export type CodeUiBlueprint = z.infer<typeof codeUiBlueprintSchema>;

export const codeUiBlueprintResultSchema = z.object({
  uiBlueprint: codeUiBlueprintSchema,
});
export type CodeUiBlueprintResult = z.infer<typeof codeUiBlueprintResultSchema>;

export const codeUiMockupSchema = z.object({
  status: z.enum(["completed", "failed"]),
  model: z.string().min(1),
  prompt: z.string().min(1),
  summary: z.string().min(1),
  imageUrl: z.string().min(1).nullable().default(null),
  imageDataUrl: z.string().min(1).nullable().default(null),
  errorMessage: z.string().min(1).nullable().default(null),
  createdAt: z.string().min(1),
});
export type CodeUiMockup = z.infer<typeof codeUiMockupSchema>;

export const codeUiReferenceSpecSchema = z.object({
  layoutStructure: z.array(z.string().min(1)).default([]),
  navigation: z.string().min(1),
  colorPalette: z.array(z.string().min(1)).default([]),
  componentShapes: z.array(z.string().min(1)).default([]),
  informationDensity: z.string().min(1),
  keyBusinessAreas: z.array(z.string().min(1)).default([]),
  stateExpressions: z.array(z.string().min(1)).default([]),
  implementationGuidelines: z.array(z.string().min(1)).default([]),
  fallbackReason: z.string().min(1).nullable().default(null),
});
export type CodeUiReferenceSpec = z.infer<typeof codeUiReferenceSpecSchema>;

export const codeUiReferenceSpecResultSchema = z.object({
  uiReferenceSpec: codeUiReferenceSpecSchema,
});
export type CodeUiReferenceSpecResult = z.infer<typeof codeUiReferenceSpecResultSchema>;

export const codeUiFidelityReportSchema = z.object({
  passed: z.boolean(),
  matched: z.array(z.string().min(1)).default([]),
  missing: z.array(z.string().min(1)).default([]),
  repairSuggestions: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
});
export type CodeUiFidelityReport = z.infer<typeof codeUiFidelityReportSchema>;

export const codeUiFidelityReportResultSchema = z.object({
  uiFidelityReport: codeUiFidelityReportSchema,
});
export type CodeUiFidelityReportResult = z.infer<typeof codeUiFidelityReportResultSchema>;

export const codeDesignTokensSchema = z.object({
  colors: z.record(z.string().min(1), z.string().min(1)),
  typography: z.record(z.string().min(1), z.string().min(1)).default({}),
  spacing: z.record(z.string().min(1), z.string().min(1)),
  radius: z.record(z.string().min(1), z.string().min(1)),
  shadow: z.record(z.string().min(1), z.string().min(1)).default({}),
  density: z.enum(["compact", "comfortable"]),
});
export type CodeDesignTokens = z.infer<typeof codeDesignTokensSchema>;

export const codeComponentRegistryItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  props: z.array(z.string().min(1)).default([]),
  variants: z.array(z.string().min(1)).default([]),
  usageRules: z.array(z.string().min(1)).default([]),
});
export type CodeComponentRegistryItem = z.infer<typeof codeComponentRegistryItemSchema>;

export const codeComponentRegistrySchema = z.object({
  components: z.array(codeComponentRegistryItemSchema).min(1),
});
export type CodeComponentRegistry = z.infer<typeof codeComponentRegistrySchema>;

export type CodeComponentTreeNode = {
  component: string;
  purpose: string;
  props: Record<string, string>;
  dataBinding?: string | null;
  tokenRefs: string[];
  children: CodeComponentTreeNode[];
};

export const codeComponentTreeNodeSchema: z.ZodType<
  CodeComponentTreeNode,
  z.ZodTypeDef,
  unknown
> = z.lazy(() =>
  z.object({
    component: z.string().min(1),
    purpose: z.string().min(1),
    props: z.record(z.string().min(1), z.string()).default({}),
    dataBinding: z.string().min(1).nullable().default(null),
    tokenRefs: z.array(z.string().min(1)).default([]),
    children: z.array(codeComponentTreeNodeSchema).default([]),
  }),
) as unknown as z.ZodType<CodeComponentTreeNode, z.ZodTypeDef, unknown>;

export const codePageIrSchema = z.object({
  id: z.string().min(1),
  route: z.string().min(1),
  name: z.string().min(1),
  layout: z.string().min(1),
  primaryActions: z.array(z.string().min(1)).min(1),
  componentTree: codeComponentTreeNodeSchema,
});
export type CodePageIr = z.infer<typeof codePageIrSchema>;

export const codeUiIrSchema = z.object({
  designTokens: codeDesignTokensSchema,
  componentRegistry: codeComponentRegistrySchema,
  pages: z.array(codePageIrSchema).min(1),
  dataBindings: z.array(z.string().min(1)).default([]),
  interactions: z.array(z.string().min(1)).default([]),
  responsiveRules: z.array(z.string().min(1)).default([]),
});
export type CodeUiIr = z.infer<typeof codeUiIrSchema>;

export const codeUiIrResultSchema = z.object({
  uiIr: codeUiIrSchema,
});
export type CodeUiIrResult = z.infer<typeof codeUiIrResultSchema>;

export const codeBusinessLogicActorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  responsibilities: z.array(z.string().min(1)).default([]),
});
export type CodeBusinessLogicActor = z.infer<typeof codeBusinessLogicActorSchema>;

export const codeBusinessLogicEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  fields: z.array(z.string().min(1)).default([]),
  relationships: z.array(z.string().min(1)).default([]),
});
export type CodeBusinessLogicEntity = z.infer<typeof codeBusinessLogicEntitySchema>;

export const codeBusinessLogicPageFlowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  route: z.string().min(1),
  purpose: z.string().min(1),
  actors: z.array(z.string().min(1)).default([]),
  entryPoints: z.array(z.string().min(1)).default([]),
  userActions: z.array(z.string().min(1)).default([]),
  states: z.array(z.string().min(1)).default([]),
  sourceRefs: z.array(z.string().min(1)).default([]),
});
export type CodeBusinessLogicPageFlow = z.infer<typeof codeBusinessLogicPageFlowSchema>;

export const codeBusinessLogicStateMachineSchema = z.object({
  entity: z.string().min(1),
  states: z.array(z.string().min(1)).default([]),
  transitions: z.array(z.string().min(1)).default([]),
});
export type CodeBusinessLogicStateMachine = z.infer<typeof codeBusinessLogicStateMachineSchema>;

export const codeBusinessLogicPermissionSchema = z.object({
  actor: z.string().min(1),
  allowedActions: z.array(z.string().min(1)).default([]),
  restrictedActions: z.array(z.string().min(1)).default([]),
});
export type CodeBusinessLogicPermission = z.infer<typeof codeBusinessLogicPermissionSchema>;

export const codeBusinessLogicSchema = z.object({
  appName: z.string().min(1),
  domainSummary: z.string().min(1),
  coreWorkflow: z.string().min(1),
  actors: z.array(codeBusinessLogicActorSchema).default([]),
  businessEntities: z.array(codeBusinessLogicEntitySchema).default([]),
  pageFlows: z.array(codeBusinessLogicPageFlowSchema).min(1),
  stateMachines: z.array(codeBusinessLogicStateMachineSchema).default([]),
  permissions: z.array(codeBusinessLogicPermissionSchema).default([]),
  edgeCases: z.array(z.string().min(1)).default([]),
  frontendOperations: z.array(z.string().min(1)).min(1),
  plantUmlTraceability: z.array(z.string().min(1)).default([]),
});
export type CodeBusinessLogic = z.infer<typeof codeBusinessLogicSchema>;

export const codeBusinessLogicResultSchema = z.object({
  businessLogic: codeBusinessLogicSchema,
});
export type CodeBusinessLogicResult = z.infer<typeof codeBusinessLogicResultSchema>;

export const codeBusinessAssertionCategorySchema = z.enum([
  "permission",
  "role",
  "state-machine",
  "data-consistency",
  "boundary-condition",
  "exception-feedback",
  "idempotency",
  "business-behavior",
]);
export type CodeBusinessAssertionCategory = z.infer<
  typeof codeBusinessAssertionCategorySchema
>;

export const codeBusinessAssertionSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string().min(1),
  category: codeBusinessAssertionCategorySchema,
  description: z.string().min(1),
  expectedBehavior: z.string().min(1),
  verificationMethod: z.enum(["static-code-scan", "generated-test", "manual-review"]),
  evidenceArtifacts: z.array(z.string().min(1)),
  status: z.enum(["passed", "failed", "pending-review"]),
  severity: z.enum(["info", "warning", "error", "critical"]),
  message: z.string().min(1),
});
export type CodeBusinessAssertion = z.infer<typeof codeBusinessAssertionSchema>;

export const codeBusinessAssertionResultSchema = z.object({
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  assertions: z.array(codeBusinessAssertionSchema),
  passed: z.boolean(),
  blockingFailureIds: z.array(z.string().min(1)),
});
export type CodeBusinessAssertionResult = z.infer<
  typeof codeBusinessAssertionResultSchema
>;

export const codeVisualDiffReportSchema = z.object({
  passed: z.boolean(),
  checkedAt: z.string().min(1),
  findings: z.array(z.string().min(1)).default([]),
  repairSuggestions: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
});
export type CodeVisualDiffReport = z.infer<typeof codeVisualDiffReportSchema>;

export const codeRepairLoopSummarySchema = z.object({
  maxRounds: z.number().int().min(0),
  roundsRun: z.number().int().min(0),
  stopReason: z.string().min(1),
  repaired: z.boolean(),
});
export type CodeRepairLoopSummary = z.infer<typeof codeRepairLoopSummarySchema>;

export const codeSkillApplyStageSchema = z.enum([
  "planning",
  "implementation",
  "repair",
  "audit",
]);
export type CodeSkillApplyStage = z.infer<typeof codeSkillApplyStageSchema>;

export const codeSkillFileSchema = z.object({
  path: z.string().min(1),
  relativePath: z.string().min(1),
  kind: z.enum(["skill", "data", "script", "template", "reference", "config", "other"]),
  size: z.number().int().nonnegative(),
});
export type CodeSkillFile = z.infer<typeof codeSkillFileSchema>;

const safeSkillCommandSchema = z.string().min(1).regex(/^[A-Za-z0-9_.-]+$/, {
  message: "skill action command must be an executable name, not a shell command",
}).refine(
  (value) => ["python", "python3", "py", "node"].includes(value),
  "skill action command is not in the allowlist",
);

const safeSkillActionArgSchema = z.string().refine(
  (value) => !/[;&|`<>]/.test(value) && !/(^|[\\/])\.\.([\\/]|$)/.test(value),
  "skill action args must not contain shell metacharacters or directory traversal",
);

export const codeSkillActionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  command: safeSkillCommandSchema,
  args: z.array(safeSkillActionArgSchema).min(1),
  outputFormat: z.enum(["text", "json", "markdown"]).default("text"),
  maxOutputChars: z.number().int().min(100).max(20000).default(8000),
  when: z.enum(["always", "hasCharts"]).default("always"),
});
export type CodeSkillAction = z.infer<typeof codeSkillActionSchema>;

export const codeSkillActionResultSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  outputFormat: z.enum(["text", "json", "markdown"]),
  status: z.enum(["completed", "failed", "skipped"]),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  exitCode: z.number().int().nullable().default(null),
  errorMessage: z.string().optional(),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
});
export type CodeSkillActionResult = z.infer<typeof codeSkillActionResultSchema>;

export const codeSkillResourceRequestSchema = z.object({
  resourceType: z.enum(["design-system", "stack", "domain", "csv", "action"]),
  name: z.string().min(1),
  query: z.string().min(1),
  csvPath: z.string().default(""),
  stack: z.string().default(""),
  domain: z.string().default(""),
  actionName: z.string().default(""),
  maxResults: z.number().int().min(1).max(20).default(8),
  reason: z.string().min(1),
});
export type CodeSkillResourceRequest = z.infer<typeof codeSkillResourceRequestSchema>;

export const codeSkillResourcePlanSchema = z.object({
  skillName: z.string().min(1),
  alias: z.string().min(1).optional(),
  query: z.string().min(1),
  requests: z.array(codeSkillResourceRequestSchema).min(1).max(8),
  diagnostics: z.array(z.string().min(1)).default([]),
});
export type CodeSkillResourcePlan = z.infer<typeof codeSkillResourcePlanSchema>;

export const codeSkillDiagnosticsSchema = z.object({
  level: z.enum(["info", "warning", "error"]),
  source: z.string().min(1),
  message: z.string().min(1),
});
export type CodeSkillDiagnostics = z.infer<typeof codeSkillDiagnosticsSchema>;

export const codeVisualDirectionSchema = z.object({
  productType: z.string().min(1),
  targetAudience: z.string().min(1),
  toneKeywords: z.array(z.string().min(1)).default([]),
  styleKeywords: z.array(z.string().min(1)).default([]),
  colorMood: z.string().min(1),
  typographyMood: z.string().min(1),
  layoutMood: z.string().min(1),
  componentTexture: z.string().min(1),
  interactionMood: z.string().min(1),
  avoidStyles: z.array(z.string().min(1)).default([]),
  promptBrief: z.string().min(1),
});
export type CodeVisualDirection = z.infer<typeof codeVisualDirectionSchema>;

export const codeVisualDirectionResultSchema = z.object({
  visualDirection: codeVisualDirectionSchema,
});
export type CodeVisualDirectionResult = z.infer<typeof codeVisualDirectionResultSchema>;

export const codeSkillResourceDiscoveryRequestSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1),
  expectedUse: z.string().min(1),
});
export type CodeSkillResourceDiscoveryRequest = z.infer<typeof codeSkillResourceDiscoveryRequestSchema>;

export const codeSkillResourceDiscoveryPlanSchema = z.object({
  skillName: z.string().min(1),
  alias: z.string().min(1).optional(),
  requests: z.array(codeSkillResourceDiscoveryRequestSchema).min(1).max(10),
  diagnostics: z.array(z.string().min(1)).default([]),
});
export type CodeSkillResourceDiscoveryPlan = z.infer<typeof codeSkillResourceDiscoveryPlanSchema>;

export const codeSkillResourcePreviewSchema = z.object({
  path: z.string().min(1),
  rowCount: z.number().int().min(0).default(0),
  headers: z.array(z.string()).default([]),
  sampleRows: z.array(z.record(z.string(), z.string())).default([]),
  matchedHints: z.array(z.string()).default([]),
  status: z.enum(["completed", "failed", "skipped"]),
  errorMessage: z.string().optional(),
});
export type CodeSkillResourcePreview = z.infer<typeof codeSkillResourcePreviewSchema>;

export const codeSkillResourcePreviewResultSchema = z.object({
  skillName: z.string().min(1),
  alias: z.string().min(1).optional(),
  previews: z.array(codeSkillResourcePreviewSchema).default([]),
  diagnostics: z.array(codeSkillDiagnosticsSchema).default([]),
});
export type CodeSkillResourcePreviewResult = z.infer<typeof codeSkillResourcePreviewResultSchema>;

export const codeSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  triggers: z.array(z.string().min(1)).default([]),
  appliesTo: z.array(codeSkillApplyStageSchema).min(1),
  priority: z.number().int().min(0).max(100).default(50),
  source: z.enum(["builtin", "project"]),
  location: z.string().min(1),
  baseDir: z.string().min(1),
  fileManifest: z.array(codeSkillFileSchema).default([]),
  content: z.string().min(1),
});
export type CodeSkill = z.infer<typeof codeSkillSchema>;

export const codeSkillSelectionSchema = z.object({
  alias: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  source: z.enum(["builtin", "project"]),
  location: z.string().min(1),
  appliesTo: z.array(codeSkillApplyStageSchema).min(1),
  priority: z.number().int().min(0).max(100),
  reason: z.string().min(1),
});
export type CodeSkillSelection = z.infer<typeof codeSkillSelectionSchema>;

export const loadedCodeSkillSchema = z.object({
  alias: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  source: z.enum(["project"]),
  location: z.string().min(1),
  baseDir: z.string().default(""),
  fileManifest: z.array(codeSkillFileSchema).default([]),
  content: z.string().min(1),
  loadedAt: z.string().min(1),
});
export type LoadedCodeSkill = z.infer<typeof loadedCodeSkillSchema>;

export const codeSkillContextSchema = z.object({
  skillName: z.string().min(1),
  alias: z.string().min(1).optional(),
  query: z.string().min(1),
  designSystem: z.string().default(""),
  stackGuidelines: z.string().default(""),
  domainGuidelines: z.string().default(""),
  actionResults: z.array(codeSkillActionResultSchema).default([]),
  diagnostics: z.array(codeSkillDiagnosticsSchema).default([]),
});
export type CodeSkillContext = z.infer<typeof codeSkillContextSchema>;

export const codeFilePlanSchema = z.object({
  entryFile: z.string().min(1),
  files: z.array(
    z.object({
      path: z.string().min(1),
      kind: z.enum(["entry", "page", "component", "domain", "data", "style", "lib"]),
      responsibility: z.string().min(1),
    }),
  ).min(8),
});
export type CodeFilePlan = z.infer<typeof codeFilePlanSchema>;

export const codeFilePlanResultSchema = z.object({
  filePlan: codeFilePlanSchema,
});
export type CodeFilePlanResult = z.infer<typeof codeFilePlanResultSchema>;

export const codeImplementationBriefSchema = z.object({
  appName: z.string().min(1),
  summary: z.string().min(1),
  routes: z.array(
    z.object({
      path: z.string().min(1),
      label: z.string().min(1),
      page: z.string().min(1),
      description: z.string().min(1),
    }),
  ).min(1),
  navigation: z.array(z.string().min(1)).min(1),
  dataContracts: z.array(z.string().min(1)).default([]),
  componentContracts: z.array(z.string().min(1)).default([]),
  themeTokens: z.array(z.string().min(1)).default([]),
  interactionRules: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).default([]),
});
export type CodeImplementationBrief = z.infer<typeof codeImplementationBriefSchema>;

export const codeImplementationBriefResultSchema = z.object({
  implementationBrief: codeImplementationBriefSchema,
});
export type CodeImplementationBriefResult = z.infer<typeof codeImplementationBriefResultSchema>;

export const codeFileOperationManifestItemSchema = z.object({
  operation: z.enum(["create_file", "update_file", "set_entry_file", "note"]),
  path: z.string().default(""),
  reason: z.string().default(""),
  message: z.string().default(""),
  responsibility: z.string().default(""),
  dependsOn: z.array(z.string().min(1)).default([]),
}).superRefine((operation, context) => {
  if (
    (operation.operation === "create_file" || operation.operation === "update_file") &&
    (!operation.path.trim() || !operation.reason.trim() || !operation.responsibility.trim())
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "create_file/update_file manifest item requires non-empty path, reason and responsibility",
    });
  }
  if (operation.operation === "set_entry_file" && (!operation.path.trim() || !operation.reason.trim())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "set_entry_file manifest item requires non-empty path and reason",
    });
  }
  if (operation.operation === "note" && !operation.message.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note manifest item requires non-empty message",
    });
  }
});
export type CodeFileOperationManifestItem = z.infer<typeof codeFileOperationManifestItemSchema>;

export const codeFileOperationManifestResultSchema = z.object({
  operations: z.array(codeFileOperationManifestItemSchema).min(1),
});
export type CodeFileOperationManifestResult = z.infer<typeof codeFileOperationManifestResultSchema>;

export const codeFileGenerationDiagnosticSchema = z.object({
  stage: z.enum(["file_operations", "implementation_brief", "operation_manifest", "file_content"]),
  path: z.string().optional(),
  status: z.enum(["completed", "failed", "repaired"]),
  message: z.string().min(1),
  at: z.string().min(1),
});
export type CodeFileGenerationDiagnostic = z.infer<typeof codeFileGenerationDiagnosticSchema>;

export const codeQualityIssueSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  path: z.string().min(1).optional(),
});
export type CodeQualityIssue = z.infer<typeof codeQualityIssueSchema>;

export const codeQualityDiagnosticSchema = z.object({
  passed: z.boolean(),
  metrics: z.object({
    fileCount: z.number().int().nonnegative(),
    pageFileCount: z.number().int().nonnegative(),
    componentFileCount: z.number().int().nonnegative(),
  }),
  issues: z.array(codeQualityIssueSchema),
});
export type CodeQualityDiagnostic = z.infer<typeof codeQualityDiagnosticSchema>;

export const codeGenerationSpecSchema = z.object({
  appName: z.string().min(1),
  summary: z.string().min(1),
  theme: codeThemeSchema,
  pages: z.array(codePageSpecSchema).min(1),
  components: z.array(codeComponentSpecSchema).min(1),
  interactions: z.array(codeInteractionSpecSchema),
  dataEntities: z.array(codeDataEntitySpecSchema),
  implementationNotes: z.array(z.string().min(1)),
  appBlueprint: codeAppBlueprintSchema.nullable().default(null),
  uiBlueprint: codeUiBlueprintSchema.nullable().default(null),
  uiReferenceSpec: codeUiReferenceSpecSchema.nullable().default(null),
  uiIr: codeUiIrSchema.nullable().default(null),
  filePlan: codeFilePlanSchema.nullable().default(null),
});
export type CodeGenerationSpec = z.infer<typeof codeGenerationSpecSchema>;

export const codeGenerationSpecResultSchema = z.object({
  spec: codeGenerationSpecSchema,
});
export type CodeGenerationSpecResult = z.infer<typeof codeGenerationSpecResultSchema>;

export const codeFileBundleSchema = z.object({
  files: z.record(z.string().min(1), z.string()),
  entryFile: z.string().min(1),
  dependencies: z.record(z.string().min(1), z.string().min(1)).default({}),
});
export type CodeFileBundle = z.infer<typeof codeFileBundleSchema>;

export const codeFileBundleResultSchema = z.object({
  bundle: codeFileBundleSchema,
});
export type CodeFileBundleResult = z.infer<typeof codeFileBundleResultSchema>;

export const codeAgentPlanResultSchema = z.object({
  plan: z.array(z.string().min(1)).min(1),
});
export type CodeAgentPlanResult = z.infer<typeof codeAgentPlanResultSchema>;

export const codeFileOperationSchema = z.object({
  operation: z.enum(["create_file", "update_file", "set_entry_file", "note"]),
  path: z.string().default(""),
  content: z.string().default(""),
  reason: z.string().default(""),
  message: z.string().default(""),
}).superRefine((operation, context) => {
  if (
    (operation.operation === "create_file" || operation.operation === "update_file") &&
    (!operation.path.trim() || !operation.reason.trim())
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "create_file/update_file requires non-empty path and reason",
    });
  }
  if (operation.operation === "set_entry_file" && (!operation.path.trim() || !operation.reason.trim())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "set_entry_file requires non-empty path and reason",
    });
  }
  if (operation.operation === "note" && !operation.message.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note requires non-empty message",
    });
  }
});
export type CodeFileOperation = z.infer<typeof codeFileOperationSchema>;

export const codeFileOperationsResultSchema = z.object({
  operations: z.array(codeFileOperationSchema).min(1),
});
export type CodeFileOperationsResult = z.infer<typeof codeFileOperationsResultSchema>;
