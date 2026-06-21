// Requirement, design, model, and traceability prompt builders used by generation pipelines.
import type {
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DiagramKind,
  DiagramModelSpec,
  ModelElementRef,
  RequirementBaseline,
  RequirementRule,
} from "@uml-platform/contracts";

export const JSON_ONLY_SYSTEM_PROMPT =
  "你是一个严谨的软件需求与 UML 建模助手。你必须只返回 JSON，不要输出 Markdown、解释或代码围栏。";

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
      function: "功能结构图",
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
    if (kind === "function") {
      lines.push(
        "本次只生成功能结构图：必须输出 nodes/relationships，并用 decomposition 关系表达功能分解树，禁止输出用例、类、流程或部署结构作为主模型。",
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
      "本次是用例模型生成：models 只能包含 diagramKind=\"usecase\" 的模型，禁止输出 function/analysis/class/activity/deployment/prototype。",
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
  if (include("function")) {
    lines.push(
      "- function: 必须包含 nodes, relationships，用于 PlantUML MindMap（@startmindmap）表示功能结构图。",
      "  nodes[].字段：id, name, description(可选), parentId(可选), sourceRequirementIds(string[])。每个节点表示一个功能、子功能或功能分组。",
      "  relationships[].字段：id, type(decomposition|dependency), sourceId, targetId, label(可选), description(可选)。decomposition 表示功能分解父子关系，dependency 只表示跨功能依赖。",
      "  功能结构图必须根据文本需求项抽取功能分解，不要输出用例 actors/useCases、流程 swimlanes 或部署节点作为主结构。",
    );
  }
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
      "  interfaces[].字段：id, name, chineseName(可选), englishName(可选), type(可选), constraints(string[], 可选), description(可选), operations(array)。",
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
      "  fragments[].字段：id, type(alt|opt|loop|par), label, messageIds(string[]), condition(可选), description(可选)。fragment.id 必须唯一；alt 必须至少包含两个非空分支；loop 只能包裹真实重复步骤，禁止把整段流程包成 loop；不得输出空 messageIds 或空分支。",
    );
  }
  return lines;
}

const REQUIREMENT_STAGE_SEMANTICS = [
  "需求阶段模型职责：",
  "- 功能结构图(function): 只根据功能需求/业务规则抽取系统功能层级，用 PlantUML MindMap 表示功能分解；不得纳入非功能需求、界面需求或部署约束，不输出 dependency 关系和备注块。",
  "- 用例模型(usecase): 明确系统边界，直观展示“谁（角色）能做什么（用例）”，并为每个关键用例补充主事件流、备选事件流和异常事件流。",
  "- 领域概念模型(class): 只描述业务领域内的核心概念实体、属性及实体之间的关联，不表达服务、控制器、仓储或对象方法。",
  "- 总体业务流程(activity): 描述跨角色的业务活动、分支、并行和结束条件，不表达 UI 页面跳转。",
  "- 部署需求模型(deployment): 描述需求阶段可识别的部署约束、外部系统、网络拓扑和通信协议。",
  "- 原型界面关系(prototype): 描述页面、模块、入口点及它们之间的导航、打开、提交、返回和依赖关系。",
  "- 需求分析模型(analysis): 以用例事件流为依据，描述需求阶段的参与对象、消息和组合片段，用于支撑用例实现设计。",
].join("\n");

