// Renders element-level traceability from persisted generation mappings.
import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Network,
  Search,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Input } from "../../../shared/ui/input";
import { ScaledToolbar } from "../../../shared/ui/scale-to-fit";
import { SelectControl } from "../../../shared/ui/select";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  ALL_GROUPS,
  PAGE_SIZE_OPTIONS,
  type TraceabilityRowCopy,
  buildDesignRows,
  buildGroupOptions,
  buildRequirementRows,
  designGroupLabel,
  formatRuleId,
  includesQuery,
  requirementGroupLabel,
  type MatrixScope,
  type RowStatus,
} from "../lib/traceability-rows";
import type { DesignDiagramKind, DiagramKind } from "@uml-platform/contracts";
import {
  getDesignDiagramLabel,
  getDiagramLabel,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type { SemanticElementKind } from "../../../entities/diagram/lib/model-details";

type MatrixMode = "requirements" | "design";
type TraceabilityRef = {
  diagramKind?: DiagramKind | DesignDiagramKind;
  label?: string;
};
function ChipList({
  items,
  emptyText,
}: {
  items: string[];
  emptyText: string;
}) {
  const visible = items.slice(0, 3);
  const rest = items.length - visible.length;
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((item) => (
        <Badge
          key={item}
          title={item}
          variant="secondary"
          className="max-w-56 truncate text-[10px]"
        >
          {item}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="text-[10px]">
          +{rest}
        </Badge>
      )}
    </div>
  );
}

function createTraceabilityCopy(t: TFunction): TraceabilityRowCopy {
  return {
    semanticKindLabel: (kind: SemanticElementKind) =>
      t(`diagrams.semantic.${kind}.label`, { defaultValue: kind }),
    requirementGroupLabel: (diagramKind) =>
      getDiagramLabel(diagramKind as DiagramType, t),
    designGroupLabel: (diagramKind) =>
      getDesignDiagramLabel(diagramKind as DesignDiagramType, t),
    autoFilledPendingReviewNote: t("traceability.rows.autoFilledPendingReviewNote"),
    unnamedEventFlow: t("traceability.rows.unnamedEventFlow"),
    step: (order) => t(order ? "traceability.rows.stepWithOrder" : "traceability.rows.step", { order }),
    systemResponse: (response) => t("traceability.rows.systemResponse", { response }),
    eventFlow: (flowType, flowLabel) =>
      flowType
        ? t("traceability.rows.eventFlowWithType", { flowType, flowLabel })
        : t("traceability.rows.eventFlow", { flowLabel }),
    derivedFromSourceUseCaseFlow: t("traceability.rows.derivedFromSourceUseCaseFlow"),
    missingSourceUseCaseOrEventFlow: t("traceability.rows.missingSourceUseCaseOrEventFlow"),
    sourceUseCase: (label) => t("traceability.rows.sourceUseCase", { label }),
    sourceUseCaseMissing: t("traceability.rows.sourceUseCaseMissing"),
    pending: (note) => t("traceability.rows.pending", { note }),
    confidence: (confidence) => t("traceability.rows.confidence", { confidence }),
    endpointDerived: t("traceability.rows.endpointDerived"),
    mappingDescription: (note) => t("traceability.rows.mappingDescription", { note }),
    sourceUseCaseRealization: (modelLabel, elementLabel) =>
      t("traceability.rows.sourceUseCaseRealization", { modelLabel, elementLabel }),
    requirementElement: (groupLabel, elementLabel) =>
      t("traceability.rows.requirementElement", { groupLabel, elementLabel }),
  };
}

function designRefLabel(
  ref: TraceabilityRef,
  copy: TraceabilityRowCopy,
  t: TFunction,
  refSeparator: string,
) {
  return `${designGroupLabel(ref.diagramKind ?? "sequence", copy)}${refSeparator}${ref.label ?? t("traceability.unnamedElement")}`;
}

function requirementRefLabel(
  ref: TraceabilityRef,
  copy: TraceabilityRowCopy,
  t: TFunction,
  refSeparator: string,
) {
  return `${requirementGroupLabel(ref.diagramKind ?? "usecase", copy)}${refSeparator}${ref.label ?? t("traceability.unnamedElement")}`;
}

