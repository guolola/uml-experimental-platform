// Formats project workspace member, run, and document records for page and drawer views.
import type {
  PlatformDocument,
  PlatformProjectInvitation,
  PlatformProjectMember,
  PlatformRunSummary,
} from "../services/platform-api";

export function invitationToMember(
  projectId: string,
  invitation: PlatformProjectInvitation,
): PlatformProjectMember {
  return {
    id: invitation.id,
    projectId,
    userId: "",
    email: invitation.email,
    displayName: invitation.email,
    role: invitation.role,
    status: invitation.status,
    invitedAt: invitation.invitedAt ?? null,
    joinedAt: null,
  };
}

export function memberStatusLabel(status: string) {
  if (status === "active") return "已加入";
  if (status === "invited") return "邀请中";
  if (status === "expired") return "已过期";
  if (status === "revoked") return "已撤销";
  return status;
}

export function memberRoleLabel(role: string) {
  if (role === "owner") return "所有者";
  if (role === "editor") return "编辑者";
  if (role === "viewer") return "查看者";
  return role;
}

export function memberInitials(member: PlatformProjectMember) {
  const label = member.displayName || member.email || "成员";
  const parts = label.split(/[\s._-]+/u).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function formatMemberDate(value: string | null | undefined) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export function getProjectRunKind(run: PlatformRunSummary) {
  if (
    run.runKind === "requirements" ||
    run.runKind === "design" ||
    run.runKind === "code" ||
    run.runKind === "document"
  ) {
    return run.runKind;
  }
  const normalized = (run.stage ?? "").toLowerCase();
  if (normalized.includes("document") || normalized.includes("docx")) return "document";
  if (normalized.includes("code") || normalized.includes("ui")) return "code";
  if (normalized.includes("design")) return "design";
  if (
    normalized.includes("generate_models") ||
    normalized.includes("requirement") ||
    normalized.includes("rule") ||
    normalized.includes("extract") ||
    normalized.includes("plantuml") ||
    normalized.includes("render_svg") ||
    normalized.includes("render_diagram")
  ) {
    return "requirements";
  }
  return "all";
}

export function getProjectRunStageLabel(run: PlatformRunSummary) {
  const stage = run.stage;
  const normalized = (stage ?? "").toLowerCase();
  const runKind = getProjectRunKind(run);
  if (!normalized) return "等待开始";
  if (normalized.includes("extract_rules")) return "提取需求规则";
  if (normalized.includes("generate_models")) return "生成需求模型";
  if (normalized.includes("generate_tests")) return "生成测试用例";
  if (normalized.includes("generate_design")) return "生成设计模型";
  if (normalized.includes("generate_plantuml")) {
    if (runKind === "design") return "生成设计 PlantUML";
    if (runKind === "requirements") return "生成需求 PlantUML";
    return "生成 PlantUML";
  }
  if (normalized.includes("render_svg") || normalized.includes("render_diagram")) {
    if (runKind === "design") return "渲染设计图表";
    if (runKind === "requirements") return "渲染需求图表";
    return "渲染图表";
  }
  if (
    normalized.includes("write_code") ||
    normalized.includes("repair_code") ||
    normalized.includes("generate_code")
  ) {
    return "生成代码原型";
  }
  if (normalized.includes("verify_code")) return "验证代码预览";
  if (normalized.includes("generate_document")) {
    if (run.documentKind === "requirementsSpec") return "生成需求规格说明书";
    if (run.documentKind === "softwareDesignSpec") return "生成软件设计说明书";
    return "生成说明书正文";
  }
  if (normalized.includes("render_document")) {
    if (run.documentKind === "requirementsSpec") return "生成需求规格说明书文件";
    if (run.documentKind === "softwareDesignSpec") return "生成软件设计说明书文件";
    return "生成说明书文件";
  }
  if (normalized.includes("queued")) return "等待开始";
  return stage ?? "等待开始";
}

export function getProjectRunStatusLabel(status?: string | null) {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "interrupted":
      return "服务中断，可重试";
    default:
      return status ?? "未知状态";
  }
}

export function getProjectRunStatusClasses(status?: string | null) {
  switch (status) {
    case "completed":
      return {
        bar: "bg-emerald-500",
        badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "interrupted":
      return {
        bar: "bg-amber-500",
        badge: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "failed":
      return {
        bar: "bg-destructive",
        badge: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    case "cancelled":
      return {
        bar: "bg-muted-foreground/40",
        badge: "border-muted-foreground/20 bg-muted text-muted-foreground",
      };
    case "queued":
    case "running":
      return {
        bar: "bg-primary",
        badge: "border-primary/20 bg-primary/10 text-primary",
      };
    default:
      return {
        bar: "bg-muted-foreground/30",
        badge: "border-border bg-secondary text-secondary-foreground",
      };
  }
}

export function getProjectRunDisplayTime(run: PlatformRunSummary) {
  return run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt ?? null;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function shortIdentifier(value: string) {
  return value.slice(0, 8);
}

export function getProjectRunOperatorLabel(
  run: PlatformRunSummary,
  members: PlatformProjectMember[] = [],
) {
  const operator = run.createdByUserId?.trim();
  if (!operator) return "未知成员";
  const member = members.find((item) => item.userId === operator);
  if (member) {
    return member.displayName?.trim() || member.email?.trim() || `未知成员 ${shortIdentifier(operator)}`;
  }
  if (isUuidLike(operator)) return `未知成员 ${shortIdentifier(operator)}`;
  return operator;
}

export function getProjectRunOperatorSearchText(
  run: PlatformRunSummary,
  members: PlatformProjectMember[] = [],
) {
  const operator = run.createdByUserId?.trim() ?? "";
  const member = members.find((item) => item.userId === operator);
  return [
    operator,
    getProjectRunOperatorLabel(run, members),
    member?.displayName,
    member?.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getProjectDocumentKindLabel(kind?: string | null) {
  if (kind === "requirementsSpec") return "需求规格说明书";
  if (kind === "softwareDesignSpec") return "软件设计说明书";
  return "项目文档";
}

export function getProjectDocumentDisplayName(document: PlatformDocument) {
  const explicitName =
    document.fileName?.trim() ||
    document.name?.trim() ||
    document.title?.trim();
  if (explicitName) return explicitName;
  if (document.documentKind) {
    return `${getProjectDocumentKindLabel(document.documentKind)} v${document.version ?? 1}`;
  }
  return `文档 ${shortIdentifier(document.id)}`;
}

export function getProjectRunModelLabel(run: PlatformRunSummary) {
  return run.model?.trim() || "默认模型";
}

export function onlyOfficeStatusLabel(status?: string | null) {
  if (status === "editing") return "编辑中";
  if (status === "ready") return "可编辑";
  if (status === "unavailable") return "不可用";
  return "不可用";
}

export function downloadStatusLabel(status?: string | null) {
  if (status === "available") return "可用";
  if (status === "preparing") return "准备中";
  if (status === "unavailable") return "不可用";
  return "不可用";
}
