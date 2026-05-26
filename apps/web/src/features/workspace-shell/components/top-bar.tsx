import { useEffect, useMemo, useRef } from "react";
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
  RotateCcw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CodeTraceEntry,
  DesignTraceEntry,
  DesignDiagramKind,
  DiagramKind,
  RequirementTraceEntry,
  RunSnapshot,
  RunStage,
} from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { AccountDialog } from "../../user-platform/components/account-dialog";
import { useAuthenticatedRouteSession } from "../../user-platform/components/authenticated-route-session";
import { useTheme } from "../../../app/providers/theme-provider";
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
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  SHELL_ROUTE_MODULES,
  type ShellRoutePath,
} from "../../../app/workspace-modules";

export type { ShellRoutePath };

type TopBarProps = {
  currentRoute: string | null;
  onNavigate: (route: string) => void;
};

type ProjectWorkspaceActionsProps = {
  projectId: string;
  onOpenDrawer: (kind: "tasks" | "history") => void;
};

const RUN_STATUS_LABEL = {
  idle: "暂无任务",
  queued: "排队中",
  running: "生成中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
} as const;

const SUBTASK_STATUS_LABEL = {
  queued: "排队",
  running: "生成中",
  repairing: "修复中",
  rendering: "渲染中",
  completed: "完成",
  failed: "失败",
  pending_review: "待确认",
} as const;

const QUEUE_REASON_LABEL = {
  global: "服务器忙",
  provider: "供应商繁忙",
  project: "项目并发已满",
  user: "用户并发已满",
  run: "本次任务并发已满",
} as const;

type RunKind = "requirements" | "design" | "code" | "document";

const REQUIREMENT_DIAGRAM_KINDS = [
  "usecase",
  "class",
  "activity",
  "deployment",
] as const satisfies readonly DiagramKind[];
const DESIGN_DIAGRAM_KINDS = [
  "sequence",
  "class",
  "activity",
  "deployment",
  "table",
] as const satisfies readonly DesignDiagramKind[];

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
  verify_code_business_assertions: "验证业务断言",
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
    "verify_code_business_assertions",
    "verify_code_preview",
    "repair_code_files",
  ],
  document: ["generate_document_text", "render_document_file"],
};

const topBarActionButtonClass =
  "size-10 shrink-0 rounded-full bg-transparent text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground";

const taskStatusButtonClass =
  "h-10 shrink-0 rounded-full bg-secondary px-4 text-sm text-secondary-foreground shadow-none hover:bg-secondary/80";

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
    ["verify_code_business_assertions", "验证业务断言"],
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

const TRACE_KIND_LABELS: Record<string, string> = {
  llm_output: "模型原始返回",
  parse_error: "解析错误",
  parsed_model: "解析后的模型",
  parsed_data: "解析后的数据",
  validation_error: "校验错误",
  plantuml_source: "PlantUML 源码",
  render_error: "渲染错误",
  repair_output: "修复原始返回",
  repaired_data: "修复后数据",
  repaired_plantuml: "修复后 PlantUML",
  file_content: "文件内容结果",
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

function formatCodeTraceEntryTitle(entry: CodeTraceEntry) {
  const stageLabel =
    entry.stage === "generate_file_operations"
      ? "生成代码文件操作"
      : entry.stage === "generate_implementation_brief"
      ? "生成代码实现蓝图"
      : entry.stage === "generate_file_manifest"
        ? "生成文件清单"
        : "生成单文件内容";
  return [
    stageLabel,
    entry.path ?? "全局",
    `第 ${entry.attempt} 次`,
    TRACE_KIND_LABELS[entry.kind],
  ].join(" / ");
}

function getTraceEntryBody(entry: DesignTraceEntry | RequirementTraceEntry | CodeTraceEntry) {
  if (entry.rawOutput) {
    return entry.errorMessage
      ? `${entry.rawOutput}\n\n${entry.errorMessage}`
      : entry.rawOutput;
  }
  if ("plantUmlSource" in entry && entry.plantUmlSource) return entry.plantUmlSource;
  if (entry.errorMessage) return entry.errorMessage;
  if (entry.parsedData !== undefined) {
    return JSON.stringify(entry.parsedData, null, 2);
  }
  return "无详细内容";
}

type VisibleSubtask = NonNullable<
  ReturnType<typeof useWorkspaceSession>["visibleGenerationTask"]
>["subtasks"][number];
type VisibleGenerationTask = NonNullable<
  ReturnType<typeof useWorkspaceSession>["visibleGenerationTask"]
>;
type StageTodoStatus =
  | "waiting"
  | "queued"
  | "running"
  | "completed"
  | "failed";
type StageTodoItem = {
  stage: RunStage;
  label: string;
  status: StageTodoStatus;
  detail: string;
  summary: string | null;
  subtasks: VisibleSubtask[];
};

function formatDuration(ms?: number) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `约 ${Math.ceil(seconds / 60)} 分钟`;
}

