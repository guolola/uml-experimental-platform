import { useEffect, useMemo, useState } from "react";
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
import { ModelPicker } from "../../../shared/ui/model-picker";
import { cn } from "../../../shared/ui/utils";
import {
  DESIGN_DIAGRAM_META,
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_META,
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

function ensureSequenceDependency(diagrams: DesignDiagramType[]) {
  let next = [...diagrams];
  if (next.some((diagram) => diagram !== "sequence") && !next.includes("sequence")) {
    next = ["sequence", ...next] as DesignDiagramType[];
  }
  if (next.includes("table") && !next.includes("class")) {
    const tableIndex = next.indexOf("table");
    next = [
      ...next.slice(0, tableIndex),
      "class",
      ...next.slice(tableIndex),
    ] as DesignDiagramType[];
  }
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => next.includes(diagram));
}

function sameDesignDiagramSelection(
  left: DesignDiagramType[],
  right: DesignDiagramType[],
) {
  return left.length === right.length && left.every((diagram, index) => diagram === right[index]);
}

function getDesignDiagramBlockReason(
  diagram: DesignDiagramType,
  sourceStatus: RequirementSourceStatus,
) {
  if (!sourceStatus.usecase) {
    return `缺少需求阶段${DIAGRAM_META.usecase.label}`;
  }

  const source = DESIGN_SOURCE_MAP[diagram];
  if (source !== "sequence" && !sourceStatus[source]) {
    return `缺少需求阶段${DIAGRAM_META[source].label}`;
  }

  return null;
}

export function DesignModelPage() {
  const {
    models,
    rules,
    selectedDesignDiagrams,
    setSelectedDesignDiagrams,
    generatedDesignDiagrams,
    designDiagramErrors,
    generating,
    errorMessage,
    generateDesignDiagrams,
    designGenerationBlockedReason,
  } = useWorkspaceSession();
  const { openDesignDiagram } = useWorkspaceShell();
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );

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
    () => ({
      usecase: Boolean(models.usecase),
      activity: Boolean(models.activity),
      class: Boolean(models.class),
      deployment: Boolean(models.deployment),
    }),
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
    () =>
      ensureSequenceDependency(validSelectedDesignDiagrams).filter((diagram) =>
        selectableDesignDiagramSet.has(diagram),
      ),
    [selectableDesignDiagramSet, validSelectedDesignDiagrams],
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
        ? ensureSequenceDependency(Array.from(new Set([...selectedDesignDiagrams, diagram]))).filter(
            (item) => selectableDesignDiagramSet.has(item),
          )
        : selectedDesignDiagrams.filter((item) => item !== diagram),
    );
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
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {designGenerationBlockedReason}
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
                    diagram === "sequence"
                      ? DIAGRAM_META.usecase.label
                      : `${DIAGRAM_META[source as DiagramType].label} + 顺序图`;
                  const blockReason = getDesignDiagramBlockReason(
                    diagram,
                    sourceStatus,
                  );
                  const generated = generatedDesignDiagrams.includes(diagram);
                  const error = designDiagramErrors[diagram];
                  const DiagramIcon = DESIGN_DIAGRAM_ICON[diagram];
                  return (
                    <article
                      key={diagram}
                      className={cn(
                        "flex min-h-[168px] flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors",
                        checked && "border-primary/35 ring-2 ring-primary/10",
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
                              已生成设计模型
                            </div>
                            <button
                              type="button"
                              onClick={() => openDesignDiagram(diagram)}
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
                  <span className="text-xs text-muted-foreground">
                    当前模型：{getModelDisplayName(defaultModel).triggerLabel}
                  </span>
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
                      系统自动生成依赖于完整的需求模型。请先前往「需求阶段」完成用例模型与界面关系的构建。
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

      {errorMessage && !generating && (
        <div className="mx-4 mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-6 lg:mx-8">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
