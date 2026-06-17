// Owns document context shaping and section normalization before DOCX rendering.
import {
  documentContentResultSchema,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DiagramKind,
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
    ? ["function", "activity", "usecase", "class", "deployment", "prototype", "analysis"]
    : ["architecture", "sequence", "class", "activity", "table", "component", "deployment"];
}

const FORBIDDEN_DOCUMENT_PATTERNS = [
  /当前阶段未明确/u,
  /待补充/u,
  /待完善/u,
  /后续评审/u,
  /后续补充/u,
  /后续.*补充/u,
  /见(?:上文|下文|前文|后文|[^。；，,]*小节|[^。；，,]*章节|[^。；，,]*部分)/u,
  /参考(?:上文|下文|前文|后文|[^。；，,]*小节|[^。；，,]*章节|[^。；，,]*部分)/u,
];

const FALLBACK_FACT = "由需求文本、模型元素和追踪关系综合确定";

export function textHasForbiddenDocumentPlaceholder(text: string) {
  return FORBIDDEN_DOCUMENT_PATTERNS.some((pattern) => pattern.test(text));
}

function sectionTextValues(section: DocumentSection) {
  return [
    section.title,
    ...section.body,
    ...(section.table?.headers ?? []),
    ...(section.table?.rows.flat() ?? []),
  ];
}

export function findForbiddenDocumentPhrases(sections: DocumentSection[]) {
  const matches = new Set<string>();
  for (const section of sections) {
    for (const text of sectionTextValues(section)) {
      for (const pattern of FORBIDDEN_DOCUMENT_PATTERNS) {
        const match = text.match(pattern)?.[0];
        if (match) matches.add(match);
      }
    }
  }
  return Array.from(matches);
}

function sanitizeFallbackText(text: string, fallback = FALLBACK_FACT) {
  return textHasForbiddenDocumentPlaceholder(text) ? fallback : text;
}

function compactText(value: string | undefined | null, fallback = FALLBACK_FACT) {
  const text = value?.trim();
  return text ? sanitizeFallbackText(text, fallback) : fallback;
}

