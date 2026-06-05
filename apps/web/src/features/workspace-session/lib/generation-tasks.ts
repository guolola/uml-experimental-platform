// Maintains per-run task state so concurrent generation jobs keep separate progress and logs.
import type { RunEvent, RunStage } from "@uml-platform/contracts";
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
  if (event.type === "artifact_ready") {
    if (
      event.artifactKind === "model" ||
      event.artifactKind === "plantuml" ||
      event.artifactKind === "svg"
    ) {
      return "completed";
    }
    return event.subtaskStatus ?? "running";
  }
  if ("subtaskStatus" in event && event.subtaskStatus) return event.subtaskStatus;
  if (event.type === "failed") return "failed";
  if (event.type === "stage_progress" && event.message?.includes("修复")) {
    return "repairing";
  }
  if (event.type === "stage_progress" && event.stage === "render_svg") {
    return "rendering";
  }
  return "running";
}

const STAGE_SCOPED_SUBTASK_STAGES = [
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
  "generate_plantuml",
  "render_svg",
] as const satisfies readonly RunStage[];

type StageScopedSubtaskStage = (typeof STAGE_SCOPED_SUBTASK_STAGES)[number];

function isStageScopedSubtaskStage(
  stage: RunStage | undefined,
): stage is StageScopedSubtaskStage {
  return Boolean(
    stage &&
      STAGE_SCOPED_SUBTASK_STAGES.includes(stage as StageScopedSubtaskStage),
  );
}

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

function rawSubtaskIdFromEvent(event: RunEvent) {
  if ("subtaskId" in event && event.subtaskId) return event.subtaskId;
  if ("modelId" in event && event.modelId) return event.modelId;
  if ("diagramKind" in event && event.diagramKind) return event.diagramKind;
  if (event.type !== "stage_progress" || !event.message) return null;
  const match = event.message.match(/(?:正在生成|正在渲染|正在修复)：([a-z][\w:-]*)/i);
  return match?.[1] ?? null;
}

function subtaskIdFromEvent(event: RunEvent) {
  const rawId = rawSubtaskIdFromEvent(event);
  if (!rawId) return null;
  if (!("stage" in event) || !isStageScopedSubtaskStage(event.stage)) {
    return rawId;
  }
  const scoped = splitScopedSubtaskId(rawId);
  return scoped?.stage === event.stage ? rawId : `${event.stage}:${rawId}`;
}

function subtaskMatchesEvent(
  subtask: GenerationSubtask,
  scopedSubtaskId: string,
  rawSubtaskId: string,
) {
  if (subtask.id === scopedSubtaskId) return true;
  return !splitScopedSubtaskId(subtask.id) && subtask.id === rawSubtaskId;
}

const EXPANDABLE_AGGREGATE_SUBTASK_IDS = ["analysis", "sequence"] as const;

function isExpandableAggregateSubtaskId(id: string) {
  return EXPANDABLE_AGGREGATE_SUBTASK_IDS.includes(
    id as (typeof EXPANDABLE_AGGREGATE_SUBTASK_IDS)[number],
  );
}

function subtaskStageAndRawId(subtaskId: string) {
  const scoped = splitScopedSubtaskId(subtaskId);
  return {
    stage: scoped?.stage ?? null,
    rawId: scoped?.rawId ?? subtaskId,
  };
}

function hasExpandedSubtasks(
  subtasks: GenerationSubtask[],
  aggregateSubtaskId: string,
) {
  const aggregate = subtaskStageAndRawId(aggregateSubtaskId);
  if (!isExpandableAggregateSubtaskId(aggregate.rawId)) return false;
  return subtasks.some((subtask) => {
    if (subtask.id === aggregateSubtaskId) return false;
    const candidate = subtaskStageAndRawId(subtask.id);
    return (
      candidate.stage === aggregate.stage &&
      candidate.rawId.startsWith(`${aggregate.rawId}:`)
    );
  });
}

function removeExpandedAggregatePlaceholders(
  subtasks: GenerationSubtask[],
) {
  return subtasks.filter((subtask) => !hasExpandedSubtasks(subtasks, subtask.id));
}

function isAggregateCompletionForExpandedSubtasks(
  event: RunEvent,
  rawSubtaskId: string | null,
  subtasks: GenerationSubtask[],
) {
  if (
    !rawSubtaskId ||
    !isExpandableAggregateSubtaskId(rawSubtaskId) ||
    event.type !== "artifact_ready" ||
    event.subtaskStatus !== "completed" ||
    !("stage" in event)
  ) {
    return false;
  }
  return subtasks.some((subtask) => {
    const scoped = splitScopedSubtaskId(subtask.id);
    const rawId = scoped?.rawId ?? subtask.id;
    return (
      rawId.startsWith(`${rawSubtaskId}:`) &&
      (!scoped || scoped.stage === event.stage)
    );
  });
}

function expandableAggregatePrefix(rawSubtaskId: string) {
  const [prefix] = rawSubtaskId.split(":");
  return isExpandableAggregateSubtaskId(prefix) ? prefix : null;
}

function shouldInsertUnmatchedSubtask(
  event: RunEvent,
  subtaskId: string,
  rawSubtaskId: string | null,
  subtasks: GenerationSubtask[],
) {
  if (!("stage" in event) || !isStageScopedSubtaskStage(event.stage)) {
    return true;
  }
  const hasScopedSubtasksForStage = subtasks.some((subtask) => {
    const scoped = splitScopedSubtaskId(subtask.id);
    return scoped?.stage === event.stage;
  });
  if (!hasScopedSubtasksForStage) return true;
  if (!rawSubtaskId) return false;
  const raw = subtaskStageAndRawId(subtaskId).rawId;
  const aggregatePrefix = expandableAggregatePrefix(rawSubtaskId) ?? expandableAggregatePrefix(raw);
  if (!aggregatePrefix) return false;
  return subtasks.some((subtask) => {
    const scoped = splitScopedSubtaskId(subtask.id);
    if (scoped?.stage !== event.stage) return false;
    const plannedRawId = scoped.rawId;
    return (
      plannedRawId === aggregatePrefix ||
      plannedRawId.startsWith(`${aggregatePrefix}:`)
    );
  });
}

