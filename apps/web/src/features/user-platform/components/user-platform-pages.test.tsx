// Covers authenticated user-platform model settings behavior at the feature boundary.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import {
  loadUserSettings,
  USER_SETTINGS_STORAGE_KEY,
} from "../../../shared/lib/user-settings";
import { ModelSettingsPage, ProjectWorkspaceDrawer } from "./user-platform-pages";

function createRepository(): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
    updateRequirementText: vi.fn(async () => {}),
    startRun: vi.fn(),
    subscribeToRun: vi.fn(),
    getRunSnapshot: vi.fn(),
    renderPlantUml: vi.fn(),
    testProviderSettings: vi.fn(async () => ({
      ok: true,
      message: "ok",
      capability: {
        supportsJsonSchema: true,
        modeLabel: "严格结构化",
      },
    })),
    saveRunHistory: vi.fn(),
    listRunHistory: vi.fn(async () => []),
    restoreRunHistory: vi.fn(async () => null),
    deleteRunHistory: vi.fn(async () => []),
    clearRunHistory: vi.fn(async () => {}),
  };
}

function seedLocalLegacySettings() {
  localStorage.setItem(
    USER_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      providerConfigId: "",
      apiBaseUrl: "https://legacy.example/v1/chat/completions",
      apiKey: "sk-legacy-local",
      defaultModel: "gpt-5.5",
      imageModel: "gpt-image-2",
      fontSize: "md",
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

describe("ModelSettingsPage", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    seedLocalLegacySettings();
  });

  it("loads managed provider configs from the non-admin API and saves only providerConfigId plus model", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/provider-configs" && (init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({
            providerConfigs: [
              {
                id: "managed-openai",
                name: "课程 OpenAI 托管配置",
                provider: "openai",
                baseUrl: "https://api.openai.example",
                defaultModel: "gpt-5.5",
                allowedModels: ["gpt-5.5"],
                maskedKey: "********a91f",
                keyPurpose: "course generation",
                status: "active",
                riskState: "low",
                quota: "unlimited",
                createdBy: "admin@example.edu",
                createdAt: "2026-05-22T01:00:00.000Z",
                updatedAt: "2026-05-22T01:00:00.000Z",
                lastUsedAt: null,
                allowlisted: true,
                scopeType: "user",
                scopeId: "user-goal-e2e",
                breakerState: "closed",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(withWorkspaceProviders(<ModelSettingsPage onNavigate={() => {}} />, createRepository()));

    expect(await screen.findByText("课程 OpenAI 托管配置")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/provider-configs"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/provider-configs"),
      expect.anything(),
    );
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存模型设置" }));

    expect(await screen.findByText("模型配置已保存。")).toBeInTheDocument();
    expect(loadUserSettings()).toMatchObject({
      providerConfigId: "managed-openai",
      defaultModel: "gpt-5.5",
    });
    expect(loadUserSettings()).not.toHaveProperty("apiBaseUrl");
    expect(loadUserSettings()).not.toHaveProperty("apiKey");
  });

  it("shows clear auth errors without falling back to admin provider mocks", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/provider-configs") {
        return new Response(
          JSON.stringify({ message: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === "/api/admin/provider-configs") {
        return new Response(
          JSON.stringify({ providerConfigs: [{ id: "admin-mock" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(withWorkspaceProviders(<ModelSettingsPage onNavigate={() => {}} />, createRepository()));

    expect(
      await screen.findByText("需要登录后加载托管 Provider 配置。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /legacy\/dev 备选/ })).not.toBeInTheDocument();
    expect(screen.queryByText("admin-mock")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/provider-configs"),
        expect.anything(),
      );
    });
  });

});

describe("ProjectWorkspaceDrawer", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  function projectDrawerRepository(): WorkspaceRepository {
    return createRepository();
  }

  function stubProjectWorkspaceFetch() {
    const projectId = "project-with-very-long-drawer-values";
    const longName = "goal-e2e destructive 20260524021222 with extremely long project label";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === `/api/projects/${projectId}`) {
        return new Response(
          JSON.stringify({
            project: {
              id: projectId,
              name: longName,
              description: `${longName} local test project`,
              visibility: "private",
              status: "active",
              ownerUserId: "owner-user",
              defaultProviderConfigId: "provider-long",
              retentionPolicy: "manual",
              updatedAt: "2026-05-24T00:00:00.000Z",
              memberCount: 3,
            },
            membership: {
              id: "owner-member",
              projectId,
              userId: "owner-user",
              email: "frontend_owner.goal-e2e.20260524021222@example.test",
              displayName: "frontend_owner goal-e2e 20260524021222 extremely long name",
              role: "owner",
              status: "active",
              joinedAt: "2026-05-24T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === `/api/projects/${projectId}/members`) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "owner-member",
                projectId,
                userId: "owner-user",
                email: "frontend_owner.goal-e2e.20260524021222@example.test",
                displayName: "frontend_owner goal-e2e 20260524021222 extremely long name",
                role: "owner",
                status: "active",
                joinedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === `/api/projects/${projectId}/runs`) {
        return new Response(JSON.stringify({ projectId, runs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === `/api/projects/${projectId}/documents`) {
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === `/api/projects/${projectId}/provider-configs`) {
        return new Response(
          JSON.stringify({
            projectId,
            providerConfigs: [
              {
                id: "provider-long",
                name: "goal-e2e comfly 20260524021222 managed provider with long name",
                provider: "openai-compatible",
                baseUrl: "https://provider.example",
                defaultModel: "gpt-5.5-preview-with-long-model-name",
                maskedKey: "********a91f",
                keyPurpose: "course generation",
                status: "active",
                riskState: "low",
                quota: "unlimited",
                createdBy: "admin@example.edu",
                createdAt: "2026-05-22T01:00:00.000Z",
                updatedAt: "2026-05-22T01:00:00.000Z",
                lastUsedAt: null,
                allowlisted: true,
                scopeType: "project",
                scopeId: projectId,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return projectId;
  }

  it("constrains settings drawer content so long project and model text cannot overflow horizontally", async () => {
    const projectId = stubProjectWorkspaceFetch();

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="settings"
          onClose={() => {}}
        />,
        projectDrawerRepository(),
      ),
    );

    const drawer = await screen.findByTestId("project-workspace-drawer");
    const body = await screen.findByTestId("project-workspace-drawer-body");
    expect(drawer).toHaveClass("overflow-x-hidden");
    expect(body).toHaveClass("overflow-x-hidden", "min-w-0");
    const providerLabels = await screen.findAllByText(/goal-e2e comfly/u);
    expect(providerLabels.some((label) => label.classList.contains("truncate"))).toBe(true);
  });

  it("constrains member drawer cards and truncates long member identity text", async () => {
    const projectId = stubProjectWorkspaceFetch();

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="members"
          onClose={() => {}}
        />,
        projectDrawerRepository(),
      ),
    );

    const body = await screen.findByTestId("project-workspace-drawer-body");
    expect(body).toHaveClass("overflow-x-hidden", "min-w-0");
    const displayName = await screen.findByText(/frontend_owner goal-e2e/u);
    expect(displayName).toHaveClass("truncate");
    expect(displayName.closest("[data-testid='project-member-card']")).toHaveClass(
      "max-w-full",
      "min-w-0",
    );
  });
});
