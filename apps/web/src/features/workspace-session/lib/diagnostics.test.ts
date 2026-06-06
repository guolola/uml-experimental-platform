// Covers run-event to diagnostics helpers outside the session Provider.
import { describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@uml-platform/contracts";
import {
  appendDiagnosticStream,
  createEmptyDiagnostics,
  getProgressFromEvent,
  isMeaningfulLlmChunkEvent,
  summarizeEvent,
} from "./diagnostics";

describe("workspace-session diagnostics helpers", () => {
  it("creates an empty diagnostics object for a new run", () => {
    expect(createEmptyDiagnostics()).toMatchObject({
      runKind: null,
      runId: null,
      streamText: "",
      chunkCount: 0,
      events: [],
    });
  });

  it("keeps only the newest diagnostic stream content", () => {
    const next = appendDiagnosticStream("x".repeat(29_999), "TAIL");
    expect(next).toHaveLength(30_000);
    expect(next.endsWith("TAIL")).toBe(true);
  });

  it("summarizes terminal and progress events with stable labels", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    const progress = summarizeEvent({
      type: "stage_progress",
      stage: "generate_models",
      progress: 65,
      message: "generate_models ready",
    });
    expect(progress.label).toBe("阶段进度");
    expect(progress.detail).toContain("生成需求模型");

    const failed = summarizeEvent({
      type: "failed",
      message: "boom",
    } satisfies RunEvent);
    expect(failed.label).toBe("任务失败");
  });

  it("does not label blank model stream chunks as regular model output", () => {
    const blankEvent = {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "   \n",
    } satisfies RunEvent;

    expect(isMeaningfulLlmChunkEvent(blankEvent)).toBe(false);
    const summary = summarizeEvent(blankEvent);

    expect(summary.label).toBe("收到空白片段");
    expect(summary.detail).toContain("等待有效模型输出");
  });

  it("maps run event progress without changing SSE event shape", () => {
    expect(getProgressFromEvent({ type: "queued" })).toBe(5);
    expect(
      getProgressFromEvent({
        type: "stage_started",
        stage: "write_code_files",
      }),
    ).toBe(74);
    expect(
      getProgressFromEvent({
        type: "stage_progress",
        stage: "write_code_files",
        progress: 81,
      }),
    ).toBe(81);
    expect(getProgressFromEvent({ type: "completed", snapshot: {} as never })).toBe(100);
  });
});
