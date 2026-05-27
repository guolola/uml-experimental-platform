import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { useWorkspaceSession } from "../../workspace-session/state";
import { SidebarMenu } from "./sidebar-menu";
import { WorkspaceTabsBar } from "./workspace-tabs-bar";

const { toastMessage } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    message: toastMessage,
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function SidebarDesignGenerationHarness() {
  const { generateDesignDiagrams } = useWorkspaceSession();
  return (
    <>
      <SidebarMenu />
      <WorkspaceTabsBar />
      <button type="button" onClick={() => void generateDesignDiagrams(["class"])}>
        生成设计类图
      </button>
    </>
  );
}

function SidebarSequenceGenerationHarness() {
  const { generateDesignDiagrams } = useWorkspaceSession();
  return (
    <>
      <SidebarMenu />
      <WorkspaceTabsBar />
      <button type="button" onClick={() => void generateDesignDiagrams(["sequence"])}>
        生成顺序图
      </button>
    </>
  );
}

describe("SidebarMenu", () => {
  beforeEach(() => {
    vi.mocked(toast.message).mockClear();
  });

  it("renders the project workspace navigation root", async () => {
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
    render(
      withWorkspaceProviders(
        <SidebarMenu />,
        repository,
      ),
    );

    expect(await screen.findByRole("navigation", { name: "项目导航" })).toHaveClass("h-full", "w-full");
    expect(screen.getByText("项目导航")).toHaveClass("tracking-[0.88px]");
    expect(screen.queryByRole("button", { name: "项目首页" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "需求" }).parentElement).toHaveClass(
      "text-sm",
      "font-medium",
    );
    expect(screen.getByRole("button", { name: "需求" }).parentElement).not.toHaveClass(
      "text-[15px]",
      "font-semibold",
    );
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter(Boolean),
    ).toEqual(["需求", "设计", "代码", "说明书"]);
  });

  it("marks failed diagrams in the navigation tree", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["activity"],
          models: {
            activity: {
              diagramKind: "activity",
              title: "活动流程",
              summary: "失败图",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
          },
          diagramErrors: {
            activity: {
              stage: "render_svg",
              message: "PlantUML repair failed for activity: Syntax Error?",
            },
          },
        }),
      ),
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

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 需求" }));
    expect(await screen.findByText("界面关系图")).toBeInTheDocument();
    expect(screen.getByLabelText("界面关系图生成失败")).toBeInTheDocument();
    expect(screen.queryByText("历史快照")).not.toBeInTheDocument();
  });

  it("keeps requirement rule provenance badges out of generated diagram entries", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["usecase"],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例图",
              summary: "核心用例",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
          },
          rules: [
            createRule({ id: "r1", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r2", relatedDiagrams: ["usecase"] }),
            createRule({ id: "R3", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r4", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r5", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r6", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r7", relatedDiagrams: ["usecase"] }),
          ],
        }),
      ),
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
    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await user.click(await screen.findByRole("button", { name: "展开 需求" }));

    expect(screen.getByText("用例模型")).toBeInTheDocument();
    expect(screen.queryByText("R1 R2 R3 +4")).not.toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps design diagram upstream provenance badges out of design entries", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>顺序图</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
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

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计" }));

    expect(screen.getByText("顺序图")).toBeInTheDocument();
    expect(screen.queryByText("用例模型")).not.toBeInTheDocument();
  });

  it("shows traceability matrix entries in requirement and design navigation", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["usecase"],
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>顺序图</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
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

    render(
      withWorkspaceProviders(
        <div>
          <SidebarMenu />
          <WorkspaceTabsBar />
        </div>,
        repository,
      ),
    );

    const nav = await screen.findByRole("navigation", { name: "项目导航" });

    await userEvent.click(await within(nav).findByRole("button", { name: "展开 需求" }));
    await userEvent.click(within(nav).getByRole("button", { name: "需求跟踪矩阵" }));
    expect(screen.getAllByRole("button", { name: "需求跟踪矩阵" })).toHaveLength(2);

    await userEvent.click(within(nav).getByRole("button", { name: "展开 设计" }));
    await userEvent.click(within(nav).getByRole("button", { name: "设计跟踪矩阵" }));
    expect(screen.getAllByRole("button", { name: "设计跟踪矩阵" })).toHaveLength(2);
  });

  it("keeps upstream badges out of downstream design diagrams", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
        }),
      ),
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

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计" }));

    expect(screen.getByRole("button", { name: "设计类图" })).toBeInTheDocument();
    expect(screen.queryByText("领域概念模型")).not.toBeInTheDocument();
    expect(screen.queryByText("顺序图")).not.toBeInTheDocument();
  });

  it("shows a toast when a generated design model has no SVG yet", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
        }),
      ),
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
        <div>
          <SidebarMenu />
          <WorkspaceTabsBar />
        </div>,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "展开 设计" }));
    expect(screen.getByLabelText("设计类图已生成")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设计类图" }));

    expect(toast.message).toHaveBeenCalledWith("当前只有结构化模型，SVG 尚未生成");
    expect(screen.queryByRole("button", { name: "关闭 设计类图" })).not.toBeInTheDocument();
  });

  it("uses the SVG-missing toast for historical completed design nodes without artifacts", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {},
          designSvgArtifacts: {},
        }),
      ),
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
    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await user.click(await screen.findByRole("button", { name: "展开 设计" }));
    await user.click(screen.getByRole("button", { name: "设计类图" }));

    expect(toast.message).toHaveBeenCalledWith("当前只有结构化模型，SVG 尚未生成");
  });

  it("shows a failure toast for failed design nodes without opening a tab", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
          designDiagramErrors: {
            class: {
              stage: "render_svg",
              message: "PlantUML 渲染失败",
            },
          },
        }),
      ),
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
        <div>
          <SidebarMenu />
          <WorkspaceTabsBar />
        </div>,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "展开 设计" }));
    expect(screen.getByLabelText("设计类图生成失败")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设计类图" }));

    expect(toast.message).toHaveBeenCalledWith("生成失败，请查看生成任务详情");
    expect(screen.queryByRole("button", { name: "关闭 设计类图" })).not.toBeInTheDocument();
  });

  it("keeps queued design subtasks aligned with the sidebar while existing diagrams stay openable", async () => {
    let releaseRun!: () => void;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({ id: "r1", relatedDiagrams: ["class"] })],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型",
              summary: "系统边界",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
            class: {
              diagramKind: "class",
              title: "领域概念模型",
              summary: "核心实体",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "已有静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
          designSvgArtifacts: {
            class: {
              diagramKind: "class",
              svg: "<svg><text>设计类图</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(async () => ({ runId: "design-run-queued" })),
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({
          type: "stage_progress",
          stage: "generate_design_models",
          progress: 25,
          subtaskId: "class",
          subtaskLabel: "设计类图",
          subtaskStatus: "queued",
          queueReason: "project",
          queueAhead: 1,
          waitMs: 4_000,
          estimatedWaitMs: 20_000,
          message: "正在排队：设计类图",
        });
        await new Promise<void>((resolve) => {
          releaseRun = resolve;
        });
      }),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarDesignGenerationHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "生成设计类图" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await user.click(await screen.findByRole("button", { name: "展开 设计" }));

    expect(await screen.findByRole("button", { name: "设计类图" })).toBeInTheDocument();
    expect(
      screen.getByLabelText("设计类图重新生成排队中，当前图仍可查看"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("设计类图生成中")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设计类图" }));
    expect(await screen.findByRole("button", { name: "关闭 设计类图" })).toBeInTheDocument();
    expect(toast.message).not.toHaveBeenCalled();

    releaseRun();
  });

  it("lists all use-case sequence subtasks before they finish and only opens rendered ones", async () => {
    let releaseRun!: () => void;
    let emitDesignEvent!: Parameters<NonNullable<WorkspaceRepository["subscribeToDesignRun"]>>[1];
    let currentSnapshot: Awaited<ReturnType<NonNullable<WorkspaceRepository["getDesignRunSnapshot"]>>> =
      null;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型",
              summary: "系统边界",
              notes: [],
              actors: [],
              useCases: [
                {
                  id: "uc_view",
                  name: "查看活动",
                  goal: "查看活动列表",
                  preconditions: [],
                  postconditions: [],
                  supportingActorIds: [],
                },
                {
                  id: "uc_create",
                  name: "创建活动",
                  goal: "创建活动",
                  preconditions: [],
                  postconditions: [],
                  supportingActorIds: [],
                },
              ],
              systemBoundaries: [],
              relationships: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(async () => ({ runId: "design-run-sequence" })),
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
        emitDesignEvent = onEvent;
        onEvent({ type: "queued" });
        await new Promise<void>((resolve) => {
          releaseRun = resolve;
        });
      }),
      getDesignRunSnapshot: vi.fn(async () => currentSnapshot),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarSequenceGenerationHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "生成顺序图" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await user.click(await screen.findByRole("button", { name: "展开 设计" }));
    await user.click(await screen.findByRole("button", { name: "展开 顺序图（2）" }));

    expect(screen.getByRole("button", { name: "查看活动" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建活动" })).toBeInTheDocument();
    expect(screen.getByLabelText("查看活动生成排队中")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看活动" }));
    expect(toast.message).toHaveBeenCalledWith("生成排队中，完成后可查看");
    expect(screen.queryByRole("button", { name: "关闭 查看活动" })).not.toBeInTheDocument();

    emitDesignEvent({
      type: "stage_progress",
      stage: "generate_design_models",
      progress: 45,
      diagramKind: "sequence",
      modelId: "sequence:uc_view",
      subtaskId: "sequence:uc_view",
      subtaskLabel: "顺序图：查看活动",
      subtaskStatus: "running",
      message: "正在生成顺序图：查看活动",
    });
    expect(await screen.findByLabelText("查看活动生成中")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看活动" }));
    expect(toast.message).toHaveBeenLastCalledWith("正在生成图像，渲染完成后可查看");
    expect(screen.queryByRole("button", { name: "关闭 查看活动" })).not.toBeInTheDocument();

    currentSnapshot = {
      runId: "design-run-sequence",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      rules: [],
      requirementModels: [],
      requirementModelTraceability: [],
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_view",
          sourceUseCaseId: "uc_view",
          sourceUseCaseName: "查看活动",
          title: "查看活动顺序图",
          summary: "查看活动流程",
          notes: [],
          participants: [],
          messages: [],
          fragments: [],
        },
      ],
      designModelTraceability: [],
      plantUml: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_view",
          source: "@startuml\n@enduml",
        },
      ],
      svgArtifacts: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_view",
          svg: "<svg><text>查看活动</text></svg>",
          renderMeta: { engine: "plantuml" },
        },
      ],
      diagramErrors: {},
      coverageMatrix: null,
      traceabilityMatrix: null,
      designTrace: [],
      currentStage: "render_svg",
      status: "running",
      errorMessage: null,
    };
    emitDesignEvent({
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "svg",
      diagramKind: "sequence",
      modelId: "sequence:uc_view",
      subtaskId: "sequence:uc_view",
      subtaskStatus: "completed",
    });

    expect(await screen.findByLabelText("查看活动顺序图已生成")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看活动" }));
    expect(await screen.findByRole("button", { name: "关闭 查看活动" })).toBeInTheDocument();

    releaseRun();
  });

  it("keeps design provenance and element count badges out of design entries", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>顺序图</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
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

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计" }));
    await userEvent.click(screen.getByRole("button", { name: "展开 顺序图" }));

    expect(screen.queryByText("用例模型")).not.toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("shows primary workspace entries without default secondary pages", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: [
            "class",
            "deployment",
            "activity",
            "sequence",
            "table",
          ],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
            activity: {
              diagramKind: "activity",
              title: "业务流程图",
              summary: "业务逻辑流转",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
            deployment: {
              diagramKind: "deployment",
              title: "部署模型",
              summary: "物理部署",
              notes: [],
              nodes: [],
              databases: [],
              components: [],
              externalSystems: [],
              artifacts: [],
              relationships: [],
            },
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
            table: {
              diagramKind: "table",
              title: "表关系图",
              summary: "主外键关系",
              notes: [],
              tables: [
                {
                  id: "user",
                  name: "user",
                  columns: [
                    {
                      id: "id",
                      name: "id",
                      dataType: "INT",
                      isPrimaryKey: true,
                      isForeignKey: false,
                      nullable: false,
                    },
                  ],
                },
              ],
              relationships: [],
            },
          },
        }),
      ),
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

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    expect(await screen.findByText("设计")).toBeInTheDocument();
    expect(screen.getByText("代码")).toBeInTheDocument();
    expect(screen.queryByText("收起侧边栏")).not.toBeInTheDocument();
    expect(screen.queryByText("文本需求")).not.toBeInTheDocument();
    expect(screen.queryByText("生成设计模型")).not.toBeInTheDocument();
    expect(screen.queryByText("顺序图")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 设计" }));

    expect(screen.getByRole("button", { name: "顺序图" })).toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();
    expect(screen.queryByText("业务逻辑模型")).not.toBeInTheDocument();
    expect(screen.queryByText("静态结构模型")).not.toBeInTheDocument();
    expect(screen.queryByText("物理部署模型")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "领域概念模型" })).not.toBeInTheDocument();

    const nodeLabels = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter(Boolean);
    expect(nodeLabels.indexOf("顺序图")).toBeLessThan(nodeLabels.indexOf("业务流程图"));
    expect(nodeLabels.indexOf("顺序图")).toBeLessThan(nodeLabels.indexOf("设计类图"));
    expect(nodeLabels.indexOf("设计类图")).toBeLessThan(nodeLabels.indexOf("业务流程图"));
    expect(nodeLabels.indexOf("业务流程图")).toBeLessThan(nodeLabels.indexOf("部署模型"));
    expect(nodeLabels.indexOf("部署模型")).toBeLessThan(nodeLabels.indexOf("表关系图"));
  });

  it("expands design tree one level at a time", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>顺序图</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
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

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    expect(await screen.findByText("设计")).toBeInTheDocument();
    expect(screen.queryByText("顺序图")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 设计" }));

    expect(screen.getByText("顺序图")).toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 顺序图" }));

    expect(screen.getByText("参与对象")).toBeInTheDocument();
    expect(screen.queryByText("用户")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 参与对象" }));

    expect(screen.getByText("用户")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "折叠 设计" }));

    expect(screen.queryByText("顺序图")).not.toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();
    expect(screen.queryByText("用户")).not.toBeInTheDocument();
  });

  it("groups multiple use case sequence diagrams under the sequence node", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            "sequence:uc_view": {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              sourceUseCaseId: "uc_view",
              sourceUseCaseName: "查看活动",
              title: "查看活动顺序图",
              summary: "查看活动流程",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
            "sequence:uc_create": {
              diagramKind: "sequence",
              modelId: "sequence:uc_create",
              sourceUseCaseId: "uc_create",
              sourceUseCaseName: "创建活动",
              title: "创建活动顺序图",
              summary: "创建活动流程",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
        }),
      ),
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

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计" }));

    expect(screen.getByText("顺序图（2）")).toBeInTheDocument();
    expect(screen.queryByText("查看活动")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 顺序图（2）" }));

    expect(screen.getByText("查看活动")).toBeInTheDocument();
    expect(screen.getByText("创建活动")).toBeInTheDocument();
  });

  it("opens and closes workspace tabs from sidebar selections", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>顺序图</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
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

    render(
      withWorkspaceProviders(
        <div>
          <SidebarMenu />
          <WorkspaceTabsBar />
        </div>,
        repository,
      ),
    );

    expect((await screen.findAllByRole("button", { name: "需求" })).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "设计" }));
    await userEvent.click(screen.getByRole("button", { name: "展开 设计" }));
    await userEvent.click(screen.getByRole("button", { name: "顺序图" }));
    await userEvent.click(screen.getByRole("button", { name: "说明书" }));

    expect(screen.getAllByText("需求").length).toBeGreaterThan(0);
    expect(screen.getAllByText("设计").length).toBeGreaterThan(0);
    expect(screen.getAllByText("顺序图").length).toBeGreaterThan(0);
    expect(screen.getAllByText("说明书").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "关闭 顺序图" }));
    expect(screen.queryByRole("button", { name: "关闭 顺序图" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "关闭 说明书" }));
    await userEvent.click(screen.getByRole("button", { name: "关闭 设计" }));
    await userEvent.click(screen.getByRole("button", { name: "关闭 需求" }));
    expect(screen.getByRole("button", { name: "关闭 需求" })).toBeInTheDocument();
  });
});
