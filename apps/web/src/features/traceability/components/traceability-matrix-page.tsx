// Renders element-level traceability from persisted generation mappings.
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Network,
  Search,
} from "lucide-react";
import type {
  DesignDiagramKind,
  DiagramKind,
  ModelElementRef,
  RequirementRule,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  getDesignModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
} from "../../../entities/diagram/lib/model-details";
import { Badge } from "../../../shared/ui/badge";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceSession } from "../../workspace-session/state";

type MatrixMode = "requirements" | "design";
type RowStatus = "mapped" | "unmapped";

type ElementRow = {
  id: string;
  label: string;
  subtitle: string;
  typeLabel: string;
  groupKey: string;
  groupLabel: string;
  status: RowStatus;
  mappingNote: string | null;
  requirementRules: RequirementRule[];
  requirementElements: ModelElementRef[];
  upstreamDesignElements: ModelElementRef[];
  detailLines: string[];
};

const PAGE_SIZE_OPTIONS = [8, 12, 24] as const;
const ALL_GROUPS = "__all__";

function refKey(ref: Pick<ModelElementRef, "diagramKind" | "elementId" | "modelId">) {
  const scope = ref.modelId?.trim() || ref.diagramKind;
  return `${scope}:${ref.diagramKind}:${ref.elementId}`.toLowerCase();
}

