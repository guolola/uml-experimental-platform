import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
  DocumentRunSnapshot,
} from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../services/workspace-repository";
import {
  createRule,
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../test/workspace-test-utils";
import { useWorkspaceSession } from "./state";

describe("WorkspaceSessionProvider", () => {
  it("drives runs through the repository and tracks stale diagrams after rules refresh", async () => {
    const snapshots = new Map([
      [
        "run-rules-1",
        createRunSnapshot({
          runId: "run-rules-1",
          requirementText: "订单系统需求",
          rules: [createRule()],
        }),
      ],
      [
        "run-diagrams",
        createRunSnapshot({
          runId: "run-diagrams",
          requirementText: "订单系统需求",
          selectedDiagrams: ["usecase", "activity"],
          rules: [createRule()],
          models: [
            {
              diagramKind: "usecase",
              title: "订单系统用例",
              summary: "核心参与者和用例",
              notes: [],
              actors: [
                {
                  id: "actor_user",
                  name: "用户",
                  actorType: "human",
                  responsibilities: ["提交订单"],
                },
              ],
              useCases: [
                {
                  id: "usecase_submit_order",
                  name: "提交订单",
                  goal: "完成订单创建",
                  preconditions: ["已登录"],
                  postconditions: ["订单已生成"],
                  primaryActorId: "actor_user",
                  supportingActorIds: [],
                },
              ],
              systemBoundaries: [{ id: "boundary_order", name: "订单系统" }],
              relationships: [
                {
                  id: "rel_order_1",
                  sourceId: "actor_user",
                  targetId: "usecase_submit_order",
                  type: "association",
                  label: "发起",
                },
              ],
            },
            {
              diagramKind: "activity",
              title: "订单系统流程",
              summary: "订单主流程",
              notes: [],
              swimlanes: [{ id: "lane_user", name: "用户" }],
              nodes: [
                { id: "start", type: "start", name: "开始" },
                {
                  id: "activity_submit",
                  type: "activity",
                  name: "提交订单",
                  actorOrLane: "lane_user",
                  input: ["订单信息"],
                  output: ["订单记录"],
                },
                { id: "end", type: "end", name: "结束" },
              ],
              relationships: [
                {
                  id: "flow_1",
                  type: "control_flow",
                  sourceId: "start",
                  targetId: "activity_submit",
                },
                {
                  id: "flow_2",
                  type: "control_flow",
                  sourceId: "activity_submit",
                  targetId: "end",
                },
              ],
            },
          ],
          plantUml: [
            { diagramKind: "usecase", source: "@startuml\nactor 用户\n@enduml" },
            { diagramKind: "activity", source: "@startuml\nstart\nstop\n@enduml" },
          ],
          svgArtifacts: [
            {
              diagramKind: "usecase",
              svg: "<svg><text>usecase</text></svg>",
              renderMeta: {
                engine: "plantuml",
                generatedAt: new Date().toISOString(),
                sourceLength: 10,
                durationMs: 5,
              },
            },
            {
              diagramKind: "activity",
              svg: "<svg><text>activity</text></svg>",
              renderMeta: {
                engine: "plantuml",
                generatedAt: new Date().toISOString(),
                sourceLength: 10,
                durationMs: 5,
              },
            },
          ],
        }),
      ],
      [
        "run-rules-2",
        createRunSnapshot({
          runId: "run-rules-2",
          requirementText: "订单系统需求 v2",
          rules: [createRule({ id: "r2", text: "库存必须先校验。" })],
        }),
      ],
    ]);

    let startRunCount = 0;
    const startRun = vi.fn(async () => {
      startRunCount += 1;
      if (startRunCount === 1) return { runId: "run-rules-1" };
      if (startRunCount === 2) return { runId: "run-diagrams" };
      return { runId: "run-rules-2" };
    });

    const subscribeToRun = vi.fn(
      async (runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
        const snapshot = snapshots.get(runId);
        if (!snapshot) {
          throw new Error(`Missing snapshot for ${runId}`);
        }
        onEvent({ type: "queued" });
        onEvent({
          type: "stage_progress",
          stage: snapshot.selectedDiagrams.length > 0 ? "render_svg" : "extract_rules",
          progress: snapshot.selectedDiagrams.length > 0 ? 95 : 20,
          message: snapshot.selectedDiagrams.length > 0 ? "正在渲染 SVG" : "正在抽取需求规则",
        });
        onEvent({ type: "completed", snapshot });
      },
    );

    const getRunSnapshot = vi.fn(async (runId: string) => {
      const snapshot = snapshots.get(runId);
      if (!snapshot) {
        throw new Error(`Missing snapshot for ${runId}`);
      }
      return snapshot;
    });

    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun,
      subscribeToRun,
      getRunSnapshot,
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(async (snapshot) => ({
        id: snapshot.runId,
        createdAt: new Date().toISOString(),
        title: "test",
        snapshot,
        providerModel: "gpt-5.5",
      })),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:document-run"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setRequirementText("订单系统需求");
    });
    expect(repository.updateRequirementText).toHaveBeenCalledWith("订单系统需求");
    expect(result.current.textVersion).toBe(1);

    await act(async () => {
      await result.current.generateRules();
    });

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementText: "订单系统需求",
        selectedDiagrams: [],
      }),
    );
    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rulesVersion).toBe(1);
    expect(result.current.isRulesStale).toBe(false);

    act(() => {
      result.current.setSelectedDiagrams(["usecase", "activity"]);
    });

    await act(async () => {
      await result.current.generateDiagrams();
    });

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementText: "订单系统需求",
        selectedDiagrams: ["usecase", "activity"],
      }),
    );
    expect(result.current.generatedDiagrams).toEqual(["usecase", "activity"]);
    expect(result.current.svgArtifacts.usecase?.svg).toContain("<svg>");
    expect(result.current.staleDiagrams).toEqual([]);

    act(() => {
      result.current.setRequirementText("订单系统需求 v2");
    });
    expect(result.current.isRulesStale).toBe(true);

    await act(async () => {
      await result.current.generateRules();
    });

    expect(result.current.rulesVersion).toBe(3);
    expect(result.current.rules[0]?.id).toBe("r2");
    expect(result.current.staleDiagrams).toEqual(["usecase", "activity"]);
  });

  it("keeps only the tail of long streamed LLM diagnostics in memory", async () => {
    const longPrefix = "a".repeat(30_010);
    const snapshot = createRunSnapshot({
      runId: "run-long-stream",
      requirementText: "订单系统需求",
      rules: [createRule()],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-long-stream" })),
      subscribeToRun: vi.fn(
        async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
          onEvent({ type: "queued" });
          onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: longPrefix });
          onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: "TAIL" });
          onEvent({ type: "completed", snapshot });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.setRequirementText("订单系统需求");
    });

    await act(async () => {
      await result.current.generateRules();
    });

    expect(result.current.currentRunDiagnostics.streamText).toHaveLength(30_000);
    expect(result.current.currentRunDiagnostics.streamText.endsWith("TAIL")).toBe(true);
    expect(result.current.currentRunDiagnostics.chunkCount).toBe(2);
  });

  it("keeps concurrent document runs as separate tasks without auto-downloading files", async () => {
    const requirementModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "用例图",
      summary: "核心用例",
      notes: [],
      actors: [],
      useCases: [],
      systemBoundaries: [],
      relationships: [],
    };
    const designModel: DesignDiagramModelSpec = {
      diagramKind: "sequence",
      title: "顺序图",
      summary: "动态行为",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    };
    const snapshots = new Map<string, DocumentRunSnapshot>([
      [
        "doc-req",
        {
          runId: "doc-req",
          documentKind: "requirementsSpec",
          requirementText: "订单系统需求",
          documentId: "doc-requirementsSpec",
          sections: [{ level: 1, title: "1 需求规定", body: ["正文"] }],
          fileName: "需求规格说明书.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 8,
          missingArtifacts: [],
          currentStage: "render_document_file",
          status: "completed",
          errorMessage: null,
        },
      ],
      [
        "doc-design",
        {
          runId: "doc-design",
          documentKind: "softwareDesignSpec",
          requirementText: "订单系统需求",
          documentId: "doc-softwareDesignSpec",
          sections: [{ level: 1, title: "1 设计概述", body: ["正文"] }],
          fileName: "软件设计说明书.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 8,
          missingArtifacts: [],
          currentStage: "render_document_file",
          status: "completed",
          errorMessage: null,
        },
      ],
    ]);
    const subscribers = new Map<
      string,
      {
        onEvent: Parameters<NonNullable<WorkspaceRepository["subscribeToDocumentRun"]>>[1];
        resolve: () => void;
      }
    >();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          models: { usecase: requirementModel },
          designModels: { sequence: designModel },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDocumentRun: vi.fn(async (input) => ({
        runId:
          input.documentKind === "requirementsSpec" ? "doc-req" : "doc-design",
      })),
      subscribeToDocumentRun: vi.fn(
        async (runId, onEvent) =>
          new Promise<void>((resolve) => {
            subscribers.set(runId, { onEvent, resolve });
          }),
      ),
      getDocumentRunSnapshot: vi.fn(async (runId) => snapshots.get(runId)!),
      downloadDocumentRun: vi.fn(async (runId, defaultFileName) => ({
        blob: new Blob(["docx"]),
        fileName: defaultFileName ?? snapshots.get(runId)?.fileName ?? "说明书.docx",
      })),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(async (snapshot) => ({
        id: snapshot.runId,
        createdAt: new Date().toISOString(),
        title: "document",
        snapshot,
        providerModel: "gpt-5.5",
      })),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });

    let requirementsPromise!: Promise<DocumentRunSnapshot | null>;
    act(() => {
      requirementsPromise = result.current.generateRequirementsSpec();
    });
    await waitFor(() => {
      expect(subscribers.has("doc-req")).toBe(true);
    });
    let designPromise!: Promise<DocumentRunSnapshot | null>;
    act(() => {
      designPromise = result.current.generateSoftwareDesignSpec();
    });
    await waitFor(() => {
      expect(subscribers.has("doc-design")).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.generationTasks.map((task) => task.title)).toEqual([
        "软件设计说明书",
        "需求规格说明书",
      ]);
    });

    for (const runId of ["doc-req", "doc-design"]) {
      const subscriber = subscribers.get(runId)!;
      act(() => {
        subscriber.onEvent({ type: "queued" });
        subscriber.onEvent({
          type: "completed",
          snapshot: snapshots.get(runId)!,
        });
        subscriber.resolve();
      });
    }

    await act(async () => {
      await requirementsPromise;
      await designPromise;
    });

    expect(repository.downloadDocumentRun).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.generationTasks).toHaveLength(2);
      expect(result.current.generationTasks.every((task) => task.status === "completed")).toBe(
        true,
      );
    });
  });
});
