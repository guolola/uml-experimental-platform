// Renders workspace-level navigation, run controls, and account/project entry points.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Boxes,
  CheckCircle2,
  Copy,
  GitBranch,
  History,
  Loader2,
  Menu,
  Moon,
  Palette,
  RotateCcw,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import type {
  CodeTraceEntry,
  DesignTraceEntry,
  DesignDiagramKind,
  DiagramKind,
  RequirementTraceEntry,
  RunStage,
} from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { AccountDialog } from "../../user-platform/components/account-dialog";
import { useAuthenticatedRouteSession } from "../../user-platform/components/authenticated-route-session";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import { useTheme } from "../../../shared/ui/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { cn } from "../../../shared/ui/utils";
import { formatCodeDiagnosticSummary } from "../../../shared/lib/code-diagnostics";
import { useWorkspaceSession } from "../../workspace-session/state";
import { SystemNoticeButton } from "../../system-notices/components/system-notice-dialog";
import {
  SHELL_ROUTE_MODULES,
  type ShellRoutePath,
} from "../../../entities/workspace/modules";
import { LineageGraphDialog } from "../../lineage/components/lineage-graph-dialog";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import { localizeApiFailure } from "../../../shared/i18n/api-errors";

export type { ShellRoutePath };

type TopBarProps = {
  currentRoute: string | null;
  onNavigate: (route: string) => void;
  accountDialogOpen?: boolean;
  onAccountDialogOpenChange?: (open: boolean) => void;
};

type ProjectWorkspaceActionsProps = {
  projectId: string;
  onOpenDrawer: (kind: "tasks" | "history") => void;
  projectRuns?: PlatformRunSummary[];
};

const EMPTY_PROJECT_RUNS: PlatformRunSummary[] = [];

const RUN_STATUS_LABEL = {
  idle: "idle",
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
} as const;

const QUEUE_REASON_LABEL = {
  global: "global",
  provider: "provider",
  project: "project",
  user: "user",
  run: "run",
} as const;

type RunKind = "requirements" | "design" | "code" | "document" | "feasibility";

const REQUIREMENT_DIAGRAM_KINDS = [
  "function",
  "usecase",
  "class",
  "activity",
  "deployment",
  "prototype",
  "analysis",
] as const satisfies readonly DiagramKind[];
const DESIGN_DIAGRAM_KINDS = [
  "architecture",
  "sequence",
  "class",
  "activity",
  "component",
  "deployment",
  "table",
] as const satisfies readonly DesignDiagramKind[];

const STAGE_LABELS: Record<RunStage, string> = {
  extract_rules: "extract_rules", generate_models: "generate_models", generate_design_sequence: "generate_design_sequence",
  generate_design_models: "generate_design_models", generate_tests: "generate_tests", analyze_code_business_logic: "analyze_code_business_logic",
  analyze_code_product: "analyze_code_product", plan_code_ui: "plan_code_ui", generate_code_ui_mockup: "generate_code_ui_mockup",
  analyze_code_ui_mockup: "analyze_code_ui_mockup", generate_code_ui_ir: "generate_code_ui_ir", load_web_design_skill: "load_web_design_skill",
  select_code_skills: "select_code_skills", plan_code_files: "plan_code_files", generate_code_spec: "generate_code_spec",
  generate_code_files: "generate_code_files", plan_code: "plan_code", write_code_files: "write_code_files",
  audit_code_quality: "audit_code_quality", verify_code_ui_fidelity: "verify_code_ui_fidelity", verify_code_rendered_preview: "verify_code_rendered_preview",
  verify_code_business_assertions: "verify_code_business_assertions", verify_code_preview: "verify_code_preview", repair_code_files: "repair_code_files",
  generate_document_text: "generate_document_text", render_document_file: "render_document_file", generate_plantuml: "generate_plantuml",
  render_svg: "render_svg", generate_context: "generate_context", render_context: "render_context", generate_implementation: "generate_implementation",
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
  feasibility: [
    "generate_context",
    "render_context",
    "generate_implementation",
  ],
};

const topBarActionButtonClass =
  "size-10 shrink-0 rounded-full bg-transparent text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground";

const taskStatusButtonClass =
  "h-10 shrink-0 rounded-full bg-transparent px-4 text-sm font-medium text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground";

const mainNavButtonClass =
  "relative h-10 px-1 text-[15px] font-semibold text-sidebar-foreground/75 transition-colors after:absolute after:inset-x-1 after:bottom-1 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:opacity-0 after:transition-all hover:text-primary hover:after:scale-x-100 hover:after:opacity-100 aria-[current=page]:text-primary";

const SHELL_ROUTE_TRANSLATION_KEYS: Partial<Record<string, "workspace" | "exam" | "tutorial">> = {
  "/workspace": "workspace",
  "/exam": "exam",
  "/tutorial": "tutorial",
};

function shellRouteTranslationKey(route: string) {
  return route === "/projects" ? "projects" : (SHELL_ROUTE_TRANSLATION_KEYS[route] ?? "workspace");
}

function formatStageLabel(stage: RunStage | null, t?: TFunction) {
  if (!stage) return t ? t("generation.stages.waiting") : "waiting";
  if (t) return t(`generation.stageLabels.${stage}`);
  return STAGE_LABELS[stage] ?? stage;
}

