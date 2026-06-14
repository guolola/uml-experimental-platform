// Owns document context shaping and section normalization before DOCX rendering.
import {
  documentContentResultSchema,
  type DesignDiagramModelSpec,
  type DiagramModelSpec,
  type DocumentKind,
  type DocumentSection,
  type StartDocumentRunRequest,
  type UseCaseDiagramSpec,
} from "@uml-platform/contracts";

export function documentTitle(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? "需求规格说明书"
    : "软件设计说明书";
}

export function expectedDocumentDiagramKinds(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? ["usecase", "class", "activity", "deployment", "prototype", "analysis"]
    : ["sequence", "class", "activity", "deployment", "table"];
}

function unknown(value = "当前阶段未明确。") {
  return value;
}

function compactJoin(values: Array<string | undefined>, fallback = "当前阶段未明确") {
  const filtered = values.map((value) => value?.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join("；") : fallback;
}

function useCaseModels(input: StartDocumentRunRequest): UseCaseDiagramSpec[] {
  return input.requirementModels.filter(
    (model): model is UseCaseDiagramSpec => model.diagramKind === "usecase",
  );
}

function requirementClassModel(input: StartDocumentRunRequest) {
  return input.requirementModels.find(
    (model): model is Extract<DiagramModelSpec, { diagramKind: "class" }> =>
      model.diagramKind === "class",
  );
}

function designClassModel(input: StartDocumentRunRequest) {
  return input.designModels.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "class" }> =>
      model.diagramKind === "class",
  );
}

function designSequenceModel(input: StartDocumentRunRequest) {
  return input.designModels.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
      model.diagramKind === "sequence",
  );
}

function sequenceModelIdForUseCaseId(useCaseId: string) {
  return `sequence:${useCaseId}`;
}

function designTableModel(input: StartDocumentRunRequest) {
  return input.designModels.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "table" }> =>
      model.diagramKind === "table",
  );
}

function pendingDesignTraceabilityRows(input: StartDocumentRunRequest) {
  return input.designModelTraceability
    .filter(
      (entry) =>
        entry.mappingSource === "auto-filled-pending-review" ||
        entry.reviewStatus === "pending",
    )
    .map((entry, index) => [
      String(index + 1),
      entry.source.modelId ?? entry.source.diagramKind,
      entry.source.label,
      entry.targets.map((target) => target.label).join("、"),
      entry.rationale ?? "系统自动补齐，需复核确认",
    ]);
}

function requirementUseCases(input: StartDocumentRunRequest): UseCaseDiagramSpec["useCases"] {
  const useCases = useCaseModels(input).flatMap((model) => model.useCases);
  return useCases.length > 0
    ? useCases
    : [
        {
          id: "UC-1",
          name: "名称",
          goal: "当前阶段未明确",
          description: "当前阶段未明确",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
          eventFlows: [],
        },
      ];
}

function useCaseActorIds(useCase: ReturnType<typeof requirementUseCases>[number]) {
  return [useCase.primaryActorId, ...useCase.supportingActorIds].filter(
    (actorId): actorId is string => Boolean(actorId),
  );
}

function requirementActors(input: StartDocumentRunRequest, actorIds: string[]) {
  const actors = useCaseModels(input).flatMap((model) => model.actors);
  const selected = actorIds
    .map((actorId) => actors.find((actor) => actor.id === actorId)?.name)
    .filter(Boolean);
  return selected.length > 0 ? selected : actors.map((actor) => actor.name);
}

function eventFlowTypeLabel(flowType: string) {
  if (flowType === "main") return "主事件流";
  if (flowType === "alternative") return "备选事件流";
  if (flowType === "exception") return "异常事件流";
  return "事件流";
}

function useCaseEventFlowBody(
  useCase: ReturnType<typeof requirementUseCases>[number],
) {
  if (!useCase.eventFlows || useCase.eventFlows.length === 0) {
    return [`事件流：${useCase.description ?? "当前阶段未明确"}`];
  }
  return useCase.eventFlows.flatMap((flow) => [
    `${eventFlowTypeLabel(flow.flowType)}：${flow.name}${
      flow.condition ? `（条件：${flow.condition}）` : ""
    }${flow.trigger ? `，触发：${flow.trigger}` : ""}`,
    ...flow.steps.map((step) => {
      const actorAction = step.actorAction ? `参与者：${step.actorAction}` : "";
      const systemAction = step.systemAction ? `系统：${step.systemAction}` : "";
      const expectedResult = step.expectedResult ? `结果：${step.expectedResult}` : "";
      return `步骤 ${step.order}：${[actorAction, systemAction, expectedResult]
        .filter(Boolean)
        .join("；")}`;
    }),
  ]);
}

