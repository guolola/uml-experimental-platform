// Maintains per-run task state so concurrent generation jobs keep separate progress and logs.
import type { RunEvent } from "@uml-platform/contracts";
import type {
  GenerationTask,
  GenerationTaskKind,
  RunDiagnostics,
} from "../model/session-state";
import type { RunStatus } from "../../../entities/workspace/model";
import {
  appendDiagnosticStream,
  createEmptyDiagnostics,
  getProgressFromEvent,
  summarizeEvent,
} from "./diagnostics";

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
    startedAt: input.startedAt,
    finishedAt: null,
  };
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
  return {
    ...task,
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
