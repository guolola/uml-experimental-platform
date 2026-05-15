import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
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
});
