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

export const atomicRequirementTypeSchema = z.enum([
  "functional",
  "non-functional",
  "data",
  "role",
  "constraint",
  "exception",
  "business-rule",
  "interface",
  "assumption",
]);
export type AtomicRequirementType = z.infer<typeof atomicRequirementTypeSchema>;

export const atomicRequirementStatusSchema = z.enum([
  "accepted",
  "ambiguous",
  "conflict",
  "pending-review",
  "rejected",
  "derived",
]);
export type AtomicRequirementStatus = z.infer<typeof atomicRequirementStatusSchema>;

export const requirementCriticalitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);
export type RequirementCriticality = z.infer<typeof requirementCriticalitySchema>;

export const requirementPrioritySchema = z.enum(["must", "should", "could"]);
export type RequirementPriority = z.infer<typeof requirementPrioritySchema>;

export const requirementSourceLocationSchema = z.object({
  startOffset: z.number().int().min(0).optional(),
  endOffset: z.number().int().min(0).optional(),
  section: z.string().min(1).optional(),
});
export type RequirementSourceLocation = z.infer<
  typeof requirementSourceLocationSchema
>;

export const atomicRequirementFieldSchema = z.enum([
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
]);
export type AtomicRequirementField = z.infer<typeof atomicRequirementFieldSchema>;

export const requirementFieldProvenanceSourceSchema = z.enum([
  "source-text",
  "ai-suggested",
  "heuristic",
  "manual",
]);
export type RequirementFieldProvenanceSource = z.infer<
  typeof requirementFieldProvenanceSourceSchema
>;

export const requirementFieldReviewStatusSchema = z.enum([
  "accepted",
  "pending-review",
  "rejected",
]);
export type RequirementFieldReviewStatus = z.infer<
  typeof requirementFieldReviewStatusSchema
>;

export const requirementFieldProvenanceEntrySchema = z.object({
  source: requirementFieldProvenanceSourceSchema,
  status: requirementFieldReviewStatusSchema,
  value: z.string().min(1).nullable().optional(),
  originalValue: z.string().min(1).nullable().optional(),
  rationale: z.string().min(1).optional(),
  issueIds: z.array(z.string().min(1)).optional(),
});
export type RequirementFieldProvenanceEntry = z.infer<
  typeof requirementFieldProvenanceEntrySchema
>;

export const requirementFieldProvenanceSchema = z
  .object({
    actor: requirementFieldProvenanceEntrySchema.optional(),
    subject: requirementFieldProvenanceEntrySchema.optional(),
    action: requirementFieldProvenanceEntrySchema.optional(),
    object: requirementFieldProvenanceEntrySchema.optional(),
    condition: requirementFieldProvenanceEntrySchema.optional(),
    outcome: requirementFieldProvenanceEntrySchema.optional(),
    acceptanceCriteria: requirementFieldProvenanceEntrySchema.optional(),
  })
  .default({});
export type RequirementFieldProvenance = z.infer<
  typeof requirementFieldProvenanceSchema
>;

export const atomicRequirementSchema = z.object({
  id: z.string().min(1),
  sourceFragment: z.string().min(1),
  sourceLocation: requirementSourceLocationSchema.optional(),
  type: atomicRequirementTypeSchema,
  actor: z.string().min(1).nullable(),
  subject: z.string().min(1).nullable(),
  action: z.string().min(1).nullable(),
  object: z.string().min(1).nullable(),
  condition: z.string().min(1).nullable(),
  outcome: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  status: atomicRequirementStatusSchema,
  criticality: requirementCriticalitySchema,
  acceptanceCriteria: z.array(z.string().min(1)),
  fieldProvenance: requirementFieldProvenanceSchema,
  priority: requirementPrioritySchema.optional(),
  sourceRuleId: z.string().min(1).optional(),
});
export type AtomicRequirement = z.infer<typeof atomicRequirementSchema>;

export const requirementAssumptionSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string().min(1).optional(),
  text: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(["accepted", "pending-review", "rejected", "derived"]),
});
export type RequirementAssumption = z.infer<typeof requirementAssumptionSchema>;

export const requirementConflictSchema = z.object({
  id: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).min(2),
  description: z.string().min(1),
  severity: requirementCriticalitySchema,
  status: z.enum(["conflict", "pending-review", "resolved"]),
});
export type RequirementConflict = z.infer<typeof requirementConflictSchema>;

export const requirementQualityIssueSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string().min(1).optional(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  code: z.enum([
    "ambiguity",
    "conflict",
    "missing-actor",
    "missing-object",
    "missing-boundary",
    "non-verifiable",
    "low-confidence",
    "derived-assumption",
  ]),
  message: z.string().min(1),
  blocksDownstream: z.boolean(),
});
export type RequirementQualityIssue = z.infer<
  typeof requirementQualityIssueSchema
>;

export const requirementQualityReportSchema = z.object({
  runId: z.string().min(1),
  status: z.enum(["passed", "pending-review", "blocked"]),
  summary: z.string().min(1),
  issues: z.array(requirementQualityIssueSchema),
  blockingIssueIds: z.array(z.string().min(1)),
  reviewRequiredRequirementIds: z.array(z.string().min(1)),
});
export type RequirementQualityReport = z.infer<
  typeof requirementQualityReportSchema
>;

export const requirementBaselineSchema = z.object({
  runId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  requirements: z.array(atomicRequirementSchema),
  assumptions: z.array(requirementAssumptionSchema),
  conflicts: z.array(requirementConflictSchema),
  qualityReport: requirementQualityReportSchema,
  createdAt: z.string().min(1),
});
export type RequirementBaseline = z.infer<typeof requirementBaselineSchema>;

export const coverageStatusSchema = z.enum([
  "covered",
  "partially-covered",
  "not-modelable",
  "pending-review",
  "conflict",
]);
export type CoverageStatus = z.infer<typeof coverageStatusSchema>;

export const coverageMatrixRowSchema = z.object({
  requirementId: z.string().min(1),
  status: coverageStatusSchema,
  rationale: z.string().min(1),
  modelElements: z.array(z.string().min(1)),
  designElements: z.array(z.string().min(1)),
  codeArtifacts: z.array(z.string().min(1)),
  tests: z.array(z.string().min(1)),
  reviewItems: z.array(z.string().min(1)),
});
export type CoverageMatrixRow = z.infer<typeof coverageMatrixRowSchema>;

export const coverageMatrixSchema = z.object({
  runId: z.string().min(1),
  rows: z.array(coverageMatrixRowSchema),
});
export type CoverageMatrix = z.infer<typeof coverageMatrixSchema>;

export const traceabilityArtifactTypeSchema = z.enum([
  "requirement",
  "requirements-model",
  "design-model",
  "code",
  "test",
  "evidence",
]);
export type TraceabilityArtifactType = z.infer<
  typeof traceabilityArtifactTypeSchema
>;

export const traceabilityLinkTypeSchema = z.enum([
  "satisfies",
  "refines",
  "implements",
  "verifies",
  "derives-from",
  "blocks",
]);
export type TraceabilityLinkType = z.infer<typeof traceabilityLinkTypeSchema>;

