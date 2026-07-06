// Owns account profile and security pages backed by the account platform APIs.
import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Switch } from "../../../shared/ui/switch";
import { formatSessionRegion } from "../lib/session-device";
import { formatDateTime } from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformAccountSession,
  type PlatformLoginEvent,
  type PlatformMfaSetup,
} from "../services/platform-api";

type Navigate = (path: string) => void;

const ACCOUNT_PAGE_SCROLL_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-scroll bg-background [scrollbar-gutter:stable]";
const AVATAR_HTTPS_ERROR = "头像 URL 必须使用 HTTPS。";

function avatarUrlValidationMessage(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  try {
    return new URL(normalized).protocol === "https:" ? "" : AVATAR_HTTPS_ERROR;
  } catch {
    return AVATAR_HTTPS_ERROR;
  }
}

function AccountPageFrame({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate?: Navigate;
}) {
  void onNavigate;
  return (
    <main className={ACCOUNT_PAGE_SCROLL_CLASS}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        {children}
      </div>
    </main>
  );
}

function AccountSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-border bg-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function AccountPage({ onNavigate }: { onNavigate: Navigate }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [mfaLabel, setMfaLabel] = useState("未加载");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const avatarUrlError = avatarUrlValidationMessage(avatarUrl);

  useEffect(() => {
    let active = true;
    setLoading(true);
    platformApi
      .getAccountProfile()
      .then((response) => {
        if (!active) return;
        setDisplayName(response.user.displayName);
        setEmail(response.user.email);
        setAvatarUrl(response.user.avatarUrl ?? "");
        setMfaLabel(response.mfa?.enabled ? "已启用" : "未启用");
      })
      .catch((profileError) => {
        if (!active) return;
        setError(profileError instanceof Error ? profileError.message : "账号资料加载失败。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveProfile = async () => {
    setMessage("");
    setError("");
    if (avatarUrlError) {
      setError(avatarUrlError);
      return;
    }
    setSaving(true);
    try {
      const response = await platformApi.updateAccountProfile({
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      setDisplayName(response.user.displayName);
      setAvatarUrl(response.user.avatarUrl ?? "");
      setMfaLabel(response.mfa?.enabled ? "已启用" : "未启用");
      setMessage("账号资料已保存。");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "账号资料保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountPageFrame onNavigate={onNavigate}>
      <div>
        <h1>账号设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          个人资料、邮箱、头像、通知偏好和普通界面偏好。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AccountSection>
          {loading && <div className="mb-4 text-sm text-muted-foreground">正在加载账号资料...</div>}
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">昵称</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-email">邮箱</Label>
              <Input id="profile-email" type="email" value={email} readOnly />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-avatar">头像 URL</Label>
              <Input
                id="profile-avatar"
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://example.com/avatar.png"
                aria-invalid={Boolean(avatarUrlError)}
                aria-describedby={avatarUrlError ? "profile-avatar-error" : undefined}
              />
              {avatarUrlError && (
                <p id="profile-avatar-error" className="text-sm text-destructive" role="alert">
                  {avatarUrlError}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base">通知偏好</h2>
                <p className="text-sm text-muted-foreground">生成完成、文档编辑和邀请通知。</p>
              </div>
              <Switch defaultChecked aria-label="启用通知" />
            </div>
            <Button
              type="button"
              onClick={() => void saveProfile()}
              disabled={saving || loading || Boolean(avatarUrlError)}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              保存资料
            </Button>
            {(message || error) && (
              <div className="rounded-md border border-border bg-muted p-3 text-sm">
                {message || error}
              </div>
            )}
          </div>
        </AccountSection>
        <AccountSection>
          <h2 className="text-base">普通偏好</h2>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            <span>字号：默认</span>
            <span>主题：跟随当前设置</span>
            <span>头像：{avatarUrl ? "已设置" : "未设置"}</span>
            <span>MFA：{mfaLabel}</span>
          </div>
          <Button type="button" className="mt-4" variant="outline" onClick={() => onNavigate("/account/security")}>
            安全设置
          </Button>
        </AccountSection>
      </div>
    </AccountPageFrame>
  );
}

export function AccountSecurityPage({ onNavigate }: { onNavigate: Navigate }) {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<PlatformMfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [sessions, setSessions] = useState<PlatformAccountSession[]>([]);
  const [loginEvents, setLoginEvents] = useState<PlatformLoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      platformApi.me(),
      platformApi.listAccountSessions(),
      platformApi.listLoginEvents(),
    ])
      .then(([me, sessionResponse, eventResponse]) => {
        if (!active) {
          return;
        }
        setMfaEnabled(me.mfa?.enabled ?? me.user.mfaEnabled);
        setSessions(sessionResponse.sessions);
        setLoginEvents(eventResponse.events);
        setError("");
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "账号安全数据加载失败。",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const startMfaSetup = async () => {
    setMessage("");
    setError("");
    setMfaSubmitting(true);
    try {
      const setup = await platformApi.setupMfa();
      setMfaSetup(setup);
      setMfaCode("");
      setMessage("MFA 密钥已生成，请在认证器中添加后输入验证码。");
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "MFA 设置失败。");
    } finally {
      setMfaSubmitting(false);
    }
  };

  const confirmMfa = async () => {
    setMessage("");
    setError("");
    setMfaSubmitting(true);
    try {
      const response = await platformApi.confirmMfa({ code: mfaCode });
      setMfaEnabled(response.mfa.enabled);
      setMfaSetup(null);
      setMfaCode("");
      setMessage("MFA 已启用。");
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "MFA 验证失败。");
    } finally {
      setMfaSubmitting(false);
    }
  };

  const disableMfa = async () => {
    setMessage("");
    setError("");
    setMfaSubmitting(true);
    try {
      const code = mfaDisableCode.trim();
      const response = await platformApi.updateMfa({
        enabled: false,
        ...(code ? { code } : {}),
      });
      setMfaEnabled(response.mfa.enabled);
      setMfaDisableCode("");
      setMfaSetup(null);
      setMessage("MFA 已停用。");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : "MFA 停用失败。");
    } finally {
      setMfaSubmitting(false);
    }
  };

  const revokeOtherSessions = async () => {
    setMessage("");
    setError("");
    try {
      const response = await platformApi.revokeOtherSessions();
      setMessage(`已退出 ${response.revokedCount} 个其他会话。`);
      const refreshed = await platformApi.listAccountSessions();
      setSessions(refreshed.sessions);
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "会话退出失败。",
      );
    }
  };

  return (
    <AccountPageFrame onNavigate={onNavigate}>
      <div>
        <h1>安全设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          修改密码、MFA、活跃会话、最近登录记录和异常登录提醒。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <AccountSection>
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            <h2 className="text-base">修改密码</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">重置后会强制旧会话失效。</p>
          <Button type="button" className="mt-4" variant="outline">修改密码</Button>
        </AccountSection>
        <AccountSection>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-warning" />
            <h2 className="text-base">MFA {mfaEnabled ? "已启用" : "未启用"}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            建议为教师和管理员启用基于认证器的 TOTP 多因素认证。
          </p>
          {!mfaEnabled && (
            <div className="mt-4 grid gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={startMfaSetup}
                disabled={mfaSubmitting}
              >
                {mfaSubmitting && <Loader2 className="size-4 animate-spin" />}
                {mfaSetup ? "重新生成 MFA 密钥" : "启用 MFA"}
              </Button>
              {mfaSetup && (
                <div className="grid gap-3 rounded-md border border-border bg-muted p-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">TOTP Secret</div>
                    <div className="mt-1 break-all font-mono text-xs">{mfaSetup.secret}</div>
                  </div>
                  <div className="break-all text-xs text-muted-foreground">
                    {mfaSetup.otpauthUri}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    过期时间：{formatDateTime(mfaSetup.expiresAt)}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="account-mfa-code">MFA 验证码</Label>
                    <Input
                      id="account-mfa-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      placeholder="6 位验证码"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={confirmMfa}
                    disabled={mfaSubmitting || !mfaCode.trim()}
                  >
                    确认启用 MFA
                  </Button>
                </div>
              )}
            </div>
          )}
          {mfaEnabled && (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="account-mfa-disable-code">停用验证码（可选）</Label>
                <Input
                  id="account-mfa-disable-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaDisableCode}
                  onChange={(event) => setMfaDisableCode(event.target.value)}
                  placeholder="需要时输入当前验证码"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={disableMfa}
                disabled={mfaSubmitting}
              >
                {mfaSubmitting && <Loader2 className="size-4 animate-spin" />}
                停用 MFA
              </Button>
            </div>
          )}
        </AccountSection>
        <AccountSection>
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            <h2 className="text-base">异常登录提醒</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">新设备或异常地区登录时发送邮件提醒。</p>
          <Switch defaultChecked aria-label="异常登录提醒" className="mt-4" />
        </AccountSection>
      </div>
      {(message || error) && (
        <div className="rounded-md border border-border bg-muted p-3 text-sm">
          {message || error}
        </div>
      )}
      <AccountSection>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base">活跃会话</h2>
          <Button type="button" variant="outline" onClick={revokeOtherSessions}>
            退出其他设备
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {loading && <div className="text-sm text-muted-foreground">正在加载会话...</div>}
          {!loading &&
            sessions.map((session) => (
              <div key={session.id} className="rounded-md border border-border p-4 text-sm">
                <div>{session.userAgent ?? "未知设备"} · {formatSessionRegion(session)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  最近活动：{formatDateTime(session.lastSeenAt)}
                </div>
              </div>
            ))}
          {!loading && sessions.length === 0 && (
            <div className="text-sm text-muted-foreground">暂无活跃会话。</div>
          )}
        </div>
      </AccountSection>
      <AccountSection>
        <h2 className="text-base">最近登录记录</h2>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          {loading && <span>正在加载登录记录...</span>}
          {!loading &&
            loginEvents.map((event) => (
              <span key={event.id}>
                {event.email ?? "未知账号"} · {event.outcome === "success" ? "成功" : "失败"} ·{" "}
                {formatSessionRegion(event)} · {formatDateTime(event.createdAt)}
              </span>
            ))}
          {!loading && loginEvents.length === 0 && <span>暂无登录记录。</span>}
        </div>
      </AccountSection>
    </AccountPageFrame>
  );
}
