// Renders relation-specific edit fields for the model editor dialog.
import {
  relationEndpointKey,
  relationName,
  relationTypeOptions,
  setOptionalStringValue,
  setRelationName,
  stringListValue,
  stringValue,
  textToStringList,
} from "../lib/model-editing";
import {
  LabelSelect,
  LabelTextInput,
  LabelTextarea,
  enumOptions,
} from "./model-edit-fields";

type SelectOption = {
  value: string;
  label: string;
};

export function ModelRelationEditor({
  editorDraft,
  relation,
  relationId,
  endpointOptions,
  columnsForTable,
  updateRelation,
}: {
  editorDraft: Record<string, unknown>;
  relation: Record<string, unknown>;
  relationId: string;
  endpointOptions: Array<{ id: string; label: string }>;
  columnsForTable: (tableId: string) => SelectOption[];
  updateRelation: (
    relationId: string,
    updater: (relation: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
}) {
  const sourceKey = relationEndpointKey(editorDraft, "source");
  const targetKey = relationEndpointKey(editorDraft, "target");
  return (
    <div className="space-y-3">
      {editorDraft.diagramKind !== "activity" ? (
        <LabelTextInput
          label="关系名称"
          value={relationName(relation)}
          onChange={(value) =>
            updateRelation(relationId, (currentRelation) => {
              const nextRelation = { ...currentRelation };
              setRelationName(nextRelation, value);
              return nextRelation;
            })
          }
        />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <LabelSelect
          label="起点"
          value={String(relation[sourceKey] ?? "")}
          options={endpointOptions.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
          onChange={(value) =>
            updateRelation(relationId, (currentRelation) => ({
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
            updateRelation(relationId, (currentRelation) => ({
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
            updateRelation(relationId, (currentRelation) => ({
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              key={`${relationId}:${key}`}
              label={label}
              value={stringValue(relation[key])}
              onChange={(value) =>
                updateRelation(relationId, (currentRelation) => {
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
            options={enumOptions([
              "none",
              "source-to-target",
              "target-to-source",
              "bidirectional",
            ])}
            allowEmpty
            onChange={(value) =>
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              key={`${relationId}:${key}`}
              label={label}
              value={stringValue(relation[key])}
              onChange={(value) =>
                updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => ({
                ...currentRelation,
                parameters: textToStringList(value),
              }))
            }
          />
          <LabelTextInput
            label="返回值"
            value={stringValue(relation.returnValue)}
            onChange={(value) =>
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
              updateRelation(relationId, (currentRelation) => {
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
}
