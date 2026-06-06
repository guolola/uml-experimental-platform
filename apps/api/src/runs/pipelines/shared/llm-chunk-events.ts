// Centralizes user-visible LLM stream events so blank provider chunks do not look like real output.
import {
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  type RunStage,
} from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { stageProgressValue } from "./pipeline-events.js";
import type { ModelTaskActivity } from "./model-task-timeout.js";
import type { LlmChunkHandlers } from "./structured-output.js";

const BLANK_CHUNK_NOTICE_COUNT = 40;
const BLANK_CHUNK_NOTICE_INTERVAL_MS = 10_000;

export interface RunLlmChunkHandlerOptions {
  record: RunRecord;
  stage: RunStage;
  onActivity?: ModelTaskActivity;
  onBlankActivity?: ModelTaskActivity;
  progress?: number;
  diagramKind?: string;
  modelId?: string;
  subtaskId?: string;
  subtaskLabel?: string;
  maxVisibleChunks?: number;
  maxVisibleChars?: number;
  truncationMessage?: string;
}

export function createRunLlmChunkHandlers({
  record,
  stage,
  onActivity,
  onBlankActivity,
  progress = stageProgressValue(stage),
  diagramKind,
  modelId,
  subtaskId,
  subtaskLabel,
  maxVisibleChunks = Number.POSITIVE_INFINITY,
  maxVisibleChars = Number.POSITIVE_INFINITY,
  truncationMessage = "模型流式输出较长，技术日志已折叠，后台继续解析完整结果",
}: RunLlmChunkHandlerOptions): LlmChunkHandlers {
  let emittedChunks = 0;
  let emittedChars = 0;
  let blankChunksSinceContent = 0;
  let lastBlankNoticeAt = 0;
  let truncationNotified = false;

  const emitProgress = (message: string) => {
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress,
        message,
        diagramKind,
        modelId,
        subtaskId,
        subtaskLabel,
        subtaskStatus: "running",
      }),
    );
  };

  return {
    onChunk(chunk) {
      blankChunksSinceContent = 0;
      onActivity?.();
      if (emittedChunks >= maxVisibleChunks || emittedChars >= maxVisibleChars) {
        if (!truncationNotified) {
          truncationNotified = true;
          emitProgress(truncationMessage);
        }
        return;
      }
      emittedChunks += 1;
      emittedChars += chunk.length;
      emitEvent(
        record,
        llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage,
          chunk,
        }),
      );
    },
    onBlankChunk() {
      onBlankActivity?.();
      blankChunksSinceContent += 1;
      const now = Date.now();
      if (
        blankChunksSinceContent < BLANK_CHUNK_NOTICE_COUNT ||
        now - lastBlankNoticeAt < BLANK_CHUNK_NOTICE_INTERVAL_MS
      ) {
        return;
      }
      lastBlankNoticeAt = now;
      emitProgress("模型持续返回空白片段，等待有效内容");
    },
  };
}
