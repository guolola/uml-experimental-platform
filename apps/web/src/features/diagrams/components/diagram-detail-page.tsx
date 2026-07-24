// Renders the diagram detail workspace, including diagram selection, trace highlights, export actions, and model/SVG views.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  contextDiagramSpecSchema,
  designDiagramModelSpecSchema,
  diagramModelSpecSchema,
  type ContextDiagramSpec,
} from "@uml-platform/contracts";
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
import { diagramDetailFieldLabel, diagramRelationTypeLabel, semanticElementLabel } from "../lib/diagram-presentation";

export function DiagramView({
  type,
  modelId,
  highlightedElement,
  highlightedRelationshipId,
  initialSection,
}: {
  type: DiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  initialSection?: ContextDiagramSection;
}) {
  return (
    <DiagramDetailView
      stage="requirements"
      type={type}
      modelId={modelId}
      highlightedElement={highlightedElement}
      highlightedRelationshipId={highlightedRelationshipId}
      initialSection={initialSection}
    />
  );
}

export function DesignDiagramView({
  type,
  modelId,
  highlightedElement,
  highlightedRelationshipId,
  initialSection,
}: {
  type: DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  initialSection?: ContextDiagramSection;
}) {
  return (
    <DiagramDetailView
      stage="design"
      type={type}
      modelId={modelId}
      highlightedElement={highlightedElement}
      highlightedRelationshipId={highlightedRelationshipId}
      initialSection={initialSection}
    />
  );
}

export type ContextDiagramSection = "diagram" | "elements" | "relations";

type ContextDiagramData = {
  model: ContextDiagramSpec | null;
  plantUmlSource: string;
  svgMarkup: string;
  stale: boolean;
  rules: Array<{ id: string; text: string }>;
  saveStatus: "idle" | "saving" | "saved" | "error";
  statusMessage?: string | null;
  errorMessage?: string | null;
  headerAction?: ReactNode;
  onSave: (model: ContextDiagramSpec) => Promise<void>;
};

export function ContextDiagramView({
  data,
  section = "diagram",
  highlightedElement,
  highlightedRelationshipId,
}: {
  data: ContextDiagramData;
  section?: ContextDiagramSection;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
}) {
  return (
    <DiagramDetailView
      stage="context"
      type="context"
      contextData={data}
      initialSection={section}
      highlightedElement={highlightedElement}
      highlightedRelationshipId={highlightedRelationshipId}
    />
  );
}

