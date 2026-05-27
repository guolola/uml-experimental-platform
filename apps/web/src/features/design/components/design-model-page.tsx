import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
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
import { Checkbox } from "../../../shared/ui/checkbox";
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
  loadUserSettings,
  patchUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../../../shared/lib/user-settings";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useWorkspaceSession } from "../../workspace-session/state";

const DESIGN_SOURCE_MAP: Record<DesignDiagramType, DiagramType | "sequence"> = {
  sequence: "usecase",
  activity: "activity",
  class: "class",
  deployment: "deployment",
  table: "class",
};

const DESIGN_SOURCE_COPY: Record<DesignDiagramType, string> = {
  sequence: "需求阶段用例模型",
  activity: "需求阶段界面关系图 + 设计阶段顺序图",
  class: "需求阶段领域概念模型 + 设计阶段顺序图",
  deployment: "需求阶段部署模型 + 设计阶段顺序图",
  table: "设计阶段设计类图 + 设计阶段顺序图",
};

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
} satisfies Record<DiagramType, typeof Network>;

type RequirementSourceStatus = Record<DiagramType, boolean>;
type RequirementSourceDetails = RequirementSourceStatus & {
  useCaseCount: number;
};

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
  if (!sourceStatus.usecase) {
    return `缺少需求阶段${DIAGRAM_META.usecase.label}`;
  }
  if (diagram === "sequence" && sourceStatus.useCaseCount === 0) {
    return "需求阶段用例模型没有可生成顺序图的用例";
  }

  const source = DESIGN_SOURCE_MAP[diagram];
  if (source !== "sequence" && !sourceStatus[source]) {
    return `缺少需求阶段${DIAGRAM_META[source].label}`;
  }

  return null;
}

function stageRepairCopy(text: string) {
  return text.replace(/\bAI\b\s*/gu, "系统");
}

