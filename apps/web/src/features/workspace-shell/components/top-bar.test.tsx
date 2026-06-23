// Verifies top bar navigation, run controls, theme toggles, and account/project menus.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
} from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { buildLineageStepPath } from "../../lineage/components/lineage-graph-dialog";
import { snapshotInputFingerprint } from "../../../shared/lib/fingerprint";
import { HistoryDrawer } from "../../history/components/history-drawer";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../state";
import {
  ProjectGenerationTasksDrawerContent,
  ProjectWorkspaceActions,
  TopBar,
} from "./top-bar";
import { WorkspaceTabsBar } from "./workspace-tabs-bar";

const { toastMessage, toastSuccess, toastError } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => {
  return {
    toast: {
      message: toastMessage,
      success: toastSuccess,
      error: toastError,
    },
  };
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: "provider-config-1",
      defaultModel: "gpt-5.5",
      providerModelOptions: ["gpt-5.5"],
      imageModel: "nano-banana-pro",
      fontSize: "md",
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

function TopBarHarness({
  currentRoute = "/projects/library-booking",
  onNavigate = () => {},
}: {
  currentRoute?: string;
  onNavigate?: (route: string) => void;
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
  onNavigate: (route: string) => void;
}) {
  const { historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  return (
    <>
      <TopBar currentRoute="/projects/library-booking" onNavigate={onNavigate} />
      <WorkspaceTabsBar />
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
    </>
  );
}

function TopBarTaskHarness() {
  const { generateRules } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button type="button" onClick={() => void generateRules()}>
        开始测试任务
      </button>
    </>
  );
}

function TopBarTaskWithProjectRunsHarness({
  projectRuns,
}: {
  projectRuns: PlatformRunSummary[];
}) {
  const { generateRules } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions
        projectId="library-booking"
        projectRuns={projectRuns}
        onOpenDrawer={() => {}}
      />
      <ProjectGenerationTasksDrawerContent projectRuns={projectRuns} />
      <button type="button" onClick={() => void generateRules()}>
        开始测试任务
      </button>
    </>
  );
}

function TopBarDiagramTaskHarness() {
  const { generateDiagrams } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button
        type="button"
        onClick={() => void generateDiagrams(["usecase", "class", "activity"])}
      >
        开始模型任务
      </button>
    </>
  );
}

function TopBarAnalysisTaskHarness() {
  const { generateDiagrams } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button type="button" onClick={() => void generateDiagrams(["analysis"])}>
        开始分析模型任务
      </button>
    </>
  );
}

function LineageRerunArtifactHarness() {
  const { generateDiagrams } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <WorkspaceTabsBar />
      <button type="button" onClick={() => void generateDiagrams(["usecase"])}>
        重新生成用例模型
      </button>
    </>
  );
}

function LineageGraphOnlyHarness() {
  return <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />;
}

function TopBarRestoreHarness() {
  const { historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  const { restoreRunHistory } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button type="button" onClick={() => void restoreRunHistory("history-design-trace")}>
        恢复设计追踪
      </button>
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
    </>
  );
}

function TopBarRestoreCodeSkillHarness() {
  const { historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  const { restoreRunHistory } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button type="button" onClick={() => void restoreRunHistory("history-code-skill")}>
        恢复代码资源
      </button>
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
    </>
  );
}