function formatRuleId(id: string) {
  const value = id.trim();
  const match = /^r(\d+)$/i.exec(value);
  return match ? `R${match[1]}` : value.toUpperCase();
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isBusinessTraceabilityKind(kind: string) {
  return ![
    "system-boundary",
    "swimlane",
    "start-node",
    "end-node",
    "merge-node",
    "fork-node",
    "join-node",
  ].includes(kind);
}

function refsForRequirementModels(
  models: ReturnType<typeof useWorkspaceSession>["models"],
) {
  return DIAGRAM_ORDER.flatMap((diagram) => {
    const detail = buildDiagramDetailModel(models[diagram]);
    const items = detail.items.filter((item) =>
      isBusinessTraceabilityKind(item.kind),
    );
    const businessIds = new Set(items.map((item) => item.id));
    const relationships = detail.relationships.filter(
      (relationship) =>
        diagram !== "activity" ||
        (businessIds.has(relationship.sourceId) &&
          businessIds.has(relationship.targetId)),
    );
    return [
      ...items.map((item) => ({
        ref: {
          diagramKind: diagram as DiagramKind,
          elementId: item.id,
          elementKind: item.kind,
          label: item.label,
        },
        typeLabel: SEMANTIC_KIND_META[item.kind].label,
        description: item.description ?? "",
      })),
      ...relationships.map((relationship) => ({
        ref: {
          diagramKind: diagram as DiagramKind,
          elementId: relationship.id,
          elementKind: "relationship",
          label: relationship.label,
        },
        typeLabel: relationship.typeLabel,
        description: `${relationship.sourceId} -> ${relationship.targetId}`,
      })),
    ];
  });
}

function refsForDesignModels(
  models: ReturnType<typeof useWorkspaceSession>["designModels"],
) {
  return Object.values(models).flatMap((model) => {
    const diagram = model.diagramKind;
    const modelId = getDesignModelId(model);
    const detail = buildDiagramDetailModel(model);
    const items = detail.items.filter((item) =>
      isBusinessTraceabilityKind(item.kind),
    );
    const businessIds = new Set(items.map((item) => item.id));
    const relationships = detail.relationships.filter(
      (relationship) =>
        diagram !== "activity" ||
        (businessIds.has(relationship.sourceId) &&
          businessIds.has(relationship.targetId)),
    );
    return [
      ...items.map((item) => ({
        ref: {
          diagramKind: diagram as DesignDiagramKind,
          modelId,
          elementId: item.id,
          elementKind: item.kind,
          label: item.label,
        },
        typeLabel: SEMANTIC_KIND_META[item.kind].label,
        description: item.description ?? "",
      })),
      ...relationships.map((relationship) => ({
        ref: {
          diagramKind: diagram as DesignDiagramKind,
          modelId,
          elementId: relationship.id,
          elementKind: "relationship",
          label: relationship.label,
        },
        typeLabel: relationship.typeLabel,
        description: `${relationship.sourceId} -> ${relationship.targetId}`,
      })),
    ];
  });
}

function requirementGroupLabel(diagramKind: DiagramKind | DesignDiagramKind) {
  return DIAGRAM_META[diagramKind as DiagramType]?.label ?? String(diagramKind);
}

function designGroupLabel(diagramKind: DiagramKind | DesignDiagramKind) {
  return DESIGN_DIAGRAM_META[diagramKind as DesignDiagramType]?.label ?? String(diagramKind);
}

function buildRequirementRows(
  rules: RequirementRule[],
  models: ReturnType<typeof useWorkspaceSession>["models"],
  traceability: ReturnType<typeof useWorkspaceSession>["requirementModelTraceability"],
): ElementRow[] {
  const rulesById = new Map(rules.map((rule) => [rule.id.toLowerCase(), rule]));
  const traceByTarget = new Map<string, RequirementRule[]>();
  for (const entry of traceability) {
    const rule = rulesById.get(entry.ruleId.toLowerCase());
    if (!rule) continue;
    const key = refKey(entry.target);
    traceByTarget.set(key, [...(traceByTarget.get(key) ?? []), rule]);
  }

  return refsForRequirementModels(models).map(({ ref, typeLabel, description }) => {
    const mappedRules = uniqueBy(traceByTarget.get(refKey(ref)) ?? [], (rule) => rule.id);
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${requirementGroupLabel(ref.diagramKind)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.diagramKind,
      groupLabel: requirementGroupLabel(ref.diagramKind),
      status: mappedRules.length > 0 ? "mapped" : "unmapped",
      mappingNote: null,
      requirementRules: mappedRules,
      requirementElements: [],
      upstreamDesignElements: [],
      detailLines: mappedRules.map(
        (rule) => `${formatRuleId(rule.id)} [${rule.category}] ${rule.text}`,
      ),
    };
  });
}

function buildDesignRows(
  rules: RequirementRule[],
  requirementModels: ReturnType<typeof useWorkspaceSession>["models"],
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  requirementTraceability: ReturnType<typeof useWorkspaceSession>["requirementModelTraceability"],
  designTraceability: ReturnType<typeof useWorkspaceSession>["designModelTraceability"],
): ElementRow[] {
  const requirementRefMap = new Map(
    refsForRequirementModels(requirementModels).map(({ ref }) => [refKey(ref), ref]),
  );
  const rulesById = new Map(rules.map((rule) => [rule.id.toLowerCase(), rule]));
  const rulesByRequirementRef = new Map<string, RequirementRule[]>();
  for (const entry of requirementTraceability) {
    const rule = rulesById.get(entry.ruleId.toLowerCase());
    if (!rule) continue;
    const key = refKey(entry.target);
    rulesByRequirementRef.set(key, [...(rulesByRequirementRef.get(key) ?? []), rule]);
  }
  const traceBySource = new Map<
    string,
    ReturnType<typeof useWorkspaceSession>["designModelTraceability"][number]
  >();
  for (const entry of designTraceability) {
    traceBySource.set(entry.source.elementId ? refKey(entry.source) : "", entry);
  }

  return refsForDesignModels(designModels).map(({ ref, typeLabel, description }) => {
    const traceEntry = traceBySource.get(refKey(ref));
    const targets = uniqueBy<ModelElementRef>(
      (traceEntry?.targets ?? [])
        .map((target) => requirementRefMap.get(refKey(target)) ?? target),
      refKey,
    );
    const mappedRules = uniqueBy(
      targets.flatMap((target) => rulesByRequirementRef.get(refKey(target)) ?? []),
      (rule) => rule.id,
    );
    const upstreamDesignElements = uniqueBy<ModelElementRef>(
      traceEntry?.upstreamDesignRefs ?? [],
      refKey,
    );
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${designGroupLabel(ref.diagramKind)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.diagramKind,
      groupLabel: designGroupLabel(ref.diagramKind),
      status: targets.length > 0 ? "mapped" : "unmapped",
      mappingNote:
        traceEntry?.mappingSource === "auto-filled-pending-review" ||
        traceEntry?.reviewStatus === "pending"
          ? traceEntry.rationale ?? "系统自动补齐，需复核确认"
          : traceEntry?.mappingSource === "derived-from-endpoints"
            ? traceEntry.rationale ?? "由端点映射推导"
            : null,
      requirementRules: mappedRules,
      requirementElements: targets,
      upstreamDesignElements,
      detailLines: [
        ...(traceEntry?.mappingSource === "auto-filled-pending-review" ||
        traceEntry?.reviewStatus === "pending"
          ? [`待确认：${traceEntry.rationale ?? "系统自动补齐，需复核确认"}`]
          : []),
        ...(traceEntry?.mappingSource === "derived-from-endpoints"
          ? [`映射说明：${traceEntry.rationale ?? "由端点映射推导"}`]
          : []),
        ...upstreamDesignElements.map(
          (target) =>
            `来源顺序图：${target.modelId ?? designGroupLabel(target.diagramKind)} / ${target.label}`,
        ),
        ...targets.map(
          (target) =>
            `需求元素：${requirementGroupLabel(target.diagramKind)} / ${target.label}`,
        ),
        ...mappedRules.map(
          (rule) => `${formatRuleId(rule.id)} [${rule.category}] ${rule.text}`,
        ),
      ],
    };
  });
}

function includesQuery(row: ElementRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    row.label,
    row.subtitle,
    row.typeLabel,
    row.groupLabel,
    ...row.upstreamDesignElements.map((ref) => ref.label),
    ...row.requirementElements.map((ref) => ref.label),
    ...row.requirementRules.flatMap((rule) => [
      formatRuleId(rule.id),
      rule.category,
      rule.text,
    ]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function buildGroupOptions(rows: ElementRow[]) {
  return Array.from(
    new Map(rows.map((row) => [row.groupKey, row.groupLabel])).entries(),
  ).map(([value, label]) => ({ value, label }));
}

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
        <Badge key={item} variant="secondary" className="max-w-32 truncate text-[10px]">
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

function StatusBadge({ status }: { status: RowStatus }) {
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
      {status === "mapped" ? "已映射" : "未映射"}
    </span>
  );
}

export function TraceabilityMatrixPage({ mode }: { mode: MatrixMode }) {
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
  const rows = useMemo(
    () =>
      isDesign
        ? buildDesignRows(
            rules,
            models,
            designModels,
            requirementModelTraceability,
            designModelTraceability,
          )
        : buildRequirementRows(rules, models, requirementModelTraceability),
    [
      designModelTraceability,
      designModels,
      isDesign,
      models,
      requirementModelTraceability,
      rules,
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
    : requirementModelTraceability.length > 0;
  const isTraceabilityStale = isDesign
    ? designTraceabilityStale
    : requirementTraceabilityStale;
  const hasIncompleteCoverage =
    hasTraceability && filteredRows.length > 0 && mappedCount < filteredRows.length;
  const missingTraceabilityTitle = isDesign
    ? "当前设计模型没有元素级映射数据"
    : "当前需求模型没有元素级映射数据";
  const missingTraceabilityMessage = isDesign
    ? "这通常表示设计模型生成于元素级跟踪上线前，或后端仍返回旧格式结果。请先重新生成需求模型，再重新生成设计模型；页面不会按模型类型粗略猜测设计元素和需求元素的关系。"
    : "这通常表示需求模型生成于元素级跟踪上线前，或后端仍返回旧格式结果。请重新生成需求模型；页面不会按模型类型粗略猜测元素和规则的关系。";

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

  const title = isDesign ? "设计跟踪矩阵" : "需求跟踪矩阵";
  const description = isDesign
    ? "查看设计模型元素到需求模型元素的真实映射链路。"
    : "查看需求模型元素到需求规则的真实映射链路。";
  const groupFilterLabel = isDesign ? "按设计模型类型筛选" : "按需求模型类型筛选";
  const pageRangeStart = filteredRows.length === 0 ? 0 : pageStart + 1;
  const pageRangeEnd = Math.min(pageStart + pageSize, filteredRows.length);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <div className="w-full p-4 lg:p-5">
        <div className="mx-auto flex w-full max-w-none flex-col gap-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-normal text-foreground lg:text-3xl">
                  {title}
                </h2>
                <Badge variant="secondary" className="rounded-full font-mono">
                  {rows.length} 项
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索矩阵…"
                className="h-9 rounded-full bg-card pl-9"
              />
            </div>
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
                {isTraceabilityStale ? "跟踪矩阵基于旧上游生成" : "跟踪矩阵覆盖不完整"}
              </div>
              <p className="mt-1 leading-6">
                {isDesign
                  ? "请先重新生成需求模型，再重新生成设计模型，系统不会用粗略猜测补齐设计元素映射。"
                  : "请重新生成需求模型，系统不会用粗略猜测补齐需求元素和规则的映射。"}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  {isDesign ? (
                    <GitBranch className="size-4 text-primary" />
                  ) : (
                    <Network className="size-4 text-primary" />
                  )}
                  <h3 className="text-sm font-semibold text-foreground">
                    {isDesign ? "设计元素映射" : "需求元素映射"}
                  </h3>
                  <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                    {filteredRows.length}/{rows.length}
                  </Badge>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  分类
                  <SelectControl
                    aria-label={groupFilterLabel}
                    value={groupFilter}
                    onValueChange={setGroupFilter}
                    className="h-8 min-w-32 text-sm"
                    size="sm"
                    options={[
                      { value: ALL_GROUPS, label: isDesign ? "全部模型" : "全部模型" },
                      ...groupOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      })),
                    ]}
                  />
                </label>
              </div>

              {rows.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center px-6 text-center">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      暂无矩阵数据
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      请先生成{isDesign ? "设计模型" : "需求模型"}后再查看跟踪矩阵。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead className="bg-muted/20 text-xs text-muted-foreground">
                      <tr>
                        <th className="w-[34%] border-b border-r border-border px-4 py-4 text-left font-medium">
                          {isDesign ? "设计模型元素" : "需求模型元素"}
                        </th>
                        <th className="w-[14%] border-b border-r border-border px-4 py-4 text-left font-medium">
                          类型
                        </th>
                        {isDesign && (
                          <th className="w-[22%] border-b border-r border-border px-4 py-4 text-left font-medium">
                            来源顺序图 / 映射需求元素
                          </th>
                        )}
                        <th className="w-[20%] border-b border-r border-border px-4 py-4 text-left font-medium">
                          来源需求规则
                        </th>
                        <th className="w-[10%] border-b border-border px-4 py-4 text-center font-medium">
                          映射状态
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
                            没有匹配的矩阵项。
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
                                    items={row.upstreamDesignElements.map((ref) =>
                                      ref.modelId
                                        ? `${ref.modelId.replace(/^sequence:/, "")} · ${ref.label}`
                                        : ref.label,
                                    )}
                                    emptyText="未记录来源顺序图"
                                  />
                                  <ChipList
                                    items={row.requirementElements.map((ref) => ref.label)}
                                    emptyText="未关联需求元素"
                                  />
                                </div>
                              </td>
                            )}
                            <td className="border-r border-border px-4 py-3 align-middle">
                              <ChipList
                                items={row.requirementRules.map((rule) => formatRuleId(rule.id))}
                                emptyText="未关联需求规则"
                              />
                            </td>
                            <td className="px-4 py-3 text-center align-middle">
                              <StatusBadge status={row.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs">
                        {pageRangeStart}-{pageRangeEnd} / {filteredRows.length}
                      </span>
                      <label className="inline-flex items-center gap-2">
                        每页
                        <SelectControl
                          aria-label="每页矩阵项数量"
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
                        条
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="上一页"
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
                        aria-label="下一页"
                        disabled={effectivePage >= totalPages}
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <aside className="flex min-w-0 flex-col gap-4">
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">元素映射率</h3>
                </div>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-bold tracking-normal text-foreground">
                    {coverage}%
                  </span>
                  <span className="pb-1 text-xs text-muted-foreground">已映射</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${coverage}%` }}
                  />
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {mappedCount} / {filteredRows.length} 个元素已有明确映射。
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  覆盖完整性：
                  {hasTraceability && !isTraceabilityStale && !hasIncompleteCoverage
                    ? "100% 覆盖"
                    : "需要重新生成"}
                </p>
              </section>

              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground">映射详情</h3>
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
                    <StatusBadge status={selectedRow.status} />
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
                    选择一行查看完整映射链路。
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
