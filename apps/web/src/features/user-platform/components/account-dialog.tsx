// Hosts the top-bar account modal for profile, MFA, sessions, and login-state actions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  CheckCircle2,
  History,
  KeyRound,
  Laptop,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Monitor,
  Settings,
  Shield,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GlobalSettingsPanel } from "../../settings/components/global-settings-panel";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { ScaleToFitFrame, ScaledTable } from "../../../shared/ui/scale-to-fit";
import { Separator } from "../../../shared/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { cn } from "../../../shared/ui/utils";
import { formatSessionDevice, formatSessionRegion } from "../lib/session-device";
import {
  ACCOUNT_SESSION_RECORD_LIMIT,
  AVATAR_FILE_TYPES,
  MAX_AVATAR_BYTES,
  accountStatusLabel,
  formatDate,
  initials,
  loginDetail,
  loginOutcomeLabel,
} from "../lib/account-dialog-formatting";
import {
  notifyAuthSessionChanged,
  platformApi,
  PlatformApiError,
  type PlatformAccountSession,
  type PlatformLoginEvent,
  type PlatformMfaSetup,
  type PlatformUser,
} from "../services/platform-api";
import { AccountAvatarPreview } from "./account-avatar-preview";
import { MfaSetupPanel } from "./mfa-setup-panel";

