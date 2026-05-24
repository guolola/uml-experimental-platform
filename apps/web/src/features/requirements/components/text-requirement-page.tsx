import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  Wand2,
  Loader2,
  Search,
  AlertTriangle,
  RefreshCw,
  ArrowUp,
  Plus,
  Trash2,
  FileText,
  ListChecks,
  Network,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Bot,
  SendHorizontal,
  ShoppingCart,
  MessageCircle,
  Activity,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { Checkbox } from "../../../shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { cn } from "../../../shared/ui/utils";
import type {
  AtomicRequirement,
  RequirementQualityIssue,
} from "@uml-platform/contracts";
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

const DEFAULT_NEW_RULE_DIAGRAMS: DiagramType[] = ["usecase", "activity"];
const RULES_PER_PAGE = 8;
const RULE_ROW_CLASS = "h-[60px]";
const ALL_RULE_CATEGORIES = "";

function stageRepairCopy(text: string) {
  return text.replace(/\bAI\b\s*/gu, "系统");
}

function requirementHintCount(requirement: AtomicRequirement | undefined) {
  if (!requirement) return 0;
  return Object.values(requirement.fieldProvenance).filter(
    (item) => item?.source === "ai-suggested" || item?.status === "pending-review",
  ).length;
}

function requirementRowState(
  requirement: AtomicRequirement | undefined,
  qualityIssues: RequirementQualityIssue[] = [],
) {
  if (!requirement) return null;
  if (requirement.status === "conflict") return "存在冲突提示";
  const pendingAi = Object.values(requirement.fieldProvenance).some(
    (item) => item?.source === "ai-suggested" && item.status === "pending-review",
  );
  const rejectedOrManualPending = Object.values(requirement.fieldProvenance).some(
    (item) => item?.status === "rejected" || item?.status === "pending-review",
  );
  if (
    pendingAi ||
    rejectedOrManualPending ||
    qualityIssues.length > 0 ||
    requirement.status === "pending-review" ||
    requirement.status === "ambiguous"
  ) {
    return "有待确认提示";
  }
  const acceptedAi = Object.values(requirement.fieldProvenance).some(
    (item) => item?.source === "ai-suggested" && item.status === "accepted",
  );
  if (acceptedAi) return "AI已补齐";
  return "已生成";
}

function requirementStateTone(state: string | null) {
  if (state === "已生成") return "border-success/40 bg-success/10 text-success";
  if (state === "AI已补齐") return "border-success/40 bg-success/10 text-success";
  if (state === "有待确认提示") return "border-warning/40 bg-warning/10 text-warning";
  if (state === "存在冲突提示") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-border bg-muted/40 text-muted-foreground";
}

const REQUIREMENT_TEMPLATE_CARDS = [
  {
    title: "电商系统",
    english: "E-commerce System",
    description: "完善的购物流程与库存规则。",
    templateText:
      "我们需要开发一个电商系统。用户可以注册和登录账号，浏览商品、搜索商品、查看商品详情，将商品加入购物车并提交订单。系统需要支持订单支付、订单状态查询、收货地址管理和售后退款申请。管理员可以维护商品信息、管理库存、处理订单和查看销售统计。系统应保证未登录用户只能浏览公开商品，支付成功后才生成有效订单，并在库存不足时阻止下单。",
    Icon: ShoppingCart,
  },
  {
    title: "社交应用",
    english: "Social App",
    description: "用户交互与即时通讯逻辑。",
    templateText:
      "我们需要开发一个社交应用。用户可以注册账号、完善个人资料、发布动态、上传图片、关注其他用户并查看关注流。系统需要支持点赞、评论、私信聊天、消息通知和内容举报。管理员可以审核举报内容、管理违规用户和维护社区规则。系统应保证用户只能修改自己的资料和动态，私信只允许在合法用户之间发送，违规内容需要进入审核流程。",
    Icon: MessageCircle,
  },
  {
    title: "健身追踪",
    english: "Fitness Tracker",
    description: "健康数据可视化与目标追踪。",
    templateText:
      "我们需要开发一个健身追踪系统。用户可以记录每日运动、步数、体重、饮食和睡眠数据，设置健身目标并查看进度趋势。系统需要支持训练计划推荐、运动提醒、历史数据统计和健康报告生成。用户可以绑定可穿戴设备同步数据，也可以手动补录记录。系统应保证健康数据仅本人可见，设备同步失败时给出提示，并在用户达到阶段目标时发送通知。",
    Icon: Activity,
  },
] as const;

