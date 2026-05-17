import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Boxes,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FileText,
  History,
  Loader2,
  Moon,
  Palette,
  Settings,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import type {
  DesignTraceEntry,
  RequirementTraceEntry,
  RunSnapshot,
  RunStage,
} from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { SettingsDialog } from "../../settings/components/settings-dialog";
import { useTheme } from "../../../app/providers/theme-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { buildRunMarkdownReport } from "../../history";
import { downloadTextFile } from "../../../shared/lib/download";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../state";

export type ShellRoutePath = "/" | "/exam" | "/tutorial" | "/about";

type TopBarProps = {
  currentRoute: ShellRoutePath;
  onNavigate: (route: ShellRoutePath) => void;
};

const RUN_STATUS_LABEL = {
  idle: "暂无任务",
  queued: "排队中",
  running: "生成中",
  completed: "已完成",
  failed: "失败",
} as const;

type RunKind = "requirements" | "design" | "code" | "document";

const STAGE_LABELS: Record<RunStage, string> = {
  extract_rules: "抽取需求规则",
  generate_models: "生成需求模型",
  generate_design_sequence: "生成设计顺序图",
  generate_design_models: "生成设计模型",
  analyze_code_business_logic: "分析业务逻辑",
  analyze_code_product: "分析业务背景",
  plan_code_ui: "规划界面方案",
  generate_code_ui_mockup: "生成界面设计图",
  analyze_code_ui_mockup: "解析界面设计图",
  generate_code_ui_ir: "生成结构化 UI IR",
  load_web_design_skill: "加载前端设计执行器",
  select_code_skills: "选择前端设计执行器",
  plan_code_files: "规划文件结构",
  generate_code_spec: "生成代码规格",
  generate_code_files: "生成代码文件",
  plan_code: "制定实现步骤",
  write_code_files: "写入原型文件",
  audit_code_quality: "检查原型质量",
  verify_code_ui_fidelity: "检查业务/界面覆盖",
  verify_code_rendered_preview: "验证渲染预览",
  verify_code_preview: "检查预览入口",
  repair_code_files: "修复代码输出",
  generate_document_text: "生成说明书正文",
  render_document_file: "写入说明书文件",
  generate_plantuml: "生成图源码",
  render_svg: "渲染图像",
};

const STAGES_BY_KIND: Record<RunKind, RunStage[]> = {
  requirements: [
    "extract_rules",
    "generate_models",
    "generate_plantuml",
    "render_svg",
  ],
  design: [
    "generate_design_sequence",
    "generate_design_models",
    "generate_plantuml",
    "render_svg",
  ],
  code: [
    "analyze_code_business_logic",
    "plan_code_ui",
    "generate_code_files",
    "audit_code_quality",
    "verify_code_ui_fidelity",
    "verify_code_rendered_preview",
    "verify_code_preview",
    "repair_code_files",
  ],
  document: ["generate_document_text", "render_document_file"],
};

function formatStageLabel(stage: RunStage | null) {
  if (!stage) return "等待任务";
  return STAGE_LABELS[stage] ?? "处理生成任务";
}

function sanitizeTaskText(text: string | null | undefined) {
  if (!text) return "";
  const replacements = [
    ["extract_rules", "抽取需求规则"],
    ["generate_models", "生成需求模型"],
    ["generate_design_sequence", "生成设计顺序图"],
    ["generate_design_models", "生成设计模型"],
    ["analyze_code_business_logic", "分析业务逻辑"],
    ["analyze_code_product", "分析业务背景"],
    ["plan_code_ui", "规划界面方案"],
    ["generate_code_ui_mockup", "生成界面设计图"],
    ["analyze_code_ui_mockup", "解析界面设计图"],
    ["generate_code_ui_ir", "生成结构化 UI IR"],
    ["load_web_design_skill", "加载前端设计执行器"],
    ["select_code_skills", "选择前端设计执行器"],
    ["plan_code_files", "规划文件结构"],
    ["generate_code_spec", "生成代码规格"],
    ["generate_code_files", "生成代码文件"],
    ["plan_code", "制定实现步骤"],
    ["write_code_files", "写入原型文件"],
    ["audit_code_quality", "检查原型质量"],
    ["verify_code_ui_fidelity", "检查设计图还原度"],
    ["verify_code_rendered_preview", "验证渲染预览"],
    ["verify_code_preview", "检查预览入口"],
    ["repair_code_files", "修复代码输出"],
    ["generate_document_text", "生成说明书正文"],
    ["render_document_file", "写入说明书文件"],
    ["generate_plantuml", "生成图源码"],
    ["render_svg", "渲染图像"],
    ["PlantUML", "图源码"],
    ["SVG", "图像"],
    ["stage_started", "阶段开始"],
    ["stage_progress", "阶段进度"],
    ["llm_chunk", "收到模型输出"],
    ["uiMockup", "界面设计图"],
    ["uiReferenceSpec", "界面设计图解析"],
    ["businessLogic", "业务逻辑"],
    ["uiFidelityReport", "业务/界面覆盖检查"],
    ["designTokens", "设计 Token"],
    ["componentRegistry", "组件 Registry"],
    ["uiIr", "结构化 UI IR"],
    ["visualDiffReport", "预览验证报告"],
    ["ui-ux-pro-max", "前端设计执行器"],
  ];
  return replacements.reduce(
    (current, [source, target]) => current.split(source).join(target),
    text,
  );
}

