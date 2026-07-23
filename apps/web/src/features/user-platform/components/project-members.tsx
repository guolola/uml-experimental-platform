// Owns project member invitation, role, and removal interactions.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "zh-CN";
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
      setError(t("projectShell.membersUi.errors.inviteReadonly"));
      return;
    }
    const email = (inviteEmailRef.current?.value ?? inviteEmail).trim();
    if (!email) {
      setError(t("projectShell.membersUi.errors.emailRequired"));
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
      setMessage(t("projectShell.membersUi.messages.invited", { email: nextMember.email }));
    } catch {
      setCurrentMembers((current) => current.filter((member) => member.id !== optimisticMember.id));
      setError(t("projectShell.membersUi.errors.invite"));
    }
  };

  const updateRole = async (memberId: string, role: string) => {
    if (!canManageMembers) {
      setError(t("projectShell.membersUi.errors.roleReadonly"));
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
      setMessage(t("projectShell.membersUi.messages.roleUpdated", {
        email: response.member.email,
        role: memberRoleLabel(response.member.role, t),
      }));
    } catch {
      setError(t("projectShell.membersUi.errors.role"));
    }
  };

  const removeMember = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      setError(t("projectShell.membersUi.errors.removeReadonly"));
      return;
    }
    setMessage("");
    setError("");
    try {
      await platformApi.removeProjectMember(project.id, member.id);
      setCurrentMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage(t("projectShell.membersUi.messages.removed", { email: member.email }));
    } catch {
      setError(t("projectShell.membersUi.errors.remove"));
    }
  };

  const resendInvitation = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      setError(t("projectShell.membersUi.errors.resendReadonly"));
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
      setMessage(t("projectShell.membersUi.messages.resent", { email: member.email }));
    } catch {
      setError(t("projectShell.membersUi.errors.resend"));
    }
  };

  const revokeInvitation = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      setError(t("projectShell.membersUi.errors.revokeReadonly"));
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
      setMessage(t("projectShell.membersUi.messages.revoked", { email: member.email }));
    } catch {
      setError(t("projectShell.membersUi.errors.revoke"));
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
    { value: "viewer", label: t("projectShell.membersUi.roles.viewer") },
    { value: "editor", label: t("projectShell.membersUi.roles.editor") },
  ];
  const memberRoleOptions = [
    { value: "owner", label: t("projectShell.membersUi.roles.owner") },
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
          {t("projectShell.membersUi.summary", { activeCount, ownerCount, editorCount, viewerCount, invitedCount })}
        </p>
        {!canManageMembers && (
          <div className="rounded-md border border-primary/10 bg-primary/10 p-3 text-sm leading-6 text-muted-foreground">
            {t("projectShell.membersUi.readonly")}
          </div>
        )}
        <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-muted/40 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">{t("projectShell.membersUi.inviteTitle")}</h2>
          <div className={layout === "drawer" ? "grid gap-3" : "grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]"}>
            <div className="relative min-w-0">
              <Label htmlFor="member-invite-email" className="sr-only">{t("projectShell.membersUi.emailLabel")}</Label>
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="member-invite-email"
                type="email"
                ref={inviteEmailRef}
                defaultValue={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder={t("projectShell.membersUi.emailPlaceholder")}
                disabled={!canManageMembers}
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              />
            </div>
            <SelectControl
              id="member-invite-role"
              aria-label={t("projectShell.membersUi.inviteRole")}
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
            {t("projectShell.membersUi.sendInvite")}
          </Button>
        </div>
        <div className="grid min-w-0 grid-cols-3 rounded-md bg-primary/10 p-1 text-xs">
          {[
            ["all", t("projectShell.membersUi.filters.all")],
            ["active", t("projectShell.membersUi.status.active")],
            ["invited", t("projectShell.membersUi.status.invited")],
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
                      <img src={member.avatarUrl} alt={t("projectShell.membersUi.avatar", { name: displayName })} className="size-full object-cover" />
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
                          {member.status === "expired" ? t("projectShell.membersUi.status.expired") : t("projectShell.membersUi.pending")}
                        </Badge>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("projectShell.membersUi.joinedAt", { date: formatMemberDate(member.joinedAt, locale, t) })}
                        </span>
                      )}
                    </div>
                    <p className="min-w-0 truncate text-xs text-muted-foreground" title={member.email}>{member.email}</p>
                    {invitationLike && (
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={t("projectShell.membersUi.invitedAt", { date: member.invitedAt ? formatMemberDate(member.invitedAt, locale, t) : t("projectShell.membersUi.noTime"), role: memberRoleLabel(member.role, t) })}>
                        {t("projectShell.membersUi.invitedAt", { date: member.invitedAt ? formatMemberDate(member.invitedAt, locale, t) : t("projectShell.membersUi.noTime"), role: memberRoleLabel(member.role, t) })}
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn("mt-3 min-w-0 gap-2", layout === "drawer" ? "grid grid-cols-1" : "flex items-center justify-between")}>
                  {invitationLike ? (
                    <span className="text-xs text-muted-foreground">{memberStatusLabel(member.status, t)}</span>
                  ) : (
                    <SelectControl
                      aria-label={t("projectShell.membersUi.memberRole", { email: member.email })}
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
                          aria-label={t("projectShell.membersUi.resendFor", { email: member.email })}
                        >
                          {t("projectShell.membersUi.resend")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                          onClick={() => void revokeInvitation(member)}
                          disabled={!canManageMembers}
                          aria-label={t("projectShell.membersUi.revokeFor", { email: member.email })}
                        >
                          {t("projectShell.membersUi.revoke")}
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
                        aria-label={t("projectShell.membersUi.removeFor", { email: member.email })}
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
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t("projectShell.membersUi.empty")}</div>
          )}
          {currentMembers.length > 0 && filteredMembers.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("projectShell.membersUi.noMatches")}
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
