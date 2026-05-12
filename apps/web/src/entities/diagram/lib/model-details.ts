import type {
  ActivityDiagramSpec,
  ActivityNode,
  ClassDiagramSpec,
  ClassEntity,
  ClassRelationship,
  DesignDiagramModelSpec,
  DeploymentDiagramSpec,
  DeploymentRelationship,
  DiagramModelSpec,
  SequenceDiagramSpec,
  SequenceMessage,
  UseCaseDiagramSpec,
  UseCaseRelationship,
} from "@uml-platform/contracts";

export type SemanticElementKind =
  | "actor"
  | "usecase"
  | "system-boundary"
  | "class"
  | "interface"
  | "enum"
  | "activity"
  | "decision"
  | "start-node"
  | "end-node"
  | "merge-node"
  | "fork-node"
  | "join-node"
  | "swimlane"
  | "deployment-node"
  | "database"
  | "component"
  | "external-system"
  | "artifact"
  | "participant"
  | "message"
  | "fragment";

export interface DetailField {
  label: string;
  value: string;
}

export interface DiagramDetailItem {
  kind: SemanticElementKind;
  id: string;
  label: string;
  description?: string;
  fields: DetailField[];
}

export interface DiagramRelationshipDetail {
  id: string;
  kind: "relationship";
  label: string;
  typeLabel: string;
  sourceId: string;
  targetId: string;
  fields: DetailField[];
}

export interface DiagramDetailGroup {
  kind: SemanticElementKind;
  label: string;
  items: DiagramDetailItem[];
}

export interface DiagramDetailModel {
  items: DiagramDetailItem[];
  groups: DiagramDetailGroup[];
  relationships: DiagramRelationshipDetail[];
}

export const SEMANTIC_KIND_META: Record<
  SemanticElementKind,
  { label: string; shortLabel: string }
> = {
  actor: { label: "角色", shortLabel: "角色" },
  usecase: { label: "用例", shortLabel: "用例" },
  "system-boundary": { label: "系统边界", shortLabel: "边界" },
  class: { label: "类", shortLabel: "类" },
  interface: { label: "接口", shortLabel: "接口" },
  enum: { label: "枚举", shortLabel: "枚举" },
  activity: { label: "活动", shortLabel: "活动" },
  decision: { label: "判断", shortLabel: "判断" },
  "start-node": { label: "开始节点", shortLabel: "开始" },
  "end-node": { label: "结束节点", shortLabel: "结束" },
  "merge-node": { label: "合并节点", shortLabel: "合并" },
  "fork-node": { label: "并发分叉", shortLabel: "分叉" },
  "join-node": { label: "并发汇合", shortLabel: "汇合" },
  swimlane: { label: "泳道", shortLabel: "泳道" },
  "deployment-node": { label: "部署节点", shortLabel: "节点" },
  database: { label: "数据库", shortLabel: "数据库" },
  component: { label: "组件", shortLabel: "组件" },
  "external-system": { label: "外部系统", shortLabel: "外部" },
  artifact: { label: "制品", shortLabel: "制品" },
  participant: { label: "参与对象", shortLabel: "对象" },
  message: { label: "调用消息", shortLabel: "消息" },
  fragment: { label: "组合片段", shortLabel: "片段" },
};

function pushField(fields: DetailField[], label: string, value?: string | null) {
  if (!value) {
    return;
  }
  fields.push({ label, value });
}

function joinList(values: string[]) {
  return values.length > 0 ? values.join("、") : "";
}

function nonEmptyGroups(groups: DiagramDetailGroup[]) {
  return groups.filter((group) => group.items.length > 0);
}

function useCaseRelationshipLabel(relation: UseCaseRelationship) {
  const meta: Record<UseCaseRelationship["type"], string> = {
    association: "关联",
    include: "包含",
    extend: "扩展",
    generalization: "泛化",
  };
  return meta[relation.type];
}

