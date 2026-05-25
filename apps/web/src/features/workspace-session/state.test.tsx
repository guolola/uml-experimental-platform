import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  DiagramModelSpec,
  DocumentRunSnapshot,
  UseCaseDiagramSpec,
} from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../services/workspace-repository";
import {
  createRule,
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../test/workspace-test-utils";
import { useWorkspaceSession } from "./state";

const { toastMessage } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    message: toastMessage,
  },
}));

function GenerateRulesHarness() {
  const { generateRules } = useWorkspaceSession();
  return (
    <button type="button" onClick={() => void generateRules()}>
      生成需求规则
    </button>
  );
}

describe("WorkspaceSessionProvider", () => {
  it("shows Figma-style generation result dialogs with cancel and confirm close actions", async () => {
    toastMessage.mockClear();
    let runIndex = 0;
    const createSuccessSnapshot = () =>
      createRunSnapshot({
        runId: `run-success-dialog-${runIndex}`,
        requirementText: "订单系统需求",
        rules: [createRule()],
      });
    const successRepository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "订单系统需求" }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => {
        runIndex += 1;
        return { runId: `run-success-dialog-${runIndex}` };
      }),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        const successSnapshot = createSuccessSnapshot();
        onEvent({ type: "completed", snapshot: successSnapshot });
      }),
      getRunSnapshot: vi.fn(async () => createSuccessSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<GenerateRulesHarness />, successRepository));
    await user.click(await screen.findByRole("button", { name: "生成需求规则" }));

    const successDialog = await screen.findByRole("dialog", {
      name: "需求规则已生成",
    });
    expect(successDialog).toHaveClass("sm:max-w-[448px]", "rounded-[12px]");
    expect(
      within(successDialog).getByLabelText("操作成功"),
    ).toHaveClass("bg-[rgba(74,222,128,0.1)]");
    expect(within(successDialog).getByText("生成完成。")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "生成成功" })).not.toBeInTheDocument();
    expect(toastMessage).not.toHaveBeenCalled();
    await user.click(within(successDialog).getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
    });

    toastMessage.mockClear();
    await user.click(screen.getByRole("button", { name: "生成需求规则" }));
    const successDialogAgain = await screen.findByRole("dialog", {
      name: "需求规则已生成",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "生成成功" })).not.toBeInTheDocument();
    expect(toastMessage).not.toHaveBeenCalled();
    await user.click(within(successDialogAgain).getByRole("button", { name: "确认" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
    });
  });

  it("shows generation failures without raw technical details", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "订单系统需求" }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-failed-dialog" })),
      subscribeToRun: vi.fn(async () => {
        throw new Error("Trusted chain traceability gate failed: runId=abc123");
      }),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<GenerateRulesHarness />, repository));
    await user.click(await screen.findByRole("button", { name: "生成需求规则" }));

    const failedDialog = await screen.findByRole("dialog", { name: "生成失败" });
    expect(failedDialog).toHaveClass("sm:max-w-[448px]", "rounded-[12px]");
    expect(within(failedDialog).getByLabelText("操作失败")).toHaveClass(
      "bg-[rgba(186,26,26,0.1)]",
    );
    expect(
      within(failedDialog).getByText("生成过程中出现问题，请在当前阶段的问题列表查看详情。"),
    ).toBeInTheDocument();
    expect(within(failedDialog).getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(within(failedDialog).getByRole("button", { name: "确认" })).toBeInTheDocument();
    expect(screen.queryByText(/Trusted chain/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/runId/u)).not.toBeInTheDocument();
  });

  it("does not show a stale success dialog when final snapshot handling fails", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "订单系统需求" }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-completed-then-failed" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({
          type: "completed",
          snapshot: createRunSnapshot({
            runId: "run-completed-then-failed",
            requirementText: "订单系统需求",
            rules: [createRule()],
          }),
        });
      }),
      getRunSnapshot: vi.fn(async () => {
        throw new Error("Final snapshot unavailable");
      }),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<GenerateRulesHarness />, repository));
    await user.click(await screen.findByRole("button", { name: "生成需求规则" }));

    const failedDialog = await screen.findByRole("dialog", { name: "生成失败" });
    expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
    await user.click(within(failedDialog).getByRole("button", { name: "确认" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
  });

  it("keeps global generating true for active model runs", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-rules" })),
      subscribeToRun: vi.fn(async () => new Promise<void>(() => {})),
      getRunSnapshot: vi.fn(),
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
    const user = userEvent.setup();

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    act(() => {
      void result.current.generateRules();
    });

    await waitFor(() => {
      expect(result.current.generating).toBe(true);
    });
  });

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
    const user = userEvent.setup();

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

    let diagramGeneration: Promise<void> | null = null;
    act(() => {
      diagramGeneration = result.current.generateDiagrams();
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await diagramGeneration;
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

  it("saves manual requirement model edits and clears the mapping warning after rerender", async () => {
    const originalUseCaseModel: UseCaseDiagramSpec = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "教师登录系统。",
      notes: [],
      actors: [
        {
          id: "actor_teacher",
          name: "教师",
          actorType: "human",
          responsibilities: [],
        },
      ],
      useCases: [
        {
          id: "uc_login",
          name: "登录",
          goal: "进入系统",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "system", name: "实验平台" }],
      relationships: [
        {
          id: "rel_login",
          type: "association",
          sourceId: "actor_teacher",
          targetId: "uc_login",
          label: "发起",
        },
      ],
    };
    const editedUseCaseModel: UseCaseDiagramSpec = {
      ...originalUseCaseModel,
      actors: [{ ...originalUseCaseModel.actors[0], name: "授课教师" }],
      useCases: [
        ...originalUseCaseModel.useCases,
        {
          id: "uc_logout",
          name: "退出登录",
          goal: "离开系统",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      relationships: [
        {
          ...originalUseCaseModel.relationships[0],
          label: "发起登录",
          description: "授课教师发起登录。",
        },
      ],
    };
    const saveRequirementModelEdit = vi.fn(async () => {});
    const renderStructuredModel = vi.fn(async () => ({
      plantUmlSource: "@startuml\nactor 授课教师\n@enduml",
      svg: "<svg><text>授课教师</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-05-25T00:00:00.000Z",
        sourceLength: 28,
        durationMs: 2,
      },
    }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          models: { usecase: originalUseCaseModel },
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "actor_teacher",
                elementKind: "actor",
                label: "教师",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc_login",
                elementKind: "usecase",
                label: "登录",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "rel_login",
                elementKind: "relationship",
                label: "发起",
              },
            },
          ],
          generatedDiagramTypes: ["usecase"],
          diagramVersions: { usecase: 0 },
          plantUml: { usecase: "@startuml\nactor 教师\n@enduml" },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      renderStructuredModel,
      saveRequirementModelEdit,
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
    expect(result.current.designGenerationBlockedReason).toBeNull();

    await act(async () => {
      await result.current.saveRequirementModelEdit("usecase", editedUseCaseModel);
    });

    expect(
      (result.current.models.usecase as UseCaseDiagramSpec | undefined)?.actors[0]
        ?.name,
    ).toBe("授课教师");
    expect(saveRequirementModelEdit).toHaveBeenCalledWith(
      "usecase",
      editedUseCaseModel,
      expect.objectContaining({ status: "dirty" }),
    );
    expect(result.current.manualModelEditStatus.usecase?.status).toBe("dirty");
    expect(result.current.manualModelEditStatus.usecase?.warning).toMatch(
      /可能与前置需求映射不一致/,
    );
    expect(result.current.designGenerationBlockedReason).toBe(
      "需求模型缺少完整元素级映射，请先重新生成需求模型",
    );

    await act(async () => {
      await result.current.rerenderRequirementModel("usecase");
    });

    expect(renderStructuredModel).toHaveBeenCalledWith(editedUseCaseModel);
    expect(result.current.plantUml.usecase).toContain("授课教师");
    expect(result.current.svgArtifacts.usecase?.svg).toContain("授课教师");
    expect(result.current.manualModelEditStatus.usecase?.status).toBe("rerendered");
    expect(result.current.manualModelEditStatus.usecase?.warning).toBeNull();
    expect(result.current.designGenerationBlockedReason).toBeNull();
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
    expect(result.current.generationTasks.some((task) => task.status === "queued")).toBe(
      true,
    );
    expect(result.current.generating).toBe(false);

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

  it("passes existing design artifacts when incrementally generating only a table diagram", async () => {
    const usecaseModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "图书馆用例模型",
      summary: "管理员与读者的核心用例",
      notes: [],
      actors: [
        {
          id: "actor_librarian",
          name: "图书管理员",
          actorType: "human",
          responsibilities: ["借书"],
        },
      ],
      useCases: [
        {
          id: "uc_borrow",
          name: "借书",
          goal: "登记图书借阅",
          preconditions: ["图书未借出"],
          postconditions: ["图书被借出"],
          primaryActorId: "actor_librarian",
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "boundary_library", name: "图书馆管理系统" }],
      relationships: [],
    };
    const classRequirementModel: DiagramModelSpec = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "图书实体",
      notes: [],
      classes: [
        {
          id: "class_book",
          name: "图书",
          classKind: "entity",
          attributes: [{ name: "id", type: "string", visibility: "private" }],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const sequenceModel: DesignDiagramModelSpec = {
      diagramKind: "sequence",
      modelId: "sequence:uc_borrow",
      sourceUseCaseId: "uc_borrow",
      sourceUseCaseName: "借书",
      title: "借书顺序图",
      summary: "借书交互",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    };
    const designClassModel: DesignDiagramModelSpec = {
      diagramKind: "class",
      title: "设计类图",
      summary: "图书设计类",
      notes: [],
      classes: [
        {
          id: "class_book",
          name: "图书",
          classKind: "entity",
          attributes: [{ name: "id", type: "string", visibility: "private" }],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const tableModel: DesignDiagramModelSpec = {
      diagramKind: "table",
      title: "表关系图",
      summary: "图书表",
      notes: [],
      tables: [
        {
          id: "book",
          name: "book",
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "VARCHAR",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
          ],
        },
      ],
      relationships: [],
    };
    const snapshot: DesignRunSnapshot = {
      runId: "design-table-run",
      requirementText: "图书馆管理系统",
      selectedDiagrams: ["table"],
      rules: [
        createRule({
          id: "r1",
          text: "图书管理员可以借书。",
          relatedDiagrams: ["usecase"],
        }),
        createRule({
          id: "r2",
          text: "系统需要记录图书。",
          relatedDiagrams: ["class"],
        }),
      ],
      requirementModels: [usecaseModel, classRequirementModel],
      requirementModelTraceability: [
        {
          ruleId: "r1",
          target: {
            diagramKind: "usecase",
            elementId: "actor_librarian",
            elementKind: "actor",
            label: "图书管理员",
          },
        },
        {
          ruleId: "r1",
          target: {
            diagramKind: "usecase",
            elementId: "uc_borrow",
            elementKind: "usecase",
            label: "借书",
          },
        },
        {
          ruleId: "r2",
          target: {
            diagramKind: "class",
            elementId: "class_book",
            elementKind: "class",
            label: "图书",
          },
        },
      ],
      models: [tableModel],
      designModelTraceability: [
        {
          source: {
            diagramKind: "table",
            elementId: "book",
            elementKind: "table",
            label: "book",
          },
          targets: [
            {
              diagramKind: "class",
              elementId: "class_book",
              elementKind: "class",
              label: "图书",
            },
          ],
        },
      ],
      plantUml: [{ diagramKind: "table", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "table",
          svg: "<svg></svg>",
          renderMeta: {
            engine: "test",
            generatedAt: new Date().toISOString(),
            sourceLength: 18,
            durationMs: 1,
          },
        },
      ],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      errorMessage: null,
    };
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "图书馆管理系统",
          rules: snapshot.rules,
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          diagramVersions: { usecase: 1, class: 1 },
          generatedDiagramTypes: ["usecase", "class"],
          models: { usecase: usecaseModel, class: classRequirementModel },
          requirementModelTraceability: [...snapshot.requirementModelTraceability],
          selectedDesignDiagramTypes: ["table"],
          generatedDesignDiagramTypes: ["sequence", "class"],
          designModels: {
            "sequence:uc_borrow": sequenceModel,
            class: designClassModel,
          },
          designModelTraceability: [],
          designPlantUml: {
            "sequence:uc_borrow": "@startuml\n@enduml",
            class: "@startuml\n@enduml",
          },
          designSvgArtifacts: {
            "sequence:uc_borrow": {
              diagramKind: "sequence",
              modelId: "sequence:uc_borrow",
              svg: "<svg></svg>",
              renderMeta: {
                engine: "test",
                generatedAt: new Date().toISOString(),
                sourceLength: 18,
                durationMs: 1,
              },
            },
            class: {
              diagramKind: "class",
              svg: "<svg></svg>",
              renderMeta: {
                engine: "test",
                generatedAt: new Date().toISOString(),
                sourceLength: 18,
                durationMs: 1,
              },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(async () => ({ runId: "design-table-run" })),
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      }),
      getDesignRunSnapshot: vi.fn(async () => snapshot),
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

    const user = userEvent.setup();
    let designGeneration: Promise<void> | null = null;
    act(() => {
      designGeneration = result.current.generateDesignDiagrams(["table"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await designGeneration;
    });

    expect(repository.startDesignRun).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedDiagrams: ["table"],
        existingDesignModels: expect.arrayContaining([
          expect.objectContaining({ diagramKind: "sequence" }),
          expect.objectContaining({ diagramKind: "class" }),
        ]),
        existingDesignPlantUml: expect.arrayContaining([
          expect.objectContaining({ diagramKind: "sequence" }),
          expect.objectContaining({ diagramKind: "class" }),
        ]),
      }),
    );
    expect(Object.keys(result.current.designModels).sort()).toEqual([
      "class",
      "sequence:uc_borrow",
      "table",
    ]);
    expect(result.current.generatedDesignDiagrams.sort()).toEqual([
      "class",
      "sequence",
      "table",
    ]);
  });
});
