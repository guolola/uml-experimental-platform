import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DesignRunSnapshot } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
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

const classModel = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "核心实体",
  notes: [],
  classes: [],
  interfaces: [],
  enums: [],
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
      designTrace: [],
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

  it("disables design diagrams when their prerequisite requirement models are missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
          },
          selectedDesignDiagramTypes: ["class"],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    const [sequenceCheckbox, classDiagramCheckbox] = screen.getAllByRole("checkbox");
    expect(sequenceCheckbox).toBeEnabled();
    expect(classDiagramCheckbox).toBeDisabled();
    expect(classDiagramCheckbox).not.toBeChecked();
    expect(screen.getAllByText("缺少需求阶段领域概念模型").length).toBeGreaterThan(0);
    expect(screen.getByText("0/5")).toBeInTheDocument();
    expect(screen.queryByText("0/1")).not.toBeInTheDocument();
  });

  it("blocks downstream design diagrams when the use case prerequisite is missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            class: classModel,
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    const [sequenceCheckbox, classDiagramCheckbox] = screen.getAllByRole("checkbox");
    expect(sequenceCheckbox).toBeDisabled();
    expect(classDiagramCheckbox).toBeDisabled();
    expect(screen.getAllByText("缺少需求阶段用例模型").length).toBeGreaterThan(0);
  });

  it("blocks design generation when requirement model traceability is stale", async () => {
    const startDesignRun = vi.fn();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule()],
          rulesVersion: 2,
          rulesBasedOnTextVersion: 1,
          models: {
            usecase: useCaseModel,
          },
          generatedDiagramTypes: ["usecase"],
          diagramVersions: { usecase: 1 },
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "actor",
                elementKind: "actor",
                label: "用户",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc",
                elementKind: "usecase",
                label: "生成模型",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "system",
                elementKind: "system-boundary",
                label: "平台",
              },
            },
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun,
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    expect(
      await screen.findByText("需求模型基于旧需求规则，请先重新生成需求模型"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成设计模型/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /生成设计模型/ }));
    expect(startDesignRun).not.toHaveBeenCalled();
  });

  it("keeps a view action on generated design diagram cards", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
          },
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
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    expect(await screen.findByRole("button", { name: /查看/ })).toBeInTheDocument();
  });

  it("auto-includes valid sequence and class dependencies when generating table diagrams", async () => {
    const snapshot: DesignRunSnapshot = {
      runId: "design-run-table",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence", "class", "table"],
      rules: [],
      requirementModels: [useCaseModel, classModel],
      models: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      errorMessage: null,
    };
    const startDesignRun = vi.fn(async () => ({ runId: "design-run-table" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
            class: classModel,
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

    await userEvent.click(await screen.findByRole("checkbox", { name: /表关系图/ }));
    await userEvent.click(screen.getByRole("button", { name: /生成设计模型/ }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["sequence", "class", "table"],
        }),
      );
    });
  });
});