function getTaskStages(kind: RunKind | null, activeStage: RunStage | null) {
  const base = kind ? [...STAGES_BY_KIND[kind]] : [];
  if (activeStage && !base.includes(activeStage)) {
    base.push(activeStage);
  }
  return base;
}

const TRACE_KIND_LABELS: Record<DesignTraceEntry["kind"], string> = {
  llm_output: "模型原始返回",
  parse_error: "解析错误",
  parsed_model: "解析后的模型",
  plantuml_source: "PlantUML 源码",
  render_error: "渲染错误",
  repair_output: "修复原始返回",
  repaired_plantuml: "修复后 PlantUML",
};

function formatDesignTraceEntryTitle(entry: DesignTraceEntry) {
  return [
    formatStageLabel(entry.stage),
    entry.diagramKind ?? "全局",
    `第 ${entry.attempt} 次`,
    TRACE_KIND_LABELS[entry.kind],
  ].join(" / ");
}

function formatRequirementTraceEntryTitle(entry: RequirementTraceEntry) {
  return [
    formatStageLabel(entry.stage),
    entry.diagramKind ?? "全局",
    `第 ${entry.attempt} 次`,
    TRACE_KIND_LABELS[entry.kind],
  ].join(" / ");
}

function getTraceEntryBody(entry: DesignTraceEntry | RequirementTraceEntry) {
  if (entry.rawOutput) return entry.rawOutput;
  if (entry.plantUmlSource) return entry.plantUmlSource;
  if (entry.errorMessage) return entry.errorMessage;
  if (entry.parsedData !== undefined) {
    return JSON.stringify(entry.parsedData, null, 2);
  }
  return "无详细内容";
}

