// Hosts the public authentication routes and their API-backed submission flows.
import { FormEvent, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
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
} from "../lib/auth-page-routing";
import { formatDateTime } from "../lib/project-workspace-presentation";
import {
  notifyAuthSessionChanged,
  platformApi,
  PlatformApiError,
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
  const { t } = useTranslation();
  const workflowSteps = [
    { label: t("auth.page.requirements"), status: "done" },
    { label: t("auth.page.design"), status: "done" },
    { label: t("auth.page.code"), status: "active" },
    { label: t("auth.page.document"), status: "idle" },
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
              <div className="font-display text-xl font-semibold leading-7 text-card-foreground">{t("auth.page.lifecycle")}</div>
              <div className="text-sm leading-5 text-muted-foreground">{t("auth.page.iterating")}</div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-medium leading-5 text-card-foreground">{t("auth.page.process")}</div>
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
              <div className="mb-2 text-sm font-medium leading-5 text-card-foreground">{t("auth.page.umlPreview")}</div>
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
              {t("auth.page.compiled")}
            </span>
          </div>
        </div>

        <div className="motion-auth-card group absolute bottom-12 right-8 w-48 rotate-[4deg] rounded-lg border border-border/70 bg-card/80 p-4 shadow-lg backdrop-blur-xl transition-all duration-300 ease-in-out hover:-translate-y-1 hover:rotate-[3deg] hover:shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="size-4 text-info" />
            <span className="font-display text-sm font-semibold leading-5 text-card-foreground">{t("auth.page.apiLatency")}</span>
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
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
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
          setMessage(t("auth.page.mfaSuccess"));
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
          setMessage(t("auth.page.mfaPrompt"));
          return;
        }
        writeRememberedLoginCredentials({ email, password }, rememberLogin);
        notifyAuthSessionChanged();
        setMessage(t("auth.page.loginSuccess"));
        onNavigate(redirectPath);
        return;
      }
      if (path === "/register") {
        if (!termsAccepted) {
          setMessage(t("auth.page.termsRequired"));
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
        setMessage(t("auth.page.resetSent", { email: email || t("auth.page.yourEmail") }));
        return;
      }
      if (path === "/reset-password") {
        if (!urlToken) {
          setMessage(t("auth.page.resetTokenMissing"));
          return;
        }
        await platformApi.resetPassword({ token: urlToken, newPassword: password });
        setMessage(t("auth.page.resetSuccess"));
        onNavigate("/login");
        return;
      }
      if (path === "/verify-email") {
        const token = urlToken || verificationToken.trim();
        if (token) {
          await platformApi.verifyEmail({ token });
          const loginEmail = email || queryEmail;
          setMessage(t("auth.page.verifySuccessRedirect"));
          onNavigate(
            loginEmail ? `/login?email=${encodeURIComponent(loginEmail)}` : "/login",
          );
          return;
        }
        await platformApi.resendVerification({ email: email || queryEmail });
        setMessage(t("auth.page.verifyResentToken"));
        return;
      }
      if (urlToken) {
        await platformApi.verifyEmail({ token: urlToken });
        setMessage(t("auth.page.verifySuccess"));
        return;
      }
      await platformApi.resendVerification({ email: email || queryEmail });
      setMessage(t("auth.page.verifyResent"));
    } catch (error) {
      if (
        path === "/login" &&
        error instanceof PlatformApiError &&
        error.code === "AUTH_EMAIL_VERIFICATION_REQUIRED"
      ) {
        onNavigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setMessage(error instanceof Error ? error.message : t("auth.page.requestFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<AuthRoutePath, string> = {
    "/login": t("auth.page.loginTitle"),
    "/register": t("auth.page.registerTitle"),
    "/verify-email": t("auth.page.verifyTitle"),
    "/forgot-password": t("auth.page.forgotTitle"),
    "/reset-password": t("auth.page.resetTitle"),
  };
  const descriptions: Record<AuthRoutePath, string> = {
    "/login": t("auth.page.loginDescription"),
    "/register": t("auth.page.registerDescription"),
    "/verify-email": t("auth.page.verifyDescription"),
    "/forgot-password": t("auth.page.forgotDescription"),
    "/reset-password": t("auth.page.resetDescription"),
  };
  const passwordStrength =
    password.length >= 12
      ? t("auth.page.strengthStrong")
      : password.length >= 8
        ? t("auth.page.strengthMedium")
        : t("auth.page.strengthWeak");
  const authPrimaryActionClass =
    "motion-action h-12 w-full rounded-lg px-6 font-display text-xl font-semibold leading-7 shadow-sm hover:shadow-md";
  const authTextActionClass =
    "motion-action font-medium text-primary underline-offset-4 hover:underline";
  const authInputClass =
    "motion-auth-input h-12 rounded-lg bg-card px-4 text-base leading-6 text-foreground placeholder:text-muted-foreground";
  const submitLabel =
    path === "/login"
      ? mfaChallenge
        ? t("auth.page.submitMfa")
        : t("auth.page.submitLogin")
      : path === "/register"
        ? t("auth.page.submitRegister")
        : path === "/verify-email"
          ? urlToken || verificationToken.trim()
            ? t("auth.page.submitVerify")
            : t("auth.page.resendVerify")
          : path === "/forgot-password"
            ? t("auth.page.sendReset")
            : t("auth.page.submitReset");

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
              aria-label={t("auth.page.backHome")}
            >
              <div className="font-display text-[32px] font-semibold leading-10 text-primary">{t("auth.page.platformName")}</div>
              <div className="mt-2 text-base leading-6 text-muted-foreground">
                {path === "/login" ? t("auth.page.welcome") : t("auth.page.productTagline")}
              </div>
            </button>
            <div
              className="motion-auth-title mb-6"
              style={{ "--motion-delay": "100ms" } as CSSProperties}
            >
              <h1 className="font-display text-2xl font-semibold leading-8 text-foreground">
                {path === "/verify-email" ? t("auth.page.verifyHeading") : titles[path]}
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
                      ? t("auth.page.emailOrUsername")
                      : path === "/forgot-password"
                        ? t("auth.page.email")
                        : t("auth.page.emailAddress")}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-email"
                      aria-label={path === "/login" ? t("auth.page.emailOrUsername") : t("auth.page.email")}
                      type={path === "/login" ? "text" : "email"}
                      value={email || (path === "/verify-email" ? queryEmail : "")}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/login" ? t("auth.page.emailOrUsername") : "name@example.edu"}
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
                      {path === "/reset-password" ? t("auth.page.newPassword") : t("auth.page.password")}
                    </Label>
                    {path === "/login" && (
                      <button
                        type="button"
                        className={`${authTextActionClass} text-sm leading-5`}
                        onClick={() => onNavigate("/forgot-password")}
                      >
                        {t("auth.page.forgotPassword")}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-password"
                      aria-label={path === "/reset-password" ? t("auth.page.newPassword") : t("auth.page.password")}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/register" ? t("auth.page.passwordPlaceholder") : "••••••••"}
                      required
                      className={`${authInputClass} pl-10 pr-12`}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? t("auth.page.hidePassword") : t("auth.page.showPassword")}
                      title={showPassword ? t("auth.page.hidePassword") : t("auth.page.showPassword")}
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
                        {t("auth.page.strength", { value: passwordStrength })}
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
                    {t("auth.page.remember")}
                  </Label>
                </div>
              )}
              {path === "/login" && mfaChallenge && (
                <div className="motion-status grid gap-2 rounded-lg border border-border bg-muted p-3">
                  <Label htmlFor="auth-mfa-code" className="text-sm font-medium text-foreground">{t("auth.page.mfaCode")}</Label>
                  <Input
                    id="auth-mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder={t("auth.page.mfaPlaceholder")}
                    required
                    className={authInputClass}
                  />
                  <span className="text-xs text-muted-foreground">
                    {t("auth.page.mfaPrompt")}
                    {mfaChallenge.expiresAt
                      ? ` ${t("auth.page.mfaExpiry", { time: formatDateTime(mfaChallenge.expiresAt, locale) })}`
                      : ""}
                  </span>
                </div>
              )}
              {path === "/register" && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-username" className="text-sm font-medium leading-5 text-foreground">
                      {t("auth.page.username")}
                    </Label>
                    <Input
                      id="auth-username"
                      aria-label={t("auth.page.username")}
                      value={username}
                      onChange={(event) => setUsername(event.target.value.toLowerCase())}
                      pattern="[a-z0-9_]{3,32}"
                      title={t("auth.page.usernameTitle")}
                      placeholder="teacher_001"
                      required
                      className={authInputClass}
                    />
                    <span className="text-xs leading-5 text-muted-foreground">
                      {t("auth.page.usernameHint")}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-display-name" className="text-sm font-medium leading-5 text-foreground">
                      {t("auth.page.displayName")}
                    </Label>
                    <Input
                      id="auth-display-name"
                      aria-label={t("auth.page.displayName")}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder={t("auth.page.displayNamePlaceholder")}
                      required
                      className={authInputClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="invite-code" className="text-sm font-medium leading-5 text-foreground">
                      {t("auth.page.invitation")} <span className="font-normal text-muted-foreground">{t("auth.page.optional")}</span>
                    </Label>
                    <Input
                      id="invite-code"
                      aria-label={t("auth.page.invitation")}
                      value={invitationToken}
                      onChange={(event) => setInvitationToken(event.target.value)}
                      placeholder={t("auth.page.invitationPlaceholder")}
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
                      {t("auth.page.terms")}
                    </Label>
                  </div>
                </>
              )}
              {path === "/verify-email" && (
                <>
                  <div className="motion-status rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
                    {getQueryParam("sent")
                      ? t("auth.page.verifySent", { email: queryEmail || t("auth.page.yourEmail") })
                      : t("auth.page.verifyInstruction")}
                  </div>
                  {!urlToken && (
                    <div className="grid gap-2">
                      <Label htmlFor="auth-verification-token" className="text-sm font-medium leading-5 text-foreground">
                        {t("auth.page.emailToken")}
                      </Label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="auth-verification-token"
                          aria-label={t("auth.page.emailToken")}
                          value={verificationToken}
                          onChange={(event) => setVerificationToken(event.target.value)}
                          placeholder={t("auth.page.tokenPlaceholder")}
                          className={`${authInputClass} pl-10`}
                        />
                      </div>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {t("auth.page.tokenHint")}
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
                  {t("auth.page.noAccount")} {" "}
                  <button type="button" className={authTextActionClass} onClick={() => onNavigate("/register")}>
                    {t("auth.page.createAccount")}
                  </button>
                </p>
              )}
              {path === "/register" && (
                <p className="text-center text-sm leading-5 text-muted-foreground">
                  {t("auth.page.haveAccount")} {" "}
                  <button type="button" className={authTextActionClass} onClick={() => onNavigate("/login")}>
                    {t("auth.page.loginLink")}
                  </button>
                </p>
              )}
              {path !== "/login" && path !== "/register" && (
                <Button type="button" variant="ghost" className="motion-action w-fit px-0 text-primary hover:bg-transparent hover:text-primary/80" onClick={() => onNavigate("/login")}>
                  {t("auth.page.backLogin")}
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
