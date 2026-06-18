// Hosts the top-bar account modal for profile, MFA, sessions, and login-state actions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
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
  generationUsagePrimaryText,
  generationUsageSecondaryText,
  initials,
  loginDetail,
  loginOutcomeLabel,
  type AccountGenerationUsage,
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
  const [generationUsage, setGenerationUsage] = useState<AccountGenerationUsage | null>(null);
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
        setGenerationUsage(profile.generationUsage ?? null);
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
        setStatus(error instanceof Error ? error.message : "账号信息加载失败。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, userId]);

  const title = useMemo(() => user?.displayName || user?.email || "登录", [user]);
  const avatarPreviewSrc = avatarPreviewUrl || avatarUrl;
  const accountStatus = accountStatusLabel(user?.status);
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
      setAvatarError("请选择 PNG、JPG 或 WebP 图片。");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      clearPendingAvatar();
      setAvatarError("头像图片不能超过 2MB。");
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
      setGenerationUsage(response.generationUsage ?? generationUsage);
      setAvatarUrl(response.user.avatarUrl ?? "");
      setCurrentSessionId(response.session?.id ?? currentSessionId);
      setAvatarFile(null);
      setAvatarError("");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl("");
      toast.success("资料已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "资料更新失败");
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("请输入当前密码和新密码");
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
      toast.success("密码已修改，其他设备会话已失效");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const logout = async () => {
    await platformApi.logout().catch((error) => {
      toast.error(error instanceof Error ? error.message : "退出登录失败");
    });
    setUser(null);
    setSessions([]);
    setEvents([]);
    setGenerationUsage(null);
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
      toast.success(`已退出 ${result.revokedCount} 个其他会话`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退出其他设备失败");
    }
  };

  const startMfaSetup = async () => {
    try {
      const setup = await platformApi.setupMfa();
      setMfaSetup(setup);
      toast.success("MFA 设置已生成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MFA 设置生成失败");
    }
  };

  const confirmMfa = async () => {
    try {
      const response = await platformApi.confirmMfa({ code: mfaCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setMfaSetup(null);
      setMfaCode("");
      toast.success("MFA 已启用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MFA 启用失败");
    }
  };

  const disableMfa = async () => {
    const trimmedCode = disableCode.trim();
    if (!trimmedCode) {
      toast.error("请输入停用验证码");
      return;
    }

    try {
      const response = await platformApi.updateMfa({ enabled: false, code: trimmedCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setDisableCode("");
      toast.success("MFA 已停用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MFA 停用失败");
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
        aria-label={user ? "账号" : "登录"}
        title={user ? "账号" : "登录"}
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
          <span className="sr-only">Close</span>
        </button>
        {!user ? (
          <div className="grid gap-4 p-6">
            <DialogHeader>
              <DialogTitle>登录账号</DialogTitle>
              <DialogDescription>登录后才能进入实名项目、托管模型配置和账号安全设置。</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              未登录时不能使用项目、工作台、模型设置和账号安全功能。
            </div>
            <Button
              onClick={() => {
                setDialogOpen(false);
                onNavigate("/login");
              }}
            >
              <LogIn className="size-4" />
              前往登录
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
                  <DialogTitle className="text-base">设置</DialogTitle>
                  <DialogDescription className="truncate text-xs">
                    用户偏好设置
                  </DialogDescription>
                </div>
              </DialogHeader>

              <TabsList className="h-auto w-full flex-col items-stretch justify-start overflow-visible rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="profile"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <User className="size-4" />
                  个人资料
                </TabsTrigger>
                <TabsTrigger
                  value="security"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Shield className="size-4" />
                  安全设置
                </TabsTrigger>
                <TabsTrigger
                  value="sessions"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Monitor className="size-4" />
                  登录会话
                </TabsTrigger>
                <TabsTrigger
                  value="global"
                  className="h-10 flex-none justify-start rounded-md px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Settings className="size-4" />
                  全局设置
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
                  退出登录
                </Button>
              </div>
            </aside>

            <main className="min-w-0 flex-1 overflow-y-auto bg-background p-8">
              {loading && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在加载账号信息...
                </div>
              )}
              {status && <div className="mb-4 rounded-md border border-border bg-muted p-3 text-sm">{status}</div>}

              <TabsContent value="profile" className="m-0 space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-foreground">个人资料信息</h3>
                  <p className="mt-1 text-sm text-muted-foreground">管理你的头像、昵称和账号基础信息。</p>
                </div>

                <div className="flex flex-row gap-8">
                  <div className="flex shrink-0 flex-col items-center gap-4">
                    <input
                      ref={avatarInputRef}
                      id="account-avatar-file"
                      aria-label="头像图片"
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
                      更换头像
                    </Button>
                    <div className="max-w-40 text-center text-xs leading-5 text-muted-foreground">
                      支持 PNG、JPG、WebP，最大 2MB。
                    </div>
                    {avatarFile && (
                      <div className="max-w-40 truncate text-xs text-muted-foreground">
                        已选择：{avatarFile.name}
                      </div>
                    )}
                    {avatarError && <p className="max-w-44 text-center text-xs text-destructive">{avatarError}</p>}
                  </div>

                  <div className="grid min-w-0 flex-1 gap-5">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-display-name">昵称</Label>
                      <Input
                        id="account-display-name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="请输入昵称"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="account-email">电子邮箱</Label>
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
                              已验证
                            </>
                          ) : (
                            "未验证"
                          )}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Mail className="size-4 text-muted-foreground" />
                        账号状态
                      </div>
                      <div className="flex flex-nowrap gap-2">
                        <Badge variant="outline">{accountStatus}</Badge>
                        <Badge variant="outline">{user.emailVerified ? "邮箱已验证" : "邮箱未验证"}</Badge>
                        <Badge variant="outline">{mfaEnabled ? "MFA 已启用" : "MFA 未启用"}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Activity className="size-4 text-muted-foreground" />
                        今日生成次数
                      </div>
                      <div className="flex flex-nowrap gap-2">
                        <Badge variant="outline">{generationUsagePrimaryText(generationUsage)}</Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            generationUsage?.limited && generationUsage.remaining === 0
                              ? "border-destructive/30 text-destructive"
                              : "text-primary",
                          )}
                        >
                          {generationUsageSecondaryText(generationUsage)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />
                <div className="flex justify-end">
                  <Button type="button" onClick={() => void saveProfile()}>
                    <User className="size-4" />
                    保存资料
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="security" className="m-0 space-y-6">
                <div className="flex flex-row items-end justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">安全设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">管理 MFA 多因素身份验证和账号会话安全。</p>
                  </div>
                  <Badge variant="outline" className={cn(mfaEnabled ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700" : "text-muted-foreground")}>
                    <span className={cn("size-1.5 rounded-full", mfaEnabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                    {mfaEnabled ? "MFA 已启用" : "MFA 已禁用"}
                  </Badge>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    修改密码
                  </div>
                  <div className="grid gap-4 text-sm">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-current-password">当前密码</Label>
                      <Input
                        id="account-current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-new-password">新密码</Label>
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
                        修改密码
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    多因素身份验证 (MFA)
                  </div>
                  {!mfaEnabled && !mfaSetup && (
                    <div className="grid gap-4 text-sm text-muted-foreground">
                      <p>启用后，登录和高危操作需要输入认证器应用中的动态验证码。</p>
                      <div>
                        <Button variant="outline" onClick={startMfaSetup}>
                          <ShieldCheck className="size-4" />
                          启用 MFA
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
                      <p className="text-muted-foreground">MFA 已启用。停用时请输入认证器验证码。</p>
                      <div className="grid gap-1.5">
                        <Label htmlFor="account-disable-mfa-code">停用验证码</Label>
                        <Input
                          id="account-disable-mfa-code"
                          value={disableCode}
                          onChange={(event) => setDisableCode(event.target.value)}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="输入验证码"
                        />
                      </div>
                      <div>
                        <Button variant="outline" onClick={disableMfa} disabled={!disableCode.trim()}>
                          停用 MFA
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />
                <div className="flex flex-nowrap justify-between gap-2">
                  <Button variant="outline" onClick={revokeOtherSessions}>
                    退出其他设备
                  </Button>
                  <Button variant="ghost" onClick={logout}>
                    <LogOut className="size-4" />
                    退出登录
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="sessions" className="m-0 space-y-6">
                <div className="flex flex-row items-end justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">活跃会话</h3>
                    <p className="mt-1 text-sm text-muted-foreground">查看当前登录设备、地区、最近活动和过期时间。</p>
                  </div>
                  <Button variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={revokeOtherSessions}>
                    <LogOut className="size-4" />
                    退出其他设备登录
                  </Button>
                </div>

                <div className="space-y-3">
                  {visibleSessions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      暂无活跃会话。
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
                            <span className="font-medium text-foreground">{formatSessionDevice(session.userAgent)}</span>
                            {isCurrent && <Badge variant="outline" className="text-primary">当前设备</Badge>}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                            <span>地区: {formatSessionRegion(session)}</span>
                            <span>最后活跃: {formatDate(session.lastSeenAt)}</span>
                            <span>过期: {formatDate(session.expiresAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <History className="size-4 text-muted-foreground" />
                    登录历史
                  </div>
                  <div className="overflow-hidden rounded-md border border-border">
                    <ScaledTable minWidth={620} className="border-collapse text-left text-sm" aria-label="登录历史">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">状态</th>
                          <th className="px-4 py-2 font-medium">时间</th>
                          <th className="px-4 py-2 font-medium">地区</th>
                          <th className="px-4 py-2 font-medium">详情</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEvents.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-4 text-center text-sm text-muted-foreground">
                              暂无登录记录。
                            </td>
                          </tr>
                        ) : visibleEvents.map((event) => (
                          <tr key={event.id} className="border-t border-border">
                            <td className={cn("px-4 py-2 font-medium", event.outcome === "success" ? "text-emerald-700" : "text-destructive")}>
                              {loginOutcomeLabel(event.outcome)}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{formatDate(event.createdAt)}</td>
                            <td className="px-4 py-2">{formatSessionRegion(event)}</td>
                            <td className="max-w-52 truncate px-4 py-2 text-muted-foreground">{loginDetail(event)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </ScaledTable>
                  </div>
                </div>

              </TabsContent>

              <TabsContent value="global" className="m-0 space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-foreground">全局设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">管理模型托管配置和工作台偏好。</p>
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
                {currentSessionId ? `当前会话 ${currentSessionId}` : ""}
              </div>
            </main>
            </Tabs>
          </ScaleToFitFrame>
        )}
      </DialogContent>
    </Dialog>
  );
}
