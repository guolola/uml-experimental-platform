// Owns pure diagram model draft helpers used by the diagram detail editor UI.
import type { DesignDiagramType, DiagramType } from "../../../entities/diagram/model";
import type { DiagramDetailItem } from "../../../entities/diagram/lib/model-details";

export type EditableCollection = {
  key: string;
  label: string;
  nameKey: string;
  create: () => Record<string, unknown>;
};

export const EDITABLE_COLLECTIONS: Record<string, EditableCollection[]> = {
  usecase: [
    {
      key: "actors",
      label: "角色",
      nameKey: "name",
      create: () => ({
        id: createDraftId("actor"),
        name: "新角色",
        actorType: "human",
        responsibilities: [],
      }),
    },
    {
      key: "useCases",
      label: "用例",
      nameKey: "name",
      create: () => ({
        id: createDraftId("uc"),
        name: "新用例",
        goal: "补充目标",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      }),
    },
    {
      key: "systemBoundaries",
      label: "系统边界",
      nameKey: "name",
      create: () => ({ id: createDraftId("system"), name: "新系统边界" }),
    },
  ],
  class: [
    {
      key: "classes",
      label: "类",
      nameKey: "name",
      create: () => ({
        id: createDraftId("cls"),
        name: "NewClass",
        classKind: "entity",
        attributes: [],
        operations: [],
      }),
    },
    {
      key: "interfaces",
      label: "接口",
      nameKey: "name",
      create: () => ({ id: createDraftId("if"), name: "NewInterface", operations: [] }),
    },
    {
      key: "enums",
      label: "枚举",
      nameKey: "name",
      create: () => ({ id: createDraftId("enum"), name: "NewEnum", literals: ["VALUE"] }),
    },
  ],
  activity: [
    {
      key: "swimlanes",
      label: "泳道",
      nameKey: "name",
      create: () => ({ id: createDraftId("lane"), name: "新泳道" }),
    },
    {
      key: "nodes",
      label: "活动节点",
      nameKey: "name",
      create: () => ({
        id: createDraftId("act"),
        type: "activity",
        name: "新活动",
        input: [],
        output: [],
      }),
    },
  ],
  deployment: [
    {
      key: "nodes",
      label: "部署节点",
      nameKey: "name",
      create: () => ({ id: createDraftId("node"), name: "新节点", nodeType: "server" }),
    },
    {
      key: "databases",
      label: "数据库",
      nameKey: "name",
      create: () => ({ id: createDraftId("db"), name: "新数据库" }),
    },
    {
      key: "components",
      label: "组件",
      nameKey: "name",
      create: () => ({ id: createDraftId("cmp"), name: "新组件" }),
    },
    {
      key: "externalSystems",
      label: "外部系统",
      nameKey: "name",
      create: () => ({ id: createDraftId("ext"), name: "新外部系统" }),
    },
    {
      key: "artifacts",
      label: "制品",
      nameKey: "name",
      create: () => ({ id: createDraftId("artifact"), name: "新制品" }),
    },
  ],
  sequence: [
    {
      key: "participants",
      label: "参与对象",
      nameKey: "name",
      create: () => ({
        id: createDraftId("participant"),
        name: "新参与对象",
        participantType: "entity",
      }),
    },
    {
      key: "fragments",
      label: "组合片段",
      nameKey: "label",
      create: () => ({ id: createDraftId("fragment"), type: "opt", label: "新片段", messageIds: [] }),
    },
  ],
  table: [
    {
      key: "tables",
      label: "数据表",
      nameKey: "name",
      create: () => ({
        id: createDraftId("table"),
        name: "new_table",
        columns: [
          {
            id: "id",
            name: "id",
            dataType: "string",
            isPrimaryKey: true,
            isForeignKey: false,
            nullable: false,
          },
        ],
      }),
    },
  ],
};

export function createDraftId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function cloneDraftModel(model: unknown) {
  return structuredClone(model) as Record<string, unknown>;
}

export function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function draftFingerprint(model: Record<string, unknown> | null) {
  return model ? JSON.stringify(model) : "";
}

export function designSourceLabel(
  diagram: DesignDiagramType,
  model: Record<string, unknown> | null,
) {
  if (diagram === "sequence") {
    const useCaseName = stringValue(model?.sourceUseCaseName).trim();
    if (useCaseName) {
      return `来源：需求阶段用例模型事件流 + 需求分析模型（用例：${useCaseName}）`;
    }
    const useCaseId = stringValue(model?.sourceUseCaseId).trim();
    if (useCaseId) {
      return `来源：需求阶段用例模型事件流 + 需求分析模型（用例ID：${useCaseId}）`;
    }
    return "来源：需求阶段用例模型事件流 + 需求分析模型（具体用例未标明）";
  }
  if (diagram === "activity") {
    return "来源：需求阶段原型界面关系 + 设计阶段用例实现设计";
  }
  if (diagram === "class") {
    return "来源：需求阶段领域概念模型 + 设计阶段用例实现设计";
  }
  if (diagram === "deployment") {
    return "来源：需求阶段部署需求模型 + 设计阶段用例实现设计";
  }
  return "来源：设计阶段设计类图 + 设计阶段用例实现设计";
}

