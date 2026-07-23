// Renders the model editor element and relationship list sections from prepared view data.
import { ArrowRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { cn } from "../../../shared/ui/utils";
import {
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import {
  itemLabel,
  type EditableCollection,
} from "../lib/model-editing";
import { getRelationAccentClass } from "../lib/diagram-detail-view-model";
import { diagramDetailFieldLabel } from "../lib/diagram-presentation";
import { editorOwnerLabel, namedActionLabel } from "./model-edit-fields";

type EditableItemReference = {
  collection: EditableCollection;
  item: Record<string, unknown>;
};

export type ModelRelationshipListItem = {
  id: string;
  displayLabel: string;
  sourceLabel: string;
  targetLabel: string;
  typeKey: string;
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
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-semibold text-foreground">{t("diagramLists.elements.title")}</h3>
        <div
          className="mt-3 flex items-center justify-between gap-3 overflow-x-auto pb-1"
          aria-label={t("diagramLists.elements.toolbar")}
        >
          <div className="flex min-w-max items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label={t("diagramLists.elements.search")}
                value={elementSearch}
                onChange={(event) => onElementSearchChange(event.target.value)}
                className="h-9 w-64 rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={t("diagramLists.elements.searchPlaceholder")}
              />
            </label>
            {detailGroups.length > 0 ? (
              <div
                className="flex items-center gap-2"
                aria-label={t("diagramLists.elements.filter")}
                role="group"
              >
                <Button
                  type="button"
                  variant={elementKindFilter === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => onElementKindFilterChange("all")}
                >
                  {t("diagramLists.elements.allTypes")}
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
                    {t(`diagrams.semantic.${group.kind}.label`)}
                    <span className="ml-1 font-mono text-[10px] opacity-75">
                      {group.items.length}
                    </span>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="ml-auto flex min-w-max items-center gap-2">
            {collections.filter((collection) => collection.allowCreate !== false).map((collection) => (
              <Button
                key={`add:${collection.key}`}
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={saving}
                onClick={() => onCreateElement(collection)}
              >
                <Plus className="size-3.5" /> {t("diagramLists.elements.add", { kind: editorOwnerLabel(collection.label) })}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div>
        {detailGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.elements.empty")}
          </div>
        ) : filteredElements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.elements.noMatches")}
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
                .map((field) => `${diagramDetailFieldLabel(field.label, t)}${t("traceability.refSeparator")}${field.value}`)
                .join(" / ");
              return (
                <article
                  key={`${element.kind}:${element.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("diagramLists.elements.locate", { name: element.label })}
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
                      {t(`diagrams.semantic.${element.kind}.label`)}
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
                              t("diagramLists.actions.edit"),
                              editorOwnerLabel(editable.collection.label),
                              itemLabel(editable.item, editable.collection),
                            )}
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditElement(element.id, editable);
                            }}
                          >
                            <span className="sr-only">{t("diagramLists.actions.edit")}</span>
                            <Pencil className="size-3.5" />
                          </Button>
                          {editable.collection.allowDelete !== false ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive"
                              aria-label={namedActionLabel(
                                t("diagramLists.actions.delete"),
                                editorOwnerLabel(editable.collection.label),
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
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 line-clamp-1 min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
                    {element.label}
                  </div>
                  <div className="mt-1.5 line-clamp-2 min-h-10 text-[11px] leading-5 text-muted-foreground">
                    {element.description || t("diagramLists.elements.noDescription")}
                  </div>
                  <div className="mt-2 border-t border-border pt-2">
                    <div className="line-clamp-1 break-words text-[11px] text-muted-foreground">
                      {fieldSummary || t("diagramLists.elements.noFields")}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t("diagramLists.elements.fieldCount", { count: element.fields.length })}
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
  relationFilterOptions: Array<{ value: string; label: string; count: number }>;
  endpointOptionsCount: number;
  relationshipOrderIds: string[];
  saving: boolean;
  onCreateRelation: () => void;
  onEditRelation: (relationId: string) => void;
  onDeleteRelation: (relationId: string, displayLabel: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-semibold text-foreground">{t("diagramLists.relations.title")}</h3>
        <div
          className="mt-3 flex items-center justify-between gap-3 overflow-x-auto pb-1"
          aria-label={t("diagramLists.relations.toolbar")}
        >
          <div className="flex min-w-max items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label={t("diagramLists.relations.search")}
                value={relationSearch}
                onChange={(event) => onRelationSearchChange(event.target.value)}
                className="h-9 w-64 rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={t("diagramLists.relations.searchPlaceholder")}
              />
            </label>
            {relationshipsCount > 0 ? (
              <div
                className="flex items-center gap-2"
                aria-label={t("diagramLists.relations.filter")}
                role="group"
              >
                <Button
                  type="button"
                  variant={relationKindFilter === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => onRelationKindFilterChange("all")}
                >
                  {t("diagramLists.relations.allTypes")}
                  <span className="ml-1 font-mono text-[10px] opacity-75">
                    {relationshipsCount}
                  </span>
                </Button>
                {relationFilterOptions.map((option) => (
                  <Button
                    key={`relation-filter:${option.value}`}
                    type="button"
                    variant={relationKindFilter === option.value ? "default" : "outline"}
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => onRelationKindFilterChange(option.value)}
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
            <Plus className="size-3.5" /> {t("diagramLists.relations.add")}
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {relationshipsCount === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.relations.empty")}
          </div>
        ) : filteredRelationships.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.relations.noMatches")}
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
                      {sourceLabel || t("diagramLists.relations.noSource")}
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
                      {targetLabel || t("diagramLists.relations.noTarget")}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={namedActionLabel(t("diagramLists.actions.edit"), t("diagramLists.relations.kind"), displayLabel)}
                    disabled={saving}
                    onClick={() => onEditRelation(id)}
                  >
                    <span className="sr-only">{t("diagramLists.actions.edit")}</span>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive"
                    aria-label={namedActionLabel(t("diagramLists.actions.delete"), t("diagramLists.relations.kind"), displayLabel)}
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
