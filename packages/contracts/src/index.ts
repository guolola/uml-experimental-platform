import { z } from "zod";

export const diagramKindSchema = z.enum([
  "usecase",
  "class",
  "activity",
  "deployment",
]);
export type DiagramKind = z.infer<typeof diagramKindSchema>;

export const designDiagramKindSchema = z.enum([
  "sequence",
  "activity",
  "class",
  "deployment",
  "table",
]);
export type DesignDiagramKind = z.infer<typeof designDiagramKindSchema>;

export const umlDiagramKindSchema = z.union([
  diagramKindSchema,
  designDiagramKindSchema,
]);
export type UmlDiagramKind = z.infer<typeof umlDiagramKindSchema>;

export const ruleCategorySchema = z.enum([
  "业务规则",
  "功能需求",
  "外部接口",
  "界面需求",
  "数据需求",
  "非功能需求",
  "部署需求",
  "异常处理",
]);
export type RuleCategory = z.infer<typeof ruleCategorySchema>;

export const requirementRuleSchema = z.object({
  id: z.string().min(1),
  category: ruleCategorySchema,
  text: z.string().min(1),
  relatedDiagrams: z.array(diagramKindSchema).min(1),
});
export type RequirementRule = z.infer<typeof requirementRuleSchema>;

export const requirementRulesResultSchema = z.object({
  rules: z.array(requirementRuleSchema),
});
export type RequirementRulesResult = z.infer<typeof requirementRulesResultSchema>;

export const visibilitySchema = z.enum(["public", "protected", "private", "package"]);
export type Visibility = z.infer<typeof visibilitySchema>;

const noteListSchema = z.array(z.string().min(1));

export const useCaseActorTypeSchema = z.enum(["human", "system", "external"]);
export type UseCaseActorType = z.infer<typeof useCaseActorTypeSchema>;

export const useCaseActorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  actorType: useCaseActorTypeSchema,
  description: z.string().min(1).optional(),
  responsibilities: noteListSchema,
});
export type UseCaseActor = z.infer<typeof useCaseActorSchema>;

export const useCaseSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  goal: z.string().min(1),
  description: z.string().min(1).optional(),
  preconditions: noteListSchema,
  postconditions: noteListSchema,
  primaryActorId: z.string().min(1).optional(),
  supportingActorIds: z.array(z.string().min(1)),
});
export type UseCaseSpec = z.infer<typeof useCaseSpecSchema>;

export const systemBoundarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type SystemBoundary = z.infer<typeof systemBoundarySchema>;

export const useCaseRelationshipTypeSchema = z.enum([
  "association",
  "include",
  "extend",
  "generalization",
]);
export type UseCaseRelationshipType = z.infer<typeof useCaseRelationshipTypeSchema>;

export const useCaseRelationshipSchema = z.object({
  id: z.string().min(1),
  type: useCaseRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type UseCaseRelationship = z.infer<typeof useCaseRelationshipSchema>;

export const useCaseDiagramSpecSchema = z.object({
  diagramKind: z.literal("usecase"),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  actors: z.array(useCaseActorSchema),
  useCases: z.array(useCaseSpecSchema),
  systemBoundaries: z.array(systemBoundarySchema),
  relationships: z.array(useCaseRelationshipSchema),
});
export type UseCaseDiagramSpec = z.infer<typeof useCaseDiagramSpecSchema>;

export const classKindSchema = z.enum(["entity", "aggregate", "valueObject", "service", "other"]);
export type ClassKind = z.infer<typeof classKindSchema>;

export const classAttributeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  visibility: visibilitySchema,
  required: z.boolean().optional(),
  multiplicity: z.string().min(1).optional(),
  defaultValue: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ClassAttribute = z.infer<typeof classAttributeSchema>;

export const operationParameterSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
  direction: z.enum(["in", "out", "inout"]).optional(),
});
export type OperationParameter = z.infer<typeof operationParameterSchema>;

export const classOperationSchema = z.object({
  name: z.string().min(1),
  returnType: z.string().min(1).optional(),
  visibility: visibilitySchema,
  parameters: z.array(operationParameterSchema),
  description: z.string().min(1).optional(),
});
export type ClassOperation = z.infer<typeof classOperationSchema>;