export function TextRequirementView() {
  const {
    requirementText,
    setRequirementText,
    rules,
    createRequirementRule,
    updateRequirementRule,
    deleteRequirementRule,
    clearRequirementRules,
    selectedDiagrams,
    setSelectedDiagrams,
    generating,
    generateRules,
    generateDiagrams,
    isRulesStale,
    staleDiagrams,
    generatedDiagrams,
    requirementModelTraceability,
    requirementBaseline,
  } = useWorkspaceSession();
  const [query, setQuery] = useState("");
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const [showStaleBanner, setShowStaleBanner] = useState(
    () => loadUserSettings().showStaleBanner,
  );
  const [newRuleDialogOpen, setNewRuleDialogOpen] = useState(false);
  const [newRuleCategory, setNewRuleCategory] =
    useState<RequirementRule["category"]>("功能需求");
  const [newRuleDiagrams, setNewRuleDiagrams] = useState<DiagramType[]>(
    DEFAULT_NEW_RULE_DIAGRAMS,
  );
  const [newRuleText, setNewRuleText] = useState("");
  const [newRuleError, setNewRuleError] = useState<string | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [modelRepairResult, setModelRepairResult] = useState<{
    targetLabel: string;
  } | null>(null);
  const [currentRulePage, setCurrentRulePage] = useState(1);
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState<
    RequirementRule["category"] | typeof ALL_RULE_CATEGORIES
  >(ALL_RULE_CATEGORIES);

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

  const hasGeneratedRules = rules.length > 0;

  const runGenerateRules = () => {
    void generateRules();
  };

  const runGenerateDiagrams = (only?: DiagramType[]) => {
    void generateDiagrams(only);
  };

  const updateModel = (model: string) => {
    patchUserSettings({ defaultModel: model });
  };

  const confirmReturnToRequirementText = () => {
    clearRequirementRules();
    setReturnDialogOpen(false);
    setQuery("");
    setRuleCategoryFilter(ALL_RULE_CATEGORIES);
    setCurrentRulePage(1);
  };

  const selectableDiagramSet = useMemo(
    () =>
      new Set(
        DIAGRAM_ORDER.filter((diagram) =>
          rules.some((rule) => rule.relatedDiagrams.includes(diagram)),
        ),
      ),
    [rules],
  );

  const toggleDiagram = (diagram: DiagramType, checked: boolean) => {
    if (checked && !selectableDiagramSet.has(diagram)) {
      return;
    }
    setSelectedDiagrams(
      checked
        ? Array.from(new Set([...selectedDiagrams, diagram]))
        : selectedDiagrams.filter((value) => value !== diagram),
    );
  };

  const toggleDiagramFromCard = (diagram: DiagramType, checked: boolean) => {
    toggleDiagram(diagram, !checked);
  };

  const handleDiagramCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    diagram: DiagramType,
    checked: boolean,
    enabled: boolean,
  ) => {
    if (!enabled || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleDiagramFromCard(diagram, checked);
  };

  useEffect(() => {
    const nextSelectedDiagrams = selectedDiagrams.filter((diagram) =>
      selectableDiagramSet.has(diagram),
    );
    if (nextSelectedDiagrams.length !== selectedDiagrams.length) {
      setSelectedDiagrams(nextSelectedDiagrams);
    }
  }, [selectableDiagramSet, selectedDiagrams, setSelectedDiagrams]);

  const toggleNewRuleDiagram = (diagram: DiagramType, checked: boolean) => {
    setNewRuleDiagrams((current) =>
      checked
        ? Array.from(new Set([...current, diagram]))
        : current.filter((value) => value !== diagram),
    );
  };

  const resetNewRuleForm = () => {
    setNewRuleCategory("功能需求");
    setNewRuleDiagrams(DEFAULT_NEW_RULE_DIAGRAMS);
    setNewRuleText("");
    setNewRuleError(null);
  };

  const submitNewRule = () => {
    const trimmedText = newRuleText.trim();
    if (!trimmedText) {
      setNewRuleError("请填写需求文本。");
      return;
    }
    if (newRuleDiagrams.length === 0) {
      setNewRuleError("请至少选择一个对应模型。");
      return;
    }
    createRequirementRule({
      category: newRuleCategory,
      relatedDiagrams: newRuleDiagrams,
      text: trimmedText,
    });
    setNewRuleDialogOpen(false);
    resetNewRuleForm();
  };

  const newRuleCanSubmit = newRuleText.trim().length > 0 && newRuleDiagrams.length > 0;

  const filteredRules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rules.filter((rule) => {
      const matchesQuery =
        !normalizedQuery || rule.text.toLowerCase().includes(normalizedQuery);
      const matchesCategory =
        ruleCategoryFilter === ALL_RULE_CATEGORIES ||
        rule.category === ruleCategoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [rules, query, ruleCategoryFilter]);

  useEffect(() => {
    setCurrentRulePage(1);
  }, [query, ruleCategoryFilter]);

  const totalRulePages = Math.max(1, Math.ceil(filteredRules.length / RULES_PER_PAGE));
  const safeRulePage = Math.min(currentRulePage, totalRulePages);
  const firstRuleIndex =
    filteredRules.length === 0 ? 0 : (safeRulePage - 1) * RULES_PER_PAGE + 1;
  const lastRuleIndex = Math.min(filteredRules.length, safeRulePage * RULES_PER_PAGE);
  const pagedRules = filteredRules.slice(firstRuleIndex - 1, lastRuleIndex);
  const emptyRuleSlots = Math.max(0, RULES_PER_PAGE - pagedRules.length);
  const requirementByRuleId = useMemo(() => {
    const entries =
      requirementBaseline?.requirements
        .filter((requirement) => requirement.sourceRuleId)
        .map((requirement) => [requirement.sourceRuleId!, requirement] as const) ?? [];
    return new Map(entries);
  }, [requirementBaseline]);
  const qualityIssuesByRequirementId = useMemo(() => {
    const map = new Map<string, RequirementQualityIssue[]>();
    for (const issue of requirementBaseline?.qualityReport.issues ?? []) {
      if (!issue.requirementId) continue;
      map.set(issue.requirementId, [
        ...(map.get(issue.requirementId) ?? []),
        issue,
      ]);
    }
    return map;
  }, [requirementBaseline]);
  useEffect(() => {
    if (currentRulePage > totalRulePages) {
      setCurrentRulePage(totalRulePages);
    }
  }, [currentRulePage, totalRulePages]);

  const generateDiagramsButtonLabel = (() => {
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
  })();
  const requirementModelRepairRecords = useMemo(() => {
    if (generatedDiagrams.length === 0 || requirementModelTraceability.length === 0) {
      return [];
    }
    return requirementModelTraceability.slice(0, 6).map((entry) => {
      const linkedRule = rules.find((rule) => rule.id === entry.ruleId);
      const targetDiagramLabel =
        entry.target.diagramKind in DIAGRAM_META
          ? DIAGRAM_META[entry.target.diagramKind as DiagramType].label
          : "需求模型";
      return {
        id: `${entry.ruleId}:${entry.target.diagramKind}:${entry.target.elementId}`,
        reason: linkedRule
          ? `需求规则 ${entry.ruleId} 需要解释其在${targetDiagramLabel}中的覆盖关系。`
          : `需求规则 ${entry.ruleId} 缺少可审查的模型覆盖解释。`,
        repair: `补齐 ${entry.ruleId} -> ${entry.target.label} 的追踪关系和覆盖说明`,
        targetLabel: `${targetDiagramLabel}：${entry.target.label}`,
        status: "证明已补齐",
      };
    });
  }, [generatedDiagrams.length, requirementModelTraceability, rules]);

  const renderRequirementInput = (mode: "empty" | "generated") => (
    <div
      className={cn(
        "relative",
        mode === "empty" &&
          "overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm",
      )}
    >
      {mode === "empty" && (
        <div className="absolute -right-20 -top-20 size-64 rounded-full bg-primary/5 blur-3xl" />
      )}
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-normal text-foreground">
            {mode === "empty" ? "项目需求描述" : "需求描述"}
          </h2>
        </div>
      </div>
      <textarea
        id="requirement-text"
        name="requirementText"
        value={requirementText}
        onChange={(event) => setRequirementText(event.target.value)}
        placeholder="用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则"
        className={cn(
          "relative mt-3 w-full resize-y rounded-lg border border-input bg-background px-4 py-4 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
          mode === "empty" ? "h-[clamp(360px,48vh,620px)] min-h-80" : "min-h-32",
        )}
      />
      <div className="relative mt-6 flex flex-wrap items-center gap-2">
        <ModelPicker value={defaultModel} onValueChange={updateModel} />
        {isRulesStale && (
          <span className="text-[11px] text-warning">需求已修改</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-10 rounded-full px-6"
          onClick={() => setRequirementText("")}
          disabled={!requirementText || generating}
        >
          清空
        </Button>
        <button
          type="button"
          onClick={runGenerateRules}
          disabled={!requirementText.trim() || generating}
          title={isRulesStale ? "更新需求规则" : "生成需求规则"}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
          {isRulesStale ? "更新需求规则" : "开始分析提取"}
        </button>
      </div>
    </div>
  );

  const renderRequirementRules = () => (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-muted/40 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="size-5 text-primary" />
            <h2 className="text-xl font-semibold tracking-normal text-foreground">
              需求规则
            </h2>
          </div>
          <Badge
            variant="secondary"
            className="rounded-full border-0 px-2.5 py-0.5 font-mono text-xs font-bold"
          >
            {rules.length}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-primary"
            onClick={() => setReturnDialogOpen(true)}
          >
            返回修改描述
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索规则..."
              className="h-9 rounded-lg bg-background pl-9 text-sm"
            />
          </div>
          <SelectControl
            value={ruleCategoryFilter}
            onValueChange={(value) =>
              setRuleCategoryFilter(
                value as RequirementRule["category"] | typeof ALL_RULE_CATEGORIES,
              )
            }
            className="h-9 w-36 rounded-lg bg-background text-sm"
            aria-label="需求类型筛选"
            options={[
              { value: ALL_RULE_CATEGORIES, label: "全部类型" },
              ...RULE_CATEGORY_ORDER.map((category) => ({
                value: category,
                label: category,
              })),
            ]}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-lg bg-background px-4"
            onClick={() => setNewRuleDialogOpen(true)}
            disabled={generating}
          >
            <Plus className="size-3.5" /> 新增需求项
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse bg-card text-sm">
          <thead className="text-xs tracking-[0.02em] text-muted-foreground">
            <tr className="border-b border-border">
              <th className="w-[84px] px-6 py-4 text-left font-medium">编号</th>
              <th className="w-36 px-6 py-4 text-left font-medium">类型</th>
              <th className="w-52 px-4 py-4 text-left font-medium">状态</th>
              <th className="px-6 py-4 text-left font-medium">需求文本内容</th>
              <th className="w-56 px-4 py-4 text-left font-medium">相关图</th>
              <th className="w-28 px-6 py-4 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length === 0 ? (
              <tr
                data-testid="requirement-rule-row-slot"
                className={cn(RULE_ROW_CLASS, "border-b border-border")}
              >
                <td
                  colSpan={6}
                  className="px-6 py-3 text-center align-middle text-sm text-muted-foreground"
                >
                  没有匹配的规则。
                </td>
              </tr>
            ) : (
              pagedRules.map((rule) => {
              const requirement = requirementByRuleId.get(rule.id);
              const qualityIssues = requirement
                ? qualityIssuesByRequirementId.get(requirement.id) ?? []
                : [];
              const rowState = requirementRowState(requirement, qualityIssues);
              const hintCount = requirementHintCount(requirement) + qualityIssues.length;
              const visibleRelatedDiagrams = rule.relatedDiagrams.slice(0, 2);
              const hiddenRelatedDiagramCount =
                rule.relatedDiagrams.length - visibleRelatedDiagrams.length;
              const relatedDiagramTitle = rule.relatedDiagrams
                .map((diagram) => DIAGRAM_META[diagram].label)
                .join("、");
              return (
                <tr
                  key={rule.id}
                  id={`rule-${rule.id}`}
                  data-testid="requirement-rule-row-slot"
                  className={cn(
                    RULE_ROW_CLASS,
                    "border-b border-border transition-colors hover:bg-muted/30",
                  )}
                >
                    <td className="px-6 py-3 align-middle">
                      <span className="font-mono text-xs uppercase text-muted-foreground">
                        {rule.id}
                      </span>
                    </td>
                    <td className="px-6 py-3 align-middle">
                      <Badge
                        variant="outline"
                        className="max-w-full rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground"
                      >
                        <span className="truncate">{rule.category}</span>
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {rowState && (
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "max-w-[112px] rounded-md px-2 py-1 text-xs",
                              requirementStateTone(rowState),
                            )}
                          >
                            <span className="truncate">{rowState}</span>
                          </Badge>
                          {hintCount > 0 && (
                            <span
                              className="shrink-0 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning"
                              title={`共有 ${hintCount} 项质量提示，仅用于审计，不阻断后续生成`}
                            >
                              {hintCount}项
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="min-w-0 px-6 py-3 align-middle">
                      <input
                        type="text"
                        value={rule.text}
                        title={rule.text}
                        onChange={(event) =>
                          updateRequirementRule(rule.id, {
                            text: event.target.value,
                          })
                        }
                        className="h-8 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-0 text-sm text-foreground outline-none transition-colors hover:border-border hover:bg-background focus:border-primary/60 focus:bg-background focus:px-2 focus:ring-2 focus:ring-primary/15"
                        disabled={generating}
                      />
                    </td>
                    <td
                      className="min-w-0 px-4 py-3 align-middle"
                      title={relatedDiagramTitle}
                    >
                      <div className="flex min-w-0 flex-nowrap gap-1 overflow-hidden whitespace-nowrap">
                        {visibleRelatedDiagrams.map((diagram) => (
                          <Badge
                            key={`${rule.id}:${diagram}`}
                            variant="outline"
                            className="max-w-[72px] shrink-0 rounded-md border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            title={DIAGRAM_META[diagram].label}
                          >
                            <span className="truncate">{DIAGRAM_META[diagram].label}</span>
                          </Badge>
                        ))}
                        {hiddenRelatedDiagramCount > 0 && (
                          <Badge
                            variant="outline"
                            className="shrink-0 rounded-md border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            title={relatedDiagramTitle}
                          >
                            +{hiddenRelatedDiagramCount}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => deleteRequirementRule(rule.id)}
                        disabled={generating}
                        aria-label={`删除需求项 ${rule.id}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
            {Array.from({
              length:
                filteredRules.length === 0
                  ? Math.max(0, RULES_PER_PAGE - 1)
                  : emptyRuleSlots,
            }).map((_, index) => (
              <tr
                key={`empty-rule-slot:${safeRulePage}:${index}`}
                data-testid="requirement-rule-row-slot"
                aria-hidden="true"
                className={cn(RULE_ROW_CLASS, "border-b border-border")}
              >
                <td colSpan={6} className="px-6 py-3">
                  &nbsp;
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-4 text-xs text-muted-foreground">
        <span>
          {firstRuleIndex}-{lastRuleIndex} / {filteredRules.length}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="上一页"
            onClick={() => setCurrentRulePage((page) => Math.max(1, page - 1))}
            disabled={safeRulePage === 1}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          {Array.from({ length: totalRulePages }, (_, index) => index + 1).map(
            (page) => (
              <button
                type="button"
                key={page}
                onClick={() => setCurrentRulePage(page)}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                  page === safeRulePage
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {page}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="下一页"
            onClick={() =>
              setCurrentRulePage((page) => Math.min(totalRulePages, page + 1))
            }
            disabled={safeRulePage === totalRulePages}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );

  const renderAssistantPanel = () => (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <Bot className="size-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">AI 需求助手</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="rounded-bl-lg rounded-br-lg rounded-tr-lg bg-muted px-3 py-2 text-xs leading-5 text-foreground">
          你好！我是您的需求分析助手。我可以帮助您细化功能点、完善业务规则或根据您的想法提供专业建议。请问有什么可以帮您的？
        </div>
        <div className="grid gap-2">
            {REQUIREMENT_TEMPLATE_CARDS.map(
              ({ title, english, description, templateText, Icon }) => (
                <button
                  type="button"
                  key={title}
                  onClick={() => setRequirementText(templateText)}
                  className="group rounded-lg border border-border bg-background p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-transform duration-200 group-hover:-translate-y-0.5">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {title}
                      </span>
                      <span className="block truncate font-mono text-[9px] text-muted-foreground">
                        {english}
                      </span>
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[11px] leading-4 text-muted-foreground">
                        {description}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    <CircleCheck className="size-3" />
                    应用模板
                  </span>
                </button>
              ),
            )}
        </div>
      </div>
      <div className="border-t border-border p-3">
        <div className="relative">
          <Input
            value=""
            readOnly
            disabled
            placeholder="输入消息..."
            className="h-9 rounded-full bg-muted pr-9 text-xs"
            aria-label="AI 需求助手输入消息"
          />
          <button
            type="button"
            disabled
            className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-primary opacity-70"
            aria-label="发送消息"
          >
            <SendHorizontal className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
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

      <div className="w-full py-4 lg:py-5">
        <div className="mx-auto flex w-[calc(100%-1.5rem)] max-w-none flex-col gap-5 sm:w-[calc(100%-2rem)] lg:w-[calc(100%-3rem)]">
          <header className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-normal text-foreground lg:text-3xl">
              需求分析提取
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              输入您的项目需求描述，系统将帮助您提取关键用例、参与者并生成初始的系统模型。
            </p>
          </header>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(220px,260px)]">
            {hasGeneratedRules ? renderRequirementRules() : renderRequirementInput("empty")}
            {renderAssistantPanel()}
          </div>

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Network className="size-5 text-primary" />
                <h2 className="text-xl font-semibold tracking-normal text-foreground">
                  目标模型
                </h2>
              </div>
              <Badge
                variant="secondary"
                className="rounded-md border-0 px-3 py-1 font-mono text-xs"
              >
                {selectedDiagrams.length}/{DIAGRAM_ORDER.length}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <ModelPicker
                  value={defaultModel}
                  onValueChange={updateModel}
                  align="end"
                  triggerClassName="bg-card"
                />
                <button
                  type="button"
                  onClick={() => runGenerateDiagrams()}
                  disabled={selectedDiagrams.length === 0 || generating}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  {generateDiagramsButtonLabel}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {DIAGRAM_ORDER.map((diagram) => {
                const meta = DIAGRAM_META[diagram];
                const checked = selectedDiagrams.includes(diagram);
                const linkedRules = rules.filter((rule) =>
                  rule.relatedDiagrams.includes(diagram),
                );
                const canSelectDiagram = linkedRules.length > 0;
                return (
                  <div
                    key={diagram}
                    role="button"
                    tabIndex={canSelectDiagram ? 0 : -1}
                    aria-disabled={!canSelectDiagram}
                    aria-label={`${checked ? "取消选择" : "选择"}${meta.label}`}
                    onClick={() => {
                      if (canSelectDiagram) {
                        toggleDiagramFromCard(diagram, checked);
                      }
                    }}
                    onKeyDown={(event) =>
                      handleDiagramCardKeyDown(
                        event,
                        diagram,
                        checked,
                        canSelectDiagram,
                      )
                    }
                    className={cn(
                      "flex min-h-24 gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      checked
                        ? "border-primary/35 ring-2 ring-primary/10"
                        : "border-border",
                      canSelectDiagram ? "cursor-pointer" : "cursor-not-allowed",
                      !canSelectDiagram &&
                        "border-dashed border-border bg-muted/30 opacity-80 shadow-none",
                    )}
                  >
                    <label
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      className={cn(
                        "mt-1 flex shrink-0",
                        canSelectDiagram ? "cursor-pointer" : "cursor-not-allowed",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleDiagram(diagram, !!value)}
                        disabled={!canSelectDiagram}
                        aria-label={meta.label}
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                            <h3
                              className={cn(
                                "text-sm font-semibold text-foreground",
                                !canSelectDiagram && "text-muted-foreground",
                              )}
                            >
                              {meta.label}
                            </h3>
                            <span className="font-mono text-xs text-muted-foreground">
                              {meta.english}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {meta.description}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 font-mono text-lg font-bold",
                            canSelectDiagram
                              ? "bg-primary/5 text-primary"
                              : "text-muted-foreground",
                          )}
                        >
                          {linkedRules.length}
                        </span>
                      </div>

                      {!canSelectDiagram && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="size-3.5" />
                          缺少对应需求规则
                        </div>
                      )}
                      {linkedRules.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {linkedRules.map((rule) => (
                            <button
                              type="button"
                              key={rule.id}
                              title={rule.text}
                              onClick={(event) => {
                                event.stopPropagation();
                                const element = document.getElementById(
                                  `rule-${rule.id}`,
                                );
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
                              onKeyDown={(event) => event.stopPropagation()}
                              className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                            >
                              {rule.id}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {requirementModelRepairRecords.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      需求模型覆盖/追踪证明
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      这里检查并补齐模型是否按规则提供覆盖解释和追踪关系。
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-success/35 bg-success/10 text-success"
                  >
                    证明已补齐
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  {requirementModelRepairRecords.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5"
                    >
                      <div className="text-muted-foreground">
                        问题原因：{stageRepairCopy(record.reason)}
                      </div>
                      <div className="mt-1 text-foreground">
                        补齐方式：{stageRepairCopy(record.repair)}
                      </div>
                      <div className="mt-1 font-medium text-success">
                        证明状态：{record.status}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 h-8"
                        onClick={() =>
                          setModelRepairResult({ targetLabel: record.targetLabel })
                        }
                      >
                        重新补齐证明
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <p className="pb-4 text-center text-xs text-muted-foreground">
              勾选不会立即生效；点击「生成模型」后左侧菜单才会更新。之后生成需求模型、设计模型、代码原型和说明书时，都会优先使用这里选择的需求项。
            </p>
          </section>
        </div>
      </div>

      <Dialog
        open={Boolean(modelRepairResult)}
        onOpenChange={(open) => {
          if (!open) setModelRepairResult(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>单项证明补齐完成</DialogTitle>
            <DialogDescription>
              已只重新检查当前需求模型覆盖证明，没有重新生成全部需求模型。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div>
              <span className="font-medium">阶段：</span>需求模型
            </div>
            <div>
              <span className="font-medium">对象：</span>
              {modelRepairResult?.targetLabel}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setModelRepairResult(null)}>
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>返回修改描述？</DialogTitle>
            <DialogDescription>
              返回项目需求描述会清空目前的需求规则，目标模型选择也会随规则失效而取消。此操作不会清空需求描述文本。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReturnDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={confirmReturnToRequirementText}>
              确认回退
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newRuleDialogOpen}
        onOpenChange={(open) => {
          setNewRuleDialogOpen(open);
          if (!open) resetNewRuleForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增需求项</DialogTitle>
            <DialogDescription>
              新增时选择类型和对应模型；创建后列表中只允许修改文本内容。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">需求类型</span>
              <SelectControl
                value={newRuleCategory}
                onValueChange={(value) => {
                  setNewRuleCategory(value as RequirementRule["category"]);
                  setNewRuleError(null);
                }}
                className="h-9"
                disabled={generating}
                options={RULE_CATEGORY_ORDER.map((category) => ({
                  value: category,
                  label: category,
                }))}
              />
            </label>

            <div className="grid gap-2 text-sm">
              <span className="font-medium">对应模型</span>
              <div className="grid grid-cols-2 gap-2">
                {DIAGRAM_ORDER.map((diagram) => (
                  <label
                    key={`new-rule:${diagram}`}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground"
                  >
                    <Checkbox
                      checked={newRuleDiagrams.includes(diagram)}
                      onCheckedChange={(value) => {
                        toggleNewRuleDiagram(diagram, Boolean(value));
                        setNewRuleError(null);
                      }}
                      disabled={generating}
                    />
                    {DIAGRAM_META[diagram].label}
                  </label>
                ))}
              </div>
            </div>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">需求文本</span>
              <textarea
                value={newRuleText}
                onChange={(event) => {
                  setNewRuleText(event.target.value);
                  setNewRuleError(null);
                }}
                placeholder="填写这条需求项的具体内容"
                className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
                disabled={generating}
              />
            </label>

            {newRuleError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {newRuleError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewRuleDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={submitNewRule}
              disabled={generating || !newRuleCanSubmit}
            >
              创建需求项
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
