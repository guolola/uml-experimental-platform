// Renders design-stage model generation controls, selection state, and requirement-to-design trace summaries.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DiagramModelSpec } from "@uml-platform/contracts";
import {
  Activity,
  AlertTriangle,
  Box,
  BookOpen,
  CheckCircle2,
  Database,
  Eye,
  GitBranch,
  Loader2,
  Network,
  Route,
  Server,
  Wand2,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { ModelPicker } from "../../../shared/ui/model-picker";
import { ScaleToFitFrame, ScaledToolbar } from "../../../shared/ui/scale-to-fit";
import { cn } from "../../../shared/ui/utils";
import {
  DESIGN_DIAGRAM_META,
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  getDesignDiagramDescription,
  getDesignDiagramLabel,
  getDiagramLabel,
  getDesignModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { getProviderModelDisplayName } from "../../../shared/lib/provider-model-display";
import {
  designInputFingerprint,
  normalizeDesignInputFingerprint,
} from "../../../shared/lib/fingerprint";
import {
  loadUserSettings,
  patchUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../../../shared/lib/user-settings";
import { useWorkspaceShell } from "../../workspace-shell/state";
import {
  MobileCompactGrid,
  MobileRail,
  MobileRailCard,
  MobileStatusPill,
  MobileStatusRail,
  mobileTouchTargetClass,
} from "../../workspace-shell/components/mobile-density";
import { ModelBentoCard } from "../../workspace-shell/components/model-bento-card";
import { useWorkspaceSession } from "../../workspace-session/state";

type DesignSourceKey = DiagramType | "sequence" | "design-class" | "design-component";

const DESIGN_SOURCE_MAP: Record<DesignDiagramType, DesignSourceKey> = {
  architecture: "function",
  sequence: "usecase",
  activity: "prototype",
  class: "class",
  component: "design-class",
  deployment: "deployment",
  table: "design-class",
};

const SEQUENCE_COVERAGE_BLOCK_REASON =
  "已有用例实现设计覆盖不足，请先手动更新用例实现设计";

function localizeDesignBlockReason(reason: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (reason === "需求阶段用例模型没有可生成用例实现设计的用例") {
    return t("designPage.blocked.noUseCases");
  }
  const staleSource = /^已有需求阶段(.+)基于旧规则，请先回到需求页更新$/u.exec(reason);
  if (staleSource?.[1]) {
    const diagram = DIAGRAM_ORDER.find((item) => DIAGRAM_META[item].label === staleSource[1]);
    return t("designPage.blocked.staleSource", {
      label: diagram ? getDiagramLabel(diagram, t) : staleSource[1],
    });
  }
  if (reason === SEQUENCE_COVERAGE_BLOCK_REASON) return t("designPage.blocked.sequenceCoverage");
  return t("designPage.blocked.requirements");
}

const DESIGN_DIAGRAM_ICON = {
  architecture: BookOpen,
  sequence: GitBranch,
  activity: Activity,
  class: Box,
  component: Network,
  deployment: Server,
  table: Database,
} satisfies Record<DesignDiagramType, typeof GitBranch>;

const REQUIREMENT_SOURCE_ICON = {
  context: Network,
  function: BookOpen,
  usecase: Network,
  activity: Activity,
  class: Box,
  deployment: Server,
  prototype: Eye,
  analysis: GitBranch,
} satisfies Record<DiagramType, typeof Network>;

type RequirementSourceStatus = Record<DiagramType, boolean>;
type RequirementSourceDetails = RequirementSourceStatus & {
  useCaseCount: number;
};

function hasAnalysisModels(models: ReturnType<typeof useWorkspaceSession>["models"]) {
  return Boolean(models.analysis) || Object.keys(models).some((modelId) => modelId.startsWith("analysis:"));
}

function hasPrototypeModels(models: ReturnType<typeof useWorkspaceSession>["models"]) {
  return (
    Boolean(models.prototype) ||
    Object.entries(models).some(
      ([modelId, model]) => modelId.startsWith("proto") || model?.diagramKind === "prototype",
    )
  );
}

function sameDesignDiagramSelection(
  left: DesignDiagramType[],
  right: DesignDiagramType[],
) {
  return left.length === right.length && left.every((diagram, index) => diagram === right[index]);
}

function getDesignDiagramBlockReason(
  diagram: DesignDiagramType,
  sourceStatus: RequirementSourceDetails,
) {
  if (
    (diagram === "sequence" || diagram === "class" || diagram === "activity") &&
    sourceStatus.usecase &&
    sourceStatus.useCaseCount === 0
  ) {
    return "需求阶段用例模型没有可生成用例实现设计的用例";
  }

  return null;
}

function getUseCasesFromRequirementModel(models: ReturnType<typeof useWorkspaceSession>["models"]) {
  const model = models.usecase;
  return model && "useCases" in model && Array.isArray(model.useCases)
    ? model.useCases
    : [];
}

function sequenceModelsCoverUseCases(
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  models: ReturnType<typeof useWorkspaceSession>["models"],
) {
  const useCases = getUseCasesFromRequirementModel(models);
  if (useCases.length === 0) return false;
  const covered = new Set(
    Object.values(designModels)
      .filter((model) => model.diagramKind === "sequence")
      .map((model) =>
        "sourceUseCaseId" in model && typeof model.sourceUseCaseId === "string"
          ? model.sourceUseCaseId
          : null,
      )
      .filter((id): id is string => Boolean(id)),
  );
  return useCases.every((useCase) => covered.has(useCase.id));
}

function currentDesignClassFingerprint(
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  designInputFingerprints: ReturnType<typeof useWorkspaceSession>["designInputFingerprints"],
) {
  const classModel = Object.values(designModels).find(
    (model) => model.diagramKind === "class",
  );
  return classModel
    ? designInputFingerprints[getDesignModelId(classModel)] ?? designInputFingerprints.class
    : designInputFingerprints.class;
}

function currentDesignComponentFingerprint(
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  designInputFingerprints: ReturnType<typeof useWorkspaceSession>["designInputFingerprints"],
) {
  const componentModel = Object.values(designModels).find(
    (model) => model.diagramKind === "component",
  );
  return componentModel
    ? designInputFingerprints[getDesignModelId(componentModel)] ??
        designInputFingerprints.component
    : designInputFingerprints.component;
}

function designDiagramRequiresSequenceCoverage(diagram: DesignDiagramType) {
  return diagram === "class" || diagram === "activity";
}

function requirementSourcesForDesign(diagram: DesignDiagramType) {
  const sources: DiagramType[] = [];
  if (diagram === "sequence") sources.push("analysis");
  const directSource = DESIGN_SOURCE_MAP[diagram];
  if (
    directSource !== "sequence" &&
    directSource !== "design-class" &&
    directSource !== "design-component"
  ) {
    sources.push(directSource);
  }
  return Array.from(new Set(sources));
}

function autoFillRequirementLabelsForDesign(
  diagram: DesignDiagramType,
  sourceStatus: RequirementSourceDetails,
) {
  const labels: string[] = [];
  for (const source of requirementSourcesForDesign(diagram)) {
    if (!sourceStatus[source]) labels.push(DIAGRAM_META[source].label);
  }
  if (diagram === "sequence" && !sourceStatus.analysis) {
    labels.push(DIAGRAM_META.analysis.label);
  }
  return Array.from(new Set(labels));
}

function stageRepairCopy(text: string) {
  return text.replace(/\bAI\b\s*/gu, "系统");
}

export function DesignModelPage() {
  const { t } = useTranslation();
  const {
    models,
    selectedDesignDiagrams,
    setSelectedDesignDiagrams,
    designModels,
    designSvgArtifacts,
    designModelTraceability,
    requirementModelTraceability,
    autoGeneratedUpstreamReviews,
    designDiagramErrors,
    designInputFingerprints,
    staleDiagrams,
    requirementTraceabilityStale,
    generating,
    generateDesignDiagrams,
    designGenerationBlockedReason,
  } = useWorkspaceSession();
  const { openDesignDiagram, openRequirementsText } = useWorkspaceShell();
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const [repairResult, setRepairResult] = useState<{ targetLabel: string } | null>(
    null,
  );
  const [traceabilityDialogOpen, setTraceabilityDialogOpen] = useState(false);

  useEffect(() => {
    const syncSettings = () => {
      setDefaultModel(loadUserSettings().defaultModel);
    };

    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => {
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    };
  }, []);

  const sourceStatus = useMemo(
    () => {
      const useCases =
        models.usecase && "useCases" in models.usecase && Array.isArray(models.usecase.useCases)
          ? models.usecase.useCases
          : [];
      return {
        context: Boolean(models.context),
        function: Boolean(models.function),
        usecase: Boolean(models.usecase),
        activity: Boolean(models.activity),
        class: Boolean(models.class),
        deployment: Boolean(models.deployment),
        prototype: hasPrototypeModels(models),
        analysis: hasAnalysisModels(models),
        useCaseCount: useCases.length,
      };
    },
    [models],
  );
  const staleRequirementSourceLabels = useMemo(
    () =>
      (["function", "usecase", "class", "activity", "prototype", "deployment", "analysis"] as DiagramType[])
        .filter((diagram) => sourceStatus[diagram] && staleDiagrams.includes(diagram))
        .map((diagram) => getDiagramLabel(diagram, t)),
    [sourceStatus, staleDiagrams, t],
  );
  const missingRequirementSourceLabels = useMemo(
    () =>
      (["function", "usecase", "class", "activity", "prototype", "deployment", "analysis"] as DiagramType[])
        .filter((diagram) => !sourceStatus[diagram])
        .map((diagram) => getDiagramLabel(diagram, t)),
    [sourceStatus, t],
  );
  const requirementDependencyGuideText =
    staleRequirementSourceLabels.length > 0
      ? t("designPage.guide.staleDependencies", { labels: staleRequirementSourceLabels.join(t("traceability.refSeparator")) })
      : missingRequirementSourceLabels.length > 0
        ? t("designPage.guide.missingDependencies", { labels: missingRequirementSourceLabels.join(t("traceability.refSeparator")) })
        : t("designPage.guide.readyDependencies");

  const selectableDesignDiagramSet = useMemo(
    () =>
      new Set(
        DESIGN_DIAGRAM_ORDER.filter(
          (diagram) => !getDesignDiagramBlockReason(diagram, sourceStatus),
        ),
      ),
    [sourceStatus],
  );

  const validSelectedDesignDiagrams = useMemo(
    () =>
      selectedDesignDiagrams.filter((diagram) =>
        selectableDesignDiagramSet.has(diagram),
      ),
    [selectableDesignDiagramSet, selectedDesignDiagrams],
  );

  const effectiveSelected = useMemo(
    () => validSelectedDesignDiagrams,
    [validSelectedDesignDiagrams],
  );

  const currentDesignInputFingerprint = useMemo(
    () =>
      designInputFingerprint(
        Object.values(models).filter(
          (model): model is DiagramModelSpec => Boolean(model),
        ),
        requirementModelTraceability,
      ),
    [models, requirementModelTraceability],
  );

  const getDesignTargetBlockReason = (diagram: DesignDiagramType) => {
    const baseReason = getDesignDiagramBlockReason(diagram, sourceStatus);
    if (baseReason) return baseReason;
    for (const source of requirementSourcesForDesign(diagram)) {
      if (sourceStatus[source] && staleDiagrams.includes(source)) {
        return `已有需求阶段${DIAGRAM_META[source].label}基于旧规则，请先回到需求页更新`;
      }
    }
    if (
      requirementTraceabilityStale &&
      requirementSourcesForDesign(diagram).some((source) => sourceStatus[source])
    ) {
      return "需求模型追踪关系不完整，请先回到需求页处理";
    }
    if (
      designDiagramRequiresSequenceCoverage(diagram) &&
      Object.values(designModels).some((model) => model.diagramKind === "sequence") &&
      !sequenceModelsCoverUseCases(designModels, models)
    ) {
      return SEQUENCE_COVERAGE_BLOCK_REASON;
    }
    if (
      (diagram === "table" || diagram === "component") &&
      Object.values(designModels).some((model) => model.diagramKind === "class") &&
      normalizeDesignInputFingerprint(
        currentDesignClassFingerprint(designModels, designInputFingerprints),
      ) !== currentDesignInputFingerprint
    ) {
      return "设计类图已存在但基于旧需求，请先手动更新设计类图";
    }
    if (
      diagram === "deployment" &&
      Object.values(designModels).some((model) => model.diagramKind === "component") &&
      normalizeDesignInputFingerprint(
        currentDesignComponentFingerprint(
          designModels,
          designInputFingerprints,
        ),
      ) !== currentDesignInputFingerprint
    ) {
      return "组件（构件）关系已存在但基于旧需求，请先手动更新组件（构件）关系";
    }
    return null;
  };
  const selectedDesignBlockReason =
    effectiveSelected.map(getDesignTargetBlockReason).find(Boolean) ?? null;
  const needsExistingSequenceCoverage =
    effectiveSelected.some(designDiagramRequiresSequenceCoverage) ||
    (effectiveSelected.length === 0 &&
      Object.values(designModels).some((model) =>
        designDiagramRequiresSequenceCoverage(model.diagramKind),
      ));
  const existingSequenceCoverageBlockReason =
    sourceStatus.usecase &&
    sourceStatus.useCaseCount > 0 &&
    needsExistingSequenceCoverage &&
    Object.values(designModels).some((model) => model.diagramKind === "sequence") &&
    !sequenceModelsCoverUseCases(designModels, models)
      ? SEQUENCE_COVERAGE_BLOCK_REASON
      : null;
  const visibleGenerationBlockReason =
    designGenerationBlockedReason ??
    selectedDesignBlockReason ??
    existingSequenceCoverageBlockReason;
  const viewableSequenceModel = Object.values(designModels).find(
    (model) =>
      model.diagramKind === "sequence" &&
      Boolean(designSvgArtifacts[getDesignModelId(model)]),
  );
  const isSequenceCoverageBlock =
    visibleGenerationBlockReason === SEQUENCE_COVERAGE_BLOCK_REASON;
  const showSequenceCoverageAction =
    isSequenceCoverageBlock && Boolean(viewableSequenceModel);
  const showRequirementUpdateAction =
    Boolean(visibleGenerationBlockReason) && !isSequenceCoverageBlock;
  const localizedGenerationBlockReason = visibleGenerationBlockReason
    ? localizeDesignBlockReason(visibleGenerationBlockReason, t)
    : null;

  useEffect(() => {
    if (!sameDesignDiagramSelection(selectedDesignDiagrams, validSelectedDesignDiagrams)) {
      setSelectedDesignDiagrams(validSelectedDesignDiagrams);
    }
  }, [selectedDesignDiagrams, setSelectedDesignDiagrams, validSelectedDesignDiagrams]);

  const canGenerate =
    !designGenerationBlockedReason &&
    !selectedDesignBlockReason &&
    effectiveSelected.length > 0;
  const designRepairRecords = useMemo(
    () =>
      designModelTraceability
        .filter(
          (entry) =>
            entry.reviewStatus === "pending" ||
            (entry.mappingSource === "auto-filled-pending-review" &&
              entry.reviewStatus !== "confirmed"),
        )
        .slice(0, 6)
        .map((entry) => ({
          id: `${entry.source.modelId ?? entry.source.diagramKind}:${entry.source.elementId}`,
          reason:
            entry.rationale ??
            "设计元素缺少明确上游来源，系统仅临时补齐到需求模型；请采纳、忽略或稍后处理。",
          repair: `补齐 ${entry.source.label} -> ${entry.targets
            .map((target) => target.label)
            .join("、")} 追踪关系`,
          targetLabel: entry.source.label,
          status: "低置信映射待确认",
        })),
    [designModelTraceability],
  );

  const updateModel = (model: string) => {
    setDefaultModel(model);
    patchUserSettings({ defaultModel: model });
  };

  const toggleDiagram = (diagram: DesignDiagramType, checked: boolean) => {
    if (checked && !selectableDesignDiagramSet.has(diagram)) {
      return;
    }
    setSelectedDesignDiagrams(
      checked
        ? DESIGN_DIAGRAM_ORDER.filter((item) =>
            new Set([...selectedDesignDiagrams, diagram]).has(item),
          ).filter((item) => selectableDesignDiagramSet.has(item))
        : selectedDesignDiagrams.filter((item) => item !== diagram),
    );
  };

  const runGenerate = () => {
    void generateDesignDiagrams(effectiveSelected);
  };

  const openFirstSequenceDesign = () => {
    if (!viewableSequenceModel) return;
    openDesignDiagram(
      "sequence",
      getDesignModelId(viewableSequenceModel),
      viewableSequenceModel.title,
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <div className="w-full p-4 lg:p-5">
        <div className="mx-auto flex w-full max-w-none flex-col gap-5">
          <header>
            <ScaledToolbar
              minWidth={500}
              minReadableScale={0.68}
              contentClassName="w-full items-end justify-between gap-6"
            >
              <div className="min-w-0">
                <div className="flex flex-nowrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-normal text-foreground lg:text-3xl">
                    {t("designPage.title")}
                  </h2>
                  <Badge variant="secondary" className="rounded-full font-mono">
                    {effectiveSelected.length}/{DESIGN_DIAGRAM_ORDER.length}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("designPage.description")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ModelPicker
                  value={defaultModel}
                  onValueChange={updateModel}
                  align="end"
                  triggerClassName="bg-card"
                />
                <Button
                  size="sm"
                  className="h-9 rounded-lg"
                  onClick={runGenerate}
                  disabled={!canGenerate || generating}
                  title={designGenerationBlockedReason ?? selectedDesignBlockReason ?? undefined}
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  {t("designPage.generate")}
                </Button>
              </div>
            </ScaledToolbar>
          </header>

          {visibleGenerationBlockReason && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <span>{localizedGenerationBlockReason}</span>
              {showSequenceCoverageAction && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-destructive/30 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={openFirstSequenceDesign}
                >
                  {t("designPage.viewSequence")}
                </Button>
              )}
              {showRequirementUpdateAction && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-destructive/30 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={openRequirementsText}
                >
                  {t("designPage.backToRequirements")}
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
            <main className="flex min-w-0 flex-col gap-4">
              <section>
                <MobileCompactGrid
                  minWidth={720}
                  variant="model-targets"
                >
                  {DESIGN_DIAGRAM_ORDER.map((diagram) => {
                    const meta = DESIGN_DIAGRAM_META[diagram];
                    const localizedLabel = getDesignDiagramLabel(diagram, t);
                    const localizedDescription = getDesignDiagramDescription(diagram, t);
                    const checked = effectiveSelected.includes(diagram);
                    const sourceLabel = t(`designPage.sources.${diagram}`);
                    const blockReason = getDesignDiagramBlockReason(
                      diagram,
                      sourceStatus,
                    ) ?? getDesignTargetBlockReason(diagram);
                    const autoFillLabels = autoFillRequirementLabelsForDesign(
                      diagram,
                      sourceStatus,
                    );
                    const localizedAutoFillLabels = autoFillLabels.map((label) => {
                      const requirementDiagram = DIAGRAM_ORDER.find(
                        (item) => DIAGRAM_META[item].label === label,
                      );
                      if (requirementDiagram) return getDiagramLabel(requirementDiagram, t);
                      const designDiagram = DESIGN_DIAGRAM_ORDER.find(
                        (item) => DESIGN_DIAGRAM_META[item].label === label,
                      );
                      return designDiagram ? getDesignDiagramLabel(designDiagram, t) : label;
                    });
                    const hasPendingAutoReview = Object.values(
                      autoGeneratedUpstreamReviews,
                    ).some(
                      (review) =>
                        review.status === "pending" &&
                        review.artifactType === "design-model" &&
                        review.artifactId === diagram,
                    );
                    const generatedModels = Object.values(designModels).filter(
                      (model) => model.diagramKind === diagram,
                    );
                    const viewableModels = generatedModels.filter((model) =>
                      Boolean(designSvgArtifacts[getDesignModelId(model)]),
                    );
                    const generated = viewableModels.length > 0;
                    const firstGeneratedModel = viewableModels[0] ?? generatedModels[0];
                    const generatedLabel =
                      diagram === "sequence" && viewableModels.length > 0
                        ? t("designPage.sequenceCount", { count: viewableModels.length })
                        : t("designPage.generated");
                    const error = designDiagramErrors[diagram];
                    const DiagramIcon = DESIGN_DIAGRAM_ICON[diagram];
                    return (
                      <ModelBentoCard
                        key={diagram}
                        label={localizedLabel}
                        english={meta.english}
                        description={localizedDescription}
                        icon={DiagramIcon}
                        selected={checked}
                        disabled={Boolean(blockReason)}
                        countLabel={
                          generated
                            ? viewableModels.length || generatedModels.length
                            : 0
                        }
                        pendingReview={hasPendingAutoReview}
                        ariaLabel={t(checked ? "designPage.deselect" : "designPage.select", { label: localizedLabel })}
                        checkboxLabel={localizedLabel}
                        onSelectedChange={(value) => toggleDiagram(diagram, value)}
                        statusClassName={generated ? "bg-primary/5" : undefined}
                        status={
                          <div className="space-y-1.5">
                            {generated ? (
                              <>
                                <div className="flex items-center gap-1.5 text-primary">
                                  <CheckCircle2 className="size-3.5 shrink-0" />
                                  <span>{generatedLabel}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openDesignDiagram(
                                      diagram,
                                      firstGeneratedModel
                                        ? getDesignModelId(firstGeneratedModel)
                                        : undefined,
                                      firstGeneratedModel?.title,
                                    );
                                  }}
                                  onKeyDown={(event) => event.stopPropagation()}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10",
                                    mobileTouchTargetClass,
                                    "sm:min-h-0",
                                  )}
                                >
                                  <Eye className="size-3" />
                                  {t("designPage.view")}
                                </button>
                              </>
                            ) : (
                              <>
                                <div
                                  className={cn(
                                    "flex items-center gap-1.5",
                                    blockReason
                                      ? "text-destructive"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  <AlertTriangle className="size-3.5 shrink-0" />
                                  <span>{blockReason ? localizeDesignBlockReason(blockReason, t) : t("designPage.waiting")}</span>
                                </div>
                                {autoFillLabels.length > 0 && !blockReason && (
                                  <div className="text-warning">
                                    {t("designPage.autoFill", {
                                      labels: localizedAutoFillLabels.join(t("traceability.refSeparator")),
                                    })}
                                  </div>
                                )}
                                <div className="text-muted-foreground">
                                  {t("designPage.source", { source: sourceLabel })}
                                </div>
                              </>
                            )}
                            {error && (
                              <div className="text-destructive">
                                {error.error.message}
                              </div>
                            )}
                          </div>
                        }
                      />
                    );
                  })}
                </MobileCompactGrid>
              </section>

              <section className="border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("designPage.requirementSources")}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {designRepairRecords.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg bg-card"
                        aria-label={t("designPage.traceAria", { count: designRepairRecords.length })}
                        onClick={() => setTraceabilityDialogOpen(true)}
                      >
                        <Eye className="size-3.5" />
                        {t("designPage.trace")}
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {t("designPage.items", { count: designRepairRecords.length })}
                        </span>
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {t("designPage.currentModel", { model: getProviderModelDisplayName(defaultModel).triggerLabel })}
                    </span>
                  </div>
                </div>
                <MobileStatusRail className="mt-3">
                  {DIAGRAM_ORDER.map(
                    (diagram) => {
                      const SourceIcon = REQUIREMENT_SOURCE_ICON[diagram];
                      const stale = sourceStatus[diagram] && staleDiagrams.includes(diagram);
                      const sourceStateLabel = stale
                        ? t("designPage.sourceStatus.stale")
                        : sourceStatus[diagram]
                          ? t("designPage.sourceStatus.available")
                          : t("designPage.sourceStatus.missing");
                      return (
                        <MobileStatusPill
                          key={diagram}
                          aria-label={`${getDiagramLabel(diagram, t)} ${sourceStateLabel}`}
                          className={cn(
                            stale
                              ? "border-warning/35 bg-warning/10 text-warning"
                              : sourceStatus[diagram]
                              ? "border-border bg-card text-foreground"
                              : "border-border bg-muted/30 text-muted-foreground",
                          )}
                        >
                          {stale ? (
                            <AlertTriangle className="size-3.5 text-warning" />
                          ) : sourceStatus[diagram] ? (
                            <CheckCircle2 className="size-3.5 text-primary" />
                          ) : (
                            <SourceIcon className="size-3.5 text-muted-foreground" />
                          )}
                          <span className="max-w-24 truncate">
                            {getDiagramLabel(diagram, t)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {sourceStateLabel}
                          </span>
                        </MobileStatusPill>
                      );
                    },
                  )}
                </MobileStatusRail>
                <div className="mt-3 text-xs text-muted-foreground">
                  {t("designPage.requirementSourceHint")}
                </div>
              </section>

            </main>

            <aside className="flex min-w-0 flex-col gap-3">
              <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("designPage.guide.title")}
                  </h3>
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
                    <h4 className="text-xs font-medium text-foreground">
                      {t("designPage.guide.boundaryTitle")}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {t("designPage.guide.boundaryDescription")}
                    </p>
                  </div>
                  <div className="rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
                    <h4 className="text-xs font-medium text-foreground">
                      {t("designPage.guide.dependenciesTitle")}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {requirementDependencyGuideText}
                    </p>
                  </div>
                  <div className="rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
                    <h4 className="text-xs font-medium text-foreground">
                      {t("designPage.guide.architectureTitle")}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {t("designPage.guide.architectureDescription")}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Route className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("designPage.patterns.title")}
                  </h3>
                </div>
                <MobileRail className="mt-3 md:grid-cols-1">
                  {[
                    t("designPage.patterns.tiered"),
                    t("designPage.patterns.microservices"),
                    t("designPage.patterns.eda"),
                  ].map((pattern) => (
                    <MobileRailCard key={pattern} className="min-w-[180px]">
                      <div className="flex min-h-11 items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted/50 md:min-h-0 md:border-0 md:bg-transparent md:px-2 md:py-1.5">
                        <span className="truncate">{pattern}</span>
                        <span className="text-muted-foreground">›</span>
                      </div>
                    </MobileRailCard>
                  ))}
                </MobileRail>
              </section>
            </aside>
          </div>
        </div>
      </div>
      <Dialog open={traceabilityDialogOpen} onOpenChange={setTraceabilityDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("designPage.traceDialogs.title")}</DialogTitle>
            <DialogDescription>
              {t("designPage.traceDialogs.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto pr-1">
            <ScaleToFitFrame minWidth={640} contentClassName="w-[640px]">
            <div className="flex flex-nowrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {t("designPage.traceDialogs.evidence")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("designPage.traceDialogs.count", { count: designRepairRecords.length })}
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-success/35 bg-success/10 text-success"
              >
                {t("designPage.traceDialogs.complete")}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {designRepairRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5"
                >
                  <div className="text-muted-foreground">
                    {t("designPage.traceDialogs.reason", { value: stageRepairCopy(record.reason) })}
                  </div>
                  <div className="mt-1 text-foreground">
                    {t("designPage.traceDialogs.repair", { value: stageRepairCopy(record.repair) })}
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-medium",
                      record.status === "追踪已补齐"
                        ? "text-success"
                        : "text-warning",
                    )}
                  >
                    {t("designPage.traceDialogs.status", { value: record.status })}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-8"
                    onClick={() =>
                      setRepairResult({ targetLabel: record.targetLabel })
                    }
                  >
                    {t("designPage.traceDialogs.repairAgain")}
                  </Button>
                </div>
              ))}
            </div>
            </ScaleToFitFrame>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setTraceabilityDialogOpen(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(repairResult)}
        onOpenChange={(open) => {
          if (!open) setRepairResult(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("designPage.traceDialogs.resultTitle")}</DialogTitle>
            <DialogDescription>
              {t("designPage.traceDialogs.resultDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div>
              <span className="font-medium">{t("designPage.traceDialogs.stage")}</span>{t("designPage.title")}
            </div>
            <div>
              <span className="font-medium">{t("designPage.traceDialogs.target")}</span>
              {repairResult?.targetLabel}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRepairResult(null)}>
              {t("designPage.traceDialogs.acknowledge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
