// Owns document context shaping and section normalization before DOCX rendering.
import {
  documentContentResultSchema,
  type DocumentKind,
  type DocumentSection,
  type StartDocumentRunRequest,
} from "@uml-platform/contracts";

export function documentTitle(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? "需求规格说明书"
    : "软件设计说明书";
}

export function expectedDocumentDiagramKinds(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? ["usecase", "class", "deployment", "activity"]
    : ["sequence", "class", "activity", "deployment", "table"];
}

export function buildDocumentContext(input: StartDocumentRunRequest) {
  return {
    documentKind: input.documentKind,
    requirementText: input.requirementText,
    rules: input.rules,
    requirementModels: input.requirementModels,
    requirementPlantUml: input.requirementPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSource: Boolean(artifact.source),
    })),
    requirementSvgArtifacts: input.requirementSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSvg: Boolean(artifact.svg),
    })),
    designModels: input.designModels,
    designPlantUml: input.designPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSource: Boolean(artifact.source),
    })),
    designSvgArtifacts: input.designSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSvg: Boolean(artifact.svg),
    })),
  };
}

export function fallbackDocumentSections(input: StartDocumentRunRequest): DocumentSection[] {
  if (input.documentKind === "requirementsSpec") {
    const useCases = input.requirementModels
      .filter((model) => model.diagramKind === "usecase")
      .flatMap((model) => ("useCases" in model ? model.useCases : []));
    return documentContentResultSchema.parse({
      sections: [
        { level: 1, title: "1 项目引言", body: [] },
        { level: 2, title: "1.1 编写目的", body: ["本文档用于描述系统需求范围、功能需求、数据需求、运行需求和约束条件，为后续设计、实现和测试提供依据。"] },
        { level: 2, title: "1.2 基线", body: ["本文档以当前需求文本、需求规则和已生成的需求模型为基线。"] },
        { level: 2, title: "1.3 定义与标识", body: ["本文档中的用例、类、活动和部署节点均来自平台生成的结构化模型。"] },
        { level: 2, title: "1.4 参考资料", body: ["参考资料包括用户输入的原始需求、需求规则、UML 模型和图像产物。"] },
        { level: 1, title: "2 需求概述", body: [] },
        { level: 2, title: "2.1 系统目标", body: [input.requirementText] },
        { level: 2, title: "2.2 用户的特点", body: ["用户角色根据用例模型中的参与者识别，具体职责见功能需求小节。"] },
        { level: 2, title: "2.3 假定的约束", body: ["当前阶段未明确的外部约束在后续评审中补充。"] },
        { level: 1, title: "3 需求规定", body: [] },
        { level: 2, title: "3.1 功能需求", body: ["总体功能需求由用例模型和需求规则共同描述。"], diagramKind: "usecase" },
        ...useCases.slice(0, 8).map((useCase, index) => ({
          level: 3 as const,
          title: `3.1.${index + 1} 用例${index + 1}：${useCase.name}（${useCase.id}）`,
          body: [
            `简要描述：${useCase.goal}`,
            `前置条件：${useCase.preconditions.join("；") || "当前阶段未明确"}`,
            `后置条件：${useCase.postconditions.join("；") || "当前阶段未明确"}`,
          ],
        })),
        { level: 2, title: "3.2 数据需求", body: ["数据需求由领域概念模型中的对象、类和关系描述。"], diagramKind: "class" },
        { level: 3, title: "3.2.1 用例、对象与类的关系", body: ["用例与对象、类的关系依据用例模型和类模型追踪。"] },
        { level: 3, title: "3.2.2 类的描述", body: ["类的属性、操作和职责见领域概念模型。"] },
        { level: 3, title: "3.2.3 类与类的关系", body: ["类之间的关联、继承、聚合或组合关系见领域概念模型。"] },
        { level: 2, title: "3.3 运行需求", body: [], diagramKind: "deployment" },
        { level: 3, title: "3.3.1 网络和设备需求", body: ["网络拓扑和设备需求依据部署模型描述。"] },
        { level: 3, title: "3.3.2 支持软件与部署需求", body: ["支持软件与部署约束依据部署节点和组件关系描述。"] },
        { level: 2, title: "3.4 界面需求", body: ["界面关系图描述主要界面状态和跳转关系。"], diagramKind: "activity" },
        { level: 2, title: "3.5 其它需求", body: [] },
        { level: 3, title: "3.5.1 性能需求", body: ["当前阶段未明确。"] },
        { level: 3, title: "3.5.2 安全需求", body: ["当前阶段未明确。"] },
        { level: 3, title: "3.5.3 操作需求", body: ["当前阶段未明确。"] },
        { level: 3, title: "3.5.4 其它需求约束", body: ["当前阶段未明确。"] },
        { level: 1, title: "4 尚未解决的问题", body: ["当前阶段未明确。"] },
        { level: 1, title: "附录", body: [] },
        { level: 2, title: "附录A:术语表", body: ["术语表将在后续评审中补充。"] },
        { level: 2, title: "附录B:需求原始资料", body: [input.requirementText] },
      ],
    }).sections;
  }

  return documentContentResultSchema.parse({
    sections: [
      { level: 1, title: "1 引言", body: [] },
      { level: 2, title: "1.1 系统概述", body: [input.requirementText] },
      { level: 2, title: "1.2 基线", body: ["本文档以当前需求模型、设计模型和设计图为基线。"] },
      { level: 2, title: "1.3 定义与标识", body: ["设计对象、设计类、顺序图和数据库表均来自平台生成的设计阶段产物。"] },
      { level: 2, title: "1.4 参考资料", body: ["参考资料包括需求规格、需求模型、设计模型和 UML 图像产物。"] },
      { level: 1, title: "2 系统结构", body: [] },
      { level: 2, title: "2.1 网络与硬件配置", body: ["网络与硬件配置依据部署设计模型描述。"], diagramKind: "deployment" },
      { level: 2, title: "2.2 部署设计", body: ["部署设计描述组件、节点、数据库和外部系统之间的关系。"], diagramKind: "deployment" },
      { level: 2, title: "2.3 其它约束", body: ["当前阶段未明确。"] },
      { level: 1, title: "3 设计", body: [] },
      { level: 2, title: "3.1 交互设计", body: ["交互设计通过顺序图描述参与者、对象和服务之间的时序消息。"], diagramKind: "sequence" },
      { level: 3, title: "3.1.1 顺序图1：编号：名称", body: ["顺序图展示主要用例的对象协作和消息顺序。"], diagramKind: "sequence" },
      { level: 2, title: "3.2 结构设计", body: ["结构设计通过设计类图描述对象、设计类及其关系。"], diagramKind: "class" },
      { level: 3, title: "3.2.1 对象与类的关系", body: ["对象与类的关系依据设计类图识别。"] },
      { level: 3, title: "3.2.2 类与类的关系", body: ["类与类之间的继承、关联、聚合、组合或依赖关系见设计类图。"] },
      { level: 3, title: "3.2.3 设计对象", body: ["设计对象来自顺序图参与者和设计类模型。"] },
      { level: 3, title: "3.2.4 设计类", body: ["设计类包含属性、操作、职责和依赖关系。"] },
      { level: 2, title: "3.3 界面设计", body: ["界面设计描述页面状态、跳转关系和界面职责。"], diagramKind: "activity" },
      { level: 3, title: "3.3.1 界面关系", body: ["界面关系图描述主要界面之间的跳转。"], diagramKind: "activity" },
      { level: 3, title: "3.3.2 界面详细设计", body: ["界面详细设计将在原型实现阶段补充。"] },
      { level: 2, title: "3.4 可追踪性设计", body: [] },
      { level: 3, title: "3.4.1 用例与界面的关系", body: ["用例与界面的关系依据需求活动模型和设计交互模型追踪。"] },
      { level: 3, title: "3.4.2 用例与对象、类的关系", body: ["用例与对象、类的关系依据顺序图和设计类图追踪。"] },
      { level: 2, title: "3.5 数据库设计", body: ["数据库设计依据表关系模型描述。"], diagramKind: "table" },
      { level: 3, title: "3.5.1 类与表的关系", body: ["持久类与表的映射关系见表关系图。"] },
      { level: 3, title: "3.5.2 数据表设计", body: ["数据表字段、主键、外键和引用关系见表关系图。"], diagramKind: "table" },
      { level: 2, title: "3.6其它设计", body: [] },
      { level: 3, title: "3.6.1安全设计", body: ["当前阶段未明确。"] },
      { level: 3, title: "3.6.2性能设计", body: ["当前阶段未明确。"] },
      { level: 3, title: "3.6.3其它限制设计", body: ["当前阶段未明确。"] },
      { level: 1, title: "4 尚未设计的问题", body: ["当前阶段未明确。"] },
    ],
  }).sections;
}