function DiagramDetailView({
  stage,
  type,
  modelId,
  highlightedElement,
  highlightedRelationshipId,
  contextData,
  initialSection = "diagram",
}: {
  stage: "requirements" | "design" | "context";
  type: DiagramType | DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  contextData?: ContextDiagramData;
  initialSection?: ContextDiagramSection;
}) {
  const { t } = useTranslation();
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
  const isContext = stage === "context";
  const isDesign = stage === "design";
  const saveContextModel = contextData?.onSave;
  const requirementType = type as DiagramType;
  const designType = type as DesignDiagramType;
  const isStale = isContext
    ? Boolean(contextData?.stale)
    : !isDesign && staleDiagrams.includes(requirementType);
  const meta = isDesign ? DESIGN_DIAGRAM_META[designType] : DIAGRAM_META[requirementType];
  const diagramKindKey = String(type);
  const metaLabel = t(`diagrams.kinds.${diagramKindKey}.label`, { defaultValue: meta.label });
  const metaDescription = t(`diagrams.kinds.${diagramKindKey}.description`, {
    defaultValue: meta.description,
  });
  const designModel = isDesign
    ? modelId
      ? designModels[modelId]
      : Object.values(designModels).find((entry) => entry.diagramKind === designType)
    : undefined;
  const designArtifactId = designModel ? getDesignModelId(designModel) : modelId ?? designType;
  const requirementModel = !isDesign && !isContext
    ? modelId
      ? models[modelId]
      : models[requirementType]
    : undefined;
  const requirementArtifactId = requirementModel
    ? getRequirementModelId(requirementModel)
    : modelId ?? requirementType;
  const source = isContext
    ? contextData?.plantUmlSource ?? ""
    : isDesign
      ? designPlantUml[designArtifactId] ?? ""
      : plantUml[requirementArtifactId] ?? plantUml[requirementType] ?? "";
  const model = isContext ? contextData?.model : isDesign ? designModel : requirementModel;
  const svgMarkup = isContext
    ? contextData?.svgMarkup ?? ""
    : isDesign
      ? designSvgArtifacts[designArtifactId]?.svg ?? ""
      : svgArtifacts[requirementArtifactId]?.svg ?? svgArtifacts[requirementType]?.svg ?? "";
  const normalizedSvgMarkup = useMemo(() => sanitizeSvgMarkup(svgMarkup), [svgMarkup]);
  const diagramError = isContext
    ? null
    : isDesign
    ? designDiagramErrors[designType] ?? null
    : diagramErrors[requirementArtifactId] ?? diagramErrors[requirementType] ?? null;
  const statusKey = isContext ? "context" : isDesign ? designArtifactId : requirementArtifactId;
  const editStatus = isContext ? undefined : manualModelEditStatus[statusKey];
  const compactViewport = useCompactViewport();
  const [activeTab, setActiveTab] = useState<"diagram" | "elements" | "relations" | "edit">(
    "diagram",
  );
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
  const relationshipRefs = useRef(new Map<string, HTMLDivElement>());
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
  useEffect(() => {
    setActiveTab(
      highlightedRelationshipId
        ? "relations"
        : compactViewport
          ? initialSection
          : "diagram",
    );
  }, [compactViewport, highlightedRelationshipId, initialSection]);
  const setDraftField = useCallback((key: string, value: unknown) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);
  const commitDraftAndRerender = useCallback(async (nextDraft: Record<string, unknown>) => {
    setSaving(true);
    setSaveStatus("saving");
    try {
      // Model edits cross the UI -> workspace -> renderer contract here; parsing
      // removes editor-only metadata before it can affect downstream freshness.
      const parsedDraft = isContext
        ? contextDiagramSpecSchema.safeParse(nextDraft)
        : isDesign
          ? designDiagramModelSpecSchema.safeParse(nextDraft)
          : diagramModelSpecSchema.safeParse(nextDraft);
      const canonicalDraft = (
        parsedDraft.success ? parsedDraft.data : nextDraft
      ) as unknown as Record<string, unknown>;
      setDraft(canonicalDraft);
      if (isContext) {
        if (!saveContextModel) {
          throw new Error("上下文模型校验失败");
        }
        await saveContextModel(contextDiagramSpecSchema.parse(canonicalDraft));
      } else if (isDesign) {
        await saveDesignModelEdit(designArtifactId, canonicalDraft as never);
        await rerenderDesignModel(designArtifactId, canonicalDraft as never, {
          toastMessage: null,
        });
      } else {
        await saveRequirementModelEdit(requirementType, canonicalDraft as never);
        await rerenderRequirementModel(requirementType, canonicalDraft as never, {
          toastMessage: null,
        });
      }
      persistedDraftFingerprintRef.current = draftFingerprint(canonicalDraft);
      setSaveStatus("saved");
      toast.message(t("diagrams.detail.savedToast"));
    } catch {
      setSaveStatus("error");
      toast.error(t("diagrams.detail.saveFailedToast"));
      return;
    } finally {
      setSaving(false);
    }
  }, [
    designArtifactId,
    isContext,
    isDesign,
    requirementType,
    rerenderDesignModel,
    rerenderRequirementModel,
    saveDesignModelEdit,
    saveContextModel,
    saveRequirementModelEdit,
    t,
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
  const sourceRules = useMemo(
    () =>
      isContext
        ? contextData?.rules ?? []
        : isDesign || requirementType === "analysis"
          ? []
          : rulesForDiagram(requirementType),
    [contextData?.rules, isContext, isDesign, requirementType, rulesForDiagram],
  );
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
  const highlightedRelationship = highlightedRelationshipId
    ? relationships.find((relationship) => relationship.id === highlightedRelationshipId)
    : undefined;
  useEffect(() => {
    if (!highlightedRelationship || activeTab !== "relations") return;
    const target = relationshipRefs.current.get(highlightedRelationship.id);
    if (!target) return;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    target.scrollIntoView?.({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    target.focus({ preventScroll: true });
  }, [activeTab, highlightedRelationship]);
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
  const modelTitle = getModelText(draft ?? model, "title", metaLabel);
  const modelSummary = getModelText(draft ?? model, "summary", metaDescription);
  const designSourceText = isDesign
    ? designSourceLabel(designType, draft ?? (designModel ? cloneDraftModel(designModel) : null))
    : null;
  const requirementSourceText = !isDesign && !isContext
    ? requirementSourceLabel(
        requirementType,
        draft ?? (model ? cloneDraftModel(model) : null),
        sourceRules,
      )
    : null;
  const contextSourceText = isContext && sourceRules.length > 0
    ? t("diagrams.detail.contextSource", { rules: sourceRules.map((rule) => rule.id).join(t("generation.dialog.listSeparator")) })
    : null;
  const sourceText = contextSourceText ?? designSourceText ?? requirementSourceText;
  const effectiveSaveStatus = isContext ? contextData?.saveStatus ?? saveStatus : saveStatus;
  const saveStatusLabel =
    effectiveSaveStatus === "saving"
      ? t("diagrams.detail.saveUpdating")
      : effectiveSaveStatus === "saved"
        ? t("diagrams.detail.saveSaved")
        : t("diagrams.detail.saveFailed");
  const editWarningText = editStatus?.warning
    ? t("diagrams.detail.editWarningMapped")
    : t("diagrams.detail.editWarningDefault");
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
    if (isContext) {
      setActiveTab("diagram");
    } else if (isDesign) {
      openDesignDiagram(
        designType,
        designArtifactId,
        getModelText(model, "title", metaLabel),
      );
    } else {
      openDiagram(
        requirementType,
        requirementArtifactId,
        getModelText(model, "title", metaLabel),
      );
    }
  }, [
    designArtifactId,
    designType,
    isContext,
    isDesign,
    localHighlightedElement,
    metaLabel,
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
          <div className="mx-auto flex w-[calc(100%-2rem)] max-w-[1920px] flex-col gap-4 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
            {isContext && contextData?.headerAction ? (
              <div className="flex justify-end">{contextData.headerAction}</div>
            ) : null}
            {isContext && contextData?.errorMessage ? (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {contextData.errorMessage}
              </div>
            ) : null}
            {diagramError ? (
              <div className="rounded-xl border border-destructive/40 bg-card px-5 py-8 text-sm shadow-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {t("diagrams.detail.generatedFailed", { label: metaLabel })}
                </div>
                <div className="mt-2 leading-relaxed text-foreground">
                  {diagramError.error.message}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-sm">
                {t("diagrams.detail.notGenerated", {
                  stage: isContext
                    ? "可行性分析"
                    : t(`diagrams.stage.${isDesign ? "design" : "requirements"}`),
                })}
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
              <span>{t("diagrams.detail.stale")}</span>
            </div>
          )}

          {isContext && contextData?.errorMessage ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{contextData.errorMessage}</span>
            </div>
          ) : null}

          {isContext && contextData?.statusMessage ? (
            <div aria-live="polite" className="rounded-xl border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
              {contextData.statusMessage}
            </div>
          ) : null}

          <DiagramDetailHeader
            draft={draft}
            modelTitle={modelTitle}
            modelSummary={modelSummary}
            sourceText={sourceText}
            saveStatus={effectiveSaveStatus}
            saveStatusLabel={saveStatusLabel}
            compactViewport={compactViewport}
            itemCount={items.length}
            relationshipCount={relationships.length}
            groupCount={groups.length}
            actions={isContext ? contextData?.headerAction : undefined}
            onChangeTitle={(value) => setDraftField("title", value)}
            onChangeSummary={(value) => setDraftField("summary", value)}
          />

          <Tabs
            key={`${stage}:${type}:${highlighted ? highlighted.id : "all"}`}
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
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
                  {t("diagrams.tabs.diagram")}
                </TabsTrigger>
                {compactViewport || highlightedRelationshipId ? (
                  <>
                    <TabsTrigger
                      value="elements"
                      className={cn(
                        "relative flex-none rounded-none border-0 bg-transparent px-2 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block sm:px-0 sm:after:inset-x-0",
                        mobileTouchTargetClass,
                      )}
                    >
                      {t("diagrams.tabs.elements")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="relations"
                      className={cn(
                        "relative flex-none rounded-none border-0 bg-transparent px-2 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block sm:px-0 sm:after:inset-x-0",
                        mobileTouchTargetClass,
                      )}
                    >
                      {t("diagrams.tabs.relations")}
                    </TabsTrigger>
                    {draft ? (
                      <TabsTrigger
                        value="edit"
                        className={cn(
                          "relative flex-none rounded-none border-0 bg-transparent px-2 text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 after:bg-primary data-[state=active]:after:block sm:px-0 sm:after:inset-x-0",
                          mobileTouchTargetClass,
                        )}
                      >
                        {t("diagrams.tabs.edit")}
                      </TabsTrigger>
                    ) : null}
                  </>
                ) : null}
              </TabsList>
            </div>

            <TabsContent value="diagram" className="m-0 p-0">
              <div className="p-3 sm:p-5">
                <DiagramPreviewPanel
                  description={metaDescription}
                  stage={isContext ? "feasibility" : stage}
                  type={type}
                  exportFileStem={isContext ? "context" : undefined}
                  plantUmlSource={source}
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
                  diagramLabel={metaLabel}
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
                    focusSection={isContext && !compactViewport && initialSection !== "diagram"
                      ? initialSection === "relations" ? "relationships" : "elements"
                      : null}
                    sourceRuleOptions={isContext ? sourceRules.map((rule) => ({ id: rule.id, label: rule.text })) : []}
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
                  sourceRuleOptions={isContext ? sourceRules.map((rule) => ({ id: rule.id, label: rule.text })) : []}
                />
              </div>
            </TabsContent>
            ) : null}

            <TabsContent value="elements" className="m-0 min-h-0 flex-1 p-3 data-[state=active]:flex data-[state=active]:flex-col sm:p-5">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background shadow-sm">
                <div className="border-b border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("diagrams.detail.elementsTitle")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("diagrams.detail.elementsDescription")}
                    </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2"
                        aria-pressed="true"
                        aria-label={t("diagrams.detail.gridView")}
                      >
                        <LayoutGrid className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground"
                        aria-pressed="false"
                        aria-label={t("diagrams.detail.listView")}
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
                          placeholder={t("diagrams.detail.searchPlaceholder")}
                        />
                      </label>
                      <div
                        className="flex flex-wrap gap-2"
                        aria-label={t("diagrams.detail.kindFilter")}
                        role="group"
                      >
                        <Button
                          type="button"
                          variant={elementKindFilter === "all" ? "default" : "outline"}
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => setElementKindFilter("all")}
                        >
                          {t("diagrams.detail.allKinds")}
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
                            {semanticElementLabel(group.kind, t)}
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
                    {t("diagrams.detail.noElements")}
                  </div>
                ) : filteredElements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    {t("diagrams.detail.noMatchedElements")}
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
                              .map((field) => `${diagramDetailFieldLabel(field.label, t)}${t("traceability.refSeparator")}${field.value}`)
                              .join(" / ");
                            return (
                              <button
                                type="button"
                                aria-label={el.label}
                                key={`${el.kind}:${el.id}`}
                                onClick={() => {
                                  if (isContext) {
                                    selectElementInDiagram(el);
                                    setActiveTab("diagram");
                                    return;
                                  }
                                  if (isDesign) {
                                    openDesignDiagramElement(
                                      designType,
                                      el.kind,
                                      el.id,
                                      el.label,
                                      designArtifactId,
                                    );
                                    return;
                                  }
                                  openDiagramElement(
                                    requirementType,
                                    el.kind,
                                    el.id,
                                    el.label,
                                    requirementArtifactId,
                                  );
                                }}
                                className={cn(
                                  "min-h-[8.5rem] overflow-hidden rounded-lg border p-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-card text-foreground hover:bg-accent",
                                )}
                              >
                                <span className="flex items-start justify-between gap-3">
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                                    {semanticElementLabel(el.kind, t, true)}
                                  </span>
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {semanticElementLabel(el.kind, t)}
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
                                    {t("diagrams.detail.noDescription")}
                                  </span>
                                )}
                                <span className="mt-2 block border-t border-border pt-2">
                                  <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                    <span className="min-w-0 line-clamp-1 break-words">
                                      {el.fields.length > 0
                                        ? fieldSummary
                                        : t("diagrams.detail.noFields")}
                                    </span>
                                    <ArrowRight className="size-3.5 shrink-0" />
                                  </span>
                                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                                    {t("diagrams.detail.fieldCount", { count: el.fields.length })}
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
                    <h3 className="text-sm font-semibold text-foreground">{t("diagrams.detail.relationsTitle")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("diagrams.detail.relationsDescription")}
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
                      {t("diagrams.detail.focusRelationsOnly")}
                    </label>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                {relationships.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    {t("diagrams.detail.noRelations")}
                  </div>
                ) : visibleRelationships.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                    {t("diagrams.detail.noFocusRelations")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {visibleRelationships.map((relation, index) => {
                      const displayLabel = getRelationDisplayLabel(relation, itemsById);
                      return (
                      <div
                        key={relation.id}
                        role="article"
                        aria-label={displayLabel}
                        ref={(element) => {
                          if (element) {
                            relationshipRefs.current.set(relation.id, element);
                          } else {
                            relationshipRefs.current.delete(relation.id);
                          }
                        }}
                        tabIndex={relation.id === highlightedRelationship?.id ? -1 : undefined}
                        aria-current={
                          relation.id === highlightedRelationship?.id ? "true" : undefined
                        }
                        className={cn(
                          "overflow-hidden rounded-xl border border-border border-l-4 bg-card shadow-sm",
                          getRelationAccentClass(index),
                          relation.id === highlightedRelationship?.id &&
                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2 p-4 pb-3">
                          <Badge variant="secondary" className="font-mono">
                            {diagramRelationTypeLabel(relation.typeLabel, t)}
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
                                <div className="text-muted-foreground">{diagramDetailFieldLabel(field.label, t)}</div>
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