export function requirementSourceLabel(
  diagram: DiagramType,
  model: Record<string, unknown> | null,
  rules: Array<{ id?: string }>,
) {
  if (diagram === "analysis") {
    const useCaseName = stringValue(model?.sourceUseCaseName).trim();
    if (useCaseName) {
      return `来源：用例模型事件流（用例：${useCaseName}）`;
    }
    const useCaseId = stringValue(model?.sourceUseCaseId).trim();
    if (useCaseId) {
      return `来源：用例模型事件流（用例ID：${useCaseId}）`;
    }
    return "来源：用例模型事件流（具体用例未标明）";
  }
  if (rules.length === 0) {
    return "来源：需求规则（未标明）";
  }
  const visibleRuleIds = rules
    .slice(0, 5)
    .map((rule) => rule.id.trim().toUpperCase())
    .filter(Boolean);
  if (visibleRuleIds.length === 0) {
    return "来源：需求规则（未标明）";
  }
  const suffix = rules.length > visibleRuleIds.length ? ` +${rules.length - visibleRuleIds.length}` : "";
  return `来源：需求规则（${visibleRuleIds.join("、")}${suffix}）`;
}

export function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueNonEmptyStrings(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

export function diagramHighlightAliases(element: DiagramDetailItem | undefined) {
  if (!element) return [];
  const fieldAliases = element.fields
    .filter((field) => ["中文名称", "英文名称"].includes(field.label))
    .map((field) => field.value);
  const idTail = element.id.includes(".") ? element.id.split(".").at(-1) : "";
  const labelTail = element.label.includes(".") ? element.label.split(".").at(-1) : "";
  return uniqueNonEmptyStrings([
    ...fieldAliases,
    idTail,
    labelTail,
  ]).filter((alias) => alias !== element.label);
}

export function textToStringList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function setOptionalStringValue(
  record: Record<string, unknown>,
  key: string,
  value: string,
) {
  if (value.trim()) {
    record[key] = value;
  } else {
    delete record[key];
  }
}

export function editableCollectionsFor(model: unknown) {
  const diagramKind =
    model && typeof model === "object"
      ? String((model as Record<string, unknown>).diagramKind ?? "")
      : "";
  return EDITABLE_COLLECTIONS[diagramKind] ?? [];
}

export function collectionItems(draft: Record<string, unknown>, collection: EditableCollection) {
  return Array.isArray(draft[collection.key])
    ? (draft[collection.key] as Array<Record<string, unknown>>)
    : [];
}

export function itemLabel(item: Record<string, unknown>, collection: EditableCollection) {
  const value =
    item.type === "decision" && typeof item.question === "string"
      ? item.question
      : item[collection.nameKey];
  return typeof value === "string" ? value : "";
}

export function setItemLabel(item: Record<string, unknown>, collection: EditableCollection, value: string) {
  if (item.type === "decision" && "question" in item) {
    item.question = value;
    return;
  }
  item[collection.nameKey] = value;
}

export function relationshipItems(draft: Record<string, unknown>) {
  if (draft.diagramKind === "sequence") {
    return Array.isArray(draft.messages)
      ? (draft.messages as Array<Record<string, unknown>>)
      : [];
  }
  return Array.isArray(draft.relationships)
    ? (draft.relationships as Array<Record<string, unknown>>)
    : [];
}

export function relationName(relation: Record<string, unknown>) {
  return String(relation.label ?? relation.name ?? relation.condition ?? relation.description ?? "");
}

export function setRelationName(relation: Record<string, unknown>, value: string) {
  if ("name" in relation) {
    relation.name = value || "关系";
  } else {
    relation.label = value || undefined;
  }
}

export function relationEndpointKey(draft: Record<string, unknown>, endpoint: "source" | "target") {
  if (draft.diagramKind === "table") return endpoint === "source" ? "sourceTableId" : "targetTableId";
  return endpoint === "source" ? "sourceId" : "targetId";
}

export function updateDraftCollection(
  draft: Record<string, unknown>,
  collection: EditableCollection,
  updater: (items: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
) {
  return { ...draft, [collection.key]: updater(collectionItems(draft, collection)) };
}

export function updateDraftItem(
  draft: Record<string, unknown>,
  collection: EditableCollection,
  itemId: string,
  updater: (item: Record<string, unknown>) => Record<string, unknown>,
) {
  return updateDraftCollection(draft, collection, (items) =>
    items.map((item) => (String(item.id ?? "") === itemId ? updater(item) : item)),
  );
}

export function removeDanglingRelations(draft: Record<string, unknown>) {
  const ids = new Set(
    editableCollectionsFor(draft).flatMap((collection) =>
      collectionItems(draft, collection).map((item) => String(item.id ?? "")),
    ),
  );
  const relationships = relationshipItems(draft).map((relation) => {
    if (draft.diagramKind !== "table") return relation;
    const sourceTableId = stringValue(relation.sourceTableId);
    const targetTableId = stringValue(relation.targetTableId);
    const sourceColumnId = stringValue(relation.sourceColumnId);
    const targetColumnId = stringValue(relation.targetColumnId);
    const tableColumns = new Map(
      collectionItems(draft, { key: "tables", label: "数据表", nameKey: "name", create: () => ({}) })
        .map((table) => [
          stringValue(table.id),
          new Set(
            Array.isArray(table.columns)
              ? table.columns.map((column) => stringValue((column as Record<string, unknown>).id))
              : [],
          ),
        ]),
    );
    const nextRelation = { ...relation };
    if (sourceColumnId && !tableColumns.get(sourceTableId)?.has(sourceColumnId)) {
      delete nextRelation.sourceColumnId;
    }
    if (targetColumnId && !tableColumns.get(targetTableId)?.has(targetColumnId)) {
      delete nextRelation.targetColumnId;
    }
    return nextRelation;
  }).filter((relation) => {
    const source = String(relation[relationEndpointKey(draft, "source")] ?? "");
    const target = String(relation[relationEndpointKey(draft, "target")] ?? "");
    return ids.has(source) && ids.has(target);
  });
  if (draft.diagramKind === "sequence") {
    const messageIds = new Set(relationships.map((message) => stringValue(message.id)));
    const fragments = collectionItems(draft, { key: "fragments", label: "组合片段", nameKey: "label", create: () => ({}) })
      .map((fragment) => ({
        ...fragment,
        messageIds: stringListValue(fragment.messageIds).filter((id) => messageIds.has(id)),
      }));
    return { ...draft, messages: relationships, fragments };
  }
  return { ...draft, relationships };
}

export function createRelationshipDraft(draft: Record<string, unknown>) {
  const endpointIds = editableCollectionsFor(draft)
    .flatMap((collection) => collectionItems(draft, collection))
    .map((item) => String(item.id ?? ""))
    .filter(Boolean);
  const source = endpointIds[0] ?? "";
  const target = endpointIds[1] ?? source;
  if (draft.diagramKind === "sequence") {
    return {
      id: createDraftId("msg"),
      type: "sync",
      sourceId: source,
      targetId: target,
      name: "新调用",
      parameters: [],
    };
  }
  if (draft.diagramKind === "table") {
    return {
      id: createDraftId("rel"),
      type: "one-to-many",
      sourceTableId: source,
      targetTableId: target,
      label: "新关系",
    };
  }
  if (draft.diagramKind === "activity") {
    return {
      id: createDraftId("rel"),
      type: "control_flow",
      sourceId: source,
      targetId: target,
      condition: "新条件",
    };
  }
  return {
    id: createDraftId("rel"),
    type: "association",
    sourceId: source,
    targetId: target,
    label: "新关系",
  };
}

export function relationTypeOptions(diagramKind: unknown) {
  switch (diagramKind) {
    case "usecase":
      return ["association", "include", "extend", "generalization"];
    case "class":
      return ["association", "aggregation", "composition", "inheritance", "implementation", "dependency"];
    case "activity":
      return ["control_flow", "object_flow"];
    case "deployment":
      return ["deployment", "communication", "dependency", "hosting"];
    case "sequence":
      return ["sync", "async", "return", "create", "destroy"];
    case "table":
      return ["one-to-one", "one-to-many", "many-to-many"];
    default:
      return ["association"];
  }
}

export function activityNodeForType(
  item: Record<string, unknown>,
  type: string,
) {
  const base = {
    id: item.id,
    type,
    description: item.description,
  };
  const name = stringValue(item.name) || stringValue(item.question);
  switch (type) {
    case "activity":
      return {
        ...base,
        name: name || "新活动",
        actorOrLane: item.actorOrLane,
        input: stringListValue(item.input),
        output: stringListValue(item.output),
      };
    case "decision":
      return {
        ...base,
        question: stringValue(item.question) || name || "条件判断",
      };
    case "start":
      return { ...base, name: name || "开始" };
    case "end":
      return { ...base, name: name || "结束" };
    case "merge":
    case "fork":
    case "join":
      return { ...base, name: name || undefined };
    default:
      return item;
  }
}
