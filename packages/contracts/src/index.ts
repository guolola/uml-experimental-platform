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

export const runStageSchema = z.enum([
  "extract_rules",
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
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
  artifactKind: z.enum(["rules", "model", "plantuml", "svg"]),
  diagramKind: umlDiagramKindSchema.optional(),
});

export const completedRunEventSchema = z.object({
  type: z.literal("completed"),
  snapshot: z.union([runSnapshotSchema, designRunSnapshotSchema]),
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