function requirementClasses(input: StartDocumentRunRequest) {
  const model = requirementClassModel(input);
  return model && "classes" in model ? model.classes : [];
}

function designClasses(input: StartDocumentRunRequest) {
  const model = designClassModel(input);
  return model && "classes" in model ? model.classes : [];
}

function designTables(input: StartDocumentRunRequest) {
  const model = designTableModel(input);
  return model && "tables" in model ? model.tables : [];
}

function requirementUseCaseClassRows(input: StartDocumentRunRequest) {
  const classes = requirementClasses(input);
  return requirementUseCases(input).map((useCase, index) => [
    String(index + 1),
    useCase.name,
    compactJoin(requirementActors(input, useCaseActorIds(useCase)), "当前阶段未明确"),
    compactJoin(classes.map((item) => item.name), "当前阶段未明确"),
    compactJoin(
      input.rules
        .filter((rule) => rule.relatedDiagrams.includes("usecase"))
        .map((rule) => rule.id),
      "当前阶段未明确",
    ),
  ]);
}

function designUseCaseInterfaceRows(input: StartDocumentRunRequest) {
  return requirementUseCases(input).map((useCase, index) => [
    String(index + 1),
    useCase.name,
    "当前阶段未明确",
    "当前阶段未明确",
  ]);
}

function designUseCaseObjectClassRows(input: StartDocumentRunRequest) {
  const participants = designSequenceModel(input)?.participants ?? [];
  const classes = designClasses(input);
  return requirementUseCases(input).map((useCase, index) => [
    String(index + 1),
    useCase.name,
    compactJoin(participants.map((item) => item.name), "当前阶段未明确"),
    compactJoin(classes.map((item) => item.name), "当前阶段未明确"),
    "当前阶段未明确",
  ]);
}

function classTableRows(input: StartDocumentRunRequest) {
  const tables = designTables(input);
  const classes = designClasses(input).filter((item) =>
    ["entity", "aggregate"].includes(item.classKind ?? ""),
  );
  const persistentClasses = classes.length > 0 ? classes : designClasses(input);
  return (persistentClasses.length > 0 ? persistentClasses : [{ name: "当前阶段未明确" }]).map(
    (item, index) => [
      String(index + 1),
      item.name,
      tables[index]?.name ?? "当前阶段未明确",
      "当前阶段未明确",
    ],
  );
}

function tableDesignBody(input: StartDocumentRunRequest) {
  const tables = designTables(input);
  if (tables.length === 0) {
    return ["当前阶段未明确。"];
  }

  return tables.flatMap((table) => [
    `${table.name}：${table.description ?? "当前阶段未明确"}`,
    ...table.columns.map((column) => {
      const constraints = [
        column.isPrimaryKey ? "主键" : undefined,
        column.isForeignKey ? "外键" : undefined,
        column.nullable ? "可空" : "非空",
        column.references
          ? `引用 ${column.references.tableId}.${column.references.columnId}`
          : undefined,
      ].filter(Boolean);
      return `字段 ${column.name}，类型 ${column.dataType}，限制：${constraints.join("、") || "无"}。`;
    }),
  ]);
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
    canonicalSections: fallbackDocumentSections(input).map((section) => ({
      level: section.level,
      title: section.title,
      diagramKind: section.diagramKind,
      diagramModelId: section.diagramModelId,
      tableHeaders: section.table?.headers,
    })),
  };
}

