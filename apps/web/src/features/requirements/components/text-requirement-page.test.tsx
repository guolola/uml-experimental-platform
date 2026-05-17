import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { TextRequirementView } from "./text-requirement-page";

describe("TextRequirementView", () => {
  function createBaseRepository(
    overrides: Partial<WorkspaceRepository> = {},
  ): WorkspaceRepository {
    return {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-test" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
      ...overrides,
    };
  }

  it("starts a rules-only run through session actions", async () => {
    const startRun = vi.fn(async () => ({ runId: "run-rules" }));
    const subscribeToRun = vi.fn(
      async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
        onEvent({ type: "queued" });
        onEvent({
          type: "completed",
          snapshot: createRunSnapshot({
            runId: "run-rules",
            requirementText: "创建一个订单系统",
            rules: [createRule()],
          }),
        });
      },
    );
    const getRunSnapshot = vi.fn(async () =>
      createRunSnapshot({
        runId: "run-rules",
        requirementText: "创建一个订单系统",
        rules: [createRule()],
      }),
    );

    const repository = createBaseRepository({
      startRun,
      subscribeToRun,
      getRunSnapshot,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.type(
      await screen.findByPlaceholderText(
        "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则",
      ),
      "创建一个订单系统",
    );
    await user.click(screen.getByTitle("生成需求规则"));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementText: "创建一个订单系统",
          selectedDiagrams: [],
        }),
      );
    });
  });

  it("starts a diagram run through session actions", async () => {
    const startRun = vi.fn(async () => ({ runId: "run-diagrams" }));
    const snapshot = createRunSnapshot({
      runId: "run-diagrams",
      requirementText: "创建一个订单系统",
      selectedDiagrams: ["usecase"],
      rules: [createRule()],
      models: [
        {
          diagramKind: "usecase",
          title: "订单系统用例",
          summary: "主要角色与用例",
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
              type: "association",
              sourceId: "actor_user",
              targetId: "usecase_submit_order",
            },
          ],
        },
      ],
      plantUml: [{ diagramKind: "usecase", source: "@startuml\nactor 用户\n@enduml" }],
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
      ],
    });

    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [createRule()],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      startRun,
      subscribeToRun: vi.fn(
        async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
          onEvent({ type: "queued" });
          onEvent({ type: "completed", snapshot });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const generateButton = await screen.findByRole("button", { name: /生成模型/i });

    await waitFor(() => {
      expect(generateButton).toBeEnabled();
    });

    await user.click(generateButton);

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["usecase"],
          rules: [createRule()],
        }),
      );
    });

    expect(screen.queryByText("SRS 摘要")).not.toBeInTheDocument();
    expect(screen.queryByText("模型结果")).not.toBeInTheDocument();
  });

  it("keeps generation in the background without opening diagnostics overlay", async () => {
    let completeRun!: () => void;
    const snapshot = createRunSnapshot({
      runId: "run-stream",
      requirementText: "创建一个订单系统",
      rules: [createRule()],
    });
    const repository = createBaseRepository({
      startRun: vi.fn(async () => ({ runId: "run-stream" })),
      subscribeToRun: vi.fn(
        async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
          onEvent({ type: "queued" });
          onEvent({ type: "stage_started", stage: "extract_rules" });
          onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: "{\"rules\":" });
          onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: "[{\"id\":\"r1\"}]" });
          await new Promise<void>((resolve) => {
            completeRun = () => {
              onEvent({ type: "completed", snapshot });
              resolve();
            };
          });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.type(
      await screen.findByPlaceholderText(
        "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则",
      ),
      "创建一个订单系统",
    );
    await user.click(screen.getByTitle("生成需求规则"));

    expect(screen.getByTitle("生成需求规则")).toBeDisabled();
    expect(screen.queryByText("查看详情")).not.toBeInTheDocument();
    expect(screen.queryByText(/Run ID：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{"rules":\[\{"id":"r1"\}\]/)).not.toBeInTheDocument();
    expect(screen.queryByText("extract_rules 收到模型输出")).not.toBeInTheDocument();

    completeRun();
  });

  it("renders requirement rules as an editable-text table", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const originalRule = createRule({
      id: "r1",
      category: "业务规则",
      text: "用户必须登录后才能访问主要功能。",
      relatedDiagrams: ["usecase", "activity"],
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [originalRule],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "编号" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "类型" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "需求文本内容" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(within(table).getByText("r1")).toBeInTheDocument();
    expect(within(table).getByText("业务规则")).toBeInTheDocument();
    expect(within(table).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();

    const textEditor = within(table).getByDisplayValue("用户必须登录后才能访问主要功能。");
    await user.clear(textEditor);
    await user.type(textEditor, "游客可以查看公开活动列表。");

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith([
        {
          ...originalRule,
          text: "游客可以查看公开活动列表。",
        },
      ]);
    });
  });

  it("creates a requirement rule from the add-rule dialog", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const existingRule = createRule({
      id: "r1",
      category: "业务规则",
      text: "游客可以查看公开活动。",
      relatedDiagrams: ["usecase"],
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [existingRule],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.click(await screen.findByRole("button", { name: /新增需求项/ }));
    const dialog = await screen.findByRole("dialog", { name: "新增需求项" });
    const submitButton = within(dialog).getByRole("button", { name: "创建需求项" });
    expect(submitButton).toBeDisabled();

    await user.selectOptions(within(dialog).getByRole("combobox"), "数据需求");
    await user.click(within(dialog).getByRole("checkbox", { name: "领域概念模型" }));
    await user.type(
      within(dialog).getByPlaceholderText("填写这条需求项的具体内容"),
      "系统必须保存活动报名记录。",
    );
    await user.click(submitButton);

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith([
        existingRule,
        {
          id: "r2",
          category: "数据需求",
          text: "系统必须保存活动报名记录。",
          relatedDiagrams: ["usecase", "activity", "class"],
        },
      ]);
    });
    expect(screen.queryByRole("dialog", { name: "新增需求项" })).not.toBeInTheDocument();
    await waitFor(() => {
      const table = screen.getByRole("table");
      expect(within(table).getByText("r2")).toBeInTheDocument();
      expect(within(table).getByText("数据需求")).toBeInTheDocument();
      expect(within(table).getByDisplayValue("系统必须保存活动报名记录。")).toBeInTheDocument();
    });
  });
});