function compactJoin(values: Array<string | undefined | null>, fallback = FALLBACK_FACT) {
  const filtered = values.map((value) => value?.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join("；") : fallback;
}

function briefText(value: string, maxChars = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "系统围绕用户提交的业务目标组织功能、数据、界面和运行约束。";
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function sectionBodyFromLines(lines: string[], fallback: string) {
  const body = lines.map((line) => line.trim()).filter(Boolean);
  return body.length > 0 ? body : [fallback];
}

function useCaseModels(input: StartDocumentRunRequest): UseCaseDiagramSpec[] {
  return input.requirementModels.filter(
    (model): model is UseCaseDiagramSpec => model.diagramKind === "usecase",
  );
}

function requirementModel<TKind extends DiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.requirementModels.find(
    (model): model is Extract<DiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function requirementModels<TKind extends DiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.requirementModels.filter(
    (model): model is Extract<DiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function designModel<TKind extends DesignDiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.designModels.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function designModels<TKind extends DesignDiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.designModels.filter(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function sequenceModelIdForUseCaseId(useCaseId: string) {
  return `sequence:${useCaseId}`;
}

function analysisModelIdForUseCaseId(useCaseId: string) {
  return `analysis:${useCaseId}`;
}

function requirementUseCases(input: StartDocumentRunRequest): UseCaseDiagramSpec["useCases"] {
  const useCases = useCaseModels(input).flatMap((model) => model.useCases);
  if (useCases.length > 0) return useCases;
  const sequenceUseCases = designModels(input, "sequence")
    .filter((model) => model.sourceUseCaseId || model.modelId)
    .map((model, index) => {
      const sourceUseCaseId =
        model.sourceUseCaseId ??
        model.modelId?.replace(/^sequence:/u, "") ??
        `UC-${index + 1}`;
      return {
        id: sourceUseCaseId,
        name: model.sourceUseCaseName ?? model.title,
        goal: model.summary,
        description: model.summary,
        preconditions: ["用户具备访问系统并提交业务信息的条件"],
        postconditions: ["系统完成业务处理、返回处理结果并保留必要记录"],
        supportingActorIds: [],
        eventFlows: [],
      };
    });
  if (sequenceUseCases.length > 0) return sequenceUseCases;
  return [
    {
      id: "UC-1",
      name: "核心业务处理",
      goal: briefText(input.requirementText),
      description: briefText(input.requirementText),
      preconditions: ["用户具备访问系统并提交业务信息的条件"],
      postconditions: ["系统完成业务处理、返回处理结果并保留必要记录"],
      supportingActorIds: [],
      eventFlows: [
        {
          id: "flow-main",
          name: "主业务流程",
          flowType: "main",
          trigger: "用户发起业务操作",
          steps: [
            {
              order: 1,
              actor: "actor",
              actorAction: "提交业务请求",
              systemAction: "校验请求、执行业务规则并组织结果数据",
              expectedResult: "用户获得处理结果，系统记录业务状态",
            },
          ],
        },
      ],
    },
  ];
}

function useCaseActorIds(useCase: ReturnType<typeof requirementUseCases>[number]) {
  return [useCase.primaryActorId, ...useCase.supportingActorIds].filter(
    (actorId): actorId is string => Boolean(actorId),
  );
}

function allActors(input: StartDocumentRunRequest) {
  return useCaseModels(input).flatMap((model) => model.actors);
}

function requirementActors(input: StartDocumentRunRequest, actorIds: string[]) {
  const actors = allActors(input);
  const selected = actorIds
    .map((actorId) => actors.find((actor) => actor.id === actorId)?.name)
    .filter(Boolean);
  if (selected.length > 0) return selected;
  if (actors.length > 0) return actors.map((actor) => actor.name);
  return ["主要用户"];
}

function actorDescriptionBody(input: StartDocumentRunRequest) {
  const actors = allActors(input);
  if (actors.length === 0) {
    return [
      "主要用户负责发起系统业务操作、提交业务数据并接收系统反馈；外部系统或服务在需求文本涉及集成时承担数据交换、通知或认证等支撑职责。",
    ];
  }
  return actors.map((actor) => {
    const responsibilities = compactJoin(actor.responsibilities, "承担与其角色相关的业务操作和结果确认");
    return `${actor.name}：${actor.description ?? responsibilities}。职责：${responsibilities}。`;
  });
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
    return [`事件流：${compactText(useCase.description, useCase.goal)}`];
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

function requirementRulesBody(input: StartDocumentRunRequest) {
  if (input.rules.length === 0) {
    return [`文本需求：${briefText(input.requirementText, 260)}`];
  }
  return input.rules.map((rule) => `${rule.id}（${rule.category}）：${rule.text}`);
}

function rulesForDiagram(input: StartDocumentRunRequest, diagramKind: DiagramKind) {
  return input.rules.filter((rule) => rule.relatedDiagrams.includes(diagramKind));
}

function requirementTraceRows(input: StartDocumentRunRequest, diagramKind: DiagramKind) {
  const traceRows = input.requirementModelTraceability
    .filter((entry) => entry.target.diagramKind === diagramKind)
    .map((entry, index) => [
      String(index + 1),
      entry.ruleId,
      entry.target.label,
      entry.rationale ?? "规则文本与模型元素语义一致",
    ]);
  if (traceRows.length > 0) return traceRows;

  const relatedRules = rulesForDiagram(input, diagramKind);
  if (relatedRules.length > 0) {
    return relatedRules.map((rule, index) => [
      String(index + 1),
      rule.id,
      rule.text,
      "由规则关联的模型类型推导",
    ]);
  }

  return [["1", "需求文本", briefText(input.requirementText, 120), FALLBACK_FACT]];
}

function designTraceRows(input: StartDocumentRunRequest, diagramKind: DesignDiagramKind) {
  const rows = input.designModelTraceability
    .filter((entry) => entry.source.diagramKind === diagramKind)
    .map((entry, index) => [
      String(index + 1),
      entry.source.label,
      entry.targets.map((target) => target.label).join("、"),
      entry.rationale ?? "设计元素与需求模型元素语义一致",
    ]);
  if (rows.length > 0) return rows;
  return [["1", documentDiagramLabel(diagramKind), "需求模型元素", FALLBACK_FACT]];
}

function requirementClasses(input: StartDocumentRunRequest) {
  const model = requirementModel(input, "class");
  return model && "classes" in model ? model.classes : [];
}

function designClasses(input: StartDocumentRunRequest) {
  const model = designModel(input, "class");
  return model && "classes" in model ? model.classes : [];
}

function designTables(input: StartDocumentRunRequest) {
  const model = designModel(input, "table");
  return model && "tables" in model ? model.tables : [];
}

function functionStructureBody(input: StartDocumentRunRequest) {
  const model = requirementModel(input, "function");
  if (!model || model.nodes.length === 0) {
    return rulesForDiagram(input, "function").map(
      (rule) => `功能项 ${rule.id}：${rule.text}`,
    );
  }
  return model.nodes.map((node) => {
    const source = node.sourceRequirementIds.length > 0
      ? `，来源需求：${node.sourceRequirementIds.join("、")}`
      : "";
    return `${node.name}：${node.description ?? "承担系统功能分解中的业务能力"}${source}。`;
  });
}

function activityBody(input: StartDocumentRunRequest, stage: "requirement" | "design") {
  const model = stage === "requirement"
    ? requirementModel(input, "activity")
    : designModel(input, "activity");
  if (!model || model.nodes.length === 0) {
    return [
      stage === "requirement"
        ? "总体业务流程围绕用户发起操作、系统校验处理、业务状态更新和结果反馈展开。"
        : "界面关系围绕入口页面、业务表单、状态反馈、列表详情和返回路径组织。",
    ];
  }
  const laneNames = model.swimlanes.map((lane) => lane.name);
  const nodeNames = model.nodes
    .filter((node) => node.type !== "start" && node.type !== "end")
    .map((node) => node.name ?? node.description)
    .filter(Boolean);
  return [
    `参与泳道：${compactJoin(laneNames, "业务参与方和系统处理节点")}。`,
    `关键节点：${compactJoin(nodeNames, "用户操作、系统校验、状态更新和结果反馈")}。`,
    `流程关系数量：${model.relationships.length}，用于表达活动之间的控制流和条件流转。`,
  ];
}

function classDescriptionBody(classes: ReturnType<typeof requirementClasses>) {
  if (classes.length === 0) {
    return [
      "领域对象围绕需求文本中的业务名词、状态数据和操作结果组织，用于承接功能需求中的核心数据结构。",
    ];
  }
  return classes.map((item) => {
    const attributes = item.attributes.map((attribute) => attribute.name).join("、");
    const operations = item.operations.map((operation) => operation.name).join("、");
    return `${item.name}：${item.description ?? item.type ?? "业务领域对象"}；属性：${
      attributes || "由业务字段构成"
    }；操作：${operations || "以领域职责和业务规则驱动"}。`;
  });
}

function classRelationBody(model: Extract<DiagramModelSpec | DesignDiagramModelSpec, { diagramKind: "class" }> | undefined) {
  if (!model || model.relationships.length === 0) {
    return ["类之间围绕业务对象的拥有、引用、依赖和继承关系组织，保证功能处理过程中的数据语义一致。"];
  }
  return model.relationships.map((relation) => {
    const source = model.classes.find((item) => item.id === relation.sourceId)?.name ?? relation.sourceId;
    const target = model.classes.find((item) => item.id === relation.targetId)?.name ?? relation.targetId;
    return `${source} 与 ${target}：${relation.type}${
      relation.label ? `，${relation.label}` : ""
    }${relation.description ? `，${relation.description}` : ""}。`;
  });
}

function deploymentBody(
  model: Extract<DiagramModelSpec | DesignDiagramModelSpec, { diagramKind: "deployment" }> | undefined,
  stage: "requirement" | "design",
) {
  if (!model) {
    return [
      stage === "requirement"
        ? "运行环境由应用服务、数据存储、外部系统和访问终端构成，部署需求强调网络连通、服务可访问和数据持久化。"
        : "部署设计将应用组件、数据存储和外部依赖分配到可交付节点，保证运行环境与组件边界一致。",
    ];
  }
  const nodes = model.nodes.map((node) => `${node.name}（${node.nodeType}）`);
  const components = model.components.map((component) => component.name);
  const databases = model.databases.map((database) => database.name);
  return [
    `部署节点：${compactJoin(nodes, "应用节点、数据节点和访问终端")}。`,
    `部署组件：${compactJoin(components, "业务服务、界面服务和支撑组件")}。`,
    `数据存储：${compactJoin(databases, "系统数据存储")}。`,
    `连接关系数量：${model.relationships.length}，用于表达部署、通信、托管和依赖关系。`,
  ];
}

function prototypeBody(input: StartDocumentRunRequest) {
  const model = requirementModel(input, "prototype");
  if (!model || model.nodes.length === 0) {
    return [
      "界面需求围绕用户入口、业务表单、列表详情、结果反馈和错误提示组织，界面跳转保持业务流程连续。",
    ];
  }
  return [
    `界面节点：${compactJoin(model.nodes.map((node) => `${node.name}（${node.nodeType}）`))}。`,
    `界面关系：${compactJoin(
      model.relationships.map((relation) => relation.label ?? relation.type),
      "导航、包含、提交、返回和依赖关系",
    )}。`,
  ];
}

function architectureBody(input: StartDocumentRunRequest) {
  const model = designModel(input, "architecture");
  if (!model) {
    return [
      "系统架构按表现层、业务层、数据层和外部集成边界组织，核心依赖从需求功能分解和设计类职责中抽取。",
    ];
  }
  return [
    `架构包：${compactJoin(model.packages.map((item) => item.name), "表现层、业务层、数据层和外部集成层")}。`,
    `核心组件：${compactJoin(model.components.map((item) => item.name), "业务组件、数据组件和接口组件")}。`,
    `架构依赖数量：${model.relationships.length}，用于表达包、组件和子系统之间的调用或包含关系。`,
  ];
}

function componentBody(input: StartDocumentRunRequest) {
  const model = designModel(input, "component");
  if (!model) {
    return [
      "组件设计按设计类职责划分业务组件、接口组件和数据访问组件，组件之间通过清晰接口协作。",
    ];
  }
  return [
    `组件：${compactJoin(model.components.map((item) => `${item.name}${item.componentType ? `（${item.componentType}）` : ""}`))}。`,
    `接口：${compactJoin(model.interfaces.map((item) => item.name), "组件提供和依赖的业务接口")}。`,
    `组件关系数量：${model.relationships.length}，用于表达依赖、提供接口、需要接口、组合和通信关系。`,
  ];
}

function sequenceModelForUseCase(
  input: StartDocumentRunRequest,
  useCase: ReturnType<typeof requirementUseCases>[number],
) {
  return designModels(input, "sequence").find(
    (model) =>
      model.sourceUseCaseId === useCase.id ||
      model.modelId === sequenceModelIdForUseCaseId(useCase.id),
  );
}

function analysisModelForUseCase(
  input: StartDocumentRunRequest,
  useCase: ReturnType<typeof requirementUseCases>[number],
) {
  return requirementModels(input, "analysis").find(
    (model) =>
      model.sourceUseCaseId === useCase.id ||
      model.modelId === analysisModelIdForUseCaseId(useCase.id),
  );
}

function sequenceBody(
  model: Extract<DiagramModelSpec | DesignDiagramModelSpec, { diagramKind: "sequence" | "analysis" }> | undefined,
  useCase: ReturnType<typeof requirementUseCases>[number],
  stage: "analysis" | "design",
) {
  if (!model) {
    return [
      stage === "analysis"
        ? `${useCase.name} 的需求分析围绕参与者请求、系统响应、领域对象协作和结果反馈展开。`
        : `${useCase.name} 的实现方案围绕边界对象、控制对象、服务对象、实体对象和数据访问对象之间的方法调用展开。`,
      ...useCaseEventFlowBody(useCase),
    ];
  }
  const participants = model.participants.map((participant) => `${participant.name}（${participant.participantType}）`);
  const messages = model.messages.map((message) => message.name);
  return [
    `参与对象：${compactJoin(participants, "参与者、边界对象、控制对象、实体对象和数据对象")}。`,
    `消息调用：${compactJoin(messages, "请求、校验、处理、保存和返回结果")}。`,
    `组合片段数量：${model.fragments.length}，用于表达条件、循环、并行或可选流程。`,
  ];
}

function requirementUseCaseClassRows(input: StartDocumentRunRequest) {
  const classes = requirementClasses(input);
  return requirementUseCases(input).map((useCase, index) => [
    String(index + 1),
    useCase.name,
    compactJoin(requirementActors(input, useCaseActorIds(useCase)), "主要用户"),
    compactJoin(classes.map((item) => item.name), "由领域概念模型承接的业务对象"),
    compactJoin(
      input.rules
        .filter((rule) => rule.relatedDiagrams.includes("usecase"))
        .map((rule) => rule.id),
      "由用例目标和事件流推导",
    ),
  ]);
}

function designUseCaseInterfaceRows(input: StartDocumentRunRequest) {
  const prototype = requirementModel(input, "prototype");
  return requirementUseCases(input).map((useCase, index) => {
    const screens =
      prototype?.nodes
        .filter((node) => node.sourceUseCaseIds.includes(useCase.id))
        .map((node) => node.name) ?? [];
    return [
      String(index + 1),
      useCase.name,
      compactJoin(screens, "与该用例交互路径一致的界面节点"),
      "界面入口、表单提交、状态反馈和返回路径支撑该用例",
    ];
  });
}

function designUseCaseObjectClassRows(input: StartDocumentRunRequest) {
  const classes = designClasses(input);
  return requirementUseCases(input).map((useCase, index) => {
    const participants = sequenceModelForUseCase(input, useCase)?.participants ?? [];
    return [
      String(index + 1),
      useCase.name,
      compactJoin(participants.map((item) => item.name), "边界对象、控制对象、服务对象和实体对象"),
      compactJoin(classes.map((item) => item.name), "由设计类图承接的设计类"),
      "用例实现设计通过对象协作映射到设计类职责",
    ];
  });
}

function classTableRows(input: StartDocumentRunRequest) {
  const tables = designTables(input);
  const classes = designClasses(input).filter((item) =>
    ["entity", "aggregate"].includes(item.classKind ?? ""),
  );
  const persistentClasses = classes.length > 0 ? classes : designClasses(input);
  const sourceClasses = persistentClasses.length > 0
    ? persistentClasses
    : [{ name: "核心业务对象" }];
  return sourceClasses.map((item, index) => [
    String(index + 1),
    item.name,
    tables[index]?.name ?? `${item.name}数据表`,
    "表结构依据持久化类的标识、属性和关联关系组织",
  ]);
}

function tableDesignBody(input: StartDocumentRunRequest) {
  const tables = designTables(input);
  if (tables.length === 0) {
    return ["数据库表围绕持久化类、业务主键、状态字段、时间字段和关联外键组织，支撑核心业务数据的保存与查询。"];
  }

  return tables.flatMap((table) => [
    `${table.name}：${table.description ?? "保存对应业务对象及其状态数据"}`,
    ...table.columns.map((column) => {
      const constraints = [
        column.isPrimaryKey ? "主键" : undefined,
        column.isForeignKey ? "外键" : undefined,
        column.nullable ? "可空" : "非空",
        column.references
          ? `引用 ${column.references.tableId}.${column.references.columnId}`
          : undefined,
      ].filter(Boolean);
      return `字段 ${column.name}，类型 ${column.dataType}，限制：${constraints.join("、") || "按业务规则约束"}。`;
    }),
  ]);
}

function tableRelationBody(input: StartDocumentRunRequest) {
  const model = designModel(input, "table");
  if (!model || model.relationships.length === 0) {
    return ["表之间通过业务标识、外键字段和关联表组织一对一、一对多或多对多关系，保证查询和更新的一致性。"];
  }
  return model.relationships.map((relation) => {
    const source = model.tables.find((table) => table.id === relation.sourceTableId)?.name ?? relation.sourceTableId;
    const target = model.tables.find((table) => table.id === relation.targetTableId)?.name ?? relation.targetTableId;
    return `${source} 与 ${target}：${relation.type}${relation.label ? `，${relation.label}` : ""}${relation.description ? `，${relation.description}` : ""}。`;
  });
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
      entry.rationale ?? "低置信追踪关系，生成文档时保留复核标识",
    ]);
}

function unresolvedRequirementIssuesBody(input: StartDocumentRunRequest) {
  return [
    `需求书已围绕 ${input.rules.length || 1} 条需求线索和 ${input.requirementModels.length || 1} 类需求模型组织说明。实现前重点校验模型元素命名、异常流程、权限边界、部署资源和数据字段是否与代码实现保持一致。`,
  ];
}

function unresolvedDesignIssuesBody(input: StartDocumentRunRequest) {
  return [
    `设计书已围绕 ${input.designModels.length || 1} 类设计模型组织说明。编码和联调阶段重点校验接口方法、数据表字段、组件依赖、部署节点和界面状态流转是否与设计模型保持一致。`,
  ];
}

export function buildDocumentContext(input: StartDocumentRunRequest) {
  return {
    documentKind: input.documentKind,
    requirementText: input.requirementText,
    rules: input.rules,
    requirementModels: input.requirementModels,
    requirementModelTraceability: input.requirementModelTraceability,
    requirementPlantUml: input.requirementPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSource: Boolean(artifact.source),
    })),
    requirementSvgArtifacts: input.requirementSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSvg: Boolean(artifact.svg),
    })),
    designModels: input.designModels,
    designModelTraceability: input.designModelTraceability,
    designPlantUml: input.designPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSource: Boolean(artifact.source),
    })),
    designSvgArtifacts: input.designSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSvg: Boolean(artifact.svg),
    })),
    canonicalSections: fallbackDocumentSections(input).map((section) => ({
      level: section.level,
      title: section.title,
      diagramKind: section.diagramKind,
      diagramModelId: section.diagramModelId,
      tableHeaders: section.table?.headers,
    })),
    forbiddenPhrases: [
      "当前阶段未明确",
      "待补充",
      "待完善",
      "后续评审",
      "后续补充",
      "见某小节/章节/部分",
    ],
  };
}