export function TopBar({ currentRoute, onNavigate }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const executionDetailRef = useRef<HTMLDivElement | null>(null);
  const {
    requirementText,
    rules,
    models,
    svgArtifacts,
    diagramErrors,
    selectedDiagrams,
    runStatus,
    runProgress,
    runMessage,
    errorMessage,
    currentRunDiagnostics,
    generateRequirementsSpec,
    generateSoftwareDesignSpec,
  } =
    useWorkspaceSession();
  const { openHistoryDrawer } = useWorkspaceShell();
  const taskIsActive = runStatus === "queued" || runStatus === "running";
  const recentEvents = useMemo(
    () => currentRunDiagnostics.events.slice(-6).reverse(),
    [currentRunDiagnostics.events],
  );
  const taskStages = useMemo(
    () =>
      getTaskStages(
        currentRunDiagnostics.runKind,
        currentRunDiagnostics.activeStage,
      ),
    [currentRunDiagnostics.activeStage, currentRunDiagnostics.runKind],
  );
  const activeStageIndex = currentRunDiagnostics.activeStage
    ? taskStages.indexOf(currentRunDiagnostics.activeStage)
    : -1;
  const uiMockup = currentRunDiagnostics.uiMockup;
  const uiMockupImage = uiMockup?.imageUrl ?? uiMockup?.imageDataUrl ?? null;
  const requirementTraceEntries = currentRunDiagnostics.requirementTrace;
  const designTraceEntries = currentRunDiagnostics.designTrace;

  useEffect(() => {
    if (!taskDialogOpen) return;
    const element = executionDetailRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [
    currentRunDiagnostics.activeStage,
    currentRunDiagnostics.streamText,
    taskDialogOpen,
  ]);

  const copyTraceEntry = async (entry: DesignTraceEntry | RequirementTraceEntry) => {
    try {
      await navigator.clipboard.writeText(getTraceEntryBody(entry));
      toast.success("已复制追踪内容");
    } catch {
      toast.error("复制失败");
    }
  };

  const currentSnapshot = (): RunSnapshot => ({
    runId: "workspace-current",
    requirementText,
    selectedDiagrams,
    rules,
    models: Object.values(models).filter((model) => !!model),
    plantUml: [],
    svgArtifacts: Object.values(svgArtifacts).filter((artifact) => !!artifact),
    diagramErrors,
    requirementTrace: [],
    currentStage: null,
    status: runStatus === "idle" ? "completed" as const : runStatus,
    errorMessage,
  });

  const exportMarkdown = () => {
    if (!rules.length && !requirementText.trim()) {
      toast.message("暂无内容可导出");
      return;
    }
    downloadTextFile(
      "uml-run-report.md",
      buildRunMarkdownReport(currentSnapshot()),
      "text/markdown",
    );
    toast.success("已导出 uml-run-report.md");
  };

  const exportJson = () => {
    downloadTextFile(
      "uml-run-snapshot.json",
      JSON.stringify(currentSnapshot(), null, 2),
      "application/json",
    );
    toast.success("已导出 uml-run-snapshot.json");
  };

  const exportRequirementsSpec = () => {
    void generateRequirementsSpec();
  };

  const exportSoftwareDesignSpec = () => {
    void generateSoftwareDesignSpec();
  };

  const navItems = [
    {
      label: "首页",
      route: "/" as const,
    },
    {
      label: "考试",
      route: "/exam" as const,
    },
    {
      label: "教程",
      route: "/tutorial" as const,
    },
    {
      label: "关于",
      route: "/about" as const,
    },
  ];

  return (
    <header className="flex h-16 shrink-0 flex-nowrap items-center gap-6 overflow-hidden border-b border-transparent bg-sidebar px-5 text-sidebar-foreground">
      <div className="flex shrink-0 items-center gap-3">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[conic-gradient(from_160deg,#31d0ff,#8b5cf6,#ff5db1,#31d0ff)] shadow-sm">
          <Boxes className="size-4 text-white" />
        </span>
        <span className="whitespace-nowrap text-[22px] font-semibold tracking-normal">
          软件工程实验平台
        </span>
      </div>

      <nav className="flex min-w-0 items-center gap-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-current={currentRoute === item.route ? "page" : undefined}
            onClick={() => onNavigate(item.route)}
            className="h-10 px-4 text-[17px] font-semibold text-sidebar-foreground/88 transition-colors hover:text-primary"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className="h-12 shrink-0 rounded-full bg-secondary px-3 text-secondary-foreground shadow-none hover:bg-muted"
            title="生成任务"
            aria-label="生成任务"
          >
            {taskIsActive ? (
              <Loader2 className="size-5 animate-spin text-primary" />
            ) : runStatus === "failed" ? (
              <AlertCircle className="size-5 text-destructive" />
            ) : runStatus === "completed" ? (
              <CheckCircle2 className="size-5 text-success" />
            ) : (
              <Activity className="size-5" />
            )}
            <span className="hidden max-w-36 truncate text-sm font-semibold xl:inline">
              {taskIsActive
                ? `${RUN_STATUS_LABEL[runStatus]} ${runProgress}%`
                : RUN_STATUS_LABEL[runStatus]}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="right-0 left-auto top-0 h-screen max-w-[420px] translate-x-0 translate-y-0 content-start gap-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-[420px]">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              {taskIsActive ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : runStatus === "failed" ? (
                <AlertCircle className="size-4 text-destructive" />
              ) : (
                <Activity className="size-4 text-primary" />
              )}
              生成任务
            </DialogTitle>
            <DialogDescription>
              查看当前后台生成的阶段、进度和执行详情。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-auto px-5 py-4">
            <div className="grid gap-3 rounded-lg border border-border bg-card p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">状态</span>
                <Badge variant={runStatus === "failed" ? "destructive" : "secondary"}>
                  {RUN_STATUS_LABEL[runStatus]}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">进度</span>
                <span className="font-mono">{runProgress}%</span>
              </div>
              <div className="grid gap-1">
                <span className="text-muted-foreground">消息</span>
                <span>
                  {sanitizeTaskText(runMessage ?? errorMessage) || "暂无进行中的任务"}
                </span>
              </div>
              {currentRunDiagnostics.providerModel && (
                <div className="grid gap-1">
                  <span className="text-muted-foreground">模型</span>
                  <span className="font-mono text-xs">
                    {currentRunDiagnostics.providerModel}
                  </span>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            {uiMockup && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Palette className="size-3.5" />
                  界面设计图
                </div>
                <div
                  className={
                    uiMockup.status === "failed"
                      ? "rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
                      : "rounded-lg border border-border bg-card p-3"
                  }
                >
                  {uiMockup.status === "completed" && uiMockupImage ? (
                    <a
                      href={uiMockupImage}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border border-border bg-background"
                      title="查看界面设计图大图"
                    >
                      <img
                        src={uiMockupImage}
                        alt="界面设计图"
                        className="max-h-56 w-full object-contain"
                      />
                    </a>
                  ) : (
                    <div className="text-sm">
                      {uiMockup.errorMessage ?? "设计图暂未生成"}
                    </div>
                  )}
                  <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    <span>图片模型：{uiMockup.model}</span>
                    <span>{uiMockup.summary}</span>
                  </div>
                </div>
              </div>
            )}

            {currentRunDiagnostics.uiFidelityReport && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <CheckCircle2 className="size-3.5" />
                  设计图还原检查
                </div>
                <div className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {currentRunDiagnostics.uiFidelityReport.summary}
                    </span>
                    <Badge
                      variant={
                        currentRunDiagnostics.uiFidelityReport.passed
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {currentRunDiagnostics.uiFidelityReport.passed
                        ? "基本贴合"
                        : "需要修复"}
                    </Badge>
                  </div>
                  {currentRunDiagnostics.uiFidelityReport.matched.length > 0 && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      已匹配：
                      {currentRunDiagnostics.uiFidelityReport.matched
                        .slice(0, 3)
                        .map(sanitizeTaskText)
                        .join("；")}
                    </div>
                  )}
                  {currentRunDiagnostics.uiFidelityReport.missing.length > 0 && (
                    <div className="mt-2 text-xs text-destructive">
                      待改进：
                      {currentRunDiagnostics.uiFidelityReport.missing
                        .slice(0, 3)
                        .map(sanitizeTaskText)
                        .join("；")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {requirementTraceEntries.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <FileCode2 className="size-3.5" />
                  需求调试追踪
                </div>
                <div className="space-y-2">
                  {requirementTraceEntries.map((entry, index) => {
                    const body = getTraceEntryBody(entry);
                    const errorSummary = entry.errorMessage
                      ? sanitizeTaskText(entry.errorMessage).slice(0, 120)
                      : null;
                    return (
                      <details
                        key={`${entry.stage}:${entry.diagramKind ?? "all"}:${entry.attempt}:${entry.kind}:${index}`}
                        className="rounded-md border border-border bg-background p-3 text-sm"
                      >
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {formatRequirementTraceEntryTitle(entry)}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">
                                  {TRACE_KIND_LABELS[entry.kind]}
                                </Badge>
                                <span>
                                  {new Date(entry.createdAt).toLocaleString()}
                                </span>
                              </div>
                              {errorSummary && (
                                <div className="mt-1 text-xs text-destructive">
                                  {errorSummary}
                                </div>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              title="复制追踪内容"
                              aria-label="复制追踪内容"
                              onClick={(event) => {
                                event.preventDefault();
                                void copyTraceEntry(entry);
                              }}
                            >
                              <Copy className="size-4" />
                            </Button>
                          </div>
                        </summary>
                        <pre className="mt-3 max-h-52 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
                          {sanitizeTaskText(body)}
                        </pre>
                      </details>
                    );
                  })}
                </div>
              </div>
            )}

            {designTraceEntries.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <FileCode2 className="size-3.5" />
                  设计调试追踪
                </div>
                <div className="space-y-2">
                  {designTraceEntries.map((entry, index) => {
                    const body = getTraceEntryBody(entry);
                    const errorSummary = entry.errorMessage
                      ? sanitizeTaskText(entry.errorMessage).slice(0, 120)
                      : null;
                    return (
                      <details
                        key={`${entry.stage}:${entry.diagramKind ?? "all"}:${entry.attempt}:${entry.kind}:${index}`}
                        className="rounded-md border border-border bg-background p-3 text-sm"
                      >
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {formatDesignTraceEntryTitle(entry)}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">
                                  {TRACE_KIND_LABELS[entry.kind]}
                                </Badge>
                                <span>
                                  {new Date(entry.createdAt).toLocaleString()}
                                </span>
                              </div>
                              {errorSummary && (
                                <div className="mt-1 text-xs text-destructive">
                                  {errorSummary}
                                </div>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              title="复制追踪内容"
                              aria-label="复制追踪内容"
                              onClick={(event) => {
                                event.preventDefault();
                                void copyTraceEntry(entry);
                              }}
                            >
                              <Copy className="size-4" />
                            </Button>
                          </div>
                        </summary>
                        <pre className="mt-3 max-h-52 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
                          {sanitizeTaskText(body)}
                        </pre>
                      </details>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Activity className="size-3.5" />
                阶段清单
              </div>
              {taskStages.length > 0 ? (
                <div className="space-y-2">
                  {taskStages.map((stage, index) => {
                    const completed =
                      runStatus === "completed" ||
                      (activeStageIndex >= 0 && index < activeStageIndex);
                    const current =
                      currentRunDiagnostics.activeStage === stage &&
                      (taskIsActive || runStatus === "failed");
                    const failed = current && runStatus === "failed";
                    const detail = completed
                      ? "已完成"
                      : failed
                        ? "执行失败"
                        : current
                          ? sanitizeTaskText(
                              runMessage ??
                                currentRunDiagnostics.stageMessages[stage],
                            ) || "正在执行"
                          : "等待执行";

                    return (
                      <div
                        key={stage}
                        className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 rounded-md border border-border bg-background p-3 text-sm"
                      >
                        <span className="mt-0.5 inline-flex size-5 items-center justify-center">
                          {completed ? (
                            <CheckCircle2 className="size-4 text-success" />
                          ) : failed ? (
                            <AlertCircle className="size-4 text-destructive" />
                          ) : current ? (
                            <Loader2 className="size-4 animate-spin text-primary" />
                          ) : (
                            <span className="size-3 rounded-full border border-muted-foreground/40" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {formatStageLabel(stage)}
                          </span>
                          <span
                            className={
                              completed
                                ? "block truncate text-xs text-success"
                                : failed
                                  ? "block truncate text-xs text-destructive"
                                  : current
                                    ? "block truncate text-xs text-primary"
                                    : "block truncate text-xs text-muted-foreground"
                            }
                          >
                            {detail}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  暂无任务阶段。
                </div>
              )}
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Activity className="size-3.5" />
                执行详情
              </div>
              <div
                ref={executionDetailRef}
                className="max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 shadow-inner"
              >
                {currentRunDiagnostics.streamText ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {sanitizeTaskText(currentRunDiagnostics.streamText)}
                    <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-primary align-[-2px]" />
                  </pre>
                ) : (
                  <div className="text-zinc-400">等待模型输出...</div>
                )}
              </div>
              {recentEvents.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {recentEvents.map((event) => (
                    <span
                      key={event.id}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      title={sanitizeTaskText(event.detail) || event.label}
                    >
                      {sanitizeTaskText(event.label)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
            title="导出"
            aria-label="导出"
          >
            <Download className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel>导出当前工作区</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={exportMarkdown}>
            <FileText className="size-4" /> 运行报告
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              .md
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportJson}>
            <FileCode2 className="size-4" /> 当前快照
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              .json
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={exportRequirementsSpec}>
            <FileText className="size-4" /> 需求规格说明书
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              .docx
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportSoftwareDesignSpec}>
            <FileText className="size-4" /> 软件设计说明书
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              .docx
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
        title="历史快照"
        aria-label="历史"
        onClick={openHistoryDrawer}
      >
        <History className="size-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
        onClick={toggle}
        title={theme === "dark" ? "切换到浅色" : "切换到深色"}
      >
        {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
        onClick={() => toast.message("设计规范正在接入")}
        title="设计规范"
        aria-label="设计规范"
      >
        <Palette className="size-5" />
      </Button>
      <SettingsDialog />
      <div className="hidden h-12 shrink-0 items-center gap-2 rounded-full bg-secondary px-2.5 pr-3 text-sm font-semibold text-secondary-foreground md:flex">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
          U
        </span>
        <span>uml</span>
        <Settings className="size-4 text-muted-foreground" />
      </div>
      </div>
    </header>
  );
}