export function DesignModelPage() {
  const {
    models,
    rules,
    selectedDesignDiagrams,
    setSelectedDesignDiagrams,
    designModels,
    designSvgArtifacts,
    designModelTraceability,
    designDiagramErrors,
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
        useCaseCount: useCases.length,
      };
    },
    [models],
  );

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

  useEffect(() => {
    if (!sameDesignDiagramSelection(selectedDesignDiagrams, validSelectedDesignDiagrams)) {
      setSelectedDesignDiagrams(validSelectedDesignDiagrams);
    }
  }, [selectedDesignDiagrams, setSelectedDesignDiagrams, validSelectedDesignDiagrams]);

  const canGenerate =
    !designGenerationBlockedReason &&
    effectiveSelected.length > 0 &&
    sourceStatus.usecase &&
    effectiveSelected.every((diagram) => {
      const source = DESIGN_SOURCE_MAP[diagram];
      return source === "sequence" || sourceStatus[source];
    });
  const designRepairRecords = useMemo(
    () =>
      designModelTraceability
        .filter(
          (entry) =>
            entry.mappingSource === "auto-filled-pending-review" ||
            entry.mappingSource === "derived-from-endpoints" ||
            Boolean(entry.rationale),
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
          status: entry.reviewStatus === "pending" ? "仍依赖上游待确认" : "追踪已补齐",
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

  const toggleDiagramFromCard = (
    diagram: DesignDiagramType,
    checked: boolean,
  ) => {
    toggleDiagram(diagram, !checked);
  };

  const handleDiagramCardKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    diagram: DesignDiagramType,
    checked: boolean,
    enabled: boolean,
  ) => {
    if (!enabled || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleDiagramFromCard(diagram, checked);
  };

  const runGenerate = () => {
    void generateDesignDiagrams(effectiveSelected);
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
                title={designGenerationBlockedReason ?? undefined}
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

          {designGenerationBlockedReason && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{designGenerationBlockedReason}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-destructive/30 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={openRequirementsText}
              >
                回到需求页更新
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
            <main className="flex min-w-0 flex-col gap-4">
              <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
                      ? `${viewableModels.length} 个用例顺序图`
                      : "已生成设计模型";
                  const error = designDiagramErrors[diagram];
                  const DiagramIcon = DESIGN_DIAGRAM_ICON[diagram];
                  return (
                    <article
                      key={diagram}
                      role="button"
                      tabIndex={blockReason ? -1 : 0}
                      aria-disabled={Boolean(blockReason)}
                      aria-label={`${checked ? "取消选择" : "选择"}${meta.label}`}
                      onClick={() => {
                        if (!blockReason) {
                          toggleDiagramFromCard(diagram, checked);
                        }
                      }}
                      onKeyDown={(event) =>
                        handleDiagramCardKeyDown(
                          event,
                          diagram,
                          checked,
                          !blockReason,
                        )
                      }
                      className={cn(
                        "flex min-h-[168px] flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        checked && "border-primary/35 ring-2 ring-primary/10",
                        blockReason ? "cursor-not-allowed" : "cursor-pointer",
                        blockReason && "border-dashed bg-muted/30 opacity-90 shadow-none",
                        diagram === "table" && "xl:col-span-2",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-3",
                            blockReason && "opacity-80",
                          )}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <DiagramIcon className="size-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-sm font-semibold text-foreground">
                                {meta.label}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {meta.english}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                              {meta.description}
                            </span>
                          </span>
                        </div>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            toggleDiagram(diagram, !!value)
                          }
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          className="mt-1 shrink-0"
                          disabled={Boolean(blockReason)}
                          aria-label={meta.label}
                        />
                      </div>

                      <div
                        className={cn(
                          "flex min-h-[78px] flex-1 flex-col items-center justify-center rounded-lg border px-3 py-3 text-center",
                          blockReason
                            ? "border-dashed border-border bg-muted/40"
                            : "border-border bg-muted/30",
                        )}
                      >
                        {generated ? (
                          <>
                            <CheckCircle2 className="size-5 text-primary" />
                            <div className="mt-2 text-xs text-muted-foreground">
                              {generatedLabel}
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
                              className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                            >
                              <Eye className="size-3" />
                              查看
                            </button>
                          </>
                        ) : (
                          <>
                            <AlertTriangle
                              className={cn(
                                "size-5",
                                blockReason
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            />
                            <div
                              className={cn(
                                "mt-2 text-xs",
                                blockReason
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {blockReason ?? "等待生成设计模型"}
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              来源：{sourceLabel}
                            </div>
                          </>
                        )}
                        {error && (
                          <div className="mt-2 text-[11px] leading-relaxed text-destructive">
                            {error.message}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
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
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {(["usecase", "activity", "class", "deployment"] as DiagramType[]).map(
                    (diagram) => {
                      const SourceIcon = REQUIREMENT_SOURCE_ICON[diagram];
                      return (
                        <div
                          key={diagram}
                          className={cn(
                            "flex min-h-20 flex-col items-center justify-center rounded-lg border p-3 text-center text-sm",
                            sourceStatus[diagram]
                              ? "border-border bg-card shadow-sm"
                              : "border-border bg-muted/30",
                          )}
                        >
                          {sourceStatus[diagram] ? (
                            <CheckCircle2 className="mb-2 size-5 text-primary" />
                          ) : (
                            <SourceIcon className="mb-2 size-5 text-muted-foreground" />
                          )}
                          <span className="max-w-full truncate text-foreground">
                            {DIAGRAM_META[diagram].label}
                          </span>
                          <span className="mt-1 text-[11px] text-muted-foreground">
                            {sourceStatus[diagram] ? "可用" : "未生成"}
                          </span>
                        </div>
                      );
                    },
                  )}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  设计生成会同时使用原始需求文本、{rules.length} 条需求规则和上方需求阶段模型。
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
                      系统自动生成依赖于完整的需求模型。请先前往「需求阶段」完成用例模型与界面关系图的构建。
                    </p>
                  </div>
                  <div className="rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
                    <h4 className="text-xs font-medium text-foreground">
                      3. 选择合适的架构风格
                    </h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      根据业务复杂度选择单体、微服务或事件驱动架构，这将直接影响部署模型与类图的生成策略。
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
                <div className="mt-3 grid gap-1">
                  {[
                    "分层架构 (N-Tier)",
                    "微服务架构 (Microservices)",
                    "事件驱动架构 (EDA)",
                  ].map((pattern) => (
                    <div
                      key={pattern}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
                    >
                      <span>{pattern}</span>
                      <span className="text-muted-foreground">›</span>
                    </div>
                  ))}
                </div>
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
