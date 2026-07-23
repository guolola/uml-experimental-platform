import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { useWorkspaceShell } from "../state";
import { WorkspaceTabsBar } from "./workspace-tabs-bar";

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

function stubCompactViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

function TabsHarness() {
  const { openDiagram, openDesignHome, openWorkspacePlaceholder } =
    useWorkspaceShell();

  return (
    <>
      <div>
        <button type="button" onClick={() => openDiagram("usecase")}>
          open usecase
        </button>
        <button type="button" onClick={() => openDesignHome()}>
          open design
        </button>
        <button type="button" onClick={() => openWorkspacePlaceholder("code", "代码")}>
          open code
        </button>
      </div>
      <WorkspaceTabsBar />
    </>
  );
}

describe("WorkspaceTabsBar", () => {
  it("renders fixed-width scrollable tabs plus the actions menu on mobile viewports", async () => {
    stubCompactViewport(true);
    render(withWorkspaceProviders(<TabsHarness />, createRepository()));

    await userEvent.click(screen.getByRole("button", { name: "open usecase" }));
    await userEvent.click(screen.getByRole("button", { name: "open design" }));

    const tabStrip = screen.getByTestId("workspace-mobile-tab-strip");
    expect(tabStrip).toHaveClass("overflow-x-auto");
    expect(within(tabStrip).getByRole("button", { name: "系统需求" })).toBeInTheDocument();
    expect(within(tabStrip).getByRole("button", { name: "用例模型" })).toBeInTheDocument();
    expect(within(tabStrip).getByRole("button", { name: "设计模型" })).toBeInTheDocument();
    expect(tabStrip.querySelectorAll(".w-28").length).toBeGreaterThanOrEqual(3);

    await userEvent.click(screen.getByRole("button", { name: "标签页操作" }));

    expect(screen.getByText("打开的标签")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem", { name: /需求/u }).length).toBeGreaterThan(0);
    expect(screen.getByRole("menuitem", { name: /用例模型/u })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem", { name: /设计/u }).length).toBeGreaterThan(0);
  });

  it("offers batch tab actions and can keep only the active tab", async () => {
    stubCompactViewport(false);
    render(withWorkspaceProviders(<TabsHarness />, createRepository()));

    await userEvent.click(screen.getByRole("button", { name: "open usecase" }));
    await userEvent.click(screen.getByRole("button", { name: "open design" }));
    await userEvent.click(screen.getByRole("button", { name: "open code" }));

    expect(screen.getByRole("button", { name: "系统需求" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "用例模型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设计模型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "代码" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "标签页操作" }));
    await userEvent.click(screen.getByText("关闭其他标签"));

    expect(screen.queryByRole("button", { name: "系统需求" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "用例模型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "设计模型" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "代码" })).toBeInTheDocument();
  });
});
