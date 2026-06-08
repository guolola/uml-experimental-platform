import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { useWorkspaceShell } from "../state";
import { MobileWorkspaceNavigation } from "./mobile-workspace-navigation";

function createRepository(): WorkspaceRepository {
  return {
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
    ).toEqual(["需求", "设计", "代码", "测试", "说明书"]);
    expect(screen.getByRole("button", { name: "需求" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("button", { name: "设计" }));
    expect(screen.getByTestId("active-selection")).toHaveTextContent("设计");

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
});
