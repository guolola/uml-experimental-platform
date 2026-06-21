// Owns project member invitation, role, and removal interactions.
import { useEffect, useRef, useState } from "react";
import { Mail, UserRound } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Label } from "../../../shared/ui/label";
import { SelectControl } from "../../../shared/ui/select";
import { cn } from "../../../shared/ui/utils";
import {
  formatMemberDate,
  invitationToMember,
  memberInitials,
  memberRoleLabel,
  memberStatusLabel,
} from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformProject,
  type PlatformProjectMember,
} from "../services/platform-api";

export function ProjectMembers({
  project,
  members,
  membershipRole = null,
  layout = "page",
}: {
  project: PlatformProject;
  members: PlatformProjectMember[];
  membershipRole?: string | null;
  layout?: "page" | "drawer";
}) {
  const [currentMembers, setCurrentMembers] = useState(members);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [memberFilter, setMemberFilter] = useState<"all" | "active" | "invited">("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inviteEmailRef = useRef<HTMLInputElement | null>(null);
  const canManageMembers = !membershipRole || membershipRole === "owner" || membershipRole === "editor";

  useEffect(() => {
    setCurrentMembers(members);
  }, [members]);

  const inviteMember = async () => {
    if (!canManageMembers) {
      setError("当前权限为只读，无法邀请成员。");
      return;
    }
    const email = (inviteEmailRef.current?.value ?? inviteEmail).trim();
    if (!email) {
      setError("请填写邀请邮箱。");
      return;
    }
    setMessage("");
    setError("");
    const optimisticMember: PlatformProjectMember = {
      id: `pending-${email}`,
      projectId: project.id,
      userId: "",
      email,
      displayName: email,
      role: inviteRole,
      status: "invited",
      invitedAt: new Date().toISOString(),
      joinedAt: null,
    };
    setCurrentMembers((current) => [...current, optimisticMember]);
    try {
      const response = await platformApi.inviteProjectMember(project.id, {
        email,
        role: inviteRole,
      });
      const nextMember =
        response.member ??
        invitationToMember(project.id, response.invitation ?? {
          id: `invitation-${email}`,
          projectId: project.id,
          email,
          role: inviteRole,
          status: "invited",
          invitedAt: new Date().toISOString(),
        });
      setCurrentMembers((current) =>
        current.map((member) => (member.id === optimisticMember.id ? nextMember : member)),
      );
      setInviteEmail("");
      if (inviteEmailRef.current) {
        inviteEmailRef.current.value = "";
      }
      setMessage(`已邀请 ${nextMember.email}。`);
    } catch (inviteError) {
      setCurrentMembers((current) => current.filter((member) => member.id !== optimisticMember.id));
      setError(inviteError instanceof Error ? inviteError.message : "邀请成员失败。");
    }
  };

  const updateRole = async (memberId: string, role: string) => {
    if (!canManageMembers) {
      setError("当前权限为只读，无法修改角色。");
      return;
    }
    setMessage("");
    setError("");
    try {
      const response = await platformApi.updateProjectMemberRole(project.id, memberId, role);
      setCurrentMembers((current) =>
        current.map((member) =>
          member.id === memberId ? { ...member, ...response.member } : member,
        ),
      );
      setMessage(`${response.member.email} 的角色已更新为 ${response.member.role}。`);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "角色更新失败。");
    }
  };

  const removeMember = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      setError("当前权限为只读，无法移除成员。");
      return;
    }
    setMessage("");
    setError("");
    try {
      await platformApi.removeProjectMember(project.id, member.id);
      setCurrentMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage(`已移除 ${member.email}。`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "移除成员失败。");
    }
  };

  const resendInvitation = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      setError("当前权限为只读，无法重发邀请。");
      return;
    }
    setMessage("");
    setError("");
    try {
      const response = await platformApi.resendProjectInvitation(project.id, member.id);
      const nextMember =
        response.member ??
        (response.invitation
          ? invitationToMember(project.id, response.invitation)
          : { ...member, status: "invited", invitedAt: new Date().toISOString() });
      setCurrentMembers((current) =>
        current.map((item) => (item.id === member.id ? { ...item, ...nextMember } : item)),
      );
      setMessage(`已重发 ${member.email} 的邀请。`);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "重发邀请失败。");
    }
  };

  const revokeInvitation = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      setError("当前权限为只读，无法撤销邀请。");
      return;
    }
    setMessage("");
    setError("");
    try {
      await platformApi.revokeProjectInvitation(project.id, member.id);
      setCurrentMembers((current) =>
        current.map((item) =>
          item.id === member.id ? { ...item, status: "revoked" } : item,
        ),
      );
      setMessage(`已撤销 ${member.email} 的邀请。`);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "撤销邀请失败。");
    }
  };

  const filteredMembers = currentMembers.filter((member) => {
    if (memberFilter === "active") return member.status === "active";
    if (memberFilter === "invited") {
      return member.status === "invited" || member.status === "expired";
    }
    return true;
  });
  const activeCount = currentMembers.filter((member) => member.status === "active").length;
  const invitedCount = currentMembers.filter(
    (member) => member.status === "invited" || member.status === "expired",
  ).length;
  const ownerCount = currentMembers.filter((member) => member.status === "active" && member.role === "owner").length;
  const editorCount = currentMembers.filter((member) => member.status === "active" && member.role === "editor").length;
  const viewerCount = currentMembers.filter((member) => member.status === "active" && member.role === "viewer").length;
  const roleOptions = [
    { value: "viewer", label: "查看者" },
    { value: "editor", label: "编辑者" },
  ];
  const memberRoleOptions = [
    { value: "owner", label: "所有者" },
    ...roleOptions,
  ];
  const containerClass =
    layout === "drawer"
      ? "min-w-0 max-w-full space-y-6 overflow-hidden"
      : "space-y-5";
  const shellClass =
    layout === "drawer" ? "min-w-0 max-w-full overflow-hidden border-0 bg-transparent p-0" : "";

  return (
    <section className={`rounded-md border border-border bg-card p-5 ${shellClass}`}>
      <div className={containerClass}>
        <p className="text-sm leading-6 text-muted-foreground">
          共 {activeCount} 名成员，包含 {ownerCount} 名所有者、{editorCount} 名编辑者、{viewerCount} 名查看者。
          另有 {invitedCount} 个待处理邀请。
        </p>
        {!canManageMembers && (
          <div className="rounded-md border border-primary/10 bg-primary/10 p-3 text-sm leading-6 text-muted-foreground">
            当前权限为只读，只能查看成员与邀请状态，无法邀请或修改成员角色。
          </div>
        )}
        <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-muted/40 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">邀请新成员</h2>
          <div className={layout === "drawer" ? "grid gap-3" : "grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]"}>
            <div className="relative min-w-0">
              <Label htmlFor="member-invite-email" className="sr-only">邀请邮箱</Label>
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="member-invite-email"
                type="email"
                ref={inviteEmailRef}
                defaultValue={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="输入邮箱地址"
                disabled={!canManageMembers}
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              />
            </div>
            <SelectControl
              id="member-invite-role"
              aria-label="邀请角色"
              value={inviteRole}
              onValueChange={setInviteRole}
              disabled={!canManageMembers}
              className="h-9 min-w-0 max-w-full"
              options={roleOptions.map((role) => ({
                value: role.value,
                label: role.label,
              }))}
            />
          </div>
          <Button type="button" className="mt-3 w-full" onClick={() => void inviteMember()} disabled={!canManageMembers}>
            发送邀请
          </Button>
        </div>
        <div className="grid min-w-0 grid-cols-3 rounded-md bg-primary/10 p-1 text-xs">
          {[
            ["all", "全部"],
            ["active", "已加入"],
            ["invited", "邀请中"],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={memberFilter === value ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setMemberFilter(value as "all" | "active" | "invited")}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3">
          {filteredMembers.map((member) => {
            const invitationLike = member.status === "invited" || member.status === "expired";
            const displayName = member.displayName || member.email;
            return (
              <div
                key={member.id}
                data-testid="project-member-card"
                className={`min-w-0 max-w-full overflow-hidden rounded-md border p-3 ${
                  invitationLike
                    ? "border-dashed border-border bg-background/50"
                    : "border-border/70 bg-background"
                }`}
              >
                <div className="flex min-w-0 gap-3">
                  <span className={`flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold ${
                    invitationLike ? "border border-dashed border-border bg-background text-muted-foreground" : "bg-primary/10 text-primary"
                  }`}>
                    {member.avatarUrl && !invitationLike ? (
                      <img src={member.avatarUrl} alt={`${displayName} 的头像`} className="size-full object-cover" />
                    ) : invitationLike ? (
                      <Mail className="size-4" />
                    ) : (
                      memberInitials(member)
                    )}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium" title={displayName}>{displayName}</span>
                      {invitationLike ? (
                        <Badge variant={member.status === "expired" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                          {member.status === "expired" ? "已过期" : "待处理"}
                        </Badge>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          加入于 {formatMemberDate(member.joinedAt)}
                        </span>
                      )}
                    </div>
                    <p className="min-w-0 truncate text-xs text-muted-foreground" title={member.email}>{member.email}</p>
                    {invitationLike && (
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={`${member.invitedAt ? `${formatMemberDate(member.invitedAt)}已邀请` : "已邀请"} (${memberRoleLabel(member.role)})`}>
                        {member.invitedAt ? `${formatMemberDate(member.invitedAt)}已邀请` : "已邀请"} ({memberRoleLabel(member.role)})
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn("mt-3 min-w-0 gap-2", layout === "drawer" ? "grid grid-cols-1" : "flex items-center justify-between")}>
                  {invitationLike ? (
                    <span className="text-xs text-muted-foreground">{memberStatusLabel(member.status)}</span>
                  ) : (
                    <SelectControl
                      aria-label={`${member.email} 的角色`}
                      value={member.role}
                      onValueChange={(value) => void updateRole(member.id, value)}
                      disabled={!canManageMembers}
                      className={cn("h-8 text-xs", layout === "drawer" ? "w-full min-w-0 max-w-full" : "min-w-24")}
                      size="sm"
                      options={memberRoleOptions.map((role) => ({
                        value: role.value,
                        label: role.label,
                      }))}
                    />
                  )}
                  <div className="flex min-w-0 flex-wrap justify-end gap-2">
                    {invitationLike ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => void resendInvitation(member)}
                          disabled={!canManageMembers}
                          aria-label={`重发邀请 ${member.email}`}
                        >
                          重发
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                          onClick={() => void revokeInvitation(member)}
                          disabled={!canManageMembers}
                          aria-label={`撤销邀请 ${member.email}`}
                        >
                          撤销
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => void removeMember(member)}
                        disabled={member.role === "owner" || !canManageMembers}
                        aria-label={`移除 ${member.email}`}
                      >
                        <UserRound className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {currentMembers.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">暂无成员数据。</div>
          )}
          {currentMembers.length > 0 && filteredMembers.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              没有匹配的成员。
            </div>
          )}
        </div>
        {(message || error) && (
          <div className="rounded-md border border-border bg-muted p-3 text-sm">
            {message || error}
          </div>
        )}
      </div>
    </section>
  );
}
