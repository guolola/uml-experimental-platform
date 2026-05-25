import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Download,
  Maximize2,
  Search,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  List,
  ArrowRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { Badge } from "../../../shared/ui/badge";
import { InlineSvg } from "./inline-svg";
import { cn } from "../../../shared/ui/utils";
import { downloadTextFile } from "../../../shared/lib/download";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  getDesignModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
  type DiagramRelationshipDetail,
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";

export function DiagramView({
  type,
  highlightedElement,
}: {
  type: DiagramType;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  return (
    <DiagramDetailView
      stage="requirements"
      type={type}
      highlightedElement={highlightedElement}
    />
  );
}

export function DesignDiagramView({
  type,
  modelId,
  highlightedElement,
}: {
  type: DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  return (
    <DiagramDetailView
      stage="design"
      type={type}
      modelId={modelId}
      highlightedElement={highlightedElement}
    />
  );
}

function getFieldValue(fields: DiagramRelationshipDetail["fields"], label: string) {
  return fields.find((field) => field.label === label)?.value ?? "";
}

function getRelationEndpointLabel(
  relation: DiagramRelationshipDetail,
  itemsById: Map<string, DiagramDetailItem>,
  endpoint: "source" | "target",
) {
  const id = endpoint === "source" ? relation.sourceId : relation.targetId;
  return itemsById.get(id)?.label ?? id;
}

function getRelationDisplayLabel(
  relation: DiagramRelationshipDetail,
  itemsById: Map<string, DiagramDetailItem>,
) {
  const explicit =
    relation.label && relation.label !== `${relation.sourceId} -> ${relation.targetId}`
      ? relation.label
      : "";
  const descriptive =
    explicit ||
    getFieldValue(relation.fields, "说明") ||
    getFieldValue(relation.fields, "标签") ||
    getFieldValue(relation.fields, "条件") ||
    getFieldValue(relation.fields, "守卫");

  if (descriptive) return descriptive;
  return `${getRelationEndpointLabel(relation, itemsById, "source")} → ${getRelationEndpointLabel(
    relation,
    itemsById,
    "target",
  )}`;
}

function isRelationConnectedTo(
  relation: DiagramRelationshipDetail,
  element: DiagramDetailItem | undefined,
) {
  if (!element) return false;
  return relation.sourceId === element.id || relation.targetId === element.id;
}

function matchesItemSearch(item: DiagramDetailItem, query: string) {
  if (!query) return true;
  const lower = query.toLowerCase();
  return [
    item.label,
    item.id,
    item.description ?? "",
    ...item.fields.flatMap((field) => [field.label, field.value]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(lower);
}

function getModelText(model: unknown, key: "title" | "summary", fallback: string) {
  if (model && typeof model === "object" && key in model) {
    const value = (model as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}

function getRelationAccentClass(index: number) {
  const classes = [
    "border-l-primary",
    "border-l-muted-foreground/60",
    "border-l-foreground/60",
  ];
  return classes[index % classes.length];
}

type EditableCollection = {
  key: string;
  label: string;
  nameKey: string;
  create: () => Record<string, unknown>;
};

const EDITABLE_COLLECTIONS: Record<string, EditableCollection[]> = {
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

function createDraftId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function cloneDraftModel(model: unknown) {
  return structuredClone(model) as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function textToStringList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setOptionalStringValue(
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

function editableCollectionsFor(model: unknown) {
  const diagramKind =
    model && typeof model === "object"
      ? String((model as Record<string, unknown>).diagramKind ?? "")
      : "";
  return EDITABLE_COLLECTIONS[diagramKind] ?? [];
}

function collectionItems(draft: Record<string, unknown>, collection: EditableCollection) {
  return Array.isArray(draft[collection.key])
    ? (draft[collection.key] as Array<Record<string, unknown>>)
    : [];
}

function itemLabel(item: Record<string, unknown>, collection: EditableCollection) {
  const value =
    item.type === "decision" && typeof item.question === "string"
      ? item.question
      : item[collection.nameKey];
  return typeof value === "string" ? value : "";
}

function setItemLabel(item: Record<string, unknown>, collection: EditableCollection, value: string) {
  if (item.type === "decision" && "question" in item) {
    item.question = value;
    return;
  }
  item[collection.nameKey] = value;
}

function relationshipItems(draft: Record<string, unknown>) {
  if (draft.diagramKind === "sequence") {
    return Array.isArray(draft.messages)
      ? (draft.messages as Array<Record<string, unknown>>)
      : [];
  }
  return Array.isArray(draft.relationships)
    ? (draft.relationships as Array<Record<string, unknown>>)
    : [];
}

function relationName(relation: Record<string, unknown>) {
  return String(relation.label ?? relation.name ?? relation.condition ?? relation.description ?? "");
}

function setRelationName(relation: Record<string, unknown>, value: string) {
  if ("name" in relation) {
    relation.name = value || "关系";
  } else {
    relation.label = value || undefined;
  }
}

function relationEndpointKey(draft: Record<string, unknown>, endpoint: "source" | "target") {
  if (draft.diagramKind === "table") return endpoint === "source" ? "sourceTableId" : "targetTableId";
  return endpoint === "source" ? "sourceId" : "targetId";
}

function compactColumnId(tableId: string, columnId: string) {
  return `${tableId}.${columnId}`;
}

function updateDraftCollection(
  draft: Record<string, unknown>,
  collection: EditableCollection,
  updater: (items: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
) {
  return { ...draft, [collection.key]: updater(collectionItems(draft, collection)) };
}

function updateDraftItem(
  draft: Record<string, unknown>,
  collection: EditableCollection,
  itemId: string,
  updater: (item: Record<string, unknown>) => Record<string, unknown>,
) {
  return updateDraftCollection(draft, collection, (items) =>
    items.map((item) => (String(item.id ?? "") === itemId ? updater(item) : item)),
  );
}

function removeDanglingRelations(draft: Record<string, unknown>) {
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

function createRelationshipDraft(draft: Record<string, unknown>) {
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
  return {
    id: createDraftId("rel"),
    type: draft.diagramKind === "activity" ? "control_flow" : "association",
    sourceId: source,
    targetId: target,
    label: "新关系",
  };
}

function relationTypeOptions(diagramKind: unknown) {
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

function activityNodeForType(
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

function LabelTextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function LabelTextarea({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function LabelSelect({
  label,
  value,
  options,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
      >
        {allowEmpty ? <option value="">无</option> : null}
        {options.map((option) => (
          <option key={`${label}:${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LabelCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs text-foreground">
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function enumOptions(options: string[]) {
  return options.map((option) => ({ value: option, label: option }));
}

function ModelEditPanel({
  model,
  isDesign,
  requirementType,
  designArtifactId,
}: {
  model: unknown;
  isDesign: boolean;
  requirementType: DiagramType;
  designArtifactId: string;
}) {
  const {
    manualModelEditStatus,
    saveRequirementModelEdit,
    saveDesignModelEdit,
    rerenderRequirementModel,
    rerenderDesignModel,
    generating,
  } = useWorkspaceSession();
  const [draft, setDraft] = useState<Record<string, unknown> | null>(() =>
    model ? cloneDraftModel(model) : null,
  );
  const [saving, setSaving] = useState(false);
  const statusKey = isDesign ? designArtifactId : requirementType;
  const editStatus = manualModelEditStatus[statusKey];

  useEffect(() => {
    setDraft(model ? cloneDraftModel(model) : null);
  }, [model, statusKey]);

  if (!draft) return null;

  const collections = editableCollectionsFor(draft);
  const endpointOptions = collections.flatMap((collection) =>
    collectionItems(draft, collection).map((item) => ({
      id: String(item.id ?? ""),
      label: `${collection.label}：${itemLabel(item, collection) || item.id}`,
    })),
  ).filter((item) => item.id);
  const relationships = relationshipItems(draft);

  const rerenderDraft = async () => {
    setSaving(true);
    try {
      if (isDesign) {
        await saveDesignModelEdit(designArtifactId, draft as never);
        await rerenderDesignModel(designArtifactId, draft as never);
      } else {
        await saveRequirementModelEdit(requirementType, draft as never);
        await rerenderRequirementModel(requirementType, draft as never);
      }
    } finally {
      setSaving(false);
    }
  };

  const setDraftField = (key: string, value: unknown) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateItem = (
    collection: EditableCollection,
    itemId: string,
    updater: (item: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setDraft((current) => current ? updateDraftItem(current, collection, itemId, updater) : current);
  };

  const setItemField = (
    collection: EditableCollection,
    itemId: string,
    key: string,
    value: unknown,
  ) => {
    updateItem(collection, itemId, (item) => ({ ...item, [key]: value }));
  };

  const setItemOptionalString = (
    collection: EditableCollection,
    itemId: string,
    key: string,
    value: string,
  ) => {
    updateItem(collection, itemId, (item) => {
      const nextItem = { ...item };
      setOptionalStringValue(nextItem, key, value);
      return nextItem;
    });
  };

  const updateRelation = (
    relationId: string,
    updater: (item: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const nextRelationships = relationshipItems(current).map((currentRelation) =>
        String(currentRelation.id ?? "") === relationId ? updater(currentRelation) : currentRelation,
      );
      if (current.diagramKind === "sequence") return { ...current, messages: nextRelationships };
      return { ...current, relationships: nextRelationships };
    });
  };

  const actorOptions = collectionItems(draft, {
    key: "actors",
    label: "角色",
    nameKey: "name",
    create: () => ({}),
  }).map((actor) => ({ value: stringValue(actor.id), label: stringValue(actor.name) || stringValue(actor.id) }));
  const laneOptions = collectionItems(draft, {
    key: "swimlanes",
    label: "泳道",
    nameKey: "name",
    create: () => ({}),
  }).map((lane) => ({ value: stringValue(lane.id), label: stringValue(lane.name) || stringValue(lane.id) }));
  const messageOptions = relationshipItems(draft).map((message) => ({
    value: stringValue(message.id),
    label: stringValue(message.name) || stringValue(message.id),
  }));
  const tableOptions = collectionItems(draft, {
    key: "tables",
    label: "数据表",
    nameKey: "name",
    create: () => ({}),
  }).map((table) => ({ value: stringValue(table.id), label: stringValue(table.name) || stringValue(table.id) }));
  const columnsForTable = (tableId: string) => {
    const table = collectionItems(draft, {
      key: "tables",
      label: "数据表",
      nameKey: "name",
      create: () => ({}),
    }).find((item) => stringValue(item.id) === tableId);
    const columns = Array.isArray(table?.columns)
      ? (table.columns as Array<Record<string, unknown>>)
      : [];
    return columns.map((column) => ({
      value: stringValue(column.id),
      label: stringValue(column.name) || stringValue(column.id),
    }));
  };

  const renderOperationEditors = (
    collection: EditableCollection,
    item: Record<string, unknown>,
    itemId: string,
    ownerLabel: string,
  ) => {
    const operations = Array.isArray(item.operations)
      ? (item.operations as Array<Record<string, unknown>>)
      : [];
    const updateOperation = (
      operationIndex: number,
      updater: (operation: Record<string, unknown>) => Record<string, unknown>,
    ) => {
      updateItem(collection, itemId, (currentItem) => {
        const nextOperations = (Array.isArray(currentItem.operations)
          ? (currentItem.operations as Array<Record<string, unknown>>)
          : []
        ).map((operation, index) => (index === operationIndex ? updater(operation) : operation));
        return { ...currentItem, operations: nextOperations };
      });
    };
    return (
      <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-foreground">方法</div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() =>
              updateItem(collection, itemId, (currentItem) => ({
                ...currentItem,
                operations: [
                  ...(Array.isArray(currentItem.operations) ? currentItem.operations : []),
                  { name: "newOperation", visibility: "public", parameters: [] },
                ],
              }))
            }
          >
            <Plus className="size-3" /> 添加方法
          </Button>
        </div>
        {operations.map((operation, operationIndex) => {
          const operationLabel = `${ownerLabel} 方法 ${operationIndex}`;
          const parameters = Array.isArray(operation.parameters)
            ? (operation.parameters as Array<Record<string, unknown>>)
            : [];
          return (
            <div key={`${ownerLabel}:operation:${operationIndex}`} className="space-y-2 rounded-md border border-border bg-card p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <LabelTextInput
                  label={`${operationLabel} 名称`}
                  value={stringValue(operation.name)}
                  onChange={(value) => updateOperation(operationIndex, (current) => ({ ...current, name: value }))}
                />
                <LabelTextInput
                  label={`${operationLabel} 返回类型`}
                  value={stringValue(operation.returnType)}
                  onChange={(value) =>
                    updateOperation(operationIndex, (current) => {
                      const next = { ...current };
                      setOptionalStringValue(next, "returnType", value);
                      return next;
                    })
                  }
                />
                <LabelSelect
                  label={`${operationLabel} 可见性`}
                  value={stringValue(operation.visibility) || "public"}
                  options={enumOptions(["public", "protected", "private", "package"])}
                  onChange={(value) => updateOperation(operationIndex, (current) => ({ ...current, visibility: value }))}
                />
              </div>
              <LabelTextarea
                label={`${operationLabel} 说明`}
                value={stringValue(operation.description)}
                onChange={(value) =>
                  updateOperation(operationIndex, (current) => {
                    const next = { ...current };
                    setOptionalStringValue(next, "description", value);
                    return next;
                  })
                }
              />
              <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">参数</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      updateOperation(operationIndex, (current) => ({
                        ...current,
                        parameters: [
                          ...(Array.isArray(current.parameters) ? current.parameters : []),
                          { name: "param", type: "string", required: true },
                        ],
                      }))
                    }
                  >
                    <Plus className="size-3" /> 添加参数
                  </Button>
                </div>
                {parameters.map((parameter, parameterIndex) => {
                  const parameterLabel = `${operationLabel} 参数 ${parameterIndex}`;
                  return (
                    <div key={`${operationLabel}:parameter:${parameterIndex}`} className="grid gap-2 md:grid-cols-4">
                      <LabelTextInput
                        label={`${parameterLabel} 名称`}
                        value={stringValue(parameter.name)}
                        onChange={(value) =>
                          updateOperation(operationIndex, (current) => ({
                            ...current,
                            parameters: parameters.map((currentParameter, index) =>
                              index === parameterIndex ? { ...currentParameter, name: value } : currentParameter,
                            ),
                          }))
                        }
                      />
                      <LabelTextInput
                        label={`${parameterLabel} 类型`}
                        value={stringValue(parameter.type)}
                        onChange={(value) =>
                          updateOperation(operationIndex, (current) => ({
                            ...current,
                            parameters: parameters.map((currentParameter, index) =>
                              index === parameterIndex ? { ...currentParameter, type: value } : currentParameter,
                            ),
                          }))
                        }
                      />
                      <LabelSelect
                        label={`${parameterLabel} 方向`}
                        value={stringValue(parameter.direction)}
                        options={enumOptions(["in", "out", "inout"])}
                        allowEmpty
                        onChange={(value) =>
                          updateOperation(operationIndex, (current) => ({
                            ...current,
                            parameters: parameters.map((currentParameter, index) => {
                              if (index !== parameterIndex) return currentParameter;
                              const next = { ...currentParameter };
                              setOptionalStringValue(next, "direction", value);
                              return next;
                            }),
                          }))
                        }
                      />
                      <LabelCheckbox
                        label={`${parameterLabel} 必填`}
                        checked={booleanValue(parameter.required, true)}
                        onChange={(checked) =>
                          updateOperation(operationIndex, (current) => ({
                            ...current,
                            parameters: parameters.map((currentParameter, index) =>
                              index === parameterIndex ? { ...currentParameter, required: checked } : currentParameter,
                            ),
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCollectionExtras = (
    collection: EditableCollection,
    item: Record<string, unknown>,
    itemId: string,
  ) => {
    const itemPrefix = `${collection.label} ${itemId}`;
    if (draft.diagramKind === "usecase" && collection.key === "actors") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={`${itemPrefix} 类型`}
            value={stringValue(item.actorType) || "human"}
            options={enumOptions(["human", "system", "external"])}
            onChange={(value) => setItemField(collection, itemId, "actorType", value)}
          />
          <LabelTextarea
            label={`${itemPrefix} 职责`}
            value={stringListValue(item.responsibilities).join("\n")}
            onChange={(value) => setItemField(collection, itemId, "responsibilities", textToStringList(value))}
          />
          <LabelTextarea
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (draft.diagramKind === "usecase" && collection.key === "useCases") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelTextInput
            label={`${itemPrefix} 目标`}
            value={stringValue(item.goal)}
            onChange={(value) => setItemField(collection, itemId, "goal", value)}
          />
          <LabelSelect
            label={`${itemPrefix} 主参与者`}
            value={stringValue(item.primaryActorId)}
            options={actorOptions}
            allowEmpty
            onChange={(value) => setItemOptionalString(collection, itemId, "primaryActorId", value)}
          />
          <LabelTextarea
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
          <LabelTextarea
            label={`${itemPrefix} 前置条件`}
            value={stringListValue(item.preconditions).join("\n")}
            onChange={(value) => setItemField(collection, itemId, "preconditions", textToStringList(value))}
          />
          <LabelTextarea
            label={`${itemPrefix} 后置条件`}
            value={stringListValue(item.postconditions).join("\n")}
            onChange={(value) => setItemField(collection, itemId, "postconditions", textToStringList(value))}
          />
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>{itemPrefix} 辅助参与者</div>
            {actorOptions.map((actor) => (
              <LabelCheckbox
                key={`${itemPrefix}:support:${actor.value}`}
                label={`${itemPrefix} 辅助参与者 ${actor.value}`}
                checked={stringListValue(item.supportingActorIds).includes(actor.value)}
                onChange={(checked) =>
                  setItemField(
                    collection,
                    itemId,
                    "supportingActorIds",
                    checked
                      ? Array.from(new Set([...stringListValue(item.supportingActorIds), actor.value]))
                      : stringListValue(item.supportingActorIds).filter((id) => id !== actor.value),
                  )
                }
              />
            ))}
          </div>
        </div>
      );
    }
    if (draft.diagramKind === "usecase" && collection.key === "systemBoundaries") {
      return (
        <LabelTextarea
          label={`${itemPrefix} 说明`}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
        />
      );
    }
    if (draft.diagramKind === "class" && collection.key === "classes") {
      const attributes = Array.isArray(item.attributes)
        ? (item.attributes as Array<Record<string, unknown>>)
        : [];
      return (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <LabelSelect
              label={`${itemPrefix} 类型`}
              value={stringValue(item.classKind)}
              options={enumOptions(["entity", "aggregate", "valueObject", "service", "other"])}
              allowEmpty
              onChange={(value) => setItemOptionalString(collection, itemId, "classKind", value)}
            />
            <LabelTextInput
              label={`${itemPrefix} 构造型`}
              value={stringValue(item.stereotype)}
              onChange={(value) => setItemOptionalString(collection, itemId, "stereotype", value)}
            />
            <LabelTextInput
              label={`${itemPrefix} 说明`}
              value={stringValue(item.description)}
              onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
            />
          </div>
          <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-foreground">属性</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  updateItem(collection, itemId, (currentItem) => ({
                    ...currentItem,
                    attributes: [
                      ...(Array.isArray(currentItem.attributes) ? currentItem.attributes : []),
                      { name: "newAttribute", type: "string", visibility: "private", required: true },
                    ],
                  }))
                }
              >
                <Plus className="size-3" /> 添加属性
              </Button>
            </div>
            {attributes.map((attribute, index) => (
              <div key={`${itemPrefix}:attribute:${index}`} className="grid gap-2 md:grid-cols-4">
                <LabelTextInput
                  label={`${itemPrefix} 属性 ${index} 名称`}
                  value={stringValue(attribute.name)}
                  onChange={(value) =>
                    updateItem(collection, itemId, (currentItem) => ({
                      ...currentItem,
                      attributes: attributes.map((currentAttribute, currentIndex) =>
                        currentIndex === index ? { ...currentAttribute, name: value } : currentAttribute,
                      ),
                    }))
                  }
                />
                <LabelTextInput
                  label={`${itemPrefix} 属性 ${index} 类型`}
                  value={stringValue(attribute.type)}
                  onChange={(value) =>
                    updateItem(collection, itemId, (currentItem) => ({
                      ...currentItem,
                      attributes: attributes.map((currentAttribute, currentIndex) =>
                        currentIndex === index ? { ...currentAttribute, type: value } : currentAttribute,
                      ),
                    }))
                  }
                />
                <LabelSelect
                  label={`${itemPrefix} 属性 ${index} 可见性`}
                  value={stringValue(attribute.visibility) || "private"}
                  options={enumOptions(["public", "protected", "private", "package"])}
                  onChange={(value) =>
                    updateItem(collection, itemId, (currentItem) => ({
                      ...currentItem,
                      attributes: attributes.map((currentAttribute, currentIndex) =>
                        currentIndex === index ? { ...currentAttribute, visibility: value } : currentAttribute,
                      ),
                    }))
                  }
                />
                <LabelTextInput
                  label={`${itemPrefix} 属性 ${index} 多重性`}
                  value={stringValue(attribute.multiplicity)}
                  onChange={(value) =>
                    updateItem(collection, itemId, (currentItem) => ({
                      ...currentItem,
                      attributes: attributes.map((currentAttribute, currentIndex) => {
                        if (currentIndex !== index) return currentAttribute;
                        const next = { ...currentAttribute };
                        setOptionalStringValue(next, "multiplicity", value);
                        return next;
                      }),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          {renderOperationEditors(collection, item, itemId, itemPrefix)}
        </div>
      );
    }
    if (draft.diagramKind === "class" && collection.key === "interfaces") {
      return (
        <div className="space-y-3">
          <LabelTextInput
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
          {renderOperationEditors(collection, item, itemId, itemPrefix)}
        </div>
      );
    }
    if (draft.diagramKind === "class" && collection.key === "enums") {
      return (
        <LabelTextarea
          label={`${itemPrefix} 字面量`}
          value={stringListValue(item.literals).join("\n")}
          onChange={(value) => setItemField(collection, itemId, "literals", textToStringList(value))}
        />
      );
    }
    if (draft.diagramKind === "activity" && collection.key === "nodes") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={`${itemPrefix} 类型`}
            value={stringValue(item.type)}
            options={enumOptions(["start", "end", "activity", "decision", "merge", "fork", "join"])}
            onChange={(value) => updateItem(collection, itemId, (currentItem) => activityNodeForType(currentItem, value))}
          />
          {item.type === "decision" ? (
            <LabelTextInput
              label={`${itemPrefix} 问题`}
              value={stringValue(item.question)}
              onChange={(value) => setItemOptionalString(collection, itemId, "question", value)}
            />
          ) : null}
          {item.type === "activity" ? (
            <>
              <LabelSelect
                label={`${itemPrefix} 泳道`}
                value={stringValue(item.actorOrLane)}
                options={laneOptions}
                allowEmpty
                onChange={(value) => setItemOptionalString(collection, itemId, "actorOrLane", value)}
              />
              <LabelTextarea
                label={`${itemPrefix} 输入`}
                value={stringListValue(item.input).join("\n")}
                onChange={(value) => setItemField(collection, itemId, "input", textToStringList(value))}
              />
              <LabelTextarea
                label={`${itemPrefix} 输出`}
                value={stringListValue(item.output).join("\n")}
                onChange={(value) => setItemField(collection, itemId, "output", textToStringList(value))}
              />
            </>
          ) : null}
          <LabelTextarea
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (draft.diagramKind === "activity" && collection.key === "swimlanes") {
      return (
        <LabelTextarea
          label={`${itemPrefix} 说明`}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
        />
      );
    }
    if (draft.diagramKind === "deployment") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {collection.key === "nodes" ? (
            <>
              <LabelSelect
                label={`${itemPrefix} 类型`}
                value={stringValue(item.nodeType) || "server"}
                options={enumOptions(["app", "server", "device", "container", "external"])}
                onChange={(value) => setItemField(collection, itemId, "nodeType", value)}
              />
              <LabelTextInput
                label={`${itemPrefix} 环境`}
                value={stringValue(item.environment)}
                onChange={(value) => setItemOptionalString(collection, itemId, "environment", value)}
              />
            </>
          ) : null}
          {collection.key === "databases" ? (
            <LabelTextInput
              label={`${itemPrefix} 引擎`}
              value={stringValue(item.engine)}
              onChange={(value) => setItemOptionalString(collection, itemId, "engine", value)}
            />
          ) : null}
          {collection.key === "components" ? (
            <LabelTextInput
              label={`${itemPrefix} 组件类型`}
              value={stringValue(item.componentType)}
              onChange={(value) => setItemOptionalString(collection, itemId, "componentType", value)}
            />
          ) : null}
          {collection.key === "artifacts" ? (
            <LabelTextInput
              label={`${itemPrefix} 制品类型`}
              value={stringValue(item.artifactType)}
              onChange={(value) => setItemOptionalString(collection, itemId, "artifactType", value)}
            />
          ) : null}
          <LabelTextarea
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (draft.diagramKind === "sequence" && collection.key === "participants") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={`${itemPrefix} 类型`}
            value={stringValue(item.participantType) || "entity"}
            options={enumOptions(["actor", "boundary", "control", "entity", "service", "database", "external"])}
            onChange={(value) => setItemField(collection, itemId, "participantType", value)}
          />
          <LabelTextarea
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (draft.diagramKind === "sequence" && collection.key === "fragments") {
      const messageIds = stringListValue(item.messageIds);
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={`${itemPrefix} 类型`}
            value={stringValue(item.type) || "opt"}
            options={enumOptions(["alt", "opt", "loop", "par"])}
            onChange={(value) => setItemField(collection, itemId, "type", value)}
          />
          <LabelTextInput
            label={`${itemPrefix} 条件`}
            value={stringValue(item.condition)}
            onChange={(value) => setItemOptionalString(collection, itemId, "condition", value)}
          />
          <LabelTextarea
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>{itemPrefix} 包含消息</div>
            {messageOptions.map((message) => (
              <LabelCheckbox
                key={`${itemPrefix}:message:${message.value}`}
                label={`${itemPrefix} 包含消息 ${message.value}`}
                checked={messageIds.includes(message.value)}
                onChange={(checked) =>
                  setItemField(
                    collection,
                    itemId,
                    "messageIds",
                    checked
                      ? Array.from(new Set([...messageIds, message.value]))
                      : messageIds.filter((id) => id !== message.value),
                  )
                }
              />
            ))}
          </div>
        </div>
      );
    }
    if (draft.diagramKind === "table" && collection.key === "tables") {
      const columns = Array.isArray(item.columns)
        ? (item.columns as Array<Record<string, unknown>>)
        : [];
      const updateColumn = (
        columnId: string,
        updater: (column: Record<string, unknown>) => Record<string, unknown>,
      ) => {
        updateItem(collection, itemId, (currentItem) => ({
          ...currentItem,
          columns: (Array.isArray(currentItem.columns)
            ? (currentItem.columns as Array<Record<string, unknown>>)
            : []
          ).map((column) => (stringValue(column.id) === columnId ? updater(column) : column)),
        }));
      };
      return (
        <div className="space-y-3">
          <LabelTextarea
            label={`${itemPrefix} 说明`}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
          <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-foreground">字段</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                aria-label={`${itemPrefix} 添加字段`}
                onClick={() =>
                  updateItem(collection, itemId, (currentItem) => ({
                    ...currentItem,
                    columns: [
                      ...(Array.isArray(currentItem.columns) ? currentItem.columns : []),
                      {
                        id: createDraftId("col"),
                        name: "new_column",
                        dataType: "string",
                        isPrimaryKey: false,
                        isForeignKey: false,
                        nullable: true,
                      },
                    ],
                  }))
                }
              >
                <Plus className="size-3" /> 添加字段
              </Button>
            </div>
            {columns.map((column) => {
              const columnId = stringValue(column.id);
              const columnPrefix = `${itemPrefix} 字段 ${columnId}`;
              const reference = column.references && typeof column.references === "object"
                ? (column.references as Record<string, unknown>)
                : {};
              return (
                <div key={`${itemPrefix}:column:${columnId}`} className="space-y-2 rounded-md border border-border bg-card p-3">
                  <div className="grid gap-2 md:grid-cols-3">
                    <LabelTextInput
                      label={`${columnPrefix} 名称`}
                      value={stringValue(column.name)}
                      onChange={(value) => updateColumn(columnId, (current) => ({ ...current, name: value }))}
                    />
                    <LabelTextInput
                      label={`${columnPrefix} 类型`}
                      value={stringValue(column.dataType)}
                      onChange={(value) => updateColumn(columnId, (current) => ({ ...current, dataType: value }))}
                    />
                    <LabelTextInput
                      label={`${columnPrefix} 说明`}
                      value={stringValue(column.description)}
                      onChange={(value) =>
                        updateColumn(columnId, (current) => {
                          const next = { ...current };
                          setOptionalStringValue(next, "description", value);
                          return next;
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <LabelCheckbox
                      label={`${columnPrefix} 主键`}
                      checked={booleanValue(column.isPrimaryKey)}
                      onChange={(checked) => updateColumn(columnId, (current) => ({ ...current, isPrimaryKey: checked }))}
                    />
                    <LabelCheckbox
                      label={`${columnPrefix} 外键`}
                      checked={booleanValue(column.isForeignKey)}
                      onChange={(checked) => updateColumn(columnId, (current) => ({ ...current, isForeignKey: checked }))}
                    />
                    <LabelCheckbox
                      label={`${columnPrefix} 可空`}
                      checked={booleanValue(column.nullable, true)}
                      onChange={(checked) => updateColumn(columnId, (current) => ({ ...current, nullable: checked }))}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <LabelSelect
                      label={`${columnPrefix} 引用表`}
                      value={stringValue(reference.tableId)}
                      options={tableOptions}
                      allowEmpty
                      onChange={(value) =>
                        updateColumn(columnId, (current) => {
                          const next = { ...current };
                          if (!value) {
                            delete next.references;
                          } else {
                            next.references = { tableId: value, columnId: stringValue(reference.columnId) };
                          }
                          return next;
                        })
                      }
                    />
                    <LabelSelect
                      label={`${columnPrefix} 引用字段`}
                      value={stringValue(reference.columnId)}
                      options={columnsForTable(stringValue(reference.tableId))}
                      allowEmpty
                      onChange={(value) =>
                        updateColumn(columnId, (current) => {
                          const tableId = stringValue(reference.tableId);
                          const next = { ...current };
                          if (!tableId || !value) {
                            delete next.references;
                          } else {
                            next.references = { tableId, columnId: value };
                          }
                          return next;
                        })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">编辑模型</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            可调整元素名称和关系，重新生成当前图时会先保存编辑再重绘。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={rerenderDraft}
            disabled={generating || saving}
          >
            <RefreshCw className="size-3.5" /> 重新生成当前图
          </Button>
        </div>
      </div>

      {editStatus?.warning ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          {editStatus.warning}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-2">
        <LabelTextInput
          label="模型标题"
          value={stringValue(draft.title)}
          onChange={(value) => setDraftField("title", value)}
        />
        <LabelTextarea
          label="模型摘要"
          value={stringValue(draft.summary)}
          onChange={(value) => setDraftField("summary", value)}
        />
        <div className="md:col-span-2">
          <LabelTextarea
            label="模型备注"
            value={stringListValue(draft.notes).join("\n")}
            rows={3}
            onChange={(value) => setDraftField("notes", textToStringList(value))}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-4">
          {collections.map((collection) => {
            const items = collectionItems(draft, collection);
            return (
              <div key={collection.key} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium text-foreground">{collection.label}</h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      setDraft((current) =>
                        current
                          ? updateDraftCollection(current, collection, (currentItems) => [
                              ...currentItems,
                              collection.create(),
                            ])
                          : current,
                      )
                    }
                  >
                    <Plus className="size-3.5" /> 添加
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      暂无{collection.label}
                    </div>
                  ) : (
                    items.map((item) => {
                      const id = String(item.id ?? "");
                      return (
                        <div key={`${collection.key}:${id}`} className="space-y-3 rounded-md border border-border bg-card p-3">
                          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                            <label className="min-w-0">
                              <span className="sr-only">{collection.label} {id} 名称</span>
                              <input
                                aria-label={`${collection.label} ${id} 名称`}
                                value={itemLabel(item, collection)}
                                onChange={(event) =>
                                  setDraft((current) => {
                                    if (!current) return current;
                                    return updateDraftCollection(current, collection, (currentItems) =>
                                      currentItems.map((currentItem) => {
                                        if (String(currentItem.id ?? "") !== id) return currentItem;
                                        const nextItem = { ...currentItem };
                                        setItemLabel(nextItem, collection, event.target.value);
                                        return nextItem;
                                      }),
                                    );
                                  })
                                }
                                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 px-2 text-destructive"
                              aria-label={`删除${collection.label} ${id}`}
                              onClick={() =>
                                setDraft((current) => {
                                  if (!current) return current;
                                  return removeDanglingRelations(
                                    updateDraftCollection(current, collection, (currentItems) =>
                                      currentItems.filter((currentItem) => String(currentItem.id ?? "") !== id),
                                    ),
                                  );
                                })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                          {renderCollectionExtras(collection, item, id)}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium text-foreground">关系</h4>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={endpointOptions.length === 0}
              onClick={() =>
                setDraft((current) => {
                  if (!current) return current;
                  const nextRelation = createRelationshipDraft(current);
                  if (current.diagramKind === "sequence") {
                    return { ...current, messages: [...relationshipItems(current), nextRelation] };
                  }
                  return { ...current, relationships: [...relationshipItems(current), nextRelation] };
                })
              }
            >
              <Plus className="size-3.5" /> 添加
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {relationships.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                暂无关系
              </div>
            ) : (
              relationships.map((relation) => {
                const id = String(relation.id ?? "");
                const sourceKey = relationEndpointKey(draft, "source");
                const targetKey = relationEndpointKey(draft, "target");
                const updateRelation = (updater: (item: Record<string, unknown>) => Record<string, unknown>) => {
                  setDraft((current) => {
                    if (!current) return current;
                    const nextRelationships = relationshipItems(current).map((currentRelation) =>
                      String(currentRelation.id ?? "") === id ? updater(currentRelation) : currentRelation,
                    );
                    if (current.diagramKind === "sequence") return { ...current, messages: nextRelationships };
                    return { ...current, relationships: nextRelationships };
                  });
                };
                return (
                  <div key={id} className="space-y-2 rounded-md border border-border bg-card p-3">
                    <input
                      aria-label={`关系 ${id} 名称`}
                      value={relationName(relation)}
                      onChange={(event) =>
                        updateRelation((currentRelation) => {
                          const nextRelation = { ...currentRelation };
                          setRelationName(nextRelation, event.target.value);
                          return nextRelation;
                        })
                      }
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select
                        aria-label={`关系 ${id} 起点`}
                        value={String(relation[sourceKey] ?? "")}
                        onChange={(event) =>
                          updateRelation((currentRelation) => ({
                            ...currentRelation,
                            [sourceKey]: event.target.value,
                          }))
                        }
                        className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {endpointOptions.map((option) => (
                          <option key={`source:${id}:${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`关系 ${id} 类型`}
                        value={String(relation.type ?? "")}
                        onChange={(event) =>
                          updateRelation((currentRelation) => ({
                            ...currentRelation,
                            type: event.target.value,
                          }))
                        }
                        className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {relationTypeOptions(draft.diagramKind).map((option) => (
                          <option key={`type:${id}:${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`关系 ${id} 终点`}
                        value={String(relation[targetKey] ?? "")}
                        onChange={(event) =>
                          updateRelation((currentRelation) => ({
                            ...currentRelation,
                            [targetKey]: event.target.value,
                          }))
                        }
                        className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {endpointOptions.map((option) => (
                          <option key={`target:${id}:${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      aria-label={`关系 ${id} 说明条件`}
                      value={String(relation.description ?? relation.condition ?? relation.guard ?? relation.protocol ?? "")}
                      onChange={(event) =>
                        updateRelation((currentRelation) => ({
                          ...currentRelation,
                          description: event.target.value || undefined,
                        }))
                      }
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {draft.diagramKind === "usecase" ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        <LabelTextInput
                          label={`关系 ${id} 条件`}
                          value={stringValue(relation.condition)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "condition", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelTextarea
                          label={`关系 ${id} 说明`}
                          value={stringValue(relation.description)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "description", value);
                              return nextRelation;
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {draft.diagramKind === "class" ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {[
                          ["sourceRole", "源角色"],
                          ["targetRole", "目标角色"],
                          ["sourceMultiplicity", "源多重性"],
                          ["targetMultiplicity", "目标多重性"],
                        ].map(([key, label]) => (
                          <LabelTextInput
                            key={`${id}:${key}`}
                            label={`关系 ${id} ${label}`}
                            value={stringValue(relation[key])}
                            onChange={(value) =>
                              updateRelation((currentRelation) => {
                                const nextRelation = { ...currentRelation };
                                setOptionalStringValue(nextRelation, key, value);
                                return nextRelation;
                              })
                            }
                          />
                        ))}
                        <LabelSelect
                          label={`关系 ${id} 导航性`}
                          value={stringValue(relation.navigability)}
                          options={enumOptions(["none", "source-to-target", "target-to-source", "bidirectional"])}
                          allowEmpty
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "navigability", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelTextarea
                          label={`关系 ${id} 说明`}
                          value={stringValue(relation.description)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "description", value);
                              return nextRelation;
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {draft.diagramKind === "activity" ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {[
                          ["condition", "条件"],
                          ["guard", "守卫"],
                          ["trigger", "触发"],
                        ].map(([key, label]) => (
                          <LabelTextInput
                            key={`${id}:${key}`}
                            label={`关系 ${id} ${label}`}
                            value={stringValue(relation[key])}
                            onChange={(value) =>
                              updateRelation((currentRelation) => {
                                const nextRelation = { ...currentRelation };
                                setOptionalStringValue(nextRelation, key, value);
                                return nextRelation;
                              })
                            }
                          />
                        ))}
                        <LabelTextarea
                          label={`关系 ${id} 说明`}
                          value={stringValue(relation.description)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "description", value);
                              return nextRelation;
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {draft.diagramKind === "deployment" ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        <LabelTextInput
                          label={`关系 ${id} 协议`}
                          value={stringValue(relation.protocol)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "protocol", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelTextInput
                          label={`关系 ${id} 端口`}
                          value={stringValue(relation.port)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "port", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelSelect
                          label={`关系 ${id} 方向`}
                          value={stringValue(relation.direction)}
                          options={enumOptions(["one-way", "two-way", "inbound", "outbound"])}
                          allowEmpty
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "direction", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelTextarea
                          label={`关系 ${id} 说明`}
                          value={stringValue(relation.description)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "description", value);
                              return nextRelation;
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {draft.diagramKind === "sequence" ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        <LabelTextarea
                          label={`关系 ${id} 参数`}
                          value={stringListValue(relation.parameters).join("\n")}
                          onChange={(value) =>
                            updateRelation((currentRelation) => ({
                              ...currentRelation,
                              parameters: textToStringList(value),
                            }))
                          }
                        />
                        <LabelTextInput
                          label={`关系 ${id} 返回值`}
                          value={stringValue(relation.returnValue)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "returnValue", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelTextInput
                          label={`关系 ${id} 条件`}
                          value={stringValue(relation.condition)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "condition", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelTextarea
                          label={`关系 ${id} 说明`}
                          value={stringValue(relation.description)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "description", value);
                              return nextRelation;
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {draft.diagramKind === "table" ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        <LabelSelect
                          label={`关系 ${id} 源字段`}
                          value={stringValue(relation.sourceColumnId)}
                          options={columnsForTable(stringValue(relation.sourceTableId))}
                          allowEmpty
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "sourceColumnId", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelSelect
                          label={`关系 ${id} 目标字段`}
                          value={stringValue(relation.targetColumnId)}
                          options={columnsForTable(stringValue(relation.targetTableId))}
                          allowEmpty
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "targetColumnId", value);
                              return nextRelation;
                            })
                          }
                        />
                        <LabelTextarea
                          label={`关系 ${id} 说明`}
                          value={stringValue(relation.description)}
                          onChange={(value) =>
                            updateRelation((currentRelation) => {
                              const nextRelation = { ...currentRelation };
                              setOptionalStringValue(nextRelation, "description", value);
                              return nextRelation;
                            })
                          }
                        />
                      </div>
                    ) : null}
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-destructive"
                        aria-label={`删除关系 ${id}`}
                        onClick={() =>
                          setDraft((current) => {
                            if (!current) return current;
                            const nextRelationships = relationshipItems(current).filter(
                              (currentRelation) => String(currentRelation.id ?? "") !== id,
                            );
                            if (current.diagramKind === "sequence") return { ...current, messages: nextRelationships };
                            return { ...current, relationships: nextRelationships };
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DiagramDetailView({
  stage,
  type,
  modelId,
  highlightedElement,
}: {
  stage: "requirements" | "design";
  type: DiagramType | DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  const {
    models,
    plantUml,
    svgArtifacts,
    diagramErrors,
    designModels,
    designPlantUml,
    designSvgArtifacts,
    designDiagramErrors,
    rulesForDiagram,
    staleDiagrams,
    generateDiagrams,
    generating,
  } = useWorkspaceSession();
  const {
    openDiagram,
    openDesignDiagram,
    openDiagramElement,
    openDesignDiagramElement,
  } = useWorkspaceShell();
  const isDesign = stage === "design";
  const requirementType = type as DiagramType;
  const designType = type as DesignDiagramType;
  const isStale = !isDesign && staleDiagrams.includes(requirementType);
  const meta = isDesign ? DESIGN_DIAGRAM_META[designType] : DIAGRAM_META[requirementType];
  const designModel = isDesign
    ? modelId
      ? designModels[modelId]
      : Object.values(designModels).find((entry) => entry.diagramKind === designType)
    : undefined;
  const designArtifactId = designModel ? getDesignModelId(designModel) : modelId ?? designType;
  const source = isDesign
    ? designPlantUml[designArtifactId] ?? ""
    : plantUml[requirementType] ?? "";
  const model = isDesign ? designModel : models[requirementType];
  const svgMarkup = isDesign
    ? designSvgArtifacts[designArtifactId]?.svg ?? ""
    : svgArtifacts[requirementType]?.svg ?? "";
  const diagramError = isDesign
    ? designDiagramErrors[designType] ?? null
    : diagramErrors[requirementType] ?? null;
  const [svgUrl, setSvgUrl] = useState("");
  const [svgScale, setSvgScale] = useState(1);
  const svgScaleRef = useRef(svgScale);
  const svgCanvasRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [elementSearch, setElementSearch] = useState("");
  const [elementKindFilter, setElementKindFilter] = useState<"all" | SemanticElementKind>(
    "all",
  );
  const [relationsOnlyFocus, setRelationsOnlyFocus] = useState(false);
  const updateSvgScale = useCallback((next: number) => {
    setSvgScale(Math.min(3, Math.max(0.25, Math.round(next * 100) / 100)));
  }, []);
  useEffect(() => {
    svgScaleRef.current = svgScale;
  }, [svgScale]);
  useEffect(() => {
    const canvas = svgCanvasRef.current;
    if (!canvas || !svgMarkup) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      updateSvgScale(svgScaleRef.current + (event.deltaY < 0 ? 0.1 : -0.1));
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [svgMarkup, updateSvgScale]);
  useEffect(() => {
    panStateRef.current.active = false;
    setIsPanning(false);
  }, [svgMarkup]);
  const startCanvasPan = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if ((typeof event.button === "number" && event.button !== 0) || !svgMarkup) return;

    const canvas = svgCanvasRef.current;
    if (!canvas) return;

    panStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    setIsPanning(true);
  }, [svgMarkup]);
  const moveCanvasPan = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const panState = panStateRef.current;
    if (!panState.active) return;

    event.preventDefault();
    const canvas = svgCanvasRef.current;
    if (!canvas) return;

    canvas.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    canvas.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  }, []);
  const stopCanvasPan = useCallback(() => {
    if (!panStateRef.current.active) return;

    panStateRef.current.active = false;
    setIsPanning(false);
  }, []);
  useEffect(() => {
    if (!svgMarkup || typeof URL.createObjectURL !== "function") {
      setSvgUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(
      new Blob([svgMarkup], { type: "image/svg+xml" }),
    );
    setSvgUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [svgMarkup]);
  const sourceRules = isDesign ? [] : rulesForDiagram(requirementType);
  const detailModel = useMemo(() => buildDiagramDetailModel(model), [model]);
  const { items, groups, relationships } = detailModel;
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const highlighted: DiagramDetailItem | undefined = useMemo(() => {
    if (!highlightedElement) return undefined;
    return items.find(
      (e) => e.kind === highlightedElement.kind && e.id === highlightedElement.id,
    );
  }, [items, highlightedElement]);
  const relatedRelationships = useMemo(
    () => relationships.filter((relation) => isRelationConnectedTo(relation, highlighted)),
    [highlighted, relationships],
  );
  const relatedItems = useMemo(() => {
    if (!highlighted) return [];
    const relatedIds = new Set<string>();
    for (const relation of relatedRelationships) {
      if (relation.sourceId !== highlighted.id) relatedIds.add(relation.sourceId);
      if (relation.targetId !== highlighted.id) relatedIds.add(relation.targetId);
    }
    return [...relatedIds]
      .map((id) => itemsById.get(id))
      .filter((item): item is DiagramDetailItem => Boolean(item));
  }, [highlighted, itemsById, relatedRelationships]);
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              (elementKindFilter === "all" || item.kind === elementKindFilter) &&
              matchesItemSearch(item, elementSearch.trim()),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [elementKindFilter, elementSearch, groups],
  );
  const filteredElements = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );
  const visibleRelationships = useMemo(
    () =>
      relationsOnlyFocus && highlighted
        ? relatedRelationships
        : relationships,
    [highlighted, relatedRelationships, relationships, relationsOnlyFocus],
  );
  const summaryGroups = groups.filter((group) => {
    if (group.kind === "message" || group.kind === "table-column") return false;
    return group.items.length > 0;
  });
  const modelTitle = getModelText(model, "title", meta.label);
  const modelSummary = getModelText(model, "summary", meta.description);
  const diagramActions = svgMarkup ? (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={() => updateSvgScale(svgScale - 0.25)}
        aria-label="缩小 SVG"
      >
        <ZoomOut className="size-3.5" />
      </Button>
      <Badge variant="secondary" className="h-8 min-w-14 font-mono">
        {Math.round(svgScale * 100)}%
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={() => updateSvgScale(svgScale + 0.25)}
        aria-label="放大 SVG"
      >
        <ZoomIn className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={() => updateSvgScale(1)}
        aria-label="适应宽度"
      >
        <Maximize2 className="size-3.5" />
      </Button>
      {svgUrl && (
        <Button variant="outline" size="sm" className="h-8" asChild>
          <a href={svgUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" /> 新标签
          </a>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => {
          downloadTextFile(`${stage}-${type}.svg`, svgMarkup, "image/svg+xml");
          toast.success(`已导出 ${type}.svg`);
        }}
      >
        <Download className="size-3.5" /> SVG
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => {
          if (!model) return;
          downloadTextFile(
            `${stage}-${type}.model.json`,
            JSON.stringify(model, null, 2),
            "application/json",
          );
          toast.success(`已导出 ${type}.model.json`);
        }}
        disabled={!model}
      >
        <Download className="size-3.5" /> JSON
      </Button>
    </div>
  ) : null;

  useEffect(() => {
    setElementSearch("");
    setElementKindFilter("all");
    setRelationsOnlyFocus(false);
    setSvgScale(1);
  }, [stage, type]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {!source ? (
        <div className="w-full overflow-auto py-6 lg:py-8">
          <div className="mx-auto w-[calc(100%-2rem)] max-w-[1920px] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
            {diagramError ? (
              <div className="rounded-xl border border-destructive/40 bg-card px-5 py-8 text-sm shadow-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {meta.label} 生成失败
                </div>
                <div className="mt-2 leading-relaxed text-foreground">
                  {diagramError.message}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-sm">
                尚未生成。请回到「{isDesign ? "设计" : "需求"}」点击「生成模型」。
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto py-4 lg:py-6">
          <div className="mx-auto flex min-h-0 w-[calc(100%-2rem)] max-w-[1920px] flex-1 flex-col gap-4 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
          {isStale && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span>此图基于旧规则生成，可能已过时。</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-8"
                onClick={() => generateDiagrams([requirementType])}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                重新生成此图
              </Button>
            </div>
          )}

          <header className="px-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold tracking-normal text-foreground">
                    {modelTitle}
                  </h2>
                  <Badge variant="secondary">{isDesign ? "设计模型" : "需求模型"}</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {modelSummary}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center sm:w-auto">
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {items.length}
                  </div>
                  <div className="text-xs text-muted-foreground">元素</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {relationships.length}
                  </div>
                  <div className="text-xs text-muted-foreground">关系</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {groups.length}
                  </div>
                  <div className="text-xs text-muted-foreground">分组</div>
                </div>
              </div>
            </div>
          </header>

          <Tabs
            key={`${stage}:${type}:${highlighted ? highlighted.id : "all"}`}
            defaultValue="diagram"
            className="min-h-[560px] flex-1 gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="border-b border-border px-5">
              <TabsList className="h-auto w-full justify-start gap-8 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="diagram"
                  className="relative h-12 flex-none rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block"
                >
                  图
                </TabsTrigger>
                <TabsTrigger
                  value="elements"
                  className="relative h-12 flex-none rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block"
                >
                元素
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {items.length}
                </span>
                </TabsTrigger>
                <TabsTrigger
                  value="relations"
                  className="relative h-12 flex-none rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block"
                >
                关系
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {relationships.length}
                </span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="diagram" className="m-0 min-h-0 flex-1 p-0 data-[state=active]:flex data-[state=active]:flex-col">
              <div className="grid min-h-0 flex-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="flex min-w-0 min-h-0 flex-col bg-background">
                  <div className="flex flex-col gap-3 rounded-t-xl border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">预览</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                    {diagramActions}
                  </div>
                  <div
                    ref={svgCanvasRef}
                    data-testid="svg-preview-canvas"
                    className={cn(
                      "min-h-[420px] flex-1 overflow-auto",
                      svgMarkup && (isPanning ? "cursor-grabbing" : "cursor-grab"),
                    )}
                    onMouseDown={startCanvasPan}
                    onMouseMove={moveCanvasPan}
                    onMouseUp={stopCanvasPan}
                    onMouseLeave={stopCanvasPan}
                  >
                      {svgMarkup ? (
                        <div className="flex min-h-full min-w-full items-center justify-center">
                          <InlineSvg
                            svg={svgMarkup}
                            scale={svgScale}
                            highlightLabel={highlighted?.label}
                            className="w-full [&>svg]:drop-shadow-sm"
                          />
                        </div>
                      ) : diagramError ? (
                        <div className="flex min-h-full items-center justify-center">
                          <div className="max-w-xl rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                            <div className="flex items-center gap-2 font-medium text-destructive">
                              <AlertTriangle className="size-4 shrink-0" />
                              {meta.label} 生成失败
                            </div>
                            <div className="mt-2 leading-relaxed text-foreground">
                              {diagramError.message}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-full items-center justify-center text-sm text-muted-foreground">
                          尚未生成 SVG
                        </div>
                      )}
                  </div>
                </section>

                <aside className="flex flex-col gap-5">
                  {highlighted ? (
                    <>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs uppercase tracking-wider text-primary">
                            focus
                          </span>
                          <Badge variant="secondary" className="font-mono">
                            {SEMANTIC_KIND_META[highlighted.kind].label}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {highlighted.label}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              isDesign
                                ? openDesignDiagram(
                                    designType,
                                    designArtifactId,
                                    getModelText(model, "title", meta.label),
                                  )
                                : openDiagram(requirementType)
                            }
                          >
                            清除高亮
                          </Button>
                        </div>
                        <div className="mt-4 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground">职责与属性</div>
                          {highlighted.description && (
                            <div className="mt-1 leading-relaxed">{highlighted.description}</div>
                          )}
                          {highlighted.fields.length > 0 ? (
                            <div className="mt-2 flex flex-col gap-1.5">
                              {highlighted.fields.slice(0, 6).map((field) => (
                                <div key={`${highlighted.id}:focus:${field.label}`}>
                                  <span>{field.label}：</span>
                                  <span className="text-foreground">{field.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : !highlighted.description ? (
                            <div className="mt-1">暂无额外属性。</div>
                          ) : null}
                          {!isDesign && sourceRules.length > 0 && (
                            <div className="mt-3">
                              来源规则：{sourceRules.slice(0, 3).map((rule) => rule.id).join("、")}
                              {sourceRules.length > 3 ? ` +${sourceRules.length - 3}` : ""}
                            </div>
                          )}
                        </div>
                      </section>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground">相关关系与元素</h3>
                        <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
                          相关关系 {relatedRelationships.length} 条
                          {relatedItems.length > 0
                            ? `，关联元素 ${relatedItems.map((item) => item.label).slice(0, 4).join("、")}`
                            : "。"}
                        </div>
                        {relatedRelationships[0] && (
                          <div className="mt-3 truncate text-sm text-foreground">
                            {getRelationDisplayLabel(relatedRelationships[0], itemsById)}
                          </div>
                        )}
                      </section>
                    </>
                  ) : (
                    <>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground">模型概览</h3>
                        <div className="mt-4 flex flex-col gap-3">
                          {summaryGroups.slice(0, 6).map((group) => (
                            <div
                              key={`overview:${group.kind}`}
                              className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm text-foreground">
                                  {SEMANTIC_KIND_META[group.kind].label}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {group.items.slice(0, 3).map((item) => item.label).join("、") || "暂无元素"}
                                </div>
                              </div>
                              <Badge variant="secondary" className="font-mono">
                                {group.items.length}
                              </Badge>
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                            <div>
                              <div className="text-sm text-foreground">关系</div>
                              <div className="text-xs text-muted-foreground">结构化连接</div>
                            </div>
                            <Badge variant="secondary" className="font-mono">
                              {relationships.length}
                            </Badge>
                          </div>
                        </div>
                      </section>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground">当前状态</h3>
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span>模型类型</span>
                            <span className="font-medium text-foreground">{meta.label}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>SVG 预览</span>
                            <span className="font-medium text-foreground">
                              {svgMarkup ? "已生成" : "未生成"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>缩放比例</span>
                            <span className="font-mono text-foreground">
                              当前 {Math.round(svgScale * 100)}%
                            </span>
                          </div>
                        </div>
                      </section>
                    </>
                  )}
                </aside>
              </div>
            </TabsContent>

            <TabsContent value="elements" className="m-0 min-h-0 flex-1 p-5 data-[state=active]:flex data-[state=active]:flex-col">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background shadow-sm">
                <div className="border-b border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                    <h3 className="text-sm font-semibold text-foreground">元素清单</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      按类型浏览模型元素，点击卡片可定位到对应元素。
                    </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2"
                        aria-pressed="true"
                        aria-label="网格视图"
                      >
                        <LayoutGrid className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground"
                        aria-pressed="false"
                        aria-label="列表视图"
                      >
                        <List className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {groups.length > 0 ? (
                    <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <label className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={elementSearch}
                          onChange={(event) => setElementSearch(event.target.value)}
                          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
                          placeholder="搜索元素、属性或说明"
                        />
                      </label>
                      <div
                        className="flex flex-wrap gap-2"
                        aria-label="按元素类型筛选"
                        role="group"
                      >
                        <Button
                          type="button"
                          variant={elementKindFilter === "all" ? "default" : "outline"}
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => setElementKindFilter("all")}
                        >
                          全部类型
                          <span className="ml-1 font-mono text-[10px] opacity-75">
                            {items.length}
                          </span>
                        </Button>
                        {groups.map((group) => (
                          <Button
                            key={group.kind}
                            type="button"
                            variant={elementKindFilter === group.kind ? "default" : "outline"}
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => setElementKindFilter(group.kind)}
                          >
                            {SEMANTIC_KIND_META[group.kind].label}
                            <span className="ml-1 font-mono text-[10px] opacity-75">
                              {group.items.length}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                {groups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    未识别到元素。
                  </div>
                ) : filteredElements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    没有匹配的元素，请调整搜索或类型筛选。
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {filteredElements.map((el) => {
                            const active =
                              highlighted &&
                              highlighted.kind === el.kind &&
                              highlighted.id === el.id;
                            const fieldSummary = el.fields
                              .slice(0, 3)
                              .map((field) => `${field.label}：${field.value}`)
                              .join(" / ");
                            return (
                              <button
                                type="button"
                                aria-label={el.label}
                                key={`${el.kind}:${el.id}`}
                                onClick={() =>
                                  isDesign
                                    ? openDesignDiagramElement(
                                        designType,
                                        el.kind,
                                        el.id,
                                        el.label,
                                        designArtifactId,
                                      )
                                    : openDiagramElement(
                                        requirementType,
                                        el.kind,
                                        el.id,
                                        el.label,
                                      )
                                }
                                className={cn(
                                  "min-h-32 rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-card text-foreground hover:bg-accent",
                                )}
                              >
                                <span className="flex items-start justify-between gap-3">
                                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                                    {SEMANTIC_KIND_META[el.kind].shortLabel}
                                  </span>
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {SEMANTIC_KIND_META[el.kind].label}
                                  </Badge>
                                </span>
                                <span className="mt-4 block min-w-0 truncate text-base font-semibold text-foreground">
                                  {el.label}
                                </span>
                                {el.description && (
                                  <span className="mt-2 line-clamp-3 block min-h-[3.75rem] text-xs leading-5 text-muted-foreground">
                                    {el.description}
                                  </span>
                                )}
                                {!el.description && (
                                  <span className="mt-2 line-clamp-3 block min-h-[3.75rem] text-xs leading-5 text-muted-foreground">
                                    暂无说明。
                                  </span>
                                )}
                                <span className="mt-4 block border-t border-border pt-3">
                                  <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                    <span className="min-w-0 truncate">
                                      {el.fields.length > 0
                                        ? fieldSummary
                                        : "暂无字段"}
                                    </span>
                                    <ArrowRight className="size-3.5 shrink-0" />
                                  </span>
                                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                                    {el.fields.length} 个字段
                                  </span>
                                </span>
                              </button>
                            );
                    })}
                  </div>
                )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="relations" className="m-0 min-h-0 flex-1 p-5 data-[state=active]:flex data-[state=active]:flex-col">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">关系说明</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      查看元素之间的结构化连接、角色、条件和说明。
                    </p>
                  </div>
                  {highlighted ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={relationsOnlyFocus}
                        onChange={(event) => setRelationsOnlyFocus(event.target.checked)}
                        className="size-3.5"
                      />
                      只看焦点相关关系
                    </label>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                {relationships.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    暂无结构化关系。
                  </div>
                ) : visibleRelationships.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    当前焦点元素暂无关联关系。
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {visibleRelationships.map((relation, index) => {
                      const displayLabel = getRelationDisplayLabel(relation, itemsById);
                      return (
                      <div
                        key={relation.id}
                        className={cn(
                          "overflow-hidden rounded-xl border border-border border-l-4 bg-card shadow-sm",
                          getRelationAccentClass(index),
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2 p-4 pb-3">
                          <Badge variant="secondary" className="font-mono">
                            {relation.typeLabel}
                          </Badge>
                          <span className="font-medium text-foreground">{displayLabel}</span>
                        </div>
                        <div className="mx-4 rounded-xl border border-border bg-muted/40 p-4">
                          <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(88px,160px)_minmax(0,1fr)]">
                            <div className="rounded-lg border border-border bg-background p-3 text-center">
                              <div className="truncate text-sm font-medium text-foreground">
                                {getRelationEndpointLabel(relation, itemsById, "source")}
                              </div>
                              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                {relation.sourceId}
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                              <span className="h-px min-w-8 flex-1 bg-border" />
                              <span className="max-w-28 truncate rounded-full bg-background px-2 py-1">
                                {displayLabel}
                              </span>
                              <span className="h-px min-w-8 flex-1 bg-border" />
                            </div>
                            <div className="rounded-lg border border-border bg-background p-3 text-center">
                              <div className="truncate text-sm font-medium text-foreground">
                                {getRelationEndpointLabel(relation, itemsById, "target")}
                              </div>
                              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                {relation.targetId}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-3 text-xs text-muted-foreground">
                          <span>
                            {getRelationEndpointLabel(relation, itemsById, "source")} →{" "}
                            {getRelationEndpointLabel(relation, itemsById, "target")}
                          </span>
                          {(itemsById.has(relation.sourceId) || itemsById.has(relation.targetId)) && (
                            <span className="ml-2 font-mono text-[10px] opacity-70">
                              {relation.sourceId} → {relation.targetId}
                            </span>
                          )}
                        </div>
                        {relation.fields.length > 0 && (
                          <div className="grid gap-2 border-t border-border px-4 py-3 text-xs sm:grid-cols-2">
                            {relation.fields.map((field) => (
                              <div key={`${relation.id}:${field.label}`} className="min-w-0">
                                <div className="text-muted-foreground">{field.label}</div>
                                <div className="mt-1 break-words text-foreground">{field.value}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );})}
                  </div>
                )}
                </div>
              </section>
            </TabsContent>

          </Tabs>

          <ModelEditPanel
            model={model}
            isDesign={isDesign}
            requirementType={requirementType}
            designArtifactId={designArtifactId}
          />

          </div>
        </div>
      )}
    </div>
  );
}
