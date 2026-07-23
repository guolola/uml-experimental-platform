// Renders element-specific edit fields for the model editor dialog.
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import {
  activityNodeForType,
  booleanValue,
  createDraftId,
  itemLabel,
  setItemLabel,
  setOptionalStringValue,
  stringListValue,
  stringValue,
  textToStringList,
  type EditableCollection,
} from "../lib/model-editing";
import {
  LabelCheckbox,
  LabelSelect,
  LabelTextInput,
  LabelTextarea,
  SourceRuleChecklist,
  editorFieldLabel,
  enumOptions,
  ordinalLabel,
} from "./model-edit-fields";
import { OperationEditors } from "./model-operation-editor";

type SelectOption = {
  value: string;
  label: string;
};

type UpdateElementItem = (
  collection: EditableCollection,
  itemId: string,
  updater: (item: Record<string, unknown>) => Record<string, unknown>,
) => void;

export function ModelElementEditor({
  editorDraft,
  collection,
  item,
  itemId,
  actorOptions,
  laneOptions,
  messageOptions,
  tableOptions,
  columnsForTable,
  updateItem,
  sourceRuleOptions = [],
}: {
  editorDraft: Record<string, unknown>;
  collection: EditableCollection;
  item: Record<string, unknown>;
  itemId: string;
  actorOptions: SelectOption[];
  laneOptions: SelectOption[];
  messageOptions: SelectOption[];
  tableOptions: SelectOption[];
  columnsForTable: (tableId: string) => SelectOption[];
  updateItem: UpdateElementItem;
  sourceRuleOptions?: Array<{ id: string; label: string }>;
}) {
  const setItemField = (key: string, value: unknown) => {
    updateItem(collection, itemId, (currentItem) => ({
      ...currentItem,
      [key]: value,
    }));
  };
  const setItemOptionalString = (key: string, value: string) => {
    updateItem(collection, itemId, (currentItem) => {
      const nextItem = { ...currentItem };
      setOptionalStringValue(nextItem, key, value);
      return nextItem;
    });
  };
  const itemPrefix = collection.label;

  return (
    <div className="space-y-4 [&_.grid]:!grid-cols-1">
      <LabelTextInput
        label={editorFieldLabel(collection.label, "name")}
        value={itemLabel(item, collection)}
        onChange={(value) =>
          updateItem(collection, itemId, (currentItem) => {
            const nextItem = { ...currentItem };
            setItemLabel(nextItem, collection, value);
            return nextItem;
          })
        }
      />
      <ElementExtraFields
        editorDraft={editorDraft}
        collection={collection}
        item={item}
        itemId={itemId}
        itemPrefix={itemPrefix}
        actorOptions={actorOptions}
        laneOptions={laneOptions}
        messageOptions={messageOptions}
        tableOptions={tableOptions}
        columnsForTable={columnsForTable}
        updateItem={updateItem}
        sourceRuleOptions={sourceRuleOptions}
        setItemField={setItemField}
        setItemOptionalString={setItemOptionalString}
      />
    </div>
  );
}

