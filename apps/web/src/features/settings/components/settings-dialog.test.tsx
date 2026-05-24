// Verifies the global settings dialog information architecture and managed-provider flow.
import { render, screen } from "@testing-library/react";
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
        if (url.includes("/api/provider-configs")) {
          return Response.json({
            providerConfigs: [
              {
                id: "provider-config-1",
                name: "课程 OpenAI 托管配置",
                provider: "openai",
                baseUrl: "https://api.openai.com/v1",
                maskedKey: "sk-***",
                defaultModel: "gpt-5.5",
                status: "active",
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
    expect(await screen.findByText("课程 OpenAI 托管配置")).toBeInTheDocument();
  });

  it("loads and saves the embedded global settings panel", async () => {
    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <GlobalSettingsPanel active />,
        createRepository(),
      ),
    );

    expect(await screen.findByText("课程 OpenAI 托管配置")).toBeInTheDocument();
    expect(screen.getByText("工作台偏好")).toBeInTheDocument();
    expect(screen.getByText("深色主题")).toBeInTheDocument();
    expect(screen.getByText("字号")).toBeInTheDocument();
    expect(screen.getByText("修改后自动重新生成规则")).toBeInTheDocument();
    expect(screen.getByText("显示过期模型横幅")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(toastSuccess).toHaveBeenCalledWith("设置已保存");
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toContain("provider-config-1");
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