export function diagramPlantUmlForDocument(input: StartDocumentRunRequest) {
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementPlantUml
      : input.designPlantUml;
  return new Map(artifacts.map((artifact) => [artifact.diagramKind, artifact.source]));
}

export function diagramSvgKindsForDocument(input: StartDocumentRunRequest) {
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementSvgArtifacts
      : input.designSvgArtifacts;
  return new Set(artifacts.map((artifact) => artifact.diagramKind));
}

export function documentDiagramLabel(diagramKind: string) {
  const labels: Record<string, string> = {
    usecase: "总体用例图",
    class: "类图",
    activity: "流程与界面关系图",
    deployment: "部署图",
    sequence: "顺序图",
    table: "表关系图",
  };
  return labels[diagramKind] ?? "UML 图";
}

export function ensureDocumentDiagramSections(
  documentKind: DocumentKind,
  sections: DocumentSection[],
) {
  const existing = new Set(sections.map((section) => section.diagramKind).filter(Boolean));
  const additions = expectedDocumentDiagramKinds(documentKind)
    .filter((diagramKind) => !existing.has(diagramKind))
    .map((diagramKind) => ({
      level: 3 as const,
      title: `图示：${diagramKind}`,
      body: ["该图将在本小节展示。"],
      diagramKind,
    }));
  return documentContentResultSchema.parse({ sections: [...sections, ...additions] }).sections;
}

function replaceUnprovidedInstitutionNames(text: string, allowedSource: string) {
  return text.replace(/[\u4e00-\u9fa5]{2,}(?:大学|学院)/g, (match) =>
    allowedSource.includes(match) ? match : "待填写",
  );
}

export function sanitizeDocumentSections(
  input: StartDocumentRunRequest,
  sections: DocumentSection[],
) {
  const allowedSource = JSON.stringify(buildDocumentContext(input));
  return documentContentResultSchema.parse({
    sections: sections.map((section) => ({
      ...section,
      title: replaceUnprovidedInstitutionNames(section.title, allowedSource),
      body: section.body.map((paragraph) =>
        replaceUnprovidedInstitutionNames(paragraph, allowedSource),
      ),
      table: section.table
        ? {
            headers: section.table.headers.map((cell) =>
              replaceUnprovidedInstitutionNames(cell, allowedSource),
            ),
            rows: section.table.rows.map((row) =>
              row.map((cell) => replaceUnprovidedInstitutionNames(cell, allowedSource)),
            ),
          }
        : undefined,
    })),
  }).sections;
}
