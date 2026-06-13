// Renders the editable diagram model panel, including element, relation, and delete workflows.
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  buildDiagramDetailModel,
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import {
  cloneDraftModel,
  collectionItems,
  createRelationshipDraft,
  editableCollectionsFor,
  itemLabel,
  relationEndpointKey,
  relationName,
  relationshipItems,
  removeDanglingRelations,
  setOptionalStringValue,
  stringValue,
  updateDraftCollection,
  updateDraftItem,
  type EditableCollection,
} from "../lib/model-editing";
import {
  getRelationDisplayLabel,
  getRelationEndpointLabel,
  matchesItemSearch,
} from "../lib/diagram-detail-view-model";
import { ModelEditDialogs } from "./model-edit-dialogs";
import {
  ModelElementListSection,
  ModelRelationshipListSection,
  type ModelRelationshipListItem,
} from "./model-edit-lists";
import { ModelElementEditor } from "./model-element-editor";
import { ModelRelationEditor } from "./model-relation-editor";

export function ModelEditPanel({
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
  const relationshipSummaries: ModelRelationshipListItem[] = relationships.map((relation) => {
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
      displayLabel,
      typeLabel,
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

  const createElement = (collection: EditableCollection) => {
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
  };

  const editElement = (
    elementId: string,
    editable: { collection: EditableCollection },
  ) => {
    setElementEditor({
      collection: editable.collection,
      itemId: elementId,
      draft: cloneDraftModel(draft),
      mode: "edit",
    });
  };

  const deleteElement = (
    elementId: string,
    editable: { collection: EditableCollection; item: Record<string, unknown> },
  ) => {
    setDeleteTarget({
      kind: "element",
      collection: editable.collection,
      id: elementId,
      label: `${editable.collection.label} ${
        itemLabel(editable.item, editable.collection) ||
        `未命名${editable.collection.label}`
      }`,
    });
  };

  const createRelation = () => {
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
  };

  const editRelation = (relationId: string) => {
    setRelationEditor({
      relationId,
      draft: cloneDraftModel(draft),
      mode: "edit",
    });
  };

  const deleteRelation = (relationId: string, displayLabel: string) => {
    setDeleteTarget({
      kind: "relation",
      id: relationId,
      label: `关系 ${displayLabel || "未命名关系"}`,
    });
  };

  const relationshipOrderIds = detailModel.relationships.map(
    (relation) => relation.id,
  );

  return (
    <>
      <div className="space-y-8">
        <ModelElementListSection
          elementSearch={elementSearch}
          onElementSearchChange={setElementSearch}
          elementKindFilter={elementKindFilter}
          onElementKindFilterChange={setElementKindFilter}
          detailGroups={detailModel.groups}
          detailItemCount={detailModel.items.length}
          collections={collections}
          filteredElements={filteredElements}
          editableItemsById={editableItemsById}
          selectedElement={selectedElement}
          saving={saving}
          onCreateElement={createElement}
          onEditElement={editElement}
          onDeleteElement={deleteElement}
          onSelectElement={onSelectElement}
        />

        <ModelRelationshipListSection
          relationSearch={relationSearch}
          onRelationSearchChange={setRelationSearch}
          relationKindFilter={relationKindFilter}
          onRelationKindFilterChange={setRelationKindFilter}
          relationshipsCount={relationships.length}
          filteredRelationships={filteredRelationships}
          relationFilterOptions={relationFilterOptions}
          endpointOptionsCount={endpointOptions.length}
          relationshipOrderIds={relationshipOrderIds}
          saving={saving}
          onCreateRelation={createRelation}
          onEditRelation={editRelation}
          onDeleteRelation={deleteRelation}
        />
      </div>

      <ModelEditDialogs
        elementEditor={elementEditor}
        relationEditor={relationEditor}
        deleteTarget={deleteTarget}
        hasEditingElement={Boolean(elementEditor && editingElement)}
        hasEditingRelation={Boolean(relationEditor && editingRelation)}
        saving={saving}
        onCloseElement={() => setElementEditor(null)}
        onCloseRelation={() => setRelationEditor(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onCommitElement={commitElementEdit}
        onCommitRelation={commitRelationEdit}
        onConfirmDelete={confirmDelete}
        renderElementFields={() =>
          elementEditor && editingElement ? (
            <ModelElementEditor
              editorDraft={editorDraft}
              collection={elementEditor.collection}
              item={editingElement}
              itemId={elementEditor.itemId}
              actorOptions={actorOptions}
              laneOptions={laneOptions}
              messageOptions={messageOptions}
              tableOptions={tableOptions}
              columnsForTable={columnsForTable}
              updateItem={updateItem}
            />
          ) : null
        }
        renderRelationFields={() =>
          relationEditor && editingRelation ? (
            <div className="[&_.grid]:!grid-cols-1">
              <ModelRelationEditor
                editorDraft={editorDraft}
                relation={editingRelation}
                relationId={relationEditor.relationId}
                endpointOptions={endpointOptions}
                columnsForTable={columnsForTable}
                updateRelation={updateRelation}
              />
            </div>
          ) : null
        }
      />
    </>
  );
}
