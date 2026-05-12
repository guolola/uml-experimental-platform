import type {
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DiagramKind,
  DiagramModelSpec,
  RequirementRule,
} from "@uml-platform/contracts";

export const JSON_ONLY_SYSTEM_PROMPT =
  "你是一个严谨的软件需求与 UML 建模助手。你必须只返回 JSON，不要输出 Markdown、解释或代码围栏。";

const REQUIREMENT_STAGE_SEMANTICS = [
  "需求阶段模型职责：",
  "- 用例模型(usecase): 明确系统边界，直观展示“谁（角色）能做什么（用例）”。",
  "- 领域概念模型(class): 建立领域模型，定义实体属性及其间的数量对应关系。",
  "- 界面关系(activity): 描述 UI 的跳转逻辑与页面状态流转，例如根据登录态跳转。",
  "- 部署模型(deployment): 描述物理架构、网络拓扑、服务器节点及通信协议。",
].join("\n");

export function buildExtractRulesPrompt(requirementText: string) {
  return [
    "请从下面的实验平台需求中抽取结构化需求规则。",
    "返回 JSON 对象，格式必须是 {\"rules\":[...]}。",
    "每条规则字段必须包含：id, category, text, relatedDiagrams。",
    "relatedDiagrams 只能使用: usecase, class, activity, deployment。",
    "category 只能使用: 业务规则, 功能需求, 外部接口, 界面需求, 数据需求, 非功能需求, 部署需求, 异常处理。",
    "请保证规则编号从 r1 开始连续递增。",
    "",
    "原始需求：",
    requirementText,
  ].join("\n");
}

export function buildGenerateModelsPrompt(
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DiagramKind[],
) {
  return [
    "请根据原始需求和需求规则生成 UML 结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    "每个 model 必须包含：diagramKind, title, summary, notes，以及对应图类型要求的强类型字段。",
    "notes 必须是字符串数组，不能是对象数组。",
    "你必须从需求规则中提取参与者、约束、功能点、流程和部署信息，不能依赖不存在的 SRS 字段。",
    REQUIREMENT_STAGE_SEMANTICS,
    "只生成以下图类型：",
    selectedDiagrams.join(", "),
    "",
    "图类型结构约束：",
    "- usecase: 必须包含 actors, useCases, systemBoundaries, relationships。",
    "  actors[].字段：id, name, actorType(human|system|external), description(可选), responsibilities(string[])。",
    "  useCases[].字段：id, name, goal, description(可选), preconditions(string[]), postconditions(string[]), primaryActorId(可选), supportingActorIds(string[])。",
    "  systemBoundaries[].字段：id, name, description(可选)。",
    "  relationships[].字段：id, type(association|include|extend|generalization), sourceId, targetId, label(可选), condition(可选), description(可选)。",
    "- class: 必须包含 classes, interfaces, enums, relationships。",
    "  classes[].字段：id, name, classKind(entity|aggregate|valueObject|service|other, 可选), stereotype(可选), description(可选), attributes(array), operations(array)。",
    "  classes[].attributes[].字段：name, type, visibility(public|protected|private|package), required(可选), multiplicity(可选), defaultValue(可选), description(可选)。",
    "  classes[].operations[].字段：name, returnType(可选), visibility(public|protected|private|package), parameters(array), description(可选)。",
    "  classes[].operations[].parameters[].字段：name, type, required(可选), direction(in|out|inout, 可选)。",
    "  interfaces[].字段：id, name, description(可选), operations(array)。",
    "  enums[].字段：id, name, literals(string[])。",
    "  relationships[].字段：id, type(association|aggregation|composition|inheritance|implementation|dependency), sourceId, targetId, sourceRole(可选), targetRole(可选), sourceMultiplicity(可选), targetMultiplicity(可选), navigability(none|source-to-target|target-to-source|bidirectional, 可选), label(可选), description(可选)。",
    "- activity: 必须包含 swimlanes, nodes, relationships。",
    "  swimlanes[].字段：id, name, description(可选)。",
    "  nodes[] 必须按 type 区分结构：",
    "    start: id, type, name, description(可选)",
    "    end: id, type, name, description(可选)",
    "    activity: id, type, name, description(可选), actorOrLane(可选), input(string[]), output(string[])",
    "    decision: id, type, name(可选), question(可选), description(可选)",
    "    merge/fork/join: id, type, name(可选), description(可选)",
    "  relationships[].字段：id, type(control_flow|object_flow), sourceId, targetId, condition(可选), guard(可选), trigger(可选), description(可选)。",
    "- deployment: 必须包含 nodes, databases, components, externalSystems, artifacts, relationships。",
    "  nodes[].字段：id, name, nodeType(app|server|device|container|external), environment(可选), description(可选)。",
    "  databases[].字段：id, name, engine(可选), description(可选)。",
    "  components[].字段：id, name, componentType(可选), description(可选)。",
    "  externalSystems[].字段：id, name, description(可选)。",
    "  artifacts[].字段：id, name, artifactType(可选), description(可选)。",
    "  relationships[].字段：id, type(deployment|communication|dependency|hosting), sourceId, targetId, protocol(可选), port(可选), direction(one-way|two-way|inbound|outbound, 可选), label(可选), description(可选)。",
    "",
    "禁止输出通用 nodes/relations 旧结构，必须严格按 diagramKind 输出对应字段。",
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
  ].join("\n");
}