export function fallbackDocumentSections(input: StartDocumentRunRequest): DocumentSection[] {
  if (input.documentKind === "requirementsSpec") {
    const useCases = requirementUseCases(input);
    const requirementClass = requirementModel(input, "class");
    const requirementDeployment = requirementModel(input, "deployment");
    return documentContentResultSchema.parse({
      sections: [
        { level: 1, title: "项目引言", body: [] },
        { level: 2, title: "编写目的", body: ["本文档基于需求文本、需求规则、需求模型和模型追踪关系，说明系统目标、功能边界、数据对象、运行环境、界面关系和需求分析结果，为后续设计、实现和测试提供可追踪依据。"] },
        { level: 2, title: "基线", body: [`基线由 ${input.rules.length || 1} 条需求线索、${input.requirementModels.length || 1} 类需求模型、PlantUML 图源和渲染图产物组成。`] },
        { level: 2, title: "定义与标识", body: [`需求项以规则编号和模型元素标识表达；用例以 UC 标识表达；图产物按 ${expectedDocumentDiagramKinds("requirementsSpec").join("、")} 分类组织。`] },
        { level: 2, title: "参考资料", body: ["参考资料为用户输入的原始需求文本、平台抽取的需求规则、需求阶段 UML 模型、PlantUML 图源、SVG 图产物和元素级追踪关系。"] },
        { level: 1, title: "需求概述", body: [] },
        { level: 2, title: "系统目标", body: [`系统目标：${briefText(input.requirementText, 320)}`] },
        { level: 2, title: "文本需求", body: requirementRulesBody(input) },
        { level: 2, title: "功能结构", body: ["功能结构图按照系统能力、子功能和功能依赖组织，表达需求文本中的功能分解关系。"], diagramKind: "function" },
        { level: 3, title: "功能结构详述", body: sectionBodyFromLines(functionStructureBody(input), "功能结构由需求规则中的业务能力分解形成。") },
        { level: 3, title: "跟踪关系", body: ["功能结构与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "function") } },
        { level: 2, title: "总体业务流程", body: ["总体业务流程图描述跨角色业务活动、条件分支、状态流转和结果反馈。"], diagramKind: "activity" },
        { level: 3, title: "总体业务流程详述", body: activityBody(input, "requirement") },
        { level: 3, title: "跟踪关系", body: ["总体业务流程与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "activity") } },
        { level: 1, title: "功能需求（用例模型）", body: [] },
        { level: 2, title: "用例图", body: ["用例图表达系统边界、参与者、用例目标和用例之间的包含、扩展或泛化关系。"], diagramKind: "usecase" },
        { level: 2, title: "用户（角色）和跟踪关系", body: actorDescriptionBody(input), table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "usecase") } },
        ...useCases.map((useCase) => ({
          level: 2 as const,
          title: `用例：${useCase.name}`,
          body: [
            `用例标识：${useCase.id}`,
            `概述：${compactText(useCase.description, useCase.goal)}`,
            `执行者：${compactJoin(requirementActors(input, useCaseActorIds(useCase)), "主要用户")}`,
            `前置条件：${compactJoin(useCase.preconditions, "用户具备访问系统并提交业务信息的条件")}`,
            ...useCaseEventFlowBody(useCase),
            `后置条件：${compactJoin(useCase.postconditions, "系统完成业务处理、返回结果并记录状态")}`,
          ],
        })),
        { level: 1, title: "数据需求（领域概念模型）", body: [] },
        { level: 2, title: "领域概念模型", body: ["领域概念模型描述业务对象、属性、关系和约束，承接功能需求中的数据语义。"], diagramKind: "class" },
        { level: 2, title: "类的描述", body: classDescriptionBody(requirementClasses(input)) },
        { level: 2, title: "类与类的关系", body: classRelationBody(requirementClass) },
        { level: 2, title: "跟踪矩阵", body: ["领域概念模型与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "class") } },
        { level: 1, title: "运行需求", body: [] },
        { level: 2, title: "部署需求模型", body: ["部署需求模型表达需求阶段可识别的运行节点、外部系统、数据存储、通信关系和部署约束。"], diagramKind: "deployment" },
        { level: 2, title: "部署描述", body: deploymentBody(requirementDeployment, "requirement") },
        { level: 2, title: "跟踪矩阵", body: ["部署需求模型与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "deployment") } },
        { level: 1, title: "界面需求", body: [] },
        { level: 2, title: "界面关系图", body: ["原型界面关系图描述页面、模块、入口点、提交动作和返回路径。"], diagramKind: "prototype" },
        { level: 2, title: "界面总体描述", body: prototypeBody(input) },
        { level: 2, title: "跟踪矩阵", body: ["界面需求与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "prototype") } },
        { level: 1, title: "需求分析", body: [] },
        ...useCases.flatMap((useCase) => {
          const model = analysisModelForUseCase(input, useCase);
          return [
            {
              level: 2 as const,
              title: `用例 ${useCase.name} 的分析`,
              body: sequenceBody(model, useCase, "analysis"),
              diagramKind: "analysis",
              diagramModelId: model?.modelId ?? analysisModelIdForUseCaseId(useCase.id),
            },
            {
              level: 3 as const,
              title: "顺序图的描述",
              body: sequenceBody(model, useCase, "analysis"),
            },
            {
              level: 3 as const,
              title: "跟踪关系",
              body: ["需求分析模型与需求规则的对应关系如下。"],
              table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "analysis") },
            },
          ];
        }),
        { level: 1, title: "其它需求", body: [] },
        { level: 2, title: "性能需求", body: ["系统应在主要业务流程中保持稳定响应，查询、提交、状态更新和结果反馈需要支持课程项目规模下的连续操作；批量数据、长列表和复杂图形展示应采用分页、缓存或异步处理降低等待时间。"] },
        { level: 2, title: "安全需求", body: ["系统应保护用户身份、业务数据和操作记录；登录态、权限边界、输入校验、异常提示和数据访问过程需要防止越权、错误提交和敏感信息泄露。"] },
        { level: 2, title: "操作需求", body: ["系统操作应围绕清晰入口、明确反馈、可恢复错误和可追踪结果组织；用户提交、编辑、删除、查询和导出操作需要保持状态提示一致。"] },
        { level: 2, title: "其它需求约束", body: ["系统应保持需求模型、设计模型、代码实现和测试用例之间的追踪一致；部署、数据字段、接口命名和异常流程应与模型元素保持同源。"] },
        { level: 1, title: "尚未解决的问题", body: unresolvedRequirementIssuesBody(input) },
        { level: 1, title: "附录", body: [] },
        { level: 2, title: "术语表", body: [`模型类型：${expectedDocumentDiagramKinds("requirementsSpec").map((kind) => documentDiagramLabel(kind)).join("、")}。`] },
        { level: 2, title: "需求原始资料", body: [briefText(input.requirementText, 1200)] },
      ],
    }).sections;
  }

  const useCases = requirementUseCases(input);
  const designClass = designModel(input, "class");
  const designDeployment = designModel(input, "deployment");
  return documentContentResultSchema.parse({
    sections: [
      { level: 1, title: "引言", body: [] },
      { level: 2, title: "系统概述", body: [`系统概述：${briefText(input.requirementText, 320)}`] },
      { level: 2, title: "基线", body: [`设计基线由 ${input.requirementModels.length || 1} 类需求模型、${input.designModels.length || 1} 类设计模型和 ${input.designModelTraceability.length || 1} 组设计追踪关系组成。`] },
      { level: 2, title: "定义与标识", body: ["设计模型按总体架构图、用例实现设计、设计类图、界面关系图、数据库设计、组件（构件）关系和部署设计组织；用例实现设计以 sequence:<useCaseId> 标识。"] },
      { level: 2, title: "参考资料", body: ["参考资料为需求规格内容、需求阶段 UML 模型、设计阶段 UML 模型、PlantUML 图源、SVG 图产物和模型追踪关系。"] },
      { level: 1, title: "系统总体架构 (System Architecture)", body: [] },
      { level: 2, title: "系统总体逻辑流程设计", body: ["本节复用需求阶段总体业务流程图，说明设计方案需要承接的业务活动、条件分支和状态流转。"], diagramKind: "activity", diagramModelId: "requirement:activity" },
      { level: 3, title: "流程描述", body: activityBody(input, "requirement") },
      { level: 3, title: "跟踪关系", body: ["总体逻辑流程与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素", "追踪依据"], rows: requirementTraceRows(input, "activity") } },
      { level: 2, title: "系统架构设计", body: architectureBody(input), diagramKind: "architecture" },
      { level: 3, title: "总体架构描述", body: architectureBody(input) },
      { level: 3, title: "跟踪关系", body: ["总体架构与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "关联需求元素", "追踪依据"], rows: designTraceRows(input, "architecture") } },
      { level: 1, title: "用例实现设计 (Use Case Realization)", body: [] },
      ...useCases.flatMap((useCase) => {
        const model = sequenceModelForUseCase(input, useCase);
        return [
          {
            level: 2 as const,
            title: `用例 ${useCase.name} 的实现方案`,
            body: sequenceBody(model, useCase, "design"),
            diagramKind: "sequence",
            diagramModelId: model?.modelId ?? sequenceModelIdForUseCaseId(useCase.id),
          },
          {
            level: 3 as const,
            title: "方案描述",
            body: sequenceBody(model, useCase, "design"),
          },
          {
            level: 3 as const,
            title: "跟踪关系",
            body: ["用例实现设计与需求模型元素的对应关系如下。"],
            table: { headers: ["编号", "设计元素", "关联需求元素", "追踪依据"], rows: designTraceRows(input, "sequence") },
          },
        ];
      }),
      { level: 1, title: "领域模型设计 (Static Class & Domain Model)", body: [] },
      { level: 2, title: "设计类图", body: ["设计类图表达实体类、服务类、值对象、接口和类之间的静态关系。"], diagramKind: "class" },
      { level: 2, title: "设计类描述", body: classDescriptionBody(designClasses(input)) },
      { level: 2, title: "设计类之间的关系", body: classRelationBody(designClass) },
      { level: 2, title: "需求到类跟踪矩阵 (Use Case-to-Class Matrix)", body: ["用例、对象和设计类的对应关系如下。"], table: { headers: ["编号", "用例名称", "对象名称", "设计类名称", "追踪依据"], rows: designUseCaseObjectClassRows(input) } },
      { level: 1, title: "交互响应与前端组件设计 (UI/UX Componentization)", body: [] },
      { level: 2, title: "界面关系图", body: ["设计阶段界面关系图表达界面节点、状态反馈、表单提交和返回路径。"], diagramKind: "activity" },
      { level: 2, title: "界面的详述", body: activityBody(input, "design") },
      { level: 2, title: "跟踪关系", body: ["用例与界面的对应关系如下。"], table: { headers: ["编号", "用例名称", "界面名称", "追踪依据"], rows: designUseCaseInterfaceRows(input) } },
      { level: 1, title: "数据库设计 (Persistence & Data Strategy)", body: [] },
      { level: 2, title: "表与表的关系图", body: ["表关系图表达数据表、主键、外键和表间基数关系。"], diagramKind: "table" },
      { level: 2, title: "表的详述", body: tableDesignBody(input) },
      { level: 2, title: "表与表的关系详述", body: tableRelationBody(input) },
      { level: 2, title: "跟踪关系", body: ["数据库设计与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "关联需求元素", "追踪依据"], rows: designTraceRows(input, "table") } },
      { level: 1, title: "组件设计", body: [] },
      { level: 2, title: "设计阶段的组件关系图", body: ["组件（构件）关系图表达组件、接口、依赖、组合和通信关系。"], diagramKind: "component" },
      { level: 2, title: "组件描述", body: componentBody(input) },
      { level: 2, title: "跟踪矩阵", body: ["组件设计与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "关联需求元素", "追踪依据"], rows: designTraceRows(input, "component") } },
      { level: 1, title: "部署设计与交付 (Deployment & CI/CD)", body: [] },
      { level: 2, title: "设计阶段的部署图", body: ["部署设计图表达组件、节点、数据库和外部系统之间的交付关系。"], diagramKind: "deployment" },
      { level: 2, title: "部署描述", body: deploymentBody(designDeployment, "design") },
      { level: 2, title: "跟踪矩阵", body: ["部署设计与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "关联需求元素", "追踪依据"], rows: designTraceRows(input, "deployment") } },
      ...(pendingDesignTraceabilityRows(input).length > 0
        ? [
            {
              level: 1 as const,
              title: "低置信追踪关系复核",
              body: ["以下关系由系统保留为低置信映射，生成文档时单独列出以便维护追踪证据。"],
              table: {
                headers: ["编号", "设计模型", "设计元素", "关联需求元素", "说明"],
                rows: pendingDesignTraceabilityRows(input),
              },
            },
          ]
        : []),
      { level: 1, title: "尚未设计的问题", body: unresolvedDesignIssuesBody(input) },
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

function containsForbiddenContent(section: DocumentSection) {
  return sectionTextValues(section).some(textHasForbiddenDocumentPlaceholder);
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
      if (!generatedSection || containsForbiddenContent(generatedSection)) {
        return section;
      }

      const generatedTableHasForbidden = generatedSection.table
        ? containsForbiddenContent({
            level: generatedSection.level,
            title: generatedSection.title,
            body: [],
            table: generatedSection.table,
          })
        : false;

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
                generatedSection.table.rows.length > 0 &&
                !generatedTableHasForbidden
                  ? generatedSection.table.rows
                  : section.table.rows,
            }
          : generatedTableHasForbidden
            ? undefined
            : generatedSection.table,
      };
    }),
  }).sections;
}

export function diagramPlantUmlForDocument(input: StartDocumentRunRequest) {
  const map = new Map<string, string>();
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementPlantUml
      : input.designPlantUml;
  for (const artifact of artifacts) {
    map.set(artifact.modelId ?? artifact.diagramKind, artifact.source);
  }
  if (input.documentKind === "softwareDesignSpec") {
    const requirementActivity = input.requirementPlantUml.find(
      (artifact) => artifact.diagramKind === "activity",
    );
    if (requirementActivity) {
      map.set("requirement:activity", requirementActivity.source);
    }
  }
  return map;
}

export function diagramSvgKindsForDocument(input: StartDocumentRunRequest) {
  const set = new Set<string>();
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementSvgArtifacts
      : input.designSvgArtifacts;
  for (const artifact of artifacts) {
    set.add(artifact.modelId ?? artifact.diagramKind);
  }
  if (input.documentKind === "softwareDesignSpec") {
    const requirementActivity = input.requirementSvgArtifacts.find(
      (artifact) => artifact.diagramKind === "activity",
    );
    if (requirementActivity) {
      set.add("requirement:activity");
    }
  }
  return set;
}

export function documentDiagramLabel(diagramKind: string, sectionTitle?: string) {
  const title = sectionTitle?.replace(LEADING_NUMBER_PATTERN, "").trim();
  if (title) return title;
  const labels: Record<string, string> = {
    function: "功能结构图",
    usecase: "用例图",
    class: "领域概念模型",
    activity: "总体业务流程",
    deployment: "部署需求模型",
    prototype: "原型界面关系",
    analysis: "需求分析模型",
    architecture: "总体架构图",
    sequence: "用例实现设计",
    component: "组件（构件）关系",
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
    allowedSource.includes(match) ? match : "软件系统",
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
        sanitizeFallbackText(
          replaceUnprovidedInstitutionNames(paragraph, allowedSource),
          "本节内容依据需求文本、模型元素和追踪关系整理为完整说明。",
        ),
      ),
      table: section.table
        ? {
            headers: section.table.headers.map((cell) =>
              replaceUnprovidedInstitutionNames(cell, allowedSource),
            ),
            rows: section.table.rows.map((row) =>
              row.map((cell) =>
                sanitizeFallbackText(
                  replaceUnprovidedInstitutionNames(cell, allowedSource),
                ),
              ),
            ),
          }
        : undefined,
    })),
  }).sections;
}
