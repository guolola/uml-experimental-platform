import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import {
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { useWorkspaceShell } from "../state";
import { MobileWorkspaceNavigation } from "./mobile-workspace-navigation";

function createRepository(
  workspace: WorkspaceRecord = createWorkspaceRecord(),
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

function Harness() {
  const { selection } = useWorkspaceShell();
  return (
    <>
      <div data-testid="active-selection">{selection.label}</div>
      <MobileWorkspaceNavigation />
    </>
  );
}

describe("MobileWorkspaceNavigation", () => {
  it("switches primary workspace stages from the bottom navigation", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<Harness />, createRepository()));

    const stageNavigation = screen.getByRole("navigation", { name: "工作台阶段" });
    expect(stageNavigation).toBeInTheDocument();
    expect(
      within(stageNavigation)
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter(Boolean),
    ).toEqual(["系统需求", "可行性", "需求模型", "设计模型", "代码", "测试", "说明书"]);
    expect(screen.getByRole("button", { name: "系统需求" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("button", { name: "设计模型" }));
    expect(screen.getByTestId("active-selection")).toHaveTextContent("设计模型");

    await user.click(screen.getByRole("button", { name: "代码" }));
    expect(screen.getByTestId("active-selection")).toHaveTextContent("代码");
  });

  it("opens the project navigation drawer for model tree access", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<Harness />, createRepository()));

    await user.click(screen.getByRole("button", { name: "打开项目导航" }));

    expect(await screen.findByRole("dialog", { name: "项目导航" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "项目导航" })).toBeInTheDocument();
  });

  it("closes the project navigation drawer after selecting a navigation item", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<Harness />, createRepository()));

    await user.click(screen.getByRole("button", { name: "打开项目导航" }));

    const dialog = await screen.findByRole("dialog", { name: "项目导航" });
    const drawerNavigation = within(dialog).getByRole("navigation", {
      name: "项目导航",
    });
    await user.click(within(drawerNavigation).getByRole("button", { name: "说明书" }));

    expect(screen.getByTestId("active-selection")).toHaveTextContent("说明书");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "项目导航" })).not.toBeInTheDocument();
    });
  });

  it("keeps the project navigation drawer open when expanding a group", async () => {
    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <Harness />,
        createRepository(
          createWorkspaceRecord({
            generatedDesignDiagramTypes: ["sequence"],
            designModels: {
              sequence: {
                diagramKind: "sequence",
                title: "用例实现设计",
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
                svg: "<svg><text>用例实现设计</text></svg>",
                renderMeta: { engine: "plantuml" },
              },
            },
          }),
        ),
      ),
    );

    await user.click(screen.getByRole("button", { name: "打开项目导航" }));

    const dialog = await screen.findByRole("dialog", { name: "项目导航" });
    const drawerNavigation = within(dialog).getByRole("navigation", {
      name: "项目导航",
    });
    await user.click(await within(drawerNavigation).findByRole("button", { name: "展开 设计模型" }));

    expect(screen.getByRole("dialog", { name: "项目导航" })).toBeInTheDocument();
  });
});
