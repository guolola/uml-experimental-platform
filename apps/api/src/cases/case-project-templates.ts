// Defines deterministic marketing case project templates for one-click sample project creation.
import {
  codeRunSnapshotSchema,
  designRunSnapshotSchema,
  runSnapshotSchema,
  type CodeRunSnapshot,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignPlantUmlArtifact,
  type DesignRunSnapshot,
  type DiagramKind,
  type DiagramModelSpec,
  type PlantUmlArtifact,
  type ProjectBackgroundKey,
  type AtomicRequirement,
  type RequirementBaseline,
  type RequirementRule,
  type RunSnapshot,
} from "@uml-platform/contracts";

export type CaseProjectTemplate = {
  id: string;
  title: string;
  description: string;
  backgroundKey: ProjectBackgroundKey;
  requirementSnapshot: RunSnapshot;
  designSnapshot: DesignRunSnapshot;
  codeSnapshot: CodeRunSnapshot;
};

type CaseSeed = {
  id: string;
  title: string;
  description: string;
  backgroundKey: ProjectBackgroundKey;
  requirementText: string;
  actors: [string, string, string];
  entityNames: [string, string, string];
  primaryAction: string;
  secondaryAction: string;
  approvalAction: string;
  statusEntity: string;
  states: [string, string, string, string];
  externalSystem: string;
  notificationRule: string;
  dashboardTitle: string;
};

const generatedAt = "2026-06-26T00:00:00.000Z";
const requirementDiagrams = ["usecase", "class", "activity"] as const satisfies DiagramKind[];
const designDiagrams = ["architecture", "sequence", "class", "table"] as const satisfies DesignDiagramKind[];

const seeds = [
  {
    id: "lab-booking",
    title: "实验室预约系统",
    description: "已预置实验室预约、审批、资源占用和通知链路的完整示例项目。",
    backgroundKey: "booking",
    requirementText:
      "高校实验室预约平台。学生可以查看实验室空闲时段并提交预约申请，教师审核预约，管理员维护实验室设备和开放时间。系统需要避免时段冲突，并在审核通过或驳回时通知申请人。",
    actors: ["学生", "教师", "实验室管理员"],
    entityNames: ["实验室", "预约申请", "通知"],
    primaryAction: "提交预约申请",
    secondaryAction: "查看实验室空闲时段",
    approvalAction: "审核预约",
    statusEntity: "预约申请",
    states: ["草稿", "待审核", "已通过", "已驳回"],
    externalSystem: "消息通知服务",
    notificationRule: "审核通过或驳回时通知申请人。",
    dashboardTitle: "实验室预约控制台",
  },
  {
    id: "order-management",
    title: "订单管理系统",
    description: "已预置订单创建、库存校验、发货通知和状态跟踪的完整示例项目。",
    backgroundKey: "orders",
    requirementText:
      "面向中小商家的订单管理系统。商家可以维护商品、创建订单、查看库存，客户可以提交订单并查询订单状态。系统需要在下单前校验库存，库存不足时给出明确提示，订单创建后通知仓储系统发货。",
    actors: ["客户", "商家", "仓储系统"],
    entityNames: ["商品", "订单", "库存记录"],
    primaryAction: "提交订单",
    secondaryAction: "查询订单状态",
    approvalAction: "确认发货",
    statusEntity: "订单",
    states: ["待支付", "待发货", "已发货", "库存不足"],
    externalSystem: "仓储系统",
    notificationRule: "订单创建后通知仓储系统发货。",
    dashboardTitle: "订单履约控制台",
  },
  {
    id: "device-monitoring",
    title: "设备监控系统",
    description: "已预置设备数据采集、告警确认、严重告警通知和监控看板的完整示例项目。",
    backgroundKey: "iot",
    requirementText:
      "工业设备监控系统。边缘网关采集设备温度、振动和运行状态，平台实时展示异常告警，运维人员可以确认告警并记录处理结果。系统需要接入第三方短信服务，在严重告警时发送通知。",
    actors: ["边缘网关", "运维人员", "短信服务"],
    entityNames: ["设备", "告警", "处理记录"],
    primaryAction: "确认告警",
    secondaryAction: "查看设备状态",
    approvalAction: "记录处理结果",
    statusEntity: "告警",
    states: ["正常", "预警", "严重", "已处理"],
    externalSystem: "第三方短信服务",
    notificationRule: "严重告警时发送短信通知运维人员。",
    dashboardTitle: "设备监控看板",
  },
  {
    id: "library-lending",
    title: "图书馆借阅系统",
    description: "已预置图书检索、借阅登记、归还处理和逾期提醒的完整示例项目。",
    backgroundKey: "campus",
    requirementText:
      "校园图书馆借阅系统。读者可以检索图书、提交借阅申请并查看借阅状态，馆员负责登记借出和归还。系统需要维护图书库存，自动识别逾期记录，并向读者发送归还提醒。",
    actors: ["读者", "馆员", "系统通知服务"],
    entityNames: ["图书", "借阅记录", "逾期提醒"],
    primaryAction: "提交借阅申请",
    secondaryAction: "检索图书",
    approvalAction: "登记借出和归还",
    statusEntity: "借阅记录",
    states: ["可借", "申请中", "已借出", "已逾期"],
    externalSystem: "系统通知服务",
    notificationRule: "逾期时向读者发送归还提醒。",
    dashboardTitle: "图书借阅工作台",
  },
] as const satisfies CaseSeed[];

