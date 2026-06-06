import type {
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DiagramKind,
  DiagramModelSpec,
  DocumentKind,
  ModelElementRef,
  RequirementBaseline,
  RequirementRule,
  CodeAppBlueprint,
  CodeBusinessLogic,
  CodeFilePlan,
  CodeGenerationSpec,
  LoadedCodeSkill,
  CodeSkillResourcePlan,
  CodeSkillResourcePreviewResult,
  CodeSkillResourceDiscoveryPlan,
  CodeSkillSelection,
  CodeSkillContext,
  CodeVisualDirection,
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

function selectedDiagramHardRules(selectedDiagrams: DiagramKind[]) {
  const unique = Array.from(new Set(selectedDiagrams));
  if (unique.length === 0) return "";
  const lines = [
    `本次只允许输出这些 diagramKind: ${unique.join(", ")}。`,
    "models 数组中不得出现未列出的 diagramKind；如果无法生成某类图，也不要改成其他图类型。",
  ];
  if (unique.length === 1) {
    const [kind] = unique;
    const labels: Record<DiagramKind, string> = {
      usecase: "用例模型",
      class: "领域概念模型",
      activity: "总体业务流程",
      deployment: "部署需求模型",
      prototype: "原型界面关系",
      analysis: "需求分析模型",
    };
    lines.push(
      `本次是 ${labels[kind]}(${kind}) 单图生成任务；models.length 必须为 1，且 models[0].diagramKind 必须严格等于 "${kind}"。`,
      "禁止输出其它任何 diagramKind；不要把同一业务主题换成其它图类型返回。",
      "如果上一次输出是其它 diagramKind 或其它图类型结构，必须丢弃错图，按本次唯一目标图从已确认需求项重新生成，不要只改 diagramKind 字段伪装。",
    );
    if (kind === "class") {
      lines.push(
        "本次只生成领域概念模型：必须输出 classes/interfaces/enums/relationships，禁止输出 swimlanes/nodes 作为主结构，禁止生成总体业务流程。",
      );
    }
    if (kind === "activity") {
      lines.push(
        "本次只生成总体业务流程：必须输出 swimlanes/nodes/relationships，禁止输出 classes/databases/components/screens 作为主结构。",
      );
    }
    if (kind === "deployment") {
      lines.push(
        "本次只生成部署需求模型：必须输出部署节点、数据库、组件、外部系统、制品和部署/通信关系，禁止输出原型界面 screen/module/entry-point 结构。",
      );
    }
    if (kind === "prototype") {
      lines.push(
        "本次只生成原型界面关系：nodes[].nodeType 只能表达 screen/module/entry-point，禁止输出部署节点、Pod、服务器或数据库部署结构作为主模型。",
      );
    }
  }
  if (unique.length === 1 && unique[0] === "usecase") {
    lines.push(
      "本次是用例模型生成：models 只能包含 diagramKind=\"usecase\" 的模型，禁止输出 analysis/class/activity/deployment/prototype。",
      "useCases[] 必须覆盖核心业务用例，且每个关键用例必须包含 eventFlows；eventFlows 是后续需求分析顺序图、用例实现设计和黑盒测试的唯一来源。",
    );
  }
  return lines.join("\n");
}

function requirementDiagramSchemaLines(selectedDiagrams: DiagramKind[]) {
  const selected = new Set(selectedDiagrams);
  const includeAll = selected.size === 0;
  const include = (diagram: DiagramKind) => includeAll || selected.has(diagram);
  const lines: string[] = [];
  if (include("usecase")) {
    lines.push(
      "- usecase: 必须包含 actors, useCases, systemBoundaries, relationships。",
      "  actors[].字段：id, name, actorType(human|system|external), description(可选), responsibilities(string[])。",
      "  useCases[].字段：id, name, goal, description(可选), preconditions(string[]), postconditions(string[]), primaryActorId(可选), supportingActorIds(string[]), eventFlows(array)。",
      "  useCases[].eventFlows[].字段：id, name, flowType(main|alternative|exception), trigger(可选), condition(可选), steps(array)。每个关键用例至少包含一个 main 事件流；涉及分支或失败时必须补充 alternative/exception。",
      "  useCases[].eventFlows[].steps[].字段：order(从1递增), actor(actor|system|external), actorAction(可选), systemAction(可选), expectedResult(可选), sourceRequirementId(可选)。事件流必须能直接支撑需求分析模型、用例实现设计和黑盒测试用例。",
      "  systemBoundaries[].字段：id, name, description(可选)。",
      "  relationships[].字段：id, type(association|include|extend|generalization), sourceId, targetId, label(可选), condition(可选), description(可选)。",
    );
  }
  if (include("class")) {
    lines.push(
      "- class: 必须包含 classes, interfaces, enums, relationships。",
      "  领域概念模型只允许输出业务名词类；禁止输出 *Service、*Controller、*Repository、*Manager 等服务/技术职责类，例如 ReservationService。classes[].operations 必须输出 [] 或省略，interfaces[].operations 必须输出 [] 或省略。",
      "  classes[].字段：id, name, chineseName(可选), englishName(可选), type(可选), constraints(string[], 可选), classKind(entity|aggregate|valueObject|other, 可选), stereotype(可选), description(可选), attributes(array), operations(array)。",
      "  classes[].attributes[].字段：name, chineseName(可选), englishName(可选), type, constraints(string[], 可选), visibility(public|protected|private|package), required(可选), multiplicity(可选), defaultValue(可选), description(可选)。",
      "  classes[].operations[].字段：name, returnType(可选), visibility(public|protected|private|package), parameters(array), description(可选)。",
      "  classes[].operations[].parameters[].字段：name, type, required(可选), direction(in|out|inout, 可选)。",
      "  interfaces[].字段：id, name, description(可选), operations(array)。",
      "  enums[].字段：id, name, literals(string[])。",
      "  relationships[].字段：id, type(association|aggregation|composition|inheritance|implementation|dependency), sourceId, targetId, sourceRole(可选), targetRole(可选), sourceMultiplicity(可选), targetMultiplicity(可选), navigability(none|source-to-target|target-to-source|bidirectional, 可选), label(可选), description(可选)。",
    );
  }
  if (include("activity")) {
    lines.push(
      "- activity: 必须包含 swimlanes, nodes, relationships。",
      "  swimlanes[].字段：id, name, description(可选)。",
      "  nodes[] 必须按 type 区分结构：",
      "    start: id, type, name, description(可选)",
      "    end: id, type, name, description(可选)",
      "    activity: id, type, name, description(可选), actorOrLane(可选), input(string[]), output(string[])",
      "    decision: id, type, name(可选), question(可选), description(可选)",
      "    merge/fork/join: id, type, name(可选), description(可选)",
      "  relationships[].字段：id, type(control_flow|object_flow), sourceId, targetId, condition(可选), guard(可选), trigger(可选), description(可选)。",
      "  重复业务步骤必须合并为一个 activity 节点，用多条 relationships 汇入/汇出；不要复制同名片段（例如重复输出“展示座位网格分布”）。",
    );
  }
  if (include("deployment")) {
    lines.push(
      "- deployment: 必须包含 nodes, databases, components, externalSystems, artifacts, relationships。",
      "  nodes[].字段：id, name, nodeType(app|server|device|container|external), environment(可选), description(可选)。",
      "  databases[].字段：id, name, engine(可选), description(可选)。",
      "  components[].字段：id, name, componentType(可选), description(可选)。",
      "  externalSystems[].字段：id, name, description(可选)。",
      "  artifacts[].字段：id, name, artifactType(可选), description(可选)。",
      "  relationships[].字段：id, type(deployment|communication|dependency|hosting), sourceId, targetId, protocol(可选), port(可选), direction(one-way|two-way|inbound|outbound, 可选), label(可选), description(可选)。",
    );
  }
  if (include("prototype")) {
    lines.push(
      "- prototype: 必须包含 nodes, relationships。",
      "  nodes[].字段：id, name, nodeType(screen|module|entry-point), route(可选), description(可选), sourceUseCaseIds(string[]), sourceRequirementIds(string[])。",
      "  relationships[].字段：id, type(navigation|contains|opens|submits|returns|depends-on), sourceId, targetId, label(可选), trigger(可选), condition(可选), description(可选)。",
    );
  }
  if (include("analysis")) {
    lines.push(
      "- analysis: 必须包含 modelId, sourceUseCaseId, sourceUseCaseName, participants, messages, fragments；必须为每个输入 useCase 输出一个独立 modelId=analysis:<useCaseId> 的需求分析顺序图，禁止把多个用例合成一个总需求分析模型，且必须基于该 useCase 的 eventFlows。",
      "  participants[].字段：id, name, participantType(actor|boundary|control|entity|service|database|external), description(可选)。",
      "  messages[].字段：id, type(sync|async|return|create|destroy), sourceId, targetId, name, parameters(string[]), returnValue(可选), condition(可选), description(可选)。",
      "  fragments[].字段：id, type(alt|opt|loop|par), label, messageIds(string[]), condition(可选), description(可选)。",
    );
  }
  return lines;
}

function formatSelectedCodeSkillsForPrompt(
  selectedCodeSkills: CodeSkillSelection[] | undefined,
  maxChars = 12000,
) {
  if (!selectedCodeSkills || selectedCodeSkills.length === 0) {
    return "[]";
  }
  return stringifyForPrompt(selectedCodeSkills, maxChars);
}

type CodeGenerationPromptContext = {
  businessLogic?: CodeBusinessLogic | null;
  uiBlueprint?: CodeUiBlueprint | null;
  loadedCodeSkill?: LoadedCodeSkill | null;
  visualDirection?: CodeVisualDirection | null;
  skillResourceDiscoveryPlan?: CodeSkillResourceDiscoveryPlan | null;
  skillResourcePreviews?: CodeSkillResourcePreviewResult | null;
  skillResourcePlan?: CodeSkillResourcePlan | null;
  codeSkillContext?: CodeSkillContext | null;
  qualityIssues?: string[];
  selectedCodeSkills?: CodeSkillSelection[];
  codeSkillInstructions?: string;
};

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
  "- 用例模型(usecase): 明确系统边界，直观展示“谁（角色）能做什么（用例）”，并为每个关键用例补充主事件流、备选事件流和异常事件流。",
  "- 领域概念模型(class): 只描述业务领域内的核心概念实体、属性及实体之间的关联，不表达服务、控制器、仓储或对象方法。",
  "- 总体业务流程(activity): 描述跨角色的业务活动、分支、并行和结束条件，不表达 UI 页面跳转。",
  "- 部署需求模型(deployment): 描述需求阶段可识别的部署约束、外部系统、网络拓扑和通信协议。",
  "- 原型界面关系(prototype): 描述页面、模块、入口点及它们之间的导航、打开、提交、返回和依赖关系。",
  "- 需求分析模型(analysis): 以用例事件流为依据，描述需求阶段的参与对象、消息和组合片段，用于支撑用例实现设计。",
].join("\n");

