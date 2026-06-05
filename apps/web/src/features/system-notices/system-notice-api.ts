// Wraps user-facing HTTP calls for system notice timelines.
import type {
  SystemNoticeListResponse,
} from "@uml-platform/contracts";
import { requestJson } from "../../services/api-client";

export const systemNoticeApi = {
  listPublished() {
    return requestJson<SystemNoticeListResponse>("/api/system-notices", {
      errorMessage: "系统通知加载失败",
    });
  },
  markRead(noticeIds?: string[]) {
    return requestJson<SystemNoticeListResponse>("/api/system-notices/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(noticeIds?.length ? { noticeIds } : {}),
      errorMessage: "系统通知已阅览状态保存失败",
    });
  },
};
