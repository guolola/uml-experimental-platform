// Renders the model editor element and relationship list sections from prepared view data.
import { ArrowRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { cn } from "../../../shared/ui/utils";
import {
  SEMANTIC_KIND_META,
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import {
  itemLabel,
  type EditableCollection,
} from "../lib/model-editing";
import { getRelationAccentClass } from "../lib/diagram-detail-view-model";
import { namedActionLabel } from "./model-edit-fields";

type EditableItemReference = {
  collection: EditableCollection;
  item: Record<string, unknown>;
};

export type ModelRelationshipListItem = {
  id: string;
  displayLabel: string;
  sourceLabel: string;
  targetLabel: string;
  typeLabel: string;
  searchText: string;
};

export function ModelElementListSection({
  elementSearch,
  onElementSearchChange,
  elementKindFilter,
  onElementKindFilterChange,
  detailGroups,
  detailItemCount,
  collections,
  filteredElements,
  editableItemsById,
  selectedElement,
  saving,
  onCreateElement,
  onEditElement,
  onDeleteElement,
  onSelectElement,
}: {
  elementSearch: string;
  onElementSearchChange: (value: string) => void;
  elementKindFilter: "all" | SemanticElementKind;
  onElementKindFilterChange: (value: "all" | SemanticElementKind) => void;
  detailGroups: Array<{ kind: SemanticElementKind; items: DiagramDetailItem[] }>;
  detailItemCount: number;
  collections: EditableCollection[];
  filteredElements: DiagramDetailItem[];
  editableItemsById: Map<string, EditableItemReference>;
  selectedElement?: { kind: string; id: string } | null;
  saving: boolean;
  onCreateElement: (collection: EditableCollection) => void;
  onEditElement: (elementId: string, editable: EditableItemReference) => void;
  onDeleteElement: (elementId: string, editable: EditableItemReference) => void;
  onSelectElement: (element: DiagramDetailItem) => void;
}) {
  return (
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
                onChange={(event) => onElementSearchChange(event.target.value)}
                className="h-9 w-64 rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="搜索元素、属性或说明"
              />
            </label>
            {detailGroups.length > 0 ? (
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
                  onClick={() => onElementKindFilterChange("all")}
                >
                  全部类型
                  <span className="ml-1 font-mono text-[10px] opacity-75">
                    {detailItemCount}
                  </span>
                </Button>
                {detailGroups.map((group) => (
                  <Button
                    key={group.kind}
                    type="button"
                    variant={elementKindFilter === group.kind ? "default" : "outline"}
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => onElementKindFilterChange(group.kind)}
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
                onClick={() => onCreateElement(collection)}
              >
                <Plus className="size-3.5" /> 添加{collection.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div>
        {detailGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            未识别到元素。
          </div>
        ) : filteredElements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            没有匹配的元素，请调整搜索或类型筛选。
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {filteredElements.map((element) => {
              const editable = editableItemsById.get(element.id);
              const active =
                selectedElement?.kind === element.kind &&
                selectedElement.id === element.id;
              const fieldSummary = element.fields
                .slice(0, 3)
                .map((field) => `${field.label}：${field.value}`)
                .join(" / ");
              return (
                <article
                  key={`${element.kind}:${element.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`定位元素：${element.label}`}
                  aria-pressed={active}
                  onClick={() => onSelectElement(element)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectElement(element);
                  }}
                  className={cn(
                    "min-h-[8.75rem] cursor-pointer overflow-hidden rounded-lg border p-2.5 text-left text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Badge
                      variant="secondary"
                      className="shrink-0 bg-primary/10 text-xs text-primary"
                    >
                      {SEMANTIC_KIND_META[element.kind].label}
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
                              onEditElement(element.id, editable);
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
                              onDeleteElement(element.id, editable);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 line-clamp-1 min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
                    {element.label}
                  </div>
                  <div className="mt-1.5 line-clamp-2 min-h-10 text-[11px] leading-5 text-muted-foreground">
                    {element.description || "暂无说明。"}
                  </div>
                  <div className="mt-2 border-t border-border pt-2">
                    <div className="line-clamp-1 break-words text-[11px] text-muted-foreground">
                      {fieldSummary || "暂无字段"}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {element.fields.length} 个字段
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function ModelRelationshipListSection({
  relationSearch,
  onRelationSearchChange,
  relationKindFilter,
  onRelationKindFilterChange,
  relationshipsCount,
  filteredRelationships,
  relationFilterOptions,
  endpointOptionsCount,
  relationshipOrderIds,
  saving,
  onCreateRelation,
  onEditRelation,
  onDeleteRelation,
}: {
  relationSearch: string;
  onRelationSearchChange: (value: string) => void;
  relationKindFilter: string;
  onRelationKindFilterChange: (value: string) => void;
  relationshipsCount: number;
  filteredRelationships: ModelRelationshipListItem[];
  relationFilterOptions: Array<{ label: string; count: number }>;
  endpointOptionsCount: number;
  relationshipOrderIds: string[];
  saving: boolean;
  onCreateRelation: () => void;
  onEditRelation: (relationId: string) => void;
  onDeleteRelation: (relationId: string, displayLabel: string) => void;
}) {
  return (
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
                onChange={(event) => onRelationSearchChange(event.target.value)}
                className="h-9 w-64 rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="搜索关系、端点或说明"
              />
            </label>
            {relationshipsCount > 0 ? (
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
                  onClick={() => onRelationKindFilterChange("all")}
                >
                  全部关系
                  <span className="ml-1 font-mono text-[10px] opacity-75">
                    {relationshipsCount}
                  </span>
                </Button>
                {relationFilterOptions.map((option) => (
                  <Button
                    key={`relation-filter:${option.label}`}
                    type="button"
                    variant={relationKindFilter === option.label ? "default" : "outline"}
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => onRelationKindFilterChange(option.label)}
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
            disabled={endpointOptionsCount === 0 || saving}
            onClick={onCreateRelation}
          >
            <Plus className="size-3.5" /> 添加关系
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {relationshipsCount === 0 ? (
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
                  getRelationAccentClass(
                    Math.max(0, relationshipOrderIds.indexOf(id)),
                  ),
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
                      <span className="block truncate text-foreground">
                        {displayLabel}
                      </span>
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
                    onClick={() => onEditRelation(id)}
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
                    onClick={() => onDeleteRelation(id, displayLabel)}
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
  );
}
