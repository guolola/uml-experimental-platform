import { useEffect, useMemo, useRef, useState } from "react";
import {
  Wand2,
  Loader2,
  Search,
  AlertTriangle,
  RefreshCw,
  ArrowUp,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { Checkbox } from "../../../shared/ui/checkbox";
import { Input } from "../../../shared/ui/input";
import { Section } from "../../../shared/ui/section";
import { cn } from "../../../shared/ui/utils";
import {
  DIAGRAM_META,
  DIAGRAM_ORDER,
  type DiagramType,
} from "../../../entities/diagram/model";
import { useWorkspaceSession } from "../../workspace-session/state";
import { ModelPicker } from "../../../shared/ui/model-picker";
import { getModelDisplayName } from "../../../shared/lib/model-catalog";
import {
  loadUserSettings,
  patchUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../../../shared/lib/user-settings";

export function TextRequirementView() {
  const {
    requirementText,
    setRequirementText,
    rules,
    selectedDiagrams,
    setSelectedDiagrams,
    generating,
    runStatus,
    runProgress,
    runMessage,
    errorMessage,
    generateRules,
    generateDiagrams,
    isRulesStale,
    staleDiagrams,
    generatedDiagrams,
    currentRunDiagnostics,
    diagramErrors,
  } = useWorkspaceSession();
  const [query, setQuery] = useState("");
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const [showStaleBanner, setShowStaleBanner] = useState(
    () => loadUserSettings().showStaleBanner,
  );
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncSettings = () => {
      const settings = loadUserSettings();
      setDefaultModel(settings.defaultModel);
      setShowStaleBanner(settings.showStaleBanner);
    };

    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => {
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    };
  }, []);

  const runGenerateRules = () => {
    void generateRules();
  };

  const runGenerateDiagrams = (only?: DiagramType[]) => {
    void generateDiagrams(only);
  };

  const updateModel = (model: string) => {
    patchUserSettings({ defaultModel: model });
  };

  const toggleDiagram = (diagram: DiagramType, checked: boolean) => {
    setSelectedDiagrams(
      checked
        ? Array.from(new Set([...selectedDiagrams, diagram]))
        : selectedDiagrams.filter((value) => value !== diagram),
    );
  };

  const filteredRules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rules;
    return rules.filter((rule) => rule.text.toLowerCase().includes(normalizedQuery));
  }, [rules, query]);

  const modelDisplay = useMemo(
    () => getModelDisplayName(defaultModel),
    [defaultModel],
  );

  useEffect(() => {
    if (showDiagnostics) {
      streamEndRef.current?.scrollIntoView?.({ block: "end" });
    }
  }, [
    showDiagnostics,
    currentRunDiagnostics.streamText,
    currentRunDiagnostics.chunkCount,
  ]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {showStaleBanner && isRulesStale && (
        <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          <span>需求文本已修改，下方规则基于旧文本，可能已过时。</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7"
            onClick={runGenerateRules}
            disabled={generating}
          >
            <RefreshCw className="size-3.5" /> 重新生成规则
          </Button>
        </div>
      )}

      {showStaleBanner && staleDiagrams.length > 0 && (
        <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          <span>
            {staleDiagrams.length} 个模型基于旧规则：
            {staleDiagrams.map((diagram) => DIAGRAM_META[diagram].label).join("、")}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7"
            onClick={() => runGenerateDiagrams(staleDiagrams)}
            disabled={generating}
          >
            <RefreshCw className="size-3.5" /> 仅更新过时模型
          </Button>
        </div>
      )}

      <Section title="需求描述">
        <div className="rounded-2xl border border-border bg-card px-4 pb-2.5 pt-3 shadow-xs transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
          <textarea
            id="requirement-text"
            name="requirementText"
            value={requirementText}
            onChange={(event) => setRequirementText(event.target.value)}
            placeholder="用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则"
            className="min-h-20 w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <ModelPicker value={defaultModel} onValueChange={updateModel} />

            {isRulesStale && (
              <span className="ml-1 text-[11px] text-warning">需求已修改</span>
            )}

            <button
              type="button"
              onClick={runGenerateRules}
              disabled={!requirementText.trim() || generating}
              title={isRulesStale ? "更新需求规则" : "生成需求规则"}
              className="ml-auto inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </div>
        </div>
      </Section>

      {errorMessage && runStatus === "failed" && (
        <Section title="运行错误">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        </Section>
      )}

      {rules.length > 0 && (
        <Section title="需求规则">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {filteredRules.length === rules.length
                ? rules.length
                : `${filteredRules.length}/${rules.length}`}
            </Badge>
            <div className="relative ml-auto w-56">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索规则…"
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
          {filteredRules.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
              没有匹配的规则。
            </div>
          ) : (
            <ul className="flex flex-col">
              {filteredRules.map((rule) => (
                <li
                  key={rule.id}
                  id={`rule-${rule.id}`}
                  className="flex items-start gap-2 border-l-2 border-border py-1.5 pl-3 text-sm hover:border-primary/60 hover:bg-accent/30"
                >
                  <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                    {rule.id}
                  </span>
                  <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                    {rule.category}
                  </Badge>
                  <span className="flex-1 leading-relaxed">{rule.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {rules.length > 0 && (
        <Section title="目标模型">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">已选</span>
            <Badge variant="secondary" className="font-mono">
              {selectedDiagrams.length}/{DIAGRAM_ORDER.length}
            </Badge>
            <ModelPicker
              value={defaultModel}
              onValueChange={updateModel}
              align="end"
              triggerClassName="ml-auto bg-card"
            />
            <button
              type="button"
              onClick={() => runGenerateDiagrams()}
              disabled={selectedDiagrams.length === 0 || generating}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              {(() => {
                const toAdd = selectedDiagrams.filter(
                  (diagram) => !generatedDiagrams.includes(diagram),
                ).length;
                const toRemove = generatedDiagrams.filter(
                  (diagram) => !selectedDiagrams.includes(diagram),
                ).length;
                const stale = staleDiagrams.filter((diagram) =>
                  selectedDiagrams.includes(diagram),
                ).length;
                if (generatedDiagrams.length === 0) return "生成模型";
                const parts: string[] = [];
                if (toAdd) parts.push(`新增${toAdd}`);
                if (toRemove) parts.push(`移除${toRemove}`);
                if (stale) parts.push(`更新${stale}`);
                return parts.length ? `应用变更（${parts.join("·")}）` : "重新生成";
              })()}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
            {DIAGRAM_ORDER.map((diagram) => {
              const meta = DIAGRAM_META[diagram];
              const checked = selectedDiagrams.includes(diagram);
              const linkedRules = rules.filter((rule) =>
                rule.relatedDiagrams.includes(diagram),
              );
              return (
                <div
                  key={diagram}
                  className={cn(
                    "flex flex-col gap-2 px-3 py-2.5 transition-colors",
                    checked ? "bg-primary/10" : "bg-card",
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
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                          {linkedRules.length}
                        </span>
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {meta.description}
                      </span>
                    </div>
                  </label>
                  {linkedRules.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-6">
                      {linkedRules.map((rule) => (
                        <button
                          type="button"
                          key={rule.id}
                          title={rule.text}
                          onClick={() => {
                            const element = document.getElementById(`rule-${rule.id}`);
                            if (element) {
                              element.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                              element.classList.add("ring-2", "ring-primary/40");
                              setTimeout(() => {
                                element.classList.remove(
                                  "ring-2",
                                  "ring-primary/40",
                                );
                              }, 1200);
                            }
                          }}
                          className="rounded-sm border border-border bg-card px-1.5 py-0 font-mono text-[10px] uppercase text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                        >
                          {rule.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            勾选不会立即生效；点击「生成模型」后左侧菜单才会更新。
          </p>
        </Section>
      )}

      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex w-[min(420px,90vw)] flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="size-6 animate-spin text-primary" />
              <div className="flex flex-1 flex-col">
                <span className="text-sm">正在调用 {defaultModel}</span>
                <span className="text-[11px] text-muted-foreground">
                  {modelDisplay.vendorLabel} · {modelDisplay.shortLabel}
                </span>
              <span className="text-xs text-muted-foreground">
                  {runMessage ?? "模型正在思考…"}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {Math.round(runProgress)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${runProgress}%` }}
              />
            </div>
            <button
              type="button"
              className="self-start text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowDiagnostics((value) => !value)}
            >
              {showDiagnostics ? "收起详情" : "查看详情"}
            </button>
            {showDiagnostics && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Run ID：</span>
                    <span className="font-mono">
                      {currentRunDiagnostics.runId ?? "pending"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">模型：</span>
                    <span>{currentRunDiagnostics.providerModel ?? defaultModel}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">阶段：</span>
                    <span className="font-mono">
                      {currentRunDiagnostics.activeStage ?? "pending"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Chunks：</span>
                    <span className="font-mono">
                      {currentRunDiagnostics.chunkCount}
                    </span>
                  </div>
                </div>
                {Object.keys(diagramErrors).length > 0 && (
                  <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                    {Object.entries(diagramErrors)
                      .map(([diagram, error]) => `${DIAGRAM_META[diagram as DiagramType].label}: ${error?.message}`)
                      .join("；")}
                  </div>
                )}
                <div className="mt-3 max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 shadow-inner">
                  {currentRunDiagnostics.streamText ? (
                    <pre className="whitespace-pre-wrap break-words">
                      {currentRunDiagnostics.streamText}
                      <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-primary align-[-2px]" />
                    </pre>
                  ) : (
                    <div className="text-zinc-400">等待模型输出...</div>
                  )}
                  <div ref={streamEndRef} />
                </div>
                {currentRunDiagnostics.events.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {currentRunDiagnostics.events.slice(-6).map((event) => (
                      <span
                        key={event.id}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        title={event.detail ?? event.label}
                      >
                        {event.label}
                      </span>
                    ))}
                  </div>
                )}
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
