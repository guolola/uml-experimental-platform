// Verifies model-level task summaries remain accurate when a run partially succeeds.
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@uml-platform/contracts";
import { createGenerationTask, updateTaskFromEvent } from "./generation-tasks";

describe("workspace-session generation task helpers", () => {
  it("marks only the failed submodel from a completed snapshot with diagram errors", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "fake-model",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "排队中",
      subtasks: [
        {
          id: "usecase",
          label: "用例模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "activity",
          label: "活动图",
          status: "running",
          message: "正在生成：activity",
          errorMessage: null,
        },
      ],
    });

    const event = {
      type: "completed",
      snapshot: {
        runId: "run-1",
        requirementText: "一个小型图书馆管理系统",
        selectedDiagrams: ["usecase", "activity"],
        rules: [],
        models: [
          {
            diagramKind: "usecase",
            title: "用例模型",
          },
        ],
        requirementModelTraceability: [],
        plantUml: [],
        svgArtifacts: [
          {
            diagramKind: "usecase",
            svg: "<svg />",
            renderMeta: { engine: "plantuml" },
          },
        ],
        diagramErrors: {
          activity: {
            stage: "generate_models",
            message: "activity JSON 修复失败",
          },
        },
        requirementTrace: [],
        currentStage: null,
        status: "completed",
        errorMessage: null,
      },
    } satisfies RunEvent;

    const next = updateTaskFromEvent(task, event, {
      queued: "排队中",
      completed: "完成",
    });

    expect(next.title).toBe("需求模型生成：1/2 完成，1 个失败");
    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "usecase", status: "completed" }),
      expect.objectContaining({
        id: "activity",
        status: "failed",
        errorMessage: "activity JSON 修复失败",
      }),
    ]);
  });

  it("shows queued subtask position and pending traceability review in task summaries", () => {
    const task = createGenerationTask({
      clientTaskId: "design-1",
      kind: "design",
      title: "设计模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "排队中",
      subtasks: [
        {
          id: "class",
          label: "设计类图",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const queued = updateTaskFromEvent(
      task,
      {
        type: "stage_progress",
        stage: "generate_design_models",
        progress: 35,
        diagramKind: "class",
        subtaskId: "class",
        subtaskLabel: "设计类图",
        subtaskStatus: "queued",
        queuePosition: 2,
        queueAhead: 1,
        waitMs: 12_000,
        estimatedWaitMs: 60_000,
        queueReason: "project",
        message: "模型调用排队中：前方 1 个模型调用",
      } satisfies RunEvent,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(queued.title).toBe("设计模型生成");
    expect(queued.subtasks[0]).toEqual(
      expect.objectContaining({
        id: "class",
        label: "设计类图",
        status: "queued",
        queueAhead: 1,
        queueReason: "project",
      }),
    );

    const pending = updateTaskFromEvent(
      queued,
      {
        type: "completed",
        snapshot: {
          runId: "run-design-1",
          requirementText: "图书馆系统",
          selectedDiagrams: ["class"],
          rules: [],
          requirementModels: [],
          requirementModelTraceability: [],
          models: [
            {
              diagramKind: "class",
              title: "设计类图",
              classes: [],
              relationships: [],
            },
          ],
          designModelTraceability: [
            {
              source: {
                diagramKind: "class",
                elementId: "class-loan-service",
                elementKind: "class",
                label: "LoanService",
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: "uc_borrow_book",
                  elementKind: "usecase",
                  label: "借书",
                },
              ],
              mappingSource: "auto-filled-pending-review",
              reviewStatus: "pending",
              confidence: "low",
            },
          ],
          plantUml: [],
          svgArtifacts: [
            {
              diagramKind: "class",
              svg: "<svg />",
              renderMeta: { engine: "plantuml" },
            },
          ],
          diagramErrors: {},
          designTrace: [],
          currentStage: null,
          status: "completed",
          errorMessage: null,
        },
      } satisfies RunEvent,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(pending.title).toBe("设计模型生成：1/1 完成，1 个待确认");
    expect(pending.subtasks[0]).toEqual(
      expect.objectContaining({
        id: "class",
        status: "pending_review",
        pendingReviewCount: 1,
      }),
    );
  });

  it("does not downgrade a completed subtask when a later artifact event has no explicit status", () => {
    const task = createGenerationTask({
      clientTaskId: "design-sequence-1",
      kind: "design",
      title: "生成设计顺序图",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "sequence",
          label: "顺序图",
          status: "completed",
          message: "模型调用完成",
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "generate_design_sequence",
        artifactKind: "model",
        diagramKind: "sequence",
      } satisfies RunEvent,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.subtasks[0]).toEqual(
      expect.objectContaining({
        id: "sequence",
        status: "completed",
      }),
    );
  });
});