function updateSubtasksFromEvent(
  subtasks: GenerationSubtask[],
  event: RunEvent,
): GenerationSubtask[] {
  const subtaskId = subtaskIdFromEvent(event);
  const rawSubtaskId = rawSubtaskIdFromEvent(event);
  if (!subtaskId) return subtasks;
  if (isAggregateCompletionForExpandedSubtasks(event, rawSubtaskId, subtasks)) {
    return subtasks;
  }
  const hasExplicitSubtaskStatus =
    "subtaskStatus" in event && Boolean(event.subtaskStatus);
  const nextStatus = subtaskStatusFromEvent(event);
  let matched = false;
  const next = subtasks.map((subtask) => {
    if (!rawSubtaskId || !subtaskMatchesEvent(subtask, subtaskId, rawSubtaskId)) {
      return subtask;
    }
    matched = true;
    const status =
      !hasExplicitSubtaskStatus &&
      event.type === "artifact_ready" &&
      nextStatus === "running" &&
      (subtask.status === "completed" || subtask.status === "pending_review")
        ? subtask.status
        : nextStatus;
    return {
      ...subtask,
      label:
        "subtaskLabel" in event && event.subtaskLabel
          ? event.subtaskLabel
          : subtask.label,
      status,
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
  if (matched) return removeExpandedAggregatePlaceholders(next);
  if (!shouldInsertUnmatchedSubtask(event, subtaskId, rawSubtaskId, subtasks)) {
    return removeExpandedAggregatePlaceholders(next);
  }
  return removeExpandedAggregatePlaceholders([
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
  ]);
}

function collectCompletedSubtaskIds(snapshot: unknown) {
  const ids = new Set<string>();
  if (!isRecord(snapshot)) return ids;
  const addCompletedId = (stage: StageScopedSubtaskStage, id: unknown) => {
    if (typeof id !== "string" || !id.trim()) return;
    const normalized = id.trim();
    ids.add(normalized);
    ids.add(`${stage}:${normalized}`);
  };
  const isDesignSnapshot = Array.isArray(snapshot.requirementModels);
  if (Array.isArray(snapshot.models)) {
    for (const model of snapshot.models as Array<{ diagramKind?: string; modelId?: string }>) {
      const stage: StageScopedSubtaskStage =
        isDesignSnapshot && model.diagramKind === "sequence"
          ? "generate_design_sequence"
          : isDesignSnapshot
            ? "generate_design_models"
            : "generate_models";
      addCompletedId(stage, model.diagramKind);
      addCompletedId(stage, model.modelId);
    }
  }
  if (Array.isArray(snapshot.plantUml)) {
    for (const artifact of snapshot.plantUml as Array<{
      diagramKind?: string;
      modelId?: string;
    }>) {
      addCompletedId("generate_plantuml", artifact.diagramKind);
      addCompletedId("generate_plantuml", artifact.modelId);
    }
  }
  if (Array.isArray(snapshot.svgArtifacts)) {
    for (const artifact of snapshot.svgArtifacts as Array<{
      diagramKind?: string;
      modelId?: string;
    }>) {
      addCompletedId("render_svg", artifact.diagramKind);
      addCompletedId("render_svg", artifact.modelId);
    }
  }
  return ids;
}

function errorForSubtask(
  errors: Record<string, { message?: string; stage?: string }>,
  subtaskId: string,
) {
  const scoped = splitScopedSubtaskId(subtaskId);
  const candidates = [subtaskId, scoped?.rawId].filter(
    (id): id is string => Boolean(id),
  );
  for (const id of candidates) {
    const error = errors[id];
    if (!error) continue;
    if (!scoped || !error.stage || error.stage === scoped.stage) {
      return error;
    }
  }
  return undefined;
}

function pendingReviewStageForSource(source?: { diagramKind?: string; modelId?: string }) {
  if (!source?.diagramKind) return null;
  return source.diagramKind === "sequence"
    ? "generate_design_sequence"
    : "generate_design_models";
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
      const stage = pendingReviewStageForSource(entry.source);
      for (const id of [modelId, diagramKind]) {
        if (!id) continue;
        pendingReviewByDiagram.set(id, (pendingReviewByDiagram.get(id) ?? 0) + 1);
        if (stage) {
          const scopedId = `${stage}:${id}`;
          pendingReviewByDiagram.set(
            scopedId,
            (pendingReviewByDiagram.get(scopedId) ?? 0) + 1,
          );
        }
      }
    }
  }
  const existingIds = new Set(subtasks.map((subtask) => subtask.id));
  const next = subtasks.map((subtask) => {
    const error = errorForSubtask(errors, subtask.id);
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
    if (subtasks.some((subtask) => errorForSubtask({ [id]: error }, subtask.id))) {
      continue;
    }
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
  if (event.type === "cancelled") return "cancelled";
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
      event.type === "completed" || event.type === "failed" || event.type === "cancelled"
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
              : event.type === "cancelled"
                ? event.message
              : event.type === "failed"
                ? event.message
                : task.message,
    errorMessage: event.type === "failed" ? event.message : task.errorMessage,
    finishedAt:
      event.type === "completed" || event.type === "failed" || event.type === "cancelled"
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