export function fallbackDocumentSections(input: StartDocumentRunRequest): DocumentSection[] {
  if (input.documentKind === "requirementsSpec") {
    const useCases = requirementUseCases(input);
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
        { level: 2, title: "3.1 功能需求", body: ["总体功能需求说明。"], diagramKind: "usecase" },
        ...useCases.map((useCase, index) => ({
          level: 3 as const,
          title: `3.1.${index + 1} 用例${index + 1}：${useCase.name}（${useCase.id}）`,
          body: [
            `简要描述：${useCase.goal}`,
            `参与者：${compactJoin(requirementActors(input, useCaseActorIds(useCase)))}`,
            `前置条件：${useCase.preconditions.join("；") || "当前阶段未明确"}`,
            ...useCaseEventFlowBody(useCase),
            `后置条件：${useCase.postconditions.join("；") || "当前阶段未明确"}`,
            `其它：${compactJoin(
              input.rules
                .filter((rule) => rule.relatedDiagrams.includes("usecase"))
                .map((rule) => rule.id),
              "当前阶段未明确",
            )}`,
          ],
        })),
        { level: 2, title: "3.2 数据需求", body: ["数据需求由领域概念模型中的对象、类和关系描述。"], diagramKind: "class" },
        {
          level: 3,
          title: "3.2.1 用例、对象与类的关系",
          body: ["用例与对象、类的关系依据用例模型和领域概念模型追踪。"],
          table: {
            headers: ["编号", "用例名称", "对象", "类", "备注"],
            rows: requirementUseCaseClassRows(input),
          },
        },
        { level: 3, title: "3.2.2 类的描述", body: ["类的属性、操作和职责见领域概念模型。"] },
        { level: 3, title: "3.2.3 类与类的关系", body: ["类之间的关联、继承、聚合或组合关系见领域概念模型。"] },
        { level: 2, title: "3.3 运行需求", body: [] },
        { level: 3, title: "3.3.1 网络和设备需求", body: ["网络拓扑和设备需求依据部署需求模型描述。"], diagramKind: "deployment" },
        { level: 3, title: "3.3.2 支持软件与部署需求", body: ["支持软件与部署约束依据部署节点和组件关系描述。"] },
        { level: 2, title: "3.4 界面需求", body: ["原型界面关系描述主要界面、模块、入口点和跳转关系。"], diagramKind: "prototype" },
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
      { level: 2, title: "1.3 定义与标识", body: ["设计对象、设计类、用例实现设计和数据库表均来自平台生成的设计阶段产物。"] },
      { level: 2, title: "1.4 参考资料", body: ["参考资料包括需求规格、需求模型、设计模型和 UML 图像产物。"] },
      { level: 1, title: "2 系统结构", body: [] },
      { level: 2, title: "2.1 网络与硬件配置", body: ["网络与硬件配置依据部署设计模型描述。"] },
      { level: 2, title: "2.2 部署设计", body: ["部署设计描述组件、节点、数据库和外部系统之间的关系。"], diagramKind: "deployment" },
      { level: 2, title: "2.3 其它约束", body: ["当前阶段未明确。"] },
      { level: 1, title: "3 设计", body: [] },
      { level: 2, title: "3.1 交互设计", body: ["交互设计通过用例实现设计描述对象与对象、参与者与对象之间的关系。"] },
      ...requirementUseCases(input).map((useCase, index) => ({
        level: 3 as const,
        title: `3.1.${index + 1} 用例实现设计${index + 1}：${useCase.id}：${useCase.name}`,
        body: [
          `描述：${useCase.goal}`,
          "用例实现设计按时序说明消息内容、格式、目的，以及对发送对象与接收对象的影响。",
        ],
        diagramKind: "sequence",
        diagramModelId: sequenceModelIdForUseCaseId(useCase.id),
      })),
      { level: 2, title: "3.2 结构设计", body: ["结构设计通过设计类图描述对象、设计类及其关系。"], diagramKind: "class" },
      { level: 3, title: "3.2.1 对象与类的关系", body: ["对象与类的关系依据设计类图识别。"] },
      { level: 3, title: "3.2.2 类与类的关系", body: ["类与类之间的继承、关联、聚合、组合或依赖关系见设计类图。"] },
      { level: 3, title: "3.2.3 设计对象", body: ["设计对象来自用例实现设计参与者和设计类模型。"] },
      { level: 3, title: "3.2.4 设计类", body: ["设计类包含属性、操作、职责和依赖关系。"] },
      { level: 2, title: "3.3 界面关系设计", body: ["界面关系设计描述原型界面、模块、入口点和用例实现之间的跳转与状态流转。"], diagramKind: "activity" },
      { level: 3, title: "3.3.1 界面关系", body: ["界面关系图描述设计阶段的界面跳转、表单提交和状态流转。"], diagramKind: "activity" },
      { level: 3, title: "3.3.2 界面详细设计", body: ["界面详细设计将在原型实现阶段补充。"] },
      { level: 2, title: "3.4 可追踪性设计", body: [] },
      ...(pendingDesignTraceabilityRows(input).length > 0
        ? [
            {
              level: 3 as const,
              title: "3.4.0 需复核追踪关系",
              body: [
                "以下追踪关系由系统在 LLM 修复后自动补齐，仅用于保持链路完整，需人工复核后再视为确认结果。",
              ],
              table: {
                headers: ["编号", "设计模型", "设计元素", "关联需求元素", "备注"],
                rows: pendingDesignTraceabilityRows(input),
              },
            },
          ]
        : []),
      {
        level: 3,
        title: "3.4.1 用例与界面的关系",
        body: ["用例与界面的关系依据需求阶段原型界面关系和设计阶段界面关系图追踪。"],
        table: {
          headers: ["编号", "用例名称", "界面名称", "备注"],
          rows: designUseCaseInterfaceRows(input),
        },
      },
      {
        level: 3,
        title: "3.4.2 用例与对象、类的关系",
        body: ["用例与对象、类的关系依据用例实现设计和设计类图追踪。"],
        table: {
          headers: ["编号", "用例名称", "对象名称", "设计类名称", "备注"],
          rows: designUseCaseObjectClassRows(input),
        },
      },
      { level: 2, title: "3.5 数据库设计", body: ["数据库设计依据表关系模型描述。"], diagramKind: "table" },
      {
        level: 3,
        title: "3.5.1 类与表的关系",
        body: ["说明哪些类是持久类，以及这些类对应哪些表。"],
        table: {
          headers: ["编号", "类名（持久类）", "表名", "备注"],
          rows: classTableRows(input),
        },
      },
      { level: 3, title: "3.5.2 数据表设计", body: tableDesignBody(input), diagramKind: "table" },
      { level: 2, title: "3.6其它设计", body: [] },
      { level: 3, title: "3.6.1安全设计", body: ["当前阶段未明确。"] },
      { level: 3, title: "3.6.2性能设计", body: ["当前阶段未明确。"] },
      { level: 3, title: "3.6.3其它限制设计", body: ["当前阶段未明确。"] },
      { level: 1, title: "4 尚未设计的问题", body: ["当前阶段未明确。"] },
    ],
  }).sections;
}

