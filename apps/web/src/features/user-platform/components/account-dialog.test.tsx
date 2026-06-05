// Covers account modal profile usage telemetry and security workflows displayed to the current user.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDialog } from "./account-dialog";
import type { PlatformAccountProfileResponse } from "../services/platform-api";

const baseUser = {
  id: "user-1",
  email: "student@example.edu",
  displayName: "Student",
  status: "active",
  emailVerified: true,
  mfaEnabled: false,
};

function profileResponse(
  generationUsage: PlatformAccountProfileResponse["generationUsage"],
  user = baseUser,
): PlatformAccountProfileResponse {
  return {
    user,
    session: {
      id: "session-1",
      userId: user.id,
      createdAt: "2026-05-25T08:00:00.000Z",
      expiresAt: "2026-06-01T08:00:00.000Z",
      lastSeenAt: "2026-05-25T08:00:00.000Z",
      ipAddress: "203.0.113.40",
      userAgent: "Playwright",
    },
    mfa: { enabled: false, enforcement: "totp" },
    generationUsage,
  };
}

function stubAccountFetch(profile: PlatformAccountProfileResponse) {
  let mfaEnabled = Boolean(profile.mfa?.enabled ?? profile.user.mfaEnabled);
  const currentProfile = () => ({
    ...profile,
    user: { ...profile.user, mfaEnabled },
    mfa: { enabled: mfaEnabled, enforcement: "totp" },
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://127.0.0.1:4101");
    if (url.pathname === "/api/auth/me" || url.pathname === "/api/account/profile") {
      return new Response(JSON.stringify(currentProfile()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/sessions") {
      return new Response(JSON.stringify({ sessions: [profile.session] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/login-events") {
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/mfa/setup" && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/UML:student@example.edu?secret=JBSWY3DPEHPK3PXP",
          qrCodeDataUrl: "data:image/png;base64,mfa",
          expiresAt: "2026-05-25T08:05:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/account/mfa/confirm" && init?.method === "POST") {
      mfaEnabled = true;
      return new Response(JSON.stringify({ mfa: { enabled: true, enforcement: "totp" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/mfa" && init?.method === "PATCH") {
      mfaEnabled = false;
      return new Response(JSON.stringify({ mfa: { enabled: false, enforcement: "totp" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/sessions/revoke-others" && init?.method === "POST") {
      return new Response(JSON.stringify({ revokedCount: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AccountDialog generation usage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows today's generation count as unlimited for regular users", async () => {
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse({
        usedToday: 3,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    render(<AccountDialog onNavigate={() => {}} initialUser={baseUser} />);
    await user.click(screen.getByRole("button", { name: "账号" }));

    expect(await screen.findByText("今日生成次数")).toBeInTheDocument();
    expect(screen.getByText("今日 3 次")).toBeInTheDocument();
    expect(screen.getByText("不限额")).toBeInTheDocument();
  });

  it("shows today's generation quota and remaining count for guest users", async () => {
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse(
        {
          usedToday: 3,
          limit: 5,
          remaining: 2,
          windowSeconds: 86400,
          limited: true,
          scope: "visitor",
        },
        {
          ...baseUser,
          id: "guest-user",
          email: "guest@example.edu",
          displayName: "Guest",
        },
      ),
    );

    render(
      <AccountDialog
        onNavigate={() => {}}
        initialUser={{
          ...baseUser,
          id: "guest-user",
          email: "guest@example.edu",
          displayName: "Guest",
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "账号" }));

    expect(await screen.findByText("今日生成次数")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("今日 3 / 5 次")).toBeInTheDocument();
    });
    expect(screen.getByText("剩余 2 次")).toBeInTheDocument();
  });

  it("manages real TOTP MFA and session revocation through account APIs", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    render(<AccountDialog onNavigate={() => {}} initialUser={baseUser} />);
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    await user.click(await within(accountDialog).findByRole("tab", { name: "安全设置" }));

    expect((await within(accountDialog).findAllByText("MFA 已禁用")).length).toBeGreaterThan(0);
    fireEvent.click(within(accountDialog).getByRole("button", { name: "启用 MFA" }));
    expect(await within(accountDialog).findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/account/mfa/setup"),
      expect.objectContaining({ method: "POST" }),
    );

    const mfaCodeInput = within(accountDialog).getByLabelText("MFA 验证码");
    fireEvent.change(mfaCodeInput, { target: { value: "123456" } });
    await waitFor(() => {
      expect(mfaCodeInput).toHaveValue("123456");
    });
    fireEvent.click(await within(accountDialog).findByRole("button", { name: "确认启用 MFA" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mfa/confirm"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "123456" }),
        }),
      );
    });
    expect((await within(accountDialog).findAllByText("MFA 已启用")).length).toBeGreaterThan(0);

    fireEvent.change(await within(accountDialog).findByLabelText("停用验证码"), {
      target: { value: "654321" },
    });
    fireEvent.click(await within(accountDialog).findByRole("button", { name: "停用 MFA" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mfa"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ enabled: false, code: "654321" }),
        }),
      );
    });
    expect((await within(accountDialog).findAllByText("MFA 已禁用")).length).toBeGreaterThan(0);

    fireEvent.click(within(accountDialog).getByRole("button", { name: "退出其他设备" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/sessions/revoke-others"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