function StatusBadge({ status, t }: { status: RowStatus; t: TFunction }) {
  const Icon = status === "mapped" ? CheckCircle2 : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
        status === "mapped"
          ? "bg-primary/10 text-primary"
          : "bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3.5" />
      {status === "mapped" ? t("traceability.status.mapped") : t("traceability.status.unmapped")}
    </span>
  );
}

export function TraceabilityMatrixPage({
  mode,
  scope,
}: {
  mode: MatrixMode;
  scope?: MatrixScope;
}) {
  const { t } = useTranslation();
  const {
    rules,
    models,
    designModels,
    requirementModelTraceability,
    designModelTraceability,
    requirementTraceabilityStale,
    designTraceabilityStale,
  } = useWorkspaceSession();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(8);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const isDesign = mode === "design";
  const isAnalysisRequirementScope = !isDesign && scope?.diagramKind === "analysis";
  const refSeparator = t("traceability.refSeparator");
  const traceabilityCopy = useMemo(() => createTraceabilityCopy(t), [t]);
  const rows = useMemo(
    () =>
      isDesign
        ? buildDesignRows(
            rules,
            models,
            designModels,
            requirementModelTraceability,
            designModelTraceability,
            scope,
            traceabilityCopy,
          )
        : buildRequirementRows(rules, models, requirementModelTraceability, scope, traceabilityCopy),
    [
      designModelTraceability,
      designModels,
      isDesign,
      models,
      requirementModelTraceability,
      rules,
      scope,
      traceabilityCopy,
    ],
  );
  const groupOptions = useMemo(() => buildGroupOptions(rows), [rows]);
  const filteredRows = rows.filter(
    (row) =>
      (groupFilter === ALL_GROUPS || row.groupKey === groupFilter) &&
      includesQuery(row, query),
  );
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const pageStart = (effectivePage - 1) * pageSize;
  const paginatedRows = filteredRows.slice(pageStart, pageStart + pageSize);
  const selectedRow =
    filteredRows.find((row) => row.id === selectedRowId) ?? paginatedRows[0] ?? null;
  const mappedCount = filteredRows.filter((row) => row.status === "mapped").length;
  const coverage =
    filteredRows.length > 0 ? Math.round((mappedCount / filteredRows.length) * 100) : 0;
  const hasTraceability = isDesign
    ? designModelTraceability.length > 0
    : isAnalysisRequirementScope
      ? rows.length > 0
      : requirementModelTraceability.length > 0;
  const isTraceabilityStale = isDesign
    ? designTraceabilityStale
    : isAnalysisRequirementScope
      ? false
      : requirementTraceabilityStale;
  const hasIncompleteCoverage =
    hasTraceability && filteredRows.length > 0 && mappedCount < filteredRows.length;
  const missingTraceabilityTitle = isDesign
    ? t("traceability.missing.designTitle")
    : t("traceability.missing.requirementTitle");
  const missingTraceabilityMessage = isDesign
    ? t("traceability.missing.designMessage")
    : t("traceability.missing.requirementMessage");

  useEffect(() => {
    setCurrentPage(1);
  }, [query, groupFilter, pageSize]);

  useEffect(() => {
    if (
      groupFilter !== ALL_GROUPS &&
      !groupOptions.some((option) => option.value === groupFilter)
    ) {
      setGroupFilter(ALL_GROUPS);
    }
  }, [groupFilter, groupOptions]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const scopeLabel =
    scope?.label ??
    (isDesign
      ? designGroupLabel(scope?.diagramKind ?? "sequence", traceabilityCopy)
      : requirementGroupLabel(scope?.diagramKind ?? "usecase", traceabilityCopy));
  const title = scope
    ? t("traceability.title.scoped", { label: scopeLabel })
    : isDesign
      ? t("traceability.title.design")
      : t("traceability.title.requirements");
  const description = scope
    ? isDesign
      ? t("traceability.description.scopedDesign", { label: scopeLabel })
      : isAnalysisRequirementScope
        ? t("traceability.description.scopedAnalysis", { label: scopeLabel })
        : t("traceability.description.scopedRequirement", { label: scopeLabel })
    : isDesign
      ? t("traceability.description.design")
      : t("traceability.description.requirements");
  const groupFilterLabel = isDesign ? t("traceability.filters.designModelType") : t("traceability.filters.requirementModelType");
  const sourceColumnLabel = isAnalysisRequirementScope ? t("traceability.columns.sourceUseCaseFlow") : t("traceability.columns.sourceRequirementRule");
  const pageRangeStart = filteredRows.length === 0 ? 0 : pageStart + 1;
  const pageRangeEnd = Math.min(pageStart + pageSize, filteredRows.length);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <div className="w-full p-4 lg:p-5">
        <div className="mx-auto flex w-full max-w-none flex-col gap-5">
          <header>
            <ScaledToolbar minWidth={720} contentClassName="w-full items-end justify-between gap-6">
              <div className="min-w-0">
                <div className="flex flex-nowrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-normal text-foreground lg:text-3xl">
                    {title}
                  </h2>
                  <Badge variant="secondary" className="rounded-full font-mono">
                    {t("traceability.count.items", { count: rows.length })}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
              <div className="relative w-72 shrink-0">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("traceability.searchPlaceholder")}
                  className="h-9 rounded-full bg-card pl-9"
                />
              </div>
            </ScaledToolbar>
          </header>

          {!hasTraceability && rows.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="font-semibold">{missingTraceabilityTitle}</div>
              <p className="mt-1 leading-6">{missingTraceabilityMessage}</p>
            </div>
          )}

          {hasTraceability && (isTraceabilityStale || hasIncompleteCoverage) && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="font-semibold">
                {isTraceabilityStale ? t("traceability.stale.title") : t("traceability.incomplete.title")}
              </div>
              <p className="mt-1 leading-6">
                {isDesign
                  ? t("traceability.stale.designMessage")
                  : t("traceability.stale.requirementMessage")}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <ScaledToolbar minWidth={560} contentClassName="w-full justify-between gap-4">
                  <div className="flex shrink-0 items-center gap-2">
                    {isDesign ? (
                      <GitBranch className="size-4 text-primary" />
                    ) : (
                      <Network className="size-4 text-primary" />
                    )}
                    <h3 className="text-sm font-semibold text-foreground">
                      {isDesign ? t("traceability.mapping.design") : t("traceability.mapping.requirements")}
                    </h3>
                    <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                      {filteredRows.length}/{rows.length}
                    </Badge>
                  </div>
                  {!scope && (
                    <label className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {t("traceability.filters.category")}
                      <SelectControl
                        aria-label={groupFilterLabel}
                        value={groupFilter}
                        onValueChange={setGroupFilter}
                        className="h-8 min-w-32 text-sm"
                        size="sm"
                        options={[
                          { value: ALL_GROUPS, label: t("traceability.filters.allModels") },
                          ...groupOptions.map((option) => ({
                            value: option.value,
                            label: option.label,
                          })),
                        ]}
                      />
                    </label>
                  )}
                </ScaledToolbar>
              </div>

              {rows.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center px-6 text-center">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {t("traceability.empty.title")}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {isDesign ? t("traceability.empty.designMessage") : t("traceability.empty.requirementMessage")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead className="bg-muted/20 text-xs text-muted-foreground">
                      <tr>
                        <th className="w-[34%] border-b border-r border-border px-4 py-4 text-left font-medium">
                          {isDesign ? t("traceability.columns.designElement") : t("traceability.columns.requirementElement")}
                        </th>
                        <th className="w-[14%] border-b border-r border-border px-4 py-4 text-left font-medium">
                          {t("traceability.columns.type")}
                        </th>
                        {isDesign && (
                          <th className="w-[22%] border-b border-r border-border px-4 py-4 text-left font-medium">
                            {t("traceability.columns.sourceDesignElement")}
                          </th>
                        )}
                        <th className="w-[20%] border-b border-r border-border px-4 py-4 text-left font-medium">
                          {isDesign ? t("traceability.columns.sourceRequirementDiagram") : sourceColumnLabel}
                        </th>
                        <th className="w-[10%] border-b border-border px-4 py-4 text-center font-medium">
                          {t("traceability.columns.mappingStatus")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={isDesign ? 5 : 4}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            {t("traceability.empty.noMatches")}
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            className={cn(
                              "cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/20",
                              selectedRow?.id === row.id && "bg-primary/5",
                            )}
                            onClick={() => setSelectedRowId(row.id)}
                          >
                            <td className="border-r border-border px-4 py-3 align-middle">
                              <div className="flex min-w-0 flex-col gap-1">
                                <span className="truncate font-semibold text-foreground">
                                  {row.label}
                                </span>
                                <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {row.subtitle}
                                </span>
                              </div>
                            </td>
                            <td className="border-r border-border px-4 py-3 align-middle">
                              <div className="flex flex-col gap-1">
                                <Badge variant="secondary" className="w-fit text-[10px]">
                                  {row.groupLabel}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {row.typeLabel}
                                </span>
                              </div>
                            </td>
                            {isDesign && (
                              <td className="border-r border-border px-4 py-3 align-middle">
                                <div className="flex flex-col gap-2">
                                  <ChipList
                                    items={row.upstreamDesignElements.map((ref) => designRefLabel(ref, traceabilityCopy, t, refSeparator))}
                                    emptyText={t("traceability.empty.noSourceDesignElement")}
                                  />
                                </div>
                              </td>
                            )}
                            <td className="border-r border-border px-4 py-3 align-middle">
                              <ChipList
                                items={
                                  isDesign
                                    ? row.requirementElements.map((ref) => requirementRefLabel(ref, traceabilityCopy, t, refSeparator))
                                    : isAnalysisRequirementScope
                                    ? row.requirementElements.map((ref) => requirementRefLabel(ref, traceabilityCopy, t, refSeparator))
                                    : row.requirementRules.map((rule) => formatRuleId(rule.id))
                                }
                                emptyText={
                                  isDesign
                                    ? t("traceability.empty.noRequirementDiagramElement")
                                    : isAnalysisRequirementScope
                                      ? t("traceability.empty.noSourceUseCase")
                                      : t("traceability.empty.noRequirementRule")
                                }
                              />
                            </td>
                            <td className="px-4 py-3 text-center align-middle">
                              <StatusBadge status={row.status} t={t} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <ScaledToolbar
                    minWidth={560}
                    className="border-t border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
                    contentClassName="w-full justify-between gap-3"
                  >
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-xs">
                        {pageRangeStart}-{pageRangeEnd} / {filteredRows.length}
                      </span>
                      <label className="inline-flex items-center gap-2">
                        {t("traceability.pagination.perPage")}
                        <SelectControl
                          aria-label={t("traceability.pagination.pageSizeAria")}
                          value={String(pageSize)}
                          onValueChange={(value) =>
                            setPageSize(Number(value) as typeof pageSize)
                          }
                          className="h-8 w-20 text-sm"
                          size="sm"
                          options={PAGE_SIZE_OPTIONS.map((option) => ({
                            value: String(option),
                            label: option,
                          }))}
                        />
                        {t("traceability.pagination.itemsSuffix")}
                      </label>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        aria-label={t("traceability.pagination.previous")}
                        disabled={effectivePage <= 1}
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ‹
                      </button>
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-primary px-2 text-sm font-semibold text-primary-foreground">
                        {effectivePage}
                      </span>
                      <button
                        type="button"
                        aria-label={t("traceability.pagination.next")}
                        disabled={effectivePage >= totalPages}
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ›
                      </button>
                    </div>
                  </ScaledToolbar>
                </div>
              )}
            </section>

            <aside className="flex min-w-0 flex-col gap-4">
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{t("traceability.coverage.title")}</h3>
                </div>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-bold tracking-normal text-foreground">
                    {coverage}%
                  </span>
                  <span className="pb-1 text-xs text-muted-foreground">
                    {t("traceability.status.mapped")}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${coverage}%` }}
                  />
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {t("traceability.coverage.mappedCount", { mapped: mappedCount, total: filteredRows.length })}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t("traceability.coverage.integrityLabel")}
                  {hasTraceability && !isTraceabilityStale && !hasIncompleteCoverage
                    ? t("traceability.coverage.complete")
                    : t("traceability.coverage.needsRegeneration")}
                </p>
              </section>

              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground">{t("traceability.details.title")}</h3>
                {selectedRow ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedRow.label}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedRow.groupLabel} / {selectedRow.typeLabel}
                      </div>
                    </div>
                    <StatusBadge status={selectedRow.status} t={t} />
                    {selectedRow.mappingNote && (
                      <p className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm leading-6 text-primary">
                        {selectedRow.mappingNote}
                      </p>
                    )}
                    <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                      {selectedRow.detailLines.length > 0 ? (
                        selectedRow.detailLines.map((line) => (
                          <p key={line} className="rounded-lg bg-muted/40 px-3 py-2">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="rounded-lg bg-muted/40 px-3 py-2">
                          {missingTraceabilityMessage}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {t("traceability.details.selectRow")}
                  </p>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
