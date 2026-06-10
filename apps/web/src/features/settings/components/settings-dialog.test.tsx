// Verifies the global settings dialog information architecture and managed-provider flow.
import { render, screen, waitFor } from "@testing-library/react";
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

const { toastSuccess, toastMessage } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastMessage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    message: toastMessage,
    error: vi.fn(),
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

describe("SettingsDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    toastSuccess.mockClear();
    toastMessage.mockClear();
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
        if (url.includes("/api/provider-configs/provider-user-comfly/test")) {
          return Response.json({ ok: true, message: "Provider config ok" });
        }
        if (url.includes("/api/provider-configs")) {
          return Response.json({
            providerConfigs: [
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
            ],
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
    expect(screen.getByText("个人配置 · comfly · https://ai.comfly.org · sk-...paid")).toBeInTheDocument();
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
    await user.click(screen.getByRole("combobox", { name: "托管 Provider 配置" }));
    expect(screen.getByText("系统级 SiliconFlow（系统配置）")).toBeInTheDocument();
    expect(screen.getByText("工作台偏好")).toBeInTheDocument();
    expect(screen.getByText("深色主题")).toBeInTheDocument();
    expect(screen.getByText("字号")).toBeInTheDocument();
    expect(screen.getByText("修改后自动重新生成规则")).toBeInTheDocument();
    expect(screen.getByText("显示过期模型横幅")).toBeInTheDocument();
    await user.keyboard("[Escape]");

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(toastSuccess).toHaveBeenCalledWith("设置已保存");
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toContain("provider-user-comfly");
  });

  it("tests the selected managed provider config through the API", async () => {
    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("用户级 Comfly（个人配置）")).toBeInTheDocument();
    vi.mocked(fetch).mockClear();
    await user.click(screen.getByRole("button", { name: "测试托管配置" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/provider-configs/provider-user-comfly/test"),
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith("Provider config ok");
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
