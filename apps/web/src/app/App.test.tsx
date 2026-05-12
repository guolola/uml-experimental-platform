import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../services/workspace-repository";
import { createWorkspaceRecord, withWorkspaceProviders } from "../test/workspace-test-utils";
import { Shell } from "./App";

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

describe("App shell routes", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the workspace only on the home route with a narrower sidebar", async () => {
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByText("项目导航")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭 需求" })).toBeInTheDocument();

    const sidebarPanel = screen.getByTestId("workspace-sidebar-panel");
    expect(sidebarPanel).toHaveAttribute("data-default-size", "12");
    expect(sidebarPanel).toHaveAttribute("data-min-size", "10");
    expect(sidebarPanel).toHaveAttribute("data-max-size", "22");
  });

  it("navigates top-level pages without opening workspace tabs", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<Shell />, createRepository()));
    const banner = await screen.findByRole("banner");

    await user.click(within(banner).getByRole("button", { name: "考试" }));

    expect(window.location.pathname).toBe("/exam");
    expect(screen.getByRole("heading", { name: "考试" })).toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 考试" })).not.toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "首页" }));

    expect(window.location.pathname).toBe("/");
    expect(await screen.findByText("项目导航")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭 需求" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 首页" })).not.toBeInTheDocument();
  });

  it("syncs route state on browser popstate", async () => {
    render(withWorkspaceProviders(<Shell />, createRepository()));
    expect(await screen.findByText("项目导航")).toBeInTheDocument();

    window.history.pushState({}, "", "/about");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "关于" })).toBeInTheDocument();
    });
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });
});
