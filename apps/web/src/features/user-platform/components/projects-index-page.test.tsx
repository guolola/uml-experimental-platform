// Covers project index card background rendering without changing navigation behavior.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedRouteSessionProvider } from "./authenticated-route-session";
import { ProjectsIndexPage } from "./projects-index-page";
import { formatProjectDateTimeMinute } from "../lib/project-presentation";

describe("ProjectsIndexPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders project cards with resolved background images and accessible entry actions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/projects") {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: "project-booking",
                name: "课程预约系统",
                description: "用于课程实验的预约项目",
                visibility: "team",
                status: "active",
                ownerUserId: "owner-user",
                ownerDisplayName: "Owner User",
                backgroundKey: "booking",
                updatedAt: "2026-06-21T08:09:30.000Z",
                memberCount: 1,
                memberPreviews: [
                  {
                    id: "member-owner",
                    userId: "owner-user",
                    displayName: "Owner User",
                    role: "owner",
                    status: "active",
                  },
                ],
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

    render(
      <AuthenticatedRouteSessionProvider
        value={{
          user: {
            id: "owner-user",
            email: "owner@example.com",
            username: "owner",
            displayName: "Owner User",
            status: "active",
            emailVerified: true,
            mfaEnabled: false,
          },
          session: {
            id: "session-a",
            userId: "owner-user",
            createdAt: "2026-06-21T00:00:00.000Z",
            expiresAt: "2026-06-28T00:00:00.000Z",
            lastSeenAt: "2026-06-21T00:00:00.000Z",
            ipAddress: "127.0.0.1",
            userAgent: "vitest",
          },
        }}
      >
        <ProjectsIndexPage onNavigate={() => {}} />
      </AuthenticatedRouteSessionProvider>,
    );

    const card = await screen.findByRole("article");
    expect(card).toHaveAttribute("data-background-key", "booking");
    expect(within(card).getByRole("button", { name: /进入项目/u })).toBeInTheDocument();
    expect(card).toHaveTextContent(`最近更新：${formatProjectDateTimeMinute("2026-06-21T08:09:30.000Z")}`);
    expect(card).not.toHaveTextContent(":30");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("57_booking"),
    );
  });
});
