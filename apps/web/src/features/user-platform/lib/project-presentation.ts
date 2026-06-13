// Maps platform project API records into project-list presentation data.
import type {
  PlatformProject,
  PlatformProjectMemberPreview,
  PlatformUser,
} from "../services/platform-api";

export type StaticProject = {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownerUserId: string;
  isOwnedByCurrentUser: boolean;
  visibility: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  lastGeneratedAt: string;
  searchableText: string;
  memberCount: number;
  members: StaticProjectMemberPreview[];
  recentRun: string;
};

type StaticProjectMemberPreview = {
  id: string;
  label: string;
  initial: string;
  avatarUrl: string | null;
};

export const PROJECT_SCOPE_OPTIONS = [
  { value: "all", label: "全部项目" },
  { value: "mine", label: "我的项目" },
  { value: "team", label: "团队项目" },
  { value: "archived", label: "归档项目" },
] as const;

function displayNameFromUser(user: PlatformUser | null | undefined) {
  return user?.displayName?.trim() || user?.email?.split("@")[0] || user?.id || "";
}

function compactOwnerLabel(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  if (!normalized) return "未知用户";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return `用户 ${normalized.slice(0, 8)}`;
  }
  return normalized;
}

function ownerNameFromProject(project: PlatformProject, currentUser: PlatformUser | null) {
  const ownerPreview = project.memberPreviews?.find((member) => member.userId === project.ownerUserId);
  const ownerDisplayName = project.ownerDisplayName?.trim() || ownerPreview?.displayName?.trim();
  if (ownerDisplayName) return ownerDisplayName;
  if (currentUser?.id === project.ownerUserId) {
    return displayNameFromUser(currentUser) || "当前用户";
  }
  return compactOwnerLabel(project.ownerUserId);
}

function ownerInitial(owner: string) {
  return Array.from(owner.trim())[0]?.toUpperCase() || "U";
}

function memberPreviewLabel(member: PlatformProjectMemberPreview) {
  return member.displayName?.trim() || (member.userId ? compactOwnerLabel(member.userId) : "未知成员");
}

function projectMemberPreviewsFromApi(
  project: PlatformProject,
  ownerName: string,
): StaticProjectMemberPreview[] {
  const previews = project.memberPreviews ?? [];
  if (previews.length === 0) {
    return [
      {
        id: `${project.id}:owner`,
        label: ownerName,
        initial: ownerInitial(ownerName),
        avatarUrl: project.ownerAvatarUrl ?? null,
      },
    ];
  }

  return previews.map((member) => {
    const label = memberPreviewLabel(member);
    return {
      id: member.id,
      label,
      initial: ownerInitial(label),
      avatarUrl: member.avatarUrl ?? null,
    };
  });
}

export function projectFromApi(project: PlatformProject, currentUser: PlatformUser | null = null): StaticProject {
  const memberCount = Math.max(project.memberCount ?? 1, 1);
  const ownerName = ownerNameFromProject(project, currentUser);
  const members = projectMemberPreviewsFromApi(project, ownerName);
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? "暂无项目描述。",
    owner: ownerName,
    ownerUserId: project.ownerUserId,
    isOwnedByCurrentUser: currentUser?.id === project.ownerUserId,
    visibility:
      project.visibility === "private"
        ? "仅成员可见"
        : project.visibility === "team"
          ? "团队成员可见"
          : "公开可见",
    status: project.status,
    statusLabel:
      project.status === "archived"
        ? "已归档"
        : project.status === "active"
          ? "进行中"
          : project.status,
    updatedAt: new Date(project.updatedAt).toLocaleString("zh-CN"),
    lastGeneratedAt: project.lastGeneratedAt ?? "",
    searchableText: [
      project.name,
      project.description,
      project.status,
      project.visibility,
      project.ownerUserId,
      ownerName,
      ...members.map((member) => member.label),
      project.courseLabel,
      project.classLabel,
      project.teamLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    memberCount,
    members,
    recentRun: project.lastGeneratedAt
      ? new Date(project.lastGeneratedAt).toLocaleString("zh-CN")
      : "等待首次生成",
  };
}
