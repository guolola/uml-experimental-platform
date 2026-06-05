import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemNoticeButton } from "./system-notice-dialog";

const publishedNoticeResponse = {
  generatedAt: "2026-06-05T00:00:00.000Z",
  unreadCount: 2,
  notices: [
    {
      id: "notice-important",
      title: "重要通知：公司主体变更及对公账号更新",
      type: "important",
      icon: "!",
      contentBlocks: [
        { kind: "paragraph", text: "大家好，请注意以下关键信息。" },
        { kind: "list_item", text: "确认新主体信息。" },
      ],
      status: "published",
      publishedAt: "2026-05-22T07:00:00.000Z",
      createdAt: "2026-05-22T07:00:00.000Z",
      updatedAt: "2026-05-22T07:00:00.000Z",
      unread: true,
    },
    {
      id: "notice-model",
      title: "MiniMax M3 模型上线",
      type: "model_update",
      icon: null,
      contentBlocks: [],
      status: "published",
      publishedAt: "2026-06-01T09:00:00.000Z",
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z",
      unread: true,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SystemNoticeButton", () => {
  it("opens the system notice timeline and persists read state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/system-notices/read") && method === "POST") {
        return new Response(
          JSON.stringify({
            ...publishedNoticeResponse,
            unreadCount: 0,
            notices: publishedNoticeResponse.notices.map((notice) => ({
              ...notice,
              unread: false,
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/system-notices") && method === "GET") {
        return new Response(JSON.stringify(publishedNoticeResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "unexpected" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SystemNoticeButton className="size-10" />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "系统通知，2 条未读" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "后台通知配置" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "系统通知，2 条未读" }));

    expect(await screen.findByRole("dialog", { name: "系统通知" })).toBeInTheDocument();
    expect(screen.getByText("MiniMax M3 模型上线")).toBeInTheDocument();
    expect(screen.getByText("确认新主体信息。")).toBeInTheDocument();
    const dots = screen.getAllByTestId("system-notice-dot");
    expect(dots.find((dot) => dot.dataset.noticeType === "important")).toHaveClass("bg-[#ba1a1a]");
    expect(dots.find((dot) => dot.dataset.noticeType === "model_update")).toHaveClass("bg-[#2b23ad]");

    await user.click(screen.getByRole("button", { name: "已阅览" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "系统通知" })).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/system-notices/read"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
