// Verifies the global settings dialog information architecture and managed-provider flow.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { USER_SETTINGS_STORAGE_KEY } from "../../../shared/lib/user-settings";
import {
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { GlobalSettingsPanel } from "./global-settings-panel";
import { SettingsDialog } from "./settings-dialog";

const { toastSuccess, toastMessage, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastMessage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    message: toastMessage,
    error: toastError,
  },
}));

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

function createProviderDiscoveryStream(modelId = "gpt-5.4") {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const events = [
        {
          type: "started",
          sourceBaseUrl: "https://api.nonelinear.com",
        },
        {
          type: "models_listed",
          rawCount: 1,
        },
        {
          type: "name_filtered",
          rawCount: 1,
          candidateCount: 1,
          excludedByNameCount: 0,
        },
        {
          type: "probe_started",
          modelId,
          index: 1,
          total: 1,
          stage: "strict_json",
        },
        {
          type: "probe_completed",
          modelId,
          index: 1,
          total: 1,
          probeStatus: "strict",
          structuredOutputMode: "strict_json",
          strictJson: true,
          supportsJsonSchema: true,
          supportsJsonObject: true,
        },
        {
          type: "completed",
          result: {
            models: [
              {
                id: modelId,
                object: "model",
                category: "text_chat",
                structuredOutputMode: "strict_json",
                supportsJsonSchema: true,
                supportsJsonObject: true,
                strictJson: true,
                modeLabel: "严格 JSON",
                probeStatus: "strict",
                probedAt: "2026-06-23T08:00:00.000Z",
              },
            ],
            fetchedAt: "2026-06-23T08:00:00.000Z",
            sourceBaseUrl: "https://api.nonelinear.com",
            summary: {
              rawCount: 1,
              excludedByNameCount: 0,
              chatProbeFailedCount: 0,
              chatProbeUnknownCount: 0,
              strictCount: 1,
              jsonObjectCount: 0,
              compatibleCount: 0,
              unknownStrictCount: 0,
            },
          },
        },
      ];
      events.forEach((event) => {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      });
      controller.close();
    },
  });
}