export const traceabilityLinkSchema = z.object({
  fromArtifactType: traceabilityArtifactTypeSchema,
  fromArtifactId: z.string().min(1),
  toArtifactType: traceabilityArtifactTypeSchema,
  toArtifactId: z.string().min(1),
  linkType: traceabilityLinkTypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
export type TraceabilityLink = z.infer<typeof traceabilityLinkSchema>;

export const traceabilityDiagnosticSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "error", "critical"]),
  code: z.enum([
    "uncovered-requirement",
    "orphan-artifact",
    "shallow-trace",
    "fake-trace",
    "semantic-model-gap",
    "business-assertion-gap",
    "pending-review",
    "conflict",
  ]),
  message: z.string().min(1),
  artifactType: traceabilityArtifactTypeSchema.optional(),
  artifactId: z.string().min(1).optional(),
  requirementId: z.string().min(1).optional(),
  blocksCompletion: z.boolean(),
});
export type TraceabilityDiagnostic = z.infer<
  typeof traceabilityDiagnosticSchema
>;

export const traceabilityMatrixSchema = z.object({
  runId: z.string().min(1),
  links: z.array(traceabilityLinkSchema),
  diagnostics: z.array(traceabilityDiagnosticSchema).default([]),
});
export type TraceabilityMatrix = z.infer<typeof traceabilityMatrixSchema>;

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
  attributes: z.array(classAttributeSchema).default([]),
  operations: z.array(classOperationSchema).default([]),
});
export type ClassEntity = z.infer<typeof classEntitySchema>;

export const interfaceEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  operations: z.array(classOperationSchema).default([]),
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
  modelId: z.string().min(1).optional(),
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
  modelId: z.string().min(1).optional(),
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
  modelId: z.string().min(1).optional(),
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

export const sequenceFragmentBranchSchema = z.object({
  label: z.string().min(1),
  condition: z.string().min(1).optional(),
  messageIds: z.array(z.string().min(1)),
});
export type SequenceFragmentBranch = z.infer<typeof sequenceFragmentBranchSchema>;

export const sequenceFragmentSchema = z.object({
  id: z.string().min(1),
  type: sequenceFragmentTypeSchema,
  label: z.string().min(1),
  messageIds: z.array(z.string().min(1)),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  branches: z.array(sequenceFragmentBranchSchema).optional(),
});
export type SequenceFragment = z.infer<typeof sequenceFragmentSchema>;

export const sequenceDiagramSpecSchema = z.object({
  diagramKind: z.literal("sequence"),
  modelId: z.string().min(1).optional(),
  sourceUseCaseId: z.string().min(1).optional(),
  sourceUseCaseName: z.string().min(1).optional(),
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
  modelId: z.string().min(1).optional(),
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

export const modelElementRefSchema = z.object({
  modelId: z.string().min(1).optional(),
  diagramKind: umlDiagramKindSchema,
  elementId: z.string().min(1),
  elementKind: z.string().min(1),
  label: z.string().min(1),
});
export type ModelElementRef = z.infer<typeof modelElementRefSchema>;

export const requirementModelTraceabilityEntrySchema = z.object({
  ruleId: z.string().min(1),
  target: modelElementRefSchema,
});
export type RequirementModelTraceabilityEntry = z.infer<
  typeof requirementModelTraceabilityEntrySchema
>;

export const designModelTraceabilityEntrySchema = z.object({
  source: modelElementRefSchema,
  targets: z.array(modelElementRefSchema).min(1),
  upstreamDesignRefs: z.array(modelElementRefSchema).optional(),
  mappingSource: z
    .enum(["llm", "derived-from-endpoints", "auto-filled-pending-review"])
    .optional(),
  reviewStatus: z.enum(["confirmed", "pending"]).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  rationale: z.string().min(1).optional(),
});
export type DesignModelTraceabilityEntry = z.infer<
  typeof designModelTraceabilityEntrySchema
>;

export const diagramModelsResultSchema = z.object({
  models: z.array(diagramModelSpecSchema),
  requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema),
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
  designModelTraceability: z.array(designModelTraceabilityEntrySchema),
});
export type DesignDiagramModelsResult = z.infer<typeof designDiagramModelsResultSchema>;

export const plantUmlArtifactSchema = z.object({
  diagramKind: diagramKindSchema,
  source: z.string().min(1),
});
export type PlantUmlArtifact = z.infer<typeof plantUmlArtifactSchema>;

export const designPlantUmlArtifactSchema = z.object({
  modelId: z.string().min(1).optional(),
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
  modelId: z.string().min(1).optional(),
  diagramKind: designDiagramKindSchema,
});
export type DesignSvgArtifact = z.infer<typeof designSvgArtifactSchema>;

export const resolvedProviderSettingsSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});
export type ProviderSettings = z.infer<typeof resolvedProviderSettingsSchema>;

export const managedProviderSettingsSchema = z.object({
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
});
export type ManagedProviderSettings = z.infer<typeof managedProviderSettingsSchema>;

export const providerSettingsSchema = z.union([
  resolvedProviderSettingsSchema,
  managedProviderSettingsSchema,
]);
export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;

export const imageProviderSettingsSchema = resolvedProviderSettingsSchema.extend({
  model: z.enum([
    "gpt-image-2",
    "gemini-3.1-flash-image-preview-2k",
    "nano-banana-pro",
  ]),
});
export type ImageProviderSettings = z.infer<typeof imageProviderSettingsSchema>;

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();
export const providerConfigStatusSchema = z.enum([
  "active",
  "disabled",
  "revoked",
]);
export type ProviderConfigStatus = z.infer<typeof providerConfigStatusSchema>;

export const providerRiskStateSchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type ProviderRiskState = z.infer<typeof providerRiskStateSchema>;

export const providerBreakerStateSchema = z.enum(["closed", "open"]);
export type ProviderBreakerState = z.infer<typeof providerBreakerStateSchema>;

export const providerConfigScopeTypeSchema = z.enum([
  "system",
  "user",
  "project",
]);
export type ProviderConfigScopeType = z.infer<
  typeof providerConfigScopeTypeSchema
>;

export const providerConfigDtoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    baseUrl: z.string().url(),
    defaultModel: z.string().trim().min(1),
    allowedModels: z.array(z.string().trim().min(1)),
    maskedKey: z.string().trim().min(1),
    status: providerConfigStatusSchema,
    riskState: providerRiskStateSchema,
    quota: z.string().trim().min(1),
    lastUsedAt: optionalNullableTimestampSchema,
    scopeType: providerConfigScopeTypeSchema,
    scopeId: z.string().min(1).nullable(),
    breakerState: providerBreakerStateSchema,
  })
  .strict();
export type ProviderConfigDto = z.infer<typeof providerConfigDtoSchema>;

export const providerConfigListResponseSchema = z
  .object({
    providerConfigs: z.array(providerConfigDtoSchema),
  })
  .strict();
export type ProviderConfigListResponse = z.infer<
  typeof providerConfigListResponseSchema
>;

export const providerConfigTestRequestSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProviderConfigTestRequest = z.infer<
  typeof providerConfigTestRequestSchema
>;

export const providerConfigTestResponseSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().min(1),
    capability: z.unknown().optional(),
    breaker: z
      .object({
        state: providerBreakerStateSchema,
        failureCount: z.number().int().min(0),
        openedAt: optionalNullableTimestampSchema,
        lastFailureAt: optionalNullableTimestampSchema,
      })
      .optional(),
  })
  .strict();
export type ProviderConfigTestResponse = z.infer<
  typeof providerConfigTestResponseSchema
>;

const emailAddressSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const publicNameSchema = z.string().trim().min(1).max(120);
const optionalDescriptionSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().min(1).max(2000).nullable(),
);
const passwordSchema = z.string().min(8).max(128);

export const userStatusSchema = z.enum([
  "pending_email_verification",
  "active",
  "disabled",
  "locked",
]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const adminRoleSchema = z.enum([
  "super_admin",
  "system_operator",
  "course_admin",
  "project_admin",
  "auditor",
  "security_admin",
  "model_admin",
  "teacher_assistant",
]);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminPermissionSchema = z.enum([
  "admin.metrics.read",
  "admin.roles.write",
  "admin.users.read",
  "admin.users.write",
  "admin.projects.read",
  "admin.projects.write",
  "admin.runs.read",
  "admin.runs.write",
  "admin.documents.read",
  "admin.documents.write",
  "admin.provider_configs.read",
  "admin.provider_configs.write",
  "admin.audit_logs.read",
  "admin.risk_events.read",
  "admin.rate_limits.read",
  "admin.rate_limits.write",
  "admin.system_health.read",
  "admin.prompt_runtime.write",
]);
export type AdminPermission = z.infer<typeof adminPermissionSchema>;

export const adminDataScopeSchema = z.enum([
  "all_projects",
  "all_users",
  "system",
  "assigned_courses",
  "assigned_projects",
  "audit_logs",
  "provider_configs",
]);
export type AdminDataScope = z.infer<typeof adminDataScopeSchema>;

export const adminCapabilitySchema = z.enum([
  "viewDashboard",
  "viewUsers",
  "manageUsers",
  "viewProjects",
  "manageProjects",
  "viewRuns",
  "manageRuns",
  "viewDocuments",
  "manageDocuments",
  "viewProviderConfigs",
  "manageProviderConfigs",
  "viewAuditLogs",
  "viewRiskEvents",
  "viewRateLimits",
  "viewSystemHealth",
]);
export type AdminCapability = z.infer<typeof adminCapabilitySchema>;

const allAdminPermissions = adminPermissionSchema.options;
const allAdminCapabilities = adminCapabilitySchema.options;

export const adminRolePermissions = {
  super_admin: allAdminPermissions,
  system_operator: [
    "admin.metrics.read",
    "admin.projects.read",
    "admin.projects.write",
    "admin.runs.read",
    "admin.runs.write",
    "admin.documents.read",
    "admin.rate_limits.read",
    "admin.system_health.read",
    "admin.prompt_runtime.write",
  ],
  course_admin: [
    "admin.metrics.read",
    "admin.users.read",
    "admin.projects.read",
    "admin.projects.write",
    "admin.runs.read",
    "admin.documents.read",
  ],
  project_admin: [
    "admin.projects.read",
    "admin.projects.write",
    "admin.runs.read",
    "admin.runs.write",
    "admin.documents.read",
    "admin.documents.write",
  ],
  auditor: [
    "admin.metrics.read",
    "admin.users.read",
    "admin.projects.read",
    "admin.runs.read",
    "admin.documents.read",
    "admin.audit_logs.read",
    "admin.risk_events.read",
    "admin.system_health.read",
  ],
  security_admin: [
    "admin.metrics.read",
    "admin.roles.write",
    "admin.users.read",
    "admin.users.write",
    "admin.audit_logs.read",
    "admin.risk_events.read",
    "admin.rate_limits.read",
    "admin.rate_limits.write",
    "admin.system_health.read",
  ],
  model_admin: [
    "admin.metrics.read",
    "admin.provider_configs.read",
    "admin.provider_configs.write",
    "admin.rate_limits.read",
    "admin.system_health.read",
  ],
  teacher_assistant: [
    "admin.projects.read",
    "admin.runs.read",
    "admin.documents.read",
  ],
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

export const adminRoleDataScopes = {
  super_admin: ["all_projects", "all_users", "system"],
  system_operator: ["all_projects", "system"],
  course_admin: ["assigned_courses"],
  project_admin: ["assigned_projects"],
  auditor: ["audit_logs", "all_projects"],
  security_admin: ["all_users", "audit_logs", "system"],
  model_admin: ["provider_configs", "system"],
  teacher_assistant: ["assigned_courses"],
} as const satisfies Record<AdminRole, readonly AdminDataScope[]>;

export const adminRoleCapabilities = {
  super_admin: allAdminCapabilities,
  system_operator: [
    "viewDashboard",
    "viewProjects",
    "manageProjects",
    "viewRuns",
    "manageRuns",
    "viewDocuments",
    "viewRateLimits",
    "viewSystemHealth",
  ],
  course_admin: [
    "viewDashboard",
    "viewUsers",
    "viewProjects",
    "manageProjects",
    "viewRuns",
    "viewDocuments",
  ],
  project_admin: [
    "viewProjects",
    "manageProjects",
    "viewRuns",
    "manageRuns",
    "viewDocuments",
    "manageDocuments",
  ],
  auditor: [
    "viewDashboard",
    "viewUsers",
    "viewProjects",
    "viewRuns",
    "viewDocuments",
    "viewAuditLogs",
    "viewRiskEvents",
    "viewSystemHealth",
  ],
  security_admin: [
    "viewDashboard",
    "viewUsers",
    "manageUsers",
    "viewAuditLogs",
    "viewRiskEvents",
    "viewRateLimits",
    "viewSystemHealth",
  ],
  model_admin: [
    "viewDashboard",
    "viewProviderConfigs",
    "manageProviderConfigs",
    "viewRateLimits",
    "viewSystemHealth",
  ],
  teacher_assistant: ["viewProjects", "viewRuns", "viewDocuments"],
} as const satisfies Record<AdminRole, readonly AdminCapability[]>;

export const userDtoSchema = z
  .object({
    id: z.string().min(1),
    email: emailAddressSchema,
    displayName: publicNameSchema,
    avatarUrl: z.string().url().nullable(),
    status: userStatusSchema,
    emailVerified: z.boolean(),
    mfaEnabled: z.boolean().default(false),
    systemRoles: z.array(adminRoleSchema).default([]),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    lastLoginAt: optionalNullableTimestampSchema,
  })
  .strict();
export type UserDto = z.infer<typeof userDtoSchema>;

export const sessionDtoSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    createdAt: isoTimestampSchema,
    expiresAt: isoTimestampSchema,
    lastSeenAt: isoTimestampSchema,
    ipAddress: z.string().min(1).nullable(),
    userAgent: z.string().min(1).nullable(),
    locationLabel: z.string().min(1).nullable().optional(),
    region: z.string().min(1).nullable().optional(),
  })
  .strict();
export type SessionDto = z.infer<typeof sessionDtoSchema>;

export const authRegisterRequestSchema = z.object({
  email: emailAddressSchema,
  password: passwordSchema,
  displayName: publicNameSchema,
});
export type AuthRegisterRequest = z.infer<typeof authRegisterRequestSchema>;

export const authLoginRequestSchema = z.object({
  email: emailAddressSchema,
  password: z.string().min(1).max(128),
});
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;

export const authMfaChallengeResponseSchema = z
  .object({
    mfa: z.object({
      required: z.literal(true),
      challengeId: z.string().min(16).max(256),
      expiresAt: isoTimestampSchema,
      method: z.literal("totp"),
    }),
  })
  .strict();