function classRelationshipLabel(relation: ClassRelationship) {
  const meta: Record<ClassRelationship["type"], string> = {
    association: "关联",
    aggregation: "聚合",
    composition: "组合",
    inheritance: "继承",
    implementation: "实现",
    dependency: "依赖",
  };
  return meta[relation.type];
}

function deploymentRelationshipLabel(relation: DeploymentRelationship) {
  const meta: Record<DeploymentRelationship["type"], string> = {
    deployment: "部署",
    communication: "通信",
    dependency: "依赖",
    hosting: "承载",
  };
  return meta[relation.type];
}

function buildUseCaseDetailModel(model: UseCaseDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.actors.map((actor) => ({
      kind: "actor" as const,
      id: actor.id,
      label: actor.name,
      description: actor.description,
      fields: [
        { label: "身份", value: actor.actorType },
        ...(actor.responsibilities.length > 0
          ? [{ label: "职责", value: joinList(actor.responsibilities) }]
          : []),
      ],
    })),
    ...model.useCases.map((useCase) => ({
      kind: "usecase" as const,
      id: useCase.id,
      label: useCase.name,
      description: useCase.description,
      fields: [
        { label: "目标", value: useCase.goal },
        ...(useCase.preconditions.length > 0
          ? [{ label: "前置条件", value: joinList(useCase.preconditions) }]
          : []),
        ...(useCase.postconditions.length > 0
          ? [{ label: "后置条件", value: joinList(useCase.postconditions) }]
          : []),
        ...(useCase.primaryActorId
          ? [{ label: "主参与者", value: useCase.primaryActorId }]
          : []),
        ...(useCase.supportingActorIds.length > 0
          ? [{ label: "协作参与者", value: joinList(useCase.supportingActorIds) }]
          : []),
      ],
    })),
    ...model.systemBoundaries.map((boundary) => ({
      kind: "system-boundary" as const,
      id: boundary.id,
      label: boundary.name,
      description: boundary.description,
      fields: [],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "条件", relation.condition);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: useCaseRelationshipLabel(relation),
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  return {
    items,
    groups: nonEmptyGroups([
      { kind: "actor", label: "角色", items: items.filter((item) => item.kind === "actor") },
      {
        kind: "usecase",
        label: "用例",
        items: items.filter((item) => item.kind === "usecase"),
      },
      {
        kind: "system-boundary",
        label: "系统边界",
        items: items.filter((item) => item.kind === "system-boundary"),
      },
    ]),
    relationships,
  };
}

function buildClassFields(entity: ClassEntity) {
  return [
    ...(entity.classKind ? [{ label: "类别", value: entity.classKind }] : []),
    ...(entity.stereotype ? [{ label: "构造型", value: entity.stereotype }] : []),
    ...(entity.attributes.length > 0
      ? [
          {
            label: "属性",
            value: entity.attributes
              .map((attribute) => `${attribute.name}: ${attribute.type}`)
              .join("；"),
          },
        ]
      : []),
    ...(entity.operations.length > 0
      ? [
          {
            label: "操作",
            value: entity.operations
              .map((operation) => operation.name)
              .join("、"),
          },
        ]
      : []),
  ];
}

function buildClassDetailModel(model: ClassDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.classes.map((entity) => ({
      kind: "class" as const,
      id: entity.id,
      label: entity.name,
      description: entity.description,
      fields: buildClassFields(entity),
    })),
    ...model.interfaces.map((entity) => ({
      kind: "interface" as const,
      id: entity.id,
      label: entity.name,
      description: entity.description,
      fields:
        entity.operations.length > 0
          ? [
              {
                label: "操作",
                value: entity.operations.map((operation) => operation.name).join("、"),
              },
            ]
          : [],
    })),
    ...model.enums.map((entity) => ({
      kind: "enum" as const,
      id: entity.id,
      label: entity.name,
      fields:
        entity.literals.length > 0
          ? [{ label: "字面量", value: joinList(entity.literals) }]
          : [],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "源角色", relation.sourceRole);
      pushField(fields, "目标角色", relation.targetRole);
      pushField(fields, "源多重性", relation.sourceMultiplicity);
      pushField(fields, "目标多重性", relation.targetMultiplicity);
      pushField(fields, "可导航性", relation.navigability);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: classRelationshipLabel(relation),
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  return {
    items,
    groups: nonEmptyGroups([
      { kind: "class", label: "类", items: items.filter((item) => item.kind === "class") },
      {
        kind: "interface",
        label: "接口",
        items: items.filter((item) => item.kind === "interface"),
      },
      { kind: "enum", label: "枚举", items: items.filter((item) => item.kind === "enum") },
    ]),
    relationships,
  };
}

function mapActivityNodeKind(node: ActivityNode): SemanticElementKind {
  switch (node.type) {
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
  }
}

function nodeLabel(node: ActivityNode) {
  if ("name" in node && node.name) {
    return node.name;
  }
  switch (node.type) {
    case "start":
      return "开始";
    case "end":
      return "结束";
    case "decision":
      return node.question ?? "条件判断";
    case "merge":
      return "合并";
    case "fork":
      return "并发分叉";
    case "join":
      return "并发汇合";
    case "activity":
      return node.name;
  }
}

function buildActivityDetailModel(model: ActivityDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.swimlanes.map((lane) => ({
      kind: "swimlane" as const,
      id: lane.id,
      label: lane.name,
      description: lane.description,
      fields: [],
    })),
    ...model.nodes.map((node) => {
      const fields: DetailField[] = [];
      if (node.type === "activity") {
        pushField(fields, "所属泳道", node.actorOrLane);
        if (node.input.length > 0) {
          fields.push({ label: "输入", value: joinList(node.input) });
        }
        if (node.output.length > 0) {
          fields.push({ label: "输出", value: joinList(node.output) });
        }
      }
      if (node.type === "decision") {
        pushField(fields, "判断条件", node.question);
      }
      return {
        kind: mapActivityNodeKind(node),
        id: node.id,
        label: nodeLabel(node),
        description: node.description,
        fields,
      };
    }),
  ];

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "条件", relation.condition);
      pushField(fields, "守卫", relation.guard);
      pushField(fields, "触发", relation.trigger);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: relation.type === "control_flow" ? "控制流" : "对象流",
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  const groupOrder: SemanticElementKind[] = [
    "swimlane",
    "start-node",
    "activity",
    "decision",
    "merge-node",
    "fork-node",
    "join-node",
    "end-node",
  ];

  return {
    items,
    groups: nonEmptyGroups(groupOrder
      .map((kind) => ({
        kind,
        label: SEMANTIC_KIND_META[kind].label,
        items: items.filter((item) => item.kind === kind),
      }))),
    relationships,
  };
}

function buildDeploymentDetailModel(model: DeploymentDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.nodes.map((node) => ({
      kind: "deployment-node" as const,
      id: node.id,
      label: node.name,
      description: node.description,
      fields: [
        { label: "节点类型", value: node.nodeType },
        ...(node.environment ? [{ label: "环境", value: node.environment }] : []),
      ],
    })),
    ...model.databases.map((database) => ({
      kind: "database" as const,
      id: database.id,
      label: database.name,
      description: database.description,
      fields: database.engine ? [{ label: "引擎", value: database.engine }] : [],
    })),
    ...model.components.map((component) => ({
      kind: "component" as const,
      id: component.id,
      label: component.name,
      description: component.description,
      fields: component.componentType
        ? [{ label: "组件类型", value: component.componentType }]
        : [],
    })),
    ...model.externalSystems.map((system) => ({
      kind: "external-system" as const,
      id: system.id,
      label: system.name,
      description: system.description,
      fields: [],
    })),
    ...model.artifacts.map((artifact) => ({
      kind: "artifact" as const,
      id: artifact.id,
      label: artifact.name,
      description: artifact.description,
      fields: artifact.artifactType
        ? [{ label: "制品类型", value: artifact.artifactType }]
        : [],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "协议", relation.protocol);
      pushField(fields, "端口", relation.port);
      pushField(fields, "方向", relation.direction);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: deploymentRelationshipLabel(relation),
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  return {
    items,
    groups: nonEmptyGroups([
      {
        kind: "deployment-node",
        label: "部署节点",
        items: items.filter((item) => item.kind === "deployment-node"),
      },
      {
        kind: "database",
        label: "数据库",
        items: items.filter((item) => item.kind === "database"),
      },
      {
        kind: "component",
        label: "组件",
        items: items.filter((item) => item.kind === "component"),
      },
      {
        kind: "external-system",
        label: "外部系统",
        items: items.filter((item) => item.kind === "external-system"),
      },
      {
        kind: "artifact",
        label: "制品",
        items: items.filter((item) => item.kind === "artifact"),
      },
    ]),
    relationships,
  };
}

function sequenceMessageTypeLabel(type: SequenceMessage["type"]) {
  const meta: Record<SequenceMessage["type"], string> = {
    sync: "同步调用",
    async: "异步调用",
    return: "返回",
    create: "创建",
    destroy: "销毁",
  };
  return meta[type];
}

function buildSequenceDetailModel(model: SequenceDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.participants.map((participant) => ({
      kind: "participant" as const,
      id: participant.id,
      label: participant.name,
      description: participant.description,
      fields: [{ label: "类型", value: participant.participantType }],
    })),
    ...model.messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      label: message.name,
      description: message.description,
      fields: [
        { label: "调用类型", value: sequenceMessageTypeLabel(message.type) },
        { label: "来源", value: message.sourceId },
        { label: "目标", value: message.targetId },
        ...(message.parameters.length > 0
          ? [{ label: "参数", value: joinList(message.parameters) }]
          : []),
        ...(message.returnValue ? [{ label: "返回", value: message.returnValue }] : []),
        ...(message.condition ? [{ label: "条件", value: message.condition }] : []),
      ],
    })),
    ...model.fragments.map((fragment) => ({
      kind: "fragment" as const,
      id: fragment.id,
      label: fragment.label,
      description: fragment.description,
      fields: [
        { label: "类型", value: fragment.type },
        ...(fragment.condition ? [{ label: "条件", value: fragment.condition }] : []),
        ...(fragment.messageIds.length > 0
          ? [{ label: "消息", value: joinList(fragment.messageIds) }]
          : []),
      ],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = model.messages.map((message) => ({
    id: message.id,
    kind: "relationship",
    label: message.name,
    typeLabel: sequenceMessageTypeLabel(message.type),
    sourceId: message.sourceId,
    targetId: message.targetId,
    fields: [
      ...(message.parameters.length > 0
        ? [{ label: "参数", value: joinList(message.parameters) }]
        : []),
      ...(message.returnValue ? [{ label: "返回", value: message.returnValue }] : []),
      ...(message.condition ? [{ label: "条件", value: message.condition }] : []),
    ],
  }));

  return {
    items,
    groups: nonEmptyGroups([
      {
        kind: "participant",
        label: "参与对象",
        items: items.filter((item) => item.kind === "participant"),
      },
      {
        kind: "message",
        label: "调用消息",
        items: items.filter((item) => item.kind === "message"),
      },
      {
        kind: "fragment",
        label: "组合片段",
        items: items.filter((item) => item.kind === "fragment"),
      },
    ]),
    relationships,
  };
}

export function buildDiagramDetailModel(
  model?: DiagramModelSpec | DesignDiagramModelSpec | null,
): DiagramDetailModel {
  if (!model) {
    return { items: [], groups: [], relationships: [] };
  }

  switch (model.diagramKind) {
    case "sequence":
      return buildSequenceDetailModel(model);
    case "usecase":
      return buildUseCaseDetailModel(model);
    case "class":
      return buildClassDetailModel(model);
    case "activity":
      return buildActivityDetailModel(model);
    case "deployment":
      return buildDeploymentDetailModel(model);
  }
}
