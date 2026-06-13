// Renders design-stage model generation controls, selection state, and requirement-to-design trace summaries.
import { useEffect, useMemo, useState } from "react";
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
import { cn } from "../../../shared/ui/utils";
import {
  DESIGN_DIAGRAM_META,
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_META,
  getDesignModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { getModelDisplayName } from "../../../shared/lib/model-catalog";
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

const DESIGN_SOURCE_MAP: Record<DesignDiagramType, DiagramType | "sequence"> = {
  sequence: "usecase",
  activity: "prototype",
  class: "class",
  deployment: "deployment",
  table: "class",
};

const DESIGN_SOURCE_COPY: Record<DesignDiagramType, string> = {
  sequence: "需求阶段用例模型事件流 + 需求分析模型",
  activity: "需求阶段原型界面关系 + 设计阶段用例实现设计",
  class: "需求阶段领域概念模型 + 设计阶段用例实现设计",
  deployment: "需求阶段部署需求模型 + 设计阶段用例实现设计",
  table: "设计阶段设计类图 + 设计阶段用例实现设计",
};

const SEQUENCE_COVERAGE_BLOCK_REASON =
  "已有用例实现设计覆盖不足，请先手动更新用例实现设计";

const DESIGN_DIAGRAM_ICON = {
  sequence: GitBranch,
  activity: Activity,
  class: Box,
  deployment: Server,
  table: Database,
} satisfies Record<DesignDiagramType, typeof GitBranch>;

const REQUIREMENT_SOURCE_ICON = {
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
  _diagram: DesignDiagramType,
  sourceStatus: RequirementSourceDetails,
) {
  if (sourceStatus.usecase && sourceStatus.useCaseCount === 0) {
    return "需求阶段用例模型没有可生成用例实现设计的用例";
  }

  return null;
}

function useCasesFromRequirementModel(models: ReturnType<typeof useWorkspaceSession>["models"]) {
  const model = models.usecase;
  return model && "useCases" in model && Array.isArray(model.useCases)
    ? model.useCases
    : [];
}

function sequenceModelsCoverUseCases(
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  models: ReturnType<typeof useWorkspaceSession>["models"],
) {
  const useCases = useCasesFromRequirementModel(models);
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

function requirementSourcesForDesign(diagram: DesignDiagramType) {
  const sources: DiagramType[] = ["usecase"];
  if (diagram === "sequence") sources.push("analysis");
  const directSource = DESIGN_SOURCE_MAP[diagram];
  if (directSource !== "sequence") sources.push(directSource);
  return Array.from(new Set(sources));
}

function autoFillRequirementLabelsForDesign(
  diagram: DesignDiagramType,
  sourceStatus: RequirementSourceDetails,
) {
  const labels: string[] = [];
  if (!sourceStatus.usecase) {
    labels.push(DIAGRAM_META.usecase.label);
  }
  if (diagram === "sequence" && !sourceStatus.analysis) {
    labels.push(DIAGRAM_META.analysis.label);
  }
  const source = DESIGN_SOURCE_MAP[diagram];
  if (source !== "sequence" && !sourceStatus[source]) {
    labels.push(DIAGRAM_META[source].label);
  }
  return Array.from(new Set(labels));
}

function stageRepairCopy(text: string) {
  return text.replace(/\bAI\b\s*/gu, "系统");
}

export function DesignModelPage() {
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
      (["usecase", "class", "activity", "deployment", "prototype", "analysis"] as DiagramType[])
        .filter((diagram) => sourceStatus[diagram] && staleDiagrams.includes(diagram))
        .map((diagram) => DIAGRAM_META[diagram].label),
    [sourceStatus, staleDiagrams],
  );
  const missingRequirementSourceLabels = useMemo(
    () =>
      (["usecase", "class", "activity", "deployment", "prototype", "analysis"] as DiagramType[])
        .filter((diagram) => !sourceStatus[diagram])
        .map((diagram) => DIAGRAM_META[diagram].label),
    [sourceStatus],
  );
  const requirementDependencyGuideText =
    staleRequirementSourceLabels.length > 0
      ? `设计生成依赖最新的需求模型。请先回到「需求阶段」更新${staleRequirementSourceLabels.join("、")}。`
      : missingRequirementSourceLabels.length > 0
        ? `设计生成依赖完整的需求模型。请先前往「需求阶段」完成${missingRequirementSourceLabels.join("、")}。`
        : "设计生成会使用已完成的需求模型和设计阶段上游模型。";

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
      diagram !== "sequence" &&
      Object.values(designModels).some((model) => model.diagramKind === "sequence") &&
      !sequenceModelsCoverUseCases(designModels, models)
    ) {
      return SEQUENCE_COVERAGE_BLOCK_REASON;
    }
    if (
      diagram === "table" &&
      Object.values(designModels).some((model) => model.diagramKind === "class") &&
      normalizeDesignInputFingerprint(
        currentDesignClassFingerprint(designModels, designInputFingerprints),
      ) !== currentDesignInputFingerprint
    ) {
      return "设计类图已存在但基于旧需求，请先手动更新设计类图";
    }
    return null;
  };
  const selectedDesignBlockReason =
    effectiveSelected.map(getDesignTargetBlockReason).find(Boolean) ?? null;
  const existingSequenceCoverageBlockReason =
    sourceStatus.usecase &&
    sourceStatus.useCaseCount > 0 &&
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
            "设计元素缺少完整上游来源，系统自动补充设计模型到需求模型的追踪关系。",
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
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-normal text-foreground lg:text-3xl">
                  设计模型
                </h2>
                <Badge variant="secondary" className="rounded-full font-mono">
                  {effectiveSelected.length}/{DESIGN_DIAGRAM_ORDER.length}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                基于需求自动生成或手动构建系统架构模型
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                生成设计模型
              </Button>
            </div>
          </header>

          {visibleGenerationBlockReason && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <span>{visibleGenerationBlockReason}</span>
              {showSequenceCoverageAction && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-destructive/30 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={openFirstSequenceDesign}
                >
                  查看用例实现设计
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
                  回到需求页更新
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
            <main className="flex min-w-0 flex-col gap-4">
              <section>
                <MobileCompactGrid className="grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
                  {DESIGN_DIAGRAM_ORDER.map((diagram) => {
                    const meta = DESIGN_DIAGRAM_META[diagram];
                    const checked = effectiveSelected.includes(diagram);
                    const source = DESIGN_SOURCE_MAP[diagram];
                    const sourceLabel =
                      DESIGN_SOURCE_COPY[diagram] ??
                      (diagram === "sequence"
                        ? `需求阶段${DIAGRAM_META.usecase.label}`
                        : `需求阶段${DIAGRAM_META[source as DiagramType].label}`);
                    const blockReason = getDesignDiagramBlockReason(
                      diagram,
                      sourceStatus,
                    ) ?? getDesignTargetBlockReason(diagram);
                    const autoFillLabels = autoFillRequirementLabelsForDesign(
                      diagram,
                      sourceStatus,
                    );
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
                        ? `${viewableModels.length} 个用例实现设计`
                        : "已生成设计模型";
                    const error = designDiagramErrors[diagram];
                    const DiagramIcon = DESIGN_DIAGRAM_ICON[diagram];
                    return (
                      <ModelBentoCard
                        key={diagram}
                        label={meta.label}
                        english={meta.english}
                        description={meta.description}
                        icon={DiagramIcon}
                        selected={checked}
                        disabled={Boolean(blockReason)}
                        countLabel={
                          generated
                            ? viewableModels.length || generatedModels.length
                            : 0
                        }
                        pendingReview={hasPendingAutoReview}
                        ariaLabel={`${checked ? "取消选择" : "选择"}${meta.label}`}
                        checkboxLabel={meta.label}
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
                                  查看
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
                                  <span>{blockReason ?? "等待生成设计模型"}</span>
                                </div>
                                {autoFillLabels.length > 0 && !blockReason && (
                                  <div className="text-warning">
                                    将自动补齐：{autoFillLabels.join("、")}
                                  </div>
                                )}
                                <div className="text-muted-foreground">
                                  来源：{sourceLabel}
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
                    需求阶段来源
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {designRepairRecords.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg bg-card"
                        aria-label={`查看设计模型追踪证明，共 ${designRepairRecords.length} 项`}
                        onClick={() => setTraceabilityDialogOpen(true)}
                      >
                        <Eye className="size-3.5" />
                        追踪证明
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {designRepairRecords.length}项
                        </span>
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      当前模型：{getModelDisplayName(defaultModel).triggerLabel}
                    </span>
                  </div>
                </div>
                <MobileStatusRail className="mt-3">
                  {(["usecase", "class", "activity", "deployment", "prototype", "analysis"] as DiagramType[]).map(
                    (diagram) => {
                      const SourceIcon = REQUIREMENT_SOURCE_ICON[diagram];
                      const stale = sourceStatus[diagram] && staleDiagrams.includes(diagram);
                      return (
                        <MobileStatusPill
                          key={diagram}
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
                            {DIAGRAM_META[diagram].label}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {stale ? "需更新" : sourceStatus[diagram] ? "可用" : "未生成"}
                          </span>
                        </MobileStatusPill>
                      );
                    },
                  )}
                </MobileStatusRail>
                <div className="mt-3 text-xs text-muted-foreground">
                  设计生成会使用需求基线、上方需求阶段模型和已生成的上游设计模型。
                </div>
              </section>

            </main>

            <aside className="flex min-w-0 flex-col gap-3">
              <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    设计模型指南
                  </h3>
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
                    <h4 className="text-xs font-medium text-foreground">
                      1. 明确业务边界
                    </h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      在生成模型前，请确保领域概念模型已清晰定义实体关系与聚合根，避免模块间过度耦合。
                    </p>
                  </div>
                  <div className="rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
                    <h4 className="text-xs font-medium text-foreground">
                      2. 补全前置依赖
                    </h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {requirementDependencyGuideText}
                    </p>
                  </div>
                  <div className="rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
                    <h4 className="text-xs font-medium text-foreground">
                      3. 选择合适的架构风格
                    </h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      根据业务复杂度选择单体、微服务或事件驱动架构，这将直接影响部署设计与类图的生成策略。
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Route className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    参考设计模式
                  </h3>
                </div>
                <MobileRail className="mt-3 md:grid-cols-1">
                  {[
                    "分层架构 (N-Tier)",
                    "微服务架构 (Microservices)",
                    "事件驱动架构 (EDA)",
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
            <DialogTitle>设计模型追踪证明</DialogTitle>
            <DialogDescription>
              查看设计元素到上游需求模型的来源证明；这些内容用于审计和排查，不会改动需求规则或设计模型。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  来源追踪
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  共 {designRepairRecords.length} 项
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-success/35 bg-success/10 text-success"
              >
                追踪已补齐
              </Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {designRepairRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5"
                >
                  <div className="text-muted-foreground">
                    原因：{stageRepairCopy(record.reason)}
                  </div>
                  <div className="mt-1 text-foreground">
                    补齐：{stageRepairCopy(record.repair)}
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-medium",
                      record.status === "追踪已补齐"
                        ? "text-success"
                        : "text-warning",
                    )}
                  >
                    状态：{record.status}
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
                    重新补齐证明
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setTraceabilityDialogOpen(false)}>
              关闭
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
            <DialogTitle>单项证明补齐完成</DialogTitle>
            <DialogDescription>
              已只重新检查当前设计模型追踪证明，没有重新生成全部设计模型。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div>
              <span className="font-medium">阶段：</span>设计模型
            </div>
            <div>
              <span className="font-medium">对象：</span>
              {repairResult?.targetLabel}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRepairResult(null)}>
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