export type AuthMfaChallengeResponse = z.infer<
  typeof authMfaChallengeResponseSchema
>;

export const authMfaVerifyRequestSchema = z
  .object({
    challengeId: z.string().trim().min(16).max(256),
    code: z.string().trim().regex(/^\d{6}$/u),
  })
  .strict();
export type AuthMfaVerifyRequest = z.infer<typeof authMfaVerifyRequestSchema>;

export const authVerifyEmailRequestSchema = z.object({
  token: z.string().trim().min(16).max(256),
});
export type AuthVerifyEmailRequest = z.infer<
  typeof authVerifyEmailRequestSchema
>;

export const authResendVerificationRequestSchema = z.object({
  email: emailAddressSchema,
});
export type AuthResendVerificationRequest = z.infer<
  typeof authResendVerificationRequestSchema
>;

export const authForgotPasswordRequestSchema = z.object({
  email: emailAddressSchema,
});
export type AuthForgotPasswordRequest = z.infer<
  typeof authForgotPasswordRequestSchema
>;

export const authResetPasswordRequestSchema = z.object({
  token: z.string().trim().min(16).max(256),
  newPassword: passwordSchema,
});
export type AuthResetPasswordRequest = z.infer<
  typeof authResetPasswordRequestSchema
>;

export const authSessionResponseSchema = z.object({
  user: userDtoSchema,
  session: sessionDtoSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const accountProfileResponseSchema = authSessionResponseSchema.extend({
  mfa: z.object({
    enabled: z.boolean(),
    enforcement: z.literal("totp"),
  }),
  generationUsage: z.object({
    usedToday: z.number().int().min(0),
    limit: z.number().int().min(1).nullable(),
    remaining: z.number().int().min(0).nullable(),
    windowSeconds: z.number().int().min(1),
    limited: z.boolean(),
    scope: z.enum(["user", "visitor"]),
  }),
});
export type AccountProfileResponse = z.infer<
  typeof accountProfileResponseSchema
>;

export const adminSessionResponseSchema = z
  .object({
    user: userDtoSchema,
    roles: z.array(adminRoleSchema),
    permissions: z.array(adminPermissionSchema),
    dataScopes: z.array(adminDataScopeSchema),
    mfaRequired: z.boolean(),
    capabilities: z.array(adminCapabilitySchema),
  })
  .strict();
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;

export const accountSessionsResponseSchema = z.object({
  sessions: z.array(sessionDtoSchema),
});
export type AccountSessionsResponse = z.infer<
  typeof accountSessionsResponseSchema
>;

export const accountRevokeSessionsResponseSchema = z.object({
  revokedCount: z.number().int().nonnegative(),
});
export type AccountRevokeSessionsResponse = z.infer<
  typeof accountRevokeSessionsResponseSchema
>;

export const loginEventDtoSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1).nullable(),
    email: emailAddressSchema.nullable(),
    outcome: z.enum(["success", "failure"]),
    ipAddress: z.string().min(1).nullable(),
    userAgent: z.string().min(1).nullable(),
    locationLabel: z.string().min(1).nullable().optional(),
    region: z.string().min(1).nullable().optional(),
    message: z.string().min(1).nullable(),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type LoginEventDto = z.infer<typeof loginEventDtoSchema>;

export const accountLoginEventsResponseSchema = z.object({
  events: z.array(loginEventDtoSchema),
});
export type AccountLoginEventsResponse = z.infer<
  typeof accountLoginEventsResponseSchema
>;

export const accountMfaUpdateRequestSchema = z.object({
  enabled: z.boolean(),
  code: z.string().trim().regex(/^\d{6}$/u).optional(),
});
export type AccountMfaUpdateRequest = z.infer<
  typeof accountMfaUpdateRequestSchema
>;

export const accountMfaResponseSchema = z.object({
  mfa: z.object({
    enabled: z.boolean(),
    enforcement: z.literal("totp"),
  }),
});
export type AccountMfaResponse = z.infer<typeof accountMfaResponseSchema>;

export const accountMfaSetupResponseSchema = z
  .object({
    secret: z.string().min(16).max(128),
    otpauthUri: z.string().min(1),
    expiresAt: isoTimestampSchema,
  })
  .strict();
export type AccountMfaSetupResponse = z.infer<
  typeof accountMfaSetupResponseSchema
>;

export const accountMfaConfirmRequestSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/u),
  })
  .strict();
export type AccountMfaConfirmRequest = z.infer<
  typeof accountMfaConfirmRequestSchema
>;

export const accountProfileUpdateRequestSchema = z.object({
  displayName: publicNameSchema.optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type AccountProfileUpdateRequest = z.infer<
  typeof accountProfileUpdateRequestSchema
>;

export const accountSecurityUpdateRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });
export type AccountSecurityUpdateRequest = z.infer<
  typeof accountSecurityUpdateRequestSchema
>;

export const projectVisibilitySchema = z.enum(["private", "team", "public"]);
export type ProjectVisibility = z.infer<typeof projectVisibilitySchema>;