function ElementExtraFields({
  editorDraft,
  collection,
  item,
  itemId,
  itemPrefix,
  actorOptions,
  laneOptions,
  messageOptions,
  tableOptions,
  columnsForTable,
  updateItem,
  setItemField,
  setItemOptionalString,
  sourceRuleOptions,
}: {
  editorDraft: Record<string, unknown>;
  collection: EditableCollection;
  item: Record<string, unknown>;
  itemId: string;
  itemPrefix: string;
  actorOptions: SelectOption[];
  laneOptions: SelectOption[];
  messageOptions: SelectOption[];
  tableOptions: SelectOption[];
  columnsForTable: (tableId: string) => SelectOption[];
  updateItem: UpdateElementItem;
  setItemField: (key: string, value: unknown) => void;
  setItemOptionalString: (key: string, value: string) => void;
  sourceRuleOptions: Array<{ id: string; label: string }>;
}) {
  const { t } = useTranslation();
  if (editorDraft.diagramKind === "context") {
    const isCenterSystem = collection.key === "system";
    return (
      <div className="grid gap-3">
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "description")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
        {!isCenterSystem ? (
          <SourceRuleChecklist
            selectedIds={stringListValue(item.sourceRequirementIds)}
            options={sourceRuleOptions}
            onChange={(ids) => setItemField("sourceRequirementIds", ids)}
          />
        ) : null}
      </div>
    );
  }
  if (editorDraft.diagramKind === "usecase" && collection.key === "actors") {
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <LabelSelect
          label={editorFieldLabel(itemPrefix, "type")}
          value={stringValue(item.actorType) || "human"}
          options={enumOptions(["human", "system", "external"])}
          onChange={(value) => setItemField("actorType", value)}
        />
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "responsibilities")}
          value={stringListValue(item.responsibilities).join("\n")}
          onChange={(value) =>
            setItemField("responsibilities", textToStringList(value))
          }
        />
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
      </div>
    );
  }
  if (editorDraft.diagramKind === "usecase" && collection.key === "useCases") {
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <LabelTextInput
          label={editorFieldLabel(itemPrefix, "goal")}
          value={stringValue(item.goal)}
          onChange={(value) => setItemField("goal", value)}
        />
        <LabelSelect
          label={editorFieldLabel(itemPrefix, "primaryActor")}
          value={stringValue(item.primaryActorId)}
          options={actorOptions}
          allowEmpty
          onChange={(value) => setItemOptionalString("primaryActorId", value)}
        />
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "preconditions")}
          value={stringListValue(item.preconditions).join("\n")}
          onChange={(value) =>
            setItemField("preconditions", textToStringList(value))
          }
        />
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "postconditions")}
          value={stringListValue(item.postconditions).join("\n")}
          onChange={(value) =>
            setItemField("postconditions", textToStringList(value))
          }
        />
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>{editorFieldLabel(itemPrefix, "supportingActors")}</div>
          {actorOptions.map((actor) => (
            <LabelCheckbox
              key={`${itemPrefix}:support:${actor.value}`}
              label={t("diagramEditor.supportingActor", { name: actor.label || t("diagramEditor.unnamedActor") })}
              checked={stringListValue(item.supportingActorIds).includes(
                actor.value,
              )}
              onChange={(checked) =>
                setItemField(
                  "supportingActorIds",
                  checked
                    ? Array.from(
                        new Set([
                          ...stringListValue(item.supportingActorIds),
                          actor.value,
                        ]),
                      )
                    : stringListValue(item.supportingActorIds).filter(
                        (id) => id !== actor.value,
                      ),
                )
              }
            />
          ))}
        </div>
      </div>
    );
  }
  if (
    editorDraft.diagramKind === "usecase" &&
    collection.key === "systemBoundaries"
  ) {
    return (
      <LabelTextarea
        label={editorFieldLabel(itemPrefix, "说明")}
        value={stringValue(item.description)}
        onChange={(value) => setItemOptionalString("description", value)}
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
            options={enumOptions([
              "entity",
              "aggregate",
              "valueObject",
              "service",
              "other",
            ])}
            allowEmpty
            onChange={(value) => setItemOptionalString("classKind", value)}
          />
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "stereotype")}
            value={stringValue(item.stereotype)}
            onChange={(value) => setItemOptionalString("stereotype", value)}
          />
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "说明")}
            value={stringValue(item.description)}
            onChange={(value) => setItemOptionalString("description", value)}
          />
        </div>
        <ClassAttributeEditor
          collection={collection}
          itemId={itemId}
          itemPrefix={itemPrefix}
          attributes={attributes}
          updateItem={updateItem}
        />
        <OperationEditors
          collection={collection}
          item={item}
          itemId={itemId}
          ownerLabel={itemPrefix}
          updateItem={updateItem}
        />
      </div>
    );
  }
  if (editorDraft.diagramKind === "class" && collection.key === "interfaces") {
    return (
      <div className="space-y-3">
        <LabelTextInput
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
        <OperationEditors
          collection={collection}
          item={item}
          itemId={itemId}
          ownerLabel={itemPrefix}
          updateItem={updateItem}
        />
      </div>
    );
  }
  if (editorDraft.diagramKind === "class" && collection.key === "enums") {
    return (
      <LabelTextarea
        label={editorFieldLabel(itemPrefix, "literals")}
        value={stringListValue(item.literals).join("\n")}
        onChange={(value) => setItemField("literals", textToStringList(value))}
      />
    );
  }
  if (editorDraft.diagramKind === "activity" && collection.key === "nodes") {
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <LabelSelect
          label={editorFieldLabel(itemPrefix, "类型")}
          value={stringValue(item.type)}
          options={enumOptions([
            "start",
            "end",
            "activity",
            "decision",
            "merge",
            "fork",
            "join",
          ])}
          onChange={(value) =>
            updateItem(collection, itemId, (currentItem) =>
              activityNodeForType(currentItem, value),
            )
          }
        />
        {item.type === "decision" ? (
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "question")}
            value={stringValue(item.question)}
            onChange={(value) => setItemOptionalString("question", value)}
          />
        ) : null}
        {item.type === "activity" ? (
          <>
            <LabelSelect
              label={editorFieldLabel(itemPrefix, "lane")}
              value={stringValue(item.actorOrLane)}
              options={laneOptions}
              allowEmpty
              onChange={(value) =>
                setItemOptionalString("actorOrLane", value)
              }
            />
            <LabelTextarea
              label={editorFieldLabel(itemPrefix, "input")}
              value={stringListValue(item.input).join("\n")}
              onChange={(value) =>
                setItemField("input", textToStringList(value))
              }
            />
            <LabelTextarea
              label={editorFieldLabel(itemPrefix, "output")}
              value={stringListValue(item.output).join("\n")}
              onChange={(value) =>
                setItemField("output", textToStringList(value))
              }
            />
          </>
        ) : null}
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
      </div>
    );
  }
  if (
    editorDraft.diagramKind === "activity" &&
    collection.key === "swimlanes"
  ) {
    return (
      <LabelTextarea
        label={editorFieldLabel(itemPrefix, "说明")}
        value={stringValue(item.description)}
        onChange={(value) => setItemOptionalString("description", value)}
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
              options={enumOptions([
                "app",
                "server",
                "device",
                "container",
                "external",
              ])}
              onChange={(value) => setItemField("nodeType", value)}
            />
            <LabelTextInput
              label={editorFieldLabel(itemPrefix, "environment")}
              value={stringValue(item.environment)}
              onChange={(value) => setItemOptionalString("environment", value)}
            />
          </>
        ) : null}
        {collection.key === "databases" ? (
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "engine")}
            value={stringValue(item.engine)}
            onChange={(value) => setItemOptionalString("engine", value)}
          />
        ) : null}
        {collection.key === "components" ? (
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "componentType")}
            value={stringValue(item.componentType)}
            onChange={(value) => setItemOptionalString("componentType", value)}
          />
        ) : null}
        {collection.key === "artifacts" ? (
          <LabelTextInput
            label={editorFieldLabel(itemPrefix, "artifactType")}
            value={stringValue(item.artifactType)}
            onChange={(value) => setItemOptionalString("artifactType", value)}
          />
        ) : null}
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
      </div>
    );
  }
  if (
    editorDraft.diagramKind === "sequence" &&
    collection.key === "participants"
  ) {
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <LabelSelect
          label={editorFieldLabel(itemPrefix, "类型")}
          value={stringValue(item.participantType) || "entity"}
          options={enumOptions([
            "actor",
            "boundary",
            "control",
            "entity",
            "service",
            "database",
            "external",
          ])}
          onChange={(value) => setItemField("participantType", value)}
        />
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
      </div>
    );
  }
  if (
    editorDraft.diagramKind === "sequence" &&
    collection.key === "fragments"
  ) {
    const messageIds = stringListValue(item.messageIds);
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <LabelSelect
          label={editorFieldLabel(itemPrefix, "类型")}
          value={stringValue(item.type) || "opt"}
          options={enumOptions(["alt", "opt", "loop", "par"])}
          onChange={(value) => setItemField("type", value)}
        />
        <LabelTextInput
          label={editorFieldLabel(itemPrefix, "condition")}
          value={stringValue(item.condition)}
          onChange={(value) => setItemOptionalString("condition", value)}
        />
        <LabelTextarea
          label={editorFieldLabel(itemPrefix, "说明")}
          value={stringValue(item.description)}
          onChange={(value) => setItemOptionalString("description", value)}
        />
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>{editorFieldLabel(itemPrefix, "messages")}</div>
          {messageOptions.map((message) => (
            <LabelCheckbox
              key={`${itemPrefix}:message:${message.value}`}
              label={t("diagramEditor.includedMessage", { name: message.label || t("diagramEditor.unnamedMessage") })}
              checked={messageIds.includes(message.value)}
              onChange={(checked) =>
                setItemField(
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
    return (
      <TableColumnEditor
        collection={collection}
        item={item}
        itemId={itemId}
        itemPrefix={itemPrefix}
        columns={columns}
        tableOptions={tableOptions}
        columnsForTable={columnsForTable}
        updateItem={updateItem}
        setItemOptionalString={setItemOptionalString}
      />
    );
  }
  return null;
}

function ClassAttributeEditor({
  collection,
  itemId,
  itemPrefix,
  attributes,
  updateItem,
}: {
  collection: EditableCollection;
  itemId: string;
  itemPrefix: string;
  attributes: Array<Record<string, unknown>>;
  updateItem: UpdateElementItem;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">{t("diagramEditor.units.attribute")}</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() =>
            updateItem(collection, itemId, (currentItem) => ({
              ...currentItem,
              attributes: [
                ...(Array.isArray(currentItem.attributes)
                  ? currentItem.attributes
                  : []),
                {
                  name: "newAttribute",
                  type: "string",
                  visibility: "private",
                  required: true,
                },
              ],
            }))
          }
        >
          <Plus className="size-3" /> {t("diagramEditor.addAttribute")}
        </Button>
      </div>
      {attributes.map((attribute, index) => (
        <div
          key={`${itemPrefix}:attribute:${index}`}
          className="grid gap-2 md:grid-cols-4"
        >
          <LabelTextInput
            label={editorFieldLabel(ordinalLabel(index, "attribute"), "name")}
            value={stringValue(attribute.name)}
            onChange={(value) =>
              updateItem(collection, itemId, (currentItem) => ({
                ...currentItem,
                attributes: attributes.map((currentAttribute, currentIndex) =>
                  currentIndex === index
                    ? { ...currentAttribute, name: value }
                    : currentAttribute,
                ),
              }))
            }
          />
          <LabelTextInput
            label={editorFieldLabel(ordinalLabel(index, "attribute"), "type")}
            value={stringValue(attribute.type)}
            onChange={(value) =>
              updateItem(collection, itemId, (currentItem) => ({
                ...currentItem,
                attributes: attributes.map((currentAttribute, currentIndex) =>
                  currentIndex === index
                    ? { ...currentAttribute, type: value }
                    : currentAttribute,
                ),
              }))
            }
          />
          <LabelSelect
            label={editorFieldLabel(ordinalLabel(index, "attribute"), "visibility")}
            value={stringValue(attribute.visibility) || "private"}
            options={enumOptions(["public", "protected", "private", "package"])}
            onChange={(value) =>
              updateItem(collection, itemId, (currentItem) => ({
                ...currentItem,
                attributes: attributes.map((currentAttribute, currentIndex) =>
                  currentIndex === index
                    ? { ...currentAttribute, visibility: value }
                    : currentAttribute,
                ),
              }))
            }
          />
          <LabelTextInput
            label={editorFieldLabel(ordinalLabel(index, "attribute"), "multiplicity")}
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
  );
}

function TableColumnEditor({
  collection,
  itemId,
  itemPrefix,
  item,
  columns,
  tableOptions,
  columnsForTable,
  updateItem,
  setItemOptionalString,
}: {
  collection: EditableCollection;
  itemId: string;
  itemPrefix: string;
  item: Record<string, unknown>;
  columns: Array<Record<string, unknown>>;
  tableOptions: SelectOption[];
  columnsForTable: (tableId: string) => SelectOption[];
  updateItem: UpdateElementItem;
  setItemOptionalString: (key: string, value: string) => void;
}) {
  const { t } = useTranslation();
  const updateColumn = (
    columnId: string,
    updater: (column: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    updateItem(collection, itemId, (currentItem) => ({
      ...currentItem,
      columns: (Array.isArray(currentItem.columns)
        ? (currentItem.columns as Array<Record<string, unknown>>)
        : []
      ).map((column) =>
        stringValue(column.id) === columnId ? updater(column) : column,
      ),
    }));
  };
  return (
    <div className="space-y-3">
      <LabelTextarea
        label={editorFieldLabel(itemPrefix, "说明")}
        value={stringValue(item.description)}
        onChange={(value) => setItemOptionalString("description", value)}
      />
      <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-foreground">{t("diagramEditor.units.column")}</div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            aria-label={t("diagramEditor.addColumn")}
            onClick={() =>
              updateItem(collection, itemId, (currentItem) => ({
                ...currentItem,
                columns: [
                  ...(Array.isArray(currentItem.columns)
                    ? currentItem.columns
                    : []),
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
            <Plus className="size-3" /> {t("diagramEditor.addColumn")}
          </Button>
        </div>
        {columns.map((column, index) => {
          const columnId = stringValue(column.id);
          const columnPrefix = ordinalLabel(index, "column");
          const reference =
            column.references && typeof column.references === "object"
              ? (column.references as Record<string, unknown>)
              : {};
          return (
            <div
              key={`${itemPrefix}:column:${columnId}`}
              className="space-y-2 rounded-md border border-border bg-card p-3"
            >
              <div className="grid gap-2 md:grid-cols-3">
                <LabelTextInput
                  label={editorFieldLabel(columnPrefix, "name")}
                  value={stringValue(column.name)}
                  onChange={(value) =>
                    updateColumn(columnId, (current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                />
                <LabelTextInput
                  label={editorFieldLabel(columnPrefix, "type")}
                  value={stringValue(column.dataType)}
                  onChange={(value) =>
                    updateColumn(columnId, (current) => ({
                      ...current,
                      dataType: value,
                    }))
                  }
                />
                <LabelTextInput
                  label={editorFieldLabel(columnPrefix, "description")}
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
                  label={editorFieldLabel(columnPrefix, "primaryKey")}
                  checked={booleanValue(column.isPrimaryKey)}
                  onChange={(checked) =>
                    updateColumn(columnId, (current) => ({
                      ...current,
                      isPrimaryKey: checked,
                    }))
                  }
                />
                <LabelCheckbox
                  label={editorFieldLabel(columnPrefix, "foreignKey")}
                  checked={booleanValue(column.isForeignKey)}
                  onChange={(checked) =>
                    updateColumn(columnId, (current) => ({
                      ...current,
                      isForeignKey: checked,
                    }))
                  }
                />
                <LabelCheckbox
                  label={editorFieldLabel(columnPrefix, "nullable")}
                  checked={booleanValue(column.nullable, true)}
                  onChange={(checked) =>
                    updateColumn(columnId, (current) => ({
                      ...current,
                      nullable: checked,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <LabelSelect
                  label={editorFieldLabel(columnPrefix, "referenceTable")}
                  value={stringValue(reference.tableId)}
                  options={tableOptions}
                  allowEmpty
                  onChange={(value) =>
                    updateColumn(columnId, (current) => {
                      const next = { ...current };
                      if (!value) {
                        delete next.references;
                      } else {
                        next.references = {
                          tableId: value,
                          columnId: stringValue(reference.columnId),
                        };
                      }
                      return next;
                    })
                  }
                />
                <LabelSelect
                  label={editorFieldLabel(columnPrefix, "referenceColumn")}
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
