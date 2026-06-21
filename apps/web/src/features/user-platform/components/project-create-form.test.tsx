// Covers project creation background auto matching and manual selection payloads.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectCreateForm } from "./project-create-form";

describe("ProjectCreateForm", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCreateProjectFetch() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/academic-options") {
        return new Response(
          JSON.stringify({ organizations: [], courses: [], classes: [], teams: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === "/api/provider-configs") {
        return new Response(JSON.stringify({ providerConfigs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/api/projects" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            project: {
              id: "project-created",
              name: "测试项目",
              description: null,
              visibility: "team",
              status: "active",
              ownerUserId: "owner-user",
              backgroundKey: JSON.parse(String(init.body)).backgroundKey ?? null,
              updatedAt: "2026-06-21T00:00:00.000Z",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("updates automatic background matching from the project title", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();

    render(<ProjectCreateForm onNavigate={() => {}} />);

    const nameInput = screen.getByLabelText("项目名称");
    await user.clear(nameInput);
    await user.type(nameInput, "质量追溯系统 UML 实验");

    expect(await screen.findByText("质量追溯系统")).toBeInTheDocument();
    expect(screen.queryByText("自动匹配")).not.toBeInTheDocument();
    expect(screen.queryByText(/命中：/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "项目背景图" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-background-gallery")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("project-background-preview-image")).toHaveLength(1);
  });

  it("submits a manual project background selection", async () => {
    const user = userEvent.setup();
    const fetchMock = stubCreateProjectFetch();

    render(<ProjectCreateForm onNavigate={() => {}} />);

    expect(screen.queryByRole("option", { name: /预约预订系统/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /选择背景图/u }));
    await user.click(await screen.findByRole("option", { name: /预约预订系统/u }));
    await user.click(screen.getByRole("button", { name: /创建并进入项目/u }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, init]) => {
        const url = new URL(String(input), "http://127.0.0.1:4101");
        return url.pathname === "/api/projects" && init?.method === "POST";
      });
      expect(createCall).toBeTruthy();
      expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
        backgroundKey: "booking",
      });
    });
  });
});