export function buildRepairModelsPrompt(
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DiagramKind[],
  previousOutput: string,
  parseError: string,
) {
  return [
    "请修复下面不符合要求的 UML 结构化模型 JSON 输出。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"models\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何额外文字。",
    "只修复 JSON 结构问题，不要改变原有业务语义。",
    REQUIREMENT_STAGE_SEMANTICS,
    "notes 必须是字符串数组，不能是对象数组。",
    "diagramKind 只能使用: usecase, class, activity, deployment。",
    "必须按 diagramKind 输出对应的强类型字段：",
    "- usecase => actors, useCases, systemBoundaries, relationships",
    "- class => classes, interfaces, enums, relationships",
    "- activity => swimlanes, nodes, relationships",
    "- deployment => nodes, databases, components, externalSystems, artifacts, relationships",
    "禁止回退成旧的通用 nodes/relations 结构。",
    "只生成以下图类型：",
    selectedDiagrams.join(", "),
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
    "",
    "上一次模型输出：",
    previousOutput,
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

const DESIGN_STAGE_SEMANTICS = [
  "设计阶段模型职责：",
  "- 顺序图(sequence): 动态行为层，确定对象间具体的方法调用时序，包含正常流程与异常动态行为。",
  "- 活动图(activity): 业务逻辑层，描述全局业务逻辑的流转、并行与分支。",
  "- 类图(class): 静态结构层，定义实体、接口、聚合根的属性、行为及静态关联（1:N、泛化等）。",
  "- 部署图(deployment): 物理部署层，展示软件组件在物理节点（K8s Pod、服务器、数据库）上的分布。",
].join("\n");

const DESIGN_MODEL_SCHEMA_INSTRUCTIONS = [
  "设计图类型结构约束：",
  "- sequence: 必须包含 participants, messages, fragments。",
  "  participants[].字段：id, name, participantType(actor|boundary|control|entity|service|database|external), description(可选)。",
  "  messages[].字段：id, type(sync|async|return|create|destroy), sourceId, targetId, name, parameters(string[]), returnValue(可选), condition(可选), description(可选)。",
  "  fragments[].字段：id, type(alt|opt|loop|par), label, messageIds(string[]), condition(可选), description(可选)。",
  "- activity/class/deployment 必须沿用需求阶段对应图的强类型字段，不允许输出通用 nodes/relations 旧结构。",
  "- activity 表达业务逻辑层，不表达页面跳转说明。",
  "- class 表达静态结构层，类应包含操作；接口、服务、实体、聚合根要通过 classKind 或 stereotype 标明。",
  "- deployment 表达物理部署层，优先体现 K8s Pod、服务、数据库、外部系统及通信协议。",
].join("\n");

export function buildGenerateDesignSequencePrompt(
  requirementText: string,
  rules: RequirementRule[],
  useCaseModel: DiagramModelSpec,
) {
  return [
    "请根据需求阶段用例模型生成设计阶段顺序图结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...]}，且只包含一个 diagramKind 为 sequence 的模型。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    DESIGN_STAGE_SEMANTICS,
    DESIGN_MODEL_SCHEMA_INSTRUCTIONS,
    "顺序图必须把用例中的角色、系统边界和关键用例转化为对象间方法调用时序。",
    "必须包含主要正常流程；如需求规则中存在异常处理或扩展条件，也要用消息或片段表达。",
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
    "",
    "需求阶段用例模型：",
    JSON.stringify(useCaseModel, null, 2),
  ].join("\n");
}

export function buildGenerateDesignModelsPrompt(
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  sequenceModel: DesignDiagramModelSpec,
  selectedDiagrams: DesignDiagramKind[],
) {
  return [
    "请根据需求阶段模型和设计阶段顺序图生成设计阶段 UML 结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    DESIGN_STAGE_SEMANTICS,
    DESIGN_MODEL_SCHEMA_INSTRUCTIONS,
    "只生成以下设计图类型：",
    selectedDiagrams.join(", "),
    "",
    "映射规则：",
    "- 需求阶段活动图 + 设计阶段顺序图 -> 设计阶段活动图（业务逻辑模型）。",
    "- 需求阶段类图 + 设计阶段顺序图 -> 设计阶段类图（静态结构模型）。",
    "- 需求阶段部署图 + 设计阶段顺序图 -> 设计阶段部署图（物理部署模型）。",
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
    "",
    "需求阶段来源模型：",
    JSON.stringify(requirementModels, null, 2),
    "",
    "设计阶段顺序图：",
    JSON.stringify(sequenceModel, null, 2),
  ].join("\n");
}

export function buildRepairDesignModelsPrompt(
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DesignDiagramKind[],
  previousOutput: string,
  parseError: string,
) {
  return [
    "请修复下面不符合要求的设计阶段 UML 结构化模型 JSON 输出。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"models\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何额外文字。",
    "只修复 JSON 结构问题，不要改变原有业务语义。",
    DESIGN_STAGE_SEMANTICS,
    DESIGN_MODEL_SCHEMA_INSTRUCTIONS,
    "只生成以下设计图类型：",
    selectedDiagrams.join(", "),
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
    "",
    "上一次模型输出：",
    previousOutput,
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

export function buildRepairPlantUmlPrompt(
  diagramKind: DiagramKind | DesignDiagramKind,
  model: DiagramModelSpec | DesignDiagramModelSpec,
  plantUmlSource: string,
  renderError: string,
) {
  const activitySpecificRules =
    diagramKind === "activity"
      ? [
          "这是 PlantUML activity diagram。",
          "泳道必须按 PlantUML 活动图合法位置放置，首次泳道声明必须出现在图开始处。",
          "必须保留 start / stop / decision / fork / join / swimlane 的业务语义。",
          "如果无法安全表达并发或分支，优先输出可编译的顺序化活动图，不要继续输出语法错误。",
        ]
      : [];
  return [
    "请修复下面无法编译或返回占位 SVG 的 PlantUML。",
    "你是 PlantUML 修复助手。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"source\":\"@startuml ... @enduml\"}。",
    "source 必须是完整、可编译的 PlantUML 源码，必须包含 @startuml 和 @enduml。",
    "必须保留原图的业务语义，不要任意删除核心参与者、核心节点、核心关系或关键说明。",
    "优先修正语法错误、别名冲突、关系引用错误、图类型不合法元素和不兼容语法。",
    ...activitySpecificRules,
    "",
    "图类型：",
    diagramKind,
    "",
    "结构化模型：",
    JSON.stringify(model, null, 2),
    "",
    "当前失败的 PlantUML：",
    plantUmlSource,
    "",
    "编译或渲染错误：",
    renderError,
  ].join("\n");
}