export const classEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  classKind: classKindSchema.optional(),
  stereotype: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  attributes: z.array(classAttributeSchema),
  operations: z.array(classOperationSchema),
});
export type ClassEntity = z.infer<typeof classEntitySchema>;

export const interfaceEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  operations: z.array(classOperationSchema),
});
export type InterfaceEntity = z.infer<typeof interfaceEntitySchema>;

export const enumEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  literals: noteListSchema,
});
export type EnumEntity = z.infer<typeof enumEntitySchema>;

export const classRelationshipTypeSchema = z.enum([
  "association",
  "aggregation",
  "composition",
  "inheritance",
  "implementation",
  "dependency",
]);
export type ClassRelationshipType = z.infer<typeof classRelationshipTypeSchema>;

export const classRelationshipSchema = z.object({
  id: z.string().min(1),
  type: classRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  sourceRole: z.string().min(1).optional(),
  targetRole: z.string().min(1).optional(),
  sourceMultiplicity: z.string().min(1).optional(),
  targetMultiplicity: z.string().min(1).optional(),
  navigability: z.enum(["none", "source-to-target", "target-to-source", "bidirectional"]).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ClassRelationship = z.infer<typeof classRelationshipSchema>;

export const classDiagramSpecSchema = z.object({
  diagramKind: z.literal("class"),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  classes: z.array(classEntitySchema),
  interfaces: z.array(interfaceEntitySchema),
  enums: z.array(enumEntitySchema),
  relationships: z.array(classRelationshipSchema),
});
export type ClassDiagramSpec = z.infer<typeof classDiagramSpecSchema>;

export const activityNodeTypeSchema = z.enum([
  "start",
  "end",
  "activity",
  "decision",
  "merge",
  "fork",
  "join",
]);
export type ActivityNodeType = z.infer<typeof activityNodeTypeSchema>;

export const swimlaneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type Swimlane = z.infer<typeof swimlaneSchema>;

const activityNodeBaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const activityStartNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("start"),
  name: z.string().min(1).default("开始"),
});
export type ActivityStartNode = z.infer<typeof activityStartNodeSchema>;

export const activityEndNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("end"),
  name: z.string().min(1).default("结束"),
});
export type ActivityEndNode = z.infer<typeof activityEndNodeSchema>;

export const activityActionNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("activity"),
  name: z.string().min(1),
  actorOrLane: z.string().min(1).optional(),
  input: z.array(z.string().min(1)),
  output: z.array(z.string().min(1)),
});
export type ActivityActionNode = z.infer<typeof activityActionNodeSchema>;

export const activityDecisionNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("decision"),
  name: z.string().min(1).optional(),
  question: z.string().min(1).optional(),
});
export type ActivityDecisionNode = z.infer<typeof activityDecisionNodeSchema>;

export const activityMergeNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("merge"),
  name: z.string().min(1).optional(),
});
export type ActivityMergeNode = z.infer<typeof activityMergeNodeSchema>;

export const activityForkNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("fork"),
  name: z.string().min(1).optional(),
});
export type ActivityForkNode = z.infer<typeof activityForkNodeSchema>;

export const activityJoinNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("join"),
  name: z.string().min(1).optional(),
});
export type ActivityJoinNode = z.infer<typeof activityJoinNodeSchema>;

export const activityNodeSchema = z.discriminatedUnion("type", [
  activityStartNodeSchema,
  activityEndNodeSchema,
  activityActionNodeSchema,
  activityDecisionNodeSchema,
  activityMergeNodeSchema,
  activityForkNodeSchema,
  activityJoinNodeSchema,
]);
export type ActivityNode = z.infer<typeof activityNodeSchema>;

export const activityRelationshipTypeSchema = z.enum(["control_flow", "object_flow"]);
export type ActivityRelationshipType = z.infer<typeof activityRelationshipTypeSchema>;

