// Builds document content and PlantUML repair prompts for downstream API pipelines.
import type {
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DiagramKind,
  DiagramModelSpec,
  DocumentKind,
} from "@uml-platform/contracts";

function truncateForPrompt(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 32))}\n...（内容已截断）`;
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
        "标题 3：用例实现设计 1/2/…、对象与类的关系、类与类的关系、设计对象、设计类、界面关系、界面详细设计、用例与界面关系、类与表关系、数据表设计、安全/性能/其它限制设计。",
        "图位置：用例实现设计、设计类图、界面关系图、部署设计、数据库设计分别放到对应标题 2 或标题 3 小节。",
      ];

  return [
    `请根据平台当前产物生成《${title}》的结构化正文。`,
    "输出 JSON，必须符合接口 schema。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "必须严格按照当前产物上下文 canonicalSections 中给出的标题、顺序和层级返回 sections。",
    "不得删除、合并、重排、改名或新增章节；如果内容不足，保留章节并写“当前阶段未明确”。",
    "如果 canonicalSections 指定 tableHeaders，必须为该章节返回 table，headers 必须与 tableHeaders 完全一致。",
    "如果 canonicalSections 指定 diagramKind，只需保留该小节正文；图像由平台在固定位置插入，不要另建图示小节。",
    "",
    "模板层级要求：",
    ...hierarchy,
    "",
    "写作要求：",
    "- 正文要像课程软件工程文档，不要写成运行报告或聊天总结。",
    "- 必须保留标题 1、标题 2、标题 3 的完整层级，不要只生成一级标题。",
    "- 不得出现具体大学、学院、教师、班级、学号、姓名等未由用户输入明确提供的真实机构或个人信息。",
    "- 模板类字段缺失时统一写“待填写”，需求或设计事实缺失时统一写“当前阶段未明确”。",
    "- 表格内容必须来自已确认需求项、模型、类、表、接口或图产物，不要虚构无法追溯的系统能力。",
    "- 缺失信息可以写“当前阶段未明确”，但不要阻塞整篇文档。",
    "",
    "当前产物上下文：",
    stringifyDocumentContext(context),
  ].join("\n");
}

export function buildRepairDocumentContentPrompt(
  documentKind: DocumentKind,
  context: unknown,
  previousOutput: string,
  errorMessage: string,
) {
  const title =
    documentKind === "requirementsSpec" ? "需求规格说明书" : "软件设计说明书";

  return [
    `请修复《${title}》正文生成结果的 JSON 结构。`,
    "你是说明书结构化正文修复助手。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"sections\":[...]}。",
    "必须严格按照当前产物上下文 canonicalSections 中给出的标题、顺序和层级返回 sections。",
    "不得删除、合并、重排、改名或新增章节；如果内容不足，保留章节并写“当前阶段未明确”。",
    "如果 canonicalSections 指定 tableHeaders，必须为该章节返回 table，headers 必须与 tableHeaders 完全一致。",
    "",
    "sections 每项字段：",
    "- level: 只能是 1、2、3。",
    "- title: 小节标题，不要包含 Markdown 符号。",
    "- body: 段落数组，每段为完整中文说明。",
    "- table: 可选，格式为 {headers:string[], rows:string[][]}。",
    "- diagramKind: 可选，只能标记已有图产物对应的小节。",
    "",
    "必须保留上一轮输出中可用的文档内容，但要修复 JSON 语法、字段类型、缺失字段和 schema 不匹配问题。",
    "如果某些内容无法安全还原，使用“当前阶段未明确”，不要虚构无法追溯的能力。",
    "",
    "解析或校验错误：",
    errorMessage,
    "",
    "上一轮原始输出：",
    truncateForPrompt(previousOutput, 16000),
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
    "输出 JSON，必须符合接口 schema；不要输出 Markdown、解释或代码围栏。",
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
