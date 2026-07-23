// Renders relation-specific edit fields for the model editor dialog.
import { useTranslation } from "react-i18next";
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
  SourceRuleChecklist,
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
  sourceRuleOptions = [],
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
  sourceRuleOptions?: Array<{ id: string; label: string }>;
}) {
  const { t } = useTranslation();
  const sourceKey = relationEndpointKey(editorDraft, "source");
  const targetKey = relationEndpointKey(editorDraft, "target");
  return (
    <div className="space-y-3">
      {editorDraft.diagramKind !== "activity" ? (
        <LabelTextInput
          label={t("diagramEditor.relation.name")}
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
          label={t("diagramEditor.relation.source")}
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
        {editorDraft.diagramKind === "context" ? (
          <LabelSelect
            label={t("diagramEditor.relation.direction")}
            value={stringValue(relation.direction) || "directed"}
            options={[
              { value: "directed", label: t("diagramEditor.relation.directed") },
              { value: "bidirectional", label: t("diagramEditor.relation.bidirectional") },
            ]}
            onChange={(value) =>
              updateRelation(relationId, (currentRelation) => ({
                ...currentRelation,
                direction: value,
              }))
            }
          />
        ) : (
          <LabelSelect
            label={t("diagramEditor.relation.type")}
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
        )}
        <LabelSelect
          label={t("diagramEditor.relation.target")}
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
      {editorDraft.diagramKind === "context" ? (
        <div className="grid gap-3">
          <LabelTextarea
            label={t("diagramEditor.fields.description")}
            value={stringValue(relation.description)}
            onChange={(value) =>
              updateRelation(relationId, (currentRelation) => {
                const nextRelation = { ...currentRelation };
                setOptionalStringValue(nextRelation, "description", value);
                return nextRelation;
              })
            }
          />
          <SourceRuleChecklist
            selectedIds={stringListValue(relation.sourceRequirementIds)}
            options={sourceRuleOptions}
            onChange={(ids) =>
              updateRelation(relationId, (currentRelation) => ({
                ...currentRelation,
                sourceRequirementIds: ids,
              }))
            }
          />
        </div>
      ) : null}
      {editorDraft.diagramKind === "usecase" ? (
        <div className="grid gap-2 md:grid-cols-2">
          <LabelTextInput
            label={t("diagramEditor.fields.condition")}
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
            label={t("diagramEditor.fields.description")}
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
            ["sourceRole", t("diagramEditor.relation.sourceRole")],
            ["targetRole", t("diagramEditor.relation.targetRole")],
            ["sourceMultiplicity", t("diagramEditor.relation.sourceMultiplicity")],
            ["targetMultiplicity", t("diagramEditor.relation.targetMultiplicity")],
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
            label={t("diagramEditor.relation.navigability")}
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
            label={t("diagramEditor.fields.description")}
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
            ["condition", t("diagramEditor.fields.condition")],
            ["guard", t("diagramEditor.relation.guard")],
            ["trigger", t("diagramEditor.relation.trigger")],
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
            label={t("diagramEditor.fields.description")}
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
            label={t("diagramEditor.relation.protocol")}
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
            label={t("diagramEditor.relation.port")}
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
            label={t("diagramEditor.relation.direction")}
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
            label={t("diagramEditor.fields.description")}
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
            label={t("diagramEditor.relation.parameters")}
            value={stringListValue(relation.parameters).join("\n")}
            onChange={(value) =>
              updateRelation(relationId, (currentRelation) => ({
                ...currentRelation,
                parameters: textToStringList(value),
              }))
            }
          />
          <LabelTextInput
            label={t("diagramEditor.relation.returnValue")}
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
            label={t("diagramEditor.fields.condition")}
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
            label={t("diagramEditor.fields.description")}
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
            label={t("diagramEditor.relation.sourceColumn")}
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
            label={t("diagramEditor.relation.targetColumn")}
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
            label={t("diagramEditor.fields.description")}
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
