// Verifies run subscriptions recover from broken SSE streams by polling terminal snapshots.
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";
import {
  subscribeToCodeRunEvents,
  subscribeToDesignRunEvents,
  subscribeToDocumentRunEvents,
  subscribeToRequirementRunEvents,
} from "./run-subscriptions";
import { PROJECT_ID_HEADER } from "./project-scope";

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

function codeSnapshot(
  overrides: Partial<CodeRunSnapshot> = {},
): CodeRunSnapshot {
  return {
    runId: "run-code-1",
    requirementText: "生成订单系统代码",
    rules: [],
    designModels: [],
    designPlantUml: [],
    spec: null,
    businessLogic: null,
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: [],
    codeTrace: [],
    codeGenerationMode: "json_schema_operations",
    qualityDiagnostics: [],
    files: { "/src/App.tsx": "export default function App() { return null; }" },
    entryFile: "/src/App.tsx",
    dependencies: {},
    agentPlan: [],
    generationMode: "regenerate",
    changedFileCount: 1,
    diagnostics: [],
    codeContextHash: null,
    currentStage: "write_code_files",
    status: "completed",
    error: null,
    ...overrides,
  };
}

function documentSnapshot(
  overrides: Partial<DocumentRunSnapshot> = {},
): DocumentRunSnapshot {
  return {
    runId: "run-doc-1",
    documentKind: "requirementsSpec",
    requirementText: "生成订单系统说明书",
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    documentId: "document-1",
    sections: [{ level: 1, title: "需求规定", body: ["正文"] }],
    fileName: "requirements.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 12,
    missingArtifacts: [],
    currentStage: "render_document_file",
    status: "completed",
    error: null,
    ...overrides,
  };
}

function requestHasProjectHeader(init: RequestInit | undefined) {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has(PROJECT_ID_HEADER);
  if (Array.isArray(headers)) {
    return headers.some(
      ([key]) => key.toLowerCase() === PROJECT_ID_HEADER.toLowerCase(),
    );
  }
  return Object.prototype.hasOwnProperty.call(headers, PROJECT_ID_HEADER);
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

  it.each([
    {
      label: "requirements",
      runId: "run-req-1",
      eventPath: "/api/runs/run-req-1/events",
      snapshotPath: "/api/runs/run-req-1",
      subscribe: subscribeToRequirementRunEvents,
      snapshot: requirementSnapshot({
        currentStage: "render_svg",
        status: "completed",
      }),
    },
    {
      label: "design",
      runId: "run-design-1",
      eventPath: "/api/design-runs/run-design-1/events",
      snapshotPath: "/api/design-runs/run-design-1",
      subscribe: subscribeToDesignRunEvents,
      snapshot: designSnapshot({
        currentStage: "render_svg",
        status: "completed",
      }),
    },
    {
      label: "code",
      runId: "run-code-1",
      eventPath: "/api/code-runs/run-code-1/events",
      snapshotPath: "/api/code-runs/run-code-1",
      subscribe: subscribeToCodeRunEvents,
      snapshot: codeSnapshot(),
    },
    {
      label: "document",
      runId: "run-doc-1",
      eventPath: "/api/document-runs/run-doc-1/events",
      snapshotPath: "/api/document-runs/run-doc-1",
      subscribe: subscribeToDocumentRunEvents,
      snapshot: documentSnapshot(),
    },
  ])(
    "polls $label snapshots after a legacy EventSource disconnect without project scope",
    async ({ runId, eventPath, snapshotPath, subscribe, snapshot }) => {
      const eventSourceUrls: string[] = [];
      const snapshotFetches: Array<{
        url: string;
        hasProjectHeader: boolean;
      }> = [];
      class MockEventSource {
        onmessage: ((event: MessageEvent<string>) => void) | null = null;
        onerror: (() => void) | null = null;

        close() {}

        constructor(url: string) {
          eventSourceUrls.push(url);
          queueMicrotask(() => {
            this.onerror?.();
          });
        }
      }
      vi.stubGlobal("EventSource", MockEventSource);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url.endsWith(snapshotPath)) {
            snapshotFetches.push({
              url,
              hasProjectHeader: requestHasProjectHeader(init),
            });
            return jsonResponse(snapshot);
          }
          return jsonResponse({ message: "unexpected request" }, 500);
        }),
      );
      const events: RunEvent[] = [];

      await expect(
        subscribe({
          runId,
          projectId: null,
          onEvent: (event) => events.push(event),
        }),
      ).resolves.toBeUndefined();

      expect(eventSourceUrls).toEqual([eventPath]);
      expect(snapshotFetches).toEqual([
        { url: snapshotPath, hasProjectHeader: false },
      ]);
      expect(events).toEqual([
        expect.objectContaining({
          type: "completed",
          snapshot: expect.objectContaining({ runId, status: "completed" }),
        }),
      ]);
    },
  );
});