const REQUIREMENT_TRACEABILITY_RULES = [
  "需求 traceability 约束：",
  "- target.diagramKind 只能使用: usecase, class, activity, deployment, prototype, analysis。",
  "- 禁止把 requirements、requirement、design、model、traceability、page 等阶段名或页面名作为 diagramKind。",
  "- target.elementId 必须引用本次需求模型中真实存在的元素 id 或 relationship id；表字段类元素使用 tableId.columnId 形式。",
  "- 矩阵会展示的每一个需求业务元素和 relationship 都必须至少映射到一条需求规则，不能遗漏。",
  "- 业务元素范围：用例图的角色/用例/关系；类图的类/接口/枚举/关系；总体业务流程的 activity/decision 节点及这些节点之间的关系；部署需求模型的节点/数据库/组件/外部系统/制品/关系；原型界面关系的页面/模块/入口点/关系；需求分析模型的参与对象/消息/组合片段。",
  "- 不要为 system-boundary、swimlane、start/end/merge/fork/join 等结构元素补映射。",
  "- 如果错误提示包含非法 diagramKind，必须改成该元素实际所属的具体图类型，不允许继续返回阶段名。",
].join("\n");

const DESIGN_TRACEABILITY_RULES = [
  "设计 traceability 约束：",
  "- 设计侧 source 必须包含 modelId；用例实现设计元素的 modelId 必须是对应 sequence:<useCaseId>，聚合下游设计模型可使用 class/activity/deployment/table。",
  "- 下游聚合设计模型元素如果由用例实现设计推导，必须在 upstreamDesignRefs 中列出参与推导的用例实现设计元素引用。",
  "- source.diagramKind 只能使用: sequence, class, activity, deployment, table。",
  "- targets[].diagramKind 只能使用: usecase, class, activity, deployment, prototype, analysis。",
  "- 禁止把 requirements、requirement、design、model、traceability、page 等阶段名或页面名作为 diagramKind。",
  "- source.elementId 必须引用本次设计模型中真实存在的元素 id 或 relationship id；表字段类元素使用 tableId.columnId 形式。",
  "- targets[].elementId 必须引用输入需求模型中真实存在的元素 id 或 relationship id。",
  "- 矩阵会展示的每一个设计业务元素和 relationship 都必须至少映射到一个需求模型元素，不能遗漏。",
  "- 业务元素范围：用例实现设计的参与对象/消息/组合片段；设计类图的类/接口/枚举/关系；界面关系图的 activity/decision 节点及这些节点之间的关系；部署设计的节点/数据库/组件/外部系统/制品/关系；数据库设计的表/字段/关系。",
  "- 不要为 swimlane、start/end/merge/fork/join 等结构元素补映射。",
  "- 如果错误提示包含非法 diagramKind，必须改成该元素实际所属的具体图类型，不允许继续返回阶段名。",
].join("\n");

const DESIGN_MODEL_GENERATION_TRACEABILITY_RULES = [
  "设计模型生成阶段 traceability 约束：",
  "- 本提示只负责生成设计模型结构，必须返回 designModelTraceability: []。",
  "- 禁止在模型生成阶段补 source/targets/upstreamDesignRefs；系统会在模型结构解析成功后按元素清单确定性补齐可追踪关系。",
  "- 优先保证 models 数组短小、完整、符合 schema；不要为了可追踪矩阵输出长映射数组。",
].join("\n");

const DIAGRAM_SHORT_LABEL_RULES = [
  "图上关系短标签约束：",
  "- relationships[].label、messages[].name、fragments[].label、condition、guard、trigger 只能放短业务短语，建议不超过 12 个汉字或 18 个字符。",
  "- 长业务解释、覆盖范围、处理细节、多个功能点列表必须放入 description，不能塞进图上的 label/name/condition/guard/trigger。",
  "- 禁止把协议、端口、多个用例和长说明用 | 串成一条连线文字；deployment 的 protocol、port 必须分别写入 protocol、port 字段。",
  "- 例：label 写“加密访问”，protocol 写“HTTPS”，port 写“443”，description 才写完整访问范围和业务说明。",
].join("\n");

function formatMissingRefsForPrompt(refs: ModelElementRef[]) {
  if (refs.length === 0) return "[]";
  return stringifyForPrompt(refs, 12000);
}

function promptCompactString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function compactPromptText(value: unknown, maxChars = 180) {
  const text = promptCompactString(value);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function compactDesignModelForPrompt(model: DesignDiagramModelSpec) {
  if (model.diagramKind === "sequence") {
    return {
      diagramKind: model.diagramKind,
      modelId: model.modelId,
      sourceUseCaseId: model.sourceUseCaseId,
      sourceUseCaseName: model.sourceUseCaseName,
      title: compactPromptText(model.title),
      summary: compactPromptText(model.summary, 240),
      participants: model.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        participantType: participant.participantType,
      })),
      messages: model.messages.map((message) => ({
        id: message.id,
        type: message.type,
        sourceId: message.sourceId,
        targetId: message.targetId,
        name: message.name,
        condition: compactPromptText(message.condition, 120) || undefined,
        description: compactPromptText(message.description, 160) || undefined,
      })),
      fragments: model.fragments.map((fragment) => ({
        id: fragment.id,
        type: fragment.type,
        label: fragment.label,
        condition: compactPromptText(fragment.condition, 120) || undefined,
        messageIds: fragment.messageIds,
      })),
    };
  }

  return model;
}

function formatDesignModelsForPrompt(models: DesignDiagramModelSpec[]) {
  return JSON.stringify(models.map(compactDesignModelForPrompt), null, 2);
}

function promptEnsureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function promptIsRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function promptActivityNodeKind(nodeType: unknown) {
  switch (nodeType) {
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
    default:
      return "activity-node";
  }
}

function promptPrototypeNodeKind(nodeType: unknown) {
  switch (nodeType) {
    case "screen":
      return "screen";
    case "module":
      return "module";
    case "entry-point":
      return "entry-point";
    default:
      return "interface-node";
  }
}

function isPromptBusinessElementKind(kind: string) {
  return ![
    "system-boundary",
    "swimlane",
    "start-node",
    "end-node",
    "merge-node",
    "fork-node",
    "join-node",
  ].includes(kind);
}

function addPromptRef(
  refs: ModelElementRef[],
  diagramKind: DiagramKind,
  elementId: unknown,
  elementKind: string,
  label: unknown,
  modelId?: string,
) {
  const id = promptCompactString(elementId);
  if (!id) return;
  refs.push({
    modelId: promptCompactString(modelId) || undefined,
    diagramKind,
    elementId: id,
    elementKind,
    label: promptCompactString(label) || id,
  });
}

