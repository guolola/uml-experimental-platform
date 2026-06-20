// Verifies run subscriptions recover from broken SSE streams by polling terminal snapshots.
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DesignRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";
import {
  subscribeToDesignRunEvents,
  subscribeToRequirementRunEvents,
} from "./run-subscriptions";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eventStreamResponse(events: RunEvent[]) {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

function requirementSnapshot(
  overrides: Partial<RunSnapshot> = {},
): RunSnapshot {
  return {
    runId: "run-req-1",
    requirementText: "生成订单系统 UML",
    selectedDiagrams: ["usecase"],
    analysisTargetUseCaseIds: [],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "generate_models",
    status: "running",
    error: null,
    ...overrides,
  };
}

function designSnapshot(
  overrides: Partial<DesignRunSnapshot> = {},
): DesignRunSnapshot {
  return {
    runId: "run-design-1",
    requirementText: "生成订单系统设计 UML",
    selectedDiagrams: ["activity"],
    requestedDiagrams: ["activity"],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    requirementModels: [],
    requirementModelTraceability: [],
    models: [],
    designModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [],
    currentStage: "generate_design_models",
    status: "running",
    error: null,
    ...overrides,
  };
}

describe("run subscriptions", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls requirement snapshots until completion after a project SSE stream ends early", async () => {
    vi.useFakeTimers();
    let snapshotReads = 0;
    const events: RunEvent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/runs/run-req-1/events")) {
          return eventStreamResponse([{ type: "queued" }]);
        }
        if (url.endsWith("/api/runs/run-req-1")) {
          snapshotReads += 1;
          return jsonResponse(
            snapshotReads === 1
              ? requirementSnapshot({
                  currentStage: "generate_models",
                  status: "running",
                })
              : requirementSnapshot({
                  currentStage: "render_svg",
                  status: "completed",
                }),
          );
        }
        return jsonResponse({ message: "unexpected request" }, 500);
      }),
    );

    const subscription = subscribeToRequirementRunEvents({
      runId: "run-req-1",
      projectId: "project-a",
      onEvent: (event) => events.push(event),
    });

    await vi.waitFor(() => expect(snapshotReads).toBe(1));
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(subscription).resolves.toBeUndefined();

    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "stage_progress",
      "completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      snapshot: { status: "completed", runId: "run-req-1" },
    });
  });

  it("preserves design diagram errors when polling returns a completed snapshot", async () => {
    const events: RunEvent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/design-runs/run-design-1/events")) {
          return eventStreamResponse([{ type: "queued" }]);
        }
        if (url.endsWith("/api/design-runs/run-design-1")) {
          return jsonResponse(
            designSnapshot({
              currentStage: "render_svg",
              status: "completed",
              diagramErrors: {
                "activity:design-interface-relations": {
                  stage: "generate_design_models",
                  error: {
                    code: "RUN_DEPENDENCY_MISSING",
                    message: "界面关系图缺少前置设计模型",
                    category: "generation",
                    retryable: false,
                  },
                },
              },
            }),
          );
        }
        return jsonResponse({ message: "unexpected request" }, 500);
      }),
    );

    await expect(
      subscribeToDesignRunEvents({
        runId: "run-design-1",
        projectId: "project-a",
        onEvent: (event) => events.push(event),
      }),
    ).resolves.toBeUndefined();

    expect(events.at(-1)).toMatchObject({
      type: "completed",
      snapshot: {
        diagramErrors: {
          "activity:design-interface-relations": {
            error: { message: "界面关系图缺少前置设计模型" },
          },
        },
      },
    });
  });

  it("emits and rejects with the server snapshot error when polling reaches failed", async () => {
    const events: RunEvent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/design-runs/run-design-1/events")) {
          return eventStreamResponse([{ type: "queued" }]);
        }
        if (url.endsWith("/api/design-runs/run-design-1")) {
          return jsonResponse(
            designSnapshot({
              status: "failed",
              error: {
                code: "RUN_INTERNAL_ERROR",
                message: "模型输出解析失败",
                category: "internal",
                retryable: true,
              },
            }),
          );
        }
        return jsonResponse({ message: "unexpected request" }, 500);
      }),
    );

    await expect(
      subscribeToDesignRunEvents({
        runId: "run-design-1",
        projectId: "project-a",
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow("模型输出解析失败");

    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "failed",
    ]);
  });
});