function formatSubtaskDetail(subtask: VisibleSubtask) {
  if (subtask.status === "queued" && typeof subtask.queueAhead === "number") {
    const reason = subtask.queueReason
      ? QUEUE_REASON_LABEL[subtask.queueReason]
      : "排队中";
    const waited = formatDuration(subtask.waitMs);
    const estimate = formatDuration(subtask.estimatedWaitMs);
    return [
      `${reason}，前方 ${subtask.queueAhead} 个模型调用`,
      waited ? `已等待 ${waited}` : null,
      estimate ? `预计还需 ${estimate}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (subtask.status === "pending_review") {
    return `有 ${subtask.pendingReviewCount ?? 1} 条追踪关系需复核`;
  }
  return sanitizeTaskText(subtask.errorMessage ?? subtask.message ?? "");
}

function getSubtaskStage(
  taskKind: VisibleGenerationTask["kind"],
  subtaskId: string,
): RunStage | null {
  if (taskKind === "requirements") return "generate_models";
  if (taskKind === "design") {
    return subtaskId === "sequence"
      ? "generate_design_sequence"
      : "generate_design_models";
  }
  return null;
}

function isActiveSubtask(status: VisibleSubtask["status"]) {
  return status === "running" || status === "repairing" || status === "rendering";
}

function isCompletedSubtask(status: VisibleSubtask["status"]) {
  return status === "completed" || status === "pending_review";
}

function summarizeStageSubtasks(subtasks: VisibleSubtask[]) {
  if (subtasks.length === 0) return null;
  const completed = subtasks.filter((subtask) =>
    isCompletedSubtask(subtask.status),
  ).length;
  const queued = subtasks.filter((subtask) => subtask.status === "queued").length;
  const failed = subtasks.filter((subtask) => subtask.status === "failed").length;
  const pendingReview = subtasks.filter(
    (subtask) => subtask.status === "pending_review",
  ).length;
  const running = subtasks.filter((subtask) => subtask.status === "running").length;
  const repairing = subtasks.filter((subtask) => subtask.status === "repairing").length;
  const rendering = subtasks.filter((subtask) => subtask.status === "rendering").length;
  const parts = [`${completed}/${subtasks.length} 完成`];
  if (queued > 0) parts.push(`${queued} 个排队`);
  if (running > 0) parts.push(`${running} 个生成中`);
  if (repairing > 0) parts.push(`${repairing} 个修复中`);
  if (rendering > 0) parts.push(`${rendering} 个渲染中`);
  if (failed > 0) parts.push(`${failed} 个失败`);
  if (pendingReview > 0) parts.push(`${pendingReview} 个待确认`);
  return parts.join("，");
}

function getStageStatusFromSubtasks(
  subtasks: VisibleSubtask[],
): StageTodoStatus | null {
  if (subtasks.length === 0) return null;
  if (subtasks.some((subtask) => subtask.status === "failed")) return "failed";
  if (subtasks.some((subtask) => isActiveSubtask(subtask.status))) return "running";
  if (subtasks.some((subtask) => subtask.status === "queued")) return "queued";
  if (subtasks.every((subtask) => isCompletedSubtask(subtask.status))) {
    return "completed";
  }
  return "waiting";
}

function buildStageTodoItems({
  taskStages,
  selectedTask,
  diagnostics,
  runStatus,
}: {
  taskStages: RunStage[];
  selectedTask: VisibleGenerationTask | null;
  diagnostics: ReturnType<typeof useWorkspaceSession>["currentRunDiagnostics"];
  runStatus: keyof typeof RUN_STATUS_LABEL;
}): StageTodoItem[] {
  const activeStageIndex = diagnostics.activeStage
    ? taskStages.indexOf(diagnostics.activeStage)
    : -1;
  return taskStages.map((stage, index) => {
    const subtasks =
      selectedTask?.subtasks.filter(
        (subtask) => getSubtaskStage(selectedTask.kind, subtask.id) === stage,
      ) ?? [];
    const subtaskStatus = getStageStatusFromSubtasks(subtasks);
    const completedByStage =
      runStatus === "completed" || (activeStageIndex >= 0 && index < activeStageIndex);
    const current =
      diagnostics.activeStage === stage && (runStatus === "queued" || runStatus === "running");
    const failed =
      diagnostics.activeStage === stage && runStatus === "failed";
    const status =
      subtaskStatus ??
      (completedByStage
        ? "completed"
        : failed
          ? "failed"
          : current
            ? "running"
            : "waiting");
    const summary = summarizeStageSubtasks(subtasks);
    const detail =
      summary ??
      (status === "completed"
        ? "已完成"
        : status === "failed"
          ? "执行失败"
          : status === "running"
            ? sanitizeTaskText(
                diagnostics.stageMessages[stage] ??
                  (diagnostics.activeStage === stage ? null : undefined),
              ) || "正在执行"
            : status === "queued"
              ? "排队中"
              : "等待执行");
    return {
      stage,
      label: formatStageLabel(stage),
      status,
      detail,
      summary,
      subtasks,
    };
  });
}

export function ProjectGenerationTasksDrawerContent() {
  const executionDetailRef = useRef<HTMLDivElement | null>(null);
  const {
    runStatus,
    runProgress,
    runMessage,
    errorMessage,
    currentRunDiagnostics,
    generationTasks,
    selectedGenerationTaskId,
    selectGenerationTask,
    clearCompletedGenerationTasks,
    generateDiagrams,
    generateDesignDiagrams,
  } =
    useWorkspaceSession();
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
  const uiMockup = currentRunDiagnostics.uiMockup;
  const uiMockupImage = uiMockup?.imageUrl ?? uiMockup?.imageDataUrl ?? null;
  const requirementTraceEntries = currentRunDiagnostics.requirementTrace;
  const designTraceEntries = currentRunDiagnostics.designTrace;
  const codeTraceEntries = currentRunDiagnostics.codeTrace;
  const selectedTask =
    generationTasks.find((task) => task.clientTaskId === selectedGenerationTaskId) ??
    generationTasks.find((task) => task.status === "queued" || task.status === "running") ??
    generationTasks[0] ??
    null;
  const pendingReviewSubtasks =
    selectedTask?.subtasks.filter((subtask) => subtask.status === "pending_review") ??
    [];
  const stageTodoItems = useMemo(
    () =>
      buildStageTodoItems({
        taskStages,
        selectedTask,
        diagnostics: currentRunDiagnostics,
        runStatus,
      }),
    [currentRunDiagnostics, runStatus, selectedTask, taskStages],
  );
  const retrySubtask = (subtaskId: string) => {
    if (!selectedTask || taskIsActive) return;
    if (
      selectedTask.kind === "requirements" &&
      REQUIREMENT_DIAGRAM_KINDS.includes(subtaskId as DiagramKind)
    ) {
      void generateDiagrams([subtaskId as DiagramKind]);
      return;
    }
    if (
      selectedTask.kind === "design" &&
      DESIGN_DIAGRAM_KINDS.includes(subtaskId as DesignDiagramKind)
    ) {
      void generateDesignDiagrams([subtaskId as DesignDiagramKind]);
    }
  };

  useEffect(() => {
    const element = executionDetailRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [
    currentRunDiagnostics.activeStage,
    currentRunDiagnostics.streamText,
  ]);

  const copyTraceEntry = async (
    entry: DesignTraceEntry | RequirementTraceEntry | CodeTraceEntry,
  ) => {
    try {
      await navigator.clipboard.writeText(getTraceEntryBody(entry));
      toast.success("已复制追踪内容");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden text-sm">
            {generationTasks.length > 0 && (
              <div className="mb-4 min-w-0 max-w-full overflow-hidden">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    任务列表
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={clearCompletedGenerationTasks}
                  >
                    清理已完成
                  </Button>
                </div>
                <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden">
                  {generationTasks.map((task) => {
                    const selected = task.clientTaskId === selectedGenerationTaskId;
                    const active =
                      task.status === "queued" || task.status === "running";
                    const taskMessage = sanitizeTaskText(
                      task.message ?? task.errorMessage ?? "",
                    );
                    return (
                      <button
                        key={task.clientTaskId}
                        type="button"
                        className={cn(
                          "flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                          selected && "border-primary bg-primary/5",
                        )}
                        onClick={() => selectGenerationTask(task.clientTaskId)}
                      >
                        {active ? (
                          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                        ) : task.status === "failed" ? (
                          <AlertCircle className="size-4 shrink-0 text-destructive" />
                        ) : (
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
                        )}
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate font-medium" title={task.title}>
                            {task.title}
                          </span>
                          <span
                            className="mt-0.5 block truncate text-xs text-muted-foreground"
                            title={taskMessage || RUN_STATUS_LABEL[task.status]}
                          >
                            {taskMessage || RUN_STATUS_LABEL[task.status]}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {task.progress}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              data-testid="generation-task-status-card"
              className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 text-sm"
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-muted-foreground">状态</span>
                <Badge variant={runStatus === "failed" ? "destructive" : "secondary"}>
                  {RUN_STATUS_LABEL[runStatus]}
                </Badge>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-muted-foreground">进度</span>
                <span className="shrink-0 font-mono">{runProgress}%</span>
              </div>
              <div className="grid min-w-0 gap-1">
                <span className="text-muted-foreground">消息</span>
                <span
                  className="min-w-0 break-words"
                  title={sanitizeTaskText(runMessage ?? errorMessage)}
                >
                  {sanitizeTaskText(runMessage ?? errorMessage) || "暂无进行中的任务"}
                </span>
              </div>
              {currentRunDiagnostics.providerModel && (
                <div className="grid min-w-0 gap-1">
                  <span className="text-muted-foreground">模型</span>
                  <span
                    className="min-w-0 truncate font-mono text-xs"
                    title={currentRunDiagnostics.providerModel}
                  >
                    {currentRunDiagnostics.providerModel}
                  </span>
                </div>
              )}
            </div>

            {errorMessage && (
              <div
                data-testid="generation-task-error-card"
                className="mt-4 min-w-0 max-w-full overflow-hidden rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <span className="block break-words" title={errorMessage}>
                  {errorMessage}
                </span>
              </div>
            )}

            {pendingReviewSubtasks.length > 0 && (
              <div className="mt-5 min-w-0 max-w-full overflow-hidden rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
                有 {pendingReviewSubtasks.reduce(
                  (sum, subtask) => sum + (subtask.pendingReviewCount ?? 1),
                  0,
                )}{" "}
                条追踪关系由系统自动补齐，需复核后再视为确认结果。
              </div>
            )}

            {uiMockup && (
              <div className="mt-5 min-w-0 max-w-full overflow-hidden">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Palette className="size-3.5" />
                  界面设计图
                </div>
                <div
                  className={
                    uiMockup.status === "failed"
                      ? "min-w-0 max-w-full overflow-hidden rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
                      : "min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-3"
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
                    <div className="break-words text-sm">
                      {uiMockup.errorMessage ?? "设计图暂未生成"}
                    </div>
                  )}
                  <div className="mt-2 grid min-w-0 gap-1 text-xs text-muted-foreground">
                    <span className="truncate" title={uiMockup.model}>
                      图片模型：{uiMockup.model}
                    </span>
                    <span className="break-words" title={uiMockup.summary}>
                      {uiMockup.summary}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {currentRunDiagnostics.uiFidelityReport && (
              <div className="mt-5 min-w-0 max-w-full overflow-hidden">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <CheckCircle2 className="size-3.5" />
                  设计图还原检查
                </div>
                <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 break-words font-medium">
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
                </div>
              </div>
            )}

            {(codeTraceEntries.length > 0 ||
              requirementTraceEntries.length > 0 ||
              designTraceEntries.length > 0) && (
              <details
                className="mt-5 min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-3"
                open={selectedTask?.technicalDetailsCollapsed === false}
              >
                <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground">
                  技术详情 · 原始追踪与解析日志
                </summary>
                <div className="mt-3 min-w-0 max-w-full space-y-2 overflow-hidden">
                  {designTraceEntries.length > 0 && (
                    <div className="text-xs font-semibold text-muted-foreground">
                      设计调试追踪
                    </div>
                  )}
                  {codeTraceEntries.length > 0 && (
                    <div className="text-xs font-semibold text-muted-foreground">
                      代码调试追踪
                    </div>
                  )}
                  {requirementTraceEntries.length > 0 && (
                    <div className="text-xs font-semibold text-muted-foreground">
                      需求调试追踪
                    </div>
                  )}
                  {[
                    ...codeTraceEntries.map((entry) => ({ entry, group: "code" as const })),
                    ...requirementTraceEntries.map((entry) => ({
                      entry,
                      group: "requirement" as const,
                    })),
                    ...designTraceEntries.map((entry) => ({
                      entry,
                      group: "design" as const,
                    })),
                  ]
                    .slice(0, 8)
                    .map(({ entry, group }, index) => {
                      const body = getTraceEntryBody(entry);
                      const title =
                        group === "code"
                          ? formatCodeTraceEntryTitle(entry)
                          : group === "design"
                            ? formatDesignTraceEntryTitle(entry)
                            : formatRequirementTraceEntryTitle(entry as RequirementTraceEntry);
                      return (
                        <details
                          key={`${entry.stage}:${entry.attempt}:${entry.kind}:${index}`}
                          className="min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-background p-3 text-sm"
                        >
                          <summary className="cursor-pointer list-none">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0 overflow-hidden">
                                <div className="truncate font-medium">{title}</div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline">
                                    {TRACE_KIND_LABELS[entry.kind]}
                                  </Badge>
                                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                                </div>
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
                          <pre className="mt-3 max-h-52 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
                            {sanitizeTaskText(body)}
                          </pre>
                        </details>
                      );
                    })}
                </div>
              </details>
            )}

            <div className="mt-5 min-w-0 max-w-full overflow-hidden">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Activity className="size-3.5" />
                链路阶段
              </div>
              {stageTodoItems.length > 0 ? (
                <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden">
                  {stageTodoItems.map((item) => {
                    return (
                      <div
                        key={item.stage}
                        data-testid="generation-task-stage-card"
                        className="grid w-full min-w-0 max-w-full grid-cols-[20px_minmax(0,1fr)] gap-3 overflow-hidden rounded-md border border-border bg-background p-3 text-sm"
                      >
                        <span className="mt-0.5 inline-flex size-5 items-center justify-center">
                          {item.status === "completed" ? (
                            <CheckCircle2 className="size-4 text-success" />
                          ) : item.status === "failed" ? (
                            <AlertCircle className="size-4 text-destructive" />
                          ) : item.status === "running" ? (
                            <Loader2 className="size-4 animate-spin text-primary" />
                          ) : (
                            <span className="size-3 rounded-full border border-muted-foreground/40" />
                          )}
                        </span>
                        <div className="min-w-0 overflow-hidden">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate font-medium">
                              {item.label}
                            </span>
                            {item.summary && (
                              <Badge variant="outline" className="shrink-0">
                                {item.summary}
                              </Badge>
                            )}
                          </span>
                          <span
                            className={
                              item.status === "completed"
                                ? "block truncate text-xs text-success"
                                : item.status === "failed"
                                  ? "block truncate text-xs text-destructive"
                                  : item.status === "running"
                                    ? "block truncate text-xs text-primary"
                                    : "block truncate text-xs text-muted-foreground"
                            }
                          >
                            {item.detail}
                          </span>
                          {item.subtasks.length > 0 && (
                            <div className="mt-3 grid gap-2">
                              {item.subtasks.map((subtask) => {
                                const subtaskDetail =
                                  formatSubtaskDetail(subtask) || "等待执行";
                                return (
                                  <div
                                    key={subtask.id}
                                    className={cn(
                                      "flex min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-md border px-3 py-2",
                                      subtask.status === "failed" &&
                                        "border-destructive/30 bg-destructive/5",
                                      subtask.status === "pending_review" &&
                                        "border-warning/40 bg-warning/10",
                                      subtask.status !== "failed" &&
                                        subtask.status !== "pending_review" &&
                                        "border-border bg-card",
                                    )}
                                  >
                                    <div className="min-w-0 overflow-hidden">
                                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className="truncate font-medium">
                                          {subtask.label}
                                        </span>
                                        <Badge
                                          variant={
                                            subtask.status === "failed"
                                              ? "destructive"
                                              : "outline"
                                          }
                                          className={cn(
                                            subtask.status === "pending_review" &&
                                              "border-warning/40 text-warning",
                                            isActiveSubtask(subtask.status) &&
                                              "border-primary/40 text-primary",
                                            subtask.status === "completed" &&
                                              "border-success/40 text-success",
                                          )}
                                        >
                                          {SUBTASK_STATUS_LABEL[subtask.status]}
                                        </Badge>
                                      </span>
                                      <span
                                        className={cn(
                                          "mt-1 block truncate text-xs text-muted-foreground",
                                          subtask.status === "failed" &&
                                            "text-destructive",
                                          subtask.status === "pending_review" &&
                                            "text-warning",
                                        )}
                                      >
                                        {subtaskDetail}
                                      </span>
                                    </div>
                                    {subtask.status === "failed" &&
                                      (selectedTask?.kind === "requirements" ||
                                        selectedTask?.kind === "design") && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          aria-label="重试此模型"
                                          className="shrink-0"
                                          disabled={taskIsActive}
                                          onClick={() => retrySubtask(subtask.id)}
                                        >
                                          <RotateCcw className="size-3.5" />
                                          重试此模型
                                        </Button>
                                      )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
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

            <details className="mt-5 min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Activity className="size-3.5" />
                <span>执行详情</span>
                <span className="text-muted-foreground/70">· 技术执行流</span>
              </summary>
              <div
                ref={executionDetailRef}
                data-testid="generation-task-execution-box"
                className="mt-3 max-h-64 min-w-0 max-w-full overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 shadow-inner"
              >
                {currentRunDiagnostics.streamText ? (
                  <pre className="whitespace-pre-wrap break-all">
                    {sanitizeTaskText(currentRunDiagnostics.streamText)}
                    <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-primary align-[-2px]" />
                  </pre>
                ) : (
                  <div className="text-zinc-400">等待模型输出...</div>
                )}
              </div>
              {recentEvents.length > 0 && (
                <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-1 overflow-hidden">
                  {recentEvents.map((event) => (
                    <span
                      key={event.id}
                      className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      title={sanitizeTaskText(event.detail) || event.label}
                    >
                      {sanitizeTaskText(event.label)}
                    </span>
                  ))}
                </div>
              )}
            </details>
    </div>
  );
}

export function ProjectWorkspaceActions({
  projectId: _projectId,
  onOpenDrawer,
}: ProjectWorkspaceActionsProps) {
  const {
    requirementText,
    rules,
    models,
    svgArtifacts,
    diagramErrors,
    selectedDiagrams,
    runStatus,
    runProgress,
    errorMessage,
    generationTasks,
  } = useWorkspaceSession();
  const activeTaskCount = generationTasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  ).length;
  const taskIsActive = runStatus === "queued" || runStatus === "running";

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        className={taskStatusButtonClass}
        title="生成任务"
        aria-label="生成任务"
        onClick={() => onOpenDrawer("tasks")}
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
        <span className="hidden max-w-36 truncate font-semibold xl:inline">
          {activeTaskCount > 1
            ? `${activeTaskCount} 个任务`
            : taskIsActive
              ? `${RUN_STATUS_LABEL[runStatus]} ${runProgress}%`
              : RUN_STATUS_LABEL[runStatus]}
        </span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={topBarActionButtonClass}
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
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="ghost"
        className="h-10 shrink-0 rounded-full px-4 text-sm font-medium"
        onClick={() => onOpenDrawer("history")}
      >
        <History className="size-5" />
        运行历史
      </Button>
    </div>
  );
}

export function TopBar({ currentRoute, onNavigate }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const authSession = useAuthenticatedRouteSession();
  const navItems = [
    { route: "/projects", label: "项目" },
    ...SHELL_ROUTE_MODULES.filter((item) => item.route !== "/workspace"),
  ];

  return (
    <header className="flex h-16 shrink-0 flex-nowrap items-center gap-6 overflow-hidden border-b border-sidebar-border bg-background/80 px-6 font-semibold text-sidebar-foreground backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-3">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#a855f7_0%,#60a5fa_100%)] shadow-sm dark:bg-[linear-gradient(135deg,#3b82f6_0%,#60a5fa_100%)]">
          <Boxes className="size-4 text-white" />
        </span>
        <span className="whitespace-nowrap text-[18px] font-semibold leading-7 tracking-[-0.45px]">
          软件工程实验平台
        </span>
      </div>

      <nav className="flex min-w-0 items-center gap-6">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-current={
              currentRoute === item.route ||
              (item.route === "/projects" && currentRoute?.startsWith("/projects"))
                ? "page"
                : undefined
            }
            onClick={() => onNavigate(item.route)}
            className="h-10 px-1 text-[15px] font-semibold text-sidebar-foreground/75 transition-colors hover:text-primary aria-[current=page]:text-primary"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        className={topBarActionButtonClass}
        onClick={toggle}
        title={theme === "dark" ? "切换到浅色" : "切换到深色"}
      >
        {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>
      <AccountDialog onNavigate={onNavigate} initialUser={authSession?.user ?? null} />
      </div>
    </header>
  );
}
