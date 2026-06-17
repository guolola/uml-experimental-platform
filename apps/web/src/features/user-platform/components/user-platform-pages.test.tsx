// Covers authenticated user-platform project drawers and settings behavior at the feature boundary.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import {
  loadUserSettings,
} from "../../../shared/lib/user-settings";
import {
  ProjectWorkspaceBanner,
  ProjectWorkspaceDrawer,
} from "./user-platform-pages";

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

describe("ProjectWorkspaceDrawer", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  function projectDrawerRepository(): WorkspaceRepository {
    return createRepository();
  }

  function stubProjectWorkspaceFetch({
    defaultProviderConfigId = "provider-long",
    providerConfigs = [{
      id: "provider-long",
      name: "goal-e2e comfly 20260524021222 managed provider with long name",
      provider: "openai-compatible",
      baseUrl: "https://provider.example",
      defaultModel: "gpt-5.5-preview-with-long-model-name",
      allowedModels: [
        "gpt-5.5-preview-with-long-model-name",
        "provider-native-long-model",
      ],
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
      scopeId: "project-with-very-long-drawer-values",
    }],
  } = {}) {
    const projectId = "project-with-very-long-drawer-values";
    const longName = "goal-e2e destructive 20260524021222 with extremely long project label";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === `/api/projects/${projectId}`) {
        if ((init?.method ?? "GET") === "PATCH") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return new Response(
            JSON.stringify({
              project: {
                id: projectId,
                name: body.name ?? longName,
                description: body.description ?? `${longName} local test project`,
                visibility: body.visibility ?? "private",
                status: "active",
                ownerUserId: "owner-user",
                defaultProviderConfigId: body.defaultProviderConfigId ?? null,
                retentionPolicy: "manual",
                updatedAt: "2026-05-24T00:00:00.000Z",
                memberCount: 3,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            project: {
              id: projectId,
              name: longName,
              description: `${longName} local test project`,
              visibility: "private",
              status: "active",
              ownerUserId: "owner-user",
              defaultProviderConfigId,
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
      if (url.pathname === `/api/projects/${projectId}/retention-policy`) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            project: {
              id: projectId,
              retentionPolicy: body.retentionPolicy ?? "manual",
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
            providerConfigs,
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

  it("counts active local generation tasks while server run polling is stale", async () => {
    const projectId = stubProjectWorkspaceFetch();

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceBanner
          projectId={projectId}
          activeGenerationTaskCount={2}
          onOpenDrawer={() => {}}
        />,
        projectDrawerRepository(),
      ),
    );

    expect(await screen.findByText("运行中 2")).toBeInTheDocument();
  });

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
    const modelPolicyValue = providerLabels.find(
      (label) => label.getAttribute("data-slot") === "select-value",
    );
    const modelPolicyTrigger = modelPolicyValue?.closest("button");
    expect(modelPolicyTrigger).toBeTruthy();
    expect(within(modelPolicyTrigger as HTMLElement).getAllByText(/goal-e2e comfly/u)).toHaveLength(1);
    const retentionValue = screen.getByText("手动归档", {
      selector: "[data-slot='select-value']",
    });
    const retentionTrigger = retentionValue.closest("button");
    expect(retentionTrigger).toBeTruthy();
    expect(within(retentionTrigger as HTMLElement).getAllByText("手动归档")).toHaveLength(1);
    expect(screen.queryByText(/openai-compatible/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/gpt-5\.5-preview-with-long-model-name/u)).not.toBeInTheDocument();
  });

  it("applies the saved project provider policy to local model settings", async () => {
    const user = userEvent.setup();
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

    expect(await screen.findAllByText(/goal-e2e comfly/u)).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "保存项目设置" }));

    expect(await screen.findByText("项目设置已保存。")).toBeInTheDocument();
    expect(loadUserSettings()).toMatchObject({
      providerConfigId: "provider-long",
      providerLabel: "OpenAI Compatible",
      providerModelOptions: [
        "gpt-5.5-preview-with-long-model-name",
        "provider-native-long-model",
      ],
      defaultModel: "gpt-5.5-preview-with-long-model-name",
    });
  });

  it("hides disabled project default providers and saves the user-default fallback", async () => {
    const user = userEvent.setup();
    const scopedProjectId = "project-with-very-long-drawer-values";
    const projectId = stubProjectWorkspaceFetch({
      defaultProviderConfigId: "provider-disabled",
      providerConfigs: [
        {
          id: "provider-disabled",
          name: "已禁用 OpenAI 托管配置",
          provider: "openai",
          baseUrl: "https://disabled-provider.example",
          defaultModel: "gpt-5-disabled",
          allowedModels: ["gpt-5-disabled"],
          maskedKey: "********disabled",
          keyPurpose: "disabled generation",
          status: "disabled",
          riskState: "medium",
          quota: "unlimited",
          createdBy: "admin@example.edu",
          createdAt: "2026-05-22T01:00:00.000Z",
          updatedAt: "2026-05-22T01:00:00.000Z",
          lastUsedAt: null,
          allowlisted: true,
          scopeType: "project",
          scopeId: scopedProjectId,
        },
        {
          id: "provider-active",
          name: "可用 OpenAI 托管配置",
          provider: "openai",
          baseUrl: "https://active-provider.example",
          defaultModel: "gpt-5-active",
          allowedModels: ["gpt-5-active"],
          maskedKey: "********active",
          keyPurpose: "active generation",
          status: "active",
          riskState: "low",
          quota: "unlimited",
          createdBy: "admin@example.edu",
          createdAt: "2026-05-22T01:00:00.000Z",
          updatedAt: "2026-05-22T01:00:00.000Z",
          lastUsedAt: null,
          allowlisted: true,
          scopeType: "project",
          scopeId: scopedProjectId,
        },
      ],
    });

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

    expect(
      await screen.findByText("当前项目默认 Provider 已不可用，保存后将跟随用户默认模型。"),
    ).toBeInTheDocument();
    const fallbackValue = screen.getByText("跟随用户默认模型", {
      selector: "[data-slot='select-value']",
    });
    expect(fallbackValue).toBeInTheDocument();
    expect(screen.queryByText("已禁用 OpenAI 托管配置")).not.toBeInTheDocument();

    await user.click(fallbackValue.closest("button") as HTMLElement);
    expect(await screen.findByText("可用 OpenAI 托管配置")).toBeInTheDocument();
    expect(screen.queryByText("已禁用 OpenAI 托管配置")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "保存项目设置" }));
    await screen.findByText("项目设置已保存。");

    const fetchMock = vi.mocked(fetch);
    const updateCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      return url.pathname === `/api/projects/${projectId}` && init?.method === "PATCH";
    });
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      defaultProviderConfigId: null,
    });
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
