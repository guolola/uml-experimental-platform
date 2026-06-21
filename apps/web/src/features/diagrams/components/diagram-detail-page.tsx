// Renders the diagram detail workspace, including diagram selection, trace highlights, export actions, and model/SVG views.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Search,
  LayoutGrid,
  List,
  ArrowRight,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { Badge } from "../../../shared/ui/badge";
import { DiagramDetailHeader } from "./diagram-detail-header";
import { DiagramPreviewPanel } from "./diagram-preview-panel";
import { ModelEditPanel } from "./model-edit-panel";
import { sanitizeSvgMarkup } from "../lib/svg-sanitizer";
import { cn } from "../../../shared/ui/utils";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  getDesignModelId,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useCompactViewport } from "../../workspace-shell/hooks/use-compact-viewport";
import { useSvgPanZoom } from "../hooks/use-svg-pan-zoom";
import { mobileTouchTargetClass } from "../../workspace-shell/components/mobile-density";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import {
  cloneDraftModel,
  designSourceLabel,
  diagramHighlightAliases,
  draftFingerprint,
  requirementSourceLabel,
} from "../lib/model-editing";
import {
  getModelText,
  getRelationAccentClass,
  getRelationDisplayLabel,
  getRelationEndpointLabel,
  isRelationConnectedTo,
  matchesItemSearch,
} from "../lib/diagram-detail-view-model";

