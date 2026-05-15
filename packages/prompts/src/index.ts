import type {
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DiagramKind,
  DiagramModelSpec,
  DocumentKind,
  RequirementRule,
  CodeAppBlueprint,
  CodeFilePlan,
  CodeGenerationSpec,
  CodeUiBlueprint,
  CodeUiMockup,
  CodeUiIr,
  CodeUiReferenceSpec,
} from "@uml-platform/contracts";

export const JSON_ONLY_SYSTEM_PROMPT =
  "你是一个严谨的软件需求与 UML 建模助手。你必须只返回 JSON，不要输出 Markdown、解释或代码围栏。";

const UI_MOCKUP_PROMPT_CHAR_LIMIT = 24000;

function truncateForPrompt(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 32))}\n...（内容已截断）`;
}

function stringifyForPrompt(value: unknown, maxChars: number) {
  return truncateForPrompt(JSON.stringify(value, null, 2), maxChars);
}

function compactCodeContextForUiMockup(codeContext: unknown) {
  if (!codeContext || typeof codeContext !== "object") return codeContext;

  const context = codeContext as Record<string, unknown>;
  const rules = Array.isArray(context.rules) ? context.rules.slice(0, 20) : [];
  const designModels = Array.isArray(context.designModels)
    ? context.designModels.slice(0, 8)
    : [];

  return {
    requirementText:
      typeof context.requirementText === "string"
        ? truncateForPrompt(context.requirementText, 2400)
        : context.requirementText,
    rules,
    designModels,
    appBlueprint: context.appBlueprint ?? null,
    uiBlueprint: context.uiBlueprint ?? null,
    constraints: context.constraints ?? null,
  };
}

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
  "- 表关系图(table): 数据库表结构层，体现表、字段、主键、外键和表间关联基数。",
].join("\n");

const DESIGN_MODEL_SCHEMA_INSTRUCTIONS = [
  "设计图类型结构约束：",
  "- sequence: 必须包含 participants, messages, fragments。",
  "  participants[].字段：id, name, participantType(actor|boundary|control|entity|service|database|external), description(可选)。",
  "  messages[].字段：id, type(sync|async|return|create|destroy), sourceId, targetId, name, parameters(string[]), returnValue(可选), condition(可选), description(可选)。",
  "  fragments[].字段：id, type(alt|opt|loop|par), label, messageIds(string[]), condition(可选), description(可选)。",
  "- activity/class/deployment 必须沿用需求阶段对应图的强类型字段，不允许输出通用 nodes/relations 旧结构。",
  "- table: 必须包含 tables, relationships。",
  "  tables[].字段：id, name, description(可选), columns(array)。",
  "  columns[].字段：id, name, dataType, isPrimaryKey(boolean), isForeignKey(boolean), nullable(boolean), references(可选), description(可选)。",
  "  references 字段：tableId, columnId。",
  "  relationships[].字段：id, type(one-to-one|one-to-many|many-to-many), sourceTableId, targetTableId, sourceColumnId(可选), targetColumnId(可选), label(可选), description(可选)。",
  "- activity 表达业务逻辑层，不表达页面跳转说明。",
  "- class 表达静态结构层，类应包含操作；接口、服务、实体、聚合根要通过 classKind 或 stereotype 标明。",
  "- deployment 表达物理部署层，优先体现 K8s Pod、服务、数据库、外部系统及通信协议。",
  "- table 表达数据库表关系，必须从设计类图和顺序图中推导表、主键、外键与关联基数。",
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
    "- 需求阶段活动图 + 设计阶段顺序图 -> 设计阶段活动图（界面关系，业务逻辑层）。",
    "- 需求阶段类图 + 设计阶段顺序图 -> 设计阶段类图（设计类图）。",
    "- 需求阶段部署图 + 设计阶段顺序图 -> 设计阶段部署图（部署模型）。",
    "- 设计阶段类图 + 设计阶段顺序图 -> 设计阶段表关系图。",
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

const CODE_GENERATION_SEMANTICS = [
  "代码生成阶段职责：",
  "- 第一版只生成可运行的前端原型，不生成真实后端、数据库迁移或完整仓库补丁。",
  "- 外层代码页属于 UML 实验平台，但 Sandpack 内生成的业务原型必须契合用户需求背景，而不是套用 UML 实验平台视觉风格。",
  "- 必须从 requirementText、需求规则和设计模型推导业务主题、领域文案、信息架构和视觉语言；校园活动、医疗预约、仓储管理、图书借阅、在线商城等应呈现不同 UI 气质。",
  "- 生成的业务原型要低噪声、可读、可操作，不要营销页式空壳；但不要强制蓝色、低饱和或工程工作台风格，除非需求背景本身适合。",
  "- 顺序图(sequence) -> 用户操作流程、事件处理函数、API/mock 调用顺序。",
  "- 设计类图(class) -> TypeScript types、domain model、service 层、状态结构。",
  "- 活动图(activity) -> 页面流、路由、条件渲染、表单状态机。",
  "- 表关系图(table) -> mock 数据结构、列表/详情字段、CRUD 表单字段。",
  "- 部署图(deployment) -> 前端环境提示和接口边界，不生成真实后端部署代码。",
].join("\n");

export function buildGenerateCodeSpecPrompt(
  requirementText: string,
  rules: RequirementRule[],
  designModels: DesignDiagramModelSpec[],
) {
  return [
    "请根据设计阶段 UML 结构化模型生成前端原型代码规格。",
    "返回 JSON 对象，格式必须是 {\"spec\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "spec 字段结构：",
    "- appName: 原型应用名称。",
    "- summary: 原型覆盖的核心业务闭环。",
    "- theme: name, primaryColor, backgroundColor, surfaceColor, textColor, accentColor, density(compact|comfortable), tone。",
    "- pages[]: id, name, route, purpose, sourceDiagramIds。",
    "- components[]: id, name, responsibility, sourceDiagramIds。",
    "- interactions[]: id, trigger, behavior, sourceDiagramIds。",
    "- dataEntities[]: id, name, fields[{name,type,required}], sourceDiagramIds。",
    "- implementationNotes[]: 面向代码生成的简短注意事项。",
    "sourceDiagramIds 应引用设计模型中的元素 id、消息 id、表 id、类 id 或图类型名，便于溯源。",
    "theme 必须描述业务领域主题，例如医疗、校园、仓储、商城、图书馆等，而不是 UML 实验平台主题。",
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
    "",
    "设计阶段模型：",
    JSON.stringify(designModels, null, 2),
  ].join("\n");
}

export function buildGenerateCodeAppBlueprintPrompt(
  requirementText: string,
  rules: RequirementRule[],
  designModels: DesignDiagramModelSpec[],
) {
  return [
    "请作为产品架构师，根据需求、规则和设计模型规划前端原型的业务应用蓝图。",
    "返回 JSON 对象，格式必须是 {\"appBlueprint\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "appBlueprint 字段结构：",
    "- appName: 业务原型应用名称，必须贴合需求背景。",
    "- domain: 业务领域，例如校园活动、医疗预约、仓储管理、图书借阅、在线商城等。",
    "- targetUsers[]: 目标用户或角色，来自需求和用例。",
    "- coreWorkflow: 原型覆盖的核心业务闭环。",
    "- pages[]: 2 到 6 个页面，默认 3 到 5 个；字段为 id, name, route, purpose, sourceDiagramIds。",
    "- successCriteria[]: 原型体验验收标准。",
    "页面必须包含首页/总览页、核心流程页、详情或管理页；简单需求至少 2 页，复杂需求最多 6 页。",
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
    "",
    "设计阶段模型：",
    JSON.stringify(designModels, null, 2),
  ].join("\n");
}

export function buildGenerateCodeUiBlueprintPrompt(
  codeContext: unknown,
  appBlueprint: CodeAppBlueprint,
) {
  return [
    "请作为产品界面设计师，为前端原型制定界面方案。",
    "返回 JSON 对象，格式必须是 {\"uiBlueprint\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "uiBlueprint 字段结构：",
    "- theme: name, primaryColor, backgroundColor, surfaceColor, textColor, accentColor, density(compact|comfortable), tone。",
    "- visualLanguage: 业务视觉语言，说明为什么适合当前领域。",
    "- navigationModel: 页面导航和主要任务入口组织方式。",
    "- layoutPrinciples[]: 布局原则，必须服务于业务操作效率。",
    "- componentGuidelines[]: 表格、表单、状态、详情、列表等组件风格规则。",
    "- stateGuidelines[]: 空状态、加载、错误、成功、选中态等页面状态规则。",
    "避免空壳营销页、单调卡片堆叠和 UML 实验平台默认工作台风格。",
    "",
    "精简代码上下文：",
    JSON.stringify(codeContext, null, 2),
    "",
    "应用蓝图：",
    JSON.stringify(appBlueprint, null, 2),
  ].join("\n");
}

export function buildGenerateCodeUiMockupPrompt(
  codeContext: unknown,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
) {
  const prompt = [
    "为线上前端原型生成一张高保真主界面设计图，16:9 桌面应用画幅。",
    "这张图将作为后续 React 原型实现的视觉参考，请直接生成图片，不要输出解释文字。",
    "提示词必须控制在图片模型可接受长度内，因此以下上下文已做摘要裁剪；优先服从应用蓝图和界面方案。",
    "",
    "draw-ui 风格约束：",
    "- 先表达整体产品气质和业务场景，再表达页面信息层级。",
    "- 使用真实、具体、贴合业务的示例数据，不要用 lorem ipsum 或空白占位。",
    "- 避免像素级标注、网格线、线框图、流程图、UML 图和设计规范说明文字。",
    "- 避免空壳营销页、泛化仪表盘、单调卡片堆叠和实验平台默认工作台风格。",
    "- 画面必须包含清晰导航、核心业务区域、关键列表或表格、状态反馈和至少一个主要操作入口。",
    "- 如果业务更适合管理系统，应呈现专业应用界面，而不是宣传页。",
    "",
    "应用蓝图：",
    stringifyForPrompt(appBlueprint, 7000),
    "",
    "界面方案：",
    stringifyForPrompt(uiBlueprint, 6000),
    "",
    "界面上下文摘要：",
    stringifyForPrompt(compactCodeContextForUiMockup(codeContext), 12000),
  ].join("\n");

  return truncateForPrompt(prompt, UI_MOCKUP_PROMPT_CHAR_LIMIT);
}

export function buildAnalyzeCodeUiMockupPrompt(
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
) {
  return [
    "请分析随消息一起提供的界面设计图，并提取可直接约束 React 原型实现的视觉参考规格。",
    "返回 JSON 对象，格式必须是 {\"uiReferenceSpec\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "uiReferenceSpec 字段结构：",
    "- layoutStructure[]: 从外到内描述页面布局、分区、左右/上下结构、主内容组织。",
    "- navigation: 导航位置、形态、当前项表现和主要入口。",
    "- colorPalette[]: 可观察到的主色、背景色、强调色、文字色和状态色。",
    "- componentShapes[]: 卡片、表格、按钮、筛选器、统计块、表单等组件形态。",
    "- informationDensity: 信息密度、留白、列表/表格密度和视觉节奏。",
    "- keyBusinessAreas[]: 图中最重要的业务区域和它们承载的数据。",
    "- stateExpressions[]: 选中、完成、警告、空态、进度等状态表达。",
    "- implementationGuidelines[]: 面向代码实现的具体约束，必须能落到 CSS/组件/布局。",
    "- fallbackReason: 正常解析时为 null；如果看不到图片，说明降级原因。",
    "",
    "应用蓝图：",
    stringifyForPrompt(appBlueprint, 5000),
    "",
    "文字界面方案：",
    stringifyForPrompt(uiBlueprint, 5000),
  ].join("\n");
}

export function buildGenerateCodeDesignTokensPrompt(
  codeContext: unknown,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  uiReferenceSpec: CodeUiReferenceSpec | null,
) {
  return [
    "请为前端业务原型生成结构化设计 Token。",
    "返回 JSON 对象，格式必须是 {\"designTokens\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "designTokens 字段结构：",
    "- colors: token 名到颜色值的映射，必须包含 primary, background, surface, text, accent, success, warning, danger。",
    "- typography: token 名到字体/字号/字重描述的映射，必须包含 body, heading, label。",
    "- spacing: token 名到 CSS 尺寸的映射，必须包含 1, 2, 3, 4, 6, 8。",
    "- radius: token 名到 CSS 圆角的映射，必须包含 sm, md, lg。",
    "- shadow: token 名到阴影值的映射，至少包含 sm, md。",
    "- density: compact 或 comfortable。",
    "Token 必须服务于业务领域，不要复制 UML 实验平台默认工作台视觉。",
    "",
    "精简代码上下文：",
    stringifyForPrompt(codeContext, 8000),
    "",
    "应用蓝图：",
    stringifyForPrompt(appBlueprint, 4000),
    "",
    "界面方案：",
    stringifyForPrompt(uiBlueprint, 4000),
    "",
    "界面设计图视觉解析（仅作补充）：",
    stringifyForPrompt(uiReferenceSpec, 4000),
  ].join("\n");
}

export function buildGenerateCodeComponentRegistryPrompt(
  codeContext: unknown,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
) {
  return [
    "请为前端业务原型生成可控组件 Registry。",
    "返回 JSON 对象，格式必须是 {\"componentRegistry\":{\"components\":[...]}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "第一版组件必须覆盖并优先使用以下组件名：",
    "WorkspaceShell, SidebarNav, TopBar, MetricCard, DataTable, StatusBadge, FilterBar, ActionButton, DetailPanel, EmptyState。",
    "",
    "每个组件字段：",
    "- name: 组件名。",
    "- description: 组件职责。",
    "- props[]: 允许的 props 名称。",
    "- variants[]: 允许的变体。",
    "- usageRules[]: 使用规则，说明何时用、避免什么误用。",
    "Registry 的作用是约束代码生成，禁止后续代码阶段重新发明不必要的一次性 UI 组件。",
    "",
    "精简代码上下文：",
    stringifyForPrompt(codeContext, 8000),
    "",
    "应用蓝图：",
    stringifyForPrompt(appBlueprint, 4000),
    "",
    "界面方案：",
    stringifyForPrompt(uiBlueprint, 4000),
  ].join("\n");
}

export function buildGenerateCodeUiIrPrompt(
  codeContext: unknown,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  uiMockup: CodeUiMockup | null,
  uiReferenceSpec: CodeUiReferenceSpec | null,
) {
  return [
    "请生成前端原型的结构化 UI IR，用于直接约束 React 代码生成。",
    "返回 JSON 对象，格式必须是 {\"uiIr\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    CODE_GENERATION_SEMANTICS,
    "",
    "uiIr 字段结构：",
    "- designTokens: colors, typography, spacing, radius, shadow, density。",
    "- componentRegistry: components[]，必须覆盖 WorkspaceShell, SidebarNav, TopBar, MetricCard, DataTable, StatusBadge, FilterBar, ActionButton, DetailPanel, EmptyState。",
    "- pages[]: id, route, name, layout, primaryActions[], componentTree。",
    "- componentTree: component, purpose, props, dataBinding, tokenRefs[], children[]。",
    "- dataBindings[]: 描述组件如何绑定 mock data/entity fields。",
    "- interactions[]: tab, filter, dialog, selection, form submit 等交互。",
    "- responsiveRules[]: desktop/tablet/mobile 下的布局规则。",
    "",
    "严格约束：",
    "- pages 必须覆盖应用蓝图中的所有页面 route。",
    "- componentTree 只能使用 componentRegistry 中声明的组件名。",
    "- tokenRefs 必须引用 designTokens 中存在的 token 名，例如 colors.primary、spacing.4、radius.md。",
    "- UI IR 是代码生成主约束，界面设计图视觉解析只作为补充，不得覆盖页面树结构。",
    "- 不要生成营销落地页结构；管理/业务系统应优先体现导航、数据区、筛选、状态和主要操作。",
    "",
    "精简代码上下文：",
    stringifyForPrompt(codeContext, 10000),
    "",
    "应用蓝图：",
    stringifyForPrompt(appBlueprint, 5000),
    "",
    "界面方案：",
    stringifyForPrompt(uiBlueprint, 5000),
    "",
    "界面设计图摘要：",
    stringifyForPrompt(
      uiMockup
        ? {
            status: uiMockup.status,
            model: uiMockup.model,
            summary: uiMockup.summary,
            imageUrl: uiMockup.imageUrl,
            hasImageData: Boolean(uiMockup.imageDataUrl),
            errorMessage: uiMockup.errorMessage,
          }
        : null,
      4000,
    ),
    "",
    "界面设计图视觉解析（仅作补充）：",
    stringifyForPrompt(uiReferenceSpec, 5000),
  ].join("\n");
}

export function buildGenerateCodeFilePlanPrompt(
  codeContext: unknown,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  uiMockup: CodeUiMockup | null,
  uiReferenceSpec: CodeUiReferenceSpec | null,
  uiIr: CodeUiIr | null,
  existingFiles: Record<string, string>,
) {
  return [
    "请作为 React 文件架构师，为 Sandpack 前端原型规划文件树。",
    "返回 JSON 对象，格式必须是 {\"filePlan\":{\"entryFile\":\"/src/App.tsx\",\"files\":[...]}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "文件计划要求：",
    "- files[] 每项包含 path, kind, responsibility。",
    "- kind 只能是 entry、page、component、domain、data、style、lib。",
    "- 必须包含 /src/App.tsx、/src/components/WorkspaceShell.tsx、/src/domain/types.ts、/src/data/mock-data.ts、/src/styles.css。",
    "- 必须包含至少 2 个 /src/pages/* 页面文件，默认 3 到 5 个页面。",
    "- 必须包含至少 3 个 /src/components/* 组件文件。",
    "- 可以按需求新增 /src/features/* 或 /src/lib/*，但所有 import 必须可解析。",
    "- 禁止把主要 UI 全塞进 /src/App.tsx 或单个 /src/components/WorkspaceShell.tsx。",
    "- 不要生成 /index.html 或 /src/main.tsx，服务端已经提供稳定骨架。",
    "- 如果存在 UI IR，文件计划必须覆盖 UI IR 中的页面、组件和样式 token 文件需求。",
    "",
    "精简代码上下文：",
    JSON.stringify(codeContext, null, 2),
    "",
    "应用蓝图：",
    JSON.stringify(appBlueprint, null, 2),
    "",
    "界面方案：",
    JSON.stringify(uiBlueprint, null, 2),
    "",
    "界面设计图摘要：",
    JSON.stringify(
      uiMockup
        ? {
            status: uiMockup.status,
            model: uiMockup.model,
            summary: uiMockup.summary,
            imageUrl: uiMockup.imageUrl,
            hasImageData: Boolean(uiMockup.imageDataUrl),
            errorMessage: uiMockup.errorMessage,
          }
        : null,
      null,
      2,
    ),
    "",
    "界面设计图视觉解析：",
    JSON.stringify(uiReferenceSpec, null, 2),
    "",
    "结构化 UI IR（主约束）：",
    JSON.stringify(uiIr, null, 2),
    "",
    "当前文件：",
    JSON.stringify(Object.keys(existingFiles), null, 2),
  ].join("\n");
}

export function buildGenerateCodeFilesPrompt(
  spec: CodeGenerationSpec,
  requirementText: string,
  rules: RequirementRule[],
  designModels: DesignDiagramModelSpec[],
) {
  return [
    "请根据前端原型代码规格生成 Sandpack 可运行文件集合。",
    "返回 JSON 对象，格式必须是 {\"bundle\":{\"files\":{},\"entryFile\":\"/src/App.tsx\",\"dependencies\":{}}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "技术约束：",
    "- 生成 React + TypeScript + Tailwind 代码。",
    "- files 至少包含 /src/App.tsx、/src/components/WorkspaceShell.tsx、/src/domain/types.ts、/src/data/mock-data.ts、/src/styles.css。",
    "- entryFile 必须是 /src/App.tsx。",
    "- dependencies 只列运行原型必需依赖，默认可使用 react、react-dom、lucide-react。",
    "- 不要使用真实网络请求；用 mock-data.ts 表达从表关系图/类图推导的数据。",
    "- UI 主题必须使用 spec.theme，并契合需求背景；不要使用 UML 实验平台风格作为业务原型主题。",
    "- 所有代码必须完整，不要省略 import、类型、组件实现或样式。",
    "",
    "代码规格：",
    JSON.stringify(spec, null, 2),
    "",
    "原始需求：",
    requirementText,
    "",
    "需求规则：",
    JSON.stringify(rules, null, 2),
    "",
    "设计阶段模型：",
    JSON.stringify(designModels, null, 2),
  ].join("\n");
}

export function buildGenerateCodeAgentPlanPrompt(
  codeContext: unknown,
  existingFiles: Record<string, string>,
) {
  return [
    "请为前端原型生成任务制定一个简短文件实现计划。",
    "返回 JSON 对象，格式必须是 {\"plan\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "计划要求：",
    "- 3 到 6 步。",
    "- 面向文件实施，不要写空泛方法论。",
    "- 计划必须体现模块化文件结构：App、components、domain/types、data/mock-data，必要时包含 features 或 lib。",
    "- 第一版只生成可运行前端原型。",
    "",
    "精简代码上下文：",
    JSON.stringify(codeContext, null, 2),
    "",
    "当前文件：",
    JSON.stringify(Object.keys(existingFiles), null, 2),
  ].join("\n");
}

export function buildGenerateCodeFileOperationsPrompt(
  codeContext: unknown,
  agentPlan: string[],
  existingFiles: Record<string, string>,
  generationContext?: {
    appBlueprint?: CodeAppBlueprint | null;
    uiBlueprint?: CodeUiBlueprint | null;
    uiMockup?: CodeUiMockup | null;
    uiReferenceSpec?: CodeUiReferenceSpec | null;
    uiIr?: CodeUiIr | null;
    filePlan?: CodeFilePlan | null;
    qualityIssues?: string[];
  },
) {
  return [
    "请作为资深 React 实现工程师，根据计划生成或更新前端原型文件。",
    "返回 JSON 对象，格式必须是 {\"operations\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "operation 支持：",
    "- 每个操作必须使用字段 operation，不能使用 type、action、op、kind。",
    "- 为兼容结构化输出，每个 operation 对象都必须包含 operation, path, content, reason, message 五个字段；不适用字段填空字符串。",
    "- create_file: operation=\"create_file\", path, content, reason；message 填空字符串。",
    "- update_file: operation=\"update_file\", path, content, reason；message 填空字符串。",
    "- set_entry_file: operation=\"set_entry_file\", path, reason；content 和 message 填空字符串。",
    "- note: operation=\"note\", message；path、content、reason 填空字符串。",
    "",
    "文件要求：",
    "- 必须生成或更新 /src/App.tsx、/src/components/WorkspaceShell.tsx、/src/domain/types.ts、/src/data/mock-data.ts、/src/styles.css。",
    "- 必须生成或更新文件计划中的所有 /src/pages/* 和 /src/components/* 文件。",
    "- 如果存在界面设计图视觉解析，必须优先贴合其中的布局、颜色、组件形态、信息密度和业务区域；不要只生成默认后台工作台。",
    "- 如果存在 UI IR，必须优先按 uiIr.pages[].componentTree 生成页面结构，只能使用 componentRegistry 中的组件语义，不要在代码阶段重新设计整体布局。",
    "- 如果存在 designTokens，/src/styles.css 必须定义并使用 CSS variables，例如 --color-primary、--space-3、--radius-md。",
    "- 至少 2 个页面文件、至少 3 个组件文件；默认做 3 到 5 个页面。",
    "- 可以按需求新增 /src/components/*、/src/pages/*、/src/features/*、/src/lib/*，但必须保证所有 import 都能解析。",
    "- 不要生成 /index.html 或 /src/main.tsx，服务端已经提供稳定骨架。",
    "- 代码必须完整可运行，不要省略 import、类型、组件实现或样式。",
    "- 不要使用真实网络请求，使用 /src/data/mock-data.ts。",
    "- UI 必须契合需求背景主题，不能默认套 UML 实验平台风格。",
    "- 不要把主体界面塞进单个大组件；页面负责流程，组件负责复用展示。",
    "- App.tsx 应只负责挂载 WorkspaceShell，WorkspaceShell 负责导航和页面切换。",
    "",
    "生成计划：",
    JSON.stringify(agentPlan, null, 2),
    "",
    "应用蓝图：",
    JSON.stringify(generationContext?.appBlueprint ?? null, null, 2),
    "",
    "界面方案：",
    JSON.stringify(generationContext?.uiBlueprint ?? null, null, 2),
    "",
    "界面设计图摘要：",
    JSON.stringify(
      generationContext?.uiMockup
        ? {
            status: generationContext.uiMockup.status,
            model: generationContext.uiMockup.model,
            summary: generationContext.uiMockup.summary,
            imageUrl: generationContext.uiMockup.imageUrl,
            hasImageData: Boolean(generationContext.uiMockup.imageDataUrl),
            errorMessage: generationContext.uiMockup.errorMessage,
          }
        : null,
      null,
      2,
    ),
    "",
    "界面设计图视觉解析：",
    JSON.stringify(generationContext?.uiReferenceSpec ?? null, null, 2),
    "",
    "结构化 UI IR（主约束）：",
    JSON.stringify(generationContext?.uiIr ?? null, null, 2),
    "",
    "文件计划：",
    JSON.stringify(generationContext?.filePlan ?? null, null, 2),
    "",
    "需要修复的质量问题：",
    JSON.stringify(generationContext?.qualityIssues ?? [], null, 2),
    "",
    "精简代码上下文：",
    JSON.stringify(codeContext, null, 2),
    "",
    "当前文件内容：",
    JSON.stringify(existingFiles, null, 2),
  ].join("\n");
}

export function buildRepairCodeFileOperationsPrompt(
  codeContext: unknown,
  agentPlan: string[],
  existingFiles: Record<string, string>,
  previousOutput: string,
  parseError: string,
  generationContext?: {
    appBlueprint?: CodeAppBlueprint | null;
    uiBlueprint?: CodeUiBlueprint | null;
    uiMockup?: CodeUiMockup | null;
    uiReferenceSpec?: CodeUiReferenceSpec | null;
    uiIr?: CodeUiIr | null;
    filePlan?: CodeFilePlan | null;
    qualityIssues?: string[];
  },
) {
  return [
    "请修复下面不符合代码文件操作协议的 JSON 输出。",
    "返回 JSON 对象，格式必须是 {\"operations\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    "",
    "严格协议：",
    "- operations 是非空数组。",
    "- 每个操作必须包含 operation, path, content, reason, message 五个字段；不适用字段填空字符串。",
    "- operation 只能是 create_file、update_file、set_entry_file、note。",
    "- create_file/update_file 的 path、content、reason 必须非空，message 填空字符串。",
    "- set_entry_file 的 path、reason 必须非空，content 和 message 填空字符串。",
    "- note 的 message 必须非空，path、content、reason 填空字符串。",
    "- 禁止使用 type/action/op/kind 代替 operation。",
    "- 必须使用模块化路径：/src/App.tsx、/src/components/*、/src/domain/types.ts、/src/data/mock-data.ts、/src/styles.css。",
    "- 必须覆盖文件计划中的页面和组件文件，避免单文件大组件。",
    "- UI 内容和主题必须契合需求背景，并优先贴合界面设计图视觉解析，不要套 UML 实验平台风格。",
    "- 如果存在 UI IR，必须优先修复到 uiIr.pages[].componentTree、designTokens 和 componentRegistry 所表达的结构。",
    "",
    "生成计划：",
    JSON.stringify(agentPlan, null, 2),
    "",
    "应用蓝图：",
    JSON.stringify(generationContext?.appBlueprint ?? null, null, 2),
    "",
    "界面方案：",
    JSON.stringify(generationContext?.uiBlueprint ?? null, null, 2),
    "",
    "界面设计图摘要：",
    JSON.stringify(
      generationContext?.uiMockup
        ? {
            status: generationContext.uiMockup.status,
            model: generationContext.uiMockup.model,
            summary: generationContext.uiMockup.summary,
            imageUrl: generationContext.uiMockup.imageUrl,
            hasImageData: Boolean(generationContext.uiMockup.imageDataUrl),
            errorMessage: generationContext.uiMockup.errorMessage,
          }
        : null,
      null,
      2,
    ),
    "",
    "界面设计图视觉解析：",
    JSON.stringify(generationContext?.uiReferenceSpec ?? null, null, 2),
    "",
    "结构化 UI IR（主约束）：",
    JSON.stringify(generationContext?.uiIr ?? null, null, 2),
    "",
    "文件计划：",
    JSON.stringify(generationContext?.filePlan ?? null, null, 2),
    "",
    "需要修复的质量问题：",
    JSON.stringify(generationContext?.qualityIssues ?? [], null, 2),
    "",
    "精简代码上下文：",
    JSON.stringify(codeContext, null, 2),
    "",
    "当前文件内容：",
    JSON.stringify(existingFiles, null, 2),
    "",
    "上一次输出：",
    previousOutput,
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

export function buildVerifyCodeUiFidelityPrompt(
  uiReferenceSpec: CodeUiReferenceSpec,
  files: Record<string, string>,
  appBlueprint: CodeAppBlueprint | null,
): string {
  return [
    "请对照随消息一起提供的界面设计图，检查当前 React 原型代码是否还原了设计图的视觉语言和页面结构。",
    "返回 JSON 对象，格式必须是 {\"uiFidelityReport\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "uiFidelityReport 字段结构：",
    "- passed: 如果主要布局、导航、色彩、组件形态和业务信息层级都基本贴合则为 true，否则为 false。",
    "- matched[]: 已经在代码中体现的设计图特征。",
    "- missing[]: 明显没有还原或偏离设计图的特征。",
    "- repairSuggestions[]: 可直接指导下一轮代码修复的中文建议。",
    "- summary: 一句话中文总结。",
    "",
    "应用蓝图：",
    stringifyForPrompt(appBlueprint, 4000),
    "",
    "界面设计图视觉解析：",
    stringifyForPrompt(uiReferenceSpec, 6000),
    "",
    "当前原型文件：",
    stringifyForPrompt(files, 16000),
  ].join("\n");
}

function stringifyDocumentContext(value: unknown) {
  return truncateForPrompt(JSON.stringify(value, null, 2), 28000);
}

export function buildGenerateDocumentContentPrompt(
  documentKind: DocumentKind,
  context: unknown,
) {
  const isRequirements = documentKind === "requirementsSpec";
  const title = isRequirements ? "需求规格说明书" : "软件设计说明书";
  const hierarchy = isRequirements
    ? [
        "标题 1：项目引言、需求概述、需求规定、尚未解决的问题、附录。",
        "标题 2：编写目的、基线、定义与标识、参考资料、系统目标、用户特点、假定约束、功能需求、数据需求、运行需求、界面需求、其它需求。",
        "标题 3：用例 1/2/…、用例/对象/类关系、类描述、类关系、网络和设备需求、支持软件与部署需求、性能/安全/操作/其它约束。",
        "图位置：总体用例图、领域概念模型、网络拓扑图、界面关系图分别放到对应标题 2 或标题 3 小节。",
      ]
    : [
        "标题 1：引言、系统结构、设计、尚未设计的问题。",
        "标题 2：系统概述、基线、定义与标识、参考资料、网络与硬件配置、部署设计、交互设计、结构设计、界面设计、可追踪性设计、数据库设计、其它设计。",
        "标题 3：顺序图 1/2/…、对象与类的关系、类与类的关系、设计对象、设计类、界面关系、界面详细设计、用例与界面关系、类与表关系、数据表设计、安全/性能/其它限制设计。",
        "图位置：顺序图、设计类图、界面关系图、部署图、表关系图分别放到对应标题 2 或标题 3 小节。",
      ];

  return [
    `请根据平台当前产物生成《${title}》的结构化正文。`,
    "返回 JSON 对象，格式必须是 {\"sections\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "sections 每项字段：",
    "- level: 只能是 1、2、3，对应 Word 的标题 1、标题 2、标题 3。",
    "- title: 小节标题，不要包含 Markdown 符号。",
    "- body: 段落数组，每段为完整中文说明。",
    "- table: 可选，格式为 {headers:string[], rows:string[][]}。",
    "- diagramKind: 可选，用于标记该小节应插入哪类图，例如 usecase、class、activity、deployment、sequence、table。",
    "",
    "模板层级要求：",
    ...hierarchy,
    "",
    "写作要求：",
    "- 正文要像课程软件工程文档，不要写成运行报告或聊天总结。",
    "- 必须保留标题 1、标题 2、标题 3 的完整层级，不要只生成一级标题。",
    "- 表格内容必须来自需求规则、模型、类、表、接口或图产物，不要虚构无法追溯的系统能力。",
    "- 缺失信息可以写“当前阶段未明确”，但不要阻塞整篇文档。",
    "",
    "当前产物上下文：",
    stringifyDocumentContext(context),
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
