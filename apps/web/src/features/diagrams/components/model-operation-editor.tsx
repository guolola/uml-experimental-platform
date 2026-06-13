// Renders class/interface operation and parameter edit fields for the model element editor.
import { Plus } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  booleanValue,
  setOptionalStringValue,
  stringValue,
  type EditableCollection,
} from "../lib/model-editing";
import {
  LabelCheckbox,
  LabelSelect,
  LabelTextInput,
  LabelTextarea,
  enumOptions,
  ordinalLabel,
} from "./model-edit-fields";

type UpdateElementItem = (
  collection: EditableCollection,
  itemId: string,
  updater: (item: Record<string, unknown>) => Record<string, unknown>,
) => void;

export function OperationEditors({
  collection,
  item,
  itemId,
  ownerLabel,
  updateItem,
}: {
  collection: EditableCollection;
  item: Record<string, unknown>;
  itemId: string;
  ownerLabel: string;
  updateItem: UpdateElementItem;
}) {
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
      ).map((operation, index) =>
        index === operationIndex ? updater(operation) : operation,
      );
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
                ...(Array.isArray(currentItem.operations)
                  ? currentItem.operations
                  : []),
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
          <div
            key={`${ownerLabel}:operation:${operationIndex}`}
            className="space-y-2 rounded-md border border-border bg-card p-3"
          >
            <div className="grid gap-2 md:grid-cols-3">
              <LabelTextInput
                label={`${operationLabel}名称`}
                value={stringValue(operation.name)}
                onChange={(value) =>
                  updateOperation(operationIndex, (current) => ({
                    ...current,
                    name: value,
                  }))
                }
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
                options={enumOptions([
                  "public",
                  "protected",
                  "private",
                  "package",
                ])}
                onChange={(value) =>
                  updateOperation(operationIndex, (current) => ({
                    ...current,
                    visibility: value,
                  }))
                }
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
            <OperationParameterEditors
              operationLabel={operationLabel}
              operationIndex={operationIndex}
              parameters={parameters}
              updateOperation={updateOperation}
            />
          </div>
        );
      })}
    </div>
  );
}

function OperationParameterEditors({
  operationLabel,
  operationIndex,
  parameters,
  updateOperation,
}: {
  operationLabel: string;
  operationIndex: number;
  parameters: Array<Record<string, unknown>>;
  updateOperation: (
    operationIndex: number,
    updater: (operation: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
}) {
  return (
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
        const parameterLabel = `${operationLabel}的${ordinalLabel(
          parameterIndex,
          "参数",
        )}`;
        return (
          <div
            key={`${operationLabel}:parameter:${parameterIndex}`}
            className="grid gap-2 md:grid-cols-4"
          >
            <LabelTextInput
              label={`${parameterLabel}名称`}
              value={stringValue(parameter.name)}
              onChange={(value) =>
                updateOperation(operationIndex, (current) => ({
                  ...current,
                  parameters: parameters.map((currentParameter, index) =>
                    index === parameterIndex
                      ? { ...currentParameter, name: value }
                      : currentParameter,
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
                    index === parameterIndex
                      ? { ...currentParameter, type: value }
                      : currentParameter,
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
                    index === parameterIndex
                      ? { ...currentParameter, required: checked }
                      : currentParameter,
                  ),
                }))
              }
            />
          </div>
        );
      })}
    </div>
  );
}
