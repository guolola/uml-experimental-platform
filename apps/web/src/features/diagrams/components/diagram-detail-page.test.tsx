import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { DiagramView } from "./diagram-detail-page";

describe("DiagramView", () => {
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
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
  }

  it("shows a clear error card when a diagram finished without SVG output", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
          generatedDiagramTypes: ["activity"],
          diagramErrors: {
            activity: {
              stage: "render_svg",
              message: "PlantUML repair failed for activity: Syntax Error?",
            },
          },
        }),
    );

    render(withWorkspaceProviders(<DiagramView type="activity" />, repository));

    expect(await screen.findByText("界面关系 生成失败")).toBeInTheDocument();
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

  it("filters elements and shows human-readable relation endpoints", async () => {
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

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.click(await screen.findByRole("tab", { name: /元素/ }));
    expect(screen.getByRole("button", { name: "网格视图" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "全部类型 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reminder" })).toBeInTheDocument();
    expect(screen.getAllByText(/个字段/).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByPlaceholderText("搜索元素、属性或说明"), "Reminder");
    expect(screen.queryByRole("button", { name: "Event" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reminder" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /关系/ }));
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.getByText(/Event → Reminder/)).toBeInTheDocument();
  });

  it("opens highlighted elements in the element view and filters focus relations", async () => {
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
    expect(screen.queryByPlaceholderText("搜索元素、属性或说明")).not.toBeInTheDocument();
    expect(screen.getByText(/相关关系 1 条/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /关系/ }));
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.getByText("用户查看提醒。")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("只看焦点相关关系"));
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.queryByText("用户查看提醒。")).not.toBeInTheDocument();
  });
});