export const projectStatusSchema = z.enum(["active", "archived", "deleted"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectRetentionPolicySchema = z.enum([
  "manual",
  "semester_180_days",
  "one_year_365_days",
]);
export type ProjectRetentionPolicy = z.infer<typeof projectRetentionPolicySchema>;

export const projectMemberRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type ProjectMemberRole = z.infer<typeof projectMemberRoleSchema>;

export const projectMemberStatusSchema = z.enum(["invited", "active"]);
export type ProjectMemberStatus = z.infer<typeof projectMemberStatusSchema>;

const nullableProjectBindingIdSchema = z.string().trim().min(1).nullable();
const optionalProjectBindingIdSchema = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    nullableProjectBindingIdSchema,
  )
  .optional();

export const projectDtoSchema = z
  .object({
    id: z.string().min(1),
    name: publicNameSchema,
    description: optionalDescriptionSchema,
    visibility: projectVisibilitySchema,
    status: projectStatusSchema,
    ownerUserId: z.string().min(1),
    ownerDisplayName: publicNameSchema.nullable().optional(),
    ownerAvatarUrl: z.string().url().nullable().optional(),
    memberCount: z.number().int().min(0).optional(),
    memberPreviews: z
      .array(
        z
          .object({
            id: z.string().min(1),
            userId: z.string().min(1).nullable(),
            displayName: publicNameSchema.nullable(),
            avatarUrl: z.string().url().nullable().optional(),
            role: projectMemberRoleSchema,
            status: projectMemberStatusSchema,
          })
          .strict(),
      )
      .optional(),
    organizationId: nullableProjectBindingIdSchema.default(null),
    courseId: nullableProjectBindingIdSchema.default(null),
    classId: nullableProjectBindingIdSchema.default(null),
    teamId: nullableProjectBindingIdSchema.default(null),
    defaultProviderConfigId: nullableProjectBindingIdSchema.default(null),
    retentionPolicy: projectRetentionPolicySchema.default("manual"),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const projectCreateRequestSchema = z.object({
  name: publicNameSchema,
  description: optionalDescriptionSchema.default(null),
  visibility: projectVisibilitySchema.default("private"),
  organizationId: optionalProjectBindingIdSchema,
  courseId: optionalProjectBindingIdSchema,
  classId: optionalProjectBindingIdSchema,
  teamId: optionalProjectBindingIdSchema,
  defaultProviderConfigId: optionalProjectBindingIdSchema,
  retentionPolicy: projectRetentionPolicySchema.default("manual").optional(),
});
export type ProjectCreateRequest = z.infer<typeof projectCreateRequestSchema>;

export const projectUpdateRequestSchema = z
  .object({
    name: publicNameSchema.optional(),
    description: optionalDescriptionSchema.optional(),
    visibility: projectVisibilitySchema.optional(),
    status: z.enum(["active", "archived"]).optional(),
    organizationId: optionalProjectBindingIdSchema,
    courseId: optionalProjectBindingIdSchema,
    classId: optionalProjectBindingIdSchema,
    teamId: optionalProjectBindingIdSchema,
    defaultProviderConfigId: optionalProjectBindingIdSchema,
    retentionPolicy: projectRetentionPolicySchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one project field must be provided",
  });
export type ProjectUpdateRequest = z.infer<typeof projectUpdateRequestSchema>;

export const projectTransferOwnerRequestSchema = z
  .object({
    newOwnerUserId: z.string().trim().min(1),
  })
  .strict();
export type ProjectTransferOwnerRequest = z.infer<
  typeof projectTransferOwnerRequestSchema
>;

export const projectRetentionPolicyUpdateRequestSchema = z
  .object({
    retentionPolicy: projectRetentionPolicySchema,
  })
  .strict();
export type ProjectRetentionPolicyUpdateRequest = z.infer<
  typeof projectRetentionPolicyUpdateRequestSchema
>;

export const projectPermissionSchema = z.enum([
  "view_project",
  "update_project",
  "delete_project",
  "manage_members",
  "invite_members",
  "remove_members",
  "view_runs",
  "start_runs",
  "view_documents",
  "manage_documents",
  "manage_project_settings",
]);
export type ProjectPermission = z.infer<typeof projectPermissionSchema>;

export const projectMemberRolePermissions = {
  owner: projectPermissionSchema.options,
  editor: [
    "view_project",
    "update_project",
    "view_runs",
    "start_runs",
    "view_documents",
    "manage_documents",
  ],
  viewer: ["view_project", "view_runs", "view_documents"],
} as const satisfies Record<ProjectMemberRole, readonly ProjectPermission[]>;

export const projectMemberDtoSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    userId: z.string().min(1).nullable(),
    email: emailAddressSchema,
    displayName: publicNameSchema.nullable(),
    avatarUrl: z.string().url().nullable().optional(),
    role: projectMemberRoleSchema,
    status: projectMemberStatusSchema,
    invitedByUserId: z.string().min(1).nullable(),
    invitedAt: optionalNullableTimestampSchema,
    joinedAt: optionalNullableTimestampSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type ProjectMemberDto = z.infer<typeof projectMemberDtoSchema>;

export const projectMemberInviteRequestSchema = z
  .object({
    email: emailAddressSchema,
    role: z.enum(["editor", "viewer"]).default("viewer"),
  })
  .strict();
export type ProjectMemberInviteRequest = z.infer<
  typeof projectMemberInviteRequestSchema
>;

export const projectMemberUpdateRequestSchema = z
  .object({
    role: projectMemberRoleSchema,
  })
  .strict();
export type ProjectMemberUpdateRequest = z.infer<
  typeof projectMemberUpdateRequestSchema
>;

export const projectListResponseSchema = z.object({
  projects: z.array(projectDtoSchema),
});
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const projectResponseSchema = z.object({
  project: projectDtoSchema,
  membership: projectMemberDtoSchema.optional(),
  currentUserRole: projectMemberRoleSchema.optional(),
  capabilities: z.array(projectPermissionSchema).optional(),
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectMembersResponseSchema = z.object({
  members: z.array(projectMemberDtoSchema),
});
export type ProjectMembersResponse = z.infer<typeof projectMembersResponseSchema>;

export const projectMemberResponseSchema = z.object({
  member: projectMemberDtoSchema,
});
export type ProjectMemberResponse = z.infer<typeof projectMemberResponseSchema>;

export const projectInvitationCreateRequestSchema = z
  .object({
    email: emailAddressSchema,
    role: z.enum(["editor", "viewer"]).default("viewer"),
  })
  .strict();
export type ProjectInvitationCreateRequest = z.infer<
  typeof projectInvitationCreateRequestSchema
>;

export const projectInvitationDtoSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    email: emailAddressSchema,
    role: projectMemberRoleSchema,
    status: projectMemberStatusSchema,
    invitedByUserId: z.string().min(1).nullable(),
    invitedAt: optionalNullableTimestampSchema,
    expiresAt: isoTimestampSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    project: projectDtoSchema.optional(),
  })
  .strict();
export type ProjectInvitationDto = z.infer<typeof projectInvitationDtoSchema>;

export const projectInvitationResponseSchema = z
  .object({
    invitation: projectInvitationDtoSchema,
    expiresAt: isoTimestampSchema,
    devToken: z.string().min(1).optional(),
  })
  .strict();
export type ProjectInvitationResponse = z.infer<
  typeof projectInvitationResponseSchema
>;

export const projectInvitationAcceptResponseSchema = z.object({
  member: projectMemberDtoSchema,
});
export type ProjectInvitationAcceptResponse = z.infer<
  typeof projectInvitationAcceptResponseSchema
>;

export const adminUserDtoSchema = z
  .object({
    user: userDtoSchema,
    projectCount: z.number().int().min(0),
    activeSessionCount: z.number().int().min(0),
    lastAuditEventAt: optionalNullableTimestampSchema,
  })
  .strict();
export type AdminUserDto = z.infer<typeof adminUserDtoSchema>;

export const adminRateLimitPolicyScopeTypeSchema = z.enum([
  "global",
  "user",
  "project",
  "organization",
  "provider",
  "ip",
]);
export type AdminRateLimitPolicyScopeType = z.infer<
  typeof adminRateLimitPolicyScopeTypeSchema
>;

const adminRateLimitTaskTypeSchema = z.string().trim().min(1).max(96);
const adminRateLimitCountSchema = z.number().int().min(1);
const adminRateLimitWindowSecondsSchema = z.number().int().min(1);

export const adminRateLimitPolicyCreateRequestSchema = z
  .object({
    scopeType: adminRateLimitPolicyScopeTypeSchema,
    scopeId: z.string().trim().min(1).nullable().optional(),
    providerConfigId: z.string().trim().min(1).nullable().optional(),
    taskType: adminRateLimitTaskTypeSchema.optional(),
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    enabled: z.boolean().default(true),
  })
  .strict();
export type AdminRateLimitPolicyCreateRequest = z.infer<
  typeof adminRateLimitPolicyCreateRequestSchema
>;

export const adminRateLimitPolicyUpdateRequestSchema = z
  .object({
    scopeId: z.string().trim().min(1).nullable().optional(),
    providerConfigId: z.string().trim().min(1).nullable().optional(),
    taskType: adminRateLimitTaskTypeSchema.nullable().optional(),
    limit: adminRateLimitCountSchema.optional(),
    windowSeconds: adminRateLimitWindowSecondsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export type AdminRateLimitPolicyUpdateRequest = z.infer<
  typeof adminRateLimitPolicyUpdateRequestSchema
>;

export const adminRateLimitPolicyDtoSchema = z
  .object({
    id: z.string().min(1),
    scopeType: adminRateLimitPolicyScopeTypeSchema,
    scopeId: z.string().min(1).nullable(),
    providerConfigId: z.string().min(1).nullable(),
    taskType: adminRateLimitTaskTypeSchema.nullable(),
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    enabled: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminRateLimitPolicyDto = z.infer<typeof adminRateLimitPolicyDtoSchema>;

export const adminRateLimitFallbackPolicySchema = z
  .object({
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    source: z.enum(["default", "environment", "admin_policy"]),
  })
  .strict();
export type AdminRateLimitFallbackPolicy = z.infer<
  typeof adminRateLimitFallbackPolicySchema
>;

export const adminRateLimitPolicyListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    rateLimits: z.array(adminRateLimitPolicyDtoSchema),
    fallbackPolicy: adminRateLimitFallbackPolicySchema,
  })
  .strict();
export type AdminRateLimitPolicyListResponse = z.infer<
  typeof adminRateLimitPolicyListResponseSchema
>;

export const adminProviderCostEstimateSchema = z
  .object({
    enabled: z.literal(false),
    amount: z.null(),
    currency: z.null(),
    externalBillingSource: z.literal("external_provider"),
    note: z.string().trim().min(1),
  })
  .strict();
export type AdminProviderCostEstimate = z.infer<
  typeof adminProviderCostEstimateSchema
>;

export const adminProviderTokenUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).nullable(),
    outputTokens: z.number().int().min(0).nullable(),
    totalTokens: z.number().int().min(0).nullable(),
  })
  .strict();
export type AdminProviderTokenUsage = z.infer<
  typeof adminProviderTokenUsageSchema
>;

export const adminProviderUsageDtoSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1).nullable(),
    projectId: z.string().min(1).nullable(),
    courseId: z.string().min(1).nullable(),
    classId: z.string().min(1).nullable(),
    providerConfigId: z.string().min(1),
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1).nullable(),
    taskType: adminRateLimitTaskTypeSchema,
    outcome: z.enum(["success", "failed", "blocked"]),
    units: z.number().int().min(1),
    tokenUsage: adminProviderTokenUsageSchema.nullable(),
    createdAt: isoTimestampSchema,
    costEstimate: adminProviderCostEstimateSchema,
  })
  .strict();