export const activityRelationshipSchema = z.object({
  id: z.string().min(1),
  type: activityRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  condition: z.string().min(1).optional(),
  guard: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ActivityRelationship = z.infer<typeof activityRelationshipSchema>;

export const activityDiagramSpecSchema = z.object({
  diagramKind: z.literal("activity"),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  swimlanes: z.array(swimlaneSchema),
  nodes: z.array(activityNodeSchema),
  relationships: z.array(activityRelationshipSchema),
});
export type ActivityDiagramSpec = z.infer<typeof activityDiagramSpecSchema>;

export const deploymentNodeTypeSchema = z.enum([
  "app",
  "server",
  "device",
  "container",
  "external",
]);
export type DeploymentNodeType = z.infer<typeof deploymentNodeTypeSchema>;

export const deploymentNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodeType: deploymentNodeTypeSchema,
  environment: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentNode = z.infer<typeof deploymentNodeSchema>;

export const deploymentDatabaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  engine: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentDatabase = z.infer<typeof deploymentDatabaseSchema>;

export const deploymentComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  componentType: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentComponent = z.infer<typeof deploymentComponentSchema>;

export const externalSystemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type ExternalSystem = z.infer<typeof externalSystemSchema>;

export const deploymentArtifactSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  artifactType: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentArtifactSpec = z.infer<typeof deploymentArtifactSpecSchema>;

export const deploymentRelationshipTypeSchema = z.enum([
  "deployment",
  "communication",
  "dependency",
  "hosting",
]);
export type DeploymentRelationshipType = z.infer<typeof deploymentRelationshipTypeSchema>;

export const deploymentRelationshipSchema = z.object({
  id: z.string().min(1),
  type: deploymentRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  protocol: z.string().min(1).optional(),
  port: z.string().min(1).optional(),
  direction: z.enum(["one-way", "two-way", "inbound", "outbound"]).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentRelationship = z.infer<typeof deploymentRelationshipSchema>;

export const deploymentDiagramSpecSchema = z.object({
  diagramKind: z.literal("deployment"),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  nodes: z.array(deploymentNodeSchema),
  databases: z.array(deploymentDatabaseSchema),
  components: z.array(deploymentComponentSchema),
  externalSystems: z.array(externalSystemSchema),
  artifacts: z.array(deploymentArtifactSpecSchema),
  relationships: z.array(deploymentRelationshipSchema),
});
export type DeploymentDiagramSpec = z.infer<typeof deploymentDiagramSpecSchema>;

export const sequenceParticipantTypeSchema = z.enum([
  "actor",
  "boundary",
  "control",
  "entity",
  "service",
  "database",
  "external",
]);
export type SequenceParticipantType = z.infer<typeof sequenceParticipantTypeSchema>;

export const sequenceParticipantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  participantType: sequenceParticipantTypeSchema,
  description: z.string().min(1).optional(),
});
export type SequenceParticipant = z.infer<typeof sequenceParticipantSchema>;

export const sequenceMessageTypeSchema = z.enum([
  "sync",
  "async",
  "return",
  "create",
  "destroy",
]);
export type SequenceMessageType = z.infer<typeof sequenceMessageTypeSchema>;

export const sequenceMessageSchema = z.object({
  id: z.string().min(1),
  type: sequenceMessageTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  name: z.string().min(1),
  parameters: z.array(z.string().min(1)),
  returnValue: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type SequenceMessage = z.infer<typeof sequenceMessageSchema>;

export const sequenceFragmentTypeSchema = z.enum([
  "alt",
  "opt",
  "loop",
  "par",
]);
export type SequenceFragmentType = z.infer<typeof sequenceFragmentTypeSchema>;

export const sequenceFragmentSchema = z.object({
  id: z.string().min(1),
  type: sequenceFragmentTypeSchema,
  label: z.string().min(1),
  messageIds: z.array(z.string().min(1)),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type SequenceFragment = z.infer<typeof sequenceFragmentSchema>;

export const sequenceDiagramSpecSchema = z.object({
  diagramKind: z.literal("sequence"),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  participants: z.array(sequenceParticipantSchema),
  messages: z.array(sequenceMessageSchema),
  fragments: z.array(sequenceFragmentSchema),
});
export type SequenceDiagramSpec = z.infer<typeof sequenceDiagramSpecSchema>;

export const tableColumnReferenceSchema = z.object({
  tableId: z.string().min(1),
  columnId: z.string().min(1),
});
export type TableColumnReference = z.infer<typeof tableColumnReferenceSchema>;

export const tableColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dataType: z.string().min(1),
  isPrimaryKey: z.boolean().default(false),
  isForeignKey: z.boolean().default(false),
  nullable: z.boolean().default(true),
  references: tableColumnReferenceSchema.optional(),
  description: z.string().min(1).optional(),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

export const tableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  columns: z.array(tableColumnSchema).min(1),
});
export type TableSpec = z.infer<typeof tableSchema>;

export const tableRelationshipTypeSchema = z.enum([
  "one-to-one",
  "one-to-many",
  "many-to-many",
]);
export type TableRelationshipType = z.infer<typeof tableRelationshipTypeSchema>;

export const tableRelationshipSchema = z.object({
  id: z.string().min(1),
  type: tableRelationshipTypeSchema,
  sourceTableId: z.string().min(1),
  targetTableId: z.string().min(1),
  sourceColumnId: z.string().min(1).optional(),
  targetColumnId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type TableRelationship = z.infer<typeof tableRelationshipSchema>;

export const tableDiagramSpecSchema = z.object({
  diagramKind: z.literal("table"),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  tables: z.array(tableSchema).min(1),
  relationships: z.array(tableRelationshipSchema),
});
export type TableDiagramSpec = z.infer<typeof tableDiagramSpecSchema>;

export const diagramModelSpecSchema = z.discriminatedUnion("diagramKind", [
  useCaseDiagramSpecSchema,
  classDiagramSpecSchema,
  activityDiagramSpecSchema,
  deploymentDiagramSpecSchema,
]);
export type DiagramModelSpec = z.infer<typeof diagramModelSpecSchema>;

export const diagramModelsResultSchema = z.object({
  models: z.array(diagramModelSpecSchema),
});
export type DiagramModelsResult = z.infer<typeof diagramModelsResultSchema>;

export const designDiagramModelSpecSchema = z.discriminatedUnion("diagramKind", [
  sequenceDiagramSpecSchema,
  classDiagramSpecSchema,
  activityDiagramSpecSchema,
  deploymentDiagramSpecSchema,
  tableDiagramSpecSchema,
]);
export type DesignDiagramModelSpec = z.infer<typeof designDiagramModelSpecSchema>;

export const designDiagramModelsResultSchema = z.object({
  models: z.array(designDiagramModelSpecSchema),
});
export type DesignDiagramModelsResult = z.infer<typeof designDiagramModelsResultSchema>;

export const plantUmlArtifactSchema = z.object({
  diagramKind: diagramKindSchema,
  source: z.string().min(1),
});
export type PlantUmlArtifact = z.infer<typeof plantUmlArtifactSchema>;

export const designPlantUmlArtifactSchema = z.object({
  diagramKind: designDiagramKindSchema,
  source: z.string().min(1),
});
export type DesignPlantUmlArtifact = z.infer<typeof designPlantUmlArtifactSchema>;

export const repairPlantUmlResultSchema = z.object({
  source: z.string().min(1),
});
export type RepairPlantUmlResult = z.infer<typeof repairPlantUmlResultSchema>;

export const svgArtifactSchema = z.object({
  diagramKind: diagramKindSchema,
  svg: z.string().min(1),
  renderMeta: z.object({
    engine: z.string().min(1),
    generatedAt: z.string().min(1),
    sourceLength: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
});
export type SvgArtifact = z.infer<typeof svgArtifactSchema>;

export const designSvgArtifactSchema = svgArtifactSchema.extend({
  diagramKind: designDiagramKindSchema,
});
export type DesignSvgArtifact = z.infer<typeof designSvgArtifactSchema>;

export const providerSettingsSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;

export const imageProviderSettingsSchema = providerSettingsSchema.extend({
  model: z.enum([
    "gpt-image-2",
    "gemini-3.1-flash-image-preview-2k",
    "nano-banana-pro",
  ]),
});
export type ImageProviderSettings = z.infer<typeof imageProviderSettingsSchema>;

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

export const codeFileOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.enum(["create_file", "update_file"]),
    path: z.string().min(1),
    content: z.string(),
    reason: z.string().min(1),
  }),
  z.object({
    operation: z.literal("set_entry_file"),
    path: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    operation: z.literal("note"),
    message: z.string().min(1),
  }),
]);
export type CodeFileOperation = z.infer<typeof codeFileOperationSchema>;

export const codeFileOperationsResultSchema = z.object({
  operations: z.array(codeFileOperationSchema).min(1),
});
export type CodeFileOperationsResult = z.infer<typeof codeFileOperationsResultSchema>;

export const startRunRequestSchema = z.object({
  requirementText: z.string().min(1),
  selectedDiagrams: z.array(diagramKindSchema),
  providerSettings: providerSettingsSchema,
});
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const startDesignRunRequestSchema = z.object({
  requirementText: z.string().min(1),
  rules: z.array(requirementRuleSchema),
  requirementModels: z.array(diagramModelSpecSchema),
  selectedDiagrams: z.array(designDiagramKindSchema).min(1),
  providerSettings: providerSettingsSchema,
});
export type StartDesignRunRequest = z.infer<typeof startDesignRunRequestSchema>;

export const startCodeRunRequestSchema = z.object({
  requirementText: z.string().min(1),
  rules: z.array(requirementRuleSchema),
  designModels: z.array(designDiagramModelSpecSchema).min(1),
  existingFiles: z.record(z.string().min(1), z.string()).default({}),
  generationMode: z.enum(["continue", "regenerate"]).default("continue"),
  providerSettings: providerSettingsSchema,
  imageProviderSettings: imageProviderSettingsSchema.optional(),
});
export type StartCodeRunRequest = z.infer<typeof startCodeRunRequestSchema>;

export const documentKindSchema = z.enum(["requirementsSpec", "softwareDesignSpec"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentSectionTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
export type DocumentSectionTable = z.infer<typeof documentSectionTableSchema>;

export const documentSectionSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().min(1),
  body: z.array(z.string()).default([]),
  table: documentSectionTableSchema.optional(),
  diagramKind: z.string().optional(),
});
export type DocumentSection = z.infer<typeof documentSectionSchema>;

export const documentContentResultSchema = z.object({
  sections: z.array(documentSectionSchema).min(1),
});
export type DocumentContentResult = z.infer<typeof documentContentResultSchema>;

export const startDocumentRunRequestSchema = z.object({
  documentKind: documentKindSchema,
  requirementText: z.string().min(1),
  rules: z.array(requirementRuleSchema).default([]),
  requirementModels: z.array(diagramModelSpecSchema).default([]),
  requirementPlantUml: z.array(plantUmlArtifactSchema).default([]),
  requirementSvgArtifacts: z.array(svgArtifactSchema).default([]),
  designModels: z.array(designDiagramModelSpecSchema).default([]),
  designPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
  designSvgArtifacts: z.array(designSvgArtifactSchema).default([]),
  providerSettings: providerSettingsSchema,
  useAiText: z.boolean().default(true),
});
export type StartDocumentRunRequest = z.infer<typeof startDocumentRunRequestSchema>;

export const runStageSchema = z.enum([
  "extract_rules",
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
  "analyze_code_product",
  "plan_code_ui",
  "generate_code_ui_mockup",
  "analyze_code_ui_mockup",
  "generate_code_ui_ir",
  "plan_code_files",
  "generate_code_spec",
  "generate_code_files",
  "plan_code",
  "write_code_files",
  "audit_code_quality",
  "verify_code_ui_fidelity",
  "verify_code_rendered_preview",
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
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const diagramErrorSchema = z.object({
  stage: runStageSchema,
  message: z.string().min(1),
});
export type DiagramError = z.infer<typeof diagramErrorSchema>;

export const runSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string(),
  selectedDiagrams: z.array(diagramKindSchema),
  rules: z.array(requirementRuleSchema),
  models: z.array(diagramModelSpecSchema),
  plantUml: z.array(plantUmlArtifactSchema),
  svgArtifacts: z.array(svgArtifactSchema),
  diagramErrors: z.record(diagramKindSchema, diagramErrorSchema).default({}),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  errorMessage: z.string().nullable(),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

export const designRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string(),
  selectedDiagrams: z.array(designDiagramKindSchema),
  rules: z.array(requirementRuleSchema),
  requirementModels: z.array(diagramModelSpecSchema),
  models: z.array(designDiagramModelSpecSchema),
  plantUml: z.array(designPlantUmlArtifactSchema),
  svgArtifacts: z.array(designSvgArtifactSchema),
  diagramErrors: z.record(designDiagramKindSchema, diagramErrorSchema).default({}),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  errorMessage: z.string().nullable(),
});
export type DesignRunSnapshot = z.infer<typeof designRunSnapshotSchema>;

export const codeRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string(),
  rules: z.array(requirementRuleSchema),
  designModels: z.array(designDiagramModelSpecSchema),
  spec: codeGenerationSpecSchema.nullable(),
  appBlueprint: codeAppBlueprintSchema.nullable().default(null),
  uiBlueprint: codeUiBlueprintSchema.nullable().default(null),
  uiMockup: codeUiMockupSchema.nullable().default(null),
  uiReferenceSpec: codeUiReferenceSpecSchema.nullable().default(null),
  uiFidelityReport: codeUiFidelityReportSchema.nullable().default(null),
  designTokens: codeDesignTokensSchema.nullable().default(null),
  componentRegistry: codeComponentRegistrySchema.nullable().default(null),
  uiIr: codeUiIrSchema.nullable().default(null),
  visualDiffReport: codeVisualDiffReportSchema.nullable().default(null),
  repairLoopSummary: codeRepairLoopSummarySchema.nullable().default(null),
  filePlan: codeFilePlanSchema.nullable().default(null),
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
  errorMessage: z.string().nullable(),
});
export type CodeRunSnapshot = z.infer<typeof codeRunSnapshotSchema>;

export const documentRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  documentKind: documentKindSchema,
  requirementText: z.string(),
  sections: z.array(documentSectionSchema).default([]),
  fileName: z.string().min(1).nullable(),
  mimeType: z.string().min(1).nullable(),
  byteLength: z.number().int().min(0).default(0),
  missingArtifacts: z.array(z.string()).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  errorMessage: z.string().nullable(),
});
export type DocumentRunSnapshot = z.infer<typeof documentRunSnapshotSchema>;

