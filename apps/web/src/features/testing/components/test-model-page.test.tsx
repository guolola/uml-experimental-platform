// Verifies black-box test generation stays compatible with historical use case models.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UseCaseDiagramSpec } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { TestModelPage } from "./test-model-page";

function createRepository(record = createWorkspaceRecord()): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(async () => record),
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

describe("TestModelPage", () => {
  it("generates fallback black-box cases for old use cases without event flows", async () => {
    const legacyUseCaseModel = {
      diagramKind: "usecase",
      title: "图书馆用例模型",
      summary: "旧历史模型未携带 eventFlows 字段。",
      notes: [],
      actors: [{ id: "actor_admin", name: "图书管理员", actorType: "human", responsibilities: [] }],
      useCases: [
        {
          id: "uc_borrow",
          name: "借出图书",
          goal: "完成读者借书登记",
          preconditions: ["目标图书可借阅"],
          postconditions: ["生成借阅记录"],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    } as unknown as UseCaseDiagramSpec;
    const repository = createRepository(
      createWorkspaceRecord({
        rules: [
          createRule({
            id: "r1",
            category: "功能需求",
            text: "系统应支持图书借阅功能，允许读者从图书馆借出图书。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        models: { usecase: legacyUseCaseModel },
      }),
    );

    render(withWorkspaceProviders(<TestModelPage />, repository));

    const statsGrid = await screen.findByTestId("test-summary-grid");
    expect(statsGrid).toHaveClass("grid-cols-4", "gap-2");
    expect(statsGrid.closest("[data-scale-to-fit]")).toBeNull();

    const user = userEvent.setup();
    const generateButton = await screen.findByRole("button", { name: "生成测试用例" });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);

    expect(
      await screen.findByText("借出图书 - 正常流程 - 主事件流"),
    ).toBeInTheDocument();
    expect(screen.getByText("tc-uc_borrow-uc_borrow-main")).toBeInTheDocument();
    expect(screen.getByText("生成借阅记录")).toBeInTheDocument();
  });
});