export type AdminProviderUsageDto = z.infer<
  typeof adminProviderUsageDtoSchema
>;

export const adminProviderUsageListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    usage: z.array(adminProviderUsageDtoSchema),
  })
  .strict();
export type AdminProviderUsageListResponse = z.infer<
  typeof adminProviderUsageListResponseSchema
>;

export const adminProviderQuotaDtoSchema = z
  .object({
    providerConfigId: z.string().min(1),
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1).nullable(),
    taskType: adminRateLimitTaskTypeSchema.nullable(),
    scopeType: adminRateLimitPolicyScopeTypeSchema,
    scopeId: z.string().min(1).nullable(),
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    usedUnits: z.number().int().min(0),
    remainingUnits: z.number().int().min(0),
    resetAt: optionalNullableTimestampSchema,
    costEstimate: adminProviderCostEstimateSchema,
  })
  .strict();
export type AdminProviderQuotaDto = z.infer<
  typeof adminProviderQuotaDtoSchema
>;

export const adminProviderQuotaListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    quotas: z.array(adminProviderQuotaDtoSchema),
  })
  .strict();
export type AdminProviderQuotaListResponse = z.infer<
  typeof adminProviderQuotaListResponseSchema
>;

const adminNullableCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().min(1).max(64).nullable(),
);

const adminEntityStatusSchema = z.enum(["active", "archived"]);
export type AdminEntityStatus = z.infer<typeof adminEntityStatusSchema>;

export const adminOrganizationTypeSchema = z.enum([
  "school",
  "department",
  "other",
]);
export type AdminOrganizationType = z.infer<typeof adminOrganizationTypeSchema>;

export const adminOrganizationDtoSchema = z
  .object({
    id: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    type: adminOrganizationTypeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminOrganizationDto = z.infer<typeof adminOrganizationDtoSchema>;

export const adminOrganizationCreateRequestSchema = z
  .object({
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    type: adminOrganizationTypeSchema.default("school"),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminOrganizationCreateRequest = z.infer<
  typeof adminOrganizationCreateRequestSchema
>;

export const adminOrganizationListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    organizations: z.array(adminOrganizationDtoSchema),
  })
  .strict();
export type AdminOrganizationListResponse = z.infer<
  typeof adminOrganizationListResponseSchema
>;

export const adminCourseDtoSchema = z
  .object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    term: adminNullableCodeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminCourseDto = z.infer<typeof adminCourseDtoSchema>;

export const adminCourseCreateRequestSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    term: adminNullableCodeSchema.default(null),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminCourseCreateRequest = z.infer<
  typeof adminCourseCreateRequestSchema
>;

export const adminCourseListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    courses: z.array(adminCourseDtoSchema),
  })
  .strict();
export type AdminCourseListResponse = z.infer<
  typeof adminCourseListResponseSchema
>;

