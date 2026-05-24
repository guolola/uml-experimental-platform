// Maintains per-run task state so concurrent generation jobs keep separate progress and logs.
import type { RunEvent } from "@uml-platform/contracts";
import type {
  GenerationTask,
  GenerationTaskKind,
  GenerationSubtask,
  RunDiagnostics,
} from "../model/session-state";
import type { RunStatus } from "../../../entities/workspace/model";
import {
  appendDiagnosticStream,
  createEmptyDiagnostics,
  getProgressFromEvent,
  summarizeEvent,
} from "./diagnostics";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function phaseSummaryFromEvent(event: RunEvent, fallback: string | null) {
  if (event.type === "code_file_changed") {
    return "已写入可预览文件，预览会自动刷新。";
  }
  if (event.type === "stage_progress" && event.message) {
    return event.message;
  }
  if (event.type === "completed") {
    return "生成完成，可以查看或导出结果。";
  }
  if (event.type === "failed") {
    return event.message;
  }
  return fallback;
}

export function createClientTaskId(kind: GenerationTaskKind) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${kind}-${Date.now()}-${random}`;
}

export function createGenerationTask(input: {
  clientTaskId: string;
  kind: GenerationTaskKind;
  title: string;
  providerModel: string | null;
  startedAt: string;
  documentKind?: GenerationTask["documentKind"];
  message: string;
  subtasks?: GenerationSubtask[];
}): GenerationTask {
  return {
    clientTaskId: input.clientTaskId,
    runId: null,
    kind: input.kind,
    documentKind: input.documentKind,
    title: input.title,
    status: "queued",
    progress: 5,
    message: input.message,
    errorMessage: null,
    previewReady: false,
    phaseSummary: input.message,
    technicalDetailsCollapsed: true,
    diagnostics: {
      ...createEmptyDiagnostics(),
      runKind: input.kind,
      providerModel: input.providerModel,
      startedAt: input.startedAt,
    },
    subtasks: input.subtasks ?? [],
    startedAt: input.startedAt,
    finishedAt: null,
  };
}

function subtaskStatusFromEvent(event: RunEvent): GenerationSubtask["status"] {
  if ("subtaskStatus" in event && event.subtaskStatus) return event.subtaskStatus;
  if (event.type === "failed") return "failed";
  if (event.type === "artifact_ready" && event.artifactKind === "svg") return "completed";
  if (event.type === "artifact_ready") return "running";
  if (event.type === "stage_progress" && event.message?.includes("修复")) {
    return "repairing";
  }
  if (event.type === "stage_progress" && event.stage === "render_svg") {
    return "rendering";
  }
  return "running";
}

function subtaskIdFromEvent(event: RunEvent) {
  if ("subtaskId" in event && event.subtaskId) return event.subtaskId;
  if ("modelId" in event && event.modelId) return event.modelId;
  if ("diagramKind" in event && event.diagramKind) return event.diagramKind;
  if (event.type !== "stage_progress" || !event.message) return null;
  const match = event.message.match(/(?:正在生成|正在渲染|正在修复)：([a-z]+)/i);
  return match?.[1] ?? null;
}

function updateSubtasksFromEvent(
  subtasks: GenerationSubtask[],
  event: RunEvent,
): GenerationSubtask[] {
  const subtaskId = subtaskIdFromEvent(event);
  if (!subtaskId) return subtasks;
  let matched = false;
  const next = subtasks.map((subtask) => {
    if (subtask.id !== subtaskId) return subtask;
    matched = true;
    return {
      ...subtask,
      label:
        "subtaskLabel" in event && event.subtaskLabel
          ? event.subtaskLabel
          : subtask.label,
      status: subtaskStatusFromEvent(event),
      message:
        event.type === "stage_progress" ? event.message ?? subtask.message : subtask.message,
      errorMessage: event.type === "failed" ? event.message : subtask.errorMessage,
      queuePosition:
        "queuePosition" in event ? event.queuePosition ?? subtask.queuePosition : subtask.queuePosition,
      queueAhead:
        "queueAhead" in event ? event.queueAhead ?? subtask.queueAhead : subtask.queueAhead,
      waitMs: "waitMs" in event ? event.waitMs ?? subtask.waitMs : subtask.waitMs,
      estimatedWaitMs:
        "estimatedWaitMs" in event
          ? event.estimatedWaitMs ?? subtask.estimatedWaitMs
          : subtask.estimatedWaitMs,
      queueReason:
        "queueReason" in event ? event.queueReason ?? subtask.queueReason : subtask.queueReason,
    };
  });
  if (matched) return next;
  return [
    ...next,
    {
      id: subtaskId,
      label: "subtaskLabel" in event && event.subtaskLabel ? event.subtaskLabel : subtaskId,
      status: subtaskStatusFromEvent(event),
      message: event.type === "stage_progress" ? event.message ?? null : null,
      errorMessage: event.type === "failed" ? event.message : null,
      queuePosition: "queuePosition" in event ? event.queuePosition : undefined,
      queueAhead: "queueAhead" in event ? event.queueAhead : undefined,
      waitMs: "waitMs" in event ? event.waitMs : undefined,
      estimatedWaitMs:
        "estimatedWaitMs" in event ? event.estimatedWaitMs : undefined,
      queueReason: "queueReason" in event ? event.queueReason : undefined,
    },
  ];
}

function collectCompletedSubtaskIds(snapshot: unknown) {
  const ids = new Set<string>();
  if (!isRecord(snapshot)) return ids;
  if (Array.isArray(snapshot.models)) {
    for (const model of snapshot.models as Array<{ diagramKind?: string; modelId?: string }>) {
      if (model.diagramKind) ids.add(model.diagramKind);
      if (model.modelId) ids.add(model.modelId);
    }
  }
  if (Array.isArray(snapshot.svgArtifacts)) {
    for (const artifact of snapshot.svgArtifacts as Array<{
      diagramKind?: string;
      modelId?: string;
    }>) {
      if (artifact.diagramKind) ids.add(artifact.diagramKind);
      if (artifact.modelId) ids.add(artifact.modelId);
    }
  }
  return ids;
}

function updateSubtasksFromCompletedSnapshot(
  subtasks: GenerationSubtask[],
  event: RunEvent,
): GenerationSubtask[] {
  if (event.type !== "completed") return subtasks;
  const snapshot: unknown = event.snapshot;
  if (!isRecord(snapshot) || !isRecord(snapshot.diagramErrors)) return subtasks;
  const errors = snapshot.diagramErrors as Record<string, { message?: string; stage?: string }>;
  const completedIds = collectCompletedSubtaskIds(snapshot);
  const pendingReviewByDiagram = new Map<string, number>();
  if (Array.isArray(snapshot.designModelTraceability)) {
    for (const entry of snapshot.designModelTraceability as Array<{
      source?: { diagramKind?: string; modelId?: string };
      mappingSource?: string;
      reviewStatus?: string;
    }>) {
      if (
        entry.mappingSource !== "auto-filled-pending-review" &&
        entry.reviewStatus !== "pending"
      ) {
        continue;
      }
      const diagramKind = entry.source?.diagramKind;
      const modelId = entry.source?.modelId;
      for (const id of [modelId, diagramKind]) {
        if (!id) continue;
        pendingReviewByDiagram.set(id, (pendingReviewByDiagram.get(id) ?? 0) + 1);
      }
    }
  }
  const existingIds = new Set(subtasks.map((subtask) => subtask.id));
  const next = subtasks.map((subtask) => {
    const error = errors[subtask.id];
    if (error) {
      return {
        ...subtask,
        status: "failed" as const,
        errorMessage: error.message ?? subtask.errorMessage,
      };
    }
    if (completedIds.has(subtask.id) && subtask.status !== "failed") {
      const pendingReviewCount = pendingReviewByDiagram.get(subtask.id) ?? 0;
      return {
        ...subtask,
        status:
          pendingReviewCount > 0 ? ("pending_review" as const) : ("completed" as const),
        pendingReviewCount: pendingReviewCount || undefined,
      };
    }
    return subtask;
  });

  for (const [id, error] of Object.entries(errors)) {
    if (existingIds.has(id)) continue;
    next.push({
      id,
      label: id,
      status: "failed",
      message: error.stage ? `阶段失败：${error.stage}` : null,
      errorMessage: error.message ?? null,
    });
  }
  return next;
}

function titleWithSubtaskSummary(task: GenerationTask, subtasks: GenerationSubtask[]) {
  if (subtasks.length === 0) return task.title;
  const baseTitle = task.title.split("：")[0] ?? task.title;
  const completed = subtasks.filter((subtask) => subtask.status === "completed").length;
  const failed = subtasks.filter((subtask) => subtask.status === "failed").length;
  const pendingReview = subtasks.filter(
    (subtask) => subtask.status === "pending_review",
  ).length;
  if (failed > 0) {
    return `${baseTitle}：${completed}/${subtasks.length} 完成，${failed} 个失败`;
  }
  if (pendingReview > 0) {
    return `${baseTitle}：${completed + pendingReview}/${subtasks.length} 完成，${pendingReview} 个待确认`;
  }
  if (completed > 0 && completed < subtasks.length) {
    return `${baseTitle}：${completed}/${subtasks.length} 完成`;
  }
  return baseTitle;
}

export function taskStatusFromEvent(event: RunEvent): RunStatus {
  if (event.type === "queued") return "queued";
  if (event.type === "failed") return "failed";
  if (event.type === "completed") return "completed";
  return "running";
}

export function updateDiagnosticsFromEvent(
  current: RunDiagnostics,
  event: RunEvent,
): RunDiagnostics {
  const diagnosticEvent = summarizeEvent(event);
  return {
    ...current,
    finishedAt:
      event.type === "completed" || event.type === "failed"
        ? diagnosticEvent.at
        : current.finishedAt,
    activeStage: "stage" in event ? event.stage : current.activeStage,
    streamText:
      event.type === "llm_chunk"
        ? appendDiagnosticStream(current.streamText, event.chunk)
        : current.streamText,
    chunkCount:
      event.type === "llm_chunk" ? current.chunkCount + 1 : current.chunkCount,
    stageStartedAt:
      event.type === "stage_started"
        ? { ...current.stageStartedAt, [event.stage]: diagnosticEvent.at }
        : current.stageStartedAt,
    stageMessages:
      event.type === "stage_progress" && event.message
        ? { ...current.stageMessages, [event.stage]: event.message }
        : current.stageMessages,
    uiMockup:
      event.type === "artifact_ready" && event.artifactKind === "uiMockup"
        ? event.uiMockup ?? current.uiMockup
        : current.uiMockup,
    uiReferenceSpec:
      event.type === "artifact_ready" && event.artifactKind === "uiReferenceSpec"
        ? event.uiReferenceSpec ?? current.uiReferenceSpec
        : event.type === "completed" && "uiReferenceSpec" in event.snapshot
          ? event.snapshot.uiReferenceSpec ?? current.uiReferenceSpec
          : current.uiReferenceSpec,
    uiFidelityReport:
      event.type === "artifact_ready" && event.artifactKind === "uiFidelityReport"
        ? event.uiFidelityReport ?? current.uiFidelityReport
        : event.type === "completed" && "uiFidelityReport" in event.snapshot
          ? event.snapshot.uiFidelityReport ?? current.uiFidelityReport
          : current.uiFidelityReport,
    visualDirection:
      event.type === "artifact_ready" && event.artifactKind === "visualDirection"
        ? event.visualDirection ?? current.visualDirection
        : event.type === "completed" && "visualDirection" in event.snapshot
          ? event.snapshot.visualDirection ?? current.visualDirection
          : current.visualDirection,
    skillResourceDiscoveryPlan:
      event.type === "artifact_ready" && event.artifactKind === "skillResourceDiscoveryPlan"
        ? event.skillResourceDiscoveryPlan ?? current.skillResourceDiscoveryPlan
        : event.type === "completed" && "skillResourceDiscoveryPlan" in event.snapshot
          ? event.snapshot.skillResourceDiscoveryPlan ?? current.skillResourceDiscoveryPlan
          : current.skillResourceDiscoveryPlan,
    skillResourcePreviews:
      event.type === "artifact_ready" && event.artifactKind === "skillResourcePreviews"
        ? event.skillResourcePreviews ?? current.skillResourcePreviews
        : event.type === "completed" && "skillResourcePreviews" in event.snapshot
          ? event.snapshot.skillResourcePreviews ?? current.skillResourcePreviews
          : current.skillResourcePreviews,
    skillResourcePlan:
      event.type === "artifact_ready" && event.artifactKind === "skillResourcePlan"
        ? event.skillResourcePlan ?? current.skillResourcePlan
        : event.type === "completed" && "skillResourcePlan" in event.snapshot
          ? event.snapshot.skillResourcePlan ?? current.skillResourcePlan
          : current.skillResourcePlan,
    codeSkillContext:
      event.type === "artifact_ready" && event.artifactKind === "codeSkillContext"
        ? event.codeSkillContext ?? current.codeSkillContext
        : event.type === "completed" && "codeSkillContext" in event.snapshot
          ? event.snapshot.codeSkillContext ?? current.codeSkillContext
          : current.codeSkillContext,
    requirementTrace:
      event.type === "completed" && "requirementTrace" in event.snapshot
        ? event.snapshot.requirementTrace ?? []
        : current.requirementTrace,
    designTrace:
      event.type === "completed" && "designTrace" in event.snapshot
        ? event.snapshot.designTrace ?? []
        : current.designTrace,
    codeTrace:
      event.type === "completed" && "codeTrace" in event.snapshot
        ? event.snapshot.codeTrace ?? []
        : current.codeTrace,
    events: [...current.events, diagnosticEvent].slice(-80),
  };
}

export function updateTaskFromEvent(
  task: GenerationTask,
  event: RunEvent,
  messages: {
    queued: string;
    completed: string;
    fileChanged?: (path: string) => string;
  },
): GenerationTask {
  const progress = getProgressFromEvent(event);
  const subtasks = updateSubtasksFromCompletedSnapshot(
    updateSubtasksFromEvent(task.subtasks, event),
    event,
  );
  return {
    ...task,
    title: titleWithSubtaskSummary(task, subtasks),
    status: taskStatusFromEvent(event),
    progress: progress ?? task.progress,
    previewReady:
      task.previewReady || (task.kind === "code" && event.type === "code_file_changed"),
    phaseSummary: phaseSummaryFromEvent(event, task.phaseSummary),
    message:
      event.type === "code_file_changed" && messages.fileChanged
        ? messages.fileChanged(event.path)
        : event.type === "stage_progress"
          ? event.message ?? task.message
          : event.type === "queued"
            ? messages.queued
            : event.type === "completed"
              ? messages.completed
              : event.type === "failed"
                ? event.message
                : task.message,
    errorMessage: event.type === "failed" ? event.message : task.errorMessage,
    finishedAt:
      event.type === "completed" || event.type === "failed"
        ? new Date().toISOString()
        : task.finishedAt,
    diagnostics: updateDiagnosticsFromEvent(task.diagnostics, event),
    subtasks,
  };
}

export function addLocalFailureToDiagnostics(
  current: RunDiagnostics,
  detail: string,
): RunDiagnostics {
  const at = new Date().toISOString();
  return {
    ...current,
    finishedAt: at,
    events: [
      ...current.events,
      {
        id: `${at}:failed-local`,
        at,
        label: "任务失败",
        detail,
      },
    ].slice(-80),
  };
}

export function assignTaskRunId(
  task: GenerationTask,
  runId: string,
  providerModel: string,
): GenerationTask {
  return {
    ...task,
    runId,
    diagnostics: {
      ...task.diagnostics,
      runId,
      providerModel,
    },
  };
}

export function isTaskActive(task: GenerationTask) {
  return task.status === "queued" || task.status === "running";
}