const REQUIREMENT_TRACEABILITY_RULES = [
  "需求 traceability 约束：",
  "- target.diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis。",
  "- 禁止把 requirements、requirement、design、model、traceability、page 等阶段名或页面名作为 diagramKind。",
  "- target.elementId 必须引用本次需求模型中真实存在的元素 id 或 relationship id；表字段类元素使用 tableId.columnId 形式。",
  "- 矩阵会展示的每一个需求业务元素和 relationship 都必须至少映射到一条需求规则，不能遗漏。",
  "- 业务元素范围：功能结构图的功能节点/关系；用例图的角色/用例/关系；类图的类/接口/枚举/关系；总体业务流程的 activity/decision 节点及这些节点之间的关系；部署需求模型的节点/数据库/组件/外部系统/制品/关系；原型界面关系的页面/模块/入口点/关系；需求分析模型的参与对象/消息/组合片段。",
  "- 不要为 system-boundary、swimlane、start/end/merge/fork/join 等结构元素补映射。",
  "- 如果错误提示包含非法 diagramKind，必须改成该元素实际所属的具体图类型，不允许继续返回阶段名。",
  "- 可选字段 mappingSource/reviewStatus/confidence/rationale 只用于说明映射来源和复核状态；不确定的低置信映射必须标记 reviewStatus=pending、confidence=low 并写明 rationale。",
].join("\n");