function collectRequirementTraceabilityTargets(models: DiagramModelSpec[]) {
  const refs: ModelElementRef[] = [];
  const seen = new Set<string>();

  for (const model of models) {
    const diagramKind = model.diagramKind;
    const record = model as unknown as Record<string, unknown>;
    const modelId = promptCompactString(record.modelId);
    const listKeys: Array<[string, string]> = [
      ["actors", "actor"],
      ["useCases", "usecase"],
      ["systemBoundaries", "system-boundary"],
      ["classes", "class"],
      ["interfaces", "interface"],
      ["enums", "enum"],
      ["swimlanes", "swimlane"],
      ["nodes", diagramKind === "deployment" ? "deployment-node" : "activity-node"],
      ["databases", "database"],
      ["components", "component"],
      ["externalSystems", "external-system"],
      ["artifacts", "artifact"],
      ["participants", "participant"],
      ["messages", "message"],
      ["fragments", "fragment"],
      ["tables", "table"],
    ];
    const businessElementIds = new Set<string>();

    for (const [key, defaultKind] of listKeys) {
      for (const item of promptEnsureArray(record[key])) {
        if (!promptIsRecord(item)) continue;
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? promptActivityNodeKind(item.type)
            : key === "nodes" && diagramKind === "prototype"
              ? promptPrototypeNodeKind(item.nodeType)
              : defaultKind;
        const beforeCount = refs.length;
        if (isPromptBusinessElementKind(kind)) {
          addPromptRef(refs, diagramKind, item.id, kind, item.name ?? item.label, modelId);
        }
        if (refs.length > beforeCount) {
          businessElementIds.add(refs.at(-1)!.elementId);
        }
        if (key === "tables") {
          for (const column of promptEnsureArray(item.columns)) {
            if (!promptIsRecord(column)) continue;
            const tableId = promptCompactString(item.id);
            const columnId = promptCompactString(column.id);
            if (!tableId || !columnId) continue;
            addPromptRef(
              refs,
              diagramKind,
              `${tableId}.${columnId}`,
              "table-column",
              `${promptCompactString(item.name) || tableId}.${promptCompactString(column.name) || columnId}`,
              modelId,
            );
            businessElementIds.add(`${tableId}.${columnId}`);
          }
        }
      }
    }

    for (const relationship of promptEnsureArray(record.relationships)) {
      if (!promptIsRecord(relationship)) continue;
      if (
        diagramKind === "activity" &&
        (!businessElementIds.has(promptCompactString(relationship.sourceId)) ||
          !businessElementIds.has(promptCompactString(relationship.targetId)))
      ) {
        continue;
      }
      addPromptRef(
        refs,
        diagramKind,
        relationship.id,
        "relationship",
        relationship.label ??
          `${promptCompactString(relationship.sourceId)} -> ${promptCompactString(relationship.targetId)}`,
        modelId,
      );
    }
  }

  return refs.filter((ref) => {
    const key = `${ref.modelId || ref.diagramKind}:${ref.diagramKind}:${ref.elementId}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatAllowedRequirementTargetsForPrompt(models: DiagramModelSpec[]) {
  return stringifyForPrompt(collectRequirementTraceabilityTargets(models), 24000);
}

function formatRequirementBaselineForPrompt(baseline: RequirementBaseline) {
  return stringifyForPrompt(baseline, 24000);
}

export function buildExtractRulesPrompt(requirementText: string) {
  return [
    "请从下面的软件工程实训平台需求中抽取结构化需求规则。",
    "输出 JSON，必须符合接口 schema；不要输出 Markdown、解释或代码块。",
    "每条规则必须表达 id、分类、原文片段和关联图类型。",
    "relatedDiagrams 只能使用: usecase, class, activity, deployment, prototype, analysis。",
    "category 只能使用: 业务规则, 功能需求, 外部接口, 界面需求, 数据需求, 非功能需求, 部署需求, 异常处理。",
    "请保证规则编号从 r1 开始连续递增。",
    "",
    "原始需求：",
    requirementText,
  ].join("\n");
}

export function buildGenerateModelsPrompt(
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
  selectedDiagrams: DiagramKind[],
) {
  return [
    "请根据已确认的需求规则和 RequirementBaseline 生成需求阶段 UML 结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[...]}。",
    "requirementModelTraceability 可以返回空数组 []；优先保证需求模型结构简洁完整，模型结构生成成功后由系统分批补齐可追踪关系。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    "JSON 必须完整合法，字符串必须正确转义，不能出现未闭合字符串、未闭合数组/对象或裸换行。",
    "每个 model 必须包含：diagramKind, title, summary, notes，以及对应图类型要求的强类型字段。",
    "如果返回 requirementModelTraceability，字段为 ruleId, target；target 字段为 diagramKind, elementId, elementKind, label。",
    REQUIREMENT_TRACEABILITY_RULES,
    "notes 必须是字符串数组，不能是对象数组。",
    "所有 relationships[] 必须显式包含 sourceId 和 targetId；如果无法确定端点，不要输出该 relationship。",
    "deployment.relationships[].port 如需填写，必须是字符串，例如 \"8080\"，不能是数字。",
    DIAGRAM_SHORT_LABEL_RULES,
    "你必须从需求项中提取参与者、约束、功能点、流程和部署信息，不能依赖不存在的 SRS 字段。",
    "禁止使用原始需求文本作为事实来源；本阶段只能使用已确认需求规则和 RequirementBaseline。",
    "如果需求规则与 RequirementBaseline 冲突，必须以 RequirementBaseline 中 accepted 的原子需求、质量报告和字段来源为准。",
    REQUIREMENT_STAGE_SEMANTICS,
    "只生成以下图类型：",
    selectedDiagrams.join(", "),
    selectedDiagramHardRules(selectedDiagrams),
    "",
    "图类型结构约束：",
    ...requirementDiagramSchemaLines(selectedDiagrams),
    "",
    "禁止输出通用 nodes/relations 旧结构，必须严格按 diagramKind 输出对应字段。",
    "",
    "已确认需求项（后续模型生成的唯一权威基线）：",
    JSON.stringify(rules, null, 2),
    "",
    "RequirementBaseline（结构化需求事实和约束）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
  ].join("\n");
}

export function buildGenerateRequirementAnalysisPrompt(
  scopedUseCaseModel: DiagramModelSpec,
) {
  return [
    "请只根据单个用例的事件流，生成需求阶段需求分析顺序图结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[...]}，且 models 只包含 diagramKind 为 analysis 的需求分析模型。",
    "输入的需求阶段用例模型只包含一个 useCase；你必须且只能输出一个 analysis 模型。",
    "analysis 模型必须包含 modelId, sourceUseCaseId, sourceUseCaseName；modelId 必须是 analysis:<sourceUseCaseId>。",
    "需求分析模型是需求阶段模型：参与对象、消息和组合片段必须来自该 useCase.eventFlows 的角色动作、系统动作、备选流和异常流。",
    "必须使用需求语义短语描述消息，例如“确认删除活动”“校验活动权限”“返回删除失败原因”；禁止使用 deleteEvent(eventId)、remove()、save() 等方法调用写法。",
    "禁止加入设计阶段类名、Service、DAO、Repository、Controller、数据库、数据库表、事务、具体方法实现或持久化细节。",
    "requirementModelTraceability 必须返回空数组 []；需求分析模型的来源覆盖关系由系统根据 sourceUseCaseId 和 eventFlows 派生。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    "JSON 必须完整合法，字符串必须正确转义，不能出现未闭合字符串、未闭合数组/对象或裸换行。",
    "禁止使用原始需求文本、需求规则或 RequirementBaseline 作为事实来源；只能使用输入的单用例模型。",
    DIAGRAM_SHORT_LABEL_RULES,
    "analysis 结构约束：",
    "participants[].字段：id, name, participantType(actor|boundary|control|entity|service|database|external), description(可选)。",
    "messages[].字段：id, type(sync|async|return|create|destroy), sourceId, targetId, name, parameters(string[]), returnValue(可选), condition(可选), description(可选)。",
    "fragments[].字段：id, type(alt|opt|loop|par), label, messageIds(string[]), condition(可选), description(可选)。",
    "messages[].name 和 fragments[].label 必须是短标签；完整业务解释放 description。",
    "",
    "单用例需求阶段用例模型（唯一分析来源）：",
    JSON.stringify(scopedUseCaseModel, null, 2),
  ].join("\n");
}

export function buildRepairModelsPrompt(
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
  selectedDiagrams: DiagramKind[],
  previousOutput: string,
  parseError: string,
) {
  return [
    "请修复下面不符合要求的 UML 结构化模型 JSON 输出。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"models\":[...],\"requirementModelTraceability\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何额外文字。",
    "JSON 必须完整合法，字符串必须正确转义，不能出现未闭合字符串、未闭合数组/对象或裸换行。",
    "只修复 JSON 结构问题，不要改变原有业务语义。",
    "已确认需求项和 RequirementBaseline 是唯一权威基线；禁止使用原始需求文本作为事实来源。",
    REQUIREMENT_STAGE_SEMANTICS,
    "notes 必须是字符串数组，不能是对象数组。",
    selectedDiagrams.length === 1 && selectedDiagrams[0] === "analysis"
      ? "本次修复需求分析模型：requirementModelTraceability 必须允许为空数组 []，不得为了满足规则映射而虚构 ruleId。"
      : "requirementModelTraceability 必须是非空数组；每一项必须包含 ruleId 和 target，target.elementId 必须引用模型内真实存在的元素或 relationship。",
    "diagramKind 只能使用: usecase, class, activity, deployment, prototype, analysis。",
    REQUIREMENT_TRACEABILITY_RULES,
    "relationships[] 必须显式包含 sourceId 和 targetId；如果无法确定端点，删除该 relationship。",
    "deployment.relationships[].port 必须是字符串，例如 \"8080\"，不能是数字。",
    DIAGRAM_SHORT_LABEL_RULES,
    "必须按 diagramKind 输出对应的强类型字段：",
    ...requirementDiagramSchemaLines(selectedDiagrams),
    "禁止回退成旧的通用 nodes/relations 结构。",
    "只生成以下图类型：",
    selectedDiagrams.join(", "),
    selectedDiagramHardRules(selectedDiagrams),
    "",
    "已确认需求项：",
    JSON.stringify(rules, null, 2),
    "",
    "RequirementBaseline（结构化需求事实和约束）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "上一次模型输出：",
    previousOutput,
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

export function buildGenerateRequirementTraceabilityPrompt(
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
  models: DiagramModelSpec[],
) {
  return [
    "请为已经生成成功的需求阶段 UML 模型补充元素级可追踪关系。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"requirementModelTraceability\":[...]}。",
    "requirementModelTraceability 必须是非空数组；每一项必须包含 ruleId 和 target。",
    "ruleId 必须引用已确认需求项中的真实 id。",
    "target 必须包含 diagramKind, elementId, elementKind, label；target.elementId 必须引用已生成模型内真实存在的元素 id 或 relationship id。",
    "target 必须从 allowedTargets 清单原样复制；禁止自造 elementId、diagramKind、elementKind、label 或 modelId。",
    "如果 allowedTargets 中某项包含 modelId，返回 target 时必须保留该 modelId；如果 allowedTargets 中没有 modelId，禁止返回 null，直接省略 modelId。",
    REQUIREMENT_TRACEABILITY_RULES,
    "不要把所有规则粗暴映射到所有元素；只输出能从规则文本和模型元素语义直接证明的覆盖来源。",
    "若一个规则对应多个模型元素，可以输出多条记录；若一个元素由多个规则支撑，也可以输出多条记录。",
    "",
    "已确认需求项：",
    JSON.stringify(rules, null, 2),
    "",
    "RequirementBaseline（结构化需求事实和约束）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "已生成需求模型：",
    JSON.stringify(models, null, 2),
    "",
    "allowedTargets（唯一可引用目标清单，target 必须从这里逐项复制）：",
    formatAllowedRequirementTargetsForPrompt(models),
  ].join("\n");
}

export function buildRepairRequirementTraceabilityPrompt(
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline,
  models: DiagramModelSpec[],
  previousOutput: string,
  parseError: string,
  missingTargets: ModelElementRef[] = [],
) {
  return [
    "请修复需求模型元素级可追踪关系 JSON。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"requirementModelTraceability\":[...]}。",
    "requirementModelTraceability 必须是非空数组；每一项必须包含 ruleId 和 target。",
    "ruleId 必须引用已确认需求项中的真实 id；target.elementId 必须引用已生成模型内真实存在的元素 id 或 relationship id。",
    "target 必须从 allowedTargets 清单原样复制；包含 modelId 的目标必须保留 modelId，不包含 modelId 的目标必须省略 modelId，禁止写 null。",
    REQUIREMENT_TRACEABILITY_RULES,
    "不要修改模型；只修复映射数组。",
    "如果缺失清单非空，只需要为缺失清单中的每一项补充映射；可以保留上一轮已经有效的映射，不要重写模型。",
    "",
    "已确认需求项：",
    JSON.stringify(rules, null, 2),
    "",
    "RequirementBaseline（结构化需求事实和约束）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "已生成需求模型：",
    JSON.stringify(models, null, 2),
    "",
    "allowedTargets（唯一可引用目标清单，target 必须从这里逐项复制）：",
    formatAllowedRequirementTargetsForPrompt(models),
    "",
    "必须补齐的缺失业务元素清单：",
    formatMissingRefsForPrompt(missingTargets),
    "",
    "上一次映射输出：",
    previousOutput,
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

const DESIGN_STAGE_SEMANTICS = [
  "设计阶段模型职责：",
  "- 用例实现设计(sequence): 动态行为层，必须基于用例事件流和需求分析模型，确定对象间具体的方法调用时序，包含正常流程与异常动态行为。",
  "- 界面关系图(activity): 界面交互层，描述原型界面、模块、入口点与用例实现之间的跳转、提交、打开、返回和状态流转。",
  "- 类图(class): 静态结构层，定义实体、接口、聚合根的属性、行为及静态关联（1:N、泛化等）。",
  "- 部署设计(deployment): 物理部署层，展示软件组件在物理节点（K8s Pod、服务器、数据库）上的分布。",
  "- 数据库设计(table): 数据库表结构层，体现表、字段、主键、外键和表间关联基数。",
].join("\n");

const DESIGN_MODEL_SCHEMA_INSTRUCTIONS = [
  "设计图类型结构约束：",
  DIAGRAM_SHORT_LABEL_RULES,
  "- sequence: 必须包含 participants, messages, fragments。",
  "  sequence 模型还必须包含 modelId, sourceUseCaseId, sourceUseCaseName；modelId 必须是 sequence:<sourceUseCaseId>。",
  "  participants[].字段：id, name, participantType(actor|boundary|control|entity|service|database|external), description(可选)。",
  "  sequence 必须体现设计阶段职责拆分，通常包含 boundary/controller/control、service、entity，涉及持久化时必须包含 database 或 Repository 语义的 service/control 参与者。",
  "  messages[].字段：id, type(sync|async|return|create|destroy), sourceId, targetId, name, parameters(string[]), returnValue(可选), condition(可选), description(可选)。",
  "  sequence.messages[].name 必须优先使用方法调用语义，例如 deleteEvent、validatePermission、removeEvent、commitChanges；不要原样复用需求分析模型中的业务短语。",
  "  fragments[].字段：id, type(alt|opt|loop|par), label, messageIds(string[]), condition(可选), description(可选), branches(可选)。",
  "  多分支 alt 必须优先输出 branches: [{label, condition(可选), messageIds}]，每个分支的 messageIds 不得交叠；渲染时 branches 会生成 PlantUML alt/else/end 分隔线。",
  "- 所有设计模型都必须包含 notes 字段，且 notes 永远是字符串数组；没有备注时输出 []，不要输出字符串。",
  "- sequence.messages[].type 只能使用 sync|async|return|create|destroy；response/reply/result 必须写 return，request/call 必须写 sync，event/notify 必须写 async。",
  "- class.classes[].classKind 只能使用 entity|aggregate|valueObject|service|other；不确定时用 other 或省略，不能输出中文、自造枚举或 controller 等非枚举值。",
  "- activity/class/deployment 必须沿用需求阶段对应图的强类型字段，不允许输出通用 nodes/relations 旧结构。",
  "- table: 必须包含 tables, relationships。",
  "  tables[].字段：id, name, chineseName(可选), englishName(可选), type(可选), constraints(string[], 可选), description(可选), columns(array)。",
  "  columns[].字段：id, name, chineseName(可选), englishName(可选), dataType, constraints(string[], 可选), isPrimaryKey(boolean), isForeignKey(boolean), nullable(boolean), references(可选), description(可选)。",
  "  references 字段：tableId, columnId。",
  "  relationships[].字段：id, type(one-to-one|one-to-many|many-to-many), sourceTableId, targetTableId, sourceColumnId(可选), targetColumnId(可选), label(可选), description(可选)。",
  "- activity 表达设计阶段界面关系图，应从原型界面关系和用例实现设计推导界面节点、状态节点和跳转关系；重复步骤必须合并为一个节点，用多条关系汇入/汇出。",
  "- class 表达静态结构层，类应包含操作；接口、服务、实体、聚合根要通过 classKind 或 stereotype 标明。",
  "- deployment 表达物理部署层，优先体现 K8s Pod、服务、数据库、外部系统及通信协议。",
  "- table 表达数据库表关系，必须从设计类图和用例实现设计中推导表、主键、外键与关联基数。",
].join("\n");

export function buildGenerateDesignSequencePrompt(
  requirementBaseline: RequirementBaseline,
  useCaseModel: DiagramModelSpec,
  analysisModels: DiagramModelSpec[] = [],
) {
  return [
    "请根据已确认需求项、需求阶段用例模型事件流和需求分析模型生成设计阶段用例实现设计结构化模型。",
    "内部兼容标识：本任务等价于旧称“需求阶段用例模型生成设计阶段顺序图 / 生成设计阶段顺序图结构化模型”，但返回的用户可见模型名应为用例实现设计。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"designModelTraceability\":[...]}，且 models 只包含 diagramKind 为 sequence 的用例实现设计模型。",
    "每个 useCase 必须生成一个独立用例实现设计；models.length 必须等于 useCases.length；禁止把多个用例合成一个总用例实现设计。",
    "每个用例实现设计必须包含 modelId, sourceUseCaseId, sourceUseCaseName；modelId = sequence:<useCaseId>。",
    DESIGN_MODEL_GENERATION_TRACEABILITY_RULES,
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    DESIGN_STAGE_SEMANTICS,
    DESIGN_MODEL_SCHEMA_INSTRUCTIONS,
    "设计阶段禁止使用原始需求文本或需求规则列表作为事实来源。",
    "需求模型和上游设计模型是结构来源；RequirementBaseline 只用于约束、验收边界、异常、权限、非功能需求和可追踪性。",
    "禁止从 RequirementBaseline 生成没有输入需求模型支撑的新业务对象。",
    "每个用例实现设计只表达一个用例的独立对象交互流程，并把该用例 eventFlows 中的角色动作、系统动作、备选流和异常流转化为对象间方法调用时序。",
    "如果输入包含需求分析模型，必须以其业务消息和组合片段作为语义来源，但不能原样复用参与者和消息；必须补充设计阶段 boundary/controller/service/entity/database 等对象职责。",
    "用例实现设计必须明显不同于需求分析模型：参与者应体现界面、控制器、服务、仓储/数据库、实体协作；消息应体现方法调用、参数和返回值。",
    "必须包含主要正常流程；如已确认需求项中存在异常处理或扩展条件，也要用消息或片段表达。",
    "",
    "RequirementBaseline（只用于约束和验收边界）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "需求阶段用例模型：",
    JSON.stringify(useCaseModel, null, 2),
    "",
    "需求阶段需求分析模型（可为空）：",
    JSON.stringify(analysisModels, null, 2),
  ].join("\n");
}

export function buildGenerateDesignModelsPrompt(
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  sequenceModels: DesignDiagramModelSpec[],
  selectedDiagrams: DesignDiagramKind[],
  designContextModels: DesignDiagramModelSpec[] = [],
) {
  return [
    "请根据已确认需求项、需求阶段模型和全部用例实现设计生成设计阶段 UML 结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"designModelTraceability\":[...]}。",
    DESIGN_MODEL_GENERATION_TRACEABILITY_RULES,
    "本阶段生成的是下游聚合设计模型：设计类图、界面关系图、部署设计、数据库设计都各自保持一张总图，不按用例拆分。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    DESIGN_STAGE_SEMANTICS,
    DESIGN_MODEL_SCHEMA_INSTRUCTIONS,
    "设计阶段禁止使用原始需求文本或需求规则列表作为事实来源。",
    "需求模型和上游设计模型是结构来源；RequirementBaseline 只用于约束、验收边界、异常、权限、非功能需求和可追踪性。",
    "禁止从 RequirementBaseline 生成没有输入需求模型或上游设计模型支撑的新业务对象。",
    "若本次生成数据库设计(table)，需求阶段来源模型只可作为可追踪 targets 的参考上下文；表结构必须从设计阶段设计类图和全部用例实现设计推导。",
    "只生成以下设计图类型：",
    selectedDiagrams.join(", "),
    "",
    "映射规则：",
    "- 需求阶段原型界面关系 + 全部用例级用例实现设计 -> 设计阶段界面关系图（activity，界面交互层）。",
    "- 需求阶段领域概念模型 + 全部用例级用例实现设计 -> 设计阶段类图（设计类图），类是所有用例实现设计中的类/对象/服务的归并组合。",
    "- 需求阶段部署需求模型 + 全部用例级用例实现设计 -> 设计阶段部署设计。",
    "- 聚合设计类图 + 全部用例级用例实现设计 -> 设计阶段数据库设计。",
    "",
    "RequirementBaseline（只用于约束和验收边界）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "需求阶段来源模型：",
    JSON.stringify(requirementModels, null, 2),
    "",
    "全部用例实现设计：",
    formatDesignModelsForPrompt(sequenceModels),
    "",
    "已生成设计阶段上下文模型：",
    formatDesignModelsForPrompt(designContextModels),
  ].join("\n");
}

export function buildRepairDesignModelsPrompt(
  requirementBaseline: RequirementBaseline,
  selectedDiagrams: DesignDiagramKind[],
  previousOutput: string,
  parseError: string,
) {
  return [
    "请修复下面不符合要求的设计阶段 UML 结构化模型 JSON 输出。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"models\":[...],\"designModelTraceability\":[...]}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何额外文字。",
    "请严格按错误路径逐项修复 JSON 结构问题，不要改变原有业务语义。",
    "设计阶段禁止使用原始需求文本或需求规则列表作为事实来源。",
    "RequirementBaseline 只用于约束、验收边界、异常、权限、非功能需求和可追踪性，禁止补入没有上游模型支撑的新业务对象。",
    DESIGN_STAGE_SEMANTICS,
    DESIGN_MODEL_SCHEMA_INSTRUCTIONS,
    DESIGN_MODEL_GENERATION_TRACEABILITY_RULES,
    "只生成以下设计图类型：",
    selectedDiagrams.join(", "),
    "",
    "RequirementBaseline（只用于约束和验收边界）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "上一次模型输出：",
    previousOutput,
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

export function buildGenerateDesignTraceabilityPrompt(
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  requiredSources: ModelElementRef[] = [],
) {
  const requiredSourceRules =
    requiredSources.length > 0
      ? [
          "本次只为 requiredSources 中列出的设计元素生成映射。",
          "返回的 designModelTraceability.length 必须等于 requiredSources.length。",
          "requiredSources 中每一个 source.diagramKind + source.elementId 都必须在返回数组中逐项出现一次。",
          "禁止返回 requiredSources 之外的 source；禁止遗漏 requiredSources 中的任何 source。",
        ]
      : [
          "本次为已生成设计模型中的全部设计业务元素生成映射。",
        ];
  return [
    "请为已经生成成功的设计阶段 UML 模型补充元素级可追踪关系。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"designModelTraceability\":[...]}。",
    "designModelTraceability 必须是非空数组；每一项必须包含 source 和 targets。",
    "source 是设计模型元素引用，targets 是需求模型元素引用数组。",
    "source/targets 都必须包含 diagramKind, elementId, elementKind, label；elementId 必须引用输入模型中真实存在的元素 id 或 relationship id。",
    ...requiredSourceRules,
    DESIGN_TRACEABILITY_RULES,
    "不要把整张需求模型套给每个设计元素；只输出能从设计元素语义、需求模型元素和已确认需求项直接推导的映射。",
    "允许派生映射：技术参与者、数据库参与者、关系边、字段等如果不是直接需求元素，也必须映射到最近的上游领域元素、用例、活动节点或关系。",
    "关系边优先映射到其 source/target 端点已映射需求元素的并集；这属于可解释链路继承，不是凭空猜测。",
    "表字段类元素使用 tableId.columnId 形式。",
    "",
    "本批必须映射的 requiredSources：",
    formatMissingRefsForPrompt(requiredSources),
    "",
    "RequirementBaseline（只用于约束和验收边界）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "需求阶段来源模型：",
    JSON.stringify(requirementModels, null, 2),
    "",
    "已生成设计模型：",
    JSON.stringify(designModels, null, 2),
  ].join("\n");
}

export function buildRepairDesignTraceabilityPrompt(
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  previousOutput: string,
  parseError: string,
  missingSources: ModelElementRef[] = [],
) {
  return [
    "请修复设计模型元素级可追踪关系 JSON。",
    "只返回 JSON，不要输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"designModelTraceability\":[...]}。",
    "designModelTraceability 必须是非空数组；每一项必须包含 source 和 targets。",
    "source.elementId 必须引用设计模型中真实存在的元素 id 或 relationship id；targets[].elementId 必须引用需求模型中真实存在的元素 id 或 relationship id。",
    DESIGN_TRACEABILITY_RULES,
    "不要修改模型；只修复映射数组。",
    "如果缺失清单非空，只需要为缺失清单中的每一项补充映射；不要重写模型，也不要返回缺失清单之外的 source。",
    "返回的 designModelTraceability.length 必须等于缺失清单长度，且每一个缺失 source 都必须逐项出现一次。",
    "允许派生映射：技术参与者、数据库参与者、关系边、字段等如果不是直接需求元素，也必须映射到最近的上游领域元素、用例、活动节点或关系。",
    "",
    "RequirementBaseline（只用于约束和验收边界）：",
    formatRequirementBaselineForPrompt(requirementBaseline),
    "",
    "需求阶段来源模型：",
    JSON.stringify(requirementModels, null, 2),
    "",
    "已生成设计模型：",
    JSON.stringify(designModels, null, 2),
    "",
    "必须补齐的缺失业务元素清单：",
    formatMissingRefsForPrompt(missingSources),
    "",
    "上一次映射输出：",
    previousOutput,
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

const CODE_GENERATION_SEMANTICS = [
  "代码生成阶段职责：",
  "- 第一版只生成可运行的前端原型，不生成真实后端、数据库迁移或完整仓库补丁。",
  "- 外层代码页属于软件工程实训平台，但 Sandpack 内生成的业务原型必须契合用户需求背景，而不是套用软件工程实训平台视觉风格。",
  "- 必须从已确认需求项和设计模型推导业务主题、领域文案、信息架构和视觉语言；requirementText 只作为背景，校园活动、医疗预约、仓储管理、图书借阅、在线商城等应呈现不同 UI 气质。",
  "- 生成的业务原型要低噪声、可读、可操作，不要营销页式空壳；但不要强制蓝色、低饱和或工程工作台风格，除非需求背景本身适合。",
  "- 用例实现设计(sequence) -> 用户操作流程、事件处理函数、API/mock 调用顺序。",
  "- 设计类图(class) -> TypeScript types、domain model、service 层、状态结构。",
  "- 界面关系图(activity) -> 页面流、路由、条件渲染、表单状态机。",
  "- 数据库设计(table) -> mock 数据结构、列表/详情字段、CRUD 表单字段。",
  "- 部署设计(deployment) -> 前端环境提示和接口边界，不生成真实后端部署代码。",
].join("\n");

export function buildGenerateCodeSpecPrompt(
  requirementText: string,
  rules: RequirementRule[],
  designModels: DesignDiagramModelSpec[],
) {
  return [
    "请根据已确认需求项和设计阶段 UML 结构化模型生成前端原型代码规格。",
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
    "theme 必须描述业务领域主题，例如医疗、校园、仓储、商城、图书馆等，而不是软件工程实训平台主题。",
    "",
    "原始需求：",
    requirementText,
    "",
    "已确认需求项：",
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
    "请作为产品架构师，根据已确认需求项和设计模型规划前端原型的业务应用蓝图。",
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
    "已确认需求项：",
    JSON.stringify(rules, null, 2),
    "",
    "设计阶段模型：",
    JSON.stringify(designModels, null, 2),
  ].join("\n");
}

export function buildAnalyzeCodeBusinessLogicPrompt(
  requirementText: string,
  rules: RequirementRule[],
  designModels: DesignDiagramModelSpec[],
  designPlantUml: unknown[] = [],
) {
  return [
    "请作为前端业务逻辑分析器，从已确认需求项、设计模型和 PlantUML 中抽取代码生成必须遵守的业务事实；原始需求只作为背景。",
    "返回 JSON 对象，格式必须是 {\"businessLogic\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "businessLogic 字段结构：",
    "- appName: 业务原型名称，必须来自需求语义，缺失时用中性业务名。",
    "- domainSummary: 业务领域、目标用户和核心价值的一句话总结。",
    "- coreWorkflow: 前端原型必须覆盖的核心业务闭环。",
    "- actors[]: id, name, type, responsibilities[]。",
    "- businessEntities[]: id, name, description, fields[], relationships[]。",
    "- pageFlows[]: id, name, route, purpose, actors[], entryPoints[], userActions[], states[], sourceRefs[]。",
    "- stateMachines[]: entity, states[], transitions[]。",
    "- permissions[]: actor, allowedActions[], restrictedActions[]。",
    "- edgeCases[]: 异常、空态、失败、权限不足等前端必须表达的分支。",
    "- frontendOperations[]: 前端必须实现的操作，例如筛选、创建、审批、提交、切换状态、查看详情。",
    "- plantUmlTraceability[]: 简述这些业务事实来自哪些图、类、消息、活动节点或表。",
    "- coreWorkflow 必须是一个字符串，不要输出数组；多个步骤用中文分号合并成一句。",
    "- fields、relationships、transitions、edgeCases、frontendOperations、plantUmlTraceability 必须全部是字符串数组，不要输出对象数组。",
    "- fields 示例：fields: [\"id:string\", \"status:待审核|已通过\"]，不要输出 {\"name\":\"id\",\"type\":\"string\"}。",
    "- 复杂关系、状态迁移、异常分支、前端操作和溯源也要压成一句字符串，例如 transitions: [\"提交报名 -> 待审核：创建报名记录\"]。",
    "",
    "强约束：",
    "- 这一步不是 skill，而是代码生成必做的 function calling。",
    "- 已确认需求项是唯一权威基线；如果原始需求与需求项冲突，必须以需求项为准。",
    "- 必须把 sequence/activity/class/table/usecase 中能影响页面行为的数据关系、状态和异常分支落到 businessLogic。",
    "- pageFlows 至少 2 个页面，简单需求也要包含总览/核心流程；route 必须以 / 开头。",
    "- 不要输出 UI 风格建议；视觉主题由下一步 plan_code_ui 决定。",
    "",
    "原始需求：",
    requirementText,
    "",
    "已确认需求项：",
    stringifyForPrompt(rules, 12000),
    "",
    "设计阶段模型：",
    stringifyForPrompt(designModels, 20000),
    "",
    "PlantUML 源：",
    stringifyForPrompt(designPlantUml, 16000),
  ].join("\n");
}

export function buildGenerateCodeUiBlueprintPrompt(
  codeContext: unknown,
  businessLogicOrAppBlueprint: CodeBusinessLogic | CodeAppBlueprint,
) {
  return [
    "请作为产品界面设计师，根据业务逻辑制定前端原型界面方案。",
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
    "",
    "强约束：",
    "- 这一步不是 skill，而是从业务逻辑确定界面方案的必做 function calling。",
    "- 主题风格、布局密度、导航模型和状态表达必须从 businessLogic 的领域、角色、页面流程、状态机和异常分支推导。",
    "- 避免空壳营销页、单调卡片堆叠和软件工程实训平台默认工作台风格。",
    "- 不要生成 UI IR、文件计划或代码；ui-ux-pro-max 会在下一步直接生成前端代码。",
    "",
    "精简代码上下文：",
    stringifyForPrompt(codeContext, 12000),
    "",
    "业务逻辑：",
    stringifyForPrompt(businessLogicOrAppBlueprint, 12000),
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
    "- 避免空壳营销页、泛化仪表盘、单调卡片堆叠和软件工程实训平台默认工作台风格。",
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
    "Token 必须服务于业务领域，不要复制软件工程实训平台默认工作台视觉。",
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
  selectedCodeSkills: CodeSkillSelection[] = [],
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
    "- 如果存在 Code Skills，文件计划必须吸收其文件结构、运行环境和质量约束。",
    "",
    "当前启用的 Code Skills（摘要）：",
    formatSelectedCodeSkillsForPrompt(selectedCodeSkills, 6000),
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
    "请根据已确认需求项和前端原型代码规格生成 Sandpack 可运行文件集合。",
    "返回 JSON 对象，格式必须是 {\"bundle\":{\"files\":{},\"entryFile\":\"/src/App.tsx\",\"dependencies\":{}}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "技术约束：",
    "- 生成 React + TypeScript + Tailwind 代码。",
    "- files 至少包含 /src/App.tsx、/src/components/WorkspaceShell.tsx、/src/domain/types.ts、/src/data/mock-data.ts、/src/styles.css。",
    "- entryFile 必须是 /src/App.tsx。",
    "- dependencies 只列运行原型必需依赖，默认可使用 react、react-dom、lucide-react。",
    "- 不要使用真实网络请求；用 mock-data.ts 表达从数据库设计/设计类图推导的数据。",
    "- UI 主题必须使用 spec.theme，并契合需求背景；不要使用软件工程实训平台风格作为业务原型主题。",
    "- 所有代码必须完整，不要省略 import、类型、组件实现或样式。",
    "",
    "代码规格：",
    JSON.stringify(spec, null, 2),
    "",
    "原始需求：",
    requirementText,
    "",
    "已确认需求项：",
    JSON.stringify(rules, null, 2),
    "",
    "设计阶段模型：",
    JSON.stringify(designModels, null, 2),
  ].join("\n");
}

export function buildGenerateCodeAgentPlanPrompt(
  codeContext: unknown,
  existingFiles: Record<string, string>,
  selectedCodeSkills: CodeSkillSelection[] = [],
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
    "- 计划必须明确如何应用当前启用的 Code Skills。",
    "",
    "当前启用的 Code Skills（摘要）：",
    formatSelectedCodeSkillsForPrompt(selectedCodeSkills, 6000),
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
  existingFiles: Record<string, string>,
  generationContext?: CodeGenerationPromptContext,
) {
  return [
    "请作为 ui-ux-pro-max 主设计执行器，根据已冻结的界面方案生成前端原型文件操作。",
    "返回 JSON 对象，格式必须是 {\"operations\":[...]}，其中 create_file/update_file 必须包含完整文件 content。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    CODE_GENERATION_SEMANTICS,
    "",
    "文件操作协议：",
    "- 每个操作必须使用字段 operation，不能使用 type、action、op、kind。",
    "- 每个 operation 对象必须包含 operation, path, content, reason, message 五个字段；不适用字段填空字符串。",
    "- create_file: operation=\"create_file\", path, content, reason；message 填空字符串。",
    "- update_file: operation=\"update_file\", path, content, reason；message 填空字符串。",
    "- set_entry_file: operation=\"set_entry_file\", path, reason；content 和 message 填空字符串。",
    "- note: operation=\"note\", message；path、content、reason 填空字符串。",
    "- create_file/update_file 的 content 必须是完整文件正文，不能只给 diff、片段、说明或 Markdown 代码围栏。",
    "",
    "文件要求：",
    "- 必须生成或更新 /src/App.tsx、/src/components/WorkspaceShell.tsx、/src/domain/types.ts、/src/data/mock-data.ts、/src/styles.css。",
    "- 必须覆盖 businessLogic.pageFlows 中的页面、操作、状态、权限和异常分支。",
    "- 至少 2 个页面文件、至少 3 个组件文件；默认做 3 到 5 个页面。",
    "- 可以按需求新增 /src/components/*、/src/pages/*、/src/features/*、/src/lib/*，但必须保证所有 import 都能解析。",
    "- 不要生成 /index.html 或 /src/main.tsx，服务端已经提供稳定骨架。",
    "- 不要为了修改浏览器标题而生成 /index.html；应用名称必须在 React 中通过 useEffect 设置 document.title。",
    "- operations 必须覆盖完整可运行原型所需的文件，并直接提供完整文件正文。",
    "- 不要使用真实网络请求，使用 /src/data/mock-data.ts。",
    "- ui-ux-pro-max 已在 plan_code_ui 形成界面方案；本步骤只能执行方案，不能重新规划视觉方向。",
    "- 必须优先消费 skillResourcePlan 声明后获得的 skillContext 查询结果；这些结果高于 SKILL.md 中的通用示例。",
    "- 必须使用 react + html-tailwind + shadcn 资源形成实现方案；页面和业务组件必须主要使用 Tailwind utility class，而不是主要依赖大段普通 CSS class。",
    "- 必须生成 /src/lib/utils.ts，提供 cn(...inputs)，内部使用 clsx + tailwind-merge。",
    "- 必须生成至少 3 个 /src/components/ui/* 本地 shadcn 风格组件；默认优先 button.tsx、badge.tsx、card.tsx，需要弹窗/标签页/选择器时再加 dialog.tsx、tabs.tsx、select.tsx。",
    "- 必须使用 class-variance-authority 定义至少一个组件 variants，并通过 cn() 组合 className。",
    "- 可以使用 Radix UI、class-variance-authority、clsx、tailwind-merge 和 shadcn 风格本地组件；必须把所有组件源码随 operations 一起提供，不能引用不存在的组件。",
    "- 不得生成 shadcn CLI 配置、components.json、tailwind.config.*、postcss.config.* 或依赖构建期 Tailwind 插件；预览阶段使用浏览器内 Tailwind runtime。",
    "- UI 必须契合需求背景主题，不能默认套软件工程实训平台风格。",
    "- 必须执行 visualDirection.promptBrief；先把视觉方向转成设计系统，再落到页面、组件、色彩、字体、密度和动效。",
    "- 必须综合 styles/products/colors/typography 等视觉资源查询结果，不能只生成普通后台表格。",
    "- 默认必须是浅色主题；即使 skillContext 返回 dark-mode、dramatic、crypto、neon 等深色资源，也只能作为可选深色模式，不能覆盖默认浅色。",
    "- 必须实现可见的浅色/深色主题切换控件，建议放在顶部栏右侧；使用 React state 切换 data-theme 或 class。",
    "- 必须使用 CSS variables 定义两套主题，例如 :root 与 [data-theme=\"dark\"]；浅色主题至少包含 --bg、--surface、--text、--muted、--primary、--border。",
    "- 禁止把 #050506、#030304、#000、#000000、rgb(0,0,0) 或 black 作为页面主背景；深色主题应使用 #0f172a、#111827、#18181b 等柔和深色。",
    "- 必须做响应式布局：代码页窄 iframe 与新窗口宽 viewport 下都必须可用；可以布局不同，但不能内容挤压、遮挡、横向溢出或关键操作不可见。",
    "- 不要把主体界面塞进单个大组件；页面负责流程，组件负责复用展示。",
    "- App.tsx 应只负责挂载 WorkspaceShell，WorkspaceShell 负责导航和页面切换。",
    "- 必须体现 businessLogic.pageFlows[].route 的页面路径，但只能用内存模拟路由表和 React state 切换页面，例如 currentRoute/setCurrentRoute；可以在 UI 中显示当前模拟路径。",
    "- 禁止使用 BrowserRouter、createBrowserRouter、history.pushState、history.replaceState、window.location、location.href、location.assign、location.replace 或绝对 URL 跳转；预览运行在 about:srcdoc，真实 history 导航会触发 SecurityError。",
    "- 如果确实需要路由概念，优先自己实现轻量 mock route state；不要依赖真实浏览器地址栏，也不要把路径拼成 http(s):// 域名。",
    "- 必须执行 ui-ux-pro-max skill；若 skill 与用户需求或 businessLogic 冲突，以用户需求和 function calling 输出为准。",
    "- 禁止只输出 note 或说明，必须输出实际 create_file/update_file 文件操作。",
    "- 不要把权限边界、服务边界、过滤条件、函数名、规则溯源等说明性文本直接显示在业务页面上，例如不要在用户界面中展示“游客：查看列表、详情、申请注册”“findPublishedPublicEvents 过滤”等规则说明。",
    "- 允许维护根级 /BUSINESS_CONTEXT.md 来承载项目背景、权限边界、规则溯源和服务边界；不要放到 /src/docs/*，也不要把这些说明性规则渲染进业务 UI。",
    "- 新链路不生成界面图、不解析界面图、不生成 UI IR、不单独生成文件计划或 agent plan。",
    "视觉方向（必须执行）：",
    stringifyForPrompt(generationContext?.visualDirection ?? null, 8000),
    "",
    "Skill 资源预览计划：",
    stringifyForPrompt(generationContext?.skillResourceDiscoveryPlan ?? null, 8000),
    "",
    "Skill 资源预览结果（用于理解 CSV 结构和用途）：",
    stringifyForPrompt(generationContext?.skillResourcePreviews ?? null, 12000),
    "",
    "Skill 资源查询计划（模型已声明、API 已验证执行）：",
    stringifyForPrompt(generationContext?.skillResourcePlan ?? null, 8000),
    "",
    "Skill action 查询结果（必须优先使用）：",
    stringifyForPrompt(generationContext?.codeSkillContext ?? null, 18000),
    "",
    "当前启用的 Skill 摘要：",
    formatSelectedCodeSkillsForPrompt(generationContext?.selectedCodeSkills, 6000),
    "",
    "业务逻辑（必须覆盖）：",
    stringifyForPrompt(generationContext?.businessLogic ?? null, 12000),
    "",
    "界面方案：",
    "新链路不单独提供 uiBlueprint，ui-ux-pro-max 必须在本步骤从业务逻辑直接完成界面方案并落到代码。",
    "",
    "需要修复的质量问题：",
    stringifyForPrompt(generationContext?.qualityIssues ?? [], 6000),
    "",
    "精简代码上下文：",
    stringifyForPrompt(codeContext, 14000),
    "",
    "当前文件内容：",
    stringifyForPrompt(existingFiles, 18000),
  ].join("\n");
}

export function buildRepairCodeFileOperationsPrompt(
  codeContext: unknown,
  existingFiles: Record<string, string>,
  previousOutput: string,
  parseError: string,
  generationContext?: CodeGenerationPromptContext,
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
    "- create_file/update_file 的 content 必须是完整文件正文，不能只给 diff、片段、说明或 Markdown 代码围栏。",
    "- 禁止使用 type/action/op/kind 代替 operation。",
    "- 必须使用模块化路径：/src/App.tsx、/src/components/*、/src/domain/types.ts、/src/data/mock-data.ts、/src/styles.css。",
    "- 不要生成或修改 /index.html；如果需要体现应用名称，必须在 React 中通过 useEffect 设置 document.title。",
    "- 必须覆盖 businessLogic.pageFlows、frontendOperations、stateMachines、permissions 和 edgeCases。",
    "- UI 内容和主题必须由 ui-ux-pro-max 从 businessLogic 推导，不要套软件工程实训平台风格。",
    "- 必须执行 visualDirection.promptBrief，修复时也要保留视觉方向，而不是退回普通后台表格。",
    "- 必须综合 styles/products/colors/typography 等视觉资源查询结果修复视觉系统。",
    "- 默认必须修复为浅色主题，并保留可见的浅色/深色主题切换控件；深色只能作为用户主动切换后的模式。",
    "- 必须使用 :root 与 [data-theme=\"dark\"] 或等价 CSS variables 定义两套主题；浅色主题至少包含 --bg、--surface、--text、--muted、--primary、--border。",
    "- 如果发现 #050506、#030304、#000、#000000、rgb(0,0,0) 或 black 作为页面主背景，必须替换为浅色默认背景，并为深色模式选择柔和深色。",
    "- 必须优先使用 skillResourcePlan 声明后获得的 skillContext 查询结果来修复设计系统、布局、组件和交互问题。",
    "- 必须使用 react + html-tailwind + shadcn 资源修复实现方案；页面和业务组件必须主要使用 Tailwind utility class，而不是主要依赖大段普通 CSS class。",
    "- 必须生成 /src/lib/utils.ts，提供 cn(...inputs)，内部使用 clsx + tailwind-merge。",
    "- 必须生成至少 3 个 /src/components/ui/* 本地 shadcn 风格组件；默认优先 button.tsx、badge.tsx、card.tsx，需要弹窗/标签页/选择器时再加 dialog.tsx、tabs.tsx、select.tsx。",
    "- 必须使用 class-variance-authority 定义至少一个组件 variants，并通过 cn() 组合 className；若缺少这套结构，必须补齐，不能退回普通 CSS。",
    "- 可以使用 Radix UI、class-variance-authority、clsx、tailwind-merge 和 shadcn 风格本地组件；必须把所有组件源码随 operations 一起提供；若引用了缺失的本地组件，必须补齐文件。",
    "- 不得生成 shadcn CLI 配置、components.json、tailwind.config.*、postcss.config.* 或依赖构建期 Tailwind 插件；预览阶段使用浏览器内 Tailwind runtime。",
    "- 必须保持响应式布局：窄 iframe 和新窗口宽 viewport 都不能出现内容挤压、遮挡、横向溢出或关键操作不可见。",
    "- 修复路由时只能使用内存模拟路由表和 React state，保留 businessLogic.pageFlows[].route 作为模拟 path 字符串。",
    "- 禁止 BrowserRouter、createBrowserRouter、history.pushState、history.replaceState、window.location、location.href、location.assign、location.replace 和绝对 URL 跳转；如果已经生成这些代码，必须替换为 mock route state 或普通按钮 setState。",
    "- 必须执行 ui-ux-pro-max；若 skill 与用户需求或 businessLogic 冲突，以 function calling 输出为准。",
    "- 禁止只输出 note 或说明，必须输出实际 create_file/update_file 操作。",
    "- 不要把权限边界、服务边界、过滤条件、函数名、规则溯源等说明性文本直接显示在业务页面上；这些内容只能进入根级 /BUSINESS_CONTEXT.md，不能放入 /src/docs/*。",
    "- 可见 UI 只呈现真实业务流程、业务数据、用户可执行操作、状态反馈和异常处理。",
    "视觉方向（必须执行）：",
    stringifyForPrompt(generationContext?.visualDirection ?? null, 8000),
    "",
    "Skill 资源预览计划：",
    stringifyForPrompt(generationContext?.skillResourceDiscoveryPlan ?? null, 8000),
    "",
    "Skill 资源预览结果（用于理解 CSV 结构和用途）：",
    stringifyForPrompt(generationContext?.skillResourcePreviews ?? null, 12000),
    "",
    "Skill 资源查询计划（模型已声明、API 已验证执行）：",
    stringifyForPrompt(generationContext?.skillResourcePlan ?? null, 8000),
    "",
    "Skill action 查询结果（必须优先使用）：",
    stringifyForPrompt(generationContext?.codeSkillContext ?? null, 18000),
    "",
    "当前启用的 Skill 摘要：",
    formatSelectedCodeSkillsForPrompt(generationContext?.selectedCodeSkills, 6000),
    "",
    "业务逻辑（必须覆盖）：",
    stringifyForPrompt(generationContext?.businessLogic ?? null, 12000),
    "",
    "界面方案：",
    "新链路不单独提供 uiBlueprint，ui-ux-pro-max 必须在修复中补齐界面主题、导航、布局、组件和状态表达。",
    "",
    "需要修复的质量问题：",
    stringifyForPrompt(generationContext?.qualityIssues ?? [], 6000),
    "",
    "精简代码上下文：",
    stringifyForPrompt(codeContext, 14000),
    "",
    "当前文件内容：",
    stringifyForPrompt(existingFiles, 18000),
    "",
    "上一次 operations 输出：",
    truncateForPrompt(previousOutput, 12000),
    "",
    "解析或校验错误：",
    parseError,
  ].join("\n");
}

export function buildGenerateCodeSkillResourcePlanPrompt(
  businessLogic: CodeBusinessLogic,
  loadedCodeSkill: LoadedCodeSkill,
  visualDirection?: CodeVisualDirection | null,
  skillResourcePreviews?: CodeSkillResourcePreviewResult | null,
) {
  const manifest = loadedCodeSkill.fileManifest.map((file) => ({
    relativePath: file.relativePath,
    kind: file.kind,
    size: file.size,
  }));

  return [
    "请作为 opencode-like skill runtime 的规划步骤，阅读 ui-ux-pro-max 的 SKILL.md 摘要和文件清单，自主声明本次生成 React 原型需要查询哪些 skill 资源。",
    "返回 JSON 对象，格式必须是 {\"skillResourcePlan\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    "",
    "skillResourcePlan 字段：",
    "- skillName: 必须是 ui-ux-pro-max。",
    "- alias: 使用 @web-design。",
    "- query: 面向本业务的一句话检索词，包含产品类型、领域、页面、关键交互、React、responsive、accessible。",
    "- requests: 1 到 8 个资源请求；每个请求必须包含 resourceType, name, query, csvPath, stack, domain, actionName, maxResults, reason。",
    "- diagnostics: 字符串数组；没有诊断则 []。",
    "",
    "resourceType 可选值：",
    "- design-system: 需要设计系统/风格/颜色/字体/密度时使用；csvPath、stack、domain、actionName 填空字符串。",
    "- stack: 查询技术栈规则；React 原型必须声明 stack=react、stack=shadcn、stack=html-tailwind。",
    "- domain: 查询 UX 或 chart 等领域规则；domain 可用 ux、chart。只有业务逻辑包含图表/统计/趋势/报表时才声明 chart。",
    "- csv: 当你根据 fileManifest 明确知道要读某个 data/**/*.csv 时使用；csvPath 必须是 skill 内相对路径，例如 data/ux-guidelines.csv。",
    "- action: 只有确实需要 scripts/search.py 的增强结果时声明；actionName 必须来自 skill.actions.json 的 action 名称。默认优先用 CSV，不要为了常规 React 原型声明 action。",
    "",
    "重要约束：",
    "- 当前目标固定是浏览器内运行的 Web React 原型，不是 React Native、Expo、iOS、Android 或 Flutter 应用。",
    "- 你已经拿到 skillResourcePreviews，必须根据 headers/sampleRows 判断每个 CSV 是否有用，不要只根据文件名猜测。",
    "- 必须查询 Web React 核心实现资源：stack=react、stack=shadcn、stack=html-tailwind 与 domain=ux。",
    "- 对视觉表现，优先从预览中选择与 visualDirection 匹配的资源，例如 data/styles.csv、data/products.csv、data/colors.csv、data/typography.csv。",
    "- 不要声明所有 CSV；只声明本次业务必要的少量资源。",
    "- 必须声明 Tailwind utility、CSS variables、Radix UI 和 shadcn 风格本地组件相关资源；不要声明需要 shadcn CLI、components.json 或构建期 Tailwind 配置的资源。",
    "- 不要声明移动端/原生端资源，例如 data/draft.csv、data/app-interface.csv、data/stacks/react-native.csv、data/stacks/flutter.csv、data/stacks/swiftui.csv。",
    "- 查询 UX 资源时只使用 Web / All / React 相关规则，不能把 React Native 的 haptics、SafeAreaView、Expo、Reanimated、Pressable 等规则注入 Web 原型。",
    "- 如果查询到 dark-mode 资源，只能用于可选深色主题；默认主题必须保持浅色，并需要查询或推导对应浅色 token。",
    "- 不要声明会写文件的 action；不要使用 --persist。",
    "- maxResults 推荐 5 到 8。",
    "",
    "ui-ux-pro-max SKILL.md 摘要：",
    truncateForPrompt(loadedCodeSkill.content, 9000),
    "",
    "可用文件清单：",
    stringifyForPrompt(manifest, 10000),
    "",
    "视觉方向：",
    stringifyForPrompt(visualDirection ?? null, 8000),
    "",
    "Skill 资源预览结果：",
    stringifyForPrompt(skillResourcePreviews ?? null, 14000),
    "",
    "业务逻辑：",
    stringifyForPrompt(businessLogic, 12000),
  ].join("\n");
}

export function buildGenerateCodeVisualDirectionPrompt(
  businessLogic: CodeBusinessLogic,
  loadedCodeSkill: LoadedCodeSkill,
) {
  return [
    "请为当前 Web React 原型生成明确的视觉方向 brief，让后续代码生成像优秀官网 demo 一样有清晰风格，而不是普通后台表格。",
    "返回 JSON 对象，格式必须是 {\"visualDirection\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "visualDirection 字段：productType, targetAudience, toneKeywords, styleKeywords, colorMood, typographyMood, layoutMood, componentTexture, interactionMood, avoidStyles, promptBrief。",
    "- promptBrief 必须是一句适合直接指导 UI 生成的英文短句，包含产品类型、视觉风格、颜色气质、组件质感和交互气质。",
    "- 当前目标是 Web React，不是 React Native / Expo / Flutter。",
    "- 默认浅色友好，可提供深色切换，但不要使用纯黑或近纯黑作为默认主背景。",
    "",
    "ui-ux-pro-max SKILL.md 摘要：",
    truncateForPrompt(loadedCodeSkill.content, 7000),
    "",
    "业务逻辑：",
    stringifyForPrompt(businessLogic, 12000),
  ].join("\n");
}

export function buildGenerateCodeSkillResourceDiscoveryPrompt(
  businessLogic: CodeBusinessLogic,
  loadedCodeSkill: LoadedCodeSkill,
  visualDirection: CodeVisualDirection | null,
) {
  const manifest = loadedCodeSkill.fileManifest.map((file) => ({
    relativePath: file.relativePath,
    kind: file.kind,
    size: file.size,
  }));

  return [
    "请作为 opencode-like skill runtime 的资源理解步骤，先声明要预览哪些 CSV 资源，再由 API 返回 header 和样例行。",
    "返回 JSON 对象，格式必须是 {\"skillResourceDiscoveryPlan\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "skillResourceDiscoveryPlan 字段：",
    "- skillName: 必须是 ui-ux-pro-max。",
    "- alias: 使用 @web-design。",
    "- requests: 1 到 10 个资源预览请求；每个请求包含 path, reason, expectedUse。",
    "- diagnostics: 字符串数组；没有诊断则 []。",
    "",
    "选择规则：",
    "- 只能预览 data/**/*.csv。",
    "- 必须预览 Web React 核心与视觉核心资源：data/styles.csv、data/products.csv、data/colors.csv、data/typography.csv、data/ux-guidelines.csv、data/stacks/react.csv、data/stacks/shadcn.csv、data/stacks/html-tailwind.csv。",
    "- 可按 visualDirection 选择 data/icons.csv、data/google-fonts.csv、data/ui-reasoning.csv、data/react-performance.csv。",
    "- 只有 landing/营销页才预览 data/landing.csv；只有图表/统计/趋势业务才预览 data/charts.csv。",
    "- 禁止预览移动端/原生端资源：data/draft.csv、data/app-interface.csv、data/stacks/react-native.csv、data/stacks/flutter.csv、data/stacks/swiftui.csv。",
    "",
    "视觉方向：",
    stringifyForPrompt(visualDirection ?? null, 8000),
    "",
    "可用文件清单：",
    stringifyForPrompt(manifest, 10000),
    "",
    "业务逻辑：",
    stringifyForPrompt(businessLogic, 12000),
  ].join("\n");
}

export function buildVerifyCodeUiFidelityPrompt(
  businessLogic: CodeBusinessLogic,
  uiBlueprint: CodeUiBlueprint | null,
  fidelityCheckContext: unknown,
): string {
  return [
    "请检查当前 React 原型代码是否覆盖业务逻辑，以及 ui-ux-pro-max 应从业务逻辑推导出的界面方案。",
    "返回 JSON 对象，格式必须是 {\"uiFidelityReport\":{...}}。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "",
    "uiFidelityReport 字段结构：",
    "- passed: 如果页面、状态、操作、数据关系、权限/异常分支和业务化界面表达基本覆盖则为 true，否则为 false。",
    "- matched[]: 已经在代码中体现的业务与界面要求。",
    "- missing[]: 没有实现或明显偏离 businessLogic 的页面、状态、操作、异常分支和业务化界面表达。",
    "- repairSuggestions[]: 可直接指导下一轮代码修复的中文建议。",
    "- summary: 一句话中文总结。",
    "",
    "检查规则：",
    "- 当前原型文件不是完整文件树，而是还原检查专用上下文；criticalFiles、pageFiles、supportingFiles 中的内容优先用于判断。",
    "- omittedFiles 只表示文件被压缩或省略，不得把 omittedFiles 中的辅助文件直接判定为缺失。",
    "- 若 deterministicCheck.fileFacts 已说明 /src/App.tsx、WorkspaceShell 或页面文件存在，不得再笼统声称“未包含 App 或具体页面组件”。",
    "- 业务路径只需要通过模拟 route state / mock route table / PageKey 页面状态体现，不要求 BrowserRouter、真实地址栏路由或 history API。",
    "- 判断重点是页面是否可操作、状态流转、权限差异、异常分支、mock 数据绑定和主要操作按钮，而不是是否使用真实浏览器路由。",
    "",
    "业务逻辑：",
    stringifyForPrompt(businessLogic, 10000),
    "",
    "界面方案：",
    uiBlueprint
      ? stringifyForPrompt(uiBlueprint, 8000)
      : "新链路不单独提供 uiBlueprint；请按 businessLogic 判断界面是否足够业务化、可操作、非空泛。",
    "",
    "当前原型还原检查上下文：",
    stringifyForPrompt(fidelityCheckContext, 26000),
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