function sanitizeTaskText(text: string | null | undefined) {
  return text ?? "";
}

function formatTaskDateTime(value: string | null | undefined, locale?: string, t?: TFunction) {
  if (!value) return t ? t("generation.drawer.notRecorded") : "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t ? t("generation.drawer.notRecorded") : "未记录";
  return date.toLocaleString(locale);
}

function formatTaskDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
  t?: TFunction,
) {
  if (!startedAt || !finishedAt) return t ? t("generation.drawer.inProgress") : "进行中";
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
    return t ? t("generation.drawer.notRecorded") : "未记录";
  }
  const seconds = Math.round((finished - started) / 1000);
  if (seconds < 60) return t ? t("generation.drawer.seconds", { count: seconds }) : `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (t) {
    return rest > 0
      ? t("generation.drawer.minuteSeconds", { minutes, seconds: rest })
      : t("generation.drawer.minutes", { count: minutes });
  }
  return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`;
}

function getTaskStages(kind: RunKind | null, activeStage: RunStage | null) {
  const base = kind ? [...STAGES_BY_KIND[kind]] : [];
  if (activeStage && !base.includes(activeStage)) {
    base.push(activeStage);
  }
  return base;
}

function normalizeRunStatus(status: string): keyof typeof RUN_STATUS_LABEL {
  return status in RUN_STATUS_LABEL
    ? (status as keyof typeof RUN_STATUS_LABEL)
    : "idle";
}

function normalizeRunKind(kind: PlatformRunSummary["runKind"]): RunKind | null {
  return kind === "requirements" ||
    kind === "design" ||
    kind === "code" ||
    kind === "document" ||
    kind === "feasibility"
    ? kind
    : null;
}

function normalizeRunStage(stage: PlatformRunSummary["stage"]): RunStage | null {
  return stage && stage in STAGE_LABELS ? (stage as RunStage) : null;
}

function isActiveProjectRun(run: PlatformRunSummary) {
  return run.status === "queued" || run.status === "running";
}

function isActiveGenerationTask(task: { status: string }) {
  return task.status === "queued" || task.status === "running";
}

