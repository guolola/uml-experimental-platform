// Hosts the public authentication routes and their API-backed submission flows.
import { FormEvent, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import type { AuthRoutePath } from "../../../shared/lib/app-route-types";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import {
  getQueryParam,
  getSafeRedirectPath,
  localizeAuthMessage,
} from "../lib/auth-page-routing";
import { formatDateTime } from "../lib/project-workspace-presentation";
import {
  notifyAuthSessionChanged,
  platformApi,
  type PlatformMfaChallenge,
} from "../services/platform-api";

type Navigate = (path: string) => void;

const REMEMBERED_LOGIN_EMAIL_STORAGE_KEY = "uml-auth-remembered-email";
const REMEMBERED_LOGIN_PASSWORD_STORAGE_KEY = "uml-auth-remembered-password";

function readRememberedLoginCredentials() {
  if (typeof window === "undefined") {
    return { email: "", password: "" };
  }
  return {
    email: localStorage.getItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY) ?? "",
    password: localStorage.getItem(REMEMBERED_LOGIN_PASSWORD_STORAGE_KEY) ?? "",
  };
}

function writeRememberedLoginCredentials(
  credentials: { email: string; password: string },
  remember: boolean,
) {
  if (typeof window === "undefined") return;
  if (remember) {
    localStorage.setItem(
      REMEMBERED_LOGIN_EMAIL_STORAGE_KEY,
      credentials.email.trim(),
    );
    localStorage.setItem(
      REMEMBERED_LOGIN_PASSWORD_STORAGE_KEY,
      credentials.password,
    );
    return;
  }
  localStorage.removeItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY);
  localStorage.removeItem(REMEMBERED_LOGIN_PASSWORD_STORAGE_KEY);
}