export const adminClassDtoSchema = z
  .object({
    id: z.string().min(1),
    courseId: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminClassDto = z.infer<typeof adminClassDtoSchema>;

export const adminClassCreateRequestSchema = z
  .object({
    courseId: z.string().trim().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminClassCreateRequest = z.infer<
  typeof adminClassCreateRequestSchema
>;

export const adminClassListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    classes: z.array(adminClassDtoSchema),
  })
  .strict();
export type AdminClassListResponse = z.infer<
  typeof adminClassListResponseSchema
>;

export const adminTeamDtoSchema = z
  .object({
    id: z.string().min(1),
    classId: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminTeamDto = z.infer<typeof adminTeamDtoSchema>;

export const adminTeamCreateRequestSchema = z
  .object({
    classId: z.string().trim().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminTeamCreateRequest = z.infer<
  typeof adminTeamCreateRequestSchema
>;

export const adminTeamListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    teams: z.array(adminTeamDtoSchema),
  })
  .strict();
export type AdminTeamListResponse = z.infer<typeof adminTeamListResponseSchema>;

export const adminOrganizationMembershipTargetTypeSchema = z.enum([
  "organization",
  "course",
  "class",
  "team",
]);
export type AdminOrganizationMembershipTargetType = z.infer<
  typeof adminOrganizationMembershipTargetTypeSchema
>;

export const adminOrganizationMembershipRoleSchema = z.enum([
  "owner",
  "course_admin",
  "teacher",
  "assistant",
  "student",
  "member",
]);
export type AdminOrganizationMembershipRole = z.infer<
  typeof adminOrganizationMembershipRoleSchema
>;

export const adminOrganizationMembershipStatusSchema = z.enum([
  "active",
  "invited",
]);
export type AdminOrganizationMembershipStatus = z.infer<
  typeof adminOrganizationMembershipStatusSchema
>;

export const adminOrganizationMembershipDtoSchema = z
  .object({
    id: z.string().min(1),
    targetType: adminOrganizationMembershipTargetTypeSchema,
    targetId: z.string().min(1),
    userId: z.string().min(1).nullable(),
    email: emailAddressSchema.nullable(),
    displayName: publicNameSchema.nullable(),
    role: adminOrganizationMembershipRoleSchema,
    status: adminOrganizationMembershipStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminOrganizationMembershipDto = z.infer<
  typeof adminOrganizationMembershipDtoSchema
>;

export const adminOrganizationMembershipCreateRequestSchema = z
  .object({
    targetType: adminOrganizationMembershipTargetTypeSchema,
    targetId: z.string().trim().min(1),
    userId: z.string().trim().min(1).nullable().optional(),
    email: emailAddressSchema.nullable().optional(),
    displayName: publicNameSchema.nullable().optional(),
    role: adminOrganizationMembershipRoleSchema,
    status: adminOrganizationMembershipStatusSchema.default("active"),
  })
  .refine((input) => input.userId || input.email, {
    message: "Either userId or email is required",
    path: ["userId"],
  });
export type AdminOrganizationMembershipCreateRequest = z.infer<
  typeof adminOrganizationMembershipCreateRequestSchema
>;

export const adminOrganizationMembershipListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    memberships: z.array(adminOrganizationMembershipDtoSchema),
  })
  .strict();
export type AdminOrganizationMembershipListResponse = z.infer<
  typeof adminOrganizationMembershipListResponseSchema
>;

export const adminQuotaScopeTypeSchema = z.enum([
  "organization",
  "course",
  "class",
  "team",
]);
export type AdminQuotaScopeType = z.infer<typeof adminQuotaScopeTypeSchema>;

export const adminQuotaResourceSchema = z.enum([
  "runs",
  "documents",
  "storage_bytes",
  "provider_tokens",
]);
export type AdminQuotaResource = z.infer<typeof adminQuotaResourceSchema>;

export const adminQuotaResetPeriodSchema = z.enum(["none", "daily", "monthly"]);
export type AdminQuotaResetPeriod = z.infer<typeof adminQuotaResetPeriodSchema>;

export const adminQuotaDtoSchema = z
  .object({
    id: z.string().min(1),
    scopeType: adminQuotaScopeTypeSchema,
    scopeId: z.string().min(1),
    resource: adminQuotaResourceSchema,
    limit: z.number().int().min(0),
    used: z.number().int().min(0),
    resetPeriod: adminQuotaResetPeriodSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminQuotaDto = z.infer<typeof adminQuotaDtoSchema>;

export const adminQuotaCreateRequestSchema = z
  .object({
    scopeType: adminQuotaScopeTypeSchema,
    scopeId: z.string().trim().min(1),
    resource: adminQuotaResourceSchema,
    limit: z.number().int().min(0),
    used: z.number().int().min(0).default(0),
    resetPeriod: adminQuotaResetPeriodSchema.default("none"),
  })
  .strict();
export type AdminQuotaCreateRequest = z.infer<
  typeof adminQuotaCreateRequestSchema
>;

export const adminQuotaListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    quotas: z.array(adminQuotaDtoSchema),
  })
  .strict();
export type AdminQuotaListResponse = z.infer<typeof adminQuotaListResponseSchema>;

export const auditLogDtoSchema = z
  .object({
    id: z.string().min(1),
    actorUserId: z.string().min(1).nullable(),
    action: z.string().min(1),
    targetType: z.string().min(1),
    targetId: z.string().min(1).nullable(),
    outcome: z.enum(["success", "failure"]),
    message: z.string().min(1).nullable(),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type AuditLogDto = z.infer<typeof auditLogDtoSchema>;

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

export const evidenceReviewDecisionSchema = z.object({
  id: z.string().min(1),
  reviewItemId: z.string().min(1),
  decision: z.enum(["approved", "rejected", "needs-repair", "accepted-risk"]),
  reviewerId: z.string().min(1).optional(),
  reviewerName: z.string().min(1).optional(),
  comment: z.string().min(1),
  decidedAt: z.string().min(1),
});
export type EvidenceReviewDecision = z.infer<
  typeof evidenceReviewDecisionSchema
>;

export const evidenceReviewItemSchema = z.object({
  id: z.string().min(1),
  source: z.enum([
    "requirement-quality",
    "coverage",
    "traceability",
    "business-assertion",
    "assumption",
    "conflict",
    "artifact",
  ]),
  status: z.enum(["pending", "resolved"]),
  severity: z.enum(["info", "warning", "error", "critical"]),
  requirementId: z.string().min(1).optional(),
  artifactType: traceabilityArtifactTypeSchema.optional(),
  artifactId: z.string().min(1).optional(),
  reason: z.string().min(1),
  decision: evidenceReviewDecisionSchema.optional(),
});
export type EvidenceReviewItem = z.infer<typeof evidenceReviewItemSchema>;

export const evidenceArtifactSummarySchema = z.object({
  artifactType: z.enum([
    "requirements-model",
    "design-model",
    "plantuml",
    "svg",
    "code",
    "test",
    "document",
    "browser",
  ]),
  artifactId: z.string().min(1),
  label: z.string().min(1).optional(),
  requirementIds: z.array(z.string().min(1)).default([]),
});
export type EvidenceArtifactSummary = z.infer<
  typeof evidenceArtifactSummarySchema
>;

export const evidenceFailureRecordSchema = z.object({
  id: z.string().min(1),
  stage: z.string().min(1).optional(),
  message: z.string().min(1),
  requirementId: z.string().min(1).optional(),
  artifactId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});
export type EvidenceFailureRecord = z.infer<typeof evidenceFailureRecordSchema>;

export const evidenceRepairRecordSchema = z.object({
  id: z.string().min(1),
  stage: z.string().min(1).optional(),
  attempt: z.number().int().min(1).optional(),
  kind: z.string().min(1),
  artifactId: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});
export type EvidenceRepairRecord = z.infer<typeof evidenceRepairRecordSchema>;

export const browserEvidenceRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["screenshot", "dom", "console", "network", "assertion"]),
  label: z.string().min(1),
  artifactId: z.string().min(1).optional(),
  status: z.enum(["passed", "failed", "pending-review"]),
  capturedAt: z.string().min(1),
});
export type BrowserEvidenceRecord = z.infer<typeof browserEvidenceRecordSchema>;

export const evidencePackageSchema = z.object({
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  status: z.enum(["complete", "blocked", "failed"]),
  requirementBaseline: requirementBaselineSchema.nullable(),
  qualityReport: requirementQualityReportSchema.nullable(),
  coverageMatrix: coverageMatrixSchema.nullable(),
  traceabilityMatrix: traceabilityMatrixSchema.nullable(),
  modelArtifacts: z.array(evidenceArtifactSummarySchema),
  codeArtifacts: z.array(evidenceArtifactSummarySchema),
  businessAssertionResults: codeBusinessAssertionResultSchema.nullable(),
  browserEvidence: z.array(browserEvidenceRecordSchema),
  reviewItems: z.array(evidenceReviewItemSchema),
  reviewDecisions: z.array(evidenceReviewDecisionSchema),
  failureRecords: z.array(evidenceFailureRecordSchema),
  repairRecords: z.array(evidenceRepairRecordSchema),
});
export type EvidencePackage = z.infer<typeof evidencePackageSchema>;

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

export const startRunRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  requirementText: z.string().min(1),
  selectedDiagrams: z.array(diagramKindSchema),
  rules: z.array(requirementRuleSchema).default([]),
  providerSettings: providerSettingsSchema.optional(),
});
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

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

export const startDesignRunRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  requirementText: z.string().min(1),
  rules: z.array(requirementRuleSchema),
  requirementBaseline: requirementBaselineSchema.nullable().optional(),
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
});
export type StartDesignRunRequest = z.infer<typeof startDesignRunRequestSchema>;

