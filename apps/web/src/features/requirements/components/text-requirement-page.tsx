import { useEffect, useMemo, useState } from "react";
import {
  Wand2,
  Loader2,
  Search,
  AlertTriangle,
  RefreshCw,
  ArrowUp,
  Plus,
  Trash2,
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
import {
  RULE_CATEGORY_ORDER,
  type RequirementRule,
} from "../../../entities/requirement-rule/model";
import { useWorkspaceSession } from "../../workspace-session/state";
import { ModelPicker } from "../../../shared/ui/model-picker";
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
    addRequirementRule,
    updateRequirementRule,
    deleteRequirementRule,
    selectedDiagrams,
    setSelectedDiagrams,
    generating,
    runStatus,
    errorMessage,
    generateRules,
    generateDiagrams,
    isRulesStale,
    staleDiagrams,
    generatedDiagrams,
  } = useWorkspaceSession();
  const [query, setQuery] = useState("");
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const [showStaleBanner, setShowStaleBanner] = useState(
    () => loadUserSettings().showStaleBanner,
  );

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

  const toggleRuleDiagram = (
    rule: RequirementRule,
    diagram: DiagramType,
    checked: boolean,
  ) => {
    const next = checked
      ? Array.from(new Set([...rule.relatedDiagrams, diagram]))
      : rule.relatedDiagrams.filter((value) => value !== diagram);
    if (next.length === 0) return;
    updateRequirementRule(rule.id, { relatedDiagrams: next });
  };

  const filteredRules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rules;
    return rules.filter((rule) => rule.text.toLowerCase().includes(normalizedQuery));
  }, [rules, query]);

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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={addRequirementRule}
              disabled={generating}
            >
              <Plus className="size-3.5" /> 新增需求项
            </Button>
          </div>
          {filteredRules.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
              没有匹配的规则。
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredRules.map((rule) => (
                <li
                  key={rule.id}
                  id={`rule-${rule.id}`}
                  className="rounded-md border border-border bg-card p-3 text-sm transition-colors hover:border-primary/40"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      value={rule.id}
                      onChange={(event) =>
                        updateRequirementRule(rule.id, {
                          id: event.target.value.trim() || rule.id,
                        })
                      }
                      className="h-7 w-20 font-mono text-xs uppercase"
                      disabled={generating}
                    />
                    <select
                      value={rule.category}
                      onChange={(event) =>
                        updateRequirementRule(rule.id, {
                          category: event.target.value as RequirementRule["category"],
                        })
                      }
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                      disabled={generating}
                    >
                      {RULE_CATEGORY_ORDER.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteRequirementRule(rule.id)}
                      disabled={generating}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <textarea
                    value={rule.text}
                    onChange={(event) =>
                      updateRequirementRule(rule.id, { text: event.target.value })
                    }
                    className="min-h-16 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
                    disabled={generating}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {DIAGRAM_ORDER.map((diagram) => (
                      <label
                        key={`${rule.id}:${diagram}`}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <Checkbox
                          checked={rule.relatedDiagrams.includes(diagram)}
                          onCheckedChange={(value) =>
                            toggleRuleDiagram(rule, diagram, Boolean(value))
                          }
                          disabled={generating}
                        />
                        {DIAGRAM_META[diagram].label}
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            之后生成需求模型、设计模型、代码原型和说明书时，都会优先使用这里已确认的需求项；原始需求文本只作为背景。
          </p>
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

    </div>
  );
}