describe("SettingsDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    toastSuccess.mockClear();
    toastMessage.mockClear();
    toastError.mockClear();
    let providerConfigs = [
      {
        id: "provider-system-siliconflow",
        name: "系统级 SiliconFlow",
        provider: "siliconflow",
        baseUrl: "https://api.siliconflow.cn",
        defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
        allowedModels: ["deepseek-ai/DeepSeek-V4-Pro"],
        maskedKey: "sk-...free",
        status: "active",
        riskState: "medium",
        quota: "free-tier",
        lastUsedAt: null,
        scopeType: "system",
        scopeId: null,
        breakerState: "closed",
      },
      {
        id: "provider-user-comfly",
        name: "用户级 Comfly",
        provider: "comfly",
        baseUrl: "https://ai.comfly.org",
        defaultModel: "gpt-5.4",
        allowedModels: ["gpt-5.4"],
        maskedKey: "sk-...paid",
        status: "active",
        riskState: "low",
        quota: "paid-user",
        lastUsedAt: null,
        scopeType: "user",
        scopeId: "user-1",
        breakerState: "closed",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method?.toUpperCase() ?? "GET";
        if (url.includes("/api/auth/me")) {
          return Response.json({
            user: {
              id: "user-1",
              email: "user@example.edu",
              name: "UML User",
              role: "student",
              emailVerified: true,
            },
          });
        }
        if (url.includes("/api/provider-configs/discover-models/stream")) {
          return new Response(createProviderDiscoveryStream(), {
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        if (url.includes("/api/provider-configs/discover-models")) {
          return Response.json({
            models: [
              {
                id: "gpt-5.4",
                object: "model",
                category: "text_chat",
                structuredOutputMode: "strict_json",
                supportsJsonSchema: true,
                supportsJsonObject: true,
                strictJson: true,
                modeLabel: "严格 JSON",
                probeStatus: "strict",
                probedAt: "2026-06-23T08:00:00.000Z",
              },
            ],
            fetchedAt: "2026-06-23T08:00:00.000Z",
            sourceBaseUrl: "https://api.nonelinear.com",
            summary: {
              rawCount: 1,
              excludedByNameCount: 0,
              chatProbeFailedCount: 0,
              chatProbeUnknownCount: 0,
              strictCount: 1,
              jsonObjectCount: 0,
              compatibleCount: 0,
              unknownStrictCount: 0,
            },
          });
        }
        if (url.includes("/api/provider-configs/test-temporary")) {
          return Response.json({ ok: true, message: "Provider connection ok" });
        }
        if (url.includes("/api/billing/summary")) {
          return Response.json({
            creditBalance: 42,
            signupBonus: {
              granted: true,
              creditAmount: 10,
              validUntil: "2026-07-05T04:00:00.000Z",
            },
            recentOrders: [],
          });
        }
        if (url.endsWith("/api/provider-configs") && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            name: string;
            baseUrl: string;
            defaultModel: string;
            allowedModels: string[];
          };
          const created = {
            id: "provider-user-new",
            name: body.name,
            provider: "openai-compatible",
            baseUrl: body.baseUrl,
            defaultModel: body.defaultModel,
            allowedModels: body.allowedModels,
            maskedKey: "sk-...cret",
            status: "active",
            riskState: "medium",
            quota: "user-managed",
            lastUsedAt: null,
            scopeType: "user",
            scopeId: "user-1",
            breakerState: "closed",
          };
          providerConfigs = [created, ...providerConfigs];
          return Response.json(created, { status: 201 });
        }
        if (url.includes("/api/provider-configs/provider-user-comfly") && method === "PATCH") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            name?: string;
            baseUrl?: string;
            defaultModel?: string;
            allowedModels?: string[];
          };
          providerConfigs = providerConfigs.map((config) =>
            config.id === "provider-user-comfly"
              ? {
                  ...config,
                  name: body.name ?? config.name,
                  baseUrl: body.baseUrl ?? config.baseUrl,
                  defaultModel: body.defaultModel ?? config.defaultModel,
                  allowedModels: body.allowedModels ?? config.allowedModels,
                }
              : config,
          );
          return Response.json(
            providerConfigs.find((config) => config.id === "provider-user-comfly"),
          );
        }
        if (url.includes("/api/provider-configs/provider-user-comfly/revoke")) {
          providerConfigs = providerConfigs.map((config) =>
            config.id === "provider-user-comfly"
              ? { ...config, status: "revoked" }
              : config,
          );
          return Response.json(
            providerConfigs.find((config) => config.id === "provider-user-comfly"),
          );
        }
        if (url.includes("/api/provider-configs/provider-user-comfly/test")) {
          return Response.json({ ok: true, message: "Provider config ok" });
        }
        if (url.includes("/api/provider-configs")) {
          return Response.json({
            providerConfigs,
          });
        }
        return Response.json({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows model and preference controls on one page without tabs or removed copy", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<SettingsDialog />, createRepository()));

    await user.click(screen.getByRole("button", { name: "全局设置" }));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "模型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "偏好" })).not.toBeInTheDocument();
    expect(screen.getAllByText("模型托管配置").length).toBeGreaterThan(0);
    expect(screen.getByText("默认模型")).toBeInTheDocument();
    expect(screen.getByText("工作台偏好")).toBeInTheDocument();
    expect(screen.getByText("深色主题")).toBeInTheDocument();
    expect(screen.getByText("字号")).toBeInTheDocument();
    expect(screen.getByText("修改后自动重新生成规则")).toBeInTheDocument();
    expect(screen.getByText("显示过期模型横幅")).toBeInTheDocument();
    expect(
      screen.queryByText("模型托管配置和工作台偏好集中在这里；登录态不会把明文密钥作为主路径保存。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("登录态必须使用服务端托管 Provider；明文 API Key 只允许显式 dev legacy 模式。"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("用户级 Comfly（个人配置）")).toBeInTheDocument();
    expect(
      screen.queryByText("个人配置 · comfly · https://ai.comfly.org · sk-...paid"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("这里只能选择管理员在该托管配置中允许的模型。"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("loads and saves the embedded global settings panel", async () => {
    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("用户级 Comfly（个人配置）")).toBeInTheDocument();
    expect(await screen.findByText("个人供应商不消耗平台权益次数")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "托管 Provider 配置" }));
    expect(screen.getByText("系统级 SiliconFlow（系统配置）")).toBeInTheDocument();
    expect(screen.getByText("工作台偏好")).toBeInTheDocument();
    expect(screen.getByText("深色主题")).toBeInTheDocument();
    expect(screen.getByText("字号")).toBeInTheDocument();
    expect(screen.getByText("修改后自动重新生成规则")).toBeInTheDocument();
    expect(screen.getByText("显示过期模型横幅")).toBeInTheDocument();
    await user.keyboard("[Escape]");
    await user.click(screen.getByRole("combobox", { name: "托管 Provider 配置" }));
    await user.click(screen.getByText("系统级 SiliconFlow（系统配置）"));
    expect(await screen.findByText("剩余：42 次")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(toastSuccess).toHaveBeenCalledWith("设置已保存");
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toContain("provider-system-siliconflow");
  });

  it("adds a private provider after discovery and temporary testing", async () => {
    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("用户级 Comfly（个人配置）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加供应商" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "测试托管配置" })).not.toBeInTheDocument();
    vi.mocked(fetch).mockClear();
    await user.click(screen.getByRole("button", { name: "添加供应商" }));

    const dialog = await screen.findByRole("dialog", { name: "添加供应商" });
    const dialogScope = within(dialog);
    const testButton = dialogScope.getByRole("button", { name: "测试托管配置" });
    const submitButton = dialogScope.getByRole("button", { name: "添加供应商" });
    expect(testButton).toBeDisabled();
    expect(submitButton).toBeDisabled();

    await user.type(dialogScope.getByLabelText("名称"), "我的 Nonelinear");
    await user.type(
      dialogScope.getByLabelText("Base URL"),
      "https://api.nonelinear.com",
    );
    await user.type(dialogScope.getByLabelText("API Key"), "sk-new-secret");
    await user.click(dialogScope.getByRole("button", { name: "获取模型列表" }));

    await waitFor(() => {
      expect(
        dialogScope.getByRole("combobox", { name: "供应商默认模型" }),
      ).toHaveTextContent("gpt-5.4");
    });
    expect(dialogScope.getByRole("progressbar", { name: "获取模型列表进度" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(dialogScope.getByText("已获取 1 个可用模型")).toBeInTheDocument();
    expect(testButton).toBeEnabled();
    expect(submitButton).toBeDisabled();

    await user.click(testButton);

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Provider connection ok");
    });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "供应商已添加并选中，点击保存后作为默认配置",
      );
    });
    expect(await screen.findByText("我的 Nonelinear（个人配置）")).toBeInTheDocument();
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY) ?? "").not.toContain(
      "sk-new-secret",
    );
    const createCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/api/provider-configs") &&
          init?.method === "POST",
      );
    expect(createCall?.[1]?.body).toContain('"allowedModels":["gpt-5.4"]');
  });

  it("invalidates the add-provider test state when Base URL changes", async () => {
    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("用户级 Comfly（个人配置）")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加供应商" }));
    const dialog = await screen.findByRole("dialog", { name: "添加供应商" });
    const dialogScope = within(dialog);
    const testButton = dialogScope.getByRole("button", { name: "测试托管配置" });
    const submitButton = dialogScope.getByRole("button", { name: "添加供应商" });

    await user.type(dialogScope.getByLabelText("名称"), "我的 Nonelinear");
    await user.type(
      dialogScope.getByLabelText("Base URL"),
      "https://api.nonelinear.com",
    );
    await user.type(dialogScope.getByLabelText("API Key"), "sk-new-secret");
    await user.click(dialogScope.getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => expect(testButton).toBeEnabled());
    await user.click(testButton);
    await waitFor(() => expect(submitButton).toBeEnabled());

    await user.clear(dialogScope.getByLabelText("Base URL"));
    await user.type(
      dialogScope.getByLabelText("Base URL"),
      "https://api.changed.example",
    );

    expect(testButton).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it("edits an owned provider after rediscovering and testing models", async () => {
    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("用户级 Comfly（个人配置）")).toBeInTheDocument();
    vi.mocked(fetch).mockClear();
    await user.click(screen.getByRole("button", { name: "编辑" }));

    const dialog = await screen.findByRole("dialog", { name: "编辑供应商" });
    const dialogScope = within(dialog);
    await user.clear(dialogScope.getByLabelText("名称"));
    await user.type(dialogScope.getByLabelText("名称"), "用户级 Comfly 更新");
    await user.clear(dialogScope.getByLabelText("Base URL"));
    await user.type(
      dialogScope.getByLabelText("Base URL"),
      "https://api.nonelinear.com",
    );
    await user.type(dialogScope.getByLabelText("API Key"), "sk-edited-secret");
    expect(dialogScope.getByRole("button", { name: "保存供应商" })).toBeDisabled();

    await user.click(dialogScope.getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => {
      expect(
        dialogScope.getByRole("combobox", { name: "供应商默认模型" }),
      ).toHaveTextContent("gpt-5.4");
    });
    await user.click(dialogScope.getByRole("button", { name: "测试托管配置" }));
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Provider connection ok");
    });

    await user.click(dialogScope.getByRole("button", { name: "保存供应商" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("供应商已更新");
    });
    expect(await screen.findByText("用户级 Comfly 更新（个人配置）")).toBeInTheDocument();
    const updateCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).includes("/api/provider-configs/provider-user-comfly") &&
          init?.method === "PATCH",
      );
    expect(updateCall?.[1]?.body).toContain('"apiKey":"sk-edited-secret"');
    expect(updateCall?.[1]?.body).toContain('"allowedModels":["gpt-5.4"]');
  });

  it("revokes an owned provider and falls back to the next active provider", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("用户级 Comfly（个人配置）")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("供应商已删除");
    });
    expect(screen.queryByText("用户级 Comfly（个人配置）")).not.toBeInTheDocument();
    expect(await screen.findByText("系统级 SiliconFlow（系统配置）")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("requires a managed provider before choosing or saving the default model", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return Response.json({
            user: {
              id: "user-1",
              email: "user@example.edu",
              name: "UML User",
              role: "student",
              emailVerified: true,
            },
          });
        }
        if (url.includes("/api/provider-configs")) {
          return Response.json({ providerConfigs: [] });
        }
        return Response.json({});
      }),
    );

    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("暂无可用托管 Provider 配置。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加供应商" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "托管 Provider 配置" })).toHaveTextContent(
      "暂无可用托管 Provider 配置",
    );
    expect(screen.queryByRole("textbox", { name: "默认模型" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "默认模型" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(toastError).toHaveBeenCalledWith("登录态必须选择托管 Provider 配置");
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toContain(
      '"providerConfigId":""',
    );
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toContain(
      '"providerModelOptions":[]',
    );
  });

  it("shows the embedded login prompt when global settings cannot verify auth", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return Response.json({ message: "unauthorized" }, { status: 401 });
        }
        return Response.json({});
      }),
    );

    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active onNavigate={onNavigate} />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("请先登录。未登录时不能使用模型配置、工作台偏好或其他平台功能。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "前往登录" }));

    expect(onNavigate).toHaveBeenCalledWith("/login");
  });
});
