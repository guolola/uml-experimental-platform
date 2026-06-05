import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, PointerEvent, SetStateAction } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  AlertTriangle,
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
  Pencil,
  Trash2,
  PanelRightOpen,
  X,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { Badge } from "../../../shared/ui/badge";
import { SelectControl } from "../../../shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { InlineSvg } from "./inline-svg";
import { cn } from "../../../shared/ui/utils";
import { downloadTextFile } from "../../../shared/lib/download";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  getDesignModelId,
  getRequirementModelId,
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
  modelId,
  highlightedElement,
}: {
  type: DiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  return (
    <DiagramDetailView
      stage="requirements"
      type={type}
      modelId={modelId}
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

function draftFingerprint(model: Record<string, unknown> | null) {
  return model ? JSON.stringify(model) : "";
}

function designSourceLabel(
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

function requirementSourceLabel(rules: Array<{ id?: string }>) {
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
  const normalizedOptions = allowEmpty
    ? [{ value: "", label: "无" }, ...options]
    : options;

  return (
    <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <SelectControl
        aria-label={label}
        value={value}
        onValueChange={onChange}
        options={normalizedOptions}
        placeholder="请选择"
        className="h-9 rounded-md text-sm"
      />
    </div>
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

function ordinalLabel(index: number, unit: string) {
  return `第 ${index + 1} 个${unit}`;
}

function editorFieldLabel(ownerLabel: string, fieldLabel: string) {
  return `${ownerLabel}${fieldLabel}`;
}

function namedActionLabel(action: string, kind: string, name: string) {
  return `${action}${kind}：${name || `未命名${kind}`}`;
}

function ModelEditPanel({
  draft,
  setDraft,
  onCommitDraft,
  onSelectElement,
  selectedElement,
  saving,
}: {
  draft: Record<string, unknown> | null;
  setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  onCommitDraft: (nextDraft: Record<string, unknown>) => Promise<void>;
  onSelectElement: (element: DiagramDetailItem) => void;
  selectedElement?: { kind: string; id: string } | null;
  saving: boolean;
}) {
  const [elementSearch, setElementSearch] = useState("");
  const [elementKindFilter, setElementKindFilter] = useState<"all" | SemanticElementKind>(
    "all",
  );
  const [relationSearch, setRelationSearch] = useState("");
  const [relationKindFilter, setRelationKindFilter] = useState("all");
  const [elementEditor, setElementEditor] = useState<{
    collection: EditableCollection;
    itemId: string;
    draft: Record<string, unknown>;
    mode: "create" | "edit";
  } | null>(null);
  const [relationEditor, setRelationEditor] = useState<{
    relationId: string;
    draft: Record<string, unknown>;
    mode: "create" | "edit";
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "element"; collection: EditableCollection; id: string; label: string }
    | { kind: "relation"; id: string; label: string }
    | null
  >(null);
  const detailModel = useMemo(() => buildDiagramDetailModel(draft), [draft]);

  if (!draft) return null;

  const editorDraft = elementEditor?.draft ?? relationEditor?.draft ?? draft;
  const setEditorDraft = (
    updater:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown>),
  ) => {
    if (elementEditor) {
      setElementEditor((current) => {
        if (!current) return current;
        const nextDraft = typeof updater === "function" ? updater(current.draft) : updater;
        return { ...current, draft: nextDraft };
      });
      return;
    }
    if (relationEditor) {
      setRelationEditor((current) => {
        if (!current) return current;
        const nextDraft = typeof updater === "function" ? updater(current.draft) : updater;
        return { ...current, draft: nextDraft };
      });
      return;
    }
    setDraft((current) => {
      if (!current) return current;
      return typeof updater === "function" ? updater(current) : updater;
    });
  };

  const collections = editableCollectionsFor(draft);
  const editorCollections = editableCollectionsFor(editorDraft);
  const editableItemsById = new Map<string, { collection: EditableCollection; item: Record<string, unknown> }>();
  for (const collection of collections) {
    for (const item of collectionItems(draft, collection)) {
      const itemId = stringValue(item.id);
      if (itemId) editableItemsById.set(itemId, { collection, item });
    }
  }
  const filteredGroups = detailModel.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (elementKindFilter === "all" || item.kind === elementKindFilter) &&
          matchesItemSearch(item, elementSearch.trim()),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const filteredElements = filteredGroups.flatMap((group) => group.items);
  const detailItemsById = new Map(detailModel.items.map((item) => [item.id, item]));
  const detailRelationshipsById = new Map(detailModel.relationships.map((relation) => [relation.id, relation]));
  const endpointOptions = editorCollections.flatMap((collection) =>
    collectionItems(editorDraft, collection).map((item) => ({
      id: String(item.id ?? ""),
      label: `${collection.label}：${itemLabel(item, collection) || item.id}`,
    })),
  ).filter((item) => item.id);
  const relationships = relationshipItems(draft);
  const relationshipSummaries = relationships.map((relation) => {
    const id = String(relation.id ?? "");
    const detailRelation = detailRelationshipsById.get(id);
    const displayLabel = detailRelation
      ? getRelationDisplayLabel(detailRelation, detailItemsById)
      : relationName(relation) || id;
    const typeLabel = detailRelation?.typeLabel ?? (stringValue(relation.type) || "未分类");
    const sourceKey = relationEndpointKey(draft, "source");
    const targetKey = relationEndpointKey(draft, "target");
    const sourceLabel = detailRelation
      ? getRelationEndpointLabel(detailRelation, detailItemsById, "source")
      : stringValue(relation[sourceKey]);
    const targetLabel = detailRelation
      ? getRelationEndpointLabel(detailRelation, detailItemsById, "target")
      : stringValue(relation[targetKey]);
    const fieldsText = detailRelation?.fields
      .map((field) => `${field.label} ${field.value}`)
      .join(" ") ?? "";
    return {
      id,
      relation,
      detailRelation,
      displayLabel,
      typeLabel,
      sourceKey,
      targetKey,
      sourceLabel,
      targetLabel,
      searchText: [
        displayLabel,
        typeLabel,
        sourceLabel,
        targetLabel,
        fieldsText,
        stringValue(relation.type),
      ].join(" ").toLowerCase(),
    };
  });
  const relationTypeCounts = relationshipSummaries.reduce<Map<string, number>>((counts, relation) => {
    counts.set(relation.typeLabel, (counts.get(relation.typeLabel) ?? 0) + 1);
    return counts;
  }, new Map());
  const relationFilterOptions = Array.from(relationTypeCounts.entries()).map(([label, count]) => ({
    label,
    count,
  }));
  const filteredRelationships = relationshipSummaries.filter((relation) => {
    const matchesKind = relationKindFilter === "all" || relation.typeLabel === relationKindFilter;
    const query = relationSearch.trim().toLowerCase();
    return matchesKind && (!query || relation.searchText.includes(query));
  });

  const updateItem = (
    collection: EditableCollection,
    itemId: string,
    updater: (item: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setEditorDraft((current) => updateDraftItem(current, collection, itemId, updater));
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
    setEditorDraft((current) => {
      const nextRelationships = relationshipItems(current).map((currentRelation) =>
        String(currentRelation.id ?? "") === relationId ? updater(currentRelation) : currentRelation,
      );
      if (current.diagramKind === "sequence") return { ...current, messages: nextRelationships };
      return { ...current, relationships: nextRelationships };
    });
  };

  const actorOptions = collectionItems(editorDraft, {
    key: "actors",
    label: "角色",
    nameKey: "name",
    create: () => ({}),
  }).map((actor) => ({ value: stringValue(actor.id), label: stringValue(actor.name) || stringValue(actor.id) }));
  const laneOptions = collectionItems(editorDraft, {
    key: "swimlanes",
    label: "泳道",
    nameKey: "name",
    create: () => ({}),
  }).map((lane) => ({ value: stringValue(lane.id), label: stringValue(lane.name) || stringValue(lane.id) }));
  const messageOptions = relationshipItems(editorDraft).map((message) => ({
    value: stringValue(message.id),
    label: stringValue(message.name) || stringValue(message.id),
  }));
  const tableOptions = collectionItems(editorDraft, {
    key: "tables",
    label: "数据表",
    nameKey: "name",
    create: () => ({}),
  }).map((table) => ({ value: stringValue(table.id), label: stringValue(table.name) || stringValue(table.id) }));
  const columnsForTable = (tableId: string) => {
    const table = collectionItems(editorDraft, {
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
          const operationLabel = ordinalLabel(operationIndex, "方法");
          const parameters = Array.isArray(operation.parameters)
            ? (operation.parameters as Array<Record<string, unknown>>)
            : [];
          return (
            <div key={`${ownerLabel}:operation:${operationIndex}`} className="space-y-2 rounded-md border border-border bg-card p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <LabelTextInput
                  label={`${operationLabel}名称`}
                  value={stringValue(operation.name)}
                  onChange={(value) => updateOperation(operationIndex, (current) => ({ ...current, name: value }))}
                />
                <LabelTextInput
                  label={`${operationLabel}返回类型`}
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
                  label={`${operationLabel}可见性`}
                  value={stringValue(operation.visibility) || "public"}
                  options={enumOptions(["public", "protected", "private", "package"])}
                  onChange={(value) => updateOperation(operationIndex, (current) => ({ ...current, visibility: value }))}
                />
              </div>
              <LabelTextarea
                label={`${operationLabel}说明`}
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
                  const parameterLabel = `${operationLabel}的${ordinalLabel(parameterIndex, "参数")}`;
                  return (
                    <div key={`${operationLabel}:parameter:${parameterIndex}`} className="grid gap-2 md:grid-cols-4">
                      <LabelTextInput
                        label={`${parameterLabel}名称`}
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
                        label={`${parameterLabel}类型`}
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
                        label={`${parameterLabel}方向`}
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
                        label={`${parameterLabel}必填`}
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
    const itemPrefix = collection.label;
    if (editorDraft.diagramKind === "usecase" && collection.key === "actors") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={editorFieldLabel(itemPrefix, "类型")}
            value={stringValue(item.actorType) || "human"}
            options={enumOptions(["human", "system", "external"])}
            onChange={(value) => setItemField(collection, itemId, "actorType", value)}
          />
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "职责")}
            value={stringListValue(item.responsibilities).join("\n")}
            onChange={(value) => setItemField(collection, itemId, "responsibilities", textToStringList(value))}
          />
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (editorDraft.diagramKind === "usecase" && collection.key === "useCases") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "目标")}
            value={stringValue(item.goal)}
            onChange={(value) => setItemField(collection, itemId, "goal", value)}
          />
          <LabelSelect
            label={editorFieldLabel(itemPrefix, "主参与者")}
            value={stringValue(item.primaryActorId)}
            options={actorOptions}
            allowEmpty
            onChange={(value) => setItemOptionalString(collection, itemId, "primaryActorId", value)}
          />
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "前置条件")}
            value={stringListValue(item.preconditions).join("\n")}
            onChange={(value) => setItemField(collection, itemId, "preconditions", textToStringList(value))}
          />
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "后置条件")}
            value={stringListValue(item.postconditions).join("\n")}
            onChange={(value) => setItemField(collection, itemId, "postconditions", textToStringList(value))}
          />
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>{editorFieldLabel(itemPrefix, "辅助参与者")}</div>
            {actorOptions.map((actor) => (
              <LabelCheckbox
                key={`${itemPrefix}:support:${actor.value}`}
                label={`辅助参与者：${actor.label || "未命名角色"}`}
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
    if (editorDraft.diagramKind === "usecase" && collection.key === "systemBoundaries") {
      return (
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
        />
      );
    }
    if (editorDraft.diagramKind === "class" && collection.key === "classes") {
      const attributes = Array.isArray(item.attributes)
        ? (item.attributes as Array<Record<string, unknown>>)
        : [];
      return (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <LabelSelect
              label={editorFieldLabel(itemPrefix, "类型")}
              value={stringValue(item.classKind)}
              options={enumOptions(["entity", "aggregate", "valueObject", "service", "other"])}
              allowEmpty
              onChange={(value) => setItemOptionalString(collection, itemId, "classKind", value)}
            />
            <LabelTextInput
              label={editorFieldLabel(itemPrefix, "构造型")}
              value={stringValue(item.stereotype)}
              onChange={(value) => setItemOptionalString(collection, itemId, "stereotype", value)}
            />
            <LabelTextInput
              label={editorFieldLabel(itemPrefix, "说明")}
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
                  label={`${ordinalLabel(index, "属性")}名称`}
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
                  label={`${ordinalLabel(index, "属性")}类型`}
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
                  label={`${ordinalLabel(index, "属性")}可见性`}
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
                  label={`${ordinalLabel(index, "属性")}多重性`}
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
    if (editorDraft.diagramKind === "class" && collection.key === "interfaces") {
      return (
        <div className="space-y-3">
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
          {renderOperationEditors(collection, item, itemId, itemPrefix)}
        </div>
      );
    }
    if (editorDraft.diagramKind === "class" && collection.key === "enums") {
      return (
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "字面量")}
          value={stringListValue(item.literals).join("\n")}
          onChange={(value) => setItemField(collection, itemId, "literals", textToStringList(value))}
        />
      );
    }
    if (editorDraft.diagramKind === "activity" && collection.key === "nodes") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={editorFieldLabel(itemPrefix, "类型")}
            value={stringValue(item.type)}
            options={enumOptions(["start", "end", "activity", "decision", "merge", "fork", "join"])}
            onChange={(value) => updateItem(collection, itemId, (currentItem) => activityNodeForType(currentItem, value))}
          />
          {item.type === "decision" ? (
            <LabelTextInput
              label={editorFieldLabel(itemPrefix, "问题")}
              value={stringValue(item.question)}
              onChange={(value) => setItemOptionalString(collection, itemId, "question", value)}
            />
          ) : null}
          {item.type === "activity" ? (
            <>
              <LabelSelect
                label={editorFieldLabel(itemPrefix, "泳道")}
                value={stringValue(item.actorOrLane)}
                options={laneOptions}
                allowEmpty
                onChange={(value) => setItemOptionalString(collection, itemId, "actorOrLane", value)}
              />
              <LabelTextarea
                label={editorFieldLabel(itemPrefix, "输入")}
                value={stringListValue(item.input).join("\n")}
                onChange={(value) => setItemField(collection, itemId, "input", textToStringList(value))}
              />
              <LabelTextarea
                label={editorFieldLabel(itemPrefix, "输出")}
                value={stringListValue(item.output).join("\n")}
                onChange={(value) => setItemField(collection, itemId, "output", textToStringList(value))}
              />
            </>
          ) : null}
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (editorDraft.diagramKind === "activity" && collection.key === "swimlanes") {
      return (
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
        />
      );
    }
    if (editorDraft.diagramKind === "deployment") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {collection.key === "nodes" ? (
            <>
              <LabelSelect
                label={editorFieldLabel(itemPrefix, "类型")}
                value={stringValue(item.nodeType) || "server"}
                options={enumOptions(["app", "server", "device", "container", "external"])}
                onChange={(value) => setItemField(collection, itemId, "nodeType", value)}
              />
              <LabelTextInput
                label={editorFieldLabel(itemPrefix, "环境")}
                value={stringValue(item.environment)}
                onChange={(value) => setItemOptionalString(collection, itemId, "environment", value)}
              />
            </>
          ) : null}
          {collection.key === "databases" ? (
            <LabelTextInput
              label={editorFieldLabel(itemPrefix, "引擎")}
              value={stringValue(item.engine)}
              onChange={(value) => setItemOptionalString(collection, itemId, "engine", value)}
            />
          ) : null}
          {collection.key === "components" ? (
            <LabelTextInput
              label={editorFieldLabel(itemPrefix, "组件类型")}
              value={stringValue(item.componentType)}
              onChange={(value) => setItemOptionalString(collection, itemId, "componentType", value)}
            />
          ) : null}
          {collection.key === "artifacts" ? (
            <LabelTextInput
              label={editorFieldLabel(itemPrefix, "制品类型")}
              value={stringValue(item.artifactType)}
              onChange={(value) => setItemOptionalString(collection, itemId, "artifactType", value)}
            />
          ) : null}
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (editorDraft.diagramKind === "sequence" && collection.key === "participants") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={editorFieldLabel(itemPrefix, "类型")}
            value={stringValue(item.participantType) || "entity"}
            options={enumOptions(["actor", "boundary", "control", "entity", "service", "database", "external"])}
            onChange={(value) => setItemField(collection, itemId, "participantType", value)}
          />
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
        </div>
      );
    }
    if (editorDraft.diagramKind === "sequence" && collection.key === "fragments") {
      const messageIds = stringListValue(item.messageIds);
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelSelect
            label={editorFieldLabel(itemPrefix, "类型")}
            value={stringValue(item.type) || "opt"}
            options={enumOptions(["alt", "opt", "loop", "par"])}
            onChange={(value) => setItemField(collection, itemId, "type", value)}
          />
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "条件")}
            value={stringValue(item.condition)}
            onChange={(value) => setItemOptionalString(collection, itemId, "condition", value)}
          />
          <LabelTextarea
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString(collection, itemId, "description", value)}
          />
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>{editorFieldLabel(itemPrefix, "包含消息")}</div>
            {messageOptions.map((message) => (
              <LabelCheckbox
                key={`${itemPrefix}:message:${message.value}`}
                label={`包含消息：${message.label || "未命名消息"}`}
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
    if (editorDraft.diagramKind === "table" && collection.key === "tables") {
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
            label={editorFieldLabel(itemPrefix, "说明")}
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
                aria-label="添加字段"
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
            {columns.map((column, index) => {
              const columnId = stringValue(column.id);
              const columnPrefix = ordinalLabel(index, "字段");
              const reference = column.references && typeof column.references === "object"
                ? (column.references as Record<string, unknown>)
                : {};
              return (
                <div key={`${itemPrefix}:column:${columnId}`} className="space-y-2 rounded-md border border-border bg-card p-3">
                  <div className="grid gap-2 md:grid-cols-3">
                    <LabelTextInput
                      label={`${columnPrefix}名称`}
                      value={stringValue(column.name)}
                      onChange={(value) => updateColumn(columnId, (current) => ({ ...current, name: value }))}
                    />
                    <LabelTextInput
                      label={`${columnPrefix}类型`}
                      value={stringValue(column.dataType)}
                      onChange={(value) => updateColumn(columnId, (current) => ({ ...current, dataType: value }))}
                    />
                    <LabelTextInput
                      label={`${columnPrefix}说明`}
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
                      label={`${columnPrefix}主键`}
                      checked={booleanValue(column.isPrimaryKey)}
                      onChange={(checked) => updateColumn(columnId, (current) => ({ ...current, isPrimaryKey: checked }))}
                    />
                    <LabelCheckbox
                      label={`${columnPrefix}外键`}
                      checked={booleanValue(column.isForeignKey)}
                      onChange={(checked) => updateColumn(columnId, (current) => ({ ...current, isForeignKey: checked }))}
                    />
                    <LabelCheckbox
                      label={`${columnPrefix}可空`}
                      checked={booleanValue(column.nullable, true)}
                      onChange={(checked) => updateColumn(columnId, (current) => ({ ...current, nullable: checked }))}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <LabelSelect
                      label={`${columnPrefix}引用表`}
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
                      label={`${columnPrefix}引用字段`}
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

  const renderRelationEditors = (relation: Record<string, unknown>, id: string) => {
    const sourceKey = relationEndpointKey(editorDraft, "source");
    const targetKey = relationEndpointKey(editorDraft, "target");
    return (
      <div className="space-y-3">
        <LabelTextInput
          label="关系名称"
          value={relationName(relation)}
          onChange={(value) =>
            updateRelation(id, (currentRelation) => {
              const nextRelation = { ...currentRelation };
              setRelationName(nextRelation, value);
              return nextRelation;
            })
          }
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <LabelSelect
            label="起点"
            value={String(relation[sourceKey] ?? "")}
            options={endpointOptions.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
            onChange={(value) =>
              updateRelation(id, (currentRelation) => ({
                ...currentRelation,
                [sourceKey]: value,
              }))
            }
          />
          <LabelSelect
            label="关系类型"
            value={String(relation.type ?? "")}
            options={relationTypeOptions(editorDraft.diagramKind).map((option) => ({
              value: option,
              label: option,
            }))}
            onChange={(value) =>
              updateRelation(id, (currentRelation) => ({
                ...currentRelation,
                type: value,
              }))
            }
          />
          <LabelSelect
            label="终点"
            value={String(relation[targetKey] ?? "")}
            options={endpointOptions.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
            onChange={(value) =>
              updateRelation(id, (currentRelation) => ({
                ...currentRelation,
                [targetKey]: value,
              }))
            }
          />
        </div>
        {editorDraft.diagramKind === "usecase" ? (
          <div className="grid gap-2 md:grid-cols-2">
            <LabelTextInput
              label="条件"
              value={stringValue(relation.condition)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "condition", value);
                  return nextRelation;
                })
              }
            />
            <LabelTextarea
              label="说明"
              value={stringValue(relation.description)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "description", value);
                  return nextRelation;
                })
              }
            />
          </div>
        ) : null}
        {editorDraft.diagramKind === "class" ? (
          <div className="grid gap-2 md:grid-cols-2">
            {[
              ["sourceRole", "源角色"],
              ["targetRole", "目标角色"],
              ["sourceMultiplicity", "源多重性"],
              ["targetMultiplicity", "目标多重性"],
            ].map(([key, label]) => (
              <LabelTextInput
                key={`${id}:${key}`}
                label={label}
                value={stringValue(relation[key])}
                onChange={(value) =>
                  updateRelation(id, (currentRelation) => {
                    const nextRelation = { ...currentRelation };
                    setOptionalStringValue(nextRelation, key, value);
                    return nextRelation;
                  })
                }
              />
            ))}
            <LabelSelect
              label="导航性"
              value={stringValue(relation.navigability)}
              options={enumOptions(["none", "source-to-target", "target-to-source", "bidirectional"])}
              allowEmpty
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "navigability", value);
                  return nextRelation;
                })
              }
            />
            <LabelTextarea
              label="说明"
              value={stringValue(relation.description)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "description", value);
                  return nextRelation;
                })
              }
            />
          </div>
        ) : null}
        {editorDraft.diagramKind === "activity" ? (
          <div className="grid gap-2 md:grid-cols-2">
            {[
              ["condition", "条件"],
              ["guard", "守卫"],
              ["trigger", "触发"],
            ].map(([key, label]) => (
              <LabelTextInput
                key={`${id}:${key}`}
                label={label}
                value={stringValue(relation[key])}
                onChange={(value) =>
                  updateRelation(id, (currentRelation) => {
                    const nextRelation = { ...currentRelation };
                    setOptionalStringValue(nextRelation, key, value);
                    return nextRelation;
                  })
                }
              />
            ))}
            <LabelTextarea
              label="说明"
              value={stringValue(relation.description)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "description", value);
                  return nextRelation;
                })
              }
            />
          </div>
        ) : null}
        {editorDraft.diagramKind === "deployment" ? (
          <div className="grid gap-2 md:grid-cols-2">
            <LabelTextInput
              label="协议"
              value={stringValue(relation.protocol)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "protocol", value);
                  return nextRelation;
                })
              }
            />
            <LabelTextInput
              label="端口"
              value={stringValue(relation.port)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "port", value);
                  return nextRelation;
                })
              }
            />
            <LabelSelect
              label="方向"
              value={stringValue(relation.direction)}
              options={enumOptions(["one-way", "two-way", "inbound", "outbound"])}
              allowEmpty
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "direction", value);
                  return nextRelation;
                })
              }
            />
            <LabelTextarea
              label="说明"
              value={stringValue(relation.description)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "description", value);
                  return nextRelation;
                })
              }
            />
          </div>
        ) : null}
        {editorDraft.diagramKind === "sequence" ? (
          <div className="grid gap-2 md:grid-cols-2">
            <LabelTextarea
              label="参数"
              value={stringListValue(relation.parameters).join("\n")}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => ({
                  ...currentRelation,
                  parameters: textToStringList(value),
                }))
              }
            />
            <LabelTextInput
              label="返回值"
              value={stringValue(relation.returnValue)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "returnValue", value);
                  return nextRelation;
                })
              }
            />
            <LabelTextInput
              label="条件"
              value={stringValue(relation.condition)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "condition", value);
                  return nextRelation;
                })
              }
            />
            <LabelTextarea
              label="说明"
              value={stringValue(relation.description)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "description", value);
                  return nextRelation;
                })
              }
            />
          </div>
        ) : null}
        {editorDraft.diagramKind === "table" ? (
          <div className="grid gap-2 md:grid-cols-2">
            <LabelSelect
              label="源字段"
              value={stringValue(relation.sourceColumnId)}
              options={columnsForTable(stringValue(relation.sourceTableId))}
              allowEmpty
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "sourceColumnId", value);
                  return nextRelation;
                })
              }
            />
            <LabelSelect
              label="目标字段"
              value={stringValue(relation.targetColumnId)}
              options={columnsForTable(stringValue(relation.targetTableId))}
              allowEmpty
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "targetColumnId", value);
                  return nextRelation;
                })
              }
            />
            <LabelTextarea
              label="说明"
              value={stringValue(relation.description)}
              onChange={(value) =>
                updateRelation(id, (currentRelation) => {
                  const nextRelation = { ...currentRelation };
                  setOptionalStringValue(nextRelation, "description", value);
                  return nextRelation;
                })
              }
            />
          </div>
        ) : null}
      </div>
    );
  };

  const editingElement = elementEditor
    ? collectionItems(elementEditor.draft, elementEditor.collection).find(
        (item) => stringValue(item.id) === elementEditor.itemId,
      ) ?? null
    : null;
  const editingRelation = relationEditor
    ? relationshipItems(relationEditor.draft).find(
        (relation) => stringValue(relation.id) === relationEditor.relationId,
      ) ?? null
    : null;

  const commitElementEdit = async () => {
    if (!elementEditor) return;
    const nextDraft = elementEditor.draft;
    setElementEditor(null);
    await onCommitDraft(nextDraft);
  };

  const commitRelationEdit = async () => {
    if (!relationEditor) return;
    const nextDraft = relationEditor.draft;
    setRelationEditor(null);
    await onCommitDraft(nextDraft);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    let nextDraft: Record<string, unknown>;
    if (deleteTarget.kind === "element") {
      nextDraft = removeDanglingRelations(
        updateDraftCollection(draft, deleteTarget.collection, (currentItems) =>
          currentItems.filter((currentItem) => stringValue(currentItem.id) !== deleteTarget.id),
        ),
      );
    } else {
      const nextRelationships = relationshipItems(draft).filter(
        (currentRelation) => stringValue(currentRelation.id) !== deleteTarget.id,
      );
      nextDraft =
        draft.diagramKind === "sequence"
          ? { ...draft, messages: nextRelationships }
          : { ...draft, relationships: nextRelationships };
    }
    setDeleteTarget(null);
    await onCommitDraft(nextDraft);
  };

  return (
    <>
      <div className="space-y-8">
        <section className="space-y-4">
          <div className="border-b border-border pb-3">
            <h3 className="text-lg font-semibold text-foreground">元素清单</h3>
            <div
              className="mt-3 flex items-center justify-between gap-3 overflow-x-auto pb-1"
              aria-label="元素清单工具栏"
            >
              <div className="flex min-w-max items-center gap-2">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="搜索元素"
                    value={elementSearch}
                    onChange={(event) => setElementSearch(event.target.value)}
                    className="h-9 w-64 rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="搜索元素、属性或说明"
                  />
                </label>
                {detailModel.groups.length > 0 ? (
                  <div
                    className="flex items-center gap-2"
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
                        {detailModel.items.length}
                      </span>
                    </Button>
                    {detailModel.groups.map((group) => (
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
                ) : null}
              </div>
              <div className="ml-auto flex min-w-max items-center gap-2">
                {collections.map((collection) => (
                  <Button
                    key={`add:${collection.key}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={saving}
                    onClick={() => {
                      const nextItem = collection.create();
                      const itemId = stringValue(nextItem.id);
                      const nextDraft = updateDraftCollection(draft, collection, (currentItems) => [
                        ...currentItems,
                        nextItem,
                      ]);
                      setElementEditor({
                        collection,
                        itemId,
                        draft: nextDraft,
                        mode: "create",
                      });
                    }}
                  >
                    <Plus className="size-3.5" /> 添加{collection.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div>
            {detailModel.groups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                未识别到元素。
              </div>
            ) : filteredElements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                没有匹配的元素，请调整搜索或类型筛选。
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {filteredElements.map((el) => {
                  const editable = editableItemsById.get(el.id);
                  const active = selectedElement?.kind === el.kind && selectedElement.id === el.id;
                  const fieldSummary = el.fields
                    .slice(0, 3)
                    .map((field) => `${field.label}：${field.value}`)
                    .join(" / ");
                  return (
                    <article
                      key={`${el.kind}:${el.id}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`定位元素：${el.label}`}
                      aria-pressed={active}
                      onClick={() => onSelectElement(el)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onSelectElement(el);
                      }}
                      className={cn(
                        "min-h-[8.75rem] cursor-pointer overflow-hidden rounded-lg border p-2.5 text-left text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:bg-accent/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Badge variant="secondary" className="shrink-0 bg-primary/10 text-xs text-primary">
                          {SEMANTIC_KIND_META[el.kind].label}
                        </Badge>
                        <div className="flex min-w-0 flex-1 justify-end gap-1">
                          {editable ? (
                            <>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                aria-label={namedActionLabel(
                                  "编辑",
                                  editable.collection.label,
                                  itemLabel(editable.item, editable.collection),
                                )}
                                disabled={saving}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setElementEditor({
                                    collection: editable.collection,
                                    itemId: el.id,
                                    draft: cloneDraftModel(draft),
                                    mode: "edit",
                                  });
                                }}
                              >
                                <span className="sr-only">编辑</span>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive"
                                aria-label={namedActionLabel(
                                  "删除",
                                  editable.collection.label,
                                  itemLabel(editable.item, editable.collection),
                                )}
                                disabled={saving}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteTarget({
                                    kind: "element",
                                    collection: editable.collection,
                                    id: el.id,
                                    label: `${editable.collection.label} ${itemLabel(editable.item, editable.collection) || `未命名${editable.collection.label}`}`,
                                  });
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 line-clamp-1 min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
                        {el.label}
                      </div>
                      <div className="mt-1.5 line-clamp-2 min-h-10 text-[11px] leading-5 text-muted-foreground">
                        {el.description || "暂无说明。"}
                      </div>
                      <div className="mt-2 border-t border-border pt-2">
                        <div className="line-clamp-1 break-words text-[11px] text-muted-foreground">
                          {fieldSummary || "暂无字段"}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {el.fields.length} 个字段
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="border-b border-border pb-3">
            <h3 className="text-lg font-semibold text-foreground">关系说明</h3>
            <div
              className="mt-3 flex items-center justify-between gap-3 overflow-x-auto pb-1"
              aria-label="关系说明工具栏"
            >
              <div className="flex min-w-max items-center gap-2">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="搜索关系"
                    value={relationSearch}
                    onChange={(event) => setRelationSearch(event.target.value)}
                    className="h-9 w-64 rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="搜索关系、端点或说明"
                  />
                </label>
                {relationships.length > 0 ? (
                  <div
                    className="flex items-center gap-2"
                    aria-label="按关系类型筛选"
                    role="group"
                  >
                    <Button
                      type="button"
                      variant={relationKindFilter === "all" ? "default" : "outline"}
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={() => setRelationKindFilter("all")}
                    >
                      全部关系
                      <span className="ml-1 font-mono text-[10px] opacity-75">
                        {relationships.length}
                      </span>
                    </Button>
                    {relationFilterOptions.map((option) => (
                      <Button
                        key={`relation-filter:${option.label}`}
                        type="button"
                        variant={relationKindFilter === option.label ? "default" : "outline"}
                        size="sm"
                        className="h-8 rounded-full px-3 text-xs"
                        onClick={() => setRelationKindFilter(option.label)}
                      >
                        {option.label}
                        <span className="ml-1 font-mono text-[10px] opacity-75">
                          {option.count}
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto h-8"
                disabled={endpointOptions.length === 0 || saving}
                onClick={() => {
                  const nextRelation = createRelationshipDraft(draft);
                  const relationId = stringValue(nextRelation.id);
                  const nextDraft =
                    draft.diagramKind === "sequence"
                      ? { ...draft, messages: [...relationshipItems(draft), nextRelation] }
                      : { ...draft, relationships: [...relationshipItems(draft), nextRelation] };
                  setRelationEditor({
                    relationId,
                    draft: nextDraft,
                    mode: "create",
                  });
                }}
              >
                <Plus className="size-3.5" /> 添加关系
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {relationships.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                暂无结构化关系。
              </div>
            ) : filteredRelationships.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                没有匹配的关系，请调整搜索或类型筛选。
              </div>
            ) : (
              filteredRelationships.map((relationSummary) => {
                const {
                  id,
                  detailRelation,
                  displayLabel,
                  sourceLabel,
                  targetLabel,
                  typeLabel,
                } = relationSummary;
                return (
                  <article
                    key={id}
                    className={cn(
                      "rounded-lg border border-border border-l-4 bg-card shadow-sm",
                      getRelationAccentClass(Math.max(0, detailModel.relationships.findIndex((item) => item.id === id))),
                    )}
                  >
                    <div className="flex items-center gap-4 p-4">
                      <div className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-4 py-3 text-center">
                        <div className="truncate text-sm font-medium text-foreground">
                          {sourceLabel || "未指定起点"}
                        </div>
                      </div>
                      <div className="grid min-w-[160px] flex-[1.3] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center text-xs text-muted-foreground">
                        <span className="h-px min-w-8 bg-border" />
                        <span className="max-w-40 truncate bg-card px-2 text-center">
                          <span className="block truncate text-foreground">{displayLabel}</span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {typeLabel}
                          </span>
                        </span>
                        <span className="relative h-px min-w-8 bg-border">
                          <ArrowRight className="absolute right-0 top-1/2 size-4 -translate-y-1/2 translate-x-1/2 text-border" />
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-4 py-3 text-center">
                        <div className="truncate text-sm font-medium text-foreground">
                          {targetLabel || "未指定终点"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={namedActionLabel("编辑", "关系", displayLabel)}
                        disabled={saving}
                        onClick={() =>
                          setRelationEditor({
                            relationId: id,
                            draft: cloneDraftModel(draft),
                            mode: "edit",
                          })
                        }
                      >
                        <span className="sr-only">编辑</span>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        aria-label={namedActionLabel("删除", "关系", displayLabel)}
                        disabled={saving}
                        onClick={() =>
                          setDeleteTarget({
                            kind: "relation",
                            id,
                            label: `关系 ${displayLabel || "未命名关系"}`,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      <Dialog open={Boolean(elementEditor)} onOpenChange={(open) => !open && setElementEditor(null)}>
        <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {elementEditor
                ? `${elementEditor.mode === "create" ? "添加" : "编辑"}${elementEditor.collection.label}`
                : "编辑元素"}
            </DialogTitle>
            <DialogDescription>
              确认后会保存当前模型草稿，并自动更新当前图。
            </DialogDescription>
          </DialogHeader>
          {elementEditor && editingElement ? (
            <div className="space-y-4 [&_.grid]:!grid-cols-1">
              <LabelTextInput
                label={editorFieldLabel(elementEditor.collection.label, "名称")}
                value={itemLabel(editingElement, elementEditor.collection)}
                onChange={(value) =>
                  updateItem(elementEditor.collection, elementEditor.itemId, (currentItem) => {
                    const nextItem = { ...currentItem };
                    setItemLabel(nextItem, elementEditor.collection, value);
                    return nextItem;
                  })
                }
              />
              {renderCollectionExtras(
                elementEditor.collection,
                editingElement,
                elementEditor.itemId,
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              未找到可编辑元素。
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setElementEditor(null)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={commitElementEdit}
              disabled={!editingElement || saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {elementEditor?.mode === "create" ? "确认添加" : "确认编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(relationEditor)} onOpenChange={(open) => !open && setRelationEditor(null)}>
        <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {relationEditor?.mode === "create" ? "添加关系" : "编辑关系"}
            </DialogTitle>
            <DialogDescription>
              调整端点、类型和关系字段后，确认会保存草稿并自动更新当前图。
            </DialogDescription>
          </DialogHeader>
          {relationEditor && editingRelation ? (
            <div className="[&_.grid]:!grid-cols-1">
              {renderRelationEditors(editingRelation, relationEditor.relationId)}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              未找到可编辑关系。
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRelationEditor(null)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={commitRelationEdit}
              disabled={!editingRelation || saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {relationEditor?.mode === "create" ? "确认添加" : "确认编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.kind === "element" ? `删除${deleteTarget.collection.label}` : "删除关系"}
            </DialogTitle>
            <DialogDescription>
              将删除{deleteTarget?.label ?? "当前项"}，并清理相关引用或关系。确认删除后会自动保存并更新当前图。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    manualModelEditStatus,
    saveRequirementModelEdit,
    saveDesignModelEdit,
    rerenderRequirementModel,
    rerenderDesignModel,
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
  const requirementModel = !isDesign
    ? modelId
      ? models[modelId]
      : models[requirementType]
    : undefined;
  const requirementArtifactId = requirementModel
    ? getRequirementModelId(requirementModel)
    : modelId ?? requirementType;
  const source = isDesign
    ? designPlantUml[designArtifactId] ?? ""
    : plantUml[requirementArtifactId] ?? plantUml[requirementType] ?? "";
  const model = isDesign ? designModel : requirementModel;
  const svgMarkup = isDesign
    ? designSvgArtifacts[designArtifactId]?.svg ?? ""
    : svgArtifacts[requirementArtifactId]?.svg ?? svgArtifacts[requirementType]?.svg ?? "";
  const diagramError = isDesign
    ? designDiagramErrors[designType] ?? null
    : diagramErrors[requirementArtifactId] ?? diagramErrors[requirementType] ?? null;
  const statusKey = isDesign ? designArtifactId : requirementArtifactId;
  const editStatus = manualModelEditStatus[statusKey];
  const [draft, setDraft] = useState<Record<string, unknown> | null>(() =>
    model ? cloneDraftModel(model) : null,
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const persistedDraftFingerprintRef = useRef(draftFingerprint(model ? cloneDraftModel(model) : null));
  const [svgUrl, setSvgUrl] = useState("");
  const [svgScale, setSvgScale] = useState(1);
  const svgScaleRef = useRef(svgScale);
  const svgCanvasRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [svgPanOffset, setSvgPanOffset] = useState({ x: 0, y: 0 });
  const [elementSearch, setElementSearch] = useState("");
  const [elementKindFilter, setElementKindFilter] = useState<"all" | SemanticElementKind>(
    "all",
  );
  const [relationsOnlyFocus, setRelationsOnlyFocus] = useState(false);
  const [localHighlightedElement, setLocalHighlightedElement] = useState<{
    kind: string;
    id: string;
  } | null>(null);
  const [highlightRequestId, setHighlightRequestId] = useState(0);
  const [isOverviewPanelOpen, setIsOverviewPanelOpen] = useState(() =>
    Boolean(highlightedElement),
  );
  const overviewPanelDismissedRef = useRef(false);
  useEffect(() => {
    const nextDraft = model ? cloneDraftModel(model) : null;
    setDraft(nextDraft);
    persistedDraftFingerprintRef.current = draftFingerprint(nextDraft);
    setSaveStatus("idle");
    setLocalHighlightedElement(null);
    overviewPanelDismissedRef.current = false;
    setIsOverviewPanelOpen(Boolean(highlightedElement));
  }, [highlightedElement, model, statusKey]);
  const setDraftField = useCallback((key: string, value: unknown) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);
  const commitDraftAndRerender = useCallback(async (nextDraft: Record<string, unknown>) => {
    setDraft(nextDraft);
    setSaving(true);
    setSaveStatus("saving");
    try {
      if (isDesign) {
        await saveDesignModelEdit(designArtifactId, nextDraft as never);
        await rerenderDesignModel(designArtifactId, nextDraft as never, {
          toastMessage: null,
        });
      } else {
        await saveRequirementModelEdit(requirementType, nextDraft as never);
        await rerenderRequirementModel(requirementType, nextDraft as never, {
          toastMessage: null,
        });
      }
      persistedDraftFingerprintRef.current = draftFingerprint(nextDraft);
      setSaveStatus("saved");
      toast.message("修改已保存，当前图已更新");
    } catch {
      setSaveStatus("error");
      toast.error("保存失败，请稍后重试");
      return;
    } finally {
      setSaving(false);
    }
  }, [
    designArtifactId,
    isDesign,
    requirementType,
    rerenderDesignModel,
    rerenderRequirementModel,
    saveDesignModelEdit,
    saveRequirementModelEdit,
  ]);
  useEffect(() => {
    if (!draft || saving) return;
    const fingerprint = draftFingerprint(draft);
    if (fingerprint === persistedDraftFingerprintRef.current) return;
    const timer = window.setTimeout(() => {
      void commitDraftAndRerender(draft);
    }, 600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [commitDraftAndRerender, draft, saving]);
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
    panStateRef.current.pointerId = null;
    setIsPanning(false);
    setSvgPanOffset({ x: 0, y: 0 });
  }, [svgMarkup]);
  const startCanvasPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if ((typeof event.button === "number" && event.button !== 0) || !svgMarkup) return;

    const canvas = svgCanvasRef.current;
    if (!canvas) return;

    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    panStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: svgPanOffset.x,
      offsetY: svgPanOffset.y,
    };
    window.getSelection()?.removeAllRanges();
    setIsPanning(true);
  }, [svgMarkup, svgPanOffset.x, svgPanOffset.y]);
  const moveCanvasPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const panState = panStateRef.current;
    if (!panState.active || panState.pointerId !== event.pointerId) return;

    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    setSvgPanOffset({
      x: panState.offsetX + event.clientX - panState.startX,
      y: panState.offsetY + event.clientY - panState.startY,
    });
  }, []);
  const stopCanvasPan = useCallback((event?: PointerEvent<HTMLDivElement>) => {
    if (!panStateRef.current.active) return;

    if (event && panStateRef.current.pointerId !== event.pointerId) return;
    if (event) {
      svgCanvasRef.current?.releasePointerCapture?.(event.pointerId);
    }
    panStateRef.current.active = false;
    panStateRef.current.pointerId = null;
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
  const detailModel = useMemo(() => buildDiagramDetailModel(draft ?? model), [draft, model]);
  const { items, groups, relationships } = detailModel;
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const effectiveHighlightedElement = localHighlightedElement ?? highlightedElement ?? null;
  const highlighted: DiagramDetailItem | undefined = useMemo(() => {
    if (!effectiveHighlightedElement) return undefined;
    return items.find(
      (e) => e.kind === effectiveHighlightedElement.kind && e.id === effectiveHighlightedElement.id,
    );
  }, [items, effectiveHighlightedElement]);
  const selectElementInDiagram = useCallback((element: DiagramDetailItem) => {
    setLocalHighlightedElement({ kind: element.kind, id: element.id });
    setHighlightRequestId((current) => current + 1);
    if (!overviewPanelDismissedRef.current) {
      setIsOverviewPanelOpen(true);
    }
  }, []);
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
  const highlightedElementKey = highlightedElement
    ? `${highlightedElement.kind}:${highlightedElement.id}`
    : "";
  useEffect(() => {
    if (!highlightedElementKey || overviewPanelDismissedRef.current) return;
    setIsOverviewPanelOpen(true);
  }, [highlightedElementKey]);
  const modelTitle = getModelText(draft ?? model, "title", meta.label);
  const modelSummary = getModelText(draft ?? model, "summary", meta.description);
  const designSourceText = isDesign
    ? designSourceLabel(designType, draft ?? (designModel ? cloneDraftModel(designModel) : null))
    : null;
  const requirementSourceText = !isDesign ? requirementSourceLabel(sourceRules) : null;
  const sourceText = designSourceText ?? requirementSourceText;
  const editWarningText = editStatus?.warning?.includes("重绘当前图")
    ? "模型已手动修改，可能与前置需求映射不一致。保存后会自动更新当前图。"
    : editStatus?.warning ??
      "手动修改会更新当前模型结构，可能不再完全对应原始需求或上游用例。修改保存后会基于当前结构自动更新此图。";
  const overviewPanelId = `model-overview-${stage}-${statusKey}`.replace(/[^A-Za-z0-9_-]/g, "-");
  const openOverviewPanel = useCallback(() => {
    overviewPanelDismissedRef.current = false;
    setIsOverviewPanelOpen(true);
  }, []);
  const closeOverviewPanel = useCallback(() => {
    overviewPanelDismissedRef.current = true;
    setIsOverviewPanelOpen(false);
  }, []);
  useEffect(() => {
    if (!isOverviewPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverviewPanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOverviewPanel, isOverviewPanelOpen]);
  const diagramActions = (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant={isOverviewPanelOpen ? "secondary" : "outline"}
        size="sm"
        className="h-8"
        onClick={isOverviewPanelOpen ? closeOverviewPanel : openOverviewPanel}
        aria-label={isOverviewPanelOpen ? "收起模型概览" : "打开模型概览"}
        aria-expanded={isOverviewPanelOpen}
        aria-controls={overviewPanelId}
      >
        <PanelRightOpen className="size-3.5" /> 模型概览
      </Button>
      {svgMarkup ? (
        <>
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
        </>
      ) : null}
    </div>
  );

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
            </div>
          )}

          <header className="px-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {draft ? (
                    <input
                      aria-label="模型标题"
                      value={stringValue(draft.title)}
                      onChange={(event) => setDraftField("title", event.target.value)}
                      className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1 py-0 text-2xl font-semibold tracking-normal text-foreground outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  ) : (
                    <h2 className="truncate text-2xl font-semibold tracking-normal text-foreground">
                      {modelTitle}
                    </h2>
                  )}
                </div>
                {draft ? (
                  <>
                    <textarea
                      aria-label="模型摘要"
                      value={stringValue(draft.summary)}
                      onChange={(event) => setDraftField("summary", event.target.value)}
                      rows={2}
                      className="mt-1 block w-full max-w-3xl resize-y rounded-md border border-transparent bg-transparent px-1 py-0 text-sm leading-6 text-muted-foreground outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  </>
                ) : (
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {modelSummary}
                  </p>
                )}
                {sourceText ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md border border-border bg-muted/40 px-2 py-1">
                      {sourceText}
                    </span>
                    {saveStatus === "saving" ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Loader2 className="size-3 animate-spin" />
                        保存并更新图中
                      </span>
                    ) : saveStatus === "saved" ? (
                      <span className="text-success">修改已保存</span>
                    ) : saveStatus === "error" ? (
                      <span className="text-destructive">保存失败</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:w-auto">
                <div className="grid grid-cols-3 gap-2 text-center">
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
            </div>
          </header>

          <Tabs
            key={`${stage}:${type}:${highlighted ? highlighted.id : "all"}`}
            defaultValue="diagram"
            className="gap-0 rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="border-b border-border px-5">
              <TabsList className="h-auto w-full justify-start gap-8 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="diagram"
                  className="relative h-12 flex-none rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block"
                >
                  图
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="diagram" className="m-0 p-0">
              <div className="p-5">
                <section
                  data-testid="diagram-preview-section"
                  className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-background"
                >
                  <div className="flex flex-col gap-3 rounded-t-xl border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">预览</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                    {diagramActions}
                  </div>
                  <div className="relative">
                    <div
                      ref={svgCanvasRef}
                      data-testid="svg-preview-canvas"
                      className={cn(
                        "h-[560px] overflow-hidden select-none touch-none",
                        svgMarkup && (isPanning ? "cursor-grabbing" : "cursor-grab"),
                      )}
                      onPointerDown={startCanvasPan}
                      onPointerMove={moveCanvasPan}
                      onPointerUp={stopCanvasPan}
                      onPointerCancel={stopCanvasPan}
                    >
                      {svgMarkup ? (
                        <div
                          className="flex min-h-full min-w-full items-center justify-center"
                          style={{
                            transform: `translate(${svgPanOffset.x}px, ${svgPanOffset.y}px)`,
                          }}
                        >
                          <InlineSvg
                            svg={svgMarkup}
                            scale={svgScale}
                            highlightLabel={highlighted?.label}
                            highlightKey={highlightRequestId}
                            className="w-full select-none [&_*]:select-none [&>svg]:drop-shadow-sm"
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
                    {isOverviewPanelOpen ? (
                      <aside
                        id={overviewPanelId}
                        role="complementary"
                        aria-label={highlighted ? "焦点元素详情" : "模型概览"}
                        className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(22rem,calc(100%-1.5rem))] flex-col gap-3 overflow-auto rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur sm:w-80"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">
                            {highlighted ? "焦点元素" : "模型概览"}
                          </h3>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            aria-label="关闭模型概览"
                            onClick={closeOverviewPanel}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                        {highlighted ? (
                          <>
                            <section className="rounded-lg border border-border bg-background p-3">
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
                                  onClick={() => {
                                    if (localHighlightedElement) {
                                      setLocalHighlightedElement(null);
                                      return;
                                    }
                                    if (isDesign) {
                                      openDesignDiagram(
                                        designType,
                                        designArtifactId,
                                        getModelText(model, "title", meta.label),
                                      );
                                    } else {
                                      openDiagram(
                                        requirementType,
                                        requirementArtifactId,
                                        getModelText(model, "title", meta.label),
                                      );
                                    }
                                  }}
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
                            <section className="rounded-lg border border-border bg-background p-3">
                              <h4 className="text-sm font-semibold text-foreground">相关关系与元素</h4>
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
                          <section className="rounded-lg border border-border bg-background p-3">
                            <div className="flex flex-col gap-3">
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
                        )}
                      </aside>
                    ) : null}
                  </div>
                </section>
              </div>
              <div className="px-5 pb-5">
                <div className="mb-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                  <span>{editWarningText}</span>
                </div>
                <ModelEditPanel
                  draft={draft}
                  setDraft={setDraft}
                  onCommitDraft={commitDraftAndRerender}
                  onSelectElement={selectElementInDiagram}
                  selectedElement={effectiveHighlightedElement}
                  saving={saving}
                />
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
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                                        requirementArtifactId,
                                      )
                                }
                                className={cn(
                                  "min-h-[8.5rem] overflow-hidden rounded-lg border p-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-card text-foreground hover:bg-accent",
                                )}
                              >
                                <span className="flex items-start justify-between gap-3">
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                                    {SEMANTIC_KIND_META[el.kind].shortLabel}
                                  </span>
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {SEMANTIC_KIND_META[el.kind].label}
                                  </Badge>
                                </span>
                                <span className="mt-2 block min-w-0 line-clamp-1 break-words text-sm font-semibold leading-5 text-foreground">
                                  {el.label}
                                </span>
                                {el.description && (
                                  <span className="mt-1.5 line-clamp-2 block min-h-10 text-[11px] leading-5 text-muted-foreground">
                                    {el.description}
                                  </span>
                                )}
                                {!el.description && (
                                  <span className="mt-1.5 line-clamp-2 block min-h-10 text-[11px] leading-5 text-muted-foreground">
                                    暂无说明。
                                  </span>
                                )}
                                <span className="mt-2 block border-t border-border pt-2">
                                  <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                    <span className="min-w-0 line-clamp-1 break-words">
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

          </div>
        </div>
      )}
    </div>
  );
}
