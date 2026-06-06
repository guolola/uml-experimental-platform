import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { TraceabilityMatrixPage } from "./traceability-matrix-page";

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  combobox: HTMLElement,
  optionName: string,
) {
  await user.click(combobox);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

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

const usecaseModel = {
  diagramKind: "usecase" as const,
  title: "用例模型",
  summary: "订单提交",
  notes: [],
  actors: [
    {
      id: "customer",
      name: "客户",
      actorType: "human" as const,
      responsibilities: ["提交订单"],
    },
  ],
  useCases: [
    {
      id: "submit-order",
      name: "提交订单",
      goal: "完成订单提交",
      preconditions: ["已登录"],
      postconditions: ["订单已创建"],
      primaryActorId: "customer",
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [],
  relationships: [],
};

const classModel = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "用户实体",
  notes: [],
  classes: [
    {
      id: "domain-user",
      name: "UserDomain",
      attributes: [],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [],
};

async function findMatrixTableByText(text: string) {
  const matches = await screen.findAllByText(text);
  const table = matches.map((match) => match.closest("table")).find(Boolean);
  expect(table).not.toBeNull();
  return table as HTMLTableElement;
}

describe("TraceabilityMatrixPage", () => {
  it("shows requirement model elements mapped to requirement rules", async () => {
    const user = userEvent.setup();
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: { usecase: usecaseModel },
        rules: [
          createRule({
            id: "r1",
            category: "业务规则",
            text: "用户必须登录后才能提交订单。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        requirementModelTraceability: [
          {
            ruleId: "r1",
            target: {
              diagramKind: "usecase",
              elementId: "submit-order",
              elementKind: "usecase",
              label: "提交订单",
            },
          },
        ],
      }),
    );

    render(
      withWorkspaceProviders(
        <TraceabilityMatrixPage mode="requirements" />,
        repository,
      ),
    );

    expect(await screen.findByText("需求跟踪矩阵")).toBeInTheDocument();
    expect(screen.getByText("需求元素映射")).toBeInTheDocument();

    const table = await findMatrixTableByText("提交订单");
    const row = within(table).getByText("提交订单").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("用例模型")).toBeInTheDocument();
    expect(within(row!).getByText("R1")).toBeInTheDocument();
    expect(within(row!).getByText("已映射")).toBeInTheDocument();
    await user.click(row!);
    expect(screen.getByText("R1 [业务规则] 用户必须登录后才能提交订单。")).toBeInTheDocument();
  });

  it("scopes analysis requirement matrices to source use case event flows", async () => {
    const user = userEvent.setup();
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase", "analysis"],
        rules: [
          createRule({
            id: "r1",
            category: "功能需求",
            text: "用户可以提交订单。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        models: {
          usecase: {
            ...usecaseModel,
            useCases: usecaseModel.useCases.map((useCase) =>
              useCase.id === "submit-order"
                ? {
                    ...useCase,
                    eventFlows: [
                      {
                        id: "flow-submit-main",
                        name: "提交订单主成功场景",
                        flowType: "main",
                        steps: [
                          {
                            order: 1,
                            actor: "actor",
                            actorAction: "填写订单信息",
                            systemAction: "校验订单并保存",
                          },
                        ],
                      },
                    ],
                  }
                : useCase,
            ),
          },
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
              { id: "order-system", name: "订单系统", participantType: "control" },
            ],
            messages: [
              {
                id: "msg-submit",
                sourceId: "customer",
                targetId: "order-system",
                type: "sync",
                name: "提交订单",
                parameters: [],
              },
            ],
            fragments: [],
          },
          "analysis:cancel-order": {
            diagramKind: "analysis",
            modelId: "analysis:cancel-order",
            sourceUseCaseId: "cancel-order",
            sourceUseCaseName: "取消订单",
            title: "取消订单需求分析模型",
            summary: "取消订单事件流",
            notes: [],
            participants: [
              { id: "cancel-system", name: "取消订单系统", participantType: "control" },
            ],
            messages: [],
            fragments: [],
          },
        },
        requirementModelTraceability: [
          {
            ruleId: "r1",
            target: {
              diagramKind: "usecase",
              elementId: "submit-order",
              elementKind: "usecase",
              label: "提交订单",
            },
          },
        ],
      }),
    );

    render(
      withWorkspaceProviders(
        <TraceabilityMatrixPage
          mode="requirements"
          scope={{
            diagramKind: "analysis",
            modelId: "analysis:submit-order",
            label: "提交订单",
          }}
        />,
        repository,
      ),
    );

    expect(await screen.findByText("跟踪矩阵 · 提交订单")).toBeInTheDocument();
    const table = await findMatrixTableByText("提交订单");
    expect(within(table).getByText("来源用例 / 事件流")).toBeInTheDocument();
    expect(within(table).queryByText("来源需求规则")).not.toBeInTheDocument();
    expect(within(table).queryByText("未关联需求规则")).not.toBeInTheDocument();
    expect(within(table).getByText("订单系统")).toBeInTheDocument();
    expect(within(table).queryByText("R1")).not.toBeInTheDocument();
    expect(within(table).queryByText("取消订单系统")).not.toBeInTheDocument();
    const row = within(table).getByText("客户").closest("tr");
    expect(row).not.toBeNull();
    await user.click(row!);
    expect(screen.getByText("来源用例：提交订单")).toBeInTheDocument();
    expect(screen.getByText("事件流：main · 提交订单主成功场景")).toBeInTheDocument();
    expect(screen.getByText("步骤 1：填写订单信息：系统响应：校验订单并保存")).toBeInTheDocument();
  });

  it("shows design elements mapped to requirement model elements and derived rules", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        rules: [
          createRule({
            id: "r2",
            category: "业务规则",
            text: "用户资料需要建模。",
            relatedDiagrams: ["class"],
          }),
        ],
        models: { class: classModel },
        requirementModelTraceability: [
          {
            ruleId: "r2",
            target: {
              diagramKind: "class",
              elementId: "domain-user",
              elementKind: "class",
              label: "UserDomain",
            },
          },
        ],
        generatedDesignDiagramTypes: ["class"],
        designModels: {
          "sequence:submit-order": {
            diagramKind: "sequence",
            modelId: "sequence:submit-order",
            sourceUseCaseId: "submit-order",
            sourceUseCaseName: "提交订单",
            title: "提交订单用例实现设计",
            summary: "订单提交时序",
            notes: [],
            participants: [
              { id: "auth-service", name: "认证服务", participantType: "control" },
            ],
            messages: [],
            fragments: [],
          },
          class: {
            diagramKind: "class",
            title: "设计类图",
            summary: "静态结构",
            notes: [],
            classes: [
              {
                id: "class-user-auth",
                name: "Class_UserAuth",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        designModelTraceability: [
          {
            source: {
              diagramKind: "class",
              elementId: "class-user-auth",
              elementKind: "class",
              label: "Class_UserAuth",
            },
            targets: [
              {
                diagramKind: "class",
                elementId: "domain-user",
                elementKind: "class",
                label: "UserDomain",
              },
            ],
            upstreamDesignRefs: [
              {
                modelId: "sequence:submit-order",
                diagramKind: "sequence",
                elementId: "auth-service",
                elementKind: "participant",
                label: "认证服务",
              },
            ],
          },
        ],
      }),
    );

    render(
      withWorkspaceProviders(<TraceabilityMatrixPage mode="design" />, repository),
    );

    expect(await screen.findByText("设计跟踪矩阵")).toBeInTheDocument();
    expect(screen.getByText("设计元素映射")).toBeInTheDocument();

    const table = await findMatrixTableByText("Class_UserAuth");
    const row = within(table).getByText("Class_UserAuth").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("UserDomain")).toBeInTheDocument();
    expect(within(row!).getByText("submit-order · 认证服务")).toBeInTheDocument();
    expect(within(row!).getByText("R2")).toBeInTheDocument();
    expect(within(row!).getByText("已映射")).toBeInTheDocument();
    await userEvent.click(row!);
    expect(screen.getByText("来源用例实现设计：sequence:submit-order / 认证服务")).toBeInTheDocument();
    expect(screen.getByText("需求元素：领域概念模型 / UserDomain")).toBeInTheDocument();
  });

  it("filters requirement rows by requirement model type", async () => {
    const user = userEvent.setup();
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase", "class"],
        models: { usecase: usecaseModel, class: classModel },
      }),
    );

    render(
      withWorkspaceProviders(
        <TraceabilityMatrixPage mode="requirements" />,
        repository,
      ),
    );

    const table = await findMatrixTableByText("提交订单");
    expect(within(table).getByText("提交订单")).toBeInTheDocument();
    expect(within(table).getByText("UserDomain")).toBeInTheDocument();

    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "按需求模型类型筛选" }),
      "领域概念模型",
    );

    expect(within(table).queryByText("提交订单")).not.toBeInTheDocument();
    expect(within(table).getByText("UserDomain")).toBeInTheDocument();
  });

  it("filters design rows by design model type", async () => {
    const user = userEvent.setup();
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence", "class"],
        designModels: {
          sequence: {
            diagramKind: "sequence",
            title: "用例实现设计",
            summary: "登录时序",
            notes: [],
            participants: [
              { id: "user", name: "用户", participantType: "actor" },
            ],
            messages: [],
            fragments: [],
          },
          class: {
            diagramKind: "class",
            title: "设计类图",
            summary: "静态结构",
            notes: [],
            classes: [
              {
                id: "class-user-auth",
                name: "Class_UserAuth",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(<TraceabilityMatrixPage mode="design" />, repository),
    );

    const table = await findMatrixTableByText("Class_UserAuth");
    expect(within(table).getByText("Class_UserAuth")).toBeInTheDocument();
    expect(within(table).getByText("用户")).toBeInTheDocument();

    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "按设计模型类型筛选" }),
      "设计类图",
    );

    expect(within(table).getByText("Class_UserAuth")).toBeInTheDocument();
    expect(within(table).queryByText("用户")).not.toBeInTheDocument();
  });

  it("paginates model element rows and resets pagination after page size changes", async () => {
    const user = userEvent.setup();
    const useCases = Array.from({ length: 9 }, (_, index) => ({
      id: `usecase-${index + 1}`,
      name: `用例 ${index + 1}`,
      goal: `目标 ${index + 1}`,
      preconditions: [],
      postconditions: [],
      supportingActorIds: [],
    }));
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: {
          usecase: {
            ...usecaseModel,
            actors: [],
            useCases,
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <TraceabilityMatrixPage mode="requirements" />,
        repository,
      ),
    );

    const table = await findMatrixTableByText("用例 1");
    expect(within(table).getByText("用例 1")).toBeInTheDocument();
    expect(within(table).queryByText("用例 9")).not.toBeInTheDocument();
    expect(screen.getByText("1-8 / 9")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(within(table).getByText("用例 9")).toBeInTheDocument();
    expect(screen.getByText("9-9 / 9")).toBeInTheDocument();

    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "每页矩阵项数量" }),
      "12",
    );
    expect(screen.getByText("1-9 / 9")).toBeInTheDocument();
  });

  it("explains legacy generated models that have no element-level traceability", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: { usecase: usecaseModel },
      }),
    );

    render(
      withWorkspaceProviders(
        <TraceabilityMatrixPage mode="requirements" />,
        repository,
      ),
    );

    expect(
      await screen.findByText("当前需求模型没有元素级映射数据"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/不会按模型类型粗略猜测元素和规则的关系/),
    ).not.toHaveLength(0);
  });

  it("marks matrices based on stale upstream requirement rules", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        rules: [createRule()],
        rulesVersion: 2,
        diagramVersions: { usecase: 1 },
        models: { usecase: usecaseModel },
        requirementModelTraceability: [
          {
            ruleId: "r1",
            target: {
              diagramKind: "usecase",
              elementId: "customer",
              elementKind: "actor",
              label: "客户",
            },
          },
          {
            ruleId: "r1",
            target: {
              diagramKind: "usecase",
              elementId: "submit-order",
              elementKind: "usecase",
              label: "提交订单",
            },
          },
        ],
      }),
    );

    render(
      withWorkspaceProviders(
        <TraceabilityMatrixPage mode="requirements" />,
        repository,
      ),
    );

    expect(await screen.findByText("跟踪矩阵基于旧上游生成")).toBeInTheDocument();
    expect(screen.getByText(/请重新生成需求模型/)).toBeInTheDocument();
    expect(screen.getByText(/覆盖完整性：/)).toHaveTextContent("需要重新生成");
  });

  it("shows an empty state when no matrix rows can be derived", async () => {
    render(
      withWorkspaceProviders(
        <TraceabilityMatrixPage mode="requirements" />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("暂无矩阵数据")).toBeInTheDocument();
    expect(screen.getByText("请先生成需求模型后再查看跟踪矩阵。")).toBeInTheDocument();
  });
});
