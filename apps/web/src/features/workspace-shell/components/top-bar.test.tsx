import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { HistoryDrawer } from "../../history/components/history-drawer";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../state";
import { TopBar } from "./top-bar";
import { WorkspaceTabsBar } from "./workspace-tabs-bar";

const { toastMessage, toastSuccess } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => {
  return {
    toast: {
      message: toastMessage,
      success: toastSuccess,
    },
  };
});

function TopBarHarness({
  currentRoute = "/",
  onNavigate = () => {},
}: {
  currentRoute?: "/" | "/exam" | "/tutorial" | "/about";
  onNavigate?: (route: "/" | "/exam" | "/tutorial" | "/about") => void;
}) {
  const { historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  return (
    <>
      <TopBar currentRoute={currentRoute} onNavigate={onNavigate} />
      <main>主内容保持不变</main>
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
    </>
  );
}

function TopBarWithTabsHarness({
  onNavigate,
}: {
  onNavigate: (route: "/" | "/exam" | "/tutorial" | "/about") => void;
}) {
  const { historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  return (
    <>
      <TopBar currentRoute="/" onNavigate={onNavigate} />
      <WorkspaceTabsBar />
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
    </>
  );
}

function TopBarTaskHarness() {
  const { historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  const { generateRules } = useWorkspaceSession();
  return (
    <>
      <TopBar currentRoute="/" onNavigate={() => {}} />
      <button type="button" onClick={() => void generateRules()}>
        开始测试任务
      </button>
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
    </>
  );
}

describe("TopBar", () => {
  beforeEach(() => {
    toastMessage.mockClear();
    toastSuccess.mockClear();
  });

  it("opens history without unavailable placeholder feedback", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-topbar" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () =>
        createRunSnapshot({
          runId: "run-topbar",
        }),
      ),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(screen.getByRole("button", { name: /历史/i }));

    expect(toastMessage).not.toHaveBeenCalled();
    expect(screen.getByText("主内容保持不变")).toBeInTheDocument();
    expect(screen.getByText("暂无历史快照。完成一次生成后会自动保存。")).toBeInTheDocument();
  });

  it("uses product navigation labels without opening workspace tabs", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
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
    const onNavigate = vi.fn();
    render(withWorkspaceProviders(<TopBarWithTabsHarness onNavigate={onNavigate} />, repository));
    const banner = screen.getByRole("banner");

    expect(within(banner).getByRole("button", { name: "首页" })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "考试" })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "教程" })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "关于" })).toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "需求" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "设计" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "代码" })).not.toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "首页" }));
    await user.click(within(banner).getByRole("button", { name: "考试" }));
    await user.click(within(banner).getByRole("button", { name: "教程" }));
    await user.click(within(banner).getByRole("button", { name: "关于" }));

    expect(onNavigate).toHaveBeenCalledWith("/");
    expect(onNavigate).toHaveBeenCalledWith("/exam");
    expect(onNavigate).toHaveBeenCalledWith("/tutorial");
    expect(onNavigate).toHaveBeenCalledWith("/about");
    expect(screen.queryByRole("button", { name: "关闭 首页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 考试" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 教程" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 关于" })).not.toBeInTheDocument();
  });

  it("does not expose PlantUML source export from the top bar", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [
            {
              id: "r1",
              category: "功能需求",
              text: "系统生成 UML。",
              relatedDiagrams: ["usecase"],
            },
          ],
          plantUml: {
            usecase: "@startuml\nactor 用户\n@enduml",
          },
          generatedDiagramTypes: ["usecase"],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-topbar" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(screen.getByRole("button", { name: /导出/i }));

    expect(screen.getByRole("menuitem", { name: /运行报告/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /当前快照/i })).toBeInTheDocument();
    expect(screen.queryByText(/PlantUML|puml/i)).not.toBeInTheDocument();
  });

  it("shows Chinese task stages and streamed details in the task drawer", async () => {
    let completeRun!: () => void;
    const snapshot = createRunSnapshot({
      runId: "run-task-details",
      requirementText: "生成 UML",
      rules: [
        {
          id: "r1",
          category: "功能需求",
          text: "系统生成 UML。",
          relatedDiagrams: ["usecase"],
        },
      ],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-task-details" })),
      subscribeToRun: vi.fn(
        async (_runId, onEvent) => {
          onEvent({ type: "queued" });
          onEvent({ type: "stage_started", stage: "extract_rules" });
          onEvent({
            type: "stage_progress",
            stage: "extract_rules",
            progress: 20,
            message: "正在抽取需求规则",
          });
          onEvent({
            type: "llm_chunk",
            stage: "extract_rules",
            chunk: "正在分析需求文本",
          });
          await new Promise<void>((resolve) => {
            completeRun = () => {
              onEvent({ type: "completed", snapshot });
              resolve();
            };
          });
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

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarTaskHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "开始测试任务" }));
    await user.click(screen.getByRole("button", { name: "生成任务" }));

    expect(await screen.findByText("抽取需求规则")).toBeInTheDocument();
    expect(screen.getByText("生成需求模型")).toBeInTheDocument();
    expect(screen.getByText("生成图源码")).toBeInTheDocument();
    expect(screen.getByText("渲染图像")).toBeInTheDocument();
    expect(screen.getByText("执行详情")).toBeInTheDocument();
    expect(screen.getByText("正在分析需求文本")).toBeInTheDocument();
    expect(screen.getByText("收到模型输出")).toBeInTheDocument();
    expect(screen.queryByText("extract_rules")).not.toBeInTheDocument();
    expect(screen.queryByText("llm_chunk")).not.toBeInTheDocument();
    expect(screen.queryByText("stage_started")).not.toBeInTheDocument();

    completeRun();
  });
});
