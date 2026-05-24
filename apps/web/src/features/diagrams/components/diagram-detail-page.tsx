import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Download,
  Maximize2,
  Search,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  List,
  ArrowRight,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { Badge } from "../../../shared/ui/badge";
import { InlineSvg } from "./inline-svg";
import { cn } from "../../../shared/ui/utils";
import { downloadTextFile } from "../../../shared/lib/download";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  getDesignModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
  type DiagramRelationshipDetail,
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";

export function DiagramView({
  type,
  highlightedElement,
}: {
  type: DiagramType;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  return (
    <DiagramDetailView
      stage="requirements"
      type={type}
      highlightedElement={highlightedElement}
    />
  );
}

export function DesignDiagramView({
  type,
  modelId,
  highlightedElement,
}: {
  type: DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  return (
    <DiagramDetailView
      stage="design"
      type={type}
      modelId={modelId}
      highlightedElement={highlightedElement}
    />
  );
}

function getFieldValue(fields: DiagramRelationshipDetail["fields"], label: string) {
  return fields.find((field) => field.label === label)?.value ?? "";
}

function getRelationEndpointLabel(
  relation: DiagramRelationshipDetail,
  itemsById: Map<string, DiagramDetailItem>,
  endpoint: "source" | "target",
) {
  const id = endpoint === "source" ? relation.sourceId : relation.targetId;
  return itemsById.get(id)?.label ?? id;
}

function getRelationDisplayLabel(
  relation: DiagramRelationshipDetail,
  itemsById: Map<string, DiagramDetailItem>,
) {
  const explicit =
    relation.label && relation.label !== `${relation.sourceId} -> ${relation.targetId}`
      ? relation.label
      : "";
  const descriptive =
    explicit ||
    getFieldValue(relation.fields, "说明") ||
    getFieldValue(relation.fields, "标签") ||
    getFieldValue(relation.fields, "条件") ||
    getFieldValue(relation.fields, "守卫");

  if (descriptive) return descriptive;
  return `${getRelationEndpointLabel(relation, itemsById, "source")} → ${getRelationEndpointLabel(
    relation,
    itemsById,
    "target",
  )}`;
}

function isRelationConnectedTo(
  relation: DiagramRelationshipDetail,
  element: DiagramDetailItem | undefined,
) {
  if (!element) return false;
  return relation.sourceId === element.id || relation.targetId === element.id;
}

function matchesItemSearch(item: DiagramDetailItem, query: string) {
  if (!query) return true;
  const lower = query.toLowerCase();
  return [
    item.label,
    item.id,
    item.description ?? "",
    ...item.fields.flatMap((field) => [field.label, field.value]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(lower);
}

function getModelText(model: unknown, key: "title" | "summary", fallback: string) {
  if (model && typeof model === "object" && key in model) {
    const value = (model as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}

function getRelationAccentClass(index: number) {
  const classes = [
    "border-l-primary",
    "border-l-muted-foreground/60",
    "border-l-foreground/60",
  ];
  return classes[index % classes.length];
}

function DiagramDetailView({
  stage,
  type,
  modelId,
  highlightedElement,
}: {
  stage: "requirements" | "design";
  type: DiagramType | DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  const {
    models,
    plantUml,
    svgArtifacts,
    diagramErrors,
    designModels,
    designPlantUml,
    designSvgArtifacts,
    designDiagramErrors,
    rulesForDiagram,
    staleDiagrams,
    generateDiagrams,
    generating,
  } = useWorkspaceSession();
  const {
    openDiagram,
    openDesignDiagram,
    openDiagramElement,
    openDesignDiagramElement,
  } = useWorkspaceShell();
  const isDesign = stage === "design";
  const requirementType = type as DiagramType;
  const designType = type as DesignDiagramType;
  const isStale = !isDesign && staleDiagrams.includes(requirementType);
  const meta = isDesign ? DESIGN_DIAGRAM_META[designType] : DIAGRAM_META[requirementType];
  const designModel = isDesign
    ? modelId
      ? designModels[modelId]
      : Object.values(designModels).find((entry) => entry.diagramKind === designType)
    : undefined;
  const designArtifactId = designModel ? getDesignModelId(designModel) : modelId ?? designType;
  const source = isDesign
    ? designPlantUml[designArtifactId] ?? ""
    : plantUml[requirementType] ?? "";
  const model = isDesign ? designModel : models[requirementType];
  const svgMarkup = isDesign
    ? designSvgArtifacts[designArtifactId]?.svg ?? ""
    : svgArtifacts[requirementType]?.svg ?? "";
  const diagramError = isDesign
    ? designDiagramErrors[designType] ?? null
    : diagramErrors[requirementType] ?? null;
  const [svgUrl, setSvgUrl] = useState("");
  const [svgScale, setSvgScale] = useState(1);
  const svgScaleRef = useRef(svgScale);
  const svgCanvasRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [elementSearch, setElementSearch] = useState("");
  const [elementKindFilter, setElementKindFilter] = useState<"all" | SemanticElementKind>(
    "all",
  );
  const [relationsOnlyFocus, setRelationsOnlyFocus] = useState(false);
  const updateSvgScale = useCallback((next: number) => {
    setSvgScale(Math.min(3, Math.max(0.25, Math.round(next * 100) / 100)));
  }, []);
  useEffect(() => {
    svgScaleRef.current = svgScale;
  }, [svgScale]);
  useEffect(() => {
    const canvas = svgCanvasRef.current;
    if (!canvas || !svgMarkup) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      updateSvgScale(svgScaleRef.current + (event.deltaY < 0 ? 0.1 : -0.1));
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [svgMarkup, updateSvgScale]);
  useEffect(() => {
    panStateRef.current.active = false;
    setIsPanning(false);
  }, [svgMarkup]);
  const startCanvasPan = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if ((typeof event.button === "number" && event.button !== 0) || !svgMarkup) return;

    const canvas = svgCanvasRef.current;
    if (!canvas) return;

    panStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    setIsPanning(true);
  }, [svgMarkup]);
  const moveCanvasPan = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const panState = panStateRef.current;
    if (!panState.active) return;

    event.preventDefault();
    const canvas = svgCanvasRef.current;
    if (!canvas) return;

    canvas.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    canvas.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  }, []);
  const stopCanvasPan = useCallback(() => {
    if (!panStateRef.current.active) return;

    panStateRef.current.active = false;
    setIsPanning(false);
  }, []);
  useEffect(() => {
    if (!svgMarkup || typeof URL.createObjectURL !== "function") {
      setSvgUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(
      new Blob([svgMarkup], { type: "image/svg+xml" }),
    );
    setSvgUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [svgMarkup]);
  const sourceRules = isDesign ? [] : rulesForDiagram(requirementType);
  const detailModel = useMemo(() => buildDiagramDetailModel(model), [model]);
  const { items, groups, relationships } = detailModel;
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const highlighted: DiagramDetailItem | undefined = useMemo(() => {
    if (!highlightedElement) return undefined;
    return items.find(
      (e) => e.kind === highlightedElement.kind && e.id === highlightedElement.id,
    );
  }, [items, highlightedElement]);
  const relatedRelationships = useMemo(
    () => relationships.filter((relation) => isRelationConnectedTo(relation, highlighted)),
    [highlighted, relationships],
  );
  const relatedItems = useMemo(() => {
    if (!highlighted) return [];
    const relatedIds = new Set<string>();
    for (const relation of relatedRelationships) {
      if (relation.sourceId !== highlighted.id) relatedIds.add(relation.sourceId);
      if (relation.targetId !== highlighted.id) relatedIds.add(relation.targetId);
    }
    return [...relatedIds]
      .map((id) => itemsById.get(id))
      .filter((item): item is DiagramDetailItem => Boolean(item));
  }, [highlighted, itemsById, relatedRelationships]);
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              (elementKindFilter === "all" || item.kind === elementKindFilter) &&
              matchesItemSearch(item, elementSearch.trim()),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [elementKindFilter, elementSearch, groups],
  );
  const filteredElements = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );
  const visibleRelationships = useMemo(
    () =>
      relationsOnlyFocus && highlighted
        ? relatedRelationships
        : relationships,
    [highlighted, relatedRelationships, relationships, relationsOnlyFocus],
  );
  const summaryGroups = groups.filter((group) => {
    if (group.kind === "message" || group.kind === "table-column") return false;
    return group.items.length > 0;
  });
  const modelTitle = getModelText(model, "title", meta.label);
  const modelSummary = getModelText(model, "summary", meta.description);
  const diagramActions = svgMarkup ? (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={() => updateSvgScale(svgScale - 0.25)}
        aria-label="缩小 SVG"
      >
        <ZoomOut className="size-3.5" />
      </Button>
      <Badge variant="secondary" className="h-8 min-w-14 font-mono">
        {Math.round(svgScale * 100)}%
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={() => updateSvgScale(svgScale + 0.25)}
        aria-label="放大 SVG"
      >
        <ZoomIn className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={() => updateSvgScale(1)}
        aria-label="适应宽度"
      >
        <Maximize2 className="size-3.5" />
      </Button>
      {svgUrl && (
        <Button variant="outline" size="sm" className="h-8" asChild>
          <a href={svgUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" /> 新标签
          </a>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => {
          downloadTextFile(`${stage}-${type}.svg`, svgMarkup, "image/svg+xml");
          toast.success(`已导出 ${type}.svg`);
        }}
      >
        <Download className="size-3.5" /> SVG
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => {
          if (!model) return;
          downloadTextFile(
            `${stage}-${type}.model.json`,
            JSON.stringify(model, null, 2),
            "application/json",
          );
          toast.success(`已导出 ${type}.model.json`);
        }}
        disabled={!model}
      >
        <Download className="size-3.5" /> JSON
      </Button>
    </div>
  ) : null;

  useEffect(() => {
    setElementSearch("");
    setElementKindFilter("all");
    setRelationsOnlyFocus(false);
    setSvgScale(1);
  }, [stage, type]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {!source ? (
        <div className="w-full overflow-auto py-6 lg:py-8">
          <div className="mx-auto w-[calc(100%-2rem)] max-w-[1920px] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
            {diagramError ? (
              <div className="rounded-xl border border-destructive/40 bg-card px-5 py-8 text-sm shadow-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {meta.label} 生成失败
                </div>
                <div className="mt-2 leading-relaxed text-foreground">
                  {diagramError.message}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-sm">
                尚未生成。请回到「{isDesign ? "设计" : "需求"}」点击「生成模型」。
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto py-4 lg:py-6">
          <div className="mx-auto flex min-h-0 w-[calc(100%-2rem)] max-w-[1920px] flex-1 flex-col gap-4 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
          {isStale && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span>此图基于旧规则生成，可能已过时。</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-8"
                onClick={() => generateDiagrams([requirementType])}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                重新生成此图
              </Button>
            </div>
          )}

          <header className="px-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold tracking-normal text-foreground">
                    {modelTitle}
                  </h2>
                  <Badge variant="secondary">{isDesign ? "设计模型" : "需求模型"}</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {modelSummary}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center sm:w-auto">
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {items.length}
                  </div>
                  <div className="text-xs text-muted-foreground">元素</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {relationships.length}
                  </div>
                  <div className="text-xs text-muted-foreground">关系</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {groups.length}
                  </div>
                  <div className="text-xs text-muted-foreground">分组</div>
                </div>
              </div>
            </div>
          </header>

          <Tabs
            key={`${stage}:${type}:${highlighted ? highlighted.id : "all"}`}
            defaultValue="diagram"
            className="min-h-[560px] flex-1 gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="border-b border-border px-5">
              <TabsList className="h-auto w-full justify-start gap-8 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="diagram"
                  className="relative h-12 flex-none rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block"
                >
                  图
                </TabsTrigger>
                <TabsTrigger
                  value="elements"
                  className="relative h-12 flex-none rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block"
                >
                元素
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {items.length}
                </span>
                </TabsTrigger>
                <TabsTrigger
                  value="relations"
                  className="relative h-12 flex-none rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block"
                >
                关系
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {relationships.length}
                </span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="diagram" className="m-0 min-h-0 flex-1 p-0 data-[state=active]:flex data-[state=active]:flex-col">
              <div className="grid min-h-0 flex-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="flex min-w-0 min-h-0 flex-col bg-background">
                  <div className="flex flex-col gap-3 rounded-t-xl border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">预览</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                    {diagramActions}
                  </div>
                  <div
                    ref={svgCanvasRef}
                    data-testid="svg-preview-canvas"
                    className={cn(
                      "min-h-[420px] flex-1 overflow-auto",
                      svgMarkup && (isPanning ? "cursor-grabbing" : "cursor-grab"),
                    )}
                    onMouseDown={startCanvasPan}
                    onMouseMove={moveCanvasPan}
                    onMouseUp={stopCanvasPan}
                    onMouseLeave={stopCanvasPan}
                  >
                      {svgMarkup ? (
                        <div className="flex min-h-full min-w-full items-center justify-center">
                          <InlineSvg
                            svg={svgMarkup}
                            scale={svgScale}
                            highlightLabel={highlighted?.label}
                            className="w-full [&>svg]:drop-shadow-sm"
                          />
                        </div>
                      ) : diagramError ? (
                        <div className="flex min-h-full items-center justify-center">
                          <div className="max-w-xl rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                            <div className="flex items-center gap-2 font-medium text-destructive">
                              <AlertTriangle className="size-4 shrink-0" />
                              {meta.label} 生成失败
                            </div>
                            <div className="mt-2 leading-relaxed text-foreground">
                              {diagramError.message}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-full items-center justify-center text-sm text-muted-foreground">
                          尚未生成 SVG
                        </div>
                      )}
                  </div>
                </section>

                <aside className="flex flex-col gap-5">
                  {highlighted ? (
                    <>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs uppercase tracking-wider text-primary">
                            focus
                          </span>
                          <Badge variant="secondary" className="font-mono">
                            {SEMANTIC_KIND_META[highlighted.kind].label}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {highlighted.label}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              isDesign
                                ? openDesignDiagram(
                                    designType,
                                    designArtifactId,
                                    getModelText(model, "title", meta.label),
                                  )
                                : openDiagram(requirementType)
                            }
                          >
                            清除高亮
                          </Button>
                        </div>
                        <div className="mt-4 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground">职责与属性</div>
                          {highlighted.description && (
                            <div className="mt-1 leading-relaxed">{highlighted.description}</div>
                          )}
                          {highlighted.fields.length > 0 ? (
                            <div className="mt-2 flex flex-col gap-1.5">
                              {highlighted.fields.slice(0, 6).map((field) => (
                                <div key={`${highlighted.id}:focus:${field.label}`}>
                                  <span>{field.label}：</span>
                                  <span className="text-foreground">{field.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : !highlighted.description ? (
                            <div className="mt-1">暂无额外属性。</div>
                          ) : null}
                          {!isDesign && sourceRules.length > 0 && (
                            <div className="mt-3">
                              来源规则：{sourceRules.slice(0, 3).map((rule) => rule.id).join("、")}
                              {sourceRules.length > 3 ? ` +${sourceRules.length - 3}` : ""}
                            </div>
                          )}
                        </div>
                      </section>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground">相关关系与元素</h3>
                        <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
                          相关关系 {relatedRelationships.length} 条
                          {relatedItems.length > 0
                            ? `，关联元素 ${relatedItems.map((item) => item.label).slice(0, 4).join("、")}`
                            : "。"}
                        </div>
                        {relatedRelationships[0] && (
                          <div className="mt-3 truncate text-sm text-foreground">
                            {getRelationDisplayLabel(relatedRelationships[0], itemsById)}
                          </div>
                        )}
                      </section>
                    </>
                  ) : (
                    <>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground">模型概览</h3>
                        <div className="mt-4 flex flex-col gap-3">
                          {summaryGroups.slice(0, 6).map((group) => (
                            <div
                              key={`overview:${group.kind}`}
                              className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm text-foreground">
                                  {SEMANTIC_KIND_META[group.kind].label}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {group.items.slice(0, 3).map((item) => item.label).join("、") || "暂无元素"}
                                </div>
                              </div>
                              <Badge variant="secondary" className="font-mono">
                                {group.items.length}
                              </Badge>
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                            <div>
                              <div className="text-sm text-foreground">关系</div>
                              <div className="text-xs text-muted-foreground">结构化连接</div>
                            </div>
                            <Badge variant="secondary" className="font-mono">
                              {relationships.length}
                            </Badge>
                          </div>
                        </div>
                      </section>
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground">当前状态</h3>
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span>模型类型</span>
                            <span className="font-medium text-foreground">{meta.label}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>SVG 预览</span>
                            <span className="font-medium text-foreground">
                              {svgMarkup ? "已生成" : "未生成"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>缩放比例</span>
                            <span className="font-mono text-foreground">
                              当前 {Math.round(svgScale * 100)}%
                            </span>
                          </div>
                        </div>
                      </section>
                    </>
                  )}
                </aside>
              </div>
            </TabsContent>

            <TabsContent value="elements" className="m-0 min-h-0 flex-1 p-5 data-[state=active]:flex data-[state=active]:flex-col">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background shadow-sm">
                <div className="border-b border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                    <h3 className="text-sm font-semibold text-foreground">元素清单</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      按类型浏览模型元素，点击卡片可定位到对应元素。
                    </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2"
                        aria-pressed="true"
                        aria-label="网格视图"
                      >
                        <LayoutGrid className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground"
                        aria-pressed="false"
                        aria-label="列表视图"
                      >
                        <List className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {groups.length > 0 ? (
                    <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <label className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={elementSearch}
                          onChange={(event) => setElementSearch(event.target.value)}
                          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
                          placeholder="搜索元素、属性或说明"
                        />
                      </label>
                      <div
                        className="flex flex-wrap gap-2"
                        aria-label="按元素类型筛选"
                        role="group"
                      >
                        <Button
                          type="button"
                          variant={elementKindFilter === "all" ? "default" : "outline"}
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => setElementKindFilter("all")}
                        >
                          全部类型
                          <span className="ml-1 font-mono text-[10px] opacity-75">
                            {items.length}
                          </span>
                        </Button>
                        {groups.map((group) => (
                          <Button
                            key={group.kind}
                            type="button"
                            variant={elementKindFilter === group.kind ? "default" : "outline"}
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => setElementKindFilter(group.kind)}
                          >
                            {SEMANTIC_KIND_META[group.kind].label}
                            <span className="ml-1 font-mono text-[10px] opacity-75">
                              {group.items.length}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                {groups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    未识别到元素。
                  </div>
                ) : filteredElements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    没有匹配的元素，请调整搜索或类型筛选。
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {filteredElements.map((el) => {
                            const active =
                              highlighted &&
                              highlighted.kind === el.kind &&
                              highlighted.id === el.id;
                            const fieldSummary = el.fields
                              .slice(0, 3)
                              .map((field) => `${field.label}：${field.value}`)
                              .join(" / ");
                            return (
                              <button
                                type="button"
                                aria-label={el.label}
                                key={`${el.kind}:${el.id}`}
                                onClick={() =>
                                  isDesign
                                    ? openDesignDiagramElement(
                                        designType,
                                        el.kind,
                                        el.id,
                                        el.label,
                                        designArtifactId,
                                      )
                                    : openDiagramElement(
                                        requirementType,
                                        el.kind,
                                        el.id,
                                        el.label,
                                      )
                                }
                                className={cn(
                                  "min-h-32 rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-card text-foreground hover:bg-accent",
                                )}
                              >
                                <span className="flex items-start justify-between gap-3">
                                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                                    {SEMANTIC_KIND_META[el.kind].shortLabel}
                                  </span>
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {SEMANTIC_KIND_META[el.kind].label}
                                  </Badge>
                                </span>
                                <span className="mt-4 block min-w-0 truncate text-base font-semibold text-foreground">
                                  {el.label}
                                </span>
                                {el.description && (
                                  <span className="mt-2 line-clamp-3 block min-h-[3.75rem] text-xs leading-5 text-muted-foreground">
                                    {el.description}
                                  </span>
                                )}
                                {!el.description && (
                                  <span className="mt-2 line-clamp-3 block min-h-[3.75rem] text-xs leading-5 text-muted-foreground">
                                    暂无说明。
                                  </span>
                                )}
                                <span className="mt-4 block border-t border-border pt-3">
                                  <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                    <span className="min-w-0 truncate">
                                      {el.fields.length > 0
                                        ? fieldSummary
                                        : "暂无字段"}
                                    </span>
                                    <ArrowRight className="size-3.5 shrink-0" />
                                  </span>
                                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                                    {el.fields.length} 个字段
                                  </span>
                                </span>
                              </button>
                            );
                    })}
                  </div>
                )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="relations" className="m-0 min-h-0 flex-1 p-5 data-[state=active]:flex data-[state=active]:flex-col">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">关系说明</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      查看元素之间的结构化连接、角色、条件和说明。
                    </p>
                  </div>
                  {highlighted ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={relationsOnlyFocus}
                        onChange={(event) => setRelationsOnlyFocus(event.target.checked)}
                        className="size-3.5"
                      />
                      只看焦点相关关系
                    </label>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                {relationships.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    暂无结构化关系。
                  </div>
                ) : visibleRelationships.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    当前焦点元素暂无关联关系。
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {visibleRelationships.map((relation, index) => {
                      const displayLabel = getRelationDisplayLabel(relation, itemsById);
                      return (
                      <div
                        key={relation.id}
                        className={cn(
                          "overflow-hidden rounded-xl border border-border border-l-4 bg-card shadow-sm",
                          getRelationAccentClass(index),
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2 p-4 pb-3">
                          <Badge variant="secondary" className="font-mono">
                            {relation.typeLabel}
                          </Badge>
                          <span className="font-medium text-foreground">{displayLabel}</span>
                        </div>
                        <div className="mx-4 rounded-xl border border-border bg-muted/40 p-4">
                          <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(88px,160px)_minmax(0,1fr)]">
                            <div className="rounded-lg border border-border bg-background p-3 text-center">
                              <div className="truncate text-sm font-medium text-foreground">
                                {getRelationEndpointLabel(relation, itemsById, "source")}
                              </div>
                              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                {relation.sourceId}
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                              <span className="h-px min-w-8 flex-1 bg-border" />
                              <span className="max-w-28 truncate rounded-full bg-background px-2 py-1">
                                {displayLabel}
                              </span>
                              <span className="h-px min-w-8 flex-1 bg-border" />
                            </div>
                            <div className="rounded-lg border border-border bg-background p-3 text-center">
                              <div className="truncate text-sm font-medium text-foreground">
                                {getRelationEndpointLabel(relation, itemsById, "target")}
                              </div>
                              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                {relation.targetId}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-3 text-xs text-muted-foreground">
                          <span>
                            {getRelationEndpointLabel(relation, itemsById, "source")} →{" "}
                            {getRelationEndpointLabel(relation, itemsById, "target")}
                          </span>
                          {(itemsById.has(relation.sourceId) || itemsById.has(relation.targetId)) && (
                            <span className="ml-2 font-mono text-[10px] opacity-70">
                              {relation.sourceId} → {relation.targetId}
                            </span>
                          )}
                        </div>
                        {relation.fields.length > 0 && (
                          <div className="grid gap-2 border-t border-border px-4 py-3 text-xs sm:grid-cols-2">
                            {relation.fields.map((field) => (
                              <div key={`${relation.id}:${field.label}`} className="min-w-0">
                                <div className="text-muted-foreground">{field.label}</div>
                                <div className="mt-1 break-words text-foreground">{field.value}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );})}
                  </div>
                )}
                </div>
              </section>
            </TabsContent>

          </Tabs>

          </div>
        </div>
      )}
    </div>
  );
}