export const caseProjectTemplates = seeds.map(buildCaseProjectTemplate);

export function getCaseProjectTemplate(caseId: string) {
  return caseProjectTemplates.find((template) => template.id === caseId) ?? null;
}

function buildCaseProjectTemplate(seed: CaseSeed): CaseProjectTemplate {
  const requirementSnapshot = buildRequirementSnapshot(seed);
  const designSnapshot = buildDesignSnapshot(seed, requirementSnapshot);
  const codeSnapshot = buildCodeSnapshot(seed, designSnapshot);
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    backgroundKey: seed.backgroundKey,
    requirementSnapshot,
    designSnapshot,
    codeSnapshot,
  };
}

function buildRequirementSnapshot(seed: CaseSeed): RunSnapshot {
  const runId = `${seed.id}-requirements`;
  const rules = buildRules(seed);
  const baseline = buildRequirementBaseline(seed, runId, rules);
  const models = buildRequirementModels(seed);
  return runSnapshotSchema.parse({
    runId,
    requirementText: seed.requirementText,
    selectedDiagrams: requirementDiagrams,
    requestedDiagrams: requirementDiagrams,
    rules,
    requirementBaseline: baseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    models,
    requirementModelTraceability: buildRequirementTraceability(seed),
    plantUml: buildRequirementPlantUml(seed),
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
  });
}

function buildDesignSnapshot(seed: CaseSeed, requirementSnapshot: RunSnapshot): DesignRunSnapshot {
  const models = buildDesignModels(seed);
  return designRunSnapshotSchema.parse({
    runId: `${seed.id}-design`,
    requirementText: seed.requirementText,
    selectedDiagrams: designDiagrams,
    requestedDiagrams: designDiagrams,
    rules: requirementSnapshot.rules,
    requirementBaseline: requirementSnapshot.requirementBaseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    requirementModels: requirementSnapshot.models,
    requirementModelTraceability: requirementSnapshot.requirementModelTraceability,
    models,
    designModelTraceability: buildDesignTraceability(seed),
    plantUml: buildDesignPlantUml(seed),
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
  });
}

function buildCodeSnapshot(seed: CaseSeed, designSnapshot: DesignRunSnapshot): CodeRunSnapshot {
  const files = buildCodeFiles(seed);
  const entryFile = "/src/main.tsx";
  return codeRunSnapshotSchema.parse({
    runId: `${seed.id}-code`,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    designModels: designSnapshot.models,
    designPlantUml: designSnapshot.plantUml,
    spec: buildCodeSpec(seed),
    businessLogic: buildCodeBusinessLogic(seed),
    designToCodeMapping: null,
    designModelCoverageReport: null,
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: {
      status: "completed",
      model: "case-template",
      prompt: `${seed.title} 示例项目静态原型`,
      summary: `${seed.dashboardTitle} 已生成列表、状态、操作与规则提示。`,
      imageUrl: null,
      imageDataUrl: null,
      errorMessage: null,
      createdAt: generatedAt,
    },
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    businessAssertionResults: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: [],
    codeTrace: [],
    codeGenerationMode: "json_schema_operations",
    qualityDiagnostics: [
      {
        passed: true,
        metrics: {
          fileCount: Object.keys(files).length,
          pageFileCount: 1,
          componentFileCount: 2,
        },
        issues: [],
      },
    ],
    files,
    entryFile,
    dependencies: {
      "@vitejs/plugin-react": "^latest",
      vite: "^latest",
      typescript: "^latest",
      react: "^latest",
      "react-dom": "^latest",
    },
    agentPlan: [
      "建立案例领域数据与状态枚举",
      "实现看板、规则提示和操作流转",
      "补充响应式样式和空状态提示",
    ],
    generationMode: "regenerate",
    changedFileCount: Object.keys(files).length,
    diagnostics: [
      {
        stage: "audit_code_quality",
        message: "案例模板代码已通过静态结构校验。",
        at: generatedAt,
      },
    ],
    codeContextHash: `case-template:${seed.id}`,
    currentStage: "audit_code_quality",
    status: "completed",
    error: null,
  });
}

