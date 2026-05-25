// Covers account modal profile usage telemetry displayed to the current user.
import { render, screen, waitFor } from "@testing-library/react";
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
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://127.0.0.1:4101");
    if (url.pathname === "/api/auth/me" || url.pathname === "/api/account/profile") {
      return new Response(JSON.stringify(profile), {
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
});
