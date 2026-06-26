// Formats account dialog labels, dates, and usage summaries without owning UI state.
import { formatSessionDevice } from "./session-device";
import type {
  PlatformLoginEvent,
  PlatformUser,
} from "../services/platform-api";

export const AVATAR_FILE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ACCOUNT_SESSION_RECORD_LIMIT = 5;

export function initials(user: PlatformUser | null) {
  const label = user?.displayName || user?.email || "登录";
  return label.trim().slice(0, 1).toUpperCase();
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function accountStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "正常";
    case "disabled":
      return "已停用";
    case "pending":
      return "待激活";
    default:
      return status || "未知";
  }
}

export function loginOutcomeLabel(outcome: PlatformLoginEvent["outcome"]) {
  return outcome === "success" ? "成功" : "失败";
}

export function loginDetail(event: PlatformLoginEvent) {
  return event.message || (event.userAgent ? formatSessionDevice(event.userAgent) : "暂无详情");
}