function buildRules(seed: CaseSeed): RequirementRule[] {
  return [
    {
      id: `${seed.id}-R1`,
      category: "功能需求",
      text: `${seed.actors[0]}可以${seed.secondaryAction}并${seed.primaryAction}。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["usecase", "activity"],
    },
    {
      id: `${seed.id}-R2`,
      category: "业务规则",
      text: `系统必须维护${seed.statusEntity}状态，状态包括${seed.states.join("、")}。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["class", "activity"],
    },
    {
      id: `${seed.id}-R3`,
      category: "功能需求",
      text: `${seed.actors[1]}可以${seed.approvalAction}。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["usecase", "activity"],
    },
    {
      id: `${seed.id}-R4`,
      category: "外部接口",
      text: `系统需要对接${seed.externalSystem}，${seed.notificationRule}`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["deployment", "activity"],
    },
    {
      id: `${seed.id}-R5`,
      category: "界面需求",
      text: `系统需要提供${seed.dashboardTitle}，集中展示关键数据、待处理事项和状态分布。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["prototype", "usecase"],
    },
  ];
}

function buildRequirementBaseline(
  seed: CaseSeed,
  runId: string,
  rules: RequirementRule[],
): RequirementBaseline {
  const requirements = rules.map((rule, index) => ({
    id: `${seed.id}-REQ-${index + 1}`,
    sourceFragment: rule.text,
    type: requirementTypeForRule(index),
    actor: index === 3 ? "系统" : seed.actors[Math.min(index, 1)],
    subject: seed.title,
    action: rule.text,
    object: seed.entityNames[Math.min(index, 2)],
    condition: index === 3 ? `需要触发${seed.externalSystem}` : null,
    outcome: index === 4 ? `展示${seed.dashboardTitle}` : "形成可追踪业务结果",
    confidence: 0.96,
    status: "accepted",
    criticality: index < 3 ? "high" : "medium",
    acceptanceCriteria: [`当执行“${rule.text}”时，系统给出明确状态和结果。`],
    fieldProvenance: {},
    priority: index < 3 ? "must" : "should",
    sourceRuleId: rule.id,
  })) satisfies AtomicRequirement[];
  return {
    runId,
    sourceDocumentId: `${seed.id}-source`,
    requirements,
    assumptions: [
      {
        id: `${seed.id}-A1`,
        text: "案例模板采用单组织、单租户教学演示边界。",
        rationale: "营销案例需要稳定展示完整链路，不引入课程组织绑定。",
        confidence: 0.9,
        status: "accepted",
      },
    ],
    conflicts: [],
    qualityReport: {
      runId,
      status: "passed",
      summary: `已建立 ${requirements.length} 条${seed.title}原子需求基线。`,
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    createdAt: generatedAt,
  };
}

function requirementTypeForRule(index: number): AtomicRequirement["type"] {
  if (index === 1) return "business-rule";
  if (index === 3) return "interface";
  return "functional";
}

function buildRequirementModels(seed: CaseSeed): DiagramModelSpec[] {
  return [
    {
      diagramKind: "usecase",
      title: `${seed.title}用例模型`,
      summary: `覆盖${seed.actors.join("、")}围绕${seed.statusEntity}的核心交互。`,
      notes: ["营销案例模板生成，适合课程实验快速浏览。"],
      actors: [
        { id: "actor-primary", name: seed.actors[0], actorType: "human", responsibilities: [seed.primaryAction] },
        { id: "actor-reviewer", name: seed.actors[1], actorType: "human", responsibilities: [seed.approvalAction] },
        { id: "actor-external", name: seed.actors[2], actorType: "external", responsibilities: [seed.notificationRule] },
      ],
      useCases: [
        {
          id: "uc-main",
          name: seed.primaryAction,
          goal: `${seed.actors[0]}完成${seed.primaryAction}`,
          preconditions: [`${seed.entityNames[0]}可用`],
          postconditions: [`${seed.statusEntity}进入${seed.states[1]}`],
          primaryActorId: "actor-primary",
          supportingActorIds: ["actor-reviewer"],
          eventFlows: [
            {
              id: "flow-main",
              name: "主成功场景",
              flowType: "main",
              steps: [
                { order: 1, actor: "actor", actorAction: seed.secondaryAction, sourceRequirementId: `${seed.id}-R1` },
                { order: 2, actor: "system", systemAction: `展示${seed.entityNames[0]}状态` },
                { order: 3, actor: "actor", actorAction: seed.primaryAction },
                { order: 4, actor: "system", systemAction: `生成${seed.statusEntity}` },
              ],
            },
          ],
        },
        {
          id: "uc-review",
          name: seed.approvalAction,
          goal: `${seed.actors[1]}处理${seed.statusEntity}`,
          preconditions: [`${seed.statusEntity}为${seed.states[1]}`],
          postconditions: [`${seed.statusEntity}进入${seed.states[2]}或${seed.states[3]}`],
          primaryActorId: "actor-reviewer",
          supportingActorIds: ["actor-external"],
          eventFlows: [],
        },
      ],
      systemBoundaries: [{ id: "boundary-main", name: seed.title, description: seed.description }],
      relationships: [
        { id: "rel-1", type: "association", sourceId: "actor-primary", targetId: "uc-main" },
        { id: "rel-2", type: "association", sourceId: "actor-reviewer", targetId: "uc-review" },
        { id: "rel-3", type: "include", sourceId: "uc-review", targetId: "actor-external", label: "通知" },
      ],
    },
    {
      diagramKind: "class",
      modelId: "class:requirement",
      title: `${seed.title}领域类模型`,
      summary: `沉淀${seed.entityNames.join("、")}及其关系。`,
      notes: ["字段以教学案例最小闭环为准。"],
      classes: seed.entityNames.map((name, index) => ({
        id: `c-${index + 1}`,
        name,
        constraints: [],
        classKind: index === 1 ? "aggregate" : "entity",
        attributes: [
          { name: "id", type: "string", visibility: "private", required: true, constraints: [] },
          { name: "status", type: "string", visibility: "private", required: index === 1, constraints: [] },
        ],
        operations: [{ name: index === 1 ? "changeStatus" : "update", returnType: "void", visibility: "public", parameters: [] }],
      })),
      interfaces: [],
      enums: [{ id: "enum-status", name: `${seed.statusEntity}状态`, literals: [...seed.states] }],
      relationships: [
        { id: "class-rel-1", type: "association", sourceId: "c-1", targetId: "c-2", targetMultiplicity: "*" },
        { id: "class-rel-2", type: "association", sourceId: "c-2", targetId: "c-3", targetMultiplicity: "*" },
      ],
    },
    {
      diagramKind: "activity",
      modelId: "activity:requirement",
      title: `${seed.title}业务活动模型`,
      summary: `描述从${seed.secondaryAction}到${seed.notificationRule}的闭环。`,
      notes: ["已覆盖正常和异常状态分支。"],
      swimlanes: seed.actors.map((actor, index) => ({ id: `lane-${index + 1}`, name: actor })),
      nodes: [
        { id: "start", type: "start", name: "开始" },
        { id: "act-query", type: "activity", name: seed.secondaryAction, actorOrLane: "lane-1", input: [], output: [seed.entityNames[0]] },
        { id: "act-submit", type: "activity", name: seed.primaryAction, actorOrLane: "lane-1", input: [seed.entityNames[0]], output: [seed.statusEntity] },
        { id: "act-review", type: "activity", name: seed.approvalAction, actorOrLane: "lane-2", input: [seed.statusEntity], output: [seed.states[2]] },
        { id: "act-notify", type: "activity", name: seed.notificationRule, actorOrLane: "lane-3", input: [seed.statusEntity], output: [seed.entityNames[2]] },
        { id: "end", type: "end", name: "结束" },
      ],
      relationships: [
        { id: "flow-1", type: "control_flow", sourceId: "start", targetId: "act-query" },
        { id: "flow-2", type: "control_flow", sourceId: "act-query", targetId: "act-submit" },
        { id: "flow-3", type: "control_flow", sourceId: "act-submit", targetId: "act-review" },
        { id: "flow-4", type: "control_flow", sourceId: "act-review", targetId: "act-notify" },
        { id: "flow-5", type: "control_flow", sourceId: "act-notify", targetId: "end" },
      ],
    },
  ];
}

function buildRequirementTraceability(seed: CaseSeed) {
  return [
    {
      ruleId: `${seed.id}-R1`,
      target: { diagramKind: "usecase", elementId: "uc-main", elementKind: "useCase", label: seed.primaryAction },
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "核心提交动作映射到主用例。",
    },
    {
      ruleId: `${seed.id}-R2`,
      target: { modelId: "class:requirement", diagramKind: "class", elementId: "enum-status", elementKind: "enum", label: `${seed.statusEntity}状态` },
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "状态规则映射到领域枚举。",
    },
    {
      ruleId: `${seed.id}-R4`,
      target: { modelId: "activity:requirement", diagramKind: "activity", elementId: "act-notify", elementKind: "activity", label: seed.notificationRule },
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "medium",
      rationale: "外部通知规则映射到通知活动。",
    },
  ];
}

function buildDesignModels(seed: CaseSeed): DesignDiagramModelSpec[] {
  return [
    {
      diagramKind: "architecture",
      modelId: "architecture-main",
      title: `${seed.title}分层架构`,
      summary: "前端原型、业务服务、数据存储和外部系统分层。",
      notes: ["案例模板采用浏览器端模拟数据。"],
      packages: [
        { id: "pkg-ui", name: "界面层", componentIds: ["cmp-app"] },
        { id: "pkg-domain", name: "业务层", componentIds: ["cmp-service"] },
      ],
      components: [
        { id: "cmp-app", name: seed.dashboardTitle, componentType: "React Page", packageId: "pkg-ui", sourceRequirementIds: [`${seed.id}-R5`] },
        { id: "cmp-service", name: `${seed.statusEntity}服务`, componentType: "Domain Service", packageId: "pkg-domain", sourceRequirementIds: [`${seed.id}-R2`] },
        { id: "cmp-external", name: seed.externalSystem, componentType: "External Adapter", sourceRequirementIds: [`${seed.id}-R4`] },
      ],
      relationships: [
        { id: "arch-rel-1", type: "dependency", sourceId: "cmp-app", targetId: "cmp-service" },
        { id: "arch-rel-2", type: "communication", sourceId: "cmp-service", targetId: "cmp-external" },
      ],
    },
    {
      diagramKind: "sequence",
      modelId: "sequence-main",
      sourceUseCaseId: "uc-main",
      sourceUseCaseName: seed.primaryAction,
      title: `${seed.primaryAction}时序设计`,
      summary: `从界面提交到状态变更和${seed.externalSystem}通知。`,
      notes: ["用于指导 React 原型交互。"],
      participants: [
        { id: "p-actor", name: seed.actors[0], participantType: "actor" },
        { id: "p-page", name: seed.dashboardTitle, participantType: "boundary" },
        { id: "p-service", name: `${seed.statusEntity}服务`, participantType: "service" },
        { id: "p-external", name: seed.externalSystem, participantType: "external" },
      ],
      messages: [
        { id: "msg-1", type: "sync", sourceId: "p-actor", targetId: "p-page", name: seed.primaryAction, parameters: [] },
        { id: "msg-2", type: "sync", sourceId: "p-page", targetId: "p-service", name: "createOrUpdate", parameters: [seed.statusEntity] },
        { id: "msg-3", type: "async", sourceId: "p-service", targetId: "p-external", name: "notify", parameters: [seed.notificationRule] },
      ],
      fragments: [],
    },
    {
      diagramKind: "class",
      modelId: "class-design",
      title: `${seed.title}设计类图`,
      summary: "将领域对象拆分为页面状态、服务和数据记录。",
      notes: ["与代码中的 mock 数据结构保持一致。"],
      classes: [
        { id: "d-record", name: `${seed.statusEntity}Record`, constraints: [], classKind: "entity", attributes: [{ name: "status", type: "string", visibility: "private", required: true, constraints: [] }], operations: [] },
        { id: "d-service", name: `${seed.statusEntity}Service`, constraints: [], classKind: "service", attributes: [], operations: [{ name: "transition", returnType: "Record", visibility: "public", parameters: [{ name: "nextStatus", type: "string" }] }] },
        { id: "d-page", name: "DashboardState", constraints: [], classKind: "valueObject", attributes: [{ name: "selectedStatus", type: "string", visibility: "private", constraints: [] }], operations: [] },
      ],
      interfaces: [],
      enums: [{ id: "d-status", name: `${seed.statusEntity}Status`, literals: [...seed.states] }],
      relationships: [
        { id: "d-class-rel-1", type: "dependency", sourceId: "d-page", targetId: "d-service" },
        { id: "d-class-rel-2", type: "association", sourceId: "d-service", targetId: "d-record" },
      ],
    },
    {
      diagramKind: "table",
      modelId: "table-design",
      title: `${seed.title}数据表设计`,
      summary: `围绕${seed.entityNames[0]}、${seed.statusEntity}和${seed.entityNames[2]}组织存储。`,
      notes: ["案例模板使用前端 mock 数据，表结构用于教学说明。"],
      tables: [
        {
          id: "tbl-resource",
          name: "resources",
          chineseName: seed.entityNames[0],
          constraints: [],
          columns: [
            { id: "col-resource-id", name: "id", constraints: [], dataType: "varchar(36)", isPrimaryKey: true, isForeignKey: false, nullable: false },
            { id: "col-resource-name", name: "name", constraints: [], dataType: "varchar(120)", isPrimaryKey: false, isForeignKey: false, nullable: false },
          ],
        },
        {
          id: "tbl-request",
          name: "requests",
          chineseName: seed.statusEntity,
          constraints: [],
          columns: [
            { id: "col-request-id", name: "id", constraints: [], dataType: "varchar(36)", isPrimaryKey: true, isForeignKey: false, nullable: false },
            { id: "col-request-status", name: "status", constraints: [], dataType: "varchar(32)", isPrimaryKey: false, isForeignKey: false, nullable: false },
            { id: "col-request-resource-id", name: "resource_id", constraints: [], dataType: "varchar(36)", isPrimaryKey: false, isForeignKey: true, nullable: false, references: { tableId: "tbl-resource", columnId: "col-resource-id" } },
          ],
        },
      ],
      relationships: [
        { id: "table-rel-1", type: "one-to-many", sourceTableId: "tbl-resource", targetTableId: "tbl-request", label: "资源关联申请" },
      ],
    },
  ];
}

function buildDesignTraceability(seed: CaseSeed) {
  return [
    {
      source: { diagramKind: "usecase", elementId: "uc-main", elementKind: "useCase", label: seed.primaryAction },
      targets: [{ modelId: "sequence-main", diagramKind: "sequence", elementId: "msg-1", elementKind: "message", label: seed.primaryAction }],
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "主用例落到时序入口消息。",
    },
    {
      source: { modelId: "class:requirement", diagramKind: "class", elementId: "enum-status", elementKind: "enum", label: `${seed.statusEntity}状态` },
      targets: [
        { modelId: "class-design", diagramKind: "class", elementId: "d-status", elementKind: "enum", label: `${seed.statusEntity}Status` },
        { modelId: "table-design", diagramKind: "table", elementId: "tbl-request", elementKind: "table", label: seed.statusEntity },
      ],
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "领域状态进入设计类和数据表。",
    },
    {
      source: { modelId: "activity:requirement", diagramKind: "activity", elementId: "act-notify", elementKind: "activity", label: seed.notificationRule },
      targets: [{ modelId: "architecture-main", diagramKind: "architecture", elementId: "cmp-external", elementKind: "component", label: seed.externalSystem }],
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "medium",
      rationale: "通知活动映射到外部系统适配组件。",
    },
  ];
}

function buildRequirementPlantUml(seed: CaseSeed): PlantUmlArtifact[] {
  return [
    {
      diagramKind: "usecase",
      source: `@startuml\nleft to right direction\nactor "${seed.actors[0]}" as Primary\nactor "${seed.actors[1]}" as Reviewer\nrectangle "${seed.title}" {\n  usecase "${seed.primaryAction}" as UC1\n  usecase "${seed.approvalAction}" as UC2\n}\nPrimary --> UC1\nReviewer --> UC2\n@enduml`,
    },
    {
      diagramKind: "class",
      modelId: "class:requirement",
      source: `@startuml\nclass "${seed.entityNames[0]}"\nclass "${seed.statusEntity}" {\n  status\n}\nclass "${seed.entityNames[2]}"\n"${seed.entityNames[0]}" --> "${seed.statusEntity}"\n"${seed.statusEntity}" --> "${seed.entityNames[2]}"\n@enduml`,
    },
    {
      diagramKind: "activity",
      modelId: "activity:requirement",
      source: `@startuml\nstart\n:${seed.secondaryAction};\n:${seed.primaryAction};\n:${seed.approvalAction};\n:${seed.notificationRule};\nstop\n@enduml`,
    },
  ];
}

function buildDesignPlantUml(seed: CaseSeed): DesignPlantUmlArtifact[] {
  return [
    {
      diagramKind: "architecture",
      modelId: "architecture-main",
      source: `@startuml\npackage "界面层" {\n  component "${seed.dashboardTitle}" as UI\n}\npackage "业务层" {\n  component "${seed.statusEntity}服务" as SVC\n}\ncloud "${seed.externalSystem}" as EXT\nUI --> SVC\nSVC --> EXT\n@enduml`,
    },
    {
      diagramKind: "sequence",
      modelId: "sequence-main",
      source: `@startuml\nactor "${seed.actors[0]}" as A\nboundary "${seed.dashboardTitle}" as UI\ncontrol "${seed.statusEntity}服务" as SVC\nentity "${seed.externalSystem}" as EXT\nA -> UI: ${seed.primaryAction}\nUI -> SVC: createOrUpdate()\nSVC -> EXT: notify()\n@enduml`,
    },
    {
      diagramKind: "class",
      modelId: "class-design",
      source: `@startuml\nclass "${seed.statusEntity}Record" as Record {\n  status\n}\nclass "${seed.statusEntity}Service" as Service {\n  transition(nextStatus)\n}\nclass "DashboardState" as DashboardState {\n  selectedStatus\n}\nDashboardState --> Service\nService --> Record\n@enduml`,
    },
    {
      diagramKind: "table",
      modelId: "table-design",
      source: `@startuml\nentity resources {\n  * id\n  name\n}\nentity requests {\n  * id\n  status\n  resource_id\n}\nresources ||--o{ requests\n@enduml`,
    },
  ];
}

function buildCodeSpec(seed: CaseSeed) {
  return {
    appName: seed.title,
    summary: `${seed.dashboardTitle} React 原型，展示关键数据、状态流转和规则提示。`,
    theme: {
      name: "teaching-dashboard",
      primaryColor: "#2563eb",
      backgroundColor: "#f8fafc",
      surfaceColor: "#ffffff",
      textColor: "#0f172a",
      accentColor: "#16a34a",
      density: "compact",
      tone: "清晰、克制、适合课程实验演示",
    },
    pages: [
      { id: "page-dashboard", name: seed.dashboardTitle, route: "/", purpose: "集中处理案例业务流程", sourceDiagramIds: ["architecture-main", "sequence-main"] },
    ],
    components: [
      { id: "component-status-board", name: "StatusBoard", responsibility: "展示状态分布和待办数据", sourceDiagramIds: ["class-design"] },
      { id: "component-record-list", name: "RecordList", responsibility: "展示记录并触发状态操作", sourceDiagramIds: ["sequence-main"] },
    ],
    interactions: [
      { id: "interaction-transition", trigger: seed.primaryAction, behavior: `将${seed.statusEntity}推进到${seed.states[1]}`, sourceDiagramIds: ["sequence-main"] },
    ],
    dataEntities: seed.entityNames.map((name, index) => ({
      id: `entity-${index + 1}`,
      name,
      fields: [
        { name: "id", type: "string", required: true },
        { name: "name", type: "string", required: true },
      ],
      sourceDiagramIds: ["table-design"],
    })),
    implementationNotes: ["使用 React 本地状态模拟业务数据。", "所有状态和操作均来自案例模板需求规则。"],
  };
}

function buildCodeBusinessLogic(seed: CaseSeed) {
  return {
    appName: seed.title,
    domainSummary: seed.description,
    coreWorkflow: `${seed.secondaryAction} -> ${seed.primaryAction} -> ${seed.approvalAction} -> ${seed.notificationRule}`,
    actors: seed.actors.map((actor, index) => ({
      id: `actor-${index + 1}`,
      name: actor,
      type: index === 2 ? "external" : "human",
      responsibilities: [index === 0 ? seed.primaryAction : index === 1 ? seed.approvalAction : seed.notificationRule],
    })),
    businessEntities: seed.entityNames.map((name) => ({
      id: `entity-${name}`,
      name,
      description: `${seed.title}中的${name}`,
      fields: ["id", "name", "status"],
      relationships: [`关联${seed.statusEntity}`],
    })),
    pageFlows: [
      {
        id: "flow-dashboard",
        name: seed.dashboardTitle,
        route: "/",
        purpose: "完成案例主流程演示",
        actors: [...seed.actors],
        entryPoints: [seed.secondaryAction],
        userActions: [seed.primaryAction, seed.approvalAction],
        states: [...seed.states],
        sourceRefs: ["sequence-main", "class-design"],
      },
    ],
    stateMachines: [{ entity: seed.statusEntity, states: [...seed.states], transitions: [`${seed.states[0]} -> ${seed.states[1]}`, `${seed.states[1]} -> ${seed.states[2]}`, `${seed.states[1]} -> ${seed.states[3]}`] }],
    permissions: [
      { actor: seed.actors[0], allowedActions: [seed.secondaryAction, seed.primaryAction], restrictedActions: [seed.approvalAction] },
      { actor: seed.actors[1], allowedActions: [seed.approvalAction], restrictedActions: [] },
    ],
    edgeCases: ["重复提交时保持幂等提示", "外部通知失败时保留可重试状态"],
    frontendOperations: [seed.primaryAction, seed.approvalAction, "筛选状态"],
    plantUmlTraceability: ["sequence-main", "class-design", "table-design"],
  };
}

function buildCodeFiles(seed: CaseSeed) {
  const records = [
    { name: `${seed.entityNames[0]} A`, owner: seed.actors[0], status: seed.states[0], priority: "高" },
    { name: `${seed.statusEntity} B`, owner: seed.actors[1], status: seed.states[1], priority: "中" },
    { name: `${seed.entityNames[2]} C`, owner: seed.actors[2], status: seed.states[2], priority: "低" },
  ];
  return {
    "/package.json": JSON.stringify(
      {
        scripts: { dev: "vite", build: "vite build" },
        dependencies: { "@vitejs/plugin-react": "latest", vite: "latest", typescript: "latest", react: "latest", "react-dom": "latest" },
        devDependencies: {},
      },
      null,
      2,
    ),
    "/src/main.tsx": "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
    "/src/App.tsx": `import { useMemo, useState } from 'react';\n\nconst initialRecords = ${JSON.stringify(records, null, 2)};\nconst states = ${JSON.stringify(seed.states)};\n\nexport default function App() {\n  const [records, setRecords] = useState(initialRecords);\n  const [filter, setFilter] = useState('全部');\n  const visibleRecords = useMemo(() => filter === '全部' ? records : records.filter((record) => record.status === filter), [filter, records]);\n  const statusCounts = states.map((state) => ({ state, count: records.filter((record) => record.status === state).length }));\n\n  function advanceRecord(name: string) {\n    setRecords((current) => current.map((record) => record.name === name ? { ...record, status: '${seed.states[2]}' } : record));\n  }\n\n  return (\n    <main className=\"app-shell\">\n      <section className=\"hero\">\n        <div>\n          <p className=\"eyebrow\">${seed.title}</p>\n          <h1>${seed.dashboardTitle}</h1>\n          <p>${seed.description}</p>\n        </div>\n        <button onClick={() => setRecords((current) => [{ name: '${seed.statusEntity} 新记录', owner: '${seed.actors[0]}', status: '${seed.states[1]}', priority: '高' }, ...current])}>${seed.primaryAction}</button>\n      </section>\n      <section className=\"status-grid\">\n        {statusCounts.map((item) => <article key={item.state}><span>{item.state}</span><strong>{item.count}</strong></article>)}\n      </section>\n      <section className=\"toolbar\">\n        <strong>状态筛选</strong>\n        {['全部', ...states].map((state) => <button key={state} className={filter === state ? 'active' : ''} onClick={() => setFilter(state)}>{state}</button>)}\n      </section>\n      <section className=\"records\">\n        {visibleRecords.map((record) => (\n          <article key={record.name}>\n            <div>\n              <h2>{record.name}</h2>\n              <p>{record.owner} · 优先级 {record.priority}</p>\n            </div>\n            <span>{record.status}</span>\n            <button onClick={() => advanceRecord(record.name)}>${seed.approvalAction}</button>\n          </article>\n        ))}\n      </section>\n      <aside className=\"rule-box\">\n        <strong>业务规则</strong>\n        <p>${seed.notificationRule}</p>\n        <p>状态流转：${seed.states.join(' -> ')}</p>\n      </aside>\n    </main>\n  );\n}\n`,
    "/src/styles.css": "body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#0f172a}.app-shell{min-height:100vh;padding:32px;display:grid;gap:20px}.hero{display:flex;justify-content:space-between;gap:24px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:28px}.eyebrow{color:#2563eb;font-weight:700}h1{margin:4px 0 10px;font-size:36px}.hero button,.records button,.toolbar button{border:0;border-radius:6px;background:#2563eb;color:white;padding:10px 14px;font-weight:700}.status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.status-grid article,.records article,.rule-box,.toolbar{background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px}.status-grid strong{display:block;font-size:30px;margin-top:8px}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.toolbar button{background:#e2e8f0;color:#0f172a}.toolbar button.active{background:#16a34a;color:white}.records{display:grid;gap:12px}.records article{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center}.records h2{font-size:18px;margin:0 0 6px}.records p,.rule-box p{color:#475569;margin:0}.records span{background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:6px 10px;font-size:13px;font-weight:700}@media(max-width:760px){.hero,.records article{grid-template-columns:1fr;display:grid}.status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}\n",
    "/index.html": "<!doctype html><html><head><meta charset=\"UTF-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/><title>Case Project</title></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>\n",
  };
}