export function DiagramView({
  type,
  modelId,
  highlightedElement,
}: {
  type: DiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  return (
    <DiagramDetailView
      stage="requirements"
      type={type}
      modelId={modelId}
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
    manualModelEditStatus,
    saveRequirementModelEdit,
    saveDesignModelEdit,
    rerenderRequirementModel,
    rerenderDesignModel,
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
  const requirementModel = !isDesign
    ? modelId
      ? models[modelId]
      : models[requirementType]
    : undefined;
  const requirementArtifactId = requirementModel
    ? getRequirementModelId(requirementModel)
    : modelId ?? requirementType;
  const source = isDesign
    ? designPlantUml[designArtifactId] ?? ""
    : plantUml[requirementArtifactId] ?? plantUml[requirementType] ?? "";
  const model = isDesign ? designModel : requirementModel;
  const svgMarkup = isDesign
    ? designSvgArtifacts[designArtifactId]?.svg ?? ""
    : svgArtifacts[requirementArtifactId]?.svg ?? svgArtifacts[requirementType]?.svg ?? "";
  const normalizedSvgMarkup = useMemo(() => sanitizeSvgMarkup(svgMarkup), [svgMarkup]);
  const diagramError = isDesign
    ? designDiagramErrors[designType] ?? null
    : diagramErrors[requirementArtifactId] ?? diagramErrors[requirementType] ?? null;
  const statusKey = isDesign ? designArtifactId : requirementArtifactId;
  const editStatus = manualModelEditStatus[statusKey];
  const compactViewport = useCompactViewport();
  const [draft, setDraft] = useState<Record<string, unknown> | null>(() =>
    model ? cloneDraftModel(model) : null,
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const persistedDraftFingerprintRef = useRef(draftFingerprint(model ? cloneDraftModel(model) : null));
  const {
    svgUrl,
    svgScale,
    svgCanvasRef,
    isPanning,
    svgPanOffset,
    updateSvgScale,
    startCanvasPan,
    moveCanvasPan,
    stopCanvasPan,
  } = useSvgPanZoom(svgMarkup, normalizedSvgMarkup);
  const [elementSearch, setElementSearch] = useState("");
  const [elementKindFilter, setElementKindFilter] = useState<"all" | SemanticElementKind>(
    "all",
  );
  const [relationsOnlyFocus, setRelationsOnlyFocus] = useState(false);
  const [localHighlightedElement, setLocalHighlightedElement] = useState<{
    kind: string;
    id: string;
  } | null>(null);
  const [highlightRequestId, setHighlightRequestId] = useState(0);
  const [isOverviewPanelOpen, setIsOverviewPanelOpen] = useState(() =>
    Boolean(highlightedElement),
  );
  const overviewPanelDismissedRef = useRef(false);
  useEffect(() => {
    const nextDraft = model ? cloneDraftModel(model) : null;
    setDraft(nextDraft);
    persistedDraftFingerprintRef.current = draftFingerprint(nextDraft);
    setSaveStatus("idle");
    setLocalHighlightedElement(null);
    overviewPanelDismissedRef.current = false;
    setIsOverviewPanelOpen(Boolean(highlightedElement));
  }, [highlightedElement, model, statusKey]);
  const setDraftField = useCallback((key: string, value: unknown) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);
  const commitDraftAndRerender = useCallback(async (nextDraft: Record<string, unknown>) => {
    setDraft(nextDraft);
    setSaving(true);
    setSaveStatus("saving");
    try {
      if (isDesign) {
        await saveDesignModelEdit(designArtifactId, nextDraft as never);
        await rerenderDesignModel(designArtifactId, nextDraft as never, {
          toastMessage: null,
        });
      } else {
        await saveRequirementModelEdit(requirementType, nextDraft as never);
        await rerenderRequirementModel(requirementType, nextDraft as never, {
          toastMessage: null,
        });
      }
      persistedDraftFingerprintRef.current = draftFingerprint(nextDraft);
      setSaveStatus("saved");
      toast.message("修改已保存，当前图已更新");
    } catch {
      setSaveStatus("error");
      toast.error("保存失败，请稍后重试");
      return;
    } finally {
      setSaving(false);
    }
  }, [
    designArtifactId,
    isDesign,
    requirementType,
    rerenderDesignModel,
    rerenderRequirementModel,
    saveDesignModelEdit,
    saveRequirementModelEdit,
  ]);
  useEffect(() => {
    if (!draft || saving) return;
    const fingerprint = draftFingerprint(draft);
    if (fingerprint === persistedDraftFingerprintRef.current) return;
    const timer = window.setTimeout(() => {
      void commitDraftAndRerender(draft);
    }, 600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [commitDraftAndRerender, draft, saving]);
  const sourceRules = isDesign || requirementType === "analysis" ? [] : rulesForDiagram(requirementType);
  const detailModel = useMemo(() => buildDiagramDetailModel(draft ?? model), [draft, model]);
  const { items, groups, relationships } = detailModel;
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const effectiveHighlightedElement = localHighlightedElement ?? highlightedElement ?? null;
  const highlighted: DiagramDetailItem | undefined = useMemo(() => {
    if (!effectiveHighlightedElement) return undefined;
    return items.find(
      (e) => e.kind === effectiveHighlightedElement.kind && e.id === effectiveHighlightedElement.id,
    );
  }, [items, effectiveHighlightedElement]);
  const highlightAliases = useMemo(
    () => diagramHighlightAliases(highlighted),
    [highlighted],
  );
  const selectElementInDiagram = useCallback((element: DiagramDetailItem) => {
    setLocalHighlightedElement({ kind: element.kind, id: element.id });
    setHighlightRequestId((current) => current + 1);
    if (!overviewPanelDismissedRef.current) {
      setIsOverviewPanelOpen(true);
    }
  }, []);
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
  const highlightedElementKey = highlightedElement
    ? `${highlightedElement.kind}:${highlightedElement.id}`
    : "";
  useEffect(() => {
    if (!highlightedElementKey || overviewPanelDismissedRef.current) return;
    setIsOverviewPanelOpen(true);
  }, [highlightedElementKey]);
  const modelTitle = getModelText(draft ?? model, "title", meta.label);
  const modelSummary = getModelText(draft ?? model, "summary", meta.description);
  const designSourceText = isDesign
    ? designSourceLabel(designType, draft ?? (designModel ? cloneDraftModel(designModel) : null))
    : null;
  const requirementSourceText = !isDesign
    ? requirementSourceLabel(
        requirementType,
        draft ?? (model ? cloneDraftModel(model) : null),
        sourceRules,
      )
    : null;
  const sourceText = designSourceText ?? requirementSourceText;
  const saveStatusLabel =
    saveStatus === "saving" ? "更新中" : saveStatus === "saved" ? "已保存" : "失败";
  const editWarningText = editStatus?.warning?.includes("重绘当前图")
    ? "模型已手动修改，可能与前置需求映射不一致。保存后会自动更新当前图。"
    : editStatus?.warning ??
      "手动修改会更新当前模型结构，可能不再完全对应原始需求或上游用例。修改保存后会基于当前结构自动更新此图。";
  const overviewPanelId = `model-overview-${stage}-${statusKey}`.replace(/[^A-Za-z0-9_-]/g, "-");
  const openOverviewPanel = useCallback(() => {
    overviewPanelDismissedRef.current = false;
    setIsOverviewPanelOpen(true);
  }, []);
  const closeOverviewPanel = useCallback(() => {
    overviewPanelDismissedRef.current = true;
    setIsOverviewPanelOpen(false);
  }, []);
  const sourceRuleIds = useMemo(
    () => sourceRules.map((rule) => rule.id).filter((id): id is string => Boolean(id)),
    [sourceRules],
  );
  const runFocusAction = useCallback(() => {
    if (localHighlightedElement) {
      setLocalHighlightedElement(null);
      return;
    }
    if (isDesign) {
      openDesignDiagram(
        designType,
        designArtifactId,
        getModelText(model, "title", meta.label),
      );
    } else {
      openDiagram(
        requirementType,
        requirementArtifactId,
        getModelText(model, "title", meta.label),
      );
    }
  }, [
    designArtifactId,
    designType,
    isDesign,
    localHighlightedElement,
    meta.label,
    model,
    openDesignDiagram,
    openDiagram,
    requirementArtifactId,
    requirementType,
  ]);
  useEffect(() => {
    if (!isOverviewPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverviewPanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOverviewPanel, isOverviewPanelOpen]);
  useEffect(() => {
    setElementSearch("");
    setElementKindFilter("all");
    setRelationsOnlyFocus(false);
    updateSvgScale(1);
  }, [stage, type, updateSvgScale]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {!model && !source ? (
        <div className="w-full overflow-auto py-6 lg:py-8">
          <div className="mx-auto w-[calc(100%-2rem)] max-w-[1920px] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
            {diagramError ? (
              <div className="rounded-xl border border-destructive/40 bg-card px-5 py-8 text-sm shadow-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {meta.label} 生成失败
                </div>
                <div className="mt-2 leading-relaxed text-foreground">
                  {diagramError.error.message}
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
            </div>
          )}

          <DiagramDetailHeader
            draft={draft}
            modelTitle={modelTitle}
            modelSummary={modelSummary}
            sourceText={sourceText}
            saveStatus={saveStatus}
            saveStatusLabel={saveStatusLabel}
            compactViewport={compactViewport}
            itemCount={items.length}
            relationshipCount={relationships.length}
            groupCount={groups.length}
            onChangeTitle={(value) => setDraftField("title", value)}
            onChangeSummary={(value) => setDraftField("summary", value)}
          />

          <Tabs
            key={`${stage}:${type}:${highlighted ? highlighted.id : "all"}`}
            defaultValue="diagram"
            className="gap-0 rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="border-b border-border px-3 sm:px-5">
              <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0 sm:gap-8">
                <TabsTrigger
                  value="diagram"
                  className={cn(
                    "relative flex-none rounded-none border-0 bg-transparent px-2 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block sm:px-0 sm:after:inset-x-0",
                    mobileTouchTargetClass,
                  )}
                >
                  图
                </TabsTrigger>
                {compactViewport ? (
                  <>
                    <TabsTrigger
                      value="elements"
                      className={cn(
                        "relative flex-none rounded-none border-0 bg-transparent px-2 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block sm:px-0 sm:after:inset-x-0",
                        mobileTouchTargetClass,
                      )}
                    >
                      元素
                    </TabsTrigger>
                    <TabsTrigger
                      value="relations"
                      className={cn(
                        "relative flex-none rounded-none border-0 bg-transparent px-2 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block sm:px-0 sm:after:inset-x-0",
                        mobileTouchTargetClass,
                      )}
                    >
                      关系
                    </TabsTrigger>
                    {draft ? (
                      <TabsTrigger
                        value="edit"
                        className={cn(
                          "relative flex-none rounded-none border-0 bg-transparent px-2 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block sm:px-0 sm:after:inset-x-0",
                          mobileTouchTargetClass,
                        )}
                      >
                        编辑
                      </TabsTrigger>
                    ) : null}
                  </>
                ) : null}
              </TabsList>
            </div>

            <TabsContent value="diagram" className="m-0 p-0">
              <div className="p-3 sm:p-5">
                <DiagramPreviewPanel
                  description={meta.description}
                  stage={stage}
                  type={type}
                  normalizedSvgMarkup={normalizedSvgMarkup}
                  svgMarkup={svgMarkup}
                  svgUrl={svgUrl}
                  svgScale={svgScale}
                  svgCanvasRef={svgCanvasRef}
                  isPanning={isPanning}
                  svgPanOffset={svgPanOffset}
                  onUpdateSvgScale={updateSvgScale}
                  onStartPan={startCanvasPan}
                  onMovePan={moveCanvasPan}
                  onStopPan={stopCanvasPan}
                  highlighted={highlighted}
                  highlightAliases={highlightAliases}
                  highlightRequestId={highlightRequestId}
                  diagramError={diagramError}
                  diagramLabel={meta.label}
                  isOverviewPanelOpen={isOverviewPanelOpen}
                  overviewPanelId={overviewPanelId}
                  compactViewport={compactViewport}
                  onOpenOverviewPanel={openOverviewPanel}
                  onCloseOverviewPanel={closeOverviewPanel}
                  onFocusAction={runFocusAction}
                  sourceRuleIds={sourceRuleIds}
                  relatedRelationships={relatedRelationships}
                  relatedItems={relatedItems}
                  itemsById={itemsById}
                  summaryGroups={summaryGroups}
                  relationshipsCount={relationships.length}
                />
              </div>
              {!compactViewport && draft ? (
                <div className="px-3 pb-3 sm:px-5 sm:pb-5">
                  <div className="mb-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                    <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                    <span>{editWarningText}</span>
                  </div>
                  <ModelEditPanel
                    draft={draft}
                    setDraft={setDraft}
                    onCommitDraft={commitDraftAndRerender}
                    onSelectElement={selectElementInDiagram}
                    selectedElement={effectiveHighlightedElement}
                    saving={saving}
                  />
                </div>
              ) : null}
            </TabsContent>

            {compactViewport && draft ? (
            <TabsContent value="edit" className="m-0 p-0">
              <div className="px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-5">
                <div className="mb-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                  <span>{editWarningText}</span>
                </div>
                <ModelEditPanel
                  draft={draft}
                  setDraft={setDraft}
                  onCommitDraft={commitDraftAndRerender}
                  onSelectElement={selectElementInDiagram}
                  selectedElement={effectiveHighlightedElement}
                  saving={saving}
                />
              </div>
            </TabsContent>
            ) : null}

            <TabsContent value="elements" className="m-0 min-h-0 flex-1 p-3 data-[state=active]:flex data-[state=active]:flex-col sm:p-5">
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
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                                        requirementArtifactId,
                                      )
                                }
                                className={cn(
                                  "min-h-[8.5rem] overflow-hidden rounded-lg border p-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-card text-foreground hover:bg-accent",
                                )}
                              >
                                <span className="flex items-start justify-between gap-3">
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                                    {SEMANTIC_KIND_META[el.kind].shortLabel}
                                  </span>
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {SEMANTIC_KIND_META[el.kind].label}
                                  </Badge>
                                </span>
                                <span className="mt-2 block min-w-0 line-clamp-1 break-words text-sm font-semibold leading-5 text-foreground">
                                  {el.label}
                                </span>
                                {el.description && (
                                  <span className="mt-1.5 line-clamp-2 block min-h-10 text-[11px] leading-5 text-muted-foreground">
                                    {el.description}
                                  </span>
                                )}
                                {!el.description && (
                                  <span className="mt-1.5 line-clamp-2 block min-h-10 text-[11px] leading-5 text-muted-foreground">
                                    暂无说明。
                                  </span>
                                )}
                                <span className="mt-2 block border-t border-border pt-2">
                                  <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                    <span className="min-w-0 line-clamp-1 break-words">
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

            <TabsContent value="relations" className="m-0 min-h-0 flex-1 p-3 data-[state=active]:flex data-[state=active]:flex-col sm:p-5">
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
