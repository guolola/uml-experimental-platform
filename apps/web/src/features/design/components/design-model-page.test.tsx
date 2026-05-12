import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DesignRunSnapshot } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { DesignModelPage } from "./design-model-page";

const useCaseModel = {
  diagramKind: "usecase" as const,
  title: "用例模型",
  summary: "系统边界",
  notes: [],
  actors: [{ id: "actor", name: "用户", actorType: "human" as const, responsibilities: [] }],
  useCases: [
    {
      id: "uc",
      name: "生成模型",
      goal: "生成设计模型",
      preconditions: [],
      postconditions: [],
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [{ id: "system", name: "平台" }],
  relationships: [],
};

describe("DesignModelPage", () => {
  it("auto-includes sequence dependency when generating downstream design diagrams", async () => {
    const snapshot: DesignRunSnapshot = {
      runId: "design-run",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence", "activity"],
      rules: [],
      requirementModels: [useCaseModel],
      models: [
        {
          diagramKind: "sequence",
          title: "顺序图",
          summary: "动态行为",
          notes: [],
          participants: [{ id: "actor", name: "用户", participantType: "actor" }],
          messages: [],
          fragments: [],
        },
      ],
      plantUml: [{ diagramKind: "sequence", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "sequence",
          svg: "<svg><text>sequence</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 16,
            durationMs: 1,
          },
        },
      ],
      diagramErrors: {},
      currentStage: "render_svg",
      status: "completed",
      errorMessage: null,
    };
    const startDesignRun = vi.fn(async () => ({ runId: "design-run" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
            activity: {
              diagramKind: "activity",
              title: "需求活动图",
              summary: "业务流转",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun,
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
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

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await userEvent.click(await screen.findByRole("checkbox", { name: /界面关系/ }));
    await userEvent.click(screen.getByRole("button", { name: /生成设计模型/ }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["sequence", "activity"],
        }),
      );
    });
  });
});