export const queuedRunEventSchema = z.object({
  type: z.literal("queued"),
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
});

export const artifactReadyRunEventSchema = z.object({
  type: z.literal("artifact_ready"),
  stage: runStageSchema,
  artifactKind: z.enum([
    "rules",
    "model",
    "plantuml",
    "svg",
    "codeSpec",
    "codeFiles",
    "uiMockup",
    "uiReferenceSpec",
    "uiFidelityReport",
    "designTokens",
    "componentRegistry",
    "uiIr",
    "visualDiffReport",
    "document",
  ]),
  diagramKind: umlDiagramKindSchema.optional(),
  uiMockup: codeUiMockupSchema.optional(),
  uiReferenceSpec: codeUiReferenceSpecSchema.optional(),
  uiFidelityReport: codeUiFidelityReportSchema.optional(),
  designTokens: codeDesignTokensSchema.optional(),
  componentRegistry: codeComponentRegistrySchema.optional(),
  uiIr: codeUiIrSchema.optional(),
  visualDiffReport: codeVisualDiffReportSchema.optional(),
});

export const codeFileChangedRunEventSchema = z.object({
  type: z.literal("code_file_changed"),
  path: z.string().min(1),
  content: z.string(),
  reason: z.string().min(1),
});

export const completedRunEventSchema = z.object({
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
  message: z.string().min(1),
});

export const runEventSchema = z.discriminatedUnion("type", [
  queuedRunEventSchema,
  stageStartedRunEventSchema,
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  artifactReadyRunEventSchema,
  codeFileChangedRunEventSchema,
  completedRunEventSchema,
  failedRunEventSchema,
]);
export type RunEvent = z.infer<typeof runEventSchema>;

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

export const renderSvgRequestSchema = z.object({
  diagramKind: umlDiagramKindSchema,
  plantUmlSource: z.string().min(1),
});
export type RenderSvgRequest = z.infer<typeof renderSvgRequestSchema>;

export const renderSvgResponseSchema = z.object({
  svg: z.string().min(1),
  renderMeta: svgArtifactSchema.shape.renderMeta,
});
export type RenderSvgResponse = z.infer<typeof renderSvgResponseSchema>;

export const renderPngRequestSchema = renderSvgRequestSchema;
export type RenderPngRequest = z.infer<typeof renderPngRequestSchema>;

export const renderPngResponseSchema = z.object({
  pngBase64: z.string().min(1),
  renderMeta: svgArtifactSchema.shape.renderMeta,
});
export type RenderPngResponse = z.infer<typeof renderPngResponseSchema>;
