// Renders the model editor confirmation dialogs while the panel owns edit state and field content.
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";

type ElementEditorDialogState = {
  collection: { label: string };
  mode: "create" | "edit";
} | null;

type RelationEditorDialogState = {
  mode: "create" | "edit";
} | null;

type DeleteTargetDialogState =
  | { kind: "element"; collection: { label: string }; label: string }
  | { kind: "relation"; label: string }
  | null;

export function ModelEditDialogs({
  elementEditor,
  relationEditor,
  deleteTarget,
  hasEditingElement,
  hasEditingRelation,
  saving,
  onCloseElement,
  onCloseRelation,
  onCloseDelete,
  onCommitElement,
  onCommitRelation,
  onConfirmDelete,
  renderElementFields,
  renderRelationFields,
}: {
  elementEditor: ElementEditorDialogState;
  relationEditor: RelationEditorDialogState;
  deleteTarget: DeleteTargetDialogState;
  hasEditingElement: boolean;
  hasEditingRelation: boolean;
  saving: boolean;
  onCloseElement: () => void;
  onCloseRelation: () => void;
  onCloseDelete: () => void;
  onCommitElement: () => void;
  onCommitRelation: () => void;
  onConfirmDelete: () => void;
  renderElementFields: () => ReactNode;
  renderRelationFields: () => ReactNode;
}) {
  return (
    <>
      <Dialog open={Boolean(elementEditor)} onOpenChange={(open) => !open && onCloseElement()}>
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
          {hasEditingElement ? (
            renderElementFields()
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              未找到可编辑元素。
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCloseElement}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={onCommitElement}
              disabled={!hasEditingElement || saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {elementEditor?.mode === "create" ? "确认添加" : "确认编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(relationEditor)} onOpenChange={(open) => !open && onCloseRelation()}>
        <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {relationEditor?.mode === "create" ? "添加关系" : "编辑关系"}
            </DialogTitle>
            <DialogDescription>
              调整端点、类型和关系字段后，确认会保存草稿并自动更新当前图。
            </DialogDescription>
          </DialogHeader>
          {hasEditingRelation ? (
            renderRelationFields()
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              未找到可编辑关系。
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCloseRelation}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={onCommitRelation}
              disabled={!hasEditingRelation || saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {relationEditor?.mode === "create" ? "确认添加" : "确认编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && onCloseDelete()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.kind === "element"
                ? `删除${deleteTarget.collection.label}`
                : "删除关系"}
            </DialogTitle>
            <DialogDescription>
              将删除{deleteTarget?.label ?? "当前项"}，并清理相关引用或关系。确认删除后会自动保存并更新当前图。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCloseDelete}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmDelete}
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