describe("TopBar", () => {
  beforeEach(() => {
    storeManagedUserSettings();
    toastMessage.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {}),
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:document-export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("builds lineage connectors as readable step paths", () => {
    const path = buildLineageStepPath(
      { left: 0, right: 270, centerY: 100 },
      { left: 350, right: 620, centerY: 260 },
    );

    expect(path).toBe("M 282 100 L 305 100 L 305 260 L 328 260");
    expect(path).not.toContain(" C ");
  });

  it("keeps the logged-in navigation bar at font weight 600", () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-topbar" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () => createRunSnapshot({ runId: "run-topbar" })),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<TopBarHarness />, repository));

    expect(screen.getByRole("banner")).toHaveClass("font-semibold");
    expect(screen.getByRole("button", { name: "项目" })).toHaveClass(
      "relative",
      "text-[15px]",
      "font-semibold",
      "hover:after:opacity-100",
    );
  });

  it("opens project run history without the removed local snapshot drawer action", async () => {
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
    const onOpenDrawer = vi.fn();
    render(
      withWorkspaceProviders(
        <>
          <TopBarHarness />
          <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={onOpenDrawer} />
        </>,
        repository,
      ),
    );

    expect(screen.queryByRole("dialog", { name: "历史快照" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成任务" }));
    expect(onOpenDrawer).toHaveBeenCalledWith("tasks");
    expect(screen.queryByRole("button", { name: "历史快照" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "运行历史" }));

    expect(toastMessage).not.toHaveBeenCalled();
    expect(screen.getByText("主内容保持不变")).toBeInTheDocument();
    expect(onOpenDrawer).toHaveBeenCalledWith("history");
  });

  it("opens the lineage graph from the button before generation tasks", async () => {
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
    const { container } = render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions
          projectId="library-booking"
          onOpenDrawer={() => {}}
        />,
        repository,
      ),
    );

    const buttons = screen.getAllByRole("button");
    const lineageIndex = buttons.findIndex(
      (button) => button.getAttribute("aria-label") === "链路图",
    );
    const taskIndex = buttons.findIndex(
      (button) => button.getAttribute("aria-label") === "生成任务",
    );
    expect(lineageIndex).toBeGreaterThanOrEqual(0);
    expect(lineageIndex).toBeLessThan(taskIndex);
    const lineageButton = buttons[lineageIndex] as HTMLElement;
    const taskButton = buttons[taskIndex] as HTMLElement;
    expect(lineageButton).toHaveClass("bg-transparent", "hover:bg-secondary");
    expect(lineageButton).not.toHaveClass("bg-secondary");
    expect(taskButton).toHaveTextContent("暂无任务");
    expect(taskButton).toHaveClass("bg-transparent", "hover:bg-secondary");
    expect(taskButton).not.toHaveClass("bg-secondary", "text-secondary-foreground");

    await user.click(screen.getByRole("button", { name: "链路图" }));

    expect(
      await screen.findByRole("dialog", { name: "全局链路图" }),
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "全局链路图" });
    expect(dialog).toHaveStyle({
      width: "min(1580px, calc(100vw - 4rem))",
      maxWidth: "min(1580px, calc(100vw - 4rem))",
      height: "min(920px, calc(100vh - 4rem))",
    });
    expect(within(dialog).getByRole("region", { name: "需求规则" })).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "需求模型" })).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "设计模型" })).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "产物" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "显示全部连线" })).not.toBeInTheDocument();
    expect(container.querySelector(".react-flow__minimap")).not.toBeInTheDocument();
    expect(container.querySelector(".react-flow__controls")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("lineage-node-rule:empty")).toHaveAttribute(
      "data-lineage-kind",
      "rule",
    );
    expect(
      within(dialog).getByTestId("lineage-node-requirement-model:usecase"),
    ).toHaveAttribute("data-lineage-kind", "requirement-model");
    expect(
      within(dialog).getByTestId("lineage-node-design-model:sequence"),
    ).toHaveAttribute("data-lineage-kind", "design-model");
    expect(
      within(dialog).getByTestId("lineage-node-document:requirementsSpec"),
    ).toHaveAttribute("data-lineage-kind", "document");
    expect(within(dialog).getByTestId("lineage-node-code:prototype")).toHaveAttribute(
      "data-lineage-kind",
      "code",
    );

    const usecaseNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:usecase",
    );
    const classNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:class",
    );
    await user.click(usecaseNode);
    expect(classNode).toHaveClass("opacity-25");

    await user.click(within(dialog).getByRole("button", { name: "全部链路" }));
    expect(
      within(dialog).getByText("选择一个节点后查看上下游来源、影响范围和建议操作。"),
    ).toBeInTheDocument();
    expect(classNode).not.toHaveClass("opacity-25");

    await user.click(within(dialog).getByRole("button", { name: "影响路径" }));
    expect(usecaseNode).not.toHaveClass("opacity-25");
    expect(classNode).not.toHaveClass("opacity-25");
  });

  it("opens a previous requirement artifact from the lineage graph while rerunning it", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成图书馆预约系统 UML",
          rules: [
            {
              id: "REQ-001",
              category: "功能需求",
              text: "用户可以预约座位。",
              relatedDiagrams: ["usecase"],
            },
          ],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "旧用例模型",
              summary: "旧模型仍可查看",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
          },
          generatedDiagramTypes: ["usecase"],
          svgArtifacts: {
            usecase: {
              diagramKind: "usecase",
              svg: "<svg>old usecase</svg>",
            } as never,
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-rerun-usecase" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "stage_started", stage: "generate_models" });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 40,
          diagramKind: "usecase",
          subtaskId: "usecase",
          subtaskLabel: "用例模型",
          subtaskStatus: "running",
          message: "正在重新生成：用例模型",
        });
        await new Promise(() => {});
      }),
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
    render(withWorkspaceProviders(<LineageRerunArtifactHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "重新生成用例模型" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "链路图" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "链路图" }));

    const dialog = await screen.findByRole("dialog", { name: "全局链路图" });
    const usecaseNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:usecase",
    );
    expect(usecaseNode).toHaveAttribute("data-lineage-status", "running");
    expect(usecaseNode).toHaveAttribute("data-lineage-viewable", "true");

    await user.click(usecaseNode);
    expect(
      within(dialog).getAllByText("用例模型重新生成中，旧产物仍可查看；完成后会刷新下游可用状态。").length,
    ).toBeGreaterThan(0);
    const viewPreviousButton = within(dialog).getByRole("button", { name: "查看旧版" });
    expect(viewPreviousButton).toBeEnabled();
    await user.click(viewPreviousButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "全局链路图" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "用例模型" })).toBeInTheDocument();
  });

  it("does not mark structured-only requirement models as current in the lineage graph", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成图书馆预约系统 UML",
          rules: [
            {
              id: "REQ-001",
              category: "功能需求",
              text: "用户可以预约座位。",
              relatedDiagrams: ["usecase"],
            },
          ],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型",
              summary: "结构化模型已生成",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
          },
          generatedDiagramTypes: ["usecase"],
          svgArtifacts: {},
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
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
    render(withWorkspaceProviders(<LineageGraphOnlyHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "链路图" }));

    const dialog = await screen.findByRole("dialog", { name: "全局链路图" });
    const usecaseNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:usecase",
    );
    expect(usecaseNode).toHaveAttribute("data-lineage-status", "stale");
    expect(usecaseNode).toHaveAttribute("data-lineage-viewable", "false");

    await user.click(usecaseNode);
    expect(
      within(dialog).getAllByText("用例模型结构化模型已生成，但 SVG 尚未生成；需先完成图像渲染后才能作为可查看图像。").length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "查看产物" })).toBeDisabled();
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

    const navButtons = within(within(banner).getByRole("navigation")).getAllByRole("button");
    expect(navButtons.map((button) => button.textContent)).toEqual([
      "项目",
      "考试",
      "使用文档",
    ]);
    expect(within(banner).queryByRole("button", { name: "工作台" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "需求" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "设计" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "代码" })).not.toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "项目" }));
    await user.click(within(banner).getByRole("button", { name: "考试" }));
    await user.click(within(banner).getByRole("button", { name: "使用文档" }));

    expect(onNavigate).toHaveBeenCalledWith("/projects");
    expect(onNavigate).toHaveBeenCalledWith("/exam");
    expect(onNavigate).toHaveBeenCalledWith("/tutorial");
    expect(within(banner).queryByRole("button", { name: "购买" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "关于" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 工作台" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 考试" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 使用文档" })).not.toBeInTheDocument();
  });

  it("keeps a compact main navigation menu available for mobile layouts", async () => {
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
    render(withWorkspaceProviders(<TopBarHarness onNavigate={onNavigate} />, repository));

    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("navigation")).toHaveClass("hidden", "md:flex");
    expect(screen.getByRole("button", { name: "打开主导航" })).toHaveClass("md:hidden");

    await user.click(screen.getByRole("button", { name: "打开主导航" }));
    await user.click(screen.getByRole("menuitem", { name: "使用文档" }));

    expect(onNavigate).toHaveBeenCalledWith("/tutorial");
  });

  it("closes account modal on route changes without exposing purchase navigation", async () => {
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
    render(
      withWorkspaceProviders(
        <TopBarHarness currentRoute="/projects" />,
        repository,
      ),
    );

    expect(screen.queryByRole("button", { name: "购买" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByRole("dialog", { name: "登录账号" })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).not.toBeNull();

    window.history.pushState({}, "", "/projects");
    window.dispatchEvent(
      new CustomEvent("uml-route-change", {
        detail: { path: "/projects", location: "/projects" },
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "登录账号" })).not.toBeInTheDocument();
    });
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
  });

  it("matches the current top-bar action sizing", async () => {
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

    render(withWorkspaceProviders(<TopBarHarness />, repository));

    expect(screen.queryByRole("button", { name: "生成任务" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史快照" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "设计规范" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /切换到(深色|浅色)/ })).toHaveClass("size-10");
    expect(screen.queryByRole("button", { name: "全局设置" })).not.toBeInTheDocument();
    const accountTrigger = screen.getByRole("button", { name: /登录|账号/ });
    expect(accountTrigger).toHaveClass("inline-flex", "size-10", "justify-center", "md:h-10", "md:w-auto", "md:justify-start");
    expect(accountTrigger).not.toHaveClass("hidden");
    expect(accountTrigger).not.toHaveClass("whitespace-nowrap");
    expect(accountTrigger).not.toHaveClass("transition-all");
    expect(accountTrigger).not.toHaveTextContent(/justify-center|whitespace-nowrap|transition-all/u);
  });

  it("shows an avatar file picker and previews selected account images", async () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify({
          user: {
            id: "user-avatar",
            email: "avatar@example.com",
            displayName: "Avatar User",
            avatarUrl: null,
            status: "active",
            emailVerified: true,
            mfaEnabled: false,
          },
          session: {
            id: "session-avatar",
            userId: "user-avatar",
            createdAt: "2026-05-23T00:00:00.000Z",
            expiresAt: "2026-05-24T00:00:00.000Z",
            lastSeenAt: "2026-05-23T00:00:00.000Z",
            ipAddress: null,
            userAgent: null,
          },
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/profile") && method === "GET") {
        return new Response(JSON.stringify({
          user: {
            id: "user-avatar",
            email: "avatar@example.com",
            displayName: "Avatar User",
            avatarUrl: null,
            status: "active",
            emailVerified: true,
            mfaEnabled: false,
          },
          session: {
            id: "session-avatar",
            userId: "user-avatar",
            createdAt: "2026-05-23T00:00:00.000Z",
            expiresAt: "2026-05-24T00:00:00.000Z",
            lastSeenAt: "2026-05-23T00:00:00.000Z",
            ipAddress: null,
            userAgent: null,
          },
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));
    expect(await screen.findByLabelText("头像图片")).toBeInTheDocument();
    expect(screen.queryByLabelText("头像 URL")).not.toBeInTheDocument();

    const avatarFile = new File(["avatar"], "avatar.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("头像图片"), avatarFile);

    expect(screen.getByAltText("头像预览")).toHaveAttribute("src", "blob:document-export");
    expect(screen.queryByText(/请选择 PNG、JPG 或 WebP 图片/u)).not.toBeInTheDocument();
  });

  it("validates and uploads the selected account avatar when saving profile", async () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const baseUser = {
        id: "user-avatar",
        email: "avatar@example.com",
        displayName: "Avatar User",
        avatarUrl: null,
        status: "active",
        emailVerified: true,
        mfaEnabled: false,
      };
      const session = {
        id: "session-avatar",
        userId: "user-avatar",
        createdAt: "2026-05-23T00:00:00.000Z",
        expiresAt: "2026-05-24T00:00:00.000Z",
        lastSeenAt: "2026-05-23T00:00:00.000Z",
        ipAddress: null,
        userAgent: null,
      };
      if (url.includes("/api/auth/me") || (url.includes("/api/account/profile") && method === "GET")) {
        return new Response(JSON.stringify({
          user: baseUser,
          session,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/profile") && method === "PATCH") {
        return new Response(JSON.stringify({
          user: { ...baseUser, displayName: "Avatar User" },
          session,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/avatar") && method === "POST") {
        return new Response(JSON.stringify({
          user: { ...baseUser, avatarUrl: "/api/account/avatars/user-avatar.png" },
          session,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ applyAccept: false });
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));
    await user.upload(await screen.findByLabelText("头像图片"), new File(["avatar"], "avatar.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "保存资料" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/account/avatar"),
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    ));
    expect(screen.getByAltText("头像预览")).toHaveAttribute("src", "/api/account/avatars/user-avatar.png");
    expect(toastSuccess).toHaveBeenCalledWith("资料已更新");

    await user.upload(screen.getByLabelText("头像图片"), new File(["bad"], "bad.txt", { type: "text/plain" }));
    expect(screen.getByText("请选择 PNG、JPG 或 WebP 图片。")).toBeInTheDocument();
  });

  it("aligns the account dialog profile, MFA, and session views with the settings design", async () => {
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
    const baseUser = {
      id: "user-avatar",
      email: "avatar@example.com",
      displayName: "Avatar User",
      avatarUrl: null,
      status: "active",
      emailVerified: true,
      mfaEnabled: false,
    };
    const currentSession = {
      id: "session-avatar",
      userId: "user-avatar",
      createdAt: "2026-05-23T00:00:00.000Z",
      expiresAt: "2026-05-24T00:00:00.000Z",
      lastSeenAt: "2026-05-23T01:00:00.000Z",
      ipAddress: "203.0.113.10",
      locationLabel: "中国 北京",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/me") || (url.includes("/api/account/profile") && method === "GET")) {
        return new Response(JSON.stringify({
          user: baseUser,
          session: currentSession,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({
          sessions: [
            currentSession,
            {
              id: "session-phone",
              userId: "user-avatar",
              createdAt: "2026-05-22T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T12:00:00.000Z",
              ipAddress: "198.51.100.22",
              locationLabel: "中国 上海",
              userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            },
            {
              id: "session-tablet",
              userId: "user-avatar",
              createdAt: "2026-05-21T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T11:00:00.000Z",
              ipAddress: "198.51.100.23",
              locationLabel: "中国 杭州",
              userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            },
            {
              id: "session-linux",
              userId: "user-avatar",
              createdAt: "2026-05-20T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T10:00:00.000Z",
              ipAddress: "198.51.100.24",
              locationLabel: "中国 深圳",
              userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            },
            {
              id: "session-windows",
              userId: "user-avatar",
              createdAt: "2026-05-19T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T09:00:00.000Z",
              ipAddress: "198.51.100.25",
              locationLabel: "中国 成都",
              userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/125.0.0.0 Safari/537.36",
            },
            {
              id: "session-overflow",
              userId: "user-avatar",
              createdAt: "2026-05-18T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T08:00:00.000Z",
              ipAddress: "198.51.100.26",
              locationLabel: "中国 广州",
              userAgent: "Mozilla/5.0 (Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({
          events: [
            {
              id: "login-success",
              userId: "user-avatar",
              email: "avatar@example.com",
              outcome: "success",
              ipAddress: "203.0.113.10",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "密码登录",
              createdAt: "2026-05-23T01:00:00.000Z",
            },
            {
              id: "login-failure",
              userId: "user-avatar",
              email: "avatar@example.com",
              outcome: "failure",
              ipAddress: "203.0.113.66",
              locationLabel: "中国 天津",
              userAgent: null,
              message: "凭据无效",
              createdAt: "2026-05-22T01:00:00.000Z",
            },
            {
              id: "login-success-2",
              userId: "user-avatar",
              email: "avatar@example.com",
              outcome: "success",
              ipAddress: "203.0.113.11",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第二条登录记录",
              createdAt: "2026-05-21T01:00:00.000Z",
            },
            {
              id: "login-success-3",
              userId: "user-avatar",
              email: "avatar@example.com",
              outcome: "success",
              ipAddress: "203.0.113.12",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第三条登录记录",
              createdAt: "2026-05-20T01:00:00.000Z",
            },
            {
              id: "login-success-4",
              userId: "user-avatar",
              email: "avatar@example.com",
              outcome: "success",
              ipAddress: "203.0.113.13",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第四条登录记录",
              createdAt: "2026-05-19T01:00:00.000Z",
            },
            {
              id: "login-success-overflow",
              userId: "user-avatar",
              email: "avatar@example.com",
              outcome: "success",
              ipAddress: "203.0.113.14",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第六条登录记录",
              createdAt: "2026-05-18T01:00:00.000Z",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/mfa/setup") && method === "POST") {
        return new Response(JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/UML:avatar@example.com?secret=JBSWY3DPEHPK3PXP&issuer=UML",
          expiresAt: "2026-05-23T12:00:00.000Z",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/provider-configs")) {
        return new Response(JSON.stringify({
          providerConfigs: [
            {
              id: "provider-config-1",
              name: "课程 OpenAI 托管配置",
              provider: "openai",
              baseUrl: "https://api.openai.com/v1",
              maskedKey: "sk-***",
              defaultModel: "gpt-5.5",
              status: "active",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));

    expect(await screen.findByRole("tab", { name: "个人资料" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "安全设置" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "登录会话" })).toBeInTheDocument();
    expect(screen.getByText("个人资料信息")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Avatar User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("avatar@example.com")).toBeInTheDocument();
    expect(screen.getByText("已验证")).toBeInTheDocument();
    expect(screen.getAllByText("正常").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: "安全设置" }));
    await user.click(screen.getByRole("button", { name: "启用 MFA" }));

    expect(await screen.findByRole("img", { name: "MFA 二维码" })).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制 MFA 密钥" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "登录会话" }));

    expect(screen.getByText("macOS • Chrome")).toBeInTheDocument();
    expect(screen.getByText("当前设备")).toBeInTheDocument();
    expect(screen.getByText(/地区: 中国 北京/u)).toBeInTheDocument();
    expect(screen.queryByText(/203\.0\.113\.10/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/中国 广州/u)).not.toBeInTheDocument();
    const historyTable = screen.getByRole("table", { name: "登录历史" });
    expect(within(historyTable).getAllByRole("row")).toHaveLength(6);
    expect(within(historyTable).getAllByText("成功").length).toBeGreaterThan(0);
    expect(within(historyTable).getByText("失败")).toBeInTheDocument();
    expect(within(historyTable).getByText("密码登录")).toBeInTheDocument();
    expect(within(historyTable).getByText("凭据无效")).toBeInTheDocument();
    expect(within(historyTable).queryByText("第六条登录记录")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "全局设置" }));

    expect(screen.getAllByText("全局设置").length).toBeGreaterThan(0);
    expect(screen.getAllByText("模型托管配置").length).toBeGreaterThan(0);
    expect(await screen.findByText(/课程 OpenAI 托管配置/u)).toBeInTheDocument();
    expect(screen.getByText("工作台偏好")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加供应商" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复默认" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "测试托管配置" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("lets users change their password from the account security tab", async () => {
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
    const baseUser = {
      id: "user-password",
      email: "password@example.com",
      displayName: "Password User",
      avatarUrl: null,
      status: "active",
      emailVerified: true,
      mfaEnabled: false,
    };
    const currentSession = {
      id: "session-password",
      userId: "user-password",
      createdAt: "2026-05-23T00:00:00.000Z",
      expiresAt: "2026-05-24T00:00:00.000Z",
      lastSeenAt: "2026-05-23T01:00:00.000Z",
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome/124.0.0.0",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/me") || (url.includes("/api/account/profile") && method === "GET")) {
        return new Response(JSON.stringify({
          user: baseUser,
          session: currentSession,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({ sessions: [currentSession] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/security") && method === "PATCH") {
        return new Response(JSON.stringify({ user: baseUser, session: currentSession }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));
    await user.click(screen.getByRole("tab", { name: "安全设置" }));
    await user.type(await screen.findByLabelText("当前密码"), "Goal-e2e-old!Aa1");
    await user.type(screen.getByLabelText("新密码"), "Goal-e2e-new!Aa1");
    await user.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/account/security"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: "Goal-e2e-old!Aa1",
          newPassword: "Goal-e2e-new!Aa1",
        }),
      }),
    ));
    expect(toastSuccess).toHaveBeenCalledWith("密码已修改，其他设备会话已失效");
    expect(screen.getByLabelText("当前密码")).toHaveValue("");
    expect(screen.getByLabelText("新密码")).toHaveValue("");
  });

  it("does not expose workspace export actions from the top bar", async () => {
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

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />,
        repository,
      ),
    );

    expect(screen.queryByRole("button", { name: /导出/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /运行报告/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /当前快照/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/PlantUML|puml/i)).not.toBeInTheDocument();
  });

  it("keeps document generation controls out of the top bar actions", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />,
        repository,
      ),
    );

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("button", { name: /导出/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /运行报告/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /当前快照/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /说明书样式/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /需求规格说明书/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /软件设计说明书/i })).not.toBeInTheDocument();
  });

  it("surfaces active project runs after reloading the workspace session", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const activeRun = {
      runId: "server-run-active",
      status: "running",
      stage: "generate_models",
      runKind: "requirements",
      model: "gpt-5.5",
    };

    render(
      withWorkspaceProviders(
        <>
          <ProjectWorkspaceActions
            projectId="library-booking"
            projectRuns={[activeRun]}
            onOpenDrawer={() => {}}
          />
          <ProjectGenerationTasksDrawerContent projectRuns={[activeRun]} />
        </>,
        repository,
      ),
    );

    expect(screen.getByText("生成中 50%")).toBeInTheDocument();
    expect(screen.getByText("需求模型生成")).toBeInTheDocument();
    expect(screen.getAllByText("生成需求模型进行中")).toHaveLength(2);
    expect(screen.getAllByText(/模型 gpt-5\.5/).length).toBeGreaterThan(0);
    expect(screen.getByText("server-run-active")).toBeInTheDocument();
  });

  it("keeps active server runs visible when local terminal tasks remain in the drawer", async () => {
    const snapshot = createRunSnapshot({
      runId: "local-completed-run",
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
      startRun: vi.fn(async () => ({ runId: "local-completed-run" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const activeRun: PlatformRunSummary = {
      runId: "server-run-active-with-local-terminal",
      status: "running",
      stage: "generate_models",
      runKind: "requirements",
      model: "gpt-5.5",
      createdAt: "2026-06-21T00:00:00.000Z",
      startedAt: "2026-06-21T00:00:01.000Z",
    };

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[activeRun]} />,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "开始测试任务" }));
    await waitFor(() => {
      expect(repository.subscribeToRun).toHaveBeenCalledWith(
        "local-completed-run",
        expect.any(Function),
      );
    });

    expect(screen.getByText("服务端运行中")).toBeInTheDocument();
    expect(screen.getByText("任务列表")).toBeInTheDocument();
    expect(screen.getByText("server-run-active-with-local-terminal")).toBeInTheDocument();
    expect(screen.getAllByText("生成需求模型进行中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("生成完成").length).toBeGreaterThan(0);
    await user.click(await screen.findByRole("button", { name: "确认" }));
    expect(screen.getByRole("button", { name: "清理已完成" })).toBeInTheDocument();
  });

  it("shows the latest terminal server run when there is no active task", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const failedRun = {
      runId: "server-run-failed",
      status: "failed",
      stage: "generate_design_models",
      runKind: "design",
      updatedAt: "2026-06-18T09:30:00.000Z",
      errorMessage: "缺少设计类图",
    };
    const completedRun = {
      runId: "server-run-completed",
      status: "completed",
      stage: "render_svg",
      runKind: "requirements",
      updatedAt: "2026-06-18T08:30:00.000Z",
    };

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions
          projectId="library-booking"
          projectRuns={[completedRun, failedRun]}
          onOpenDrawer={() => {}}
        />,
        repository,
      ),
    );

    expect(screen.getByText("失败")).toBeInTheDocument();
  });

  it("shows code diagnostics from terminal server runs in the task drawer", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const completedCodeRun: PlatformRunSummary = {
      runId: "server-code-diagnostics",
      status: "completed",
      stage: "verify_code_preview",
      runKind: "code",
      model: "gpt-5.5",
      updatedAt: "2026-06-18T10:45:00.000Z",
      codeDiagnosticCount: 1,
      codeDiagnosticSummary: [
        "verify_code_preview：检测到真实网络请求痕迹，已切换到本地 mock。",
      ],
      codeQualityIssueCount: 0,
    };

    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[completedCodeRun]} />,
        repository,
      ),
    );

    expect(screen.getAllByText(/代码诊断 1 项/u).length).toBeGreaterThan(0);
    expect(screen.getByText("代码诊断")).toBeInTheDocument();
    expect(screen.getAllByText(/检测到真实网络请求痕迹/u).length).toBeGreaterThan(0);
  });

  it("shows interrupted server runs instead of falling back to idle", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const interruptedRun: PlatformRunSummary = {
      runId: "server-run-interrupted",
      status: "interrupted",
      stage: "generate_models",
      runKind: "requirements",
      model: "gpt-5.5",
      updatedAt: "2026-06-18T10:30:00.000Z",
    };

    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[interruptedRun]} />,
        repository,
      ),
    );

    expect(screen.getAllByText("服务中断，可重试").length).toBeGreaterThan(0);
    expect(screen.queryByText("暂无任务")).not.toBeInTheDocument();
    expect(screen.getByText("服务中断，可从运行历史重试或重新运行")).toBeInTheDocument();
    expect(screen.getByText("server-run-interrupted")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows retry source relationships for server runs in the task drawer", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const retryRun: PlatformRunSummary = {
      runId: "server-run-retry",
      status: "queued",
      stage: "generate_models",
      runKind: "requirements",
      sourceRunId: "server-run-failed",
      sourceAction: "retry",
      sourceRunStatus: "failed",
      model: "gpt-5.5",
      updatedAt: "2026-06-18T10:40:00.000Z",
    };

    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[retryRun]} />,
        repository,
      ),
    );

    expect(screen.getAllByText("排队中 0%").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("重试自 server-run-failed · 任务正在排队").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("运行关系")).toBeInTheDocument();
    expect(screen.getByText("重试自 server-run-failed")).toBeInTheDocument();
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

    expect((await screen.findAllByText("抽取需求规则")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("修复需求规则").length).toBeGreaterThan(0);
    const stageSection = screen.getByText("链路阶段").parentElement?.parentElement;
    expect(stageSection).toBeTruthy();
    expect(within(stageSection as HTMLElement).getAllByText("抽取需求规则").length).toBeGreaterThan(
      0,
    );
    expect(within(stageSection as HTMLElement).getByText("修复需求规则")).toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText("生成需求模型")).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText("生成图源码")).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText("渲染图像")).not.toBeInTheDocument();
    expect(screen.getByText("执行详情")).toBeInTheDocument();
    expect(screen.queryByText("用户摘要")).not.toBeInTheDocument();
    expect(screen.getByText("正在分析需求文本")).toBeInTheDocument();
    expect(screen.getByText("收到模型输出")).toBeInTheDocument();
    expect(screen.queryByText("extract_rules")).not.toBeInTheDocument();
    expect(screen.queryByText("llm_chunk")).not.toBeInTheDocument();
    expect(screen.queryByText("stage_started")).not.toBeInTheDocument();

    completeRun();
    await waitFor(() => {
      expect(screen.getAllByText("生成完成").length).toBeGreaterThan(0);
    });
    const completedStageSection = screen.getByText("链路阶段").parentElement?.parentElement;
    expect(completedStageSection).toBeTruthy();
    expect(
      within(completedStageSection as HTMLElement).queryByText("生成需求模型"),
    ).not.toBeInTheDocument();
    expect(
      within(completedStageSection as HTMLElement).queryByText("生成图源码"),
    ).not.toBeInTheDocument();
    expect(
      within(completedStageSection as HTMLElement).queryByText("渲染图像"),
    ).not.toBeInTheDocument();
  });

  it("renders model subtasks inside the pipeline stage todo list", async () => {
    let completeRun!: () => void;
    const snapshot = createRunSnapshot({
      runId: "run-model-stage-todo",
      requirementText: "生成 UML",
      selectedDiagrams: ["usecase", "class", "activity"],
      rules: [
        {
          id: "r1",
          category: "功能需求",
          text: "系统生成 UML。",
          relatedDiagrams: ["usecase", "class", "activity"],
        },
      ],
      models: [
        { diagramKind: "usecase", actors: [], useCases: [] },
        { diagramKind: "class", classes: [] },
      ],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {
        activity: {
          stage: "generate_models",
          error: {
            code: "RUN_STRUCTURED_OUTPUT_INVALID",
            message: "界面关系 traceability 缺失",
            category: "generation",
            retryable: true,
          },
        },
      },
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [
            {
              id: "r1",
              category: "功能需求",
              text: "系统生成 UML。",
              relatedDiagrams: ["usecase", "class", "activity"],
            },
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-model-stage-todo" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "stage_started", stage: "generate_models" });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 35,
          diagramKind: "usecase",
          subtaskId: "usecase",
          subtaskLabel: "用例模型",
          subtaskStatus: "running",
          message: "正在生成：用例模型",
        });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 36,
          diagramKind: "class",
          subtaskId: "class",
          subtaskLabel: "领域概念模型",
          subtaskStatus: "pending_review",
          message: "领域概念模型存在待确认追踪关系",
        });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 37,
          diagramKind: "activity",
          subtaskId: "activity",
          subtaskLabel: "界面关系",
          subtaskStatus: "queued",
          queueReason: "project",
          queueAhead: 0,
          waitMs: 12_000,
          estimatedWaitMs: 60_000,
          message: "正在排队：界面关系",
        });
        await new Promise<void>((resolve) => {
          completeRun = () => {
            onEvent({ type: "completed", snapshot });
            resolve();
          };
        });
      }),
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
    render(withWorkspaceProviders(<TopBarDiagramTaskHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "开始模型任务" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));

    const stageSection = screen.getByText("链路阶段").parentElement?.parentElement;
    expect(stageSection).toBeTruthy();
    expect(within(stageSection as HTMLElement).getByText("生成需求模型")).toBeInTheDocument();
    expect(within(stageSection as HTMLElement).getByText("生成图源码")).toBeInTheDocument();
    expect(within(stageSection as HTMLElement).getByText("渲染图像")).toBeInTheDocument();
    expect(within(stageSection as HTMLElement).getAllByText("用例模型")).toHaveLength(3);
    expect(within(stageSection as HTMLElement).getAllByText("领域概念模型")).toHaveLength(3);
    expect(within(stageSection as HTMLElement).getAllByText("界面关系")).toHaveLength(1);
    expect(within(stageSection as HTMLElement).getAllByText("总体业务流程")).toHaveLength(2);
    expect(
      within(stageSection as HTMLElement).getByText("有 1 条追踪关系需复核"),
    ).toBeInTheDocument();
    expect(
      within(stageSection as HTMLElement).getByText(
        "项目并发已满，前方 0 个模型调用 · 已等待 12 秒 · 预计还需 约 1 分钟",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("模型子任务")).not.toBeInTheDocument();
    expect(screen.getAllByText("用例模型")).toHaveLength(3);

    completeRun();
    const updatedStageSection = screen.getByText("链路阶段").parentElement?.parentElement;
    expect(updatedStageSection).toBeTruthy();
    const retryButton = (
      await within(updatedStageSection as HTMLElement).findByText("重试此模型")
    ).closest("button");
    expect(retryButton).toBeEnabled();
    expect(
      within(updatedStageSection as HTMLElement).getByText("界面关系 traceability 缺失"),
    ).toBeInTheDocument();
  });

  it("labels instance-level model retry as same-kind rerun and uses diagram-kind scope", async () => {
    let completeRun!: () => void;
    const rules = [
      {
        id: "r1",
        category: "功能需求" as const,
        text: "用户可以查看图书。",
        relatedDiagrams: ["usecase" as const, "analysis" as const],
      },
    ];
    const requirementText = "用户可以查看图书。";
    const fingerprint = snapshotInputFingerprint({ requirementText, rules });
    const snapshot = createRunSnapshot({
      runId: "run-analysis-instance",
      requirementText,
      selectedDiagrams: ["analysis"],
      analysisTargetUseCaseIds: ["uc_view_books"],
      rules,
      models: [
        {
          diagramKind: "usecase",
          actors: [{ id: "reader", name: "读者" }],
          useCases: [{ id: "uc_view_books", name: "查看图书" }],
        },
      ],
      currentStage: "generate_plantuml",
      status: "completed",
    });
    (
      snapshot.diagramErrors as Record<
        string,
        (typeof snapshot.diagramErrors)["analysis"]
      >
    )["analysis:uc_view_books"] = {
      stage: "generate_plantuml",
      error: {
        code: "RUN_RENDER_FAILED",
        message: "PlantUML 修复失败",
        category: "render",
        retryable: true,
      },
    };
    const startRun = vi
      .fn()
      .mockResolvedValueOnce({ runId: "run-analysis-instance" })
      .mockResolvedValueOnce({ runId: "run-analysis-retry" });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          rules,
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          requirementInputFingerprint: fingerprint,
          generatedDiagramTypes: ["usecase"],
          diagramInputFingerprints: { usecase: fingerprint },
          models: {
            usecase: {
              diagramKind: "usecase",
              actors: [{ id: "reader", name: "读者" }],
              useCases: [{ id: "uc_view_books", name: "查看图书" }],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun,
      subscribeToRun: vi.fn(async (runId, onEvent) => {
        if (runId !== "run-analysis-instance") return;
        onEvent({ type: "queued" });
        onEvent({ type: "stage_started", stage: "generate_plantuml" });
        onEvent({
          type: "stage_progress",
          stage: "generate_plantuml",
          progress: 64,
          diagramKind: "analysis",
          modelId: "analysis:uc_view_books",
          subtaskLabel: "查看图书分析模型",
          subtaskStatus: "failed",
          message: "PlantUML 修复失败",
        });
        await new Promise<void>((resolve) => {
          completeRun = () => {
            onEvent({ type: "completed", snapshot });
            resolve();
          };
        });
      }),
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
    render(withWorkspaceProviders(<TopBarAnalysisTaskHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "开始分析模型任务" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    completeRun();

    const retryButton = await screen.findByRole("button", {
      name: "重试全部同类模型",
    });
    expect(retryButton).toHaveAttribute(
      "title",
      "当前重试按模型类型执行，会重试同类模型而不是单个实例",
    );
    await waitFor(() => {
      expect(retryButton).toBeEnabled();
    });

    fireEvent.click(retryButton);
    await user.click(await screen.findByRole("button", { name: "确认生成" }));

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(startRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedDiagrams: ["analysis"],
      }),
    );
  });

  it("constrains long generation task content inside the drawer width", async () => {
    const longToken =
      "RequirementBaselineBlockedDownstreamGenerationBecauseLibraryRulesNeedManualReview".repeat(
        8,
      );
    const longStream = `{"rules":[{"text":"${longToken}","relatedDiagrams":["usecase","activity"]}]}`;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          selectedDiagramTypes: ["usecase"],
          rules: [
            {
              id: "r1",
              category: "功能需求",
              text: "系统生成 UML。",
              relatedDiagrams: ["usecase"],
            },
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-long-drawer-content" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "stage_started", stage: "generate_models" });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 33,
          diagramKind: "usecase",
          subtaskId: "usecase",
          subtaskLabel: "用例模型",
          subtaskStatus: "failed",
          message: longToken,
        });
        onEvent({
          type: "llm_chunk",
          stage: "generate_models",
          chunk: longStream,
        });
        throw new Error(longToken);
      }),
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
    render(withWorkspaceProviders(<TopBarDiagramTaskHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "开始模型任务" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));

    const statusCard = screen
      .getByText("状态")
      .closest("[data-testid='generation-task-status-card']");
    expect(statusCard).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");

    const errorCard = screen
      .getAllByText(longToken)
      .find((node) => node.closest("[data-testid='generation-task-error-card']"))
      ?.closest("[data-testid='generation-task-error-card']");
    expect(errorCard).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");

    const executionBox = screen
      .getByText((content) => content.includes(longStream.slice(0, 30)))
      .closest("[data-testid='generation-task-execution-box']");
    expect(executionBox).toHaveClass("min-w-0", "max-w-full", "overflow-auto");
    expect(within(executionBox as HTMLElement).getByText(/RequirementBaselineBlocked/u)).toHaveClass(
      "break-all",
    );
  });

  it("shows design debug trace from restored design history", async () => {
    const designSnapshot: DesignRunSnapshot = {
      runId: "design-trace-run",
      requirementText: "生成设计模型",
      selectedDiagrams: ["sequence"],
      rules: [],
      requirementModels: [],
      models: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      designTrace: [
        {
          stage: "render_svg",
          attempt: 1,
          kind: "render_error",
          diagramKind: "sequence",
          plantUmlSource: "@startuml\n用户 -> 系统: 生成\n@enduml",
          errorMessage: "Syntax Error? (line 2)",
          createdAt: "2026-05-16T07:00:00.000Z",
        },
      ],
      currentStage: "render_svg",
      status: "failed",
      error: {
        code: "RUN_RENDER_FAILED",
        message: "Syntax Error? (line 2)",
        category: "render",
        retryable: true,
      },
    };
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
      restoreRunHistory: vi.fn(async () => ({
        id: "history-design-trace",
        createdAt: "2026-05-16T07:00:00.000Z",
        title: "设计追踪",
        providerModel: "gpt-5.5",
        snapshot: designSnapshot,
      })),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarRestoreHarness />, repository));

    await user.click(screen.getByRole("button", { name: "恢复设计追踪" }));

    expect(await screen.findByText("设计调试追踪")).toBeInTheDocument();
    expect(screen.getByText(/渲染图像 \/ sequence \/ 第 1 次 \/ 渲染错误/)).toBeInTheDocument();
    expect(screen.getAllByText("Syntax Error? (line 2)").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "复制追踪内容" })).toBeInTheDocument();
  });

  it("hides code skill resource internals in task details", async () => {
    const codeSnapshot = {
      runId: "code-skill-run",
      requirementText: "生成公众活动日历",
      rules: [],
      designModels: [],
      designPlantUml: [],
      existingFiles: {},
      files: {},
      dependencies: {},
      entryFile: "/src/App.tsx",
      diagnostics: [],
      qualityDiagnostics: [],
      selectedCodeSkills: [],
      skillDiagnostics: [],
      businessLogic: null,
      loadedCodeSkill: null,
      skillResourcePlan: {
        skillName: "ui-ux-pro-max",
        alias: "@web-design",
        query: "Public event calendar light design system",
        requests: [
          {
            resourceType: "design-system",
            name: "Public event calendar light design system",
            query: "public calendar accessible light theme",
            csvPath: "",
            stack: "",
            domain: "",
            actionName: "",
            maxResults: 5,
            reason: "查询日历产品的浅色设计系统。",
          },
        ],
        diagnostics: [],
      },
      codeSkillContext: {
        skillName: "ui-ux-pro-max",
        alias: "@web-design",
        query: "Public event calendar light design system",
        designSystem: "",
        stackGuidelines: "",
        domainGuidelines: "",
        diagnostics: [],
        actionResults: [
          {
            name: "React TypeScript CSS variables UI rules",
            description: "React prototype rules",
            command: "node-csv-resolver",
            args: ["data/stacks/react.csv"],
            outputFormat: "json",
            status: "completed",
            stdout: "Use React state for mock route tables. Use CSS variables for light and dark themes.",
            stderr: "",
            exitCode: 0,
            startedAt: "2026-05-17T08:00:00.000Z",
            completedAt: "2026-05-17T08:00:01.000Z",
          },
        ],
      },
      codeTrace: [
        {
          stage: "generate_file_operations",
          attempt: 1,
          kind: "parse_error",
          rawOutput: "{\"operations\":[{\"operation\":\"bad_operation\"}]}",
          errorMessage: "operations.0.operation: Invalid enum value",
          createdAt: "2026-05-17T08:00:02.000Z",
        },
        {
          stage: "generate_file_operations",
          attempt: 2,
          kind: "repaired_data",
          parsedData: {
            operations: [],
          },
          createdAt: "2026-05-17T08:00:03.000Z",
        },
      ],
      currentStage: "plan_code_ui",
      status: "completed",
      error: null,
      uiMockup: null,
      uiReferenceSpec: null,
      appBlueprint: null,
      uiBlueprint: null,
      spec: null,
      filePlan: null,
      agentPlan: [],
      uiFidelityReport: null,
      visualDiffReport: null,
      repairLoopSummary: null,
      designTokens: null,
      componentRegistry: null,
      uiIr: null,
      codeContextHash: null,
      changedFileCount: 0,
    } as unknown as CodeRunSnapshot;
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
      restoreRunHistory: vi.fn(async () => ({
        id: "history-code-skill",
        createdAt: "2026-05-17T08:00:00.000Z",
        title: "代码资源",
        providerModel: "gpt-5.5",
        snapshot: codeSnapshot,
      })),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarRestoreCodeSkillHarness />, repository));

    await user.click(screen.getByRole("button", { name: "恢复代码资源" }));

    expect(await screen.findByText("链路阶段")).toBeInTheDocument();
    expect(screen.getByText("代码调试追踪")).toBeInTheDocument();
    expect(screen.getByText(/生成代码文件操作 \/ 全局 \/ 第 1 次 \/ 解析错误/)).toBeInTheDocument();
    expect(screen.getByText(/operations\.0\.operation/)).toBeInTheDocument();
    expect(screen.queryByText("界面方案资源")).not.toBeInTheDocument();
    expect(screen.queryByText("资源查询结果")).not.toBeInTheDocument();
    expect(screen.queryByText("React TypeScript CSS variables UI rules")).not.toBeInTheDocument();
    expect(screen.queryByText(/Use React state for mock route tables/)).not.toBeInTheDocument();
  });
});