const DESIGN_TRACEABILITY_RULES = [
  "设计 traceability 约束：",
  "- 设计侧 source 必须包含 modelId；用例实现设计元素的 modelId 必须是对应 sequence:<useCaseId>，聚合下游设计模型可使用 architecture/class/activity/component/deployment/table。",
  "- 下游聚合设计模型元素如果由用例实现设计推导，必须在 upstreamDesignRefs 中列出参与推导的用例实现设计元素引用。",
  "- source.diagramKind 只能使用: architecture, sequence, class, activity, component, deployment, table。",
  "- targets[].diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis。",
  "- 禁止把 requirements、requirement、design、model、traceability、page 等阶段名或页面名作为 diagramKind。",
  "- source.elementId 必须引用本次设计模型中真实存在的元素 id 或 relationship id；表字段类元素使用 tableId.columnId 形式。",
  "- targets[].elementId 必须引用输入需求模型中真实存在的元素 id 或 relationship id。",
  "- 矩阵会展示的每一个设计业务元素和 relationship 都必须至少映射到一个需求模型元素，不能遗漏。",
  "- 业务元素范围：总体架构图的包/组件/关系；用例实现设计的参与对象/消息/组合片段；设计类图的类/接口/枚举/关系；界面关系图的 activity/decision 节点及这些节点之间的关系；组件关系图的组件/接口/关系；部署设计的节点/数据库/组件/外部系统/制品/关系；数据库设计的表/字段/关系。",
  "- 不要为 swimlane、start/end/merge/fork/join 等结构元素补映射。",
  "- 如果错误提示包含非法 diagramKind，必须改成该元素实际所属的具体图类型，不允许继续返回阶段名。",
  "- 可选字段 mappingSource/reviewStatus/confidence/rationale 只用于说明映射来源和复核状态；不确定或派生的低置信映射必须标记 reviewStatus=pending、confidence=low 并写明 rationale。",
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
      [
        "nodes",
        diagramKind === "function"
          ? "function"
          : diagramKind === "deployment"
            ? "deployment-node"
            : "activity-node",
      ],
      ["packages", "package"],
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
    "请从下面的软件工程实践平台需求中抽取结构化需求规则。",
    "输出 JSON，必须符合接口 schema；不要输出 Markdown、解释或代码块。",
    "每条规则必须表达 id、分类、可读需求文本 text、原文片段 sourceFragment 和关联图类型。",
    "text 必须是完整可读的业务规则句，至少尽量包含角色/执行者、动作、对象或主体；不要只输出“(1)借书”这类编号短片段。",
    "sourceFragment 保留原始需求中的最小来源片段，可以包含编号或省略句，用于追踪来源。",
    "relatedDiagrams 只能使用: function, usecase, class, activity, deployment, prototype, analysis。",
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
    "如果返回 requirementModelTraceability，字段为 ruleId, target；target 字段为 diagramKind, elementId, elementKind, label；低置信映射可带 reviewStatus/confidence/rationale。",
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
    "fragments[].字段：id, type(alt|opt|loop|par), label, messageIds(string[]), condition(可选), description(可选)。fragment.id 必须唯一；alt 必须至少包含两个非空分支；loop 只能包裹真实重复步骤，禁止把整段流程包成 loop；不得输出空 messageIds 或空分支。",
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
    "diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis。",
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
  "- 总体架构图(architecture): 系统逻辑架构层，根据需求功能结构和 RequirementBaseline 中已确认规则/约束划分包、子系统、核心组件及其依赖，用 PlantUML 包图表示。",
  "- 用例实现设计(sequence): 动态行为层，必须基于用例事件流和需求分析模型，确定对象间具体的方法调用时序，包含正常流程与异常动态行为。",
  "- 界面关系图(activity): 界面交互层，描述原型界面、模块、入口点与用例实现之间的跳转、提交、打开、返回和状态流转。",
  "- 类图(class): 静态结构层，定义实体、接口、聚合根的属性、行为及静态关联（1:N、泛化等）。",
  "- 组件（构件）关系(component): 组件结构层，根据设计类图归并服务、接口、模块和实体职责，展示组件与接口依赖。",
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
  "  多分支 alt 必须优先输出 branches: [{label, condition(可选), messageIds}]，每个分支的 messageIds 不得交叠；渲染时 branches 会生成 PlantUML alt/else/end 分隔线。fragment.id 必须唯一；alt 至少两个非空分支；loop 只包裹真实重复步骤，禁止把整段流程包成 loop；不得输出空 messageIds 或空分支。",
  "- 所有设计模型都必须包含 notes 字段，且 notes 永远是字符串数组；没有备注时输出 []，不要输出字符串。",
  "- architecture: 必须包含 packages, components, relationships。",
  "  packages[].字段：id, name, stereotype(可选), description(可选), componentIds(string[])。",
  "  components[].字段：id, name, componentType(可选), packageId(可选), description(可选), sourceRequirementIds(string[])。",
  "  relationships[].字段：id, type(contains|dependency|communication), sourceId, targetId, label(可选), description(可选)。",
  "- sequence.messages[].type 只能使用 sync|async|return|create|destroy；response/reply/result 必须写 return，request/call 必须写 sync，event/notify 必须写 async。",
  "- class.classes[].classKind 只能使用 entity|aggregate|valueObject|service|other；不确定时用 other 或省略，不能输出中文、自造枚举或 controller 等非枚举值。",
  "- activity/class/deployment 必须沿用需求阶段对应图的强类型字段，不允许输出通用 nodes/relations 旧结构。",
  "  classes[].字段：id, name, chineseName(可选), englishName(可选), type(可选), constraints(string[], 可选), classKind(entity|aggregate|valueObject|service|other, 可选), stereotype(可选), description(可选), attributes(array), operations(array)。",
  "  classes[].attributes[].字段：name, chineseName(可选), englishName(可选), type, constraints(string[], 可选), visibility(public|protected|private|package), required(可选), multiplicity(可选), defaultValue(可选), description(可选)。",
  "  interfaces[].字段：id, name, chineseName(可选), englishName(可选), type(可选), constraints(string[], 可选), description(可选), operations(array)。",
  "- component: 必须包含 components, interfaces, relationships。",
  "  components[].字段：id, name, componentType(可选), description(可选), sourceClassIds(string[])。",
  "  interfaces[].字段：id, name, description(可选), operationNames(string[])。",
  "  relationships[].字段：id, type(dependency|provided-interface|required-interface|composition|communication), sourceId, targetId, label(可选), description(可选)。",
  "- table: 必须包含 tables, relationships。",
  "  tables[].字段：id, name, chineseName(可选), englishName(可选), type(可选), constraints(string[], 可选), description(可选), columns(array)。",
  "  columns[].字段：id, name, chineseName(可选), englishName(可选), dataType, constraints(string[], 可选), isPrimaryKey(boolean), isForeignKey(boolean), nullable(boolean), references(可选), description(可选)。",
  "  references 字段：tableId, columnId。",
  "  relationships[].字段：id, type(one-to-one|one-to-many|many-to-many), sourceTableId, targetTableId, sourceColumnId(可选), targetColumnId(可选), label(可选), description(可选)。",
  "- activity 表达设计阶段界面关系图，应从原型界面关系和用例实现设计推导界面节点、状态节点和跳转关系；重复步骤必须合并为一个节点，用多条关系汇入/汇出。",
  "- architecture 表达总体架构图，应从功能结构图和 RequirementBaseline 中已确认规则/约束推导包、子系统、核心组件和依赖，不要细化到物理部署节点。",
  "- class 表达静态结构层，类应包含操作；接口、服务、实体、聚合根要通过 classKind 或 stereotype 标明。",
  "- component 表达组件（构件）关系，应从设计类图抽取服务组件、实体组件、接口及依赖关系。",
  "- deployment 表达物理部署层，优先体现 K8s Pod、服务、数据库、外部系统及通信协议，并参考组件（构件）关系分配可部署组件。",
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
    "设计阶段禁止使用原始需求文本作为事实来源；除总体架构图可参考 RequirementBaseline 中已确认规则/约束外，不得绕过输入需求模型和上游设计模型补业务对象。",
    "需求模型和上游设计模型是结构来源；RequirementBaseline 只用于约束、验收边界、异常、权限、非功能需求、总体架构边界和可追踪性。",
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
    "本阶段生成的是下游聚合设计模型：总体架构图、设计类图、界面关系图、组件关系图、部署设计、数据库设计都各自保持一张总图，不按用例拆分。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    DESIGN_STAGE_SEMANTICS,
    DESIGN_MODEL_SCHEMA_INSTRUCTIONS,
    "设计阶段禁止使用原始需求文本作为事实来源；除总体架构图可参考 RequirementBaseline 中已确认规则/约束外，不得绕过输入需求模型和上游设计模型补业务对象。",
    "需求模型和上游设计模型是结构来源；RequirementBaseline 只用于约束、验收边界、异常、权限、非功能需求和可追踪性。",
    "禁止从 RequirementBaseline 生成没有输入需求模型或上游设计模型支撑的新业务对象。",
    "若本次生成总体架构图(architecture)，必须根据需求阶段功能结构图和 RequirementBaseline 中已确认规则/约束推导包、子系统、核心组件及其依赖。",
    "若本次生成数据库设计(table)，需求阶段来源模型只可作为可追踪 targets 的参考上下文；表结构必须从设计阶段设计类图和全部用例实现设计推导。",
    "若本次生成组件（构件）关系(component)，必须根据已生成设计类图归并组件和接口。",
    "若本次生成部署设计(deployment)，必须参考已生成组件（构件）关系，把组件映射到物理节点和通信关系。",
    "只生成以下设计图类型：",
    selectedDiagrams.join(", "),
    "",
    "映射规则：",
    "- 需求阶段功能结构图 + RequirementBaseline 中已确认规则/约束 -> 设计阶段总体架构图（architecture，包图）。",
    "- 需求阶段原型界面关系 + 全部用例级用例实现设计 -> 设计阶段界面关系图（activity，界面交互层）。",
    "- 需求阶段领域概念模型 + 全部用例级用例实现设计 -> 设计阶段类图（设计类图），类是所有用例实现设计中的类/对象/服务的归并组合。",
    "- 聚合设计类图 -> 设计阶段组件（构件）关系图。",
    "- 需求阶段部署需求模型 + 组件（构件）关系图 -> 设计阶段部署设计。",
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
    "设计阶段禁止使用原始需求文本作为事实来源；除总体架构图可参考 RequirementBaseline 中已确认规则/约束外，不得绕过输入需求模型和上游设计模型补业务对象。",
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