function AuthSecurityPanel() {
  const workflowSteps = [
    { label: "需求", status: "done" },
    { label: "设计", status: "done" },
    { label: "代码", status: "active" },
    { label: "说明书", status: "idle" },
  ];

  return (
    <aside
      data-testid="auth-security-panel"
      data-motion="auth-security"
      className="motion-auth-security-panel relative hidden min-h-full w-full overflow-hidden bg-muted p-8 md:flex md:w-1/2 md:items-center md:justify-center"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-muted via-background/80 to-accent/70" />
      <div className="relative z-10 w-full max-w-sm">
        <div
          data-testid="auth-lifecycle-card"
          className="motion-auth-card group rotate-[-2deg] rounded-xl border border-border/70 bg-card/80 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 ease-in-out hover:-translate-y-1 hover:rotate-[-1deg] hover:shadow-xl"
        >
          <div className="mb-6 flex items-center">
            <span className="mr-3 inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <GitBranch className="size-5" />
            </span>
            <div>
              <div className="font-display text-xl font-semibold leading-7 text-card-foreground">项目开发生命周期</div>
              <div className="text-sm leading-5 text-muted-foreground">v2.4.1 迭代中</div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-medium leading-5 text-card-foreground">流程跟踪 (Process)</div>
              <div className="flex items-start px-2">
                {workflowSteps.map((step, index) => (
                  <div key={step.label} className="contents">
                    <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                      {step.status === "done" ? (
                        <CheckCircle2 className="size-5 text-success" />
                      ) : step.status === "active" ? (
                        <Code2 className="size-5 text-primary" />
                      ) : (
                        <span className="mt-0.5 size-4 rounded-full border border-muted-foreground/40" />
                      )}
                      <span className={step.status === "active" ? "text-[10px] font-bold text-primary" : "text-[10px] text-muted-foreground"}>
                        {step.label}
                      </span>
                    </div>
                    {index < workflowSteps.length - 1 && (
                      <div
                        data-testid={index < 2 ? "auth-progress-shimmer" : undefined}
                        className={
                          index < 1
                            ? "progress-shimmer mt-2 h-0.5 flex-1 bg-success"
                            : index === 1
                              ? "progress-shimmer mt-2 h-0.5 flex-1 bg-primary"
                              : "mt-2 h-0.5 flex-1 bg-border"
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium leading-5 text-card-foreground">UML模型预览</div>
              <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/70 p-3">
                <div className="flex gap-2">
                  <div className="h-12 flex-1 rounded border border-primary/40 bg-card/70 p-1">
                    <div className="mb-1 h-2 w-2/3 rounded bg-primary/20" />
                    <div className="mb-0.5 h-1 w-full rounded bg-border" />
                    <div className="h-1 w-full rounded bg-border" />
                  </div>
                  <div className="h-12 flex-1 rounded border border-info/40 bg-card/70 p-1">
                    <div className="mb-1 h-2 w-2/3 rounded bg-info/20" />
                    <div className="mb-0.5 h-1 w-full rounded bg-border" />
                    <div className="h-1 w-full rounded bg-border" />
                  </div>
                </div>
                <div className="relative h-px bg-border">
                  <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 bg-card px-1 text-muted-foreground">
                    <ArrowRight className="size-3" />
                  </span>
                </div>
                <div className="flex h-8 items-center justify-center rounded border border-border bg-card/70 px-2">
                  <div className="h-2 w-1/2 rounded bg-border" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
            <span className="rounded bg-muted px-2 py-1 font-mono text-xs font-medium leading-4 text-muted-foreground">Project-Main</span>
            <span className="flex items-center gap-1 text-sm leading-5 text-muted-foreground">
              <span className="size-2 rounded-full bg-success motion-auth-pulse" />
              编译成功
            </span>
          </div>
        </div>

        <div className="motion-auth-card group absolute bottom-12 right-8 w-48 rotate-[4deg] rounded-lg border border-border/70 bg-card/80 p-4 shadow-lg backdrop-blur-xl transition-all duration-300 ease-in-out hover:-translate-y-1 hover:rotate-[3deg] hover:shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="size-4 text-info" />
            <span className="font-display text-sm font-semibold leading-5 text-card-foreground">API 延迟</span>
          </div>
          <div
            data-testid="auth-api-latency-value"
            className="font-mono text-xl font-medium leading-7 text-primary transition-colors duration-300 group-hover:text-primary/80"
          >
            24ms
          </div>
          <div className="mt-2 flex h-8 items-end gap-1">
            {[40, 60, 30, 80, 50].map((height, index) => (
              <span
                key={height}
                data-testid={index === 3 ? "auth-progress-shimmer" : undefined}
                className={index === 3 ? "progress-shimmer w-full rounded-t-sm bg-primary" : "w-full rounded-t-sm bg-border"}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AuthPage({
  path,
  onNavigate,
}: {
  path: AuthRoutePath;
  onNavigate: Navigate;
}) {
  const [email, setEmail] = useState(() =>
    path === "/login" ? readRememberedLoginCredentials().email : "",
  );
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(() =>
    path === "/login" ? readRememberedLoginCredentials().password : "",
  );
  const [rememberLogin, setRememberLogin] = useState(() =>
    path === "/login" && Boolean(readRememberedLoginCredentials().email),
  );
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<PlatformMfaChallenge | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [invitationToken, setInvitationToken] = useState(() => {
    if (typeof window === "undefined" || path !== "/register") {
      return "";
    }
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("invitationToken") ??
      params.get("invite") ??
      params.get("token") ??
      ""
    );
  });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const urlToken =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("token") ?? "";
  const [verificationToken, setVerificationToken] = useState(() => urlToken);
  const queryEmail = getQueryParam("email");
  const redirectPath = getSafeRedirectPath();

  useEffect(() => {
    if (path === "/verify-email") {
      setVerificationToken(urlToken);
    }
  }, [path, urlToken]);

  useEffect(() => {
    setShowPassword(false);
    if (path !== "/login") return;
    const rememberedCredentials = readRememberedLoginCredentials();
    setRememberLogin(Boolean(rememberedCredentials.email));
    if (queryEmail) {
      setEmail(queryEmail);
      setPassword("");
    } else if (rememberedCredentials.email) {
      setEmail(rememberedCredentials.email);
      setPassword(rememberedCredentials.password);
    }
  }, [path, queryEmail]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      if (path === "/login") {
        if (mfaChallenge) {
          await platformApi.verifyMfa({
            challengeId: mfaChallenge.challengeId,
            code: mfaCode,
          });
          writeRememberedLoginCredentials({ email, password }, rememberLogin);
          notifyAuthSessionChanged();
          setMessage("MFA 验证通过，正在进入项目首页。");
          onNavigate(redirectPath);
          return;
        }
        const response = await platformApi.login({ identifier: email, password });
        const nextMfaChallenge =
          response.mfaChallenge ??
          (response.mfa?.required && response.mfa.challengeId
            ? {
                challengeId: response.mfa.challengeId,
                expiresAt: response.mfa.expiresAt,
              }
            : null);
        if (nextMfaChallenge) {
          setMfaChallenge(nextMfaChallenge);
          setMfaCode("");
          setMessage("请输入认证器中的 6 位验证码完成登录。");
          return;
        }
        writeRememberedLoginCredentials({ email, password }, rememberLogin);
        notifyAuthSessionChanged();
        setMessage("登录成功，正在进入项目首页。");
        onNavigate(redirectPath);
        return;
      }
      if (path === "/register") {
        if (!termsAccepted) {
          setMessage("请先阅读并同意服务条款。");
          return;
        }
        const trimmedInvitationToken = invitationToken.trim();
        await platformApi.register({
          email,
          username: username.trim(),
          password,
          displayName: displayName.trim(),
          ...(trimmedInvitationToken
            ? { invitationToken: trimmedInvitationToken }
            : {}),
        });
        if (trimmedInvitationToken) {
          await platformApi.acceptInvitation(trimmedInvitationToken);
          onNavigate(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
          return;
        }
        onNavigate(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
        return;
      }
      if (path === "/forgot-password") {
        await platformApi.forgotPassword({ email });
        setMessage(`如果邮箱存在，重置邮件会发送到 ${email || "你的邮箱"}。`);
        return;
      }
      if (path === "/reset-password") {
        if (!urlToken) {
          setMessage("重置链接缺少 token，请重新申请。");
          return;
        }
        await platformApi.resetPassword({ token: urlToken, newPassword: password });
        setMessage("密码已重置，请重新登录。");
        return;
      }
      if (path === "/verify-email") {
        const token = urlToken || verificationToken.trim();
        if (token) {
          await platformApi.verifyEmail({ token });
          const loginEmail = email || queryEmail;
          setMessage("邮箱验证已完成，正在前往登录。");
          onNavigate(
            loginEmail ? `/login?email=${encodeURIComponent(loginEmail)}` : "/login",
          );
          return;
        }
        await platformApi.resendVerification({ email: email || queryEmail });
        setMessage("验证邮件已重新发送，请复制邮件中的短期 token 到本页完成验证。");
        return;
      }
      if (urlToken) {
        await platformApi.verifyEmail({ token: urlToken });
        setMessage("邮箱验证已完成。");
        return;
      }
      await platformApi.resendVerification({ email: email || queryEmail });
      setMessage("验证邮件已重新发送。");
    } catch (error) {
      if (
        path === "/login" &&
        error instanceof Error &&
        error.message.includes("Email verification is required")
      ) {
        onNavigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setMessage(error instanceof Error ? localizeAuthMessage(error.message) : "认证请求失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<AuthRoutePath, string> = {
    "/login": "登录",
    "/register": "创建账号",
    "/verify-email": "验证邮箱",
    "/forgot-password": "找回密码",
    "/reset-password": "重置密码",
  };
  const descriptions: Record<AuthRoutePath, string> = {
    "/login": "输入账号信息，进入软件工程实践平台。",
    "/register": "创建账号后，请先完成邮箱验证再进入项目空间。",
    "/verify-email": "请确认您的电子邮箱以继续使用软件工程实践平台。",
    "/forgot-password": "请输入您注册时使用的电子邮箱地址，我们将向您发送一封包含密码重置链接的邮件。",
    "/reset-password": "请输入您的新密码。为保证安全，建议使用包含字母、数字和符号的强密码。",
  };
  const passwordStrength =
    password.length >= 12 ? "强" : password.length >= 8 ? "中" : "弱";
  const authPrimaryActionClass =
    "motion-action h-12 w-full rounded-lg px-6 font-display text-xl font-semibold leading-7 shadow-sm hover:shadow-md";
  const authTextActionClass =
    "motion-action font-medium text-primary underline-offset-4 hover:underline";
  const authInputClass =
    "motion-auth-input h-12 rounded-lg bg-card px-4 text-base leading-6 text-foreground placeholder:text-muted-foreground";
  const submitLabel =
    path === "/login"
      ? mfaChallenge
        ? "验证 MFA"
        : "登录"
      : path === "/register"
        ? "注册并发送验证邮件"
        : path === "/verify-email"
          ? urlToken || verificationToken.trim()
            ? "完成邮箱验证"
            : "重新发送验证邮件"
          : path === "/forgot-password"
            ? "发送重置邮件"
            : "重置密码";

  return (
    <main
      data-testid="auth-shell"
      data-auth-layout="design-replica-card"
      data-motion="auth-shell"
      className="relative min-h-0 flex-1 overflow-auto bg-background text-foreground"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/70 to-accent/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
      </div>
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10 md:px-12">
        <div className="motion-auth-shell-card flex w-full max-w-[1000px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-xl md:flex-row">
          <section
            data-testid="auth-form-panel"
            data-motion="auth-form"
            className="motion-auth-form-panel relative flex w-full flex-col justify-center p-8 md:w-1/2 md:p-12"
          >
            <LanguagePreferenceMenu className="motion-action absolute right-4 top-4 size-10 rounded-full bg-transparent text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground md:right-5 md:top-5" />
            <button
              type="button"
              className="motion-auth-brand mb-8 pr-12 text-left"
              style={{ "--motion-delay": "40ms" } as CSSProperties}
              onClick={() => onNavigate("/")}
              aria-label="返回官网"
            >
              <div className="font-display text-[32px] font-semibold leading-10 text-primary">软件工程实践平台</div>
              <div className="mt-2 text-base leading-6 text-muted-foreground">
                {path === "/login" ? "欢迎回来，请登录以继续。" : "面向课程实验与项目协作的智能研发空间"}
              </div>
            </button>
            <div
              className="motion-auth-title mb-6"
              style={{ "--motion-delay": "100ms" } as CSSProperties}
            >
              <h1 className="font-display text-2xl font-semibold leading-8 text-foreground">
                {path === "/verify-email" ? "验证您的邮箱" : titles[path]}
              </h1>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                {descriptions[path]}
              </p>
            </div>
            <form className="motion-auth-form grid gap-6" onSubmit={submit}>
              {path !== "/reset-password" && (
                <div className="grid gap-2">
                  <Label htmlFor="auth-email" className="text-sm font-medium leading-5 text-foreground">
                    {path === "/login"
                      ? "邮箱或用户名"
                      : path === "/forgot-password"
                        ? "电子邮箱"
                        : "邮箱地址"}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-email"
                      aria-label={path === "/login" ? "邮箱或用户名" : "邮箱"}
                      type={path === "/login" ? "text" : "email"}
                      value={email || (path === "/verify-email" ? queryEmail : "")}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/login" ? "邮箱或用户名" : "name@example.edu"}
                      required={path !== "/verify-email" || !urlToken}
                      className={`${authInputClass} pl-10`}
                    />
                  </div>
                </div>
              )}
              {(path === "/login" || path === "/register" || path === "/reset-password") && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="auth-password" className="text-sm font-medium leading-5 text-foreground">
                      {path === "/reset-password" ? "新密码" : "密码"}
                    </Label>
                    {path === "/login" && (
                      <button
                        type="button"
                        className={`${authTextActionClass} text-sm leading-5`}
                        onClick={() => onNavigate("/forgot-password")}
                      >
                        忘记密码？
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-password"
                      aria-label={path === "/reset-password" ? "新密码" : "密码"}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/register" ? "至少 8 个字符" : "••••••••"}
                      required
                      className={`${authInputClass} pl-10 pr-12`}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      title={showPassword ? "隐藏密码" : "显示密码"}
                      className="motion-action absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>
                  {path !== "/login" && (
                    <div className="grid gap-2">
                      {path === "/register" && (
                        <div className="grid grid-cols-3 gap-1">
                          <span className="h-1.5 rounded-full bg-primary" />
                          <span className="h-1.5 rounded-full bg-border" />
                          <span className="h-1.5 rounded-full bg-border" />
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        密码强度：{passwordStrength}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {path === "/login" && (
                <div className="flex items-center">
                  <input
                    className="size-4 rounded border-border bg-input-background accent-primary"
                    id="auth-remember"
                    type="checkbox"
                    checked={rememberLogin}
                    onChange={(event) => setRememberLogin(event.target.checked)}
                  />
                  <Label htmlFor="auth-remember" className="ml-2 text-sm leading-5 text-muted-foreground">
                    记住我
                  </Label>
                </div>
              )}
              {path === "/login" && mfaChallenge && (
                <div className="motion-status grid gap-2 rounded-lg border border-border bg-muted p-3">
                  <Label htmlFor="auth-mfa-code" className="text-sm font-medium text-foreground">MFA 验证码</Label>
                  <Input
                    id="auth-mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="6 位验证码"
                    required
                    className={authInputClass}
                  />
                  <span className="text-xs text-muted-foreground">
                    请输入认证器中的 6 位验证码完成登录。
                    {mfaChallenge.expiresAt
                      ? ` 本次挑战过期时间：${formatDateTime(mfaChallenge.expiresAt)}。`
                      : ""}
                  </span>
                </div>
              )}
              {path === "/register" && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-username" className="text-sm font-medium leading-5 text-foreground">
                      用户名
                    </Label>
                    <Input
                      id="auth-username"
                      aria-label="用户名"
                      value={username}
                      onChange={(event) => setUsername(event.target.value.toLowerCase())}
                      pattern="[a-z0-9_]{3,32}"
                      title="用户名需为 3-32 位小写字母、数字或下划线"
                      placeholder="teacher_001"
                      required
                      className={authInputClass}
                    />
                    <span className="text-xs leading-5 text-muted-foreground">
                      3-32 位小写字母、数字或下划线，可用于登录。
                    </span>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-display-name" className="text-sm font-medium leading-5 text-foreground">
                      昵称
                    </Label>
                    <Input
                      id="auth-display-name"
                      aria-label="昵称"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="王老师"
                      required
                      className={authInputClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="invite-code" className="text-sm font-medium leading-5 text-foreground">
                      邀请码 <span className="font-normal text-muted-foreground">（选填）</span>
                    </Label>
                    <Input
                      id="invite-code"
                      aria-label="邀请码"
                      value={invitationToken}
                      onChange={(event) => setInvitationToken(event.target.value)}
                      placeholder="如有邀请码，请在此输入"
                      className={authInputClass}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="terms"
                      checked={termsAccepted}
                      onChange={(event) => setTermsAccepted(event.target.checked)}
                      className="size-4 rounded border-border accent-primary"
                    />
                    <Label htmlFor="terms" className="text-sm text-muted-foreground">
                      我已阅读并同意服务条款
                    </Label>
                  </div>
                </>
              )}
              {path === "/verify-email" && (
                <>
                  <div className="motion-status rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
                    {getQueryParam("sent")
                      ? `验证邮件已发送到 ${queryEmail || "你的邮箱"}。请点击邮件中的验证链接，或复制短期 token 到下方完成验证。`
                      : "请点击邮件中的验证链接，或复制短期 token 到下方完成验证。"}
                  </div>
                  {!urlToken && (
                    <div className="grid gap-2">
                      <Label htmlFor="auth-verification-token" className="text-sm font-medium leading-5 text-foreground">
                        邮件验证码 / 短期 token
                      </Label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="auth-verification-token"
                          aria-label="邮件验证码 / 短期 token"
                          value={verificationToken}
                          onChange={(event) => setVerificationToken(event.target.value)}
                          placeholder="粘贴邮件中的短期 token"
                          className={`${authInputClass} pl-10`}
                        />
                      </div>
                      <span className="text-xs leading-5 text-muted-foreground">
                        没有收到邮件时，可保持此处为空并点击重新发送验证邮件。
                      </span>
                    </div>
                  )}
                </>
              )}
              <Button type="submit" disabled={submitting} className={authPrimaryActionClass}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitLabel}
              </Button>
              {path === "/login" && (
                <p className="text-center text-sm leading-5 text-muted-foreground">
                  还没有账号？{" "}
                  <button type="button" className={authTextActionClass} onClick={() => onNavigate("/register")}>
                    创建账号
                  </button>
                </p>
              )}
              {path === "/register" && (
                <p className="text-center text-sm leading-5 text-muted-foreground">
                  已有账号？{" "}
                  <button type="button" className={authTextActionClass} onClick={() => onNavigate("/login")}>
                    去登录
                  </button>
                </p>
              )}
              {path !== "/login" && path !== "/register" && (
                <Button type="button" variant="ghost" className="motion-action w-fit px-0 text-primary hover:bg-transparent hover:text-primary/80" onClick={() => onNavigate("/login")}>
                  返回登录
                </Button>
              )}
              {message && (
                <div className="motion-status rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
                  {message}
                </div>
              )}
            </form>
          </section>
          <AuthSecurityPanel />
        </div>
      </div>
    </main>
  );
}