const LEADING_NUMBER_PATTERN =
  /^\s*(?:第\s*)?\d+(?:\.\d+){0,2}(?:\s*[章节]\s*)?[\s.、：:-]*/;

function sectionKey(title: string) {
  return title
    .replace(LEADING_NUMBER_PATTERN, "")
    .replace(/\s+/g, "")
    .trim();
}

export function mergeDocumentSectionsWithTemplate(
  template: DocumentSection[],
  generated: DocumentSection[],
) {
  const generatedByTitle = new Map(
    generated.map((section) => [sectionKey(section.title), section]),
  );

  return documentContentResultSchema.parse({
    sections: template.map((section) => {
      const generatedSection = generatedByTitle.get(sectionKey(section.title));
      if (!generatedSection) {
        return section;
      }

      return {
        ...section,
            body:
              generatedSection.body.length > 0 ? generatedSection.body : section.body,
            diagramModelId: generatedSection.diagramModelId ?? section.diagramModelId,
            table: section.table
          ? {
              headers: section.table.headers,
              rows:
                generatedSection.table?.rows &&
                generatedSection.table.rows.length > 0
                  ? generatedSection.table.rows
                  : section.table.rows,
            }
          : generatedSection.table,
      };
    }),
  }).sections;
}

export function diagramPlantUmlForDocument(input: StartDocumentRunRequest) {
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementPlantUml
      : input.designPlantUml;
  return new Map(
    artifacts.map((artifact) => [
      artifact.modelId ?? artifact.diagramKind,
      artifact.source,
    ]),
  );
}

export function diagramSvgKindsForDocument(input: StartDocumentRunRequest) {
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementSvgArtifacts
      : input.designSvgArtifacts;
  return new Set(artifacts.map((artifact) => artifact.modelId ?? artifact.diagramKind));
}

export function documentDiagramLabel(diagramKind: string, sectionTitle?: string) {
  const title = sectionTitle?.replace(LEADING_NUMBER_PATTERN, "").trim();
  if (title) return title;
  const labels: Record<string, string> = {
    usecase: "总体用例图",
    class: "领域概念模型",
    activity: "总体业务流程",
    deployment: "部署需求模型",
    prototype: "原型界面关系",
    analysis: "需求分析模型",
    sequence: "用例实现设计",
    table: "数据库设计",
  };
  return labels[diagramKind] ?? "UML 图";
}

export function ensureDocumentDiagramSections(
  documentKind: DocumentKind,
  sections: DocumentSection[],
) {
  void documentKind;
  return documentContentResultSchema.parse({ sections }).sections;
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
