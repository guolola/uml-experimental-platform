// Provides run UI status defaults and event-to-UI-state derivation.

import type { RunEvent } from "@uml-platform/contracts";
import type { RunStatus } from "../../../entities/workspace/model";
import { cancelledRunMessage, statusFromRunEvent } from "./run-events";

export function createEmptyRunUiState() {
  return {
    runStatus: "idle" as RunStatus,
    runProgress: 0,
    runMessage: null as string | null,
    errorMessage: null as string | null,
  };
}

export type RunUiState = ReturnType<typeof createEmptyRunUiState>;

type CancelledRunSnapshot = {
  error?: { message?: string } | null;
};

interface RunEventUiMessages {
  completed: string;
  queued: string;
}

export function deriveRunUiStateFromEvent(
  current: RunUiState,
  event: RunEvent,
  progress: number | null | undefined,
  messages: RunEventUiMessages,
) {
  return {
    runStatus: statusFromRunEvent(event),
    runProgress: progress ?? current.runProgress,
    runMessage:
      event.type === "stage_progress"
        ? (event.message ?? current.runMessage)
        : event.type === "queued"
          ? messages.queued
          : event.type === "completed"
            ? messages.completed
            : event.type === "cancelled"
              ? event.message
              : event.type === "failed"
                ? event.error.message
                : current.runMessage,
    errorMessage:
      event.type === "failed" ? event.error.message : current.errorMessage,
  } satisfies RunUiState;
}

export function deriveCodeRunUiStateFromEvent(
  current: RunUiState,
  event: RunEvent,
  progress: number | null | undefined,
) {
  return {
    runStatus: statusFromRunEvent(event),
    runProgress: progress ?? current.runProgress,
    runMessage:
      event.type === "code_file_changed"
        ? `已写入 ${event.path}`
        : event.type === "stage_progress"
          ? (event.message ?? current.runMessage)
          : event.type === "queued"
            ? "代码生成任务已进入队列"
            : event.type === "completed"
              ? "files" in event.snapshot &&
                event.snapshot.generationMode === "continue" &&
                event.snapshot.changedFileCount === 0
                ? "本次未产生文件变更"
                : "代码生成完成"
              : event.type === "cancelled"
                ? event.message
                : event.type === "failed"
                  ? event.error.message
                  : current.runMessage,
    errorMessage:
      event.type === "failed" ? event.error.message : current.errorMessage,
  } satisfies RunUiState;
}

export function cancelledRunUiState(snapshot: CancelledRunSnapshot) {
  return {
    runStatus: "cancelled",
    runProgress: 100,
    runMessage: cancelledRunMessage(snapshot),
    errorMessage: null,
  } satisfies RunUiState;
}

export function failedRunUiState(detail: string) {
  return {
    runStatus: "failed",
    runProgress: 100,
    runMessage: null,
    errorMessage: detail,
  } satisfies RunUiState;
}

export function completedRunUiState(message: string) {
  return {
    runStatus: "completed",
    runProgress: 100,
    runMessage: message,
    errorMessage: null,
  } satisfies RunUiState;
}

export function completedCodeRunUiState(snapshot: {
  changedFileCount?: number;
  generationMode?: "continue" | "regenerate";
}) {
  return completedRunUiState(
    snapshot.generationMode === "continue" && snapshot.changedFileCount === 0
      ? "本次未产生文件变更"
      : "代码生成完成",
  );
}
