import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DesignRunSnapshot } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRequirementBaseline,
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { DesignModelPage } from "./design-model-page";

type StartDesignRunInput = Parameters<
  NonNullable<WorkspaceRepository["startDesignRun"]>
>[0];

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

const analysisModel = {
  diagramKind: "analysis" as const,
  modelId: "analysis:uc",
  sourceUseCaseId: "uc",
  sourceUseCaseName: "生成模型",
  title: "生成模型需求分析模型",
  summary: "按用例事件流生成的需求分析顺序图",
  notes: [],
  participants: [],
  messages: [],
  fragments: [],
};

const prototypeModel = {
  diagramKind: "prototype" as const,
  modelId: "proto-1",
  title: "原型界面关系",
  summary: "页面入口",
  notes: [],
  pages: [],
  modules: [],
  entryPoints: [],
  relationships: [],
};

describe("DesignModelPage", () => {
  it("treats per-use-case analysis models as available requirement sources", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
            "analysis:uc": analysisModel,
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

    const sourceRegion = await screen.findByRole("heading", { name: "需求阶段来源" });
    const sourceGrid = sourceRegion.closest("section");

    const analysisSourceCard = within(sourceGrid as HTMLElement)
      .getByText("需求分析模型")
      .closest("div");

    expect(analysisSourceCard).toHaveTextContent("可用");
  });

  it("treats generated prototype model aliases as available requirement sources", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
            "proto-1": prototypeModel,
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

    const sourceRegion = await screen.findByRole("heading", { name: "需求阶段来源" });
    const sourceGrid = sourceRegion.closest("section");

    const prototypeSourceCard = within(sourceGrid as HTMLElement)
      .getByText("原型界面关系")
      .closest("div");

    expect(prototypeSourceCard).toHaveTextContent("可用");
  });

  it("keeps downstream design selection separate and confirms missing sequence dependency", async () => {
    const snapshot: DesignRunSnapshot = {
      runId: "design-run",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence", "activity"],
      rules: [],
      requirementBaseline: createRequirementBaseline(),
      requirementModels: [useCaseModel],
      models: [
        {
          diagramKind: "sequence",
          title: "用例实现设计",
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
      error: null,
    };
    const startDesignRun = vi.fn(async () => ({ runId: "design-run" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          requirementBaseline: createRequirementBaseline(),
          rules: [createRule({ relatedDiagrams: ["usecase", "prototype"] })],
          rulesVersion: 1,
          models: {
            usecase: useCaseModel,
            prototype: prototypeModel,
          },
          generatedDiagramTypes: ["usecase", "prototype"],
          diagramVersions: { usecase: 1, prototype: 1 },
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

    await userEvent.click(await screen.findByRole("button", { name: "选择界面关系图" }));
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /界面关系图/ })).toBeChecked();
    expect(screen.getByText("来源：需求阶段原型界面关系 + 设计阶段用例实现设计")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /生成设计模型/ }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(within(confirmation).getByText("设计依赖补齐")).toBeInTheDocument();
    expect(within(confirmation).getByText("用例实现设计")).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "确认生成" }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["sequence", "activity"],
          requestedDiagrams: ["activity"],
        }),
      );
    });
    const input = (startDesignRun.mock.calls[0] as unknown as [StartDesignRunInput] | undefined)?.[0];
    expect(input).not.toHaveProperty("requirementText");
    expect(input).not.toHaveProperty("rules");
    expect(input).toHaveProperty("requirementBaseline");
  });

  it("allows interface relation design and flags missing prototype source for auto-fill", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          requirementBaseline: createRequirementBaseline(),
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
    expect(screen.getByRole("checkbox", { name: /界面关系图/ })).toBeEnabled();
    expect(screen.getAllByText(/将自动补齐：原型界面关系/).length).toBeGreaterThan(0);
  });

  it("keeps design diagrams selectable when their prerequisite requirement models are missing", async () => {
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

    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    const [sequenceCheckbox, classDiagramCheckbox] = screen.getAllByRole("checkbox");
    expect(sequenceCheckbox).toBeEnabled();
    expect(classDiagramCheckbox).toBeEnabled();
    expect(classDiagramCheckbox).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "选择设计类图" }));
    expect(classDiagramCheckbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "取消选择设计类图" }));
    expect(classDiagramCheckbox).not.toBeChecked();
    expect(screen.getAllByText(/将自动补齐：领域概念模型/).length).toBeGreaterThan(0);
    expect(screen.getByText("0/5")).toBeInTheDocument();
    expect(screen.queryByText("0/1")).not.toBeInTheDocument();
  });

  it("keeps downstream design diagrams selectable when the use case prerequisite is missing", async () => {
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
    expect(sequenceCheckbox).toBeEnabled();
    expect(classDiagramCheckbox).toBeEnabled();
    expect(screen.getAllByText(/将自动补齐：用例模型/).length).toBeGreaterThan(0);
  });

  it("disables sequence generation when the use case model has no use cases", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: {
              ...useCaseModel,
              useCases: [],
            },
          },
          selectedDesignDiagramTypes: ["sequence"],
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
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).toBeDisabled();
    expect(
      screen.getAllByText("需求阶段用例模型没有可生成用例实现设计的用例").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /生成设计模型/ })).toBeDisabled();
  });

  it("blocks design generation when existing requirement model inputs are stale", async () => {
    const startRun = vi.fn();
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
      startRun,
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

    await screen.findByText("设计模型");
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).toBeDisabled();
    expect(
      screen.getAllByText(/已有需求阶段用例模型基于旧规则，请先回到需求页更新/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /生成设计模型/ })).toBeDisabled();
    expect(startRun).not.toHaveBeenCalled();
    expect(startDesignRun).not.toHaveBeenCalled();
  });

  it("shows a top-level blocker when existing use-case realization design no longer covers current use cases", async () => {
    const startDesignRun = vi.fn();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
            class: classModel,
          },
          selectedDesignDiagramTypes: ["class"],
          generatedDesignDiagramTypes: ["sequence", "class"],
          designModels: {
            "sequence:uc_old": {
              diagramKind: "sequence",
              modelId: "sequence:uc_old",
              sourceUseCaseId: "uc_old",
              sourceUseCaseName: "旧用例",
              title: "旧用例实现设计",
              summary: "旧动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "已生成设计类图",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
          designSvgArtifacts: {
            "sequence:uc_old": {
              diagramKind: "sequence",
              modelId: "sequence:uc_old",
              svg: "<svg><text>旧用例实现设计</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
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

    await screen.findByText("已生成设计模型");
    expect(screen.getByText("0/5")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /设计类图/ })).not.toBeChecked();
    const blocker = await screen.findByRole("alert");
    await waitFor(() => {
      expect(
        within(blocker).getByText("已有用例实现设计覆盖不足，请先手动更新用例实现设计"),
      ).toBeInTheDocument();
    });
    expect(
      within(blocker).getByRole("button", { name: "查看用例实现设计" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成设计模型/ })).toBeDisabled();
    expect(screen.getByText("已生成设计模型")).toBeInTheDocument();
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
          selectedDesignDiagramTypes: ["sequence"],
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            "sequence:uc_view": {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              sourceUseCaseId: "uc_view",
              sourceUseCaseName: "查看活动",
              title: "查看活动用例实现设计",
              summary: "查看活动动态行为",
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
              title: "创建活动用例实现设计",
              summary: "创建活动动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            "sequence:uc_view": {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              svg: "<svg><text>查看活动</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
            "sequence:uc_create": {
              diagramKind: "sequence",
              modelId: "sequence:uc_create",
              svg: "<svg><text>创建活动</text></svg>",
              renderMeta: { engine: "plantuml" },
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

    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    const sequenceCheckbox = await screen.findByRole("checkbox", {
      name: /用例实现设计/,
    });
    expect(sequenceCheckbox).not.toBeChecked();
    expect(screen.getByText("2 个用例实现设计")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看" }));

    expect(sequenceCheckbox).not.toBeChecked();
  });

  it("does not show confirmed auto-filled design traceability as pending repair records", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
          },
          selectedDesignDiagramTypes: ["sequence"],
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            "sequence:uc": {
              diagramKind: "sequence",
              modelId: "sequence:uc",
              sourceUseCaseId: "uc",
              sourceUseCaseName: "生成模型",
              title: "生成模型用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [
                {
                  id: "api",
                  name: "编排 API",
                  participantType: "service",
                },
              ],
              messages: [],
              fragments: [],
            },
          },
          designModelTraceability: [
            {
              source: {
                modelId: "sequence:uc",
                diagramKind: "sequence",
                elementId: "api",
                elementKind: "participant",
                label: "编排 API",
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: "uc",
                  elementKind: "usecase",
                  label: "生成模型",
                },
              ],
              mappingSource: "auto-filled-pending-review",
              reviewStatus: "confirmed",
              rationale: "设计元素缺少上游来源，AI 自动补齐到需求用例。",
            },
          ],
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

    await screen.findByText("需求阶段来源");
    expect(screen.queryByText("设计模型 AI 修复记录")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/设计元素缺少上游来源，系统自动补齐到需求用例/u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查看设计模型追踪证明/u }),
    ).not.toBeInTheDocument();
  });

  it("keeps table selection separate and confirms missing sequence and class dependencies", async () => {
    const snapshot: DesignRunSnapshot = {
      runId: "design-run-table",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence", "class", "table"],
      rules: [],
      requirementBaseline: createRequirementBaseline(),
      requirementModels: [useCaseModel, classModel],
      models: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      error: null,
    };
    const startDesignRun = vi.fn(async () => ({ runId: "design-run-table" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          requirementBaseline: createRequirementBaseline(),
          rules: [createRule({ relatedDiagrams: ["usecase", "class"] })],
          rulesVersion: 1,
          diagramVersions: { usecase: 1, class: 1 },
          generatedDiagramTypes: ["usecase", "class"],
          models: {
            usecase: useCaseModel,
            class: classModel,
          },
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

    await userEvent.click(await screen.findByRole("checkbox", { name: /数据库设计/ }));
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /设计类图/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /数据库设计/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /生成设计模型/ }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(within(confirmation).getByText("设计依赖补齐")).toBeInTheDocument();
    expect(within(confirmation).getByText("用例实现设计、设计类图")).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "确认生成" }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["sequence", "class", "table"],
          requestedDiagrams: ["table"],
        }),
      );
    });
    const input = (startDesignRun.mock.calls[0] as unknown as [StartDesignRunInput] | undefined)?.[0];
    expect(input).not.toHaveProperty("requirementText");
    expect(input).not.toHaveProperty("rules");
    expect(input).toHaveProperty("requirementBaseline");
  });
});