function projectRunTimestamp(run: PlatformRunSummary) {
  const timestamp =
    run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt ?? "";
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestProjectRun(runs: PlatformRunSummary[]) {
  return [...runs].sort(
    (left, right) => projectRunTimestamp(right) - projectRunTimestamp(left),
  )[0] ?? null;
}

function getProjectRunProgress(run: PlatformRunSummary) {
  const status = normalizeRunStatus(run.status);
  if (status === "queued") return 0;
  if (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  ) {
    return 100;
  }
  const stage = normalizeRunStage(run.stage);
  const stages = getTaskStages(normalizeRunKind(run.runKind), stage);
  const stageIndex = stage ? stages.indexOf(stage) : -1;
  if (stageIndex < 0 || stages.length === 0) return status === "running" ? 5 : 0;
  return Math.min(95, Math.max(5, Math.round(((stageIndex + 1) / stages.length) * 100)));
}

function formatProjectRunTitle(run: PlatformRunSummary, t?: TFunction) {
  const kind = normalizeRunKind(run.runKind);
  if (t) return t(`generation.taskKinds.${kind ?? "unknown"}`);
  if (kind === "requirements") return "需求模型生成";
  if (kind === "design") return "设计模型生成";
  if (kind === "code") return "代码生成";
  if (kind === "document") return "说明书生成";
  if (kind === "feasibility") return "可行性分析生成";
  return "项目生成任务";
}

function runActionLabel(action: string | null | undefined, t: TFunction) {
  if (action === "retry") return t("projectShell.historyUi.retry");
  if (action === "rerun") return t("projectShell.historyUi.rerun");
  return t("projectShell.historyUi.derived");
}

function projectRunRelationMessage(run: PlatformRunSummary, t: TFunction) {
  const parts = [
    run.sourceRunId ? t("projectShell.historyUi.relationSource", { action: runActionLabel(run.sourceAction, t), runId: run.sourceRunId }) : null,
    run.latestActionRunId
      ? t("projectShell.historyUi.relationDerived", { action: runActionLabel(run.latestAction, t), runId: run.latestActionRunId })
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function projectRunCodeDiagnosticMessage(run: PlatformRunSummary) {
  if (normalizeRunKind(run.runKind) !== "code") return null;
  return formatCodeDiagnosticSummary({
    codeDiagnosticCount: run.codeDiagnosticCount,
    codeDiagnosticSummary: run.codeDiagnosticSummary,
  });
}

function formatProjectRunMessage(run: PlatformRunSummary, t?: TFunction) {
  const relation = t ? projectRunRelationMessage(run, t) : "";
  const status = normalizeRunStatus(run.status);
  const codeDiagnostics = projectRunCodeDiagnosticMessage(run);
  if (run.error || run.errorMessage) {
    return [relation, localizeApiFailure(run.error ? { error: run.error } : null, 500)]
      .filter(Boolean)
      .join(" · ");
  }
  if (status === "interrupted") {
    return [relation, t ? t("generation.status.interruptedDetail") : "interrupted"].filter(Boolean).join(" · ");
  }
  if (codeDiagnostics) {
    return [relation, codeDiagnostics].filter(Boolean).join(" · ");
  }
  if (status === "queued") return [relation, t ? t("generation.status.queued") : "任务正在排队"].filter(Boolean).join(" · ");
  const stage = normalizeRunStage(run.stage);
  const statusMessage = stage
    ? formatStageLabel(stage, t)
    : t
      ? t(`generation.status.${status}`)
      : RUN_STATUS_LABEL[status];
  return [relation, statusMessage].filter(Boolean).join(" · ");
}

function runStatusBadgeVariant(status: keyof typeof RUN_STATUS_LABEL) {
  if (status === "failed") return "destructive";
  if (status === "interrupted") return "warning";
  if (status === "completed") return "success";
  return "secondary";
}

const TRACE_KIND_LABELS: Record<string, string> = {
  llm_output: "llm_output",
  parse_error: "parse_error",
  parsed_model: "parsed_model",
  parsed_data: "parsed_data",
  validation_error: "validation_error",
  plantuml_source: "plantuml_source",
  render_error: "渲染错误",
  repair_output: "修复原始返回",
  repaired_data: "修复后数据",
  repaired_plantuml: "修复后 PlantUML",
  file_content: "文件内容结果",
};

function formatDesignTraceEntryTitle(entry: DesignTraceEntry, t?: TFunction) {
  return [
    formatStageLabel(entry.stage, t),
    entry.diagramKind ?? (t ? t("generation.drawer.traceGlobal") : "全局"),
    t ? t("generation.drawer.traceAttempt", { count: entry.attempt }) : `第 ${entry.attempt} 次`,
    t ? t(`generation.drawer.traceKinds.${entry.kind}`) : TRACE_KIND_LABELS[entry.kind],
  ].join(" / ");
}

function formatRequirementTraceEntryTitle(entry: RequirementTraceEntry, t?: TFunction) {
  return [
    formatStageLabel(entry.stage, t),
    entry.diagramKind ?? (t ? t("generation.drawer.traceGlobal") : "全局"),
    t ? t("generation.drawer.traceAttempt", { count: entry.attempt }) : `第 ${entry.attempt} 次`,
    t ? t(`generation.drawer.traceKinds.${entry.kind}`) : TRACE_KIND_LABELS[entry.kind],
  ].join(" / ");
}

function formatCodeTraceEntryTitle(entry: CodeTraceEntry, t?: TFunction) {
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
    entry.path ?? (t ? t("generation.drawer.traceGlobal") : "全局"),
    t ? t("generation.drawer.traceAttempt", { count: entry.attempt }) : `第 ${entry.attempt} 次`,
    t ? t(`generation.drawer.traceKinds.${entry.kind}`) : TRACE_KIND_LABELS[entry.kind],
  ].join(" / ");
}

function getTraceEntryBody(entry: DesignTraceEntry | RequirementTraceEntry | CodeTraceEntry, t?: TFunction) {
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
  return t ? t("generation.drawer.noTechnicalDetails") : "无详细内容";
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

function formatDuration(ms: number | undefined, t?: TFunction) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return t ? t("generation.drawer.seconds", { count: seconds }) : `${seconds} 秒`;
  return t
    ? t("generation.drawer.aboutMinutes", { count: Math.ceil(seconds / 60) })
    : `约 ${Math.ceil(seconds / 60)} 分钟`;
}

function formatSubtaskDetail(subtask: VisibleSubtask, t?: TFunction) {
  if (subtask.status === "queued" && typeof subtask.queueAhead === "number") {
    const reason = subtask.queueReason
      ? (t ? t(`generation.drawer.queueReasons.${subtask.queueReason}`) : QUEUE_REASON_LABEL[subtask.queueReason])
      : (t ? t("generation.drawer.queued") : "排队中");
    const waited = formatDuration(subtask.waitMs, t);
    const estimate = formatDuration(subtask.estimatedWaitMs, t);
    return [
      t ? t("generation.drawer.queueAhead", { reason, count: subtask.queueAhead }) : `${reason}，前方 ${subtask.queueAhead} 个模型调用`,
      waited ? (t ? t("generation.drawer.waited", { duration: waited }) : `已等待 ${waited}`) : null,
      estimate ? (t ? t("generation.drawer.estimated", { duration: estimate }) : `预计还需 ${estimate}`) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (subtask.status === "pending_review") {
    return t
      ? t("generation.drawer.pendingRelations", { count: subtask.pendingReviewCount ?? 1 })
      : `有 ${subtask.pendingReviewCount ?? 1} 条追踪关系需复核`;
  }
  if (t) return t(`generation.drawer.subtaskStatus.${subtask.status}`);
  return subtask.status === "completed"
    ? "已完成"
    : sanitizeTaskText(subtask.errorMessage ?? subtask.message ?? "");
}

function isRequirementRuleSubtask(subtaskId: string) {
  return subtaskId === "extract_rules" || subtaskId === "repair_rules";
}

function isRequirementRulesTask(task: VisibleGenerationTask | null) {
  return Boolean(
    task &&
      task.kind === "requirements" &&
      task.subtasks.some((subtask) => isRequirementRuleSubtask(subtask.id)),
  );
}

const STAGE_SCOPED_SUBTASK_STAGES = [
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
  "generate_plantuml",
  "render_svg",
] as const satisfies readonly RunStage[];

function splitScopedSubtaskId(id: string) {
  const stage = STAGE_SCOPED_SUBTASK_STAGES.find((candidate) =>
    id.startsWith(`${candidate}:`),
  );
  if (!stage) return null;
  return {
    stage,
    rawId: id.slice(stage.length + 1),
  };
}

function rawSubtaskId(id: string) {
  return splitScopedSubtaskId(id)?.rawId ?? id;
}

function retryDiagramId(id: string) {
  return rawSubtaskId(id).split(":")[0] ?? rawSubtaskId(id);
}

function retrySubtaskActionLabel(id: string, t?: TFunction) {
  return rawSubtaskId(id).includes(":")
    ? (t ? t("generation.drawer.retrySameKind") : "重试全部同类模型")
    : (t ? t("generation.drawer.retryOne") : "重试此模型");
}

function retrySubtaskActionTitle(id: string, t?: TFunction) {
  return rawSubtaskId(id).includes(":")
    ? (t ? t("generation.drawer.retrySameKindTitle") : "当前重试按模型类型执行，会重试同类模型而不是单个实例")
    : (t ? t("generation.drawer.retryOne") : "重试此模型");
}

function getSubtaskStage(
  taskKind: VisibleGenerationTask["kind"],
  subtaskId: string,
): RunStage | null {
  const scoped = splitScopedSubtaskId(subtaskId);
  if (scoped) return scoped.stage;
  if (isRequirementRuleSubtask(subtaskId)) return "extract_rules";
  if (taskKind === "requirements") return "generate_models";
  if (taskKind === "design") {
    return subtaskId === "sequence" || subtaskId.startsWith("sequence:")
      ? "generate_design_sequence"
      : "generate_design_models";
  }
  return null;
}

function getVisibleTaskStages(
  kind: RunKind | null,
  activeStage: RunStage | null,
  selectedTask: VisibleGenerationTask | null,
): RunStage[] {
  if (isRequirementRulesTask(selectedTask)) {
    return ["extract_rules"];
  }
  return getTaskStages(kind, activeStage);
}

function isActiveSubtask(status: VisibleSubtask["status"]) {
  return status === "running" || status === "repairing" || status === "rendering";
}

function isCompletedSubtask(status: VisibleSubtask["status"]) {
  return status === "completed" || status === "pending_review";
}

function summarizeStageSubtasks(subtasks: VisibleSubtask[], t?: TFunction) {
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
  const parts = [t ? t("generation.drawer.completedCount", { completed, total: subtasks.length }) : `${completed}/${subtasks.length} 完成`];
  if (queued > 0) parts.push(t ? t("generation.drawer.queuedCount", { count: queued }) : `${queued} 个排队`);
  if (running > 0) parts.push(t ? t("generation.drawer.runningCount", { count: running }) : `${running} 个生成中`);
  if (repairing > 0) parts.push(t ? t("generation.drawer.repairingCount", { count: repairing }) : `${repairing} 个修复中`);
  if (rendering > 0) parts.push(t ? t("generation.drawer.renderingCount", { count: rendering }) : `${rendering} 个渲染中`);
  if (failed > 0) parts.push(t ? t("generation.drawer.failedCount", { count: failed }) : `${failed} 个失败`);
  if (pendingReview > 0) parts.push(t ? t("generation.drawer.reviewCount", { count: pendingReview }) : `${pendingReview} 个待确认`);
  return parts.join(t ? ", " : "，");
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
  t,
}: {
  taskStages: RunStage[];
  selectedTask: VisibleGenerationTask | null;
  diagnostics: ReturnType<typeof useWorkspaceSession>["currentRunDiagnostics"];
  runStatus: keyof typeof RUN_STATUS_LABEL;
  t?: TFunction;
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
    const summary = summarizeStageSubtasks(subtasks, t);
    const detail =
      summary ??
      (status === "completed"
        ? (t ? t("generation.drawer.completed") : "已完成")
        : status === "failed"
          ? (t ? t("generation.drawer.executionFailed") : "执行失败")
          : status === "running"
            ? (t ? t("generation.drawer.executing") : "正在执行")
            : status === "queued"
              ? (t ? t("generation.drawer.queued") : "排队中")
              : (t ? t("generation.drawer.waiting") : "等待执行"));
    return {
      stage,
      label: formatStageLabel(stage, t),
      status,
      detail,
      summary,
      subtasks,
    };
  });
}

export function ProjectGenerationTasksDrawerContent({
  projectRuns = EMPTY_PROJECT_RUNS,
}: {
  projectRuns?: PlatformRunSummary[];
} = {}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
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
  const activeStageMessage = currentRunDiagnostics.activeStage
    ? currentRunDiagnostics.stageMessages[currentRunDiagnostics.activeStage]
    : null;
  const executionDetailPlaceholder =
    currentRunDiagnostics.streamText || !activeStageMessage
      ? t("generation.drawer.waitingOutput")
      : t("generation.drawer.executing");
  const uiMockup = currentRunDiagnostics.uiMockup;
  const uiMockupImage = uiMockup?.imageUrl ?? uiMockup?.imageDataUrl ?? null;
  const requirementTraceEntries = currentRunDiagnostics.requirementTrace;
  const designTraceEntries = currentRunDiagnostics.designTrace;
  const codeTraceEntries = currentRunDiagnostics.codeTrace;
  const activeProjectRuns = useMemo(
    () => projectRuns.filter(isActiveProjectRun),
    [projectRuns],
  );
  const recentProjectRun = useMemo(() => latestProjectRun(projectRuns), [projectRuns]);
  const selectedLocalTask = selectedGenerationTaskId
    ? generationTasks.find((task) => task.clientTaskId === selectedGenerationTaskId) ?? null
    : null;
  const activeLocalTask =
    generationTasks.find(isActiveGenerationTask) ?? null;
  const selectedTask =
    activeProjectRuns.length > 0
      ? selectedLocalTask && isActiveGenerationTask(selectedLocalTask)
        ? selectedLocalTask
        : activeLocalTask
      : selectedLocalTask ?? activeLocalTask ?? generationTasks[0] ?? null;
  const taskStages = useMemo(
    () =>
      getVisibleTaskStages(
        currentRunDiagnostics.runKind,
        currentRunDiagnostics.activeStage,
        selectedTask,
      ),
    [currentRunDiagnostics.activeStage, currentRunDiagnostics.runKind, selectedTask],
  );
  const selectedProjectRun = selectedTask
    ? null
    : (activeProjectRuns[0] ?? recentProjectRun);
  const visibleRunStatus = selectedProjectRun
    ? normalizeRunStatus(selectedProjectRun.status)
    : runStatus;
  const visibleRunProgress = selectedProjectRun
    ? getProjectRunProgress(selectedProjectRun)
    : runProgress;
  const visibleRunMessage = selectedProjectRun
    ? formatProjectRunMessage(selectedProjectRun, t)
    : t(`generation.status.${runStatus}`);
  const pendingReviewSubtasks =
    selectedTask?.subtasks.filter((subtask) => subtask.status === "pending_review") ??
    [];
  const pendingReviewCount = pendingReviewSubtasks.reduce(
    (sum, subtask) => sum + (subtask.pendingReviewCount ?? 1),
    0,
  );
  const stageTodoItems = useMemo(
    () =>
      buildStageTodoItems({
        taskStages,
        selectedTask,
        diagnostics: currentRunDiagnostics,
        runStatus,
        t,
      }),
    [currentRunDiagnostics, runStatus, selectedTask, t, taskStages],
  );
  const retrySubtask = (subtaskId: string) => {
    if (!selectedTask || taskIsActive) return;
    const diagramId = retryDiagramId(subtaskId);
    if (
      selectedTask.kind === "requirements" &&
      REQUIREMENT_DIAGRAM_KINDS.includes(
        diagramId as (typeof REQUIREMENT_DIAGRAM_KINDS)[number],
      )
    ) {
      void generateDiagrams([
        diagramId as (typeof REQUIREMENT_DIAGRAM_KINDS)[number],
      ]);
      return;
    }
    if (
      selectedTask.kind === "design" &&
      DESIGN_DIAGRAM_KINDS.includes(diagramId as DesignDiagramKind)
    ) {
      void generateDesignDiagrams([diagramId as DesignDiagramKind]);
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
      await navigator.clipboard.writeText(getTraceEntryBody(entry, t));
      toast.success(t("generation.drawer.copiedTrace"));
    } catch {
      toast.error(t("generation.drawer.copyFailed"));
    }
  };

  return (
    <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden text-sm">
            {activeProjectRuns.length > 0 && (
              <div className="mb-4 min-w-0 max-w-full overflow-hidden">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("generation.drawer.serverRuns")}
                  </span>
                </div>
                <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden">
                  {activeProjectRuns.map((run) => {
                    const taskMessage = formatProjectRunMessage(run, t);
                    const runTimeSummary = [
                      t("generation.drawer.started", { time: formatTaskDateTime(run.startedAt ?? run.createdAt, locale, t) }),
                      run.completedAt ? t("generation.drawer.finished", { time: formatTaskDateTime(run.completedAt, locale, t) }) : null,
                      run.model ? t("generation.drawer.modelInline", { model: run.model }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={run.runId}
                        className="flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-lg border border-primary bg-primary/5 px-3 py-2 text-left text-sm"
                      >
                        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate font-medium" title={formatProjectRunTitle(run, t)}>
                            {formatProjectRunTitle(run, t)}
                          </span>
                          <span
                            className="mt-0.5 block truncate text-xs text-muted-foreground"
                            title={taskMessage}
                          >
                            {taskMessage}
                          </span>
                          <span
                            className="mt-0.5 block truncate text-[11px] text-muted-foreground"
                            title={runTimeSummary}
                          >
                            {runTimeSummary}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {getProjectRunProgress(run)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {generationTasks.length > 0 && (
              <div className="mb-4 min-w-0 max-w-full overflow-hidden">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("generation.drawer.taskList")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={clearCompletedGenerationTasks}
                  >
                    {t("generation.drawer.clearCompleted")}
                  </Button>
                </div>
                <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden">
                  {generationTasks.map((task) => {
                    const selected = selectedTask?.clientTaskId === task.clientTaskId;
                    const active = isActiveGenerationTask(task);
                    const taskMessage = task.messageCode
                      ? localizeApiFailure(
                          { error: { code: task.messageCode, params: task.messageParams } },
                          task.status === "failed" ? 500 : 200,
                        )
                      : t(`generation.status.${task.status}`);
                    const taskTimeSummary = [
                      t("generation.drawer.started", { time: formatTaskDateTime(task.startedAt, locale, t) }),
                      task.finishedAt ? t("generation.drawer.finished", { time: formatTaskDateTime(task.finishedAt, locale, t) }) : null,
                      t("generation.drawer.durationInline", { duration: formatTaskDuration(task.startedAt, task.finishedAt, t) }),
                      task.diagnostics.providerModel
                        ? t("generation.drawer.modelInline", { model: task.diagnostics.providerModel })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
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
                          <span className="block truncate font-medium" title={t(`generation.taskKinds.${task.kind}`)}>
                            {t(`generation.taskKinds.${task.kind}`)}
                          </span>
                          <span
                            className="mt-0.5 block truncate text-xs text-muted-foreground"
                            title={taskMessage}
                          >
                            {taskMessage}
                          </span>
                          <span
                            className="mt-0.5 block truncate text-[11px] text-muted-foreground"
                            title={taskTimeSummary}
                          >
                            {taskTimeSummary}
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
                <span className="text-muted-foreground">{t("generation.drawer.status")}</span>
                <Badge variant={runStatusBadgeVariant(visibleRunStatus)}>
                  {t(`generation.status.${visibleRunStatus}`)}
                </Badge>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("generation.drawer.progress")}</span>
                <span className="shrink-0 font-mono">{visibleRunProgress}%</span>
              </div>
              <div className="grid min-w-0 gap-1">
                <span className="text-muted-foreground">{t("generation.drawer.message")}</span>
                <span
                  className="min-w-0 break-words"
                  title={visibleRunMessage}
                >
                  {visibleRunMessage || t("generation.drawer.noActiveTask")}
                </span>
              </div>
              {selectedProjectRun?.runId && (
                <div className="grid min-w-0 gap-1">
                  <span className="text-muted-foreground">{t("generation.drawer.runId")}</span>
                  <span className="min-w-0 truncate font-mono text-xs" title={selectedProjectRun.runId}>
                    {selectedProjectRun.runId}
                  </span>
                </div>
              )}
              {selectedProjectRun && projectRunRelationMessage(selectedProjectRun, t) && (
                <div className="grid min-w-0 gap-1">
                  <span className="text-muted-foreground">{t("generation.drawer.relation")}</span>
                  <span className="min-w-0 truncate text-xs" title={projectRunRelationMessage(selectedProjectRun, t)}>
                    {projectRunRelationMessage(selectedProjectRun, t)}
                  </span>
                </div>
              )}
              {selectedProjectRun && projectRunCodeDiagnosticMessage(selectedProjectRun) && (
                <div className="grid min-w-0 gap-1">
                  <span className="text-muted-foreground">{t("generation.drawer.codeDiagnostics")}</span>
                  <span
                    className="min-w-0 break-words text-xs"
                    title={projectRunCodeDiagnosticMessage(selectedProjectRun) ?? undefined}
                  >
                    {projectRunCodeDiagnosticMessage(selectedProjectRun)}
                  </span>
                </div>
              )}
              {selectedProjectRun && (
                <>
                  <div className="grid min-w-0 gap-1">
                    <span className="text-muted-foreground">{t("generation.drawer.startedAt")}</span>
                    <span className="min-w-0 truncate text-xs">
                      {formatTaskDateTime(selectedProjectRun.startedAt ?? selectedProjectRun.createdAt, locale, t)}
                    </span>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <span className="text-muted-foreground">{t("generation.drawer.finishedAt")}</span>
                    <span className="min-w-0 truncate text-xs">
                      {formatTaskDateTime(selectedProjectRun.completedAt, locale, t)}
                    </span>
                  </div>
                </>
              )}
              {(selectedProjectRun?.model ??
                selectedTask?.diagnostics.providerModel ??
                currentRunDiagnostics.providerModel) && (
                <div className="grid min-w-0 gap-1">
                  <span className="text-muted-foreground">{t("generation.drawer.model")}</span>
                  <span
                    className="min-w-0 truncate font-mono text-xs"
                    title={
                      selectedProjectRun?.model ??
                      selectedTask?.diagnostics.providerModel ??
                      currentRunDiagnostics.providerModel ??
                      undefined
                    }
                  >
                    {selectedProjectRun?.model ??
                      selectedTask?.diagnostics.providerModel ??
                      currentRunDiagnostics.providerModel}
                  </span>
                </div>
              )}
              {selectedTask && (
                <>
                  <div className="grid min-w-0 gap-1">
                    <span className="text-muted-foreground">{t("generation.drawer.startedAt")}</span>
                    <span className="min-w-0 truncate text-xs">
                      {formatTaskDateTime(selectedTask.startedAt, locale, t)}
                    </span>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <span className="text-muted-foreground">{t("generation.drawer.finishedAt")}</span>
                    <span className="min-w-0 truncate text-xs">
                      {formatTaskDateTime(selectedTask.finishedAt, locale, t)}
                    </span>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <span className="text-muted-foreground">{t("generation.drawer.duration")}</span>
                    <span className="min-w-0 truncate text-xs">
                      {formatTaskDuration(selectedTask.startedAt, selectedTask.finishedAt, t)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {errorMessage && (
              <div
                data-testid="generation-task-error-card"
                className="mt-4 min-w-0 max-w-full overflow-hidden rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <span className="block break-words" title={localizeApiFailure(null, 500)}>
                  {localizeApiFailure(null, 500)}
                </span>
              </div>
            )}

            {pendingReviewSubtasks.length > 0 && (
              <div className="mt-5 min-w-0 max-w-full overflow-hidden rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
                {isRequirementRulesTask(selectedTask)
                  ? t("generation.drawer.pendingRulesNotice", { count: pendingReviewCount })
                  : t("generation.drawer.pendingRelationsNotice", { count: pendingReviewCount })}
              </div>
            )}

            {uiMockup && (
              <div className="mt-5 min-w-0 max-w-full overflow-hidden">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Palette className="size-3.5" />
                  {t("generation.drawer.uiMockup")}
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
                      title={t("generation.drawer.openUiMockup")}
                    >
                      <img
                        src={uiMockupImage}
                        alt={t("generation.drawer.uiMockupAlt")}
                        className="max-h-56 w-full object-contain"
                      />
                    </a>
                  ) : (
                    <div className="break-words text-sm">
                      {uiMockup.errorMessage
                        ? localizeApiFailure(null, 500)
                        : t("generation.drawer.uiMockupMissing")}
                    </div>
                  )}
                  <div className="mt-2 grid min-w-0 gap-1 text-xs text-muted-foreground">
                    <span className="truncate" title={uiMockup.model}>
                      {t("generation.drawer.imageModel", { model: uiMockup.model })}
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
                  {t("generation.drawer.fidelityCheck")}
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
                        ? t("generation.drawer.fidelityPassed")
                        : t("generation.drawer.fidelityFailed")}
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
                  {t("generation.drawer.technicalDetails")}
                </summary>
                <div className="mt-3 min-w-0 max-w-full space-y-2 overflow-hidden">
                  {designTraceEntries.length > 0 && (
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t("generation.drawer.designTrace")}
                    </div>
                  )}
                  {codeTraceEntries.length > 0 && (
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t("generation.drawer.codeTrace")}
                    </div>
                  )}
                  {requirementTraceEntries.length > 0 && (
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t("generation.drawer.requirementTrace")}
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
                      const body = getTraceEntryBody(entry, t);
                      const title =
                        group === "code"
                          ? formatCodeTraceEntryTitle(entry, t)
                          : group === "design"
                            ? formatDesignTraceEntryTitle(entry, t)
                            : formatRequirementTraceEntryTitle(entry as RequirementTraceEntry, t);
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
                                    {t(`generation.drawer.traceKinds.${entry.kind}`)}
                                  </Badge>
                                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                title={t("generation.drawer.copyTrace")}
                                aria-label={t("generation.drawer.copyTrace")}
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
                {t("generation.drawer.stageChain")}
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
                                  formatSubtaskDetail(subtask, t) || t("generation.drawer.waiting");
                                const retryActionLabel =
                                  retrySubtaskActionLabel(subtask.id, t);
                                const retryActionTitle =
                                  retrySubtaskActionTitle(subtask.id, t);
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
                                          {t(`generation.drawer.subtaskStatus.${subtask.status}`)}
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
                                          aria-label={retryActionLabel}
                                          title={retryActionTitle}
                                          className="shrink-0"
                                          disabled={taskIsActive}
                                          onClick={() => retrySubtask(subtask.id)}
                                        >
                                          <RotateCcw className="size-3.5" />
                                          {retryActionLabel}
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
                  {t("generation.drawer.noStages")}
                </div>
              )}
            </div>

            <details className="mt-5 min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Activity className="size-3.5" />
                <span>{t("generation.drawer.executionDetails")}</span>
                <span className="text-muted-foreground/70">· {t("generation.drawer.technicalFlow")}</span>
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
                  <div className="text-zinc-400">
                    {sanitizeTaskText(executionDetailPlaceholder)}
                  </div>
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
  onOpenDrawer,
  projectRuns = EMPTY_PROJECT_RUNS,
}: ProjectWorkspaceActionsProps) {
  const { t } = useTranslation();
  const [lineageOpen, setLineageOpen] = useState(false);
  const {
    runStatus,
    runProgress,
    generationTasks,
    reconcileGenerationTasksWithProjectRuns,
  } = useWorkspaceSession();
  useEffect(() => {
    reconcileGenerationTasksWithProjectRuns(projectRuns);
  }, [projectRuns, reconcileGenerationTasksWithProjectRuns]);

  const activeTaskCount = generationTasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  ).length;
  const taskIsActive = runStatus === "queued" || runStatus === "running";
  const activeProjectRuns = projectRuns.filter(isActiveProjectRun);
  const recentProjectRun = latestProjectRun(projectRuns);
  const selectedProjectRun =
    taskIsActive || activeTaskCount > 0
      ? null
      : (activeProjectRuns[0] ?? recentProjectRun);
  const visibleTaskIsActive = taskIsActive || activeProjectRuns.length > 0;
  const visibleActiveTaskCount = activeTaskCount || activeProjectRuns.length;
  const visibleRunStatus = selectedProjectRun
    ? normalizeRunStatus(selectedProjectRun.status)
    : runStatus;
  const visibleRunProgress = selectedProjectRun
    ? getProjectRunProgress(selectedProjectRun)
    : runProgress;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {lineageOpen && (
        <LineageGraphDialog
          open={lineageOpen}
          onOpenChange={setLineageOpen}
          projectRuns={projectRuns}
        />
      )}
      <Button
        variant="ghost"
        className={taskStatusButtonClass}
        title={t("status.lineage")}
        aria-label={t("status.lineage")}
        onClick={() => setLineageOpen(true)}
      >
        <GitBranch className="size-5" />
        <span className="hidden max-w-28 truncate font-semibold xl:inline">
          {t("status.lineage")}
        </span>
      </Button>

      <Button
        variant="ghost"
        className={taskStatusButtonClass}
        title={t("status.tasks")}
        aria-label={t("status.tasks")}
        onClick={() => onOpenDrawer("tasks")}
      >
        {visibleTaskIsActive ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : visibleRunStatus === "failed" ? (
          <AlertCircle className="size-5 text-destructive" />
        ) : visibleRunStatus === "interrupted" ? (
          <AlertCircle className="size-5 text-warning" />
        ) : visibleRunStatus === "completed" ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <Activity className="size-5" />
        )}
        <span className="hidden max-w-36 truncate font-semibold xl:inline">
          {visibleActiveTaskCount > 1
            ? t("status.run.count", { count: visibleActiveTaskCount })
            : visibleTaskIsActive
              ? t("status.run.progress", {
                  status: t(`status.run.${visibleRunStatus}`),
                  progress: visibleRunProgress,
                })
              : t(`status.run.${visibleRunStatus}`)}
        </span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="h-10 shrink-0 rounded-full px-4 text-sm font-medium"
        onClick={() => onOpenDrawer("history")}
      >
        <History className="size-5" />
        {t("status.runHistory")}
      </Button>
    </div>
  );
}

export function TopBar({
  currentRoute,
  onNavigate,
  accountDialogOpen: controlledAccountDialogOpen,
  onAccountDialogOpenChange,
}: TopBarProps) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const authSession = useAuthenticatedRouteSession();
  const [uncontrolledAccountDialogOpen, setUncontrolledAccountDialogOpen] =
    useState(false);
  const accountDialogOpen =
    controlledAccountDialogOpen ?? uncontrolledAccountDialogOpen;
  const setAccountDialogOpen =
    onAccountDialogOpenChange ?? setUncontrolledAccountDialogOpen;
  const navItems = [
    { route: "/projects" as const, label: t("nav.projects") },
    ...SHELL_ROUTE_MODULES.filter((item) => item.route !== "/workspace").map((item) => ({
      ...item,
      label: t(`nav.${shellRouteTranslationKey(item.route)}`),
    })),
    { route: "/account/billing" as const, label: t("nav.payment") },
  ];
  const currentLabel =
    navItems.find(
      (item) =>
        currentRoute === item.route ||
        (item.route === "/projects" && currentRoute?.startsWith("/projects")),
    )?.label ?? t("nav.workspace");

  return (
    <header className="flex h-14 shrink-0 flex-nowrap items-center gap-3 overflow-hidden border-b border-sidebar-border bg-background/80 px-3 font-semibold text-sidebar-foreground backdrop-blur-xl md:h-16 md:gap-6 md:px-6">
      <div className="flex min-w-0 shrink items-center gap-3 md:shrink-0">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-info shadow-sm">
          <Boxes className="size-4 text-primary-foreground" />
        </span>
        <span className="hidden whitespace-nowrap text-[18px] font-semibold leading-7 tracking-[-0.45px] sm:inline">
          {t("common.appName")}
        </span>
        <span className="truncate text-sm font-semibold text-primary sm:hidden">
          {currentLabel}
        </span>
      </div>

      <nav className="hidden min-w-0 items-center gap-6 md:flex">
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
            className={mainNavButtonClass}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-1 md:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
            className={`${topBarActionButtonClass} md:hidden`}
              title={t("nav.openMainNavigation")}
              aria-label={t("nav.openMainNavigation")}
            >
              <Menu className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>{t("nav.mainNavigation")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {navItems.map((item) => (
              <DropdownMenuItem key={item.label} onSelect={() => onNavigate(item.route)}>
                {item.label}
                {(currentRoute === item.route ||
                  (item.route === "/projects" && currentRoute?.startsWith("/projects"))) && (
                  <span className="ml-auto text-xs text-primary">{t("common.current")}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SystemNoticeButton className={topBarActionButtonClass} />
        <LanguagePreferenceMenu className={topBarActionButtonClass} />
        <Button
          variant="ghost"
          size="icon"
          className={topBarActionButtonClass}
          onClick={toggle}
          title={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
        >
          {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        <AccountDialog
          open={accountDialogOpen}
          onOpenChange={setAccountDialogOpen}
          onNavigate={onNavigate}
          initialUser={authSession?.user ?? null}
        />
      </div>
    </header>
  );
}
