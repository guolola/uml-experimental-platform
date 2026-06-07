import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { DesignDiagramView, DiagramView } from "./diagram-detail-page";

const { toastMessage, toastError } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    message: toastMessage,
    error: toastError,
    success: vi.fn(),
  },
}));

describe("DiagramView", () => {
  beforeEach(() => {
    toastMessage.mockClear();
    toastError.mockClear();
  });

  function createRepository(
    workspace = createWorkspaceRecord(),
  ): WorkspaceRepository {
    return {
      loadWorkspace: vi.fn(async () => workspace),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      renderStructuredModel: vi.fn(async (model) => ({
        plantUmlSource: `@startuml\n' ${model.title}\n@enduml`,
        svg: `<svg><text>${model.diagramKind}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: model.title.length,
          durationMs: 1,
        },
      })),
      saveRequirementModelEdit: vi.fn(async () => {}),
      saveDesignModelEdit: vi.fn(async () => {}),
      saveManualModelRerender: vi.fn(async () => {}),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
  }

  async function selectComboboxOption(
    scope: HTMLElement,
    label: string,
    optionName: string,
  ) {
    await userEvent.click(within(scope).getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: optionName }));
  }

  it("shows a clear error card when a diagram finished without SVG output", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
          generatedDiagramTypes: ["activity"],
          diagramErrors: {
            activity: {
              stage: "render_svg",
              error: {
                code: "RUN_RENDER_FAILED",
                message: "PlantUML repair failed for activity: Syntax Error?",
                category: "render",
                retryable: true,
              },
            },
          },
        }),
    );

    render(withWorkspaceProviders(<DiagramView type="activity" />, repository));

    expect(await screen.findByText("总体业务流程 生成失败")).toBeInTheDocument();
    expect(
      screen.getByText(/PlantUML repair failed for activity: Syntax Error\?/),
    ).toBeInTheDocument();
  });

  it("does not expose PlantUML source tabs or source export controls", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        rules: [
          createRule({
            id: "r1",
            text: "用户可以查看公开活动。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
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
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: "<svg><text>ok</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("预览")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /PlantUML/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/@startuml/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PUML/i })).not.toBeInTheDocument();
    expect(screen.queryByText("溯源·需求规则")).not.toBeInTheDocument();
    expect(screen.queryByText("用户可以查看公开活动。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JSON/i })).toBeInTheDocument();
  });

  it("shows structured model details before PlantUML and SVG are available", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "公开活动日历用例",
            notes: [],
            actors: [{ id: "visitor", name: "未注册用户", actorType: "human" }],
            useCases: [
              {
                id: "uc_view_events",
                name: "查看活动安排",
                goal: "查看公开活动",
                preconditions: ["日历为公开日历"],
                postconditions: ["活动安排已展示"],
                supportingActorIds: [],
                eventFlows: [
                  {
                    id: "flow-main",
                    name: "基本事件流",
                    steps: [
                      {
                        order: 1,
                        actor: "actor",
                        actorAction: "打开公开日历",
                        systemAction: "显示活动列表",
                        expectedResult: "活动列表可见",
                      },
                    ],
                  },
                ],
              },
            ],
            systemBoundaries: [],
            relationships: [],
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByDisplayValue("用例模型")).toBeInTheDocument();
    expect(screen.getByText("尚未生成 SVG")).toBeInTheDocument();
    expect(screen.queryByText(/尚未生成。请回到/)).not.toBeInTheDocument();
    expect(screen.getByText("查看活动安排")).toBeInTheDocument();
  });

  it("shows full use case event flow steps in the focused detail panel", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "注册用户维护公开活动",
            notes: [],
            actors: [{ id: "registered_user", name: "注册用户", actorType: "human" }],
            useCases: [
              {
                id: "uc_edit_event",
                name: "编辑公开活动",
                goal: "注册用户可以维护公开活动",
                preconditions: ["用户已注册"],
                postconditions: ["活动信息已保存"],
                primaryActorId: "registered_user",
                supportingActorIds: [],
                eventFlows: [
                  {
                    id: "flow-main",
                    name: "主事件流",
                    flowType: "main",
                    trigger: "用户打开活动编辑页",
                    steps: [
                      {
                        order: 1,
                        actor: "actor",
                        actorAction: "填写活动标题和时间",
                        systemAction: "校验活动时间是否公开可见",
                        expectedResult: "活动草稿通过校验",
                        sourceRequirementId: "FR3",
                      },
                      {
                        order: 2,
                        actor: "system",
                        systemAction: "保存活动并刷新公开日历",
                        expectedResult: "公众可查看更新后的活动",
                        sourceRequirementId: "FR2",
                      },
                    ],
                  },
                  {
                    id: "flow-duplicate",
                    name: "信息重复",
                    flowType: "alternative",
                    condition: "活动时间与标题重复",
                    steps: [
                      {
                        order: 1,
                        actor: "system",
                        systemAction: "提示活动信息重复",
                        expectedResult: "用户停留在编辑页修改信息",
                        sourceRequirementId: "FR3",
                      },
                    ],
                  },
                ],
              },
            ],
            systemBoundaries: [],
            relationships: [],
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView
          type="usecase"
          highlightedElement={{ kind: "usecase", id: "uc_edit_event" }}
        />,
        repository,
      ),
    );

    expect(await screen.findByText("焦点元素")).toBeInTheDocument();
    expect(screen.getAllByText("主事件流").length).toBeGreaterThan(0);
    expect(screen.getByText("备选事件流 · 信息重复")).toBeInTheDocument();
    expect(screen.getByText("1. 填写活动标题和时间")).toBeInTheDocument();
    expect(screen.getByText("校验活动时间是否公开可见")).toBeInTheDocument();
    expect(screen.getByText("保存活动并刷新公开日历")).toBeInTheDocument();
    expect(screen.getByText("提示活动信息重复")).toBeInTheDocument();
    expect(screen.getAllByText("FR3").length).toBeGreaterThan(0);
  });

  it("loads requirement diagram details by model id", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["analysis"],
        models: {
          "analysis:submit-order": {
            diagramKind: "analysis",
            modelId: "analysis:submit-order",
            sourceUseCaseId: "submit-order",
            sourceUseCaseName: "提交订单",
            title: "提交订单需求分析模型",
            summary: "提交订单事件流",
            notes: [],
            participants: [
              { id: "customer", name: "客户", participantType: "actor" },
            ],
            messages: [],
            fragments: [],
          },
        },
        plantUml: {
          "analysis:submit-order": "@startuml\nactor 客户\n@enduml",
        },
        svgArtifacts: {
          "analysis:submit-order": {
            diagramKind: "analysis",
            modelId: "analysis:submit-order",
            svg: "<svg><text>提交订单需求分析模型 SVG</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView type="analysis" modelId="analysis:submit-order" />,
        repository,
      ),
    );

    expect(await screen.findByDisplayValue("提交订单需求分析模型")).toBeInTheDocument();
    expect(screen.getByText("来源：用例模型事件流（用例：提交订单）")).toBeInTheDocument();
    expect(screen.queryByText("来源：需求规则（未标明）")).not.toBeInTheDocument();
    expect(screen.getByText("提交订单需求分析模型 SVG")).toBeInTheDocument();
  });

  it("shows requirement rule sources below the requirement model summary", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        rules: [
          createRule({
            id: "r1",
            text: "系统应管理图书信息。",
            relatedDiagrams: ["class"],
          }),
          createRule({
            id: "r2",
            text: "系统应维护读者借阅记录。",
            relatedDiagrams: ["class"],
          }),
          createRule({
            id: "r3",
            text: "系统应支持借出图书。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        plantUml: {
          class: "@startuml\nclass Book\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "图书馆核心概念",
            notes: [],
            classes: [],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>class</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    expect(await screen.findByText("来源：需求规则（R1、R2）")).toBeInTheDocument();
    expect(screen.queryByText("来源：需求规则（R1、R2、R3）")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成当前图" })).not.toBeInTheDocument();
  });

  it("shows design model source below the detail summary", async () => {
    const sequenceWithName = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { "sequence:borrow": "@startuml\n@enduml" },
        designModels: {
          "sequence:borrow": {
            diagramKind: "sequence",
            modelId: "sequence:borrow",
            sourceUseCaseId: "uc_borrow",
            sourceUseCaseName: "借出图书",
            title: "借出图书用例实现设计",
            summary: "借出图书流程",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          "sequence:borrow": {
            diagramKind: "sequence",
            modelId: "sequence:borrow",
            svg: "<svg><text>borrow</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );
    const namedView = render(
      withWorkspaceProviders(
        <DesignDiagramView type="sequence" modelId="sequence:borrow" />,
        sequenceWithName,
      ),
    );

    expect(
      await screen.findByText("来源：需求阶段用例模型事件流 + 需求分析模型（用例：借出图书）"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成当前图" })).not.toBeInTheDocument();
    namedView.unmount();

    const sequenceWithId = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { "sequence:uc_only": "@startuml\n@enduml" },
        designModels: {
          "sequence:uc_only": {
            diagramKind: "sequence",
            modelId: "sequence:uc_only",
            sourceUseCaseId: "uc_only",
            title: "用例实现设计",
            summary: "无用例名",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          "sequence:uc_only": {
            diagramKind: "sequence",
            modelId: "sequence:uc_only",
            svg: "<svg><text>sequence</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );
    const idView = render(
      withWorkspaceProviders(
        <DesignDiagramView type="sequence" modelId="sequence:uc_only" />,
        sequenceWithId,
      ),
    );

    expect(
      await screen.findByText("来源：需求阶段用例模型事件流 + 需求分析模型（用例ID：uc_only）"),
    ).toBeInTheDocument();
    idView.unmount();

    const sequenceWithoutUseCase = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { sequence: "@startuml\n@enduml" },
        designModels: {
          sequence: {
            diagramKind: "sequence",
            title: "用例实现设计",
            summary: "缺少用例信息",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          sequence: {
            diagramKind: "sequence",
            svg: "<svg><text>sequence</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );
    const missingView = render(
      withWorkspaceProviders(<DesignDiagramView type="sequence" />, sequenceWithoutUseCase),
    );

    expect(
      await screen.findByText("来源：需求阶段用例模型事件流 + 需求分析模型（具体用例未标明）"),
    ).toBeInTheDocument();
    missingView.unmount();

    const activityRepository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["activity"],
        designPlantUml: { activity: "@startuml\n@enduml" },
        designModels: {
          activity: {
            diagramKind: "activity",
            title: "界面关系图",
            summary: "业务流程",
            notes: [],
            swimlanes: [],
            nodes: [],
            relationships: [],
          },
        },
        designSvgArtifacts: {
          activity: {
            diagramKind: "activity",
            svg: "<svg><text>activity</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );
    render(withWorkspaceProviders(<DesignDiagramView type="activity" />, activityRepository));

    expect(
      await screen.findByText("来源：需求阶段原型界面关系 + 设计阶段用例实现设计"),
    ).toBeInTheDocument();
  });

  it("autosaves title and summary edits, rerenders the design diagram, and shows a toast", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["class"],
        designPlantUml: { class: "@startuml\n@enduml" },
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
        designSvgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>class</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="class" />, repository));

    await userEvent.clear(await screen.findByLabelText("模型标题"));
    await userEvent.type(screen.getByLabelText("模型标题"), "图书馆设计类图");
    await userEvent.clear(screen.getByLabelText("模型摘要"));
    await userEvent.type(screen.getByLabelText("模型摘要"), "更新后的结构说明");

    await waitFor(() => {
      expect(repository.saveDesignModelEdit).toHaveBeenCalledWith(
        "class",
        expect.objectContaining({
          title: "图书馆设计类图",
          summary: "更新后的结构说明",
        }),
        expect.objectContaining({ status: "dirty" }),
      );
    }, { timeout: 2500 });
    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "图书馆设计类图",
        summary: "更新后的结构说明",
      }),
    );
    expect(toastMessage).toHaveBeenCalledWith("修改已保存，当前图已更新");
    expect(screen.queryByRole("button", { name: "重新生成当前图" })).not.toBeInTheDocument();
  });

  it("keeps edited text visible and shows a toast when autosave fails", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["activity"],
        designPlantUml: { activity: "@startuml\n@enduml" },
        designModels: {
          activity: {
            diagramKind: "activity",
            title: "界面关系图",
            summary: "业务流程",
            notes: [],
            swimlanes: [],
            nodes: [],
            relationships: [],
          },
        },
        designSvgArtifacts: {
          activity: {
            diagramKind: "activity",
            svg: "<svg><text>activity</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );
    vi.mocked(repository.saveDesignModelEdit!).mockRejectedValueOnce(new Error("save failed"));

    render(withWorkspaceProviders(<DesignDiagramView type="activity" />, repository));

    await userEvent.clear(await screen.findByLabelText("模型摘要"));
    await userEvent.type(screen.getByLabelText("模型摘要"), "失败时仍保留的摘要");

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("保存失败，请稍后重试");
    }, { timeout: 2500 });
    expect(screen.getByLabelText("模型摘要")).toHaveValue("失败时仍保留的摘要");
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();
  });

  it("opens SVG preview through a blob URL and revokes it on unmount", async () => {
    const createObjectURL = vi.fn(() => "blob:diagram-preview");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
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
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: "<svg><text>ok</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    try {
      const { unmount } = render(
        withWorkspaceProviders(<DiagramView type="usecase" />, repository),
      );

      const link = await screen.findByRole("link", { name: /新标签/ });
      expect(link).toHaveAttribute("href", "blob:diagram-preview");
      expect(link.getAttribute("href")).not.toMatch(/^data:/);
      expect(createObjectURL).toHaveBeenCalledTimes(1);

      unmount();

      expect(revokeObjectURL).toHaveBeenCalledWith("blob:diagram-preview");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it("supports zooming generated SVG previews", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
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
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("100%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "放大 SVG" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "缩小 SVG" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("keeps the SVG preview full width while opening and closing the model overview overlay", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Book\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "图书馆核心概念",
            notes: [],
            classes: [
              {
                id: "book",
                name: "Book",
                description: "图书",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_book_user",
                type: "association",
                sourceId: "book",
                targetId: "book",
                label: "自关联",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Book</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    expect(await screen.findByTestId("diagram-preview-section")).toHaveClass("w-full");
    expect(screen.queryByRole("complementary", { name: "模型概览" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "打开模型概览" }));
    const panel = await screen.findByRole("complementary", { name: "模型概览" });
    expect(within(panel).getByText("类")).toBeInTheDocument();
    expect(within(panel).getByText("关系")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "模型概览" })).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "打开模型概览" }));
    await userEvent.click(await screen.findByRole("button", { name: "关闭模型概览" }));
    expect(screen.queryByRole("complementary", { name: "模型概览" })).not.toBeInTheDocument();
  });

  it("zooms only the SVG canvas on ctrl wheel and prevents page zoom", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
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
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    const canvas = await screen.findByTestId("svg-preview-canvas");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("110%")).toBeInTheDocument();
    });
  });

  it("pans the SVG canvas by dragging it", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
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
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="2000" height="1200"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    const canvas = await screen.findByTestId("svg-preview-canvas");
    const viewport = canvas.firstElementChild as HTMLElement;

    const pointerEvent = (
      type: string,
      init: { button?: number; pointerId: number; clientX?: number; clientY?: number },
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        button: { value: init.button ?? 0 },
        pointerId: { value: init.pointerId },
        clientX: { value: init.clientX ?? 0 },
        clientY: { value: init.clientY ?? 0 },
      });
      return event;
    };

    fireEvent(canvas, pointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 120, clientY: 90 }));
    fireEvent(canvas, pointerEvent("pointermove", { pointerId: 1, clientX: 90, clientY: 70 }));
    fireEvent(canvas, pointerEvent("pointerup", { pointerId: 1 }));

    expect(viewport.style.transform).toBe("translate(-30px, -20px)");
    expect(canvas).toHaveClass("select-none");
  });

  it("shows large diagrams directly without summary view controls", async () => {
    const actors = Array.from({ length: 33 }, (_, index) => ({
      id: `actor_${index}`,
      name: `Actor ${index}`,
      actorType: "human" as const,
      responsibilities: [],
    }));
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "大型用例图",
            notes: [],
            actors,
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>large diagram</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("large diagram")).toBeInTheDocument();
    expect(screen.queryByText("摘要视图")).not.toBeInTheDocument();
    expect(screen.queryByText("完整视图")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "放大 SVG" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("shows editable elements and relation endpoints in the diagram page", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Event\nclass Reminder\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            notes: [],
            classes: [
              {
                id: "cls_event",
                name: "Event",
                description: "公开活动",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
              {
                id: "cls_reminder",
                name: "Reminder",
                description: "提醒记录",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_event_reminder",
                type: "association",
                sourceId: "cls_event",
                targetId: "cls_reminder",
                label: null,
                sourceRole: "event",
                targetRole: "reminders",
                sourceMultiplicity: "1",
                targetMultiplicity: "0..*",
                navigability: "bidirectional",
                description: "活动关联多个提醒记录。",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Event</text><text>Reminder</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    const { container } = render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    expect(await screen.findByLabelText("模型标题")).toHaveValue("领域概念模型");
    expect(screen.getByLabelText("模型摘要")).toHaveValue("公开日历领域对象");
    expect(screen.queryByRole("tab", { name: /元素/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /关系/ })).not.toBeInTheDocument();
    expect(screen.queryByText("编辑模型")).not.toBeInTheDocument();

    expect(screen.getByText("元素清单")).toBeInTheDocument();
    const elementSearch = screen.getByLabelText("搜索元素");
    const elementFilterGroup = screen.getByRole("group", { name: "按元素类型筛选" });
    const addClassButton = screen.getByRole("button", { name: "添加类" });
    expect(elementSearch).toBeInTheDocument();
    expect(elementSearch.compareDocumentPosition(elementFilterGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(elementFilterGroup.compareDocumentPosition(addClassButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部类型 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "类 2" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "模型结构编辑" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("类 cls_event 名称")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑类：Event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除类：Event" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑类：Event" }).compareDocumentPosition(
        screen.getByRole("button", { name: "删除类：Event" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const eventCard = screen.getByRole("button", { name: "定位元素：Event" });
    await userEvent.click(eventCard);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "定位元素：Event" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    await waitFor(() => {
      expect(container.querySelector("text.pum-highlight")?.textContent).toBe("Event");
    });
    expect(screen.getByText("关系说明")).toBeInTheDocument();
    const relationSearch = screen.getByLabelText("搜索关系");
    const relationFilterGroup = screen.getByRole("group", { name: "按关系类型筛选" });
    const addRelationButton = screen.getByRole("button", { name: "添加关系" });
    expect(relationSearch).toBeInTheDocument();
    expect(relationSearch.compareDocumentPosition(relationFilterGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(relationFilterGroup.compareDocumentPosition(addRelationButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部关系 1" })).toBeInTheDocument();
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("关系 rel_event_reminder 起点")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑关系：活动关联多个提醒记录。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除关系：活动关联多个提醒记录。" })).toBeInTheDocument();
    await userEvent.type(relationSearch, "不存在的关系");
    expect(screen.queryByRole("button", { name: "编辑关系：活动关联多个提醒记录。" })).not.toBeInTheDocument();
    await userEvent.clear(relationSearch);
    await userEvent.type(relationSearch, "Reminder");
    expect(screen.getByRole("button", { name: "编辑关系：活动关联多个提醒记录。" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "删除类：Event" }));
    const cancelDialog = await screen.findByRole("dialog", { name: /删除类/u });
    await userEvent.click(within(cancelDialog).getByRole("button", { name: "取消" }));
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "删除关系：活动关联多个提醒记录。" }));
    const deleteDialog = await screen.findByRole("dialog", { name: /删除关系/u });
    await userEvent.click(within(deleteDialog).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalled());
    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({ relationships: [] }),
    );
    expect(toastMessage).toHaveBeenCalledWith("修改已保存，当前图已更新");
  });

  it("opens add dialogs before creating elements or relations", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Customer\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "客户领域对象",
            notes: [],
            classes: [
              {
                id: "cls_customer",
                name: "Customer",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Customer</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "添加类" }));
    let dialog = await screen.findByRole("dialog", { name: /添加类/u });
    expect(dialog).toHaveClass("sm:max-w-lg");
    expect(dialog.querySelector("div[class*='grid-cols-1']")).not.toBeNull();
    expect(within(dialog).queryByText(/cls_|rel_|actor_/u)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "添加类" }));
    dialog = await screen.findByRole("dialog", { name: /添加类/u });
    const classNameInput = within(dialog).getByLabelText("类名称");
    await userEvent.clear(classNameInput);
    await userEvent.type(classNameInput, "Invoice");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认添加" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(1));
    expect(repository.renderStructuredModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        classes: expect.arrayContaining([expect.objectContaining({ name: "Invoice" })]),
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "添加关系" }));
    dialog = await screen.findByRole("dialog", { name: /添加关系/u });
    expect(dialog).toHaveClass("sm:max-w-lg");
    expect(dialog.querySelector("div[class*='grid-cols-1']")).not.toBeNull();
    expect(dialog.querySelector("select")).toBeNull();
    expect(within(dialog).getByRole("combobox", { name: "起点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "终点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "关系类型" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/cls_|rel_|actor_/u)).not.toBeInTheDocument();
    const relationNameInput = within(dialog).getByLabelText("关系名称");
    await userEvent.clear(relationNameInput);
    await userEvent.type(relationNameInput, "关联发票");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认添加" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(2));
    expect(repository.renderStructuredModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        relationships: expect.arrayContaining([expect.objectContaining({ label: "关联发票" })]),
      }),
    );
    expect(toastMessage).toHaveBeenCalledWith("修改已保存，当前图已更新");
  });

  it("keeps edited element draft visible and shows a toast when rerender fails", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Customer\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "客户领域对象",
            notes: [],
            classes: [
              {
                id: "cls_customer",
                name: "Customer",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Customer</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );
    vi.mocked(repository.renderStructuredModel!).mockRejectedValueOnce(new Error("render failed"));

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "编辑类：Customer" }));
    const dialog = await screen.findByRole("dialog", { name: /编辑类/u });
    await userEvent.clear(within(dialog).getByLabelText("类名称"));
    await userEvent.type(within(dialog).getByLabelText("类名称"), "Client");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("保存失败，请稍后重试");
    });
    expect(await screen.findByRole("button", { name: "定位元素：Client" })).toBeInTheDocument();
  });

  it("edits a use case model and rerenders the current diagram", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 教师\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "教师登录系统",
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
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: "<svg><text>教师</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByLabelText("模型标题")).toHaveValue("用例图");
    expect(screen.getByLabelText("模型摘要")).toHaveValue("教师登录系统");
    expect(screen.getByText(/手动修改会更新当前模型结构/)).toBeInTheDocument();
    expect(screen.queryByText("编辑模型")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成此图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /元素/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /关系/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "添加角色" }));
    let dialog = await screen.findByRole("dialog", { name: /添加角色/u });
    expect(dialog).toHaveClass("sm:max-w-lg");
    expect(dialog.querySelector("div[class*='grid-cols-1']")).not.toBeNull();
    expect(within(dialog).getByLabelText("角色名称")).toBeInTheDocument();
    expect(within(dialog).queryByText(/actor_/u)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole("button", { name: "编辑角色：教师" }));
    dialog = await screen.findByRole("dialog", { name: /编辑角色/u });
    expect(dialog).toHaveClass("sm:max-w-lg");
    expect(dialog.querySelector("div[class*='grid-cols-1']")).not.toBeNull();
    expect(within(dialog).queryByText(/actor_/u)).not.toBeInTheDocument();
    const actorNameInput = within(dialog).getByLabelText("角色名称");
    await userEvent.clear(actorNameInput);
    await userEvent.type(actorNameInput, "授课教师");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "编辑关系：发起" }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    expect(dialog).toHaveClass("sm:max-w-lg");
    expect(dialog.querySelector("div[class*='grid-cols-1']")).not.toBeNull();
    expect(dialog.querySelector("select")).toBeNull();
    expect(within(dialog).getByRole("combobox", { name: "起点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "终点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "关系类型" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/rel_/u)).not.toBeInTheDocument();
    const relationLabelInput = within(dialog).getByLabelText("关系名称");
    await userEvent.clear(relationLabelInput);
    await userEvent.type(relationLabelInput, "发起登录");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(2));

    expect(screen.queryByRole("button", { name: "保存编辑" })).not.toBeInTheDocument();

    expect(repository.saveRequirementModelEdit).toHaveBeenCalledWith(
      "usecase",
      expect.objectContaining({
        actors: [expect.objectContaining({ name: "授课教师" })],
        relationships: [expect.objectContaining({ label: "发起登录" })],
      }),
      expect.objectContaining({ status: "dirty" }),
    );
    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: [expect.objectContaining({ name: "授课教师" })],
        relationships: [expect.objectContaining({ label: "发起登录" })],
      }),
    );
    expect(
      vi.mocked(repository.saveRequirementModelEdit).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(repository.renderStructuredModel).mock.invocationCallOrder[0],
    );
    await waitFor(() => {
      expect(screen.queryByText(/可能与前置需求映射不一致/)).not.toBeInTheDocument();
    });
  });

  it("edits class members, relation metadata, and shared model fields", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: { class: "@startuml\nclass Order\n@enduml" },
        models: {
          class: {
            diagramKind: "class",
            title: "类图",
            summary: "订单领域",
            notes: ["旧备注"],
            classes: [
              {
                id: "cls_order",
                name: "Order",
                classKind: "entity",
                stereotype: "AggregateRoot",
                description: "订单",
                attributes: [
                  {
                    name: "amount",
                    type: "number",
                    visibility: "private",
                    required: true,
                  },
                ],
                operations: [
                  {
                    name: "submit",
                    returnType: "void",
                    visibility: "public",
                    parameters: [
                      {
                        name: "operatorId",
                        type: "string",
                        required: true,
                      },
                    ],
                  },
                ],
              },
              {
                id: "cls_user",
                name: "User",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [
              {
                id: "if_payable",
                name: "Payable",
                operations: [{ name: "pay", visibility: "public", parameters: [] }],
              },
            ],
            enums: [{ id: "enum_status", name: "OrderStatus", literals: ["CREATED"] }],
            relationships: [
              {
                id: "rel_owner",
                type: "association",
                sourceId: "cls_user",
                targetId: "cls_order",
                sourceMultiplicity: "1",
                targetMultiplicity: "*",
                navigability: "source-to-target",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Order</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.clear(await screen.findByLabelText("模型标题"));
    await userEvent.type(screen.getByLabelText("模型标题"), "订单类模型");
    expect(screen.queryByText("备注")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("模型备注")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "编辑类：Order" }));
    let dialog = await screen.findByRole("dialog", { name: /编辑类/u });
    expect(dialog).toHaveClass("sm:max-w-lg");
    expect(dialog.querySelector("div[class*='grid-cols-1']")).not.toBeNull();
    await userEvent.clear(within(dialog).getByLabelText("第 1 个属性名称"));
    await userEvent.type(within(dialog).getByLabelText("第 1 个属性名称"), "totalAmount");
    await userEvent.clear(within(dialog).getByLabelText("第 1 个方法的第 1 个参数名称"));
    await userEvent.type(within(dialog).getByLabelText("第 1 个方法的第 1 个参数名称"), "userId");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑接口：Payable" }));
    dialog = await screen.findByRole("dialog", { name: /编辑接口/u });
    await userEvent.clear(within(dialog).getByLabelText("第 1 个方法名称"));
    await userEvent.type(within(dialog).getByLabelText("第 1 个方法名称"), "capture");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑枚举：OrderStatus" }));
    dialog = await screen.findByRole("dialog", { name: /编辑枚举/u });
    fireEvent.change(within(dialog).getByLabelText("枚举字面量"), {
      target: { value: "CREATED\nPAID" },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: /编辑关系：/u }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("目标多重性"));
    await userEvent.type(within(dialog).getByLabelText("目标多重性"), "0..*");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(repository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "订单类模型",
          notes: ["旧备注"],
          classes: expect.arrayContaining([
            expect.objectContaining({
              id: "cls_order",
              attributes: [expect.objectContaining({ name: "totalAmount" })],
              operations: [
                expect.objectContaining({
                  parameters: [expect.objectContaining({ name: "userId" })],
                }),
              ],
            }),
          ]),
          interfaces: [
            expect.objectContaining({
              operations: [expect.objectContaining({ name: "capture" })],
            }),
          ],
          enums: [expect.objectContaining({ literals: ["CREATED", "PAID"] })],
          relationships: [
            expect.objectContaining({
              targetMultiplicity: "0..*",
            }),
          ],
        }),
      );
    });
  });

  it("edits table columns and field-level table relations", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["table"],
        designPlantUml: { table: "@startuml\n@enduml" },
        designModels: {
          table: {
            diagramKind: "table",
            title: "数据库设计",
            summary: "订单表",
            notes: [],
            tables: [
              {
                id: "orders",
                name: "orders",
                columns: [
                  {
                    id: "order_id",
                    name: "id",
                    dataType: "uuid",
                    isPrimaryKey: true,
                    isForeignKey: false,
                    nullable: false,
                  },
                  {
                    id: "user_id",
                    name: "user_id",
                    dataType: "uuid",
                    isPrimaryKey: false,
                    isForeignKey: true,
                    nullable: false,
                  },
                ],
              },
              {
                id: "users",
                name: "users",
                columns: [
                  {
                    id: "id",
                    name: "id",
                    dataType: "uuid",
                    isPrimaryKey: true,
                    isForeignKey: false,
                    nullable: false,
                  },
                ],
              },
            ],
            relationships: [
              {
                id: "rel_orders_users",
                type: "one-to-many",
                sourceTableId: "users",
                targetTableId: "orders",
              },
            ],
          },
        },
        designSvgArtifacts: {
          table: {
            diagramKind: "table",
            svg: "<svg><text>orders</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="table" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "编辑数据表：orders" }));
    let dialog = await screen.findByRole("dialog", { name: /编辑数据表/u });
    await userEvent.clear(within(dialog).getByLabelText("第 1 个字段名称"));
    await userEvent.type(within(dialog).getByLabelText("第 1 个字段名称"), "order_id");
    await userEvent.click(within(dialog).getByLabelText("添加字段"));
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: /编辑关系：/u }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    expect(dialog.querySelector("select")).toBeNull();
    await selectComboboxOption(dialog, "源字段", "id");
    await selectComboboxOption(dialog, "目标字段", "user_id");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(repository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          tables: expect.arrayContaining([
            expect.objectContaining({
              id: "orders",
              columns: expect.arrayContaining([
                expect.objectContaining({ id: "order_id", name: "order_id" }),
                expect.objectContaining({ name: "new_column" }),
              ]),
            }),
          ]),
          relationships: [
            expect.objectContaining({
              sourceColumnId: "id",
              targetColumnId: "user_id",
            }),
          ],
        }),
      );
    });
  });

  it("edits sequence message details and fragment message membership", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { "sequence:login": "@startuml\n@enduml" },
        designModels: {
          "sequence:login": {
            diagramKind: "sequence",
            modelId: "sequence:login",
            title: "登录用例实现设计",
            summary: "登录流程",
            notes: [],
            participants: [
              { id: "teacher", name: "教师", participantType: "actor" },
              { id: "auth", name: "认证服务", participantType: "service" },
            ],
            messages: [
              {
                id: "msg_login",
                type: "sync",
                sourceId: "teacher",
                targetId: "auth",
                name: "登录",
                parameters: ["username"],
              },
              {
                id: "msg_result",
                type: "return",
                sourceId: "auth",
                targetId: "teacher",
                name: "返回结果",
                parameters: [],
              },
            ],
            fragments: [
              {
                id: "frag_auth",
                type: "opt",
                label: "认证成功",
                messageIds: ["msg_login"],
              },
            ],
          },
        },
        designSvgArtifacts: {
          "sequence:login": {
            diagramKind: "sequence",
            modelId: "sequence:login",
            svg: "<svg><text>login</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DesignDiagramView type="sequence" modelId="sequence:login" />,
        repository,
      ),
    );

    await userEvent.click(await screen.findByRole("button", { name: "编辑参与对象：认证服务" }));
    let dialog = await screen.findByRole("dialog", { name: /编辑参与对象/u });
    expect(dialog.querySelector("select")).toBeNull();
    await selectComboboxOption(dialog, "参与对象类型", "control");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑关系：登录" }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    fireEvent.change(within(dialog).getByLabelText("参数"), {
      target: { value: "username\npassword" },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑关系：返回结果" }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("返回值"));
    await userEvent.type(within(dialog).getByLabelText("返回值"), "token");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑组合片段：认证成功" }));
    dialog = await screen.findByRole("dialog", { name: /编辑组合片段/u });
    await userEvent.click(within(dialog).getByLabelText("包含消息：返回结果"));
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(repository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({ id: "auth", participantType: "control" }),
          ]),
          messages: expect.arrayContaining([
            expect.objectContaining({ id: "msg_login", parameters: ["username", "password"] }),
            expect.objectContaining({ id: "msg_result", returnValue: "token" }),
          ]),
          fragments: [expect.objectContaining({ messageIds: ["msg_login", "msg_result"] })],
        }),
      );
    });
  });

  it("edits activity and deployment relation-specific fields without collapsing them into descriptions", async () => {
    const activityRepository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["activity"],
        plantUml: { activity: "@startuml\n@enduml" },
        models: {
          activity: {
            diagramKind: "activity",
            title: "活动图",
            summary: "审批流程",
            notes: [],
            swimlanes: [{ id: "lane_teacher", name: "教师" }],
            nodes: [
              { id: "start", type: "start", name: "开始" },
              { id: "decide", type: "decision", question: "是否通过" },
              { id: "approve", type: "activity", name: "批准", input: [], output: [] },
            ],
            relationships: [
              { id: "flow_yes", type: "control_flow", sourceId: "decide", targetId: "approve", guard: "是" },
            ],
          },
        },
        svgArtifacts: {
          activity: {
            diagramKind: "activity",
            svg: "<svg><text>activity</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    const { unmount } = render(withWorkspaceProviders(<DiagramView type="activity" />, activityRepository));

    await userEvent.click(await screen.findByRole("button", { name: "编辑活动节点：是否通过" }));
    let dialog = await screen.findByRole("dialog", { name: /编辑活动节点/u });
    await userEvent.clear(within(dialog).getByLabelText("活动节点问题"));
    await userEvent.type(within(dialog).getByLabelText("活动节点问题"), "是否允许提交");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: /编辑关系：/u }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("守卫"));
    await userEvent.type(within(dialog).getByLabelText("守卫"), "允许");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(activityRepository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: "decide", question: "是否允许提交" }),
          ]),
          relationships: [expect.objectContaining({ guard: "允许" })],
        }),
      );
    });
    expect(
      (
        vi.mocked(activityRepository.renderStructuredModel).mock.calls[0]?.[0] as {
          relationships: Array<Record<string, unknown>>;
        }
      ).relationships[0],
    ).not.toHaveProperty("description");

    unmount();

    const deploymentRepository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["deployment"],
        designPlantUml: { deployment: "@startuml\n@enduml" },
        designModels: {
          deployment: {
            diagramKind: "deployment",
            title: "部署图",
            summary: "部署拓扑",
            notes: [],
            nodes: [{ id: "web", name: "Web", nodeType: "server" }],
            databases: [{ id: "db", name: "DB", engine: "PostgreSQL" }],
            components: [],
            externalSystems: [],
            artifacts: [],
            relationships: [
              {
                id: "dep_db",
                type: "communication",
                sourceId: "web",
                targetId: "db",
                protocol: "TCP",
              },
            ],
          },
        },
        designSvgArtifacts: {
          deployment: {
            diagramKind: "deployment",
            svg: "<svg><text>deploy</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="deployment" />, deploymentRepository));

    await userEvent.click(await screen.findByRole("button", { name: /编辑关系：/u }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("协议"));
    await userEvent.type(within(dialog).getByLabelText("协议"), "HTTPS");
    expect(dialog.querySelector("select")).toBeNull();
    await selectComboboxOption(dialog, "方向", "two-way");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(deploymentRepository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          relationships: [expect.objectContaining({ protocol: "HTTPS", direction: "two-way" })],
        }),
      );
    });
    expect(
      (
        vi.mocked(deploymentRepository.renderStructuredModel).mock.calls[0]?.[0] as {
          relationships: Array<Record<string, unknown>>;
        }
      ).relationships[0],
    ).not.toHaveProperty("description");
  });

  it("keeps highlighted context while showing relation editors in the diagram page", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Event\nclass Reminder\nclass User\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            notes: [],
            classes: [
              {
                id: "cls_event",
                name: "Event",
                description: "公开活动",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
              {
                id: "cls_reminder",
                name: "Reminder",
                description: "提醒记录",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
              {
                id: "cls_user",
                name: "User",
                description: "用户",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_event_reminder",
                type: "association",
                sourceId: "cls_event",
                targetId: "cls_reminder",
                label: null,
                sourceRole: "event",
                targetRole: "reminders",
                sourceMultiplicity: "1",
                targetMultiplicity: "0..*",
                navigability: "bidirectional",
                description: "活动关联多个提醒记录。",
              },
              {
                id: "rel_user_reminder",
                type: "dependency",
                sourceId: "cls_user",
                targetId: "cls_reminder",
                label: "查看提醒",
                description: "用户查看提醒。",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Event</text><text>Reminder</text><text>User</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView type="class" highlightedElement={{ kind: "class", id: "cls_event" }} />,
        repository,
      ),
    );

    expect(await screen.findByText("预览")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索元素、属性或说明")).toBeInTheDocument();
    expect(screen.getByText(/相关关系 1 条/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /关系/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Event").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reminder").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("只看焦点相关关系")).not.toBeInTheDocument();
  });
});
