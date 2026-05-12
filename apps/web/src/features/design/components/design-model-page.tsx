import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Checkbox } from "../../../shared/ui/checkbox";
import { ModelPicker } from "../../../shared/ui/model-picker";
import { Section } from "../../../shared/ui/section";
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
};

function ensureSequenceDependency(diagrams: DesignDiagramType[]) {
  if (diagrams.some((diagram) => diagram !== "sequence") && !diagrams.includes("sequence")) {
    return ["sequence", ...diagrams] as DesignDiagramType[];
  }
  return diagrams;
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
    runProgress,
    runMessage,
    errorMessage,
    currentRunDiagnostics,
    generateDesignDiagrams,
  } = useWorkspaceSession();
  const { openDesignDiagram } = useWorkspaceShell();
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncSettings = () => {
      setDefaultModel(loadUserSettings().defaultModel);
    };

    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => {
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    };
  }, []);

  useEffect(() => {
    if (showDiagnostics) {
      streamEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [showDiagnostics, currentRunDiagnostics.streamText]);

  const sourceStatus = useMemo(
    () => ({
      usecase: Boolean(models.usecase),
      activity: Boolean(models.activity),
      class: Boolean(models.class),
      deployment: Boolean(models.deployment),
    }),
    [models],
  );

  const effectiveSelected = ensureSequenceDependency(selectedDesignDiagrams);
  const canGenerate =
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
    setSelectedDesignDiagrams(
      checked
        ? Array.from(new Set([...selectedDesignDiagrams, diagram]))
        : selectedDesignDiagrams.filter((item) => item !== diagram),
    );
  };

  const runGenerate = () => {
    void generateDesignDiagrams(effectiveSelected);
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <Section
        title="设计模型"
        badge={
          <Badge variant="secondary" className="font-mono">
            {effectiveSelected.length}/{DESIGN_DIAGRAM_ORDER.length}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <ModelPicker
              value={defaultModel}
              onValueChange={updateModel}
              align="end"
              triggerClassName="bg-card"
            />
            <Button
              size="sm"
              className="h-8"
              onClick={runGenerate}
              disabled={!canGenerate || generating}
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              生成设计模型
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
          {DESIGN_DIAGRAM_ORDER.map((diagram) => {
            const meta = DESIGN_DIAGRAM_META[diagram];
            const checked = effectiveSelected.includes(diagram);
            const source = DESIGN_SOURCE_MAP[diagram];
            const hasSource = source === "sequence" || sourceStatus[source];
            const generated = generatedDesignDiagrams.includes(diagram);
            const error = designDiagramErrors[diagram];
            return (
              <div
                key={diagram}
                className={cn(
                  "flex flex-col gap-2 bg-card px-3 py-2.5 transition-colors",
                  checked && "bg-primary/10",
                  !hasSource && "opacity-60",
                )}
              >
                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => toggleDiagram(diagram, !!value)}
                    className="mt-0.5"
                  />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{meta.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {meta.english}
                      </span>
                      {generated && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            openDesignDiagram(diagram);
                          }}
                          className="ml-auto text-primary hover:underline"
                        >
                          查看
                        </button>
                      )}
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {meta.description}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      来源：
                      {diagram === "sequence"
                        ? DIAGRAM_META.usecase.label
                        : `${DIAGRAM_META[source as DiagramType].label} + 顺序图`}
                    </span>
                  </div>
                </label>
                {!hasSource && (
                  <div className="flex items-center gap-1.5 pl-6 text-[11px] text-destructive">
                    <AlertTriangle className="size-3.5" />
                    缺少需求阶段{DIAGRAM_META[source as DiagramType].label}
                  </div>
                )}
                {error && (
                  <div className="pl-6 text-[11px] leading-relaxed text-destructive">
                    {error.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>选择界面关系、领域概念模型或部署模型时，系统会自动补齐顺序图依赖。</span>
          <span className="ml-auto">
            当前模型：{getModelDisplayName(defaultModel).triggerLabel}
          </span>
        </div>
      </Section>

      <Section title="需求阶段来源">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {(["usecase", "activity", "class", "deployment"] as DiagramType[]).map(
            (diagram) => (
              <div
                key={diagram}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
              >
                {sourceStatus[diagram] ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <AlertTriangle className="size-4 text-muted-foreground" />
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{DIAGRAM_META[diagram].label}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {sourceStatus[diagram] ? "可用" : "未生成"}
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          设计生成会同时使用原始需求文本、{rules.length} 条需求规则和上方需求阶段模型。
        </div>
      </Section>

      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex w-[min(560px,92vw)] flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="size-6 animate-spin text-primary" />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium">正在生成设计模型</span>
                <span className="text-xs text-muted-foreground">
                  {runMessage ?? "等待服务返回进度"}
                </span>
              </div>
              <Badge variant="secondary" className="font-mono">
                {runProgress}%
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 self-start px-2 text-xs"
              onClick={() => setShowDiagnostics((value) => !value)}
            >
              {showDiagnostics ? "收起详情" : "查看详情"}
            </Button>
            {showDiagnostics && (
              <div className="max-h-56 overflow-auto rounded-md border border-border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
                {currentRunDiagnostics.streamText || "等待模型输出..."}
                <div ref={streamEndRef} />
              </div>
            )}
          </div>
        </div>
      )}

      {errorMessage && !generating && (
        <div className="mx-3 mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
