// Verifies model-level task summaries remain accurate when a run partially succeeds.
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@uml-platform/contracts";
import {
  createGenerationTask,
  updateDiagnosticsFromEvent,
  updateTaskFromEvent,
} from "./generation-tasks";
import { createEmptyDiagnostics } from "./diagnostics";

describe("workspace-session generation task helpers", () => {
  it("ignores blank llm chunks in user-visible diagnostics", () => {
    const diagnostics = createEmptyDiagnostics();
    const blankEvent = {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "   \n",
    } satisfies RunEvent;

    const next = updateDiagnosticsFromEvent(diagnostics, blankEvent);

    expect(next.streamText).toBe("");
    expect(next.chunkCount).toBe(0);
    expect(next.events).toEqual([]);
    expect(next.activeStage).toBe("generate_models");
  });

  it("counts only effective llm chunks in user-visible diagnostics", () => {
    const diagnostics = createEmptyDiagnostics();
    const next = updateDiagnosticsFromEvent(diagnostics, {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "\"models\"",
    });

    expect(next.streamText).toBe("\"models\"");
    expect(next.chunkCount).toBe(1);
    expect(next.events.at(-1)?.label).toBe("收到模型输出");
  });

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
    expect(next.status).toBe("failed");
    expect(next.message).toBe("完成，但 1 个子任务失败");
    expect(next.phaseSummary).toBe("生成结束，但 1 个子任务失败。");
    expect(next.errorMessage).toBe("完成，但 1 个子任务失败");
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
        message: "有 1 条低置信追踪关系需复核",
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
        message: "已完成",
      }),
    );
  });

  it("does not add an aggregate sequence completion when use-case sequence subtasks exist", () => {
    const task = createGenerationTask({
      clientTaskId: "design-sequence-2",
      kind: "design",
      title: "生成设计顺序图",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "sequence:uc_view",
          label: "顺序图：查看活动",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "sequence:uc_create",
          label: "顺序图：创建活动",
          status: "rendering",
          message: null,
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
        subtaskId: "sequence",
        subtaskStatus: "completed",
      } satisfies RunEvent,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.subtasks.map((subtask) => subtask.id)).toEqual([
      "sequence:uc_view",
      "sequence:uc_create",
    ]);
  });

  it("replaces aggregate analysis placeholders when per-use-case analysis subtasks appear", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-analysis-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:analysis",
          label: "需求分析模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:analysis",
          label: "需求分析模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:analysis",
          label: "需求分析模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const modelStarted = updateTaskFromEvent(
      task,
      {
        type: "stage_progress",
        stage: "generate_models",
        progress: 35,
        diagramKind: "analysis",
        subtaskId: "analysis:uc_view",
        subtaskLabel: "需求分析模型：查看预约",
        subtaskStatus: "running",
        message: "正在生成需求分析模型：查看预约",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(modelStarted.subtasks.map((subtask) => subtask.id)).toEqual([
      "generate_plantuml:analysis",
      "render_svg:analysis",
      "generate_models:analysis:uc_view",
    ]);

    const plantUmlReady = updateTaskFromEvent(
      modelStarted,
      {
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: "analysis",
        modelId: "analysis:uc_view",
        subtaskId: "analysis:uc_view",
        subtaskLabel: "查看预约需求分析模型",
        subtaskStatus: "completed",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(plantUmlReady.subtasks.map((subtask) => subtask.id)).toEqual([
      "render_svg:analysis",
      "generate_models:analysis:uc_view",
      "generate_plantuml:analysis:uc_view",
    ]);
  });

  it("does not add unplanned preserved model artifacts to partial rerun tasks", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-analysis-partial-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:analysis:uc_view",
          label: "需求分析模型：查看预约",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:analysis:uc_view",
          label: "需求分析模型：查看预约",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:analysis:uc_view",
          label: "需求分析模型：查看预约",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const afterPreservedPlantUml = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: "usecase",
        subtaskId: "usecase",
        subtaskStatus: "completed",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    const afterPreservedSvg = updateTaskFromEvent(
      afterPreservedPlantUml,
      {
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "svg",
        diagramKind: "usecase",
        subtaskId: "usecase",
        subtaskStatus: "completed",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(afterPreservedSvg.subtasks.map((subtask) => subtask.id)).toEqual([
      "generate_models:analysis:uc_view",
      "generate_plantuml:analysis:uc_view",
      "render_svg:analysis:uc_view",
    ]);
  });

  it("marks only the missing use-case sequence subtask from model-specific errors", () => {
    const task = createGenerationTask({
      clientTaskId: "design-sequence-3",
      kind: "design",
      title: "生成设计顺序图",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "sequence:uc_view",
          label: "顺序图：查看座位",
          status: "running",
          message: null,
          errorMessage: null,
        },
        {
          id: "sequence:uc_filter_date",
          label: "顺序图：日期筛选",
          status: "running",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "completed",
        snapshot: {
          runId: "run-design-sequence-partial",
          requirementText: "共享自习室座位预约系统",
          selectedDiagrams: ["sequence"],
          rules: [],
          requirementModels: [],
          requirementModelTraceability: [],
          models: [
            {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              sourceUseCaseId: "uc_view",
              sourceUseCaseName: "查看座位",
              title: "查看座位顺序图",
              summary: "查看座位的对象交互流程。",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          ],
          designModelTraceability: [],
          plantUml: [],
          svgArtifacts: [],
          diagramErrors: {
            "sequence:uc_filter_date": {
              stage: "generate_design_sequence",
              message: "日期筛选顺序图生成结果为空",
            },
          },
          designTrace: [],
          currentStage: "generate_design_sequence",
          status: "failed",
          errorMessage: "缺少 1 个用例顺序图：uc_filter_date:日期筛选",
        },
      } satisfies RunEvent,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.title).toBe("生成设计顺序图：1/2 完成，1 个失败");
    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "sequence:uc_view", status: "completed" }),
      expect.objectContaining({
        id: "sequence:uc_filter_date",
        status: "failed",
        errorMessage: "日期筛选顺序图生成结果为空",
      }),
    ]);
  });

  it("keeps model, PlantUML, and SVG subtasks separate for the same diagram", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-segmented-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:deployment",
          label: "部署需求模型",
          status: "running",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:deployment",
          label: "部署需求模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:deployment",
          label: "部署需求模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const modelReady = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "generate_models",
        artifactKind: "model",
        diagramKind: "deployment",
        subtaskId: "deployment",
        subtaskStatus: "completed",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(modelReady.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "queued" }),
      expect.objectContaining({ id: "render_svg:deployment", status: "queued" }),
    ]);

    const plantUmlReady = updateTaskFromEvent(
      modelReady,
      {
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: "deployment",
        subtaskId: "deployment",
        subtaskStatus: "rendering",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(plantUmlReady.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "completed" }),
      expect.objectContaining({ id: "render_svg:deployment", status: "queued" }),
    ]);

    const repairing = updateTaskFromEvent(
      plantUmlReady,
      {
        type: "stage_progress",
        stage: "render_svg",
        progress: 95,
        message: "PlantUML 编译失败，正在尝试修复（1/2）",
        diagramKind: "deployment",
        subtaskId: "deployment",
        subtaskStatus: "repairing",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(repairing.title).toBe("需求模型生成：模型 1/1，图源码 1/1，SVG 0/1");
    expect(repairing.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "completed" }),
      expect.objectContaining({ id: "render_svg:deployment", status: "repairing" }),
    ]);
  });

  it("keeps completed rendered models separate from models still generating", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-overlap-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-06T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:usecase",
          label: "用例模型",
          status: "completed",
          message: "模型调用完成",
          errorMessage: null,
        },
        {
          id: "generate_plantuml:usecase",
          label: "用例模型",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:usecase",
          label: "用例模型",
          status: "rendering",
          message: "正在渲染：用例模型",
          errorMessage: null,
        },
        {
          id: "generate_models:class",
          label: "领域概念模型",
          status: "running",
          message: "正在生成结构化模型：class",
          errorMessage: null,
        },
        {
          id: "generate_plantuml:class",
          label: "领域概念模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:class",
          label: "领域概念模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "svg",
        diagramKind: "usecase",
        subtaskId: "usecase",
        subtaskStatus: "completed",
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(next.title).toBe("需求模型生成：模型 1/2，图源码 1/2，SVG 1/2");
    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:usecase", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:usecase", status: "completed" }),
      expect.objectContaining({ id: "render_svg:usecase", status: "completed" }),
      expect.objectContaining({ id: "generate_models:class", status: "running" }),
      expect.objectContaining({ id: "generate_plantuml:class", status: "queued" }),
      expect.objectContaining({ id: "render_svg:class", status: "queued" }),
    ]);
  });

  it("marks downstream diagram source and render subtasks failed when model generation fails", () => {
    const task = createGenerationTask({
      clientTaskId: "design-activity-failure",
      kind: "design",
      title: "设计模型生成",
      providerModel: "deepseek-ai/DeepSeek-V4-Pro",
      startedAt: "2026-06-06T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_design_models:activity",
          label: "界面关系图",
          status: "running",
          message: "模型调用开始执行",
          errorMessage: null,
        },
        {
          id: "generate_plantuml:activity",
          label: "界面关系图",
          status: "queued",
          message: "等待执行",
          errorMessage: null,
        },
        {
          id: "render_svg:activity",
          label: "界面关系图",
          status: "queued",
          message: "等待执行",
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "stage_progress",
        stage: "generate_design_models",
        progress: 70,
        message: "界面关系图 超过 180000ms 未完成",
        diagramKind: "activity",
        subtaskId: "activity",
        subtaskLabel: "界面关系图",
        subtaskStatus: "failed",
      } satisfies RunEvent,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.title).toBe("设计模型生成：模型 0/1，图源码 0/1，SVG 0/1，1 个失败");
    expect(next.subtasks).toEqual([
      expect.objectContaining({
        id: "generate_design_models:activity",
        status: "failed",
      }),
      expect.objectContaining({
        id: "generate_plantuml:activity",
        status: "failed",
        message: "前置模型生成失败，未执行",
      }),
      expect.objectContaining({
        id: "render_svg:activity",
        status: "failed",
        message: "前置模型生成失败，未执行",
      }),
    ]);
  });

  it("applies terminal snapshot errors to the matching stage-scoped subtask only", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-segmented-2",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:deployment",
          label: "部署需求模型",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:deployment",
          label: "部署需求模型",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:deployment",
          label: "部署需求模型",
          status: "rendering",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "completed",
        snapshot: {
          runId: "run-segmented-terminal",
          requirementText: "部署到 Web 和数据库服务器",
          selectedDiagrams: ["deployment"],
          rules: [],
          models: [{ diagramKind: "deployment", title: "部署需求模型" }],
          requirementModelTraceability: [],
          plantUml: [
            {
              diagramKind: "deployment",
              source: "@startuml\n@enduml",
            },
          ],
          svgArtifacts: [],
          diagramErrors: {
            deployment: {
              stage: "render_svg",
              message: "PlantUML repair failed",
            },
          },
          requirementTrace: [],
          currentStage: "render_svg",
          status: "completed",
          errorMessage: null,
        },
      } satisfies RunEvent,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "completed" }),
      expect.objectContaining({
        id: "render_svg:deployment",
        status: "failed",
        errorMessage: "PlantUML repair failed",
      }),
    ]);
  });
});