export const startCodeRunRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  requirementText: z.string().min(1),
  rules: z.array(requirementRuleSchema),
  requirementBaseline: requirementBaselineSchema.nullable().optional(),
  evidencePackage: evidencePackageSchema.nullable().optional(),
  designModels: z.array(designDiagramModelSpecSchema).min(1),
  designPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
  existingFiles: z.record(z.string().min(1), z.string()).default({}),
  generationMode: z.enum(["continue", "regenerate"]).default("continue"),
  providerSettings: providerSettingsSchema.optional(),
  imageProviderSettings: imageProviderSettingsSchema.optional(),
});
export type StartCodeRunRequest = z.infer<typeof startCodeRunRequestSchema>;

export const documentKindSchema = z.enum(["requirementsSpec", "softwareDesignSpec"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentStatusSchema = z.enum(["active", "deleted"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentLibraryItemSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).nullable().optional(),
  createdByUserId: z.string().min(1).nullable().optional(),
  documentKind: documentKindSchema,
  title: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().min(0),
  version: z.number().int().min(1),
  status: documentStatusSchema.default("active"),
  sourceRunId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type DocumentLibraryItem = z.infer<typeof documentLibraryItemSchema>;

export const documentLibraryListResponseSchema = z.object({
  documents: z.array(documentLibraryItemSchema),
});
export type DocumentLibraryListResponse = z.infer<
  typeof documentLibraryListResponseSchema
>;

export const documentLibraryVersionItemSchema = z.object({
  documentId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  createdByUserId: z.string().min(1).nullable(),
  version: z.number().int().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().min(0),
  sourceRunId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
});
export type DocumentLibraryVersionItem = z.infer<
  typeof documentLibraryVersionItemSchema
>;

export const documentLibraryVersionsResponseSchema = z.object({
  versions: z.array(documentLibraryVersionItemSchema),
});
export type DocumentLibraryVersionsResponse = z.infer<
  typeof documentLibraryVersionsResponseSchema
>;

export const onlyOfficeEditorConfigResponseSchema = z.object({
  document: documentLibraryItemSchema,
  documentServerUrl: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});
export type OnlyOfficeEditorConfigResponse = z.infer<
  typeof onlyOfficeEditorConfigResponseSchema
>;

export const onlyOfficeUiThemeSchema = z.enum([
  "theme-classic-light",
  "theme-dark",
]);
export type OnlyOfficeUiTheme = z.infer<typeof onlyOfficeUiThemeSchema>;

export const documentStylePresetNameSchema = z.enum(["courseDesign"]);
export type DocumentStylePresetName = z.infer<typeof documentStylePresetNameSchema>;

const documentFontSchema = z.string().trim().min(1).max(64);
const documentPointSizeSchema = z.number().min(6).max(72);
const documentSpacingPtSchema = z.number().min(0).max(72);

export const documentLineSpacingSchema = z.object({
  type: z.enum(["single", "multiple"]),
  value: z.number().min(1).max(3),
});
export type DocumentLineSpacing = z.infer<typeof documentLineSpacingSchema>;

export const documentParagraphStyleSchema = z.object({
  eastAsiaFont: documentFontSchema.optional(),
  asciiFont: documentFontSchema.optional(),
  sizePt: documentPointSizeSchema.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  lineSpacing: documentLineSpacingSchema.optional(),
  spacingBeforePt: documentSpacingPtSchema.optional(),
  spacingAfterPt: documentSpacingPtSchema.optional(),
  firstLineIndentChars: z.number().min(0).max(4).optional(),
});
export type DocumentParagraphStyle = z.infer<typeof documentParagraphStyleSchema>;

export const documentHeadingStyleSchema = documentParagraphStyleSchema.extend({
  keepNext: z.boolean().optional(),
});
export type DocumentHeadingStyle = z.infer<typeof documentHeadingStyleSchema>;

export const documentTableStyleSchema = documentParagraphStyleSchema.extend({
  headerBold: z.boolean().optional(),
});
export type DocumentTableStyle = z.infer<typeof documentTableStyleSchema>;

export const documentStyleSettingsSchema = z.object({
  presetName: documentStylePresetNameSchema.default("courseDesign"),
  includeTableOfContents: z.boolean().default(true),
  autoNumberHeadings: z.boolean().default(true),
  heading1: documentHeadingStyleSchema.optional(),
  heading2: documentHeadingStyleSchema.optional(),
  heading3: documentHeadingStyleSchema.optional(),
  body: documentParagraphStyleSchema.optional(),
  table: documentTableStyleSchema.optional(),
  caption: documentParagraphStyleSchema.optional(),
});
export type DocumentStyleSettings = z.infer<typeof documentStyleSettingsSchema>;

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
  projectId: z.string().min(1).optional(),
  documentKind: documentKindSchema,
  requirementText: z.string().min(1),
  requirementBaseline: requirementBaselineSchema.nullable().optional(),
  evidencePackage: evidencePackageSchema.nullable().optional(),
  rules: z.array(requirementRuleSchema).default([]),
  requirementModels: z.array(diagramModelSpecSchema).default([]),
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

export const runStageSchema = z.enum([
  "extract_rules",
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
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

export const diagramErrorSchema = z.object({
  stage: runStageSchema,
  message: z.string().min(1),
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
  rules: z.array(requirementRuleSchema),
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
  errorMessage: z.string().nullable(),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

export const designRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string(),
  selectedDiagrams: z.array(designDiagramKindSchema),
  requestedDiagrams: z.array(designDiagramKindSchema).optional(),
  rules: z.array(requirementRuleSchema),
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
  diagramErrors: z.record(designDiagramKindSchema, diagramErrorSchema).default({}),
  designTrace: z.array(designTraceEntrySchema).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  errorMessage: z.string().nullable(),
});
export type DesignRunSnapshot = z.infer<typeof designRunSnapshotSchema>;

export const codeRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  requirementText: z.string(),
  rules: z.array(requirementRuleSchema),
  requirementBaseline: requirementBaselineSchema.nullable().default(null),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  evidencePackage: evidencePackageSchema.nullable().default(null),
  designModels: z.array(designDiagramModelSpecSchema),
  designPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
  spec: codeGenerationSpecSchema.nullable(),
  businessLogic: codeBusinessLogicSchema.nullable().default(null),
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
  errorMessage: z.string().nullable(),
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
  errorMessage: z.string().nullable(),
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
    "codeSpec",
    "codeFiles",
    "businessLogic",
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

export const renderStructuredModelRequestSchema = z.object({
  model: z.union([diagramModelSpecSchema, designDiagramModelSpecSchema]),
});
export type RenderStructuredModelRequest = z.infer<
  typeof renderStructuredModelRequestSchema
>;

export const renderStructuredModelResponseSchema = renderSvgResponseSchema.extend({
  plantUmlSource: z.string().min(1),
});
export type RenderStructuredModelResponse = z.infer<
  typeof renderStructuredModelResponseSchema
>;

export const renderPngRequestSchema = renderSvgRequestSchema;
export type RenderPngRequest = z.infer<typeof renderPngRequestSchema>;

export const renderPngResponseSchema = z.object({
  pngBase64: z.string().min(1),
  renderMeta: svgArtifactSchema.shape.renderMeta,
});
export type RenderPngResponse = z.infer<typeof renderPngResponseSchema>;
