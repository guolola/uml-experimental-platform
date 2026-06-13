// Handles project invitation token inspection and acceptance from public auth routes.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  getQueryParam,
  localizeAuthMessage,
} from "../lib/auth-page-routing";
import { memberRoleLabel } from "../lib/project-workspace-presentation";
import {
  PlatformApiError,
  platformApi,
  type PlatformProjectInvitation,
} from "../services/platform-api";

type Navigate = (path: string) => void;

export function InvitationAcceptPage({ onNavigate }: { onNavigate: Navigate }) {
  const token = getQueryParam("token");
  const [loading, setLoading] = useState(Boolean(token));
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<PlatformProjectInvitation | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      setMessage("邀请链接缺少 token，请检查邮件中的链接。");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    platformApi.inspectInvitation(token)
      .then((response) => {
        if (!active) return;
        setInvitation(response.invitation);
        setMessage("");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? localizeAuthMessage(error.message) : "邀请链接无效或已过期。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setMessage("");
    try {
      await platformApi.acceptInvitation(token);
      setMessage("已加入项目，正在进入项目首页。");
      onNavigate("/projects");
    } catch (error) {
      const status = error instanceof PlatformApiError ? error.status : 0;
      if (status === 401) {
        const redirect = `/invitations/accept?token=${encodeURIComponent(token)}`;
        onNavigate(`/login?redirect=${encodeURIComponent(redirect)}`);
        return;
      }
      setMessage(error instanceof Error ? localizeAuthMessage(error.message) : "接受邀请失败。");
    } finally {
      setAccepting(false);
    }
  };

  const projectName = invitation?.project?.name ?? "受邀项目";
  const invitedEmail = invitation?.email ?? "你的邮箱";

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-background px-4 py-10 text-foreground md:px-12">
      <section className="mx-auto max-w-xl rounded-xl border border-border/60 bg-card p-8 shadow-lg">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold leading-8">接受项目邀请</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            请确认邀请信息后加入项目。若尚未登录，请先使用被邀请邮箱登录或注册。
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在读取邀请信息...
          </div>
        ) : invitation ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm text-muted-foreground">项目</p>
              <p className="mt-1 font-medium">{projectName}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm text-muted-foreground">邀请邮箱</p>
              <p className="mt-1 font-medium">{invitedEmail}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm text-muted-foreground">项目角色</p>
              <p className="mt-1 font-medium">{memberRoleLabel(invitation.role)}</p>
            </div>
          </div>
        ) : null}
        {message && (
          <div className="mt-5 rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
            {message}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="h-11 flex-1" onClick={() => void accept()} disabled={!invitation || accepting}>
            {accepting && <Loader2 className="size-4 animate-spin" />}
            接受邀请
          </Button>
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => onNavigate(`/register?invitationToken=${encodeURIComponent(token)}`)}>
            注册新账号
          </Button>
        </div>
        <button type="button" className="mt-4 text-sm font-medium text-primary hover:underline" onClick={() => onNavigate("/login")}>
          返回登录
        </button>
      </section>
    </main>
  );
}