type AccountDialogProps = {
  onNavigate: (route: string) => void;
  initialUser?: PlatformUser | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function AccountDialog({
  onNavigate,
  initialUser = null,
  open: controlledOpen,
  onOpenChange,
}: AccountDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<PlatformUser | null>(initialUser);
  const [displayName, setDisplayName] = useState(initialUser?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialUser?.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<PlatformMfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [sessions, setSessions] = useState<PlatformAccountSession[]>([]);
  const [events, setEvents] = useState<PlatformLoginEvent[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const openLocationRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!initialUser) return;
    setUser(initialUser);
    setDisplayName(initialUser.displayName);
    setAvatarUrl(initialUser.avatarUrl ?? "");
  }, [initialUser]);

  useEffect(() => {
    let active = true;
    if (initialUser) {
      return () => {
        active = false;
      };
    }
    platformApi
      .me()
      .then((response) => {
        if (!active) return;
        setUser(response.user ?? null);
        setDisplayName(response.user?.displayName ?? "");
        setAvatarUrl(response.user?.avatarUrl ?? "");
        setCurrentSessionId(response.session?.id ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, [initialUser]);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setLoading(true);
    setStatus("");
    Promise.all([
      platformApi.getAccountProfile(),
      platformApi.listAccountSessions(),
      platformApi.listLoginEvents(),
    ])
      .then(([profile, sessionResponse, eventResponse]) => {
        if (!active) return;
        setUser(profile.user);
        setDisplayName(profile.user.displayName);
        setAvatarUrl(profile.user.avatarUrl ?? "");
        setAvatarFile(null);
        setAvatarError("");
        setMfaEnabled(Boolean(profile.mfa?.enabled ?? profile.user.mfaEnabled));
        setCurrentSessionId(profile.session?.id ?? null);
        setSessions(sessionResponse.sessions);
        setEvents(eventResponse.events);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof PlatformApiError && error.status === 401) {
          setUser(null);
          return;
        }
        setStatus(error instanceof Error ? error.message : t("account.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, t, userId]);

  const title = useMemo(() => user?.displayName || user?.email || t("auth.login"), [t, user]);
  const avatarPreviewSrc = avatarPreviewUrl || avatarUrl;
  const accountStatus = accountStatusLabel(user?.status, {
    active: t("account.normal"),
    disabled: t("account.disabled"),
    pending: t("account.pending"),
    unknown: t("account.unknown"),
  });
  const visibleSessions = sessions.slice(0, ACCOUNT_SESSION_RECORD_LIMIT);
  const visibleEvents = events.slice(0, ACCOUNT_SESSION_RECORD_LIMIT);

  useEffect(() => {
    openLocationRef.current = open
      ? `${window.location.pathname}${window.location.search}`
      : null;
  }, [open]);

  useEffect(() => {
    const closeIfLocationChanged = () => {
      const openedAt = openLocationRef.current;
      if (!openedAt) return;
      const currentLocation = `${window.location.pathname}${window.location.search}`;
      if (currentLocation !== openedAt) {
        setDialogOpen(false);
      }
    };
    const closeForRouteChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail.path !== "string") return;
      closeIfLocationChanged();
    };
    window.addEventListener("uml-route-change", closeForRouteChange);
    window.addEventListener("popstate", closeIfLocationChanged);
    return () => {
      window.removeEventListener("uml-route-change", closeForRouteChange);
      window.removeEventListener("popstate", closeIfLocationChanged);
    };
  }, [setDialogOpen]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const selectAvatarFile = (file: File | null) => {
    setAvatarError("");
    const clearPendingAvatar = () => {
      setAvatarFile(null);
      setAvatarPreviewUrl((current) => {
        if (current && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(current);
        }
        return "";
      });
    };

    if (!file) {
      clearPendingAvatar();
      return;
    }
    if (!AVATAR_FILE_TYPES.includes(file.type)) {
      clearPendingAvatar();
      setAvatarError(t("account.avatarTypeError"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      clearPendingAvatar();
      setAvatarError(t("account.avatarSizeError"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAvatarPreviewUrl((current) => {
      if (current && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(current);
      }
      return objectUrl;
    });
    setAvatarFile(file);
  };

  const closeAccountDialog = () => {
    setDialogOpen(false);
  };

  const keepAccountDialogOpen = useCallback(() => {
    dialogContentRef.current?.focus({ preventScroll: true });
    setDialogOpen(true);
    window.setTimeout(() => {
      setDialogOpen(true);
      dialogContentRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [setDialogOpen]);

  const saveProfile = async () => {
    try {
      let response = await platformApi.updateAccountProfile({
        displayName,
        avatarUrl: avatarUrl.trim() || null,
      });
      if (avatarFile) {
        response = await platformApi.uploadAccountAvatar(avatarFile);
      }
      setUser(response.user);
      setAvatarUrl(response.user.avatarUrl ?? "");
      setCurrentSessionId(response.session?.id ?? currentSessionId);
      setAvatarFile(null);
      setAvatarError("");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl("");
      toast.success(t("account.profileSaved"));
    } catch (error) {
      toast.error(t("account.profileSaveFailed"));
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error(t("account.passwordRequired"));
      return;
    }

    setPasswordSubmitting(true);
    try {
      const response = await platformApi.changePassword({
        currentPassword,
        newPassword,
      });
      if (response.user) setUser(response.user);
      setCurrentSessionId(response.session?.id ?? currentSessionId);
      setCurrentPassword("");
      setNewPassword("");
      const refreshed = await platformApi.listAccountSessions().catch(() => null);
      if (refreshed) setSessions(refreshed.sessions);
      toast.success(t("account.passwordChanged"));
    } catch (error) {
      toast.error(t("account.passwordChangeFailed"));
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const logout = async () => {
    await platformApi.logout().catch((error) => {
      toast.error(t("account.logoutFailed"));
    });
    setUser(null);
    setSessions([]);
    setEvents([]);
    setCurrentSessionId(null);
    setMfaSetup(null);
    setMfaCode("");
    setDisableCode("");
    setCurrentPassword("");
    setNewPassword("");
    setPasswordSubmitting(false);
    setAvatarFile(null);
    setAvatarError("");
    if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl("");
    setDialogOpen(false);
    onNavigate("/login");
    notifyAuthSessionChanged();
  };

  const revokeOtherSessions = async () => {
    try {
      const result = await platformApi.revokeOtherSessions();
      const refreshed = await platformApi.listAccountSessions();
      setSessions(refreshed.sessions);
      toast.success(t("account.revokedOthers", { count: result.revokedCount }));
    } catch (error) {
      toast.error(t("account.revokeFailed"));
    }
  };

  const startMfaSetup = async () => {
    try {
      const setup = await platformApi.setupMfa();
      setMfaSetup(setup);
      toast.success(t("account.mfaSetupReady"));
    } catch (error) {
      toast.error(t("account.mfaSetupFailed"));
    }
  };

  const confirmMfa = async () => {
    try {
      const response = await platformApi.confirmMfa({ code: mfaCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setMfaSetup(null);
      setMfaCode("");
      toast.success(t("account.mfaEnabledSuccess"));
    } catch (error) {
      toast.error(t("account.mfaEnableFailed"));
    }
  };

  const disableMfa = async () => {
    const trimmedCode = disableCode.trim();
    if (!trimmedCode) {
      toast.error(t("account.disableCodeRequired"));
      return;
    }

    try {
      const response = await platformApi.updateMfa({ enabled: false, code: trimmedCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setDisableCode("");
      toast.success(t("account.mfaDisabledSuccess"));
    } catch (error) {
      toast.error(t("account.mfaDisableFailed"));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDialogOpen(true);
      }}
    >
      <DialogTrigger
        type="button"
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary p-1 text-sm font-medium text-secondary-foreground shadow-none hover:bg-secondary/80 md:h-10 md:w-auto md:justify-start md:gap-2 md:py-1 md:pl-1 md:pr-3",
          "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        )}
        aria-label={user ? t("auth.account") : t("auth.login")}
        title={user ? t("auth.account") : t("auth.login")}
      >
        <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary text-xs text-primary-foreground">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            initials(user)
          )}
        </span>
        <span className="hidden max-w-24 truncate md:inline">{title}</span>
        {user ? (
          <ShieldCheck className="hidden size-5 text-muted-foreground md:block" />
        ) : (
          <LogIn className="hidden size-5 text-muted-foreground md:block" />
        )}
      </DialogTrigger>
      <DialogContent
        ref={dialogContentRef}
        hideCloseButton
        tabIndex={-1}
        className="max-h-[88vh] overflow-hidden p-0 sm:max-w-[900px]"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
      >
        <button
          type="button"
          data-slot="dialog-close"
          className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 z-10 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          onClick={closeAccountDialog}
        >
          <X />
          <span className="sr-only">{t("account.close")}</span>
        </button>
        {!user ? (
          <div className="grid gap-4 p-6">
            <DialogHeader>
              <DialogTitle>{t("auth.loginAccount")}</DialogTitle>
              <DialogDescription>{t("auth.loginDialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("auth.guestRestriction")}
            </div>
            <Button
              onClick={() => {
                setDialogOpen(false);
                onNavigate("/login");
              }}
            >
              <LogIn className="size-4" />
              {t("auth.goToLogin")}
            </Button>
          </div>
        ) : (
          <ScaleToFitFrame minWidth={900} contentClassName="w-[900px]">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-[min(85vh,700px)] min-h-0 flex-row gap-0 overflow-hidden">
            <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30 p-4">
              <DialogHeader className="mb-4 flex-row items-center gap-3 space-y-0 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm">
                  <Settings className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-base">{t("account.settings")}</DialogTitle>
                  <DialogDescription className="truncate text-xs">
                    {t("account.preferences")}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <TabsList className="h-auto w-full flex-col items-stretch justify-start overflow-visible rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="profile"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <User className="size-4" />
                  {t("account.profile")}
                </TabsTrigger>
                <TabsTrigger
                  value="security"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Shield className="size-4" />
                  {t("account.security")}
                </TabsTrigger>
                <TabsTrigger
                  value="sessions"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Monitor className="size-4" />
                  {t("account.sessions")}
                </TabsTrigger>
                <TabsTrigger
                  value="global"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Settings className="size-4" />
                  {t("account.globalSettings")}
                </TabsTrigger>
              </TabsList>

              <div className="mt-auto pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center text-muted-foreground hover:text-destructive"
                  onClick={logout}
                >
                  <LogOut className="size-4" />
                  {t("account.logout")}
                </Button>
              </div>
            </aside>

            <main className="min-w-0 flex-1 overflow-y-auto bg-background p-8">
              {loading && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("account.loading")}
                </div>
              )}
              {status && <div className="mb-4 rounded-md border border-border bg-muted p-3 text-sm">{status}</div>}

              <TabsContent value="profile" className="m-0 space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-foreground">{t("account.profileTitle")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("account.profileDescription")}</p>
                </div>

                <div className="flex flex-row gap-8">
                  <div className="flex shrink-0 flex-col items-center gap-4">
                    <input
                      ref={avatarInputRef}
                      id="account-avatar-file"
                      aria-label={t("account.avatarAria")}
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => selectAvatarFile(event.target.files?.[0] ?? null)}
                    />
                    <label
                      htmlFor="account-avatar-file"
                      className="group relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl font-semibold text-primary shadow-sm"
                    >
                      <AccountAvatarPreview src={avatarPreviewSrc} user={user} />
                      <span className="absolute inset-0 flex items-center justify-center bg-background/75 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="size-5" />
                      </span>
                    </label>
                    <Badge variant="outline" className="border-emerald-600/20 bg-emerald-500/10 text-emerald-700">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {accountStatus}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <Camera className="size-4" />
                      {t("account.changeAvatar")}
                    </Button>
                    <div className="max-w-40 text-center text-xs leading-5 text-muted-foreground">
                      {t("account.avatarHint")}
                    </div>
                    {avatarFile && (
                      <div className="max-w-40 truncate text-xs text-muted-foreground">
                        {t("account.avatarSelected", { name: avatarFile.name })}
                      </div>
                    )}
                    {avatarError && <p className="max-w-44 text-center text-xs text-destructive">{avatarError}</p>}
                  </div>

                  <div className="grid min-w-0 flex-1 gap-5">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-display-name">{t("account.displayName")}</Label>
                      <Input
                        id="account-display-name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder={t("account.displayNamePlaceholder")}
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="account-email">{t("account.email")}</Label>
                      <div className="flex flex-row items-center gap-2">
                        <Input
                          id="account-email"
                          value={user.email}
                          readOnly
                          className="bg-muted/50 text-muted-foreground"
                        />
                        <Badge variant="outline" className="w-fit text-primary">
                          {user.emailVerified ? (
                            <>
                              <CheckCircle2 className="size-3" />
                              {t("account.verified")}
                            </>
                          ) : (
                            t("account.unverified")
                          )}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Mail className="size-4 text-muted-foreground" />
                        {t("account.accountStatus")}
                      </div>
                      <div className="flex flex-nowrap gap-2">
                        <Badge variant="outline">{accountStatus}</Badge>
                        <Badge variant="outline">{user.emailVerified ? t("account.emailVerified") : t("account.emailUnverified")}</Badge>
                        <Badge variant="outline">{mfaEnabled ? t("account.mfaEnabled") : t("account.mfaDisabled")}</Badge>
                      </div>
                    </div>

                  </div>
                </div>

                <Separator />
                <div className="flex justify-end">
                  <Button type="button" onClick={() => void saveProfile()}>
                    <User className="size-4" />
                    {t("account.saveProfile")}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="security" className="m-0 space-y-6">
                <div className="flex flex-row items-end justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("account.security")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("account.securityDescription")}</p>
                  </div>
                  <Badge variant="outline" className={cn(mfaEnabled ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700" : "text-muted-foreground")}>
                    <span className={cn("size-1.5 rounded-full", mfaEnabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                    {mfaEnabled ? t("account.mfaEnabled") : t("account.mfaDisabled")}
                  </Badge>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    {t("account.changePassword")}
                  </div>
                  <div className="grid gap-4 text-sm">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-current-password">{t("account.currentPassword")}</Label>
                      <Input
                        id="account-current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-new-password">{t("account.newPassword")}</Label>
                      <Input
                        id="account-new-password"
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={changePassword}
                        disabled={passwordSubmitting || !currentPassword || !newPassword}
                      >
                        {passwordSubmitting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <KeyRound className="size-4" />
                        )}
                        {t("account.changePassword")}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    {t("account.mfaTitle")}
                  </div>
                  {!mfaEnabled && !mfaSetup && (
                    <div className="grid gap-4 text-sm text-muted-foreground">
                      <p>{t("account.mfaDescription")}</p>
                      <div>
                        <Button variant="outline" onClick={startMfaSetup}>
                          <ShieldCheck className="size-4" />
                          {t("account.enableMfa")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {mfaSetup && (
                    <MfaSetupPanel
                      setup={mfaSetup}
                      code={mfaCode}
                      onCodeChange={setMfaCode}
                      onConfirm={confirmMfa}
                      className="bg-background"
                    />
                  )}
                  {mfaEnabled && (
                    <div className="grid gap-3 text-sm">
                      <p className="text-muted-foreground">{t("account.mfaEnabledDescription")}</p>
                      <div className="grid gap-1.5">
                        <Label htmlFor="account-disable-mfa-code">{t("account.disableCode")}</Label>
                        <Input
                          id="account-disable-mfa-code"
                          value={disableCode}
                          onChange={(event) => setDisableCode(event.target.value)}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder={t("account.codePlaceholder")}
                        />
                      </div>
                      <div>
                        <Button variant="outline" onClick={disableMfa} disabled={!disableCode.trim()}>
                          {t("account.disableMfa")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />
                <div className="flex flex-nowrap justify-between gap-2">
                  <Button variant="outline" onClick={revokeOtherSessions}>
                    {t("account.otherDevices")}
                  </Button>
                  <Button variant="ghost" onClick={logout}>
                    <LogOut className="size-4" />
                    {t("account.logout")}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="sessions" className="m-0 space-y-6">
                <div className="flex flex-row items-end justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("account.activeSessions")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("account.activeSessionsDescription")}</p>
                  </div>
                  <Button variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={revokeOtherSessions}>
                    <LogOut className="size-4" />
                    {t("account.revokeOthers")}
                  </Button>
                </div>

                <div className="space-y-3">
                  {visibleSessions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      {t("account.noSessions")}
                    </div>
                  ) : visibleSessions.map((session) => {
                    const isCurrent = session.id === currentSessionId;
                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "relative flex gap-4 rounded-md border border-border p-4 text-sm",
                          isCurrent && "border-primary/40 bg-primary/5 pl-5",
                        )}
                      >
                        {isCurrent && <span className="absolute top-0 bottom-0 left-0 w-1 rounded-l-md bg-primary" />}
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                          <Laptop className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-nowrap items-center gap-2">
                            <span className="font-medium text-foreground">{formatSessionDevice(session.userAgent, t("account.unknownDevice"))}</span>
                            {isCurrent && <Badge variant="outline" className="text-primary">{t("account.currentDevice")}</Badge>}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                            <span>{t("account.region", { value: formatSessionRegion(session, t("account.unknownRegion")) })}</span>
                            <span>{t("account.lastActive", { value: formatDate(session.lastSeenAt, locale, t("account.none")) })}</span>
                            <span>{t("account.expires", { value: formatDate(session.expiresAt, locale, t("account.none")) })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <History className="size-4 text-muted-foreground" />
                    {t("account.loginHistory")}
                  </div>
                  <div className="overflow-hidden rounded-md border border-border">
                    <ScaledTable minWidth={620} className="border-collapse text-left text-sm" aria-label={t("account.loginHistory")}>
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">{t("account.status")}</th>
                          <th className="px-4 py-2 font-medium">{t("account.time")}</th>
                          <th className="px-4 py-2 font-medium">{t("account.regionHeader")}</th>
                          <th className="px-4 py-2 font-medium">{t("account.details")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEvents.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-4 text-center text-sm text-muted-foreground">
                              {t("account.noLoginEvents")}
                            </td>
                          </tr>
                        ) : visibleEvents.map((event) => (
                          <tr key={event.id} className="border-t border-border">
                            <td className={cn("px-4 py-2 font-medium", event.outcome === "success" ? "text-emerald-700" : "text-destructive")}>
                              {loginOutcomeLabel(event.outcome, { success: t("account.success"), failed: t("account.failed") })}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{formatDate(event.createdAt, locale, t("account.none"))}</td>
                            <td className="px-4 py-2">{formatSessionRegion(event, t("account.unknownRegion"))}</td>
                            <td className="max-w-52 truncate px-4 py-2 text-muted-foreground">{loginDetail(event, t("account.noDetails"), t("account.unknownDevice"))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </ScaledTable>
                  </div>
                </div>

              </TabsContent>

              <TabsContent value="global" className="m-0 space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-foreground">{t("account.globalSettings")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("account.globalSettingsDescription")}</p>
                </div>
                <GlobalSettingsPanel
                  active={open && activeTab === "global"}
                  onNavigate={(route) => {
                    setDialogOpen(false);
                    onNavigate(route);
                  }}
                />
              </TabsContent>

              <div className="sr-only" aria-live="polite">
                {currentSessionId ? t("account.currentSession", { id: currentSessionId }) : ""}
              </div>
            </main>
            </Tabs>
          </ScaleToFitFrame>
        )}
      </DialogContent>
    </Dialog>
  );
}
