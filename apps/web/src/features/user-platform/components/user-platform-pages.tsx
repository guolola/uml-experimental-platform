// Hosts authenticated project, account, and provider pages backed by the platform API.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  Download,
  FileText,
  GitBranch,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  PlugZap,
  Plus,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Separator } from "../../../shared/ui/separator";
import { Select, SelectContent, SelectControl, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/select";
import { Switch } from "../../../shared/ui/switch";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { downloadBlobFile, downloadTextFile } from "../../../shared/lib/download";
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  normalizeApiBaseUrl,
  patchUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import type { AuthRoutePath } from "../../../app/app-routes";
import { ModelSettingsFields, maskApiKey } from "../../settings/components/model-settings-fields";
import {
  ProjectGenerationTasksDrawerContent,
  ProjectWorkspaceActions,
} from "../../workspace-shell/components/top-bar";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  buildRunMarkdownReport,
  isDocumentRunSnapshot,
} from "../../history";
import {
  AUTH_SESSION_CHANGED_EVENT,
  notifyAuthSessionChanged,
  PlatformApiError,
  platformApi,
  type PlatformAccountSession,
  type PlatformDocument,
  type PlatformLoginEvent,
  type PlatformProject,
  type PlatformProjectMember,
  type PlatformUser,
  type PlatformProviderConfig,
  type PlatformRunSummary,
  type PlatformDocumentVersion,
  type PlatformMfaChallenge,
  type PlatformMfaSetup,
  type PlatformProjectInvitation,
  type PlatformProjectMemberPreview,
} from "../services/platform-api";

type Navigate = (path: string) => void;

function legacyProviderSettingsEnabled() {
  return import.meta.env.VITE_ENABLE_LEGACY_PROVIDER_SETTINGS === "true";
}
export type ProjectDrawerKind = "tasks" | "members" | "history" | "documents" | "settings";

type AcademicBindingOption = {
  value: string;
  label: string;
  organizationId: string | null;
  courseId: string | null;
  classId: string | null;
  teamId: string | null;
};

const UNASSIGNED_ACADEMIC_OPTION: AcademicBindingOption = {
  value: "unassigned",
  label: "暂不绑定课程团队",
  organizationId: null,
  courseId: null,
  classId: null,
  teamId: null,
};

const ACADEMIC_BINDING_OPTIONS: AcademicBindingOption[] = [
  {
    value: "software-2026-spring",
    label: "软件工程 2026 春 / 1 班 / Team A",
    organizationId: "org-software-school",
    courseId: "course-software-2026-spring",
    classId: "class-software-2026-spring-1",
    teamId: "team-software-2026-a",
  },
  {
    value: "software-2026-lab2",
    label: "软件工程 2026 春 / 2 班 / Team B",
    organizationId: "org-software-school",
    courseId: "course-software-2026-spring",
    classId: "class-software-2026-spring-2",
    teamId: "team-software-2026-b",
  },
  {
    value: "unassigned",
    label: "暂不绑定课程团队",
    organizationId: null,
    courseId: null,
    classId: null,
    teamId: null,
  },
];

function academicBindingFromValue(value: string, options = ACADEMIC_BINDING_OPTIONS) {
  return (
    options.find((option) => option.value === value) ??
    options[0] ??
    UNASSIGNED_ACADEMIC_OPTION
  );
}

function buildAcademicBindingOptions(
  response: Awaited<ReturnType<typeof platformApi.listAcademicOptions>>,
): AcademicBindingOption[] {
  const organizations = new Map(response.organizations.map((item) => [item.id, item]));
  const courses = new Map(response.courses.map((item) => [item.id, item]));
  const classes = new Map(response.classes.map((item) => [item.id, item]));
  const teamOptions = response.teams
    .filter((team) => team.status === "active")
    .map((team) => {
      const classRecord = classes.get(team.classId);
      const course = classRecord ? courses.get(classRecord.courseId) : null;
      const organization = course ? organizations.get(course.organizationId) : null;
      return {
        value: team.id,
        label: [
          organization?.name,
          course?.name,
          classRecord?.name,
          team.name,
        ].filter(Boolean).join(" / "),
        organizationId: organization?.id ?? null,
        courseId: course?.id ?? null,
        classId: classRecord?.id ?? null,
        teamId: team.id,
      };
    })
    .filter((option) => option.label);
  return [UNASSIGNED_ACADEMIC_OPTION, ...teamOptions];
}

type StaticProject = {
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

const PROJECT_SCOPE_OPTIONS = [
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

function projectFromApi(project: PlatformProject, currentUser: PlatformUser | null = null): StaticProject {
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

type ProjectOverviewState = {
  loading: boolean;
  error: string;
  authRequired: boolean;
  forbidden: boolean;
  project: PlatformProject | null;
  membership: PlatformProjectMember | null;
  members: PlatformProjectMember[];
  runs: PlatformRunSummary[];
  documents: PlatformDocument[];
};

const emptyProjectOverview: ProjectOverviewState = {
  loading: true,
  error: "",
  authRequired: false,
  forbidden: false,
  project: null,
  membership: null,
  members: [],
  runs: [],
  documents: [],
};

function useProjectOverview(projectId: string) {
  const [state, setState] = useState<ProjectOverviewState>(emptyProjectOverview);

  useEffect(() => {
    let active = true;
    setState({ ...emptyProjectOverview, loading: true });
    Promise.all([
      platformApi.getProject(projectId),
      platformApi.listProjectMembers(projectId),
      platformApi.listProjectRuns(projectId),
      platformApi.listProjectDocuments(projectId),
    ])
      .then(([projectResponse, memberResponse, runResponse, documentResponse]) => {
        if (!active) return;
        setState({
          loading: false,
          error: "",
          authRequired: false,
          forbidden: false,
          project: projectResponse.project,
          membership: projectResponse.membership ?? null,
          members: memberResponse.members,
          runs: runResponse.runs,
          documents: documentResponse.documents,
        });
      })
      .catch((error) => {
        if (!active) return;
        const status = error instanceof PlatformApiError ? error.status : 0;
        setState({
          ...emptyProjectOverview,
          loading: false,
          authRequired: status === 401,
          forbidden: status === 403,
          error:
            error instanceof Error
              ? error.message
              : "项目数据加载失败。",
        });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  return state;
}

function renderAccessMessage(
  overview: ProjectOverviewState,
  onNavigate?: Navigate,
) {
  if (overview.authRequired) {
    return (
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base">需要登录后查看实名项目。</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              项目、运行记录、文档和成员权限都需要通过 Cookie 会话校验。
            </p>
          </div>
          {onNavigate && (
            <Button type="button" onClick={() => onNavigate("/login")}>
              去登录
            </Button>
          )}
        </div>
      </SectionCard>
    );
  }
  if (overview.forbidden) {
    return (
      <SectionCard>
        <h2 className="text-base">权限不足</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          当前账号不是该项目成员，无法查看项目详情、运行历史或文档。
        </p>
      </SectionCard>
    );
  }
  if (overview.error) {
    return (
      <SectionCard>
        <h2 className="text-base">项目数据加载失败</h2>
        <p className="mt-2 text-sm text-muted-foreground">{overview.error}</p>
      </SectionCard>
    );
  }
  return null;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function PageFrame({
  children,
}: {
  children: React.ReactNode;
  onNavigate?: Navigate;
}) {
  return (
    <main className="min-h-0 flex-1 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        {children}
      </div>
    </main>
  );
}

function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-border bg-card p-5 ${className}`}>
      {children}
    </section>
  );
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
      className="motion-auth-security-panel relative hidden min-h-full w-full overflow-hidden bg-[#eff4ff] p-8 md:flex md:w-1/2 md:items-center md:justify-center"
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(220,233,255,0.68),rgba(239,244,255,0.72))]" />
      <div className="relative z-10 w-full max-w-sm">
        <div
          data-testid="auth-lifecycle-card"
          className="motion-auth-card group rotate-[-2deg] rounded-xl border border-white/60 bg-white/70 p-6 shadow-[0_12px_40px_rgba(11,28,48,0.08)] backdrop-blur-xl transition-all duration-300 ease-in-out hover:-translate-y-1 hover:rotate-[-1deg] hover:shadow-xl"
        >
          <div className="mb-6 flex items-center">
            <span className="mr-3 inline-flex size-10 items-center justify-center rounded-full bg-[#4441c4] text-white">
              <GitBranch className="size-5" />
            </span>
            <div>
              <div className="font-display text-xl font-semibold leading-7 text-[#0b1c30]">项目开发生命周期</div>
              <div className="text-sm leading-5 text-[#464554]">v2.4.1 迭代中</div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-medium leading-5 text-[#0b1c30]">流程跟踪 (Process)</div>
              <div className="flex items-start px-2">
                {workflowSteps.map((step, index) => (
                  <div key={step.label} className="contents">
                    <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                      {step.status === "done" ? (
                        <CheckCircle2 className="size-5 text-[#4ade80]" />
                      ) : step.status === "active" ? (
                        <Code2 className="size-5 text-[#4441c4]" />
                      ) : (
                        <span className="mt-0.5 size-4 rounded-full border border-[#777585]/40" />
                      )}
                      <span className={step.status === "active" ? "text-[10px] font-bold text-[#4441c4]" : "text-[10px] text-[#464554]"}>
                        {step.label}
                      </span>
                    </div>
                    {index < workflowSteps.length - 1 && (
                      <div
                        data-testid={index < 2 ? "auth-progress-shimmer" : undefined}
                        className={
                          index < 1
                            ? "progress-shimmer mt-2 h-0.5 flex-1 bg-[#4ade80]"
                            : index === 1
                              ? "progress-shimmer mt-2 h-0.5 flex-1 bg-[#4441c4]"
                              : "mt-2 h-0.5 flex-1 bg-[#d3e4fe]"
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium leading-5 text-[#0b1c30]">UML 模型预览</div>
              <div className="grid gap-2 rounded-lg border border-[#c7c4d6]/30 bg-[#eff4ff]/70 p-3">
                <div className="flex gap-2">
                  <div className="h-12 flex-1 rounded border border-[#4441c4]/40 bg-white/60 p-1">
                    <div className="mb-1 h-2 w-2/3 rounded bg-[#4441c4]/20" />
                    <div className="mb-0.5 h-1 w-full rounded bg-[#d3e4fe]" />
                    <div className="h-1 w-full rounded bg-[#d3e4fe]" />
                  </div>
                  <div className="h-12 flex-1 rounded border border-[#4b00b3]/40 bg-white/60 p-1">
                    <div className="mb-1 h-2 w-2/3 rounded bg-[#4b00b3]/20" />
                    <div className="mb-0.5 h-1 w-full rounded bg-[#d3e4fe]" />
                    <div className="h-1 w-full rounded bg-[#d3e4fe]" />
                  </div>
                </div>
                <div className="relative h-px bg-[#c7c4d6]/60">
                  <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 bg-white px-1 text-[#5b5e69]">
                    <ArrowRight className="size-3" />
                  </span>
                </div>
                <div className="flex h-8 items-center justify-center rounded border border-[#c7c4d6] bg-white/60 px-2">
                  <div className="h-2 w-1/2 rounded bg-[#d3e4fe]" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-[#c7c4d6]/40 pt-4">
            <span className="rounded bg-[#f8f9ff] px-2 py-1 font-mono text-xs font-medium leading-4 text-[#5b5e69]">Project-Main</span>
            <span className="flex items-center gap-1 text-sm leading-5 text-[#464554]">
              <span className="size-2 rounded-full bg-[#4ade80] motion-auth-pulse" />
              编译成功
            </span>
          </div>
        </div>

        <div className="motion-auth-card group absolute bottom-12 right-8 w-48 rotate-[4deg] rounded-lg border border-white/60 bg-white/70 p-4 shadow-lg backdrop-blur-xl transition-all duration-300 ease-in-out hover:-translate-y-1 hover:rotate-[3deg] hover:shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="size-4 text-[#4b00b3]" />
            <span className="font-display text-sm font-semibold leading-5 text-[#0b1c30]">API 延迟</span>
          </div>
          <div
            data-testid="auth-api-latency-value"
            className="font-mono text-xl font-medium leading-7 text-[#4441c4] transition-colors duration-300 group-hover:text-[#23005c]"
          >
            24ms
          </div>
          <div className="mt-2 flex h-8 items-end gap-1">
            {[40, 60, 30, 80, 50].map((height, index) => (
              <span
                key={height}
                data-testid={index === 3 ? "auth-progress-shimmer" : undefined}
                className={index === 3 ? "progress-shimmer w-full rounded-t-sm bg-[#4441c4]" : "w-full rounded-t-sm bg-[#d3e4fe]"}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AuthenticatedRoute({
  children,
  onNavigate,
  routeKey,
}: {
  children: React.ReactNode;
  onNavigate: Navigate;
  routeKey?: string;
}) {
  const [checking, setChecking] = useState(true);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const verifySession = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setChecking(true);
    platformApi
      .me()
      .then(() => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setChecking(false);
      })
      .catch(() => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        onNavigate("/");
      });
  }, [onNavigate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    verifySession();
  }, [routeKey, verifySession]);

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, verifySession);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, verifySession);
    };
  }, [verifySession]);

  if (checking) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        正在校验登录状态...
      </main>
    );
  }

  return <>{children}</>;
}

function getQueryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function getSafeRedirectPath() {
  const redirect = getQueryParam("redirect");
  if (redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }
  return "/projects";
}

function localizeAuthMessage(message: string) {
  if (message.includes("Invalid email or password")) return "邮箱或密码错误。";
  if (message.includes("Email verification is required")) return "登录前需要先完成邮箱验证。";
  if (message.includes("Log in to accept this project invitation")) return "请先登录后接受项目邀请。";
  if (message.includes("Project invitation token is invalid or expired")) return "邀请链接无效或已过期。";
  if (message.includes("Project invitation is for a different email address")) return "当前登录账号不是被邀请邮箱，请切换账号后再接受邀请。";
  if (message.includes("Reset email sent")) return "重置邮件已发送。";
  if (message.includes("Password reset")) return "密码已重置。";
  return message;
}

export function AuthPage({
  path,
  onNavigate,
}: {
  path: AuthRoutePath;
  onNavigate: Navigate;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          notifyAuthSessionChanged();
          setMessage("MFA 验证通过，正在进入项目首页。");
          onNavigate(redirectPath);
          return;
        }
        const response = await platformApi.login({ email, password });
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
          password,
          displayName: email.split("@")[0] || "UML 用户",
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
          setMessage("邮箱验证已完成，请返回登录。");
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
    "/login": "输入账号信息，进入软件工程实验平台。",
    "/register": "创建账号后，请先完成邮箱验证再进入项目空间。",
    "/verify-email": "请确认您的电子邮箱以继续使用软件工程实验平台。",
    "/forgot-password": "请输入您注册时使用的电子邮箱地址，我们将向您发送一封包含密码重置链接的邮件。",
    "/reset-password": "请输入您的新密码。为保证安全，建议使用包含字母、数字和符号的强密码。",
  };
  const passwordStrength =
    password.length >= 12 ? "强" : password.length >= 8 ? "中" : "弱";
  const authPrimaryActionClass =
    "motion-action h-12 w-full rounded-lg border border-[#2b23ad]/10 bg-[#4441c4] px-6 font-display text-xl font-semibold leading-7 text-white shadow-sm hover:bg-[#3530b6] hover:shadow-md";
  const authTextActionClass =
    "motion-action font-medium text-[#2b23ad] underline-offset-4 hover:underline";
  const authInputClass =
    "motion-auth-input h-12 rounded-lg border-[#c7c4d6] bg-[#eff4ff] px-4 text-base leading-6 placeholder:text-[#c4c6d3] focus-visible:border-[#4441c4] focus-visible:ring-[#4441c4]/20";
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
      className="relative min-h-0 flex-1 overflow-auto bg-[#f8f9ff] text-[#0b1c30]"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(248,249,255,0.95),rgba(229,238,255,0.78))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle,#c7c4d6_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
      </div>
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10 md:px-12">
        <div className="motion-auth-shell-card flex w-full max-w-[1000px] flex-col overflow-hidden rounded-xl border border-[#c7c4d6]/30 bg-white/80 shadow-[0_8px_30px_rgba(11,28,48,0.06)] backdrop-blur-xl md:flex-row">
          <section
            data-testid="auth-form-panel"
            data-motion="auth-form"
            className="motion-auth-form-panel flex w-full flex-col justify-center p-8 md:w-1/2 md:p-12"
          >
            <button
              type="button"
              className="motion-auth-brand mb-8 text-left"
              style={{ "--motion-delay": "40ms" } as CSSProperties}
              onClick={() => onNavigate("/")}
              aria-label="返回官网"
            >
              <div className="font-display text-[32px] font-semibold leading-10 text-[#4441c4]">软件工程实验平台</div>
              <div className="mt-2 text-base leading-6 text-[#464554]">
                {path === "/login" ? "欢迎回来，请登录以继续。" : "面向课程实验与项目协作的智能研发空间"}
              </div>
            </button>
            <div
              className="motion-auth-title mb-6"
              style={{ "--motion-delay": "100ms" } as CSSProperties}
            >
              <h1 className="font-display text-2xl font-semibold leading-8 text-[#0b1c30]">
                {path === "/verify-email" ? "验证您的邮箱" : titles[path]}
              </h1>
              <p className="mt-2 text-sm leading-5 text-[#464554]">
                {descriptions[path]}
              </p>
            </div>
            <form className="motion-auth-form grid gap-6" onSubmit={submit}>
              {path !== "/reset-password" && (
                <div className="grid gap-2">
                  <Label htmlFor="auth-email" className="text-sm font-medium leading-5 text-[#0b1c30]">
                    {path === "/forgot-password" ? "电子邮箱" : "邮箱地址"}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#5b5e69]" />
                    <Input
                      id="auth-email"
                      aria-label="邮箱"
                      type="email"
                      value={email || (path === "/verify-email" ? queryEmail : "")}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/login" ? "name@company.com" : "name@example.edu"}
                      required={path !== "/verify-email" || !urlToken}
                      className={`${authInputClass} pl-10`}
                    />
                  </div>
                </div>
              )}
              {(path === "/login" || path === "/register" || path === "/reset-password") && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="auth-password" className="text-sm font-medium leading-5 text-[#0b1c30]">
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
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#5b5e69]" />
                    <Input
                      id="auth-password"
                      aria-label={path === "/reset-password" ? "新密码" : "密码"}
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/register" ? "至少 8 个字符" : "••••••••"}
                      required
                      className={`${authInputClass} pl-10`}
                    />
                  </div>
                  {path !== "/login" && (
                    <div className="grid gap-2">
                      {path === "/register" && (
                        <div className="grid grid-cols-3 gap-1">
                          <span className="h-1.5 rounded-full bg-[#4441c4]" />
                          <span className="h-1.5 rounded-full bg-[#dce9ff]" />
                          <span className="h-1.5 rounded-full bg-[#dce9ff]" />
                        </div>
                      )}
                      <span className="text-xs text-[#464554]">
                        密码强度：{passwordStrength}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {path === "/login" && (
                <div className="flex items-center">
                  <input
                    className="size-4 rounded border-[#c7c4d6] bg-[#eff4ff] accent-[#4441c4]"
                    id="auth-remember"
                    type="checkbox"
                  />
                  <Label htmlFor="auth-remember" className="ml-2 text-sm leading-5 text-[#464554]">
                    记住我
                  </Label>
                </div>
              )}
              {path === "/login" && mfaChallenge && (
                <div className="motion-status grid gap-2 rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-3">
                  <Label htmlFor="auth-mfa-code" className="text-sm font-medium text-[#0b1c30]">MFA 验证码</Label>
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
                  <span className="text-xs text-[#464554]">
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
                    <Label htmlFor="invite-code" className="text-sm font-medium leading-5 text-[#0b1c30]">
                      邀请码 <span className="font-normal text-[#464554]">（选填）</span>
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
                      className="size-4 rounded border-[#c7c4d6] accent-[#4441c4]"
                    />
                    <Label htmlFor="terms" className="text-sm text-[#464554]">
                      我已阅读并同意服务条款
                    </Label>
                  </div>
                </>
              )}
              {path === "/verify-email" && (
                <>
                  <div className="motion-status rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-4 text-sm leading-6 text-[#464554]">
                    {getQueryParam("sent")
                      ? `验证邮件已发送到 ${queryEmail || "你的邮箱"}。请点击邮件中的验证链接，或复制短期 token 到下方完成验证。`
                      : "请点击邮件中的验证链接，或复制短期 token 到下方完成验证。"}
                  </div>
                  {!urlToken && (
                    <div className="grid gap-2">
                      <Label htmlFor="auth-verification-token" className="text-sm font-medium leading-5 text-[#0b1c30]">
                        邮件验证码 / 短期 token
                      </Label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#5b5e69]" />
                        <Input
                          id="auth-verification-token"
                          aria-label="邮件验证码 / 短期 token"
                          value={verificationToken}
                          onChange={(event) => setVerificationToken(event.target.value)}
                          placeholder="粘贴邮件中的短期 token"
                          className={`${authInputClass} pl-10`}
                        />
                      </div>
                      <span className="text-xs leading-5 text-[#464554]">
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
                <p className="text-center text-sm leading-5 text-[#464554]">
                  还没有账号？{" "}
                  <button type="button" className={authTextActionClass} onClick={() => onNavigate("/register")}>
                    创建账号
                  </button>
                </p>
              )}
              {path === "/register" && (
                <p className="text-center text-sm leading-5 text-[#464554]">
                  已有账号？{" "}
                  <button type="button" className={authTextActionClass} onClick={() => onNavigate("/login")}>
                    去登录
                  </button>
                </p>
              )}
              {path !== "/login" && path !== "/register" && (
                <Button type="button" variant="ghost" className="motion-action w-fit px-0 text-[#4441c4] hover:bg-transparent hover:text-[#3530b6]" onClick={() => onNavigate("/login")}>
                  返回登录
                </Button>
              )}
              {message && (
                <div className="motion-status rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-3 text-sm text-[#464554]">
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
    <main className="min-h-0 flex-1 overflow-auto bg-[#f8f9ff] px-4 py-10 text-[#0b1c30] md:px-12">
      <section className="mx-auto max-w-xl rounded-xl border border-[#c7c4d6]/40 bg-white p-8 shadow-[0_8px_30px_rgba(11,28,48,0.06)]">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold leading-8">接受项目邀请</h1>
          <p className="mt-2 text-sm leading-6 text-[#464554]">
            请确认邀请信息后加入项目。若尚未登录，请先使用被邀请邮箱登录或注册。
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-4 text-sm text-[#464554]">
            <Loader2 className="size-4 animate-spin" />
            正在读取邀请信息...
          </div>
        ) : invitation ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-4">
              <p className="text-sm text-[#464554]">项目</p>
              <p className="mt-1 font-medium">{projectName}</p>
            </div>
            <div className="rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-4">
              <p className="text-sm text-[#464554]">邀请邮箱</p>
              <p className="mt-1 font-medium">{invitedEmail}</p>
            </div>
            <div className="rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-4">
              <p className="text-sm text-[#464554]">项目角色</p>
              <p className="mt-1 font-medium">{memberRoleLabel(invitation.role)}</p>
            </div>
          </div>
        ) : null}
        {message && (
          <div className="mt-5 rounded-lg border border-[#c7c4d6] bg-[#eff4ff] p-4 text-sm leading-6 text-[#464554]">
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
        <button type="button" className="mt-4 text-sm font-medium text-[#4441c4] hover:underline" onClick={() => onNavigate("/login")}>
          返回登录
        </button>
      </section>
    </main>
  );
}

export function ProjectsIndexPage({ onNavigate }: { onNavigate: Navigate }) {
  const [projects, setProjects] = useState<StaticProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [listError, setListError] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("recent");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAuthRequired(false);
    setForbidden(false);
    setListError(false);
    Promise.all([
      platformApi.listProjects(),
      platformApi.me().catch(() => null),
    ])
      .then(([response, account]) => {
        if (!active) return;
        setListError(false);
        setProjects(response.projects.map((project) => projectFromApi(project, account?.user ?? null)));
        setStatus(
          response.projects.length === 0
            ? "当前账号还没有项目，可以创建第一个实名项目。"
            : "已加载当前账号的项目。",
        );
      })
      .catch((error) => {
        if (!active) return;
        const statusCode = error instanceof PlatformApiError ? error.status : 0;
        setProjects([]);
        setAuthRequired(statusCode === 401);
        setForbidden(statusCode === 403);
        setListError(statusCode !== 401 && statusCode !== 403);
        if (statusCode === 401) {
          setStatus("实名项目列表需要通过登录会话加载。");
        } else if (statusCode === 403) {
          setStatus("当前账号没有项目列表访问权限。");
        } else {
          setStatus(
            error instanceof Error
              ? `项目加载失败：${error.message}`
              : "项目加载失败，请稍后重试。",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects
      .filter((project) => {
        if (query && !project.searchableText.includes(query)) return false;
        if (scope === "archived") return project.status === "archived";
        if (scope === "team") return project.visibility === "团队成员可见";
        if (scope === "mine") return project.isOwnedByCurrentUser || project.memberCount <= 1;
        return true;
      })
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name, "zh-CN");
        if (sort === "generated") {
          return (right.lastGeneratedAt || "").localeCompare(left.lastGeneratedAt || "");
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [projects, scope, search, sort]);

  const openCreateProject = () => {
    if (authRequired || listError) {
      onNavigate("/login");
      return;
    }
    setCreateDialogOpen(true);
  };

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-10 px-6 py-16 md:px-10 xl:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-2">
            <h1 className="text-[32px] font-semibold leading-10 tracking-normal text-foreground">
              项目首页
            </h1>
            <p className="text-base leading-6 text-muted-foreground">
              项目会绑定成员权限、运行历史、文档和模型配置。
            </p>
          </div>
          <Button
            type="button"
            className="h-12 rounded-lg bg-[#5d5cde] px-6 text-base text-[#f1eeff] shadow-sm hover:bg-[#5351d3]"
            onClick={openCreateProject}
          >
            <Plus className="size-4" />
            {authRequired || listError ? "登录后新建项目" : "新建项目"}
          </Button>
        </div>

        {!loading && (authRequired || forbidden || listError) && (
          <SectionCard className="grid gap-4 rounded-xl md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <h2 className="text-base">
                {authRequired ? "请先登录" : forbidden ? "权限不足" : "项目服务不可用"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {authRequired
                  ? "登录后才能进入项目、工作台、运行历史和文档中心。"
                  : forbidden
                    ? "当前账号没有项目列表访问权限。"
                    : status || "当前无法加载实名项目，请确认 API 服务可用后再继续。"}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => onNavigate("/login")}>
              {authRequired ? "去登录" : "前往登录"}
            </Button>
          </SectionCard>
        )}

        {!authRequired && !forbidden && !listError && (
          <section className="flex flex-col gap-4 rounded-xl border border-[rgba(199,196,214,0.3)] bg-card p-[17px] shadow-sm md:flex-row md:items-center md:justify-between">
            <div
              className="flex gap-2 overflow-x-auto"
              role="group"
              aria-label="项目范围"
            >
              {PROJECT_SCOPE_OPTIONS.map((option) => {
                const selected = scope === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    className={
                      selected
                        ? "shrink-0 rounded-lg bg-[#e5eeff] px-4 py-2 text-base leading-6 text-foreground dark:bg-accent"
                        : "shrink-0 rounded-lg px-4 py-2 text-base leading-6 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    }
                    onClick={() => setScope(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative w-full md:w-80 lg:w-96">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-[38px] rounded-lg border-[rgba(199,196,214,0.5)] bg-input-background pl-10 text-sm"
                  placeholder="搜索项目、成员..."
                  aria-label="搜索项目"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <SelectControl
                aria-label="排序方式"
                value={sort}
                onValueChange={setSort}
                className="h-[38px] w-full rounded-lg border border-[rgba(199,196,214,0.5)] bg-input-background px-3 text-sm text-foreground md:w-28"
                options={[
                  { value: "recent", label: "最近打开" },
                  { value: "generated", label: "最近生成" },
                  { value: "name", label: "项目名称" },
                ]}
              />
            </div>
          </section>
        )}

        {!loading && !authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length === 0 && (
          <section className="rounded-xl border border-dashed border-[rgba(199,196,214,0.3)] bg-card p-10 text-center">
            <h2 className="text-xl font-semibold">没有匹配的项目</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              当前搜索、筛选或排序条件没有命中真实项目状态数据。
            </p>
          </section>
        )}

        {!loading && !authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleProjects.map((project) => (
              <article
                key={project.id}
                className={
                  project.status === "archived"
                    ? "group relative flex min-h-[271px] flex-col overflow-hidden rounded-xl border border-[rgba(199,196,214,0.3)] bg-card opacity-75 shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
                    : "group relative flex min-h-[287px] flex-col overflow-hidden rounded-xl border border-[rgba(199,196,214,0.3)] bg-card shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
                }
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4441c4] to-[#632ecd] opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex flex-1 flex-col gap-4 border-b border-[rgba(199,196,214,0.2)] px-6 pb-10 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 truncate text-xl font-semibold leading-7 text-foreground">
                      {project.name}
                    </h2>
                    <Badge
                      variant={project.status === "archived" ? "outline" : "secondary"}
                      className={
                        project.status === "archived"
                          ? "rounded bg-secondary px-2 py-1 text-xs text-muted-foreground"
                          : "rounded bg-[#dce9ff] px-2 py-1 text-xs text-foreground dark:bg-secondary"
                      }
                    >
                      {project.statusLabel}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 min-h-10 min-w-0 max-w-full overflow-hidden text-sm leading-5 text-muted-foreground">
                    {project.description}
                  </p>
                  <div className="grid gap-2 pt-2 text-sm leading-5 text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <UserRound className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">负责人：{project.owner}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      {project.status === "archived" ? (
                        <Archive className="size-3.5 shrink-0" />
                      ) : project.visibility === "仅成员可见" ? (
                        <Lock className="size-3.5 shrink-0" />
                      ) : (
                        <Users className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{project.visibility}</span>
                    </span>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 bg-[#eff4ff]/50 px-6 py-4 dark:bg-secondary/40">
                  <div className="flex items-start">
                    {project.status === "archived" ? (
                      <span className="font-mono text-xs font-medium leading-4 text-muted-foreground">
                        最后更新: {project.updatedAt}
                      </span>
                    ) : (
                      <>
                        {project.members.map((member) => (
                          <span
                            key={`${project.id}:${member.id}`}
                            aria-label={`成员头像 ${member.label}`}
                            title={member.label}
                            className="mr-[-8px] inline-flex size-8 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-[#e5eeff] text-xs font-semibold text-primary"
                          >
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              member.initial
                            )}
                          </span>
                        ))}
                        {project.memberCount > project.members.length && (
                          <span
                            aria-label={`其余 ${project.memberCount - project.members.length} 名成员`}
                            className="mr-[-8px] inline-flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-xs font-semibold text-muted-foreground"
                          >
                            +{project.memberCount - project.members.length}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-6 px-0 text-base text-[#4441c4] hover:bg-transparent hover:text-[#312eaa] dark:text-primary"
                    onClick={() => onNavigate(`/projects/${project.id}`)}
                  >
                    进入项目
                    <span className="sr-only"> {project.name}</span>
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && !authRequired && !forbidden && !listError && projects.length === 0 && (
          <section className="mx-auto flex w-full max-w-[672px] flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(199,196,214,0.3)] bg-card px-8 py-12 text-center md:px-[49px]">
            <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-[#e5eeff] text-primary dark:bg-accent">
              <FileText className="size-6" />
            </div>
            <h2 className="text-xl font-semibold leading-7 text-foreground">
              还没有项目
            </h2>
            <p className="mt-3 max-w-md text-base leading-6 text-muted-foreground">
              创建项目后才能进入实验工作台。您可以新建一个独立项目或加入团队协作。
            </p>
            <Button
              type="button"
              className="mt-8 h-12 rounded-lg bg-[#5d5cde] px-6 text-base text-[#f1eeff] shadow-sm hover:bg-[#5351d3]"
              onClick={openCreateProject}
            >
              <Plus className="size-4" />
              创建第一个项目
            </Button>
          </section>
        )}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>创建项目</DialogTitle>
              <DialogDescription>
                项目名称、描述、可见性、课程/班级/team 和默认模型策略会提交到项目 API。
              </DialogDescription>
            </DialogHeader>
            <ProjectCreateForm onNavigate={onNavigate} />
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

function ProjectCreateForm({ onNavigate }: { onNavigate: Navigate }) {
  const [name, setName] = useState("课程 UML 实验项目");
  const [description, setDescription] = useState("");
  const [courseTeam, setCourseTeam] = useState(UNASSIGNED_ACADEMIC_OPTION.value);
  const [academicOptions, setAcademicOptions] = useState<AcademicBindingOption[]>([
    UNASSIGNED_ACADEMIC_OPTION,
  ]);
  const [academicLoading, setAcademicLoading] = useState(true);
  const [academicStatus, setAcademicStatus] = useState("");
  const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerStatus, setProviderStatus] = useState("");
  const [template, setTemplate] = useState("uml");
  const [visibility, setVisibility] = useState("team");
  const [defaultModelPolicy, setDefaultModelPolicy] = useState("");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    setAcademicLoading(true);
    platformApi
      .listAcademicOptions()
      .then((response) => {
        if (!active) return;
        const options = buildAcademicBindingOptions(response);
        const defaultAcademic =
          options.find((option) => option.value !== UNASSIGNED_ACADEMIC_OPTION.value) ??
          options[0];
        setAcademicOptions(options);
        setCourseTeam(defaultAcademic?.value ?? UNASSIGNED_ACADEMIC_OPTION.value);
        // setAcademicStatus(options.length > 1 ? "" : "暂无可绑定课程/班级/team。");
      })
      .catch((error) => {
        if (!active) return;
        setAcademicStatus(error instanceof Error ? error.message : "课程/班级/team 加载失败。");
      })
      .finally(() => {
        if (active) setAcademicLoading(false);
      });
    setProviderLoading(true);
    platformApi
      .listProviderConfigs()
      .then((response) => {
        if (!active) return;
        const activeConfigs = response.providerConfigs.filter(
          (config) => config.status === "active",
        );
        setProviderConfigs(activeConfigs);
        setDefaultModelPolicy(activeConfigs[0]?.id ?? "");
        setProviderStatus(activeConfigs.length > 0 ? "" : "暂无可用托管 Provider。");
      })
      .catch((error) => {
        if (!active) return;
        setProviderStatus(error instanceof Error ? error.message : "托管 Provider 加载失败。");
      })
      .finally(() => {
        if (active) setProviderLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const createProject = async () => {
    setCreating(true);
    setStatus("");
    try {
      const academicBinding = academicBindingFromValue(courseTeam, academicOptions);
      const response = await platformApi.createProject({
        name,
        description: description.trim() || null,
        visibility: visibility === "course" ? "team" : visibility,
        organizationId: academicBinding.organizationId,
        courseId: academicBinding.courseId,
        classId: academicBinding.classId,
        teamId: academicBinding.teamId,
        defaultProviderConfigId: defaultModelPolicy || null,
      });
      setStatus("项目已保存课程/班级/team 归属和默认模型策略。");
      window.setTimeout(() => onNavigate(`/projects/${response.project.id}`), 900);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `创建失败：${error.message}`
          : "创建失败，请稍后重试。",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <form className="grid gap-5 lg:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="project-name">项目名称</Label>
        <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="course-team">课程/班级/team</Label>
        <SelectControl
          id="course-team"
          aria-label="课程/班级/team"
          value={courseTeam}
          onValueChange={setCourseTeam}
          disabled={academicLoading}
          className="h-9"
          options={academicOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        {academicStatus && <span className="text-xs text-muted-foreground">{academicStatus}</span>}
      </div>
      <div className="grid gap-1.5 lg:col-span-2">
        <Label htmlFor="project-description">项目描述</Label>
        <Input
          id="project-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="描述业务背景和实验目标"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="project-template">项目模板</Label>
        <SelectControl
          id="project-template"
          aria-label="项目模板"
          value={template}
          onValueChange={setTemplate}
          className="h-9"
          options={[
            { value: "uml", label: "UML 全流程" },
            { value: "requirements", label: "需求建模" },
            { value: "documents", label: "说明书交付" },
          ]}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="project-visibility">可见性</Label>
        <SelectControl
          id="project-visibility"
          value={visibility}
          onValueChange={setVisibility}
          className="h-9"
          options={[
            { value: "private", label: "仅我可见" },
            { value: "team", label: "团队成员可见" },
            { value: "course", label: "课程班级可见" },
          ]}
        />
      </div>
      <div className="grid gap-1.5 lg:col-span-2">
        <Label htmlFor="default-model-policy">默认模型策略</Label>
        <SelectControl
          id="default-model-policy"
          aria-label="默认模型策略"
          value={defaultModelPolicy}
          onValueChange={setDefaultModelPolicy}
          disabled={providerLoading || providerConfigs.length === 0}
          className="h-9"
          options={[
            {
              value: "",
              label: providerLoading ? "正在加载托管 Provider" : "暂不设置默认 Provider",
            },
            ...providerConfigs.map((config) => ({
              value: config.id,
              label: config.name,
            })),
          ]}
        />
        {providerStatus && <span className="text-xs text-muted-foreground">{providerStatus}</span>}
        <span className="text-xs text-muted-foreground">
          当前会保存：{courseTeam} / {template} / {defaultModelPolicy}。模型费用仅记录用量和估算，真实账单以外部供应商为准。
        </span>
      </div>
      <div className="lg:col-span-2">
        <Button type="button" onClick={createProject} disabled={creating}>
          {creating && <Loader2 className="size-4 animate-spin" />}
          创建并进入项目
        </Button>
        {status && (
          <div className="mt-3 rounded-md border border-border bg-muted p-3 text-sm">
            {status}
          </div>
        )}
      </div>
    </form>
  );
}

export function ProjectNewPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <PageFrame onNavigate={onNavigate}>
      <div>
        <h1>创建项目</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          项目名称、描述、可见性、课程/班级/team 和默认模型策略会提交到项目 API。
        </p>
      </div>
      <SectionCard>
        <ProjectCreateForm onNavigate={onNavigate} />
      </SectionCard>
    </PageFrame>
  );
}

export function ProjectSectionPage({
  projectId,
  section,
  onNavigate,
}: {
  projectId: string;
  section: "settings" | "members" | "history" | "documents";
  onNavigate: Navigate;
}) {
  const overview = useProjectOverview(projectId);
  const sectionTitle = {
    settings: "项目设置",
    members: "项目成员与权限",
    history: "运行历史",
    documents: "文档中心",
  }[section];
  const projectName =
    overview.project?.name ??
    (overview.loading ? "正在加载项目..." : `项目 ${projectId}`);
  const accessMessage = renderAccessMessage(overview, onNavigate);

  return (
    <PageFrame onNavigate={onNavigate}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{sectionTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{projectName}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => onNavigate(`/projects/${projectId}`)}>
          返回工作台
        </Button>
      </div>
      {overview.loading && (
        <SectionCard>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载项目数据...
          </div>
        </SectionCard>
      )}
      {!overview.loading && accessMessage}
      {!overview.loading && !accessMessage && overview.project && section === "settings" && (
        <ProjectSettings project={overview.project} />
      )}
      {!overview.loading && !accessMessage && overview.project && section === "members" && (
        <ProjectMembers project={overview.project} members={overview.members} />
      )}
      {!overview.loading && !accessMessage && overview.project && section === "history" && (
        <ProjectHistory projectId={projectId} initialRuns={overview.runs} members={overview.members} />
      )}
      {!overview.loading && !accessMessage && overview.project && section === "documents" && (
        <ProjectDocuments projectId={projectId} documents={overview.documents} />
      )}
    </PageFrame>
  );
}

const projectDrawerMeta: Record<
  ProjectDrawerKind,
  {
    title: string;
    description: string;
    icon: typeof Users;
    width: "compact" | "history" | "wide";
  }
> = {
  tasks: {
    title: "生成任务",
    description: "后台生成任务、阶段进度与执行详情",
    icon: Activity,
    width: "history",
  },
  members: {
    title: "成员管理",
    description: "邀请、角色、权限与成员导出",
    icon: Users,
    width: "compact",
  },
  history: {
    title: "运行历史",
    description: "任务流水、快照恢复、重试与导出",
    icon: Clock3,
    width: "history",
  },
  documents: {
    title: "文档中心",
    description: "说明书、版本、下载与编辑状态",
    icon: BookOpen,
    width: "compact",
  },
  settings: {
    title: "项目设置",
    description: "基础信息、模型策略、数据策略与危险操作",
    icon: Settings,
    width: "wide",
  },
};

function ProjectDrawerShell({
  open,
  kind,
  projectName,
  accessLabel,
  onClose,
  children,
}: {
  open: boolean;
  kind: ProjectDrawerKind;
  projectName: string;
  accessLabel?: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  const meta = projectDrawerMeta[kind];
  const Icon = meta.icon;
  const titleId = `project-${kind}-drawer-title`;
  const widthClass =
    meta.width === "wide"
      ? "w-full sm:w-[min(470px,100%)]"
      : meta.width === "history"
        ? "w-full sm:w-[min(423px,100%)] 2xl:w-[25vw] 2xl:max-w-[423px]"
        : "w-full sm:w-[min(368px,100%)]";

  return (
    <div
      data-testid="project-workspace-drawer-layer"
      className="absolute inset-0 z-40 flex justify-end bg-background/45 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
    >
      <button
        type="button"
        aria-label={`关闭${meta.title}抽屉遮罩`}
        tabIndex={-1}
        className="absolute inset-0 z-0 cursor-default"
        onClick={onClose}
      />
      <aside
        data-testid="project-workspace-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex h-full ${widthClass} max-w-full flex-col overflow-x-hidden overflow-y-hidden border-l border-border bg-card text-card-foreground shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right-full motion-safe:duration-200`}
      >
        <header className="flex min-h-[82px] items-center justify-between gap-3 border-b border-border/70 bg-card/85 px-6 py-5 backdrop-blur-md">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-primary/10 text-primary shadow-sm">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold leading-7">
                {meta.title}
              </h2>
              <p className="truncate font-mono text-xs leading-4 text-muted-foreground">{projectName}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 rounded-full"
            aria-label={`关闭${meta.title}抽屉`}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex min-h-[33px] min-w-0 items-center justify-between gap-3 overflow-hidden border-b border-border/60 bg-muted/70 px-6 py-2 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            权限: {accessLabel ?? "unknown"}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-primary">
            <CheckStatusDot />
            已同步
          </span>
        </div>
        <div
          data-testid="project-workspace-drawer-body"
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6"
        >
          {children}
        </div>
      </aside>
    </div>
  );
}

function CheckStatusDot() {
  return <span className="size-2 rounded-full bg-primary" aria-hidden="true" />;
}

export function ProjectWorkspaceDrawer({
  projectId,
  activeDrawer,
  onClose,
  onNavigate,
}: {
  projectId: string;
  activeDrawer: ProjectDrawerKind | null;
  onClose: () => void;
  onNavigate?: Navigate;
}) {
  const overview = useProjectOverview(projectId);
  if (!activeDrawer) return null;

  const projectName =
    overview.project?.name ??
    (overview.loading ? "正在加载项目..." : `项目 ${projectId}`);
  const accessMessage = renderAccessMessage(overview, onNavigate);
  let content: React.ReactNode;

  if (overview.loading) {
    content = (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        正在加载项目数据...
      </div>
    );
  } else if (accessMessage || !overview.project) {
    content = accessMessage;
  } else if (activeDrawer === "tasks") {
    content = <ProjectGenerationTasksDrawerContent />;
  } else if (activeDrawer === "settings") {
    content = <ProjectSettings project={overview.project} layout="drawer" />;
  } else if (activeDrawer === "members") {
    content = (
      <ProjectMembers
        project={overview.project}
        members={overview.members}
        membershipRole={overview.membership?.role ?? null}
        layout="drawer"
      />
    );
  } else if (activeDrawer === "history") {
    content = (
      <ProjectHistory
        projectId={projectId}
        initialRuns={overview.runs}
        members={overview.members}
        layout="drawer"
      />
    );
  } else {
    content = <ProjectDocuments projectId={projectId} documents={overview.documents} layout="drawer" />;
  }

  return (
    <ProjectDrawerShell
      open={Boolean(activeDrawer)}
      kind={activeDrawer}
      projectName={projectName}
      accessLabel={overview.membership?.role ?? null}
      onClose={onClose}
    >
      {content}
    </ProjectDrawerShell>
  );
}

export function ProjectWorkspaceAccessBoundary({
  projectId,
  onNavigate,
  children,
}: {
  projectId: string;
  onNavigate: Navigate;
  children: React.ReactNode;
}) {
  const overview = useProjectOverview(projectId);
  const accessMessage = renderAccessMessage(overview, onNavigate);

  if (overview.loading) {
    return (
      <PageFrame onNavigate={onNavigate}>
        <SectionCard>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载项目权限...
          </div>
        </SectionCard>
      </PageFrame>
    );
  }

  if (accessMessage || !overview.project) {
    return <PageFrame onNavigate={onNavigate}>{accessMessage}</PageFrame>;
  }

  return <>{children}</>;
}

function ProjectSettings({
  project,
  layout = "page",
}: {
  project: PlatformProject;
  layout?: "page" | "drawer";
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [visibility, setVisibility] = useState(project.visibility);
  const [courseTeam, setCourseTeam] = useState<string>(
    ACADEMIC_BINDING_OPTIONS.find(
      (option) =>
        option.courseId === project.courseId &&
        option.classId === project.classId &&
        option.teamId === project.teamId,
    )?.value ?? "unassigned",
  );
  const [defaultProviderConfigId, setDefaultProviderConfigId] = useState(
    project.defaultProviderConfigId ?? "user-default",
  );
  const [retentionPolicy, setRetentionPolicy] = useState(project.retentionPolicy ?? "manual");
  const [newOwnerUserId, setNewOwnerUserId] = useState("");
  const [currentProject, setCurrentProject] = useState(project);
  const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setVisibility(project.visibility);
    setCourseTeam(
      ACADEMIC_BINDING_OPTIONS.find(
        (option) =>
          option.courseId === project.courseId &&
          option.classId === project.classId &&
          option.teamId === project.teamId,
      )?.value ?? "unassigned",
    );
    setDefaultProviderConfigId(project.defaultProviderConfigId ?? "user-default");
    setRetentionPolicy(project.retentionPolicy ?? "manual");
    setNewOwnerUserId("");
    setCurrentProject(project);
  }, [project]);

  useEffect(() => {
    let active = true;
    platformApi
      .listProjectProviderConfigs(project.id)
      .then((response) => {
        if (!active) return;
        setProviderConfigs(response.providerConfigs);
      })
      .catch(() => {
        if (!active) return;
        setProviderConfigs([]);
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  const saveProject = async () => {
    setMessage("");
    setError("");
    try {
      const academicBinding = academicBindingFromValue(courseTeam);
      const response = await platformApi.updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        organizationId: academicBinding.organizationId,
        courseId: academicBinding.courseId,
        classId: academicBinding.classId,
        teamId: academicBinding.teamId,
        defaultProviderConfigId:
          defaultProviderConfigId === "user-default" ? null : defaultProviderConfigId,
      });
      const retentionResponse = await platformApi.updateProjectRetentionPolicy(
        project.id,
        retentionPolicy,
      );
      setCurrentProject({ ...response.project, retentionPolicy: retentionResponse.project.retentionPolicy });
      setMessage("项目设置已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "项目设置保存失败。");
    }
  };

  const archiveProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm("确定要归档此项目吗？此操作会写入审计日志。")) return;
    try {
      const response = await platformApi.archiveProject(project.id);
      setCurrentProject(response.project);
      setMessage(response.message ?? "项目已归档。");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "项目归档失败。");
    }
  };

  const restoreProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm("确定要恢复此项目吗？此操作会写入审计日志。")) return;
    try {
      const response = await platformApi.restoreProject(project.id);
      setCurrentProject(response.project);
      setMessage(response.message ?? "项目已恢复。");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "项目恢复失败。");
    }
  };

  const exportProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm("确定要导出此项目数据吗？此操作会写入审计日志。")) return;
    try {
      const response = await platformApi.exportProject(project.id);
      const blob = new Blob([JSON.stringify(response.export, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name || project.id}-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(response.message ?? "项目导出已生成。");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "项目导出失败。");
    }
  };

  const transferOwner = async () => {
    setMessage("");
    setError("");
    const trimmedOwnerId = newOwnerUserId.trim();
    if (!trimmedOwnerId) {
      setError("请输入新所有者用户 ID。");
      return;
    }
    if (!window.confirm("确定要转移项目所有者吗？此操作会写入审计日志。")) return;
    try {
      const response = await platformApi.transferProjectOwner(project.id, trimmedOwnerId);
      setCurrentProject(response.project);
      setNewOwnerUserId("");
      setMessage(response.message ?? "项目所有者已转移。");
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "项目所有者转移失败。");
    }
  };

  const deleteProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm("确定要删除此项目吗？此操作会写入审计日志。")) return;
    try {
      await platformApi.deleteProject(project.id);
      setCurrentProject((current) => ({ ...current, status: "deleted" }));
      setMessage("项目已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "项目删除失败。");
    }
  };

  const activeProviderConfigs = providerConfigs.filter((config) => config.status === "active");
  const selectedProviderConfig = providerConfigs.find((config) => config.id === defaultProviderConfigId);
  const selectedProviderConfigLabel = selectedProviderConfig
    ? `${selectedProviderConfig.name} / ${selectedProviderConfig.provider}${
        selectedProviderConfig.defaultModel
          ? ` / ${selectedProviderConfig.defaultModel}`
          : ""
      }`
    : "跟随用户默认模型";
  const retentionPolicyLabel =
    retentionPolicy === "semester_180_days"
      ? "保留到学期结束后 180 天"
      : retentionPolicy === "one_year_365_days"
        ? "保留一年"
        : "手动归档";
  const providerOptions =
    selectedProviderConfig && !activeProviderConfigs.some((config) => config.id === selectedProviderConfig.id)
      ? [selectedProviderConfig, ...activeProviderConfigs]
      : activeProviderConfigs;
  const settingGridClass =
    layout === "drawer" ? "grid min-w-0 max-w-full gap-4 overflow-hidden" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]";
  const sectionClass = layout === "drawer" ? "min-w-0 max-w-full overflow-hidden p-4" : "";

  return (
    <div className={settingGridClass}>
      <SectionCard className={sectionClass}>
        <div className="grid gap-4">
          {layout === "drawer" && (
            <div>
              <h3 className="text-sm font-semibold">基本信息</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                名称、描述和可见性直接保存到项目 API。
              </p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-name">项目信息</Label>
            <Input
              id="settings-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-description">项目描述</Label>
            <Input
              id="settings-project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="暂无项目描述"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-visibility">项目可见性</Label>
            <SelectControl
              id="settings-project-visibility"
              value={visibility}
              onValueChange={setVisibility}
              className="h-9"
              options={[
                { value: "private", label: "private" },
                { value: "team", label: "team" },
                { value: "public", label: "public" },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>默认模型策略</Label>
            <Select value={defaultProviderConfigId} onValueChange={setDefaultProviderConfigId}>
              <SelectTrigger className="min-w-0 max-w-full">
                <SelectValue aria-hidden="true" className="hidden" />
                <span
                  data-slot="select-value"
                  className="min-w-0 truncate"
                  title={selectedProviderConfigLabel}
                >
                  {selectedProviderConfigLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user-default">跟随用户默认模型</SelectItem>
                {providerOptions.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    <span
                      className="block min-w-0 truncate"
                      title={`${config.name} / ${config.provider}${
                        config.defaultModel ? ` / ${config.defaultModel}` : ""
                      }`}
                    >
                      {config.name} / {config.provider}
                      {config.defaultModel ? ` / ${config.defaultModel}` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {providerOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                当前项目没有可选的服务端托管 Provider，将跟随用户默认模型。
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-course-team">课程/班级/team</Label>
            <SelectControl
              id="settings-course-team"
              value={courseTeam}
              onValueChange={setCourseTeam}
              className="h-9"
              options={ACADEMIC_BINDING_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>数据保留策略</Label>
            <Select value={retentionPolicy} onValueChange={setRetentionPolicy}>
              <SelectTrigger className="min-w-0 max-w-full">
                <SelectValue aria-hidden="true" className="hidden" />
                <span
                  data-slot="select-value"
                  className="min-w-0 truncate"
                  title={retentionPolicyLabel}
                >
                  {retentionPolicyLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semester_180_days">保留到学期结束后 180 天</SelectItem>
                <SelectItem value="one_year_365_days">保留一年</SelectItem>
                <SelectItem value="manual">手动归档</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => void saveProject()}>
            保存项目设置
          </Button>
        </div>
      </SectionCard>
      <SectionCard className={sectionClass}>
        <h2 className="text-base">高危操作</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          当前项目状态：{currentProject.status}。删除、归档、导出会要求二次确认并记录审计。
        </p>
        <div className="mt-4 grid gap-2">
          <Button type="button" variant="outline" onClick={() => void exportProject()}>
            数据导出
          </Button>
          <Button type="button" variant="outline" onClick={() => void archiveProject()}>
            <Archive className="size-4" />
            归档项目
          </Button>
          <Button type="button" variant="outline" onClick={() => void restoreProject()}>
            恢复项目
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-transfer-owner">转移所有者</Label>
            <Input
              id="settings-transfer-owner"
              value={newOwnerUserId}
              onChange={(event) => setNewOwnerUserId(event.target.value)}
              placeholder="输入新所有者用户 ID"
            />
            <Button type="button" variant="outline" onClick={() => void transferOwner()}>
              转移所有者
            </Button>
          </div>
          <Button type="button" variant="destructive" onClick={() => void deleteProject()}>
            删除项目
          </Button>
        </div>
        {(message || error) && (
          <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
            {message || error}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function invitationToMember(
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

function memberStatusLabel(status: string) {
  if (status === "active") return "已加入";
  if (status === "invited") return "邀请中";
  if (status === "expired") return "已过期";
  if (status === "revoked") return "已撤销";
  return status;
}

function memberRoleLabel(role: string) {
  if (role === "owner") return "所有者";
  if (role === "editor") return "编辑者";
  if (role === "viewer") return "查看者";
  return role;
}

function memberInitials(member: PlatformProjectMember) {
  const label = member.displayName || member.email || "成员";
  const parts = label.split(/[\s._-]+/u).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function formatMemberDate(value: string | null | undefined) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
}

function getProjectRunKind(run: PlatformRunSummary) {
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

function getProjectRunStageLabel(run: PlatformRunSummary) {
  const stage = run.stage;
  const normalized = (stage ?? "").toLowerCase();
  const runKind = getProjectRunKind(run);
  if (!normalized) return "等待开始";
  if (normalized.includes("extract_rules")) return "提取需求规则";
  if (normalized.includes("generate_models")) return "生成需求模型";
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

function getProjectRunStatusLabel(status?: string | null) {
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
      return "已中断";
    default:
      return status ?? "未知状态";
  }
}

function getProjectRunStatusClasses(status?: string | null) {
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

function getProjectRunDisplayTime(run: PlatformRunSummary) {
  return run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt ?? null;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function shortIdentifier(value: string) {
  return value.slice(0, 8);
}

function getProjectRunOperatorLabel(
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

function getProjectRunOperatorSearchText(
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

function getProjectDocumentKindLabel(kind?: string | null) {
  if (kind === "requirementsSpec") return "需求规格说明书";
  if (kind === "softwareDesignSpec") return "软件设计说明书";
  return "项目文档";
}

function getProjectDocumentDisplayName(document: PlatformDocument) {
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

function getProjectRunModelLabel(run: PlatformRunSummary) {
  return run.model?.trim() || "默认模型";
}

function ProjectMembers({
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
  const exportMembers = () => {
    const header = "displayName,email,role,status,joinedAt,invitedAt";
    const rows = currentMembers.map((member) =>
      [
        member.displayName,
        member.email,
        member.role,
        member.status,
        member.joinedAt ?? "",
        member.invitedAt ?? "",
      ]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    downloadTextFile(
      `${project.id}-members.csv`,
      [header, ...rows].join("\n"),
      "text/csv;charset=utf-8",
    );
    setMessage("成员列表已导出。");
  };
  const containerClass =
    layout === "drawer"
      ? "min-w-0 max-w-full space-y-6 overflow-hidden"
      : "space-y-5";
  const shellClass =
    layout === "drawer" ? "min-w-0 max-w-full overflow-hidden border-0 bg-transparent p-0" : "";

  return (
    <SectionCard className={shellClass}>
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
      <Button type="button" className="w-full" variant="outline" onClick={exportMembers}>
        <Download className="size-4" />
        导出成员列表
      </Button>
      </div>
    </SectionCard>
  );
}

function ProjectHistory({
  projectId,
  initialRuns,
  members,
  layout = "page",
}: {
  projectId: string;
  initialRuns: PlatformRunSummary[];
  members: PlatformProjectMember[];
  layout?: "page" | "drawer";
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [selectedErrorRunId, setSelectedErrorRunId] = useState("");
  const {
    historyItems,
    restoreRunHistory,
    deleteRunHistory,
  } = useWorkspaceSession();
  const repository = useWorkspaceRepository();

  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  const cancelRun = async (runId: string) => {
    setMessage("");
    setError("");
    try {
      const response = await platformApi.cancelProjectRun(projectId, runId);
      const nextRun =
        response.run ??
        ({
          runId: response.runId ?? runId,
          status: response.status ?? "cancelled",
        } satisfies PlatformRunSummary);
      setRuns((current) =>
        current.map((run) =>
          run.runId === runId ? { ...run, ...nextRun } : run,
        ),
      );
      setMessage("任务已取消。");
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : "取消运行失败。",
      );
    }
  };

  const runAction = async (
    runId: string,
    action: "retry" | "rerun",
  ) => {
    setMessage("");
    setError("");
    try {
      const response =
        action === "retry"
          ? await platformApi.retryProjectRun(projectId, runId)
          : await platformApi.rerunProjectRun(projectId, runId);
      const nextRun =
        response.run ??
        ({
          runId: response.runId ?? runId,
          status: response.status ?? "queued",
        } satisfies PlatformRunSummary);
      if (nextRun.runId !== runId) {
        setRuns((current) => [nextRun, ...current]);
      } else {
        setRuns((current) =>
          current.map((run) =>
            run.runId === runId ? { ...run, ...nextRun } : run,
          ),
        );
      }
      setMessage("已重新排队，稍后启动。");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : action === "retry"
            ? "重试运行失败。"
            : "重新运行失败。",
      );
    }
  };

  const restoreSnapshot = async (runId: string) => {
    setMessage("");
    setError("");
    try {
      await restoreRunHistory(runId);
      setMessage("已恢复工作台快照。");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "恢复工作台快照失败。",
      );
    }
  };

  const exportRunReport = async (run: PlatformRunSummary) => {
    const runId = run.runId;
    const historyItem = historyItems.find((item) => item.id === runId);
    let snapshot = historyItem?.snapshot;
    if (!snapshot) {
      try {
        const detail = await platformApi.getProjectRun(projectId, runId);
        snapshot = detail.snapshot;
      } catch (reportError) {
        setError(
          reportError instanceof Error
            ? reportError.message
            : "读取运行快照失败。",
        );
        return;
      }
    }
    if (!snapshot) {
      setError("该运行暂未保存可导出的快照。");
      return;
    }
    downloadTextFile(
      `运行报告-${getProjectRunStageLabel(run)}.md`,
      buildRunMarkdownReport(snapshot),
      "text/markdown",
    );
    setMessage("已导出 Markdown 报告。");
  };

  const downloadDocumentRun = async (runId: string) => {
    const historyItem = historyItems.find((item) => item.id === runId);
    if (!repository.downloadDocumentRun) {
      setError("当前仓储不支持重新下载说明书。");
      return;
    }
    try {
      const downloaded = await repository.downloadDocumentRun(
        runId,
        historyItem && isDocumentRunSnapshot(historyItem.snapshot)
          ? historyItem.snapshot.fileName ?? undefined
          : undefined,
      );
      downloadBlobFile(downloaded.fileName, downloaded.blob);
      setMessage(`已重新下载 ${downloaded.fileName}。`);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "重新下载说明书失败。",
      );
    }
  };

  const deleteRun = async (runId: string) => {
    setMessage("");
    setError("");
    try {
      await platformApi.deleteProjectRun(projectId, runId);
      await deleteRunHistory(runId).catch(() => []);
      setRuns((current) => current.filter((run) => run.runId !== runId));
      setMessage("已删除运行记录。");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "删除运行历史失败。",
      );
    }
  };

  const stages = useMemo(
    () => Array.from(new Set(runs.map((run) => run.stage).filter(Boolean))) as string[],
    [runs],
  );
  const statuses = useMemo(
    () => Array.from(new Set(runs.map((run) => run.status).filter(Boolean))),
    [runs],
  );
  const models = useMemo(
    () => Array.from(new Set(runs.map((run) => run.model).filter(Boolean))) as string[],
    [runs],
  );
  const filteredRuns = runs.filter((run) => {
    if (
      stageFilter !== "all" &&
      run.stage !== stageFilter &&
      getProjectRunKind(run) !== stageFilter
    ) {
      return false;
    }
    if (statusFilter !== "all" && run.status !== statusFilter) return false;
    if (modelFilter !== "all" && run.model !== modelFilter) return false;
    if (
      operatorFilter.trim() &&
      !getProjectRunOperatorSearchText(run, members).includes(operatorFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (timeFilter.trim()) {
      const timeText = [run.startedAt, run.completedAt, run.updatedAt].filter(Boolean).join(" ");
      if (!timeText.includes(timeFilter.trim())) return false;
    }
    return true;
  });

  const renderRunActions = ({
    run,
    hasSnapshot,
    hasDocumentSnapshot,
    size,
    withIcons = false,
  }: {
    run: PlatformRunSummary;
    hasSnapshot: boolean;
    hasDocumentSnapshot: boolean | undefined;
    size?: "sm";
    withIcons?: boolean;
  }) => {
    const running = run.status === "running" || run.status === "queued";
    const retryable =
      run.status === "failed" ||
      run.status === "cancelled" ||
      run.status === "interrupted";
    const canUseSnapshot = (hasSnapshot || run.canRestore) && !running;
    const canDownloadDocument =
      (Boolean(hasDocumentSnapshot) || Boolean(run.documentDownloadAvailable)) && !running;
    const canRerun = !running;
    const canDelete = !running;
    const buttonSizeProps = size ? { size } : {};

    return (
      <div className="flex flex-wrap gap-2">
        {running && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void cancelRun(run.runId)}
          >
            取消任务
          </Button>
        )}
        {!running && run.errorMessage && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => setSelectedErrorRunId(run.runId)}
          >
            查看错误
          </Button>
        )}
        {!running && retryable && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "retry")}
          >
            重试
          </Button>
        )}
        {canRerun && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "rerun")}
          >
            重新运行
          </Button>
        )}
        {canUseSnapshot && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void restoreSnapshot(run.runId)}
          >
            {withIcons && <RotateCw className="size-3.5" />}
            恢复快照
          </Button>
        )}
        {canUseSnapshot && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void exportRunReport(run)}
          >
            {withIcons && <Download className="size-3.5" />}
            导出报告
          </Button>
        )}
        {canDownloadDocument && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void downloadDocumentRun(run.runId)}
          >
            {withIcons && <Download className="size-3.5" />}
            重新下载
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            className="text-destructive hover:text-destructive"
            onClick={() => void deleteRun(run.runId)}
          >
            {withIcons && <Trash2 className="size-3.5" />}
            删除记录
          </Button>
        )}
      </div>
    );
  };
  const selectedErrorRun = runs.find((run) => run.runId === selectedErrorRunId);

  const sectionClass = layout === "drawer" ? "p-4" : "";
  const filterClass = layout === "drawer" ? "mb-4 grid gap-2" : "mb-4 grid gap-3 md:grid-cols-5";
  const listClass =
    layout === "drawer" ? "grid gap-3" : "overflow-hidden rounded-md border border-border";

  if (layout === "drawer") {
    const runningCount = runs.filter((run) => run.status === "running" || run.status === "queued").length;
    const failedCount = runs.filter((run) => run.status === "failed").length;
    const latestRun = [...runs].sort((a, b) =>
      String(getProjectRunDisplayTime(b) ?? "").localeCompare(
        String(getProjectRunDisplayTime(a) ?? ""),
      ),
    )[0];
    const stageChips: Array<[string, string]> = [
      ["all", "全部"],
      ["requirements", "需求分析"],
      ["design", "模型生成"],
      ["code", "代码构建"],
      ["document", "说明书"],
    ];

    return (
      <div className="grid min-h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            ["总计", runs.length],
            ["运行中", runningCount],
            ["失败", failedCount],
            ["最近", latestRun ? formatDateTime(getProjectRunDisplayTime(latestRun) ?? "") : "暂无"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/60 bg-muted/60 px-2.5 py-2 shadow-sm">
              <div className="truncate font-mono text-[11px] leading-4 text-muted-foreground">{label}</div>
              <div className="truncate text-sm font-semibold leading-5">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3">
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {stageChips.map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={stageFilter === value ? "secondary" : "ghost"}
                size="sm"
                className="h-8 shrink-0 rounded-md px-3 text-xs"
                onClick={() => setStageFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectControl
              aria-label="筛选状态"
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="h-9 text-xs"
              options={[
                { value: "all", label: "全部状态" },
                ...statuses.map((status) => ({
                  value: status,
                  label: getProjectRunStatusLabel(status),
                })),
              ]}
            />
            <SelectControl
              aria-label="筛选模型"
              value={modelFilter}
              onValueChange={setModelFilter}
              className="h-9 text-xs"
              options={[
                { value: "all", label: "全部模型" },
                ...models.map((model) => ({
                  value: model,
                  label: model,
                })),
              ]}
            />
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-3">
            {filteredRuns.map((run, index) => {
              const historyItem = historyItems.find((item) => item.id === run.runId);
              const hasSnapshot = Boolean(historyItem) || Boolean(run.snapshotAvailable);
              const hasDocumentSnapshot =
                Boolean(run.documentDownloadAvailable) ||
                Boolean(historyItem && isDocumentRunSnapshot(historyItem.snapshot));
              const running = run.status === "running" || run.status === "queued";
              const stageLabel = getProjectRunStageLabel(run);
              const statusLabel = getProjectRunStatusLabel(run.status);
              const displayTime = getProjectRunDisplayTime(run);
              const operatorLabel = getProjectRunOperatorLabel(run, members);
              const statusClasses = getProjectRunStatusClasses(run.status);
              return (
                <div
                  key={run.runId}
                  className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm"
                >
                  <div className={`h-1 ${statusClasses.bar}`} />
                  <div className="grid gap-3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={statusClasses.badge}
                          >
                            {statusLabel}
                          </Badge>
                          <span className="truncate text-sm font-medium">{stageLabel}</span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] leading-4 text-muted-foreground">
                        {displayTime ? formatDateTime(displayTime) : "暂无时间"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>模型 {getProjectRunModelLabel(run)}</span>
                      <span>操作者 {operatorLabel}</span>
                    </div>
                    {running && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-2/3 rounded-full bg-primary" />
                      </div>
                    )}
                    {index === 0 && (
                      <div className="rounded-md border border-border/70 bg-muted/50 p-3 text-xs text-muted-foreground">
                        <div>阶段：{stageLabel}</div>
                        <div>更新时间：{displayTime ? formatDateTime(displayTime) : "暂无时间"}</div>
                      </div>
                    )}
                    {run.errorMessage && selectedErrorRunId === run.runId && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                        {run.errorMessage}
                      </div>
                    )}
                    {renderRunActions({
                      run,
                      hasSnapshot,
                      hasDocumentSnapshot,
                      size: "sm",
                    })}
                  </div>
                </div>
              );
            })}
            {runs.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">暂无运行历史。</div>
            )}
            {runs.length > 0 && filteredRuns.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">没有匹配的运行历史。</div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between gap-2 border-t border-border/60 bg-card/90 px-6 py-4 backdrop-blur-md">
          <Button type="button" variant="outline" size="sm" onClick={() => setMessage("运行历史已是最新。")}>
            <RotateCw className="size-4" />
            刷新历史
          </Button>
          <Button type="button" size="sm" onClick={() => setMessage("批量导出会逐条导出可用报告。")}>
            <Download className="size-4" />
            批量导出
          </Button>
        </div>
        {(message || error) && (
          <div className="rounded-md border border-border bg-muted p-3 text-sm">
            {message || error}
          </div>
        )}
      </div>
    );
  }

  return (
    <SectionCard className={sectionClass}>
      <div className={filterClass}>
        <SelectControl
          aria-label="筛选阶段"
          value={stageFilter}
          onValueChange={setStageFilter}
          className="h-9"
          options={[
            { value: "all", label: "全部阶段" },
            ...stages.map((stage) => ({
              value: stage,
              label: stage,
            })),
          ]}
        />
        <SelectControl
          aria-label="筛选状态"
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="h-9"
          options={[
            { value: "all", label: "全部状态" },
            ...statuses.map((status) => ({
              value: status,
              label: getProjectRunStatusLabel(status),
            })),
          ]}
        />
        <SelectControl
          aria-label="筛选模型"
          value={modelFilter}
          onValueChange={setModelFilter}
          className="h-9"
          options={[
            { value: "all", label: "全部模型" },
            ...models.map((model) => ({
              value: model,
              label: model,
            })),
          ]}
        />
        <Input
          placeholder="操作者"
          aria-label="筛选操作者"
          value={operatorFilter}
          onChange={(event) => setOperatorFilter(event.target.value)}
        />
        <Input
          placeholder="时间"
          aria-label="筛选时间"
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
        />
      </div>
      <div className={listClass}>
        {filteredRuns.map((run) => {
          const historyItem = historyItems.find((item) => item.id === run.runId);
          const hasSnapshot = Boolean(historyItem) || Boolean(run.snapshotAvailable);
          const hasDocumentSnapshot =
            Boolean(run.documentDownloadAvailable) ||
            Boolean(historyItem && isDocumentRunSnapshot(historyItem.snapshot));
          const stageLabel = getProjectRunStageLabel(run);
          const statusLabel = getProjectRunStatusLabel(run.status);
          const statusClasses = getProjectRunStatusClasses(run.status);
          return (
          <div key={run.runId} className="grid gap-2 border-b border-border p-4 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr_1fr_auto]">
            <div className="contents">
              <span className="text-sm font-medium">{stageLabel}</span>
              <span className="text-sm text-muted-foreground">{getProjectRunOperatorLabel(run, members)}</span>
              <Badge variant="outline" className={statusClasses.badge}>{statusLabel}</Badge>
              <span className="text-sm text-muted-foreground">
                {getProjectRunModelLabel(run)}
              </span>
            </div>
            {renderRunActions({
              run,
              hasSnapshot,
              hasDocumentSnapshot,
              withIcons: true,
            })}
          </div>
          );
        })}
        {runs.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">暂无运行历史。</div>
        )}
        {runs.length > 0 && filteredRuns.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">没有匹配的运行历史。</div>
        )}
      </div>
      {selectedErrorRun && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {selectedErrorRun.errorMessage ?? "该运行没有错误详情。"}
        </div>
      )}
      {(message || error) && (
        <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
          {message || error}
        </div>
      )}
    </SectionCard>
  );
}

function ProjectDocuments({
  projectId,
  documents,
  layout = "page",
}: {
  projectId: string;
  documents: PlatformDocument[];
  layout?: "page" | "drawer";
}) {
  const [currentDocuments, setCurrentDocuments] = useState(documents);
  const [names, setNames] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<Record<string, PlatformDocumentVersion[]>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentDocuments(documents);
    setNames(
      Object.fromEntries(
        documents.map((document) => [
          document.id,
          getProjectDocumentDisplayName(document),
        ]),
      ),
    );
  }, [documents]);

  const updateDocument = (document: PlatformDocument) => {
    setCurrentDocuments((current) =>
      current.map((item) => (item.id === document.id ? { ...item, ...document } : item)),
    );
    setNames((current) => ({
      ...current,
      [document.id]: getProjectDocumentDisplayName(document),
    }));
  };

  const findDocumentDisplayName = (documentId: string) => {
    const document = currentDocuments.find((item) => item.id === documentId);
    return document ? getProjectDocumentDisplayName(document) : `文档 ${shortIdentifier(documentId)}`;
  };

  const loadVersions = async (documentId: string) => {
    setMessage("");
    setError("");
    const displayName = findDocumentDisplayName(documentId);
    try {
      const response = await platformApi.listProjectDocumentVersions(projectId, documentId);
      setVersions((current) => ({ ...current, [documentId]: response.versions }));
      setMessage(`已加载文档 ${displayName} 的版本记录。`);
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "版本记录加载失败。");
    }
  };

  const renameDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    try {
      const nextName = (names[documentId] ?? "").trim();
      if (!nextName) {
        setError("文档名称不能为空。");
        return;
      }
      const response = await platformApi.renameProjectDocument(projectId, documentId, nextName);
      updateDocument(response.document);
      setMessage(`文档 ${getProjectDocumentDisplayName(response.document)} 已重命名。`);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "重命名失败。");
    }
  };

  const deleteDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    const displayName = findDocumentDisplayName(documentId);
    try {
      await platformApi.deleteProjectDocument(projectId, documentId);
      setCurrentDocuments((current) =>
        current.map((document) =>
          document.id === documentId ? { ...document, status: "deleted" } : document,
        ),
      );
      setMessage(`文档 ${displayName} 已删除，可在当前页面恢复。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败。");
    }
  };

  const restoreDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    try {
      const response = await platformApi.restoreProjectDocument(projectId, documentId);
      updateDocument(response.document);
      setMessage(`文档 ${getProjectDocumentDisplayName(response.document)} 已恢复。`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "恢复失败。");
    }
  };

  const downloadDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    try {
      const file = await platformApi.downloadProjectDocument(projectId, documentId);
      downloadBlobFile(file.fileName, file.blob);
      setMessage(`已下载 ${file.fileName}。`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "下载失败。");
    }
  };

  const batchDownload = async () => {
    const downloadableDocuments = currentDocuments.filter(
      (document) => document.status !== "deleted" && document.download?.status !== "unavailable",
    );
    if (downloadableDocuments.length === 0) {
      setError("当前没有可下载的文档。");
      return;
    }
    for (const document of downloadableDocuments) {
      await downloadDocument(document.id);
    }
    setMessage(`已触发 ${downloadableDocuments.length} 个文档下载。`);
  };
  const sectionClass = layout === "drawer" ? "p-4" : "";
  const gridClass = layout === "drawer" ? "grid gap-3" : "grid gap-4 lg:grid-cols-2";

  return (
    <SectionCard className={sectionClass}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base">项目文档</h2>
          <p className="text-sm text-muted-foreground">
            上传新文档当前没有项目 API 支撑，本页只展示已有文档能力。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void batchDownload()}>
          <Download className="size-4" />
          批量下载
        </Button>
      </div>
      <div className={gridClass}>
        {currentDocuments.map((document) => {
          const displayName = getProjectDocumentDisplayName(document);
          return (
          <div key={document.id} className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base">
                {displayName}
              </h2>
              <Badge variant="secondary">{document.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              项目：{projectId}。版本 v{document.version ?? 1}，
              更新时间：{document.updatedAt ? formatDateTime(document.updatedAt) : "未记录"}。
            </p>
            <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
              <span>OnlyOffice：{onlyOfficeStatusLabel(document.onlyOffice?.status)}</span>
              <span>编辑锁：{document.editLock?.lockedBy ?? document.onlyOffice?.lockedBy ?? "未锁定"}</span>
              <span>下载：{downloadStatusLabel(document.download?.status)}</span>
              <span>大小：{document.byteLength ? `${document.byteLength} bytes` : "未记录"}</span>
            </div>
            <div className="mt-4 grid gap-1.5">
              <Label htmlFor={`document-name-${document.id}`}>文档名称</Label>
              <Input
                id={`document-name-${document.id}`}
                value={names[document.id] ?? ""}
                onChange={(event) =>
                  setNames((current) => ({
                    ...current,
                    [document.id]: event.target.value,
                  }))
                }
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                aria-label={`下载 ${displayName}`}
                onClick={() => void downloadDocument(document.id)}
              >
                下载
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-label={`重命名 ${displayName}`}
                onClick={() => void renameDocument(document.id)}
              >
                重命名
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-label={`版本记录 ${displayName}`}
                onClick={() => void loadVersions(document.id)}
              >
                版本记录
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-label={`恢复 ${displayName}`}
                onClick={() => void restoreDocument(document.id)}
              >
                恢复
              </Button>
              <Button
                type="button"
                variant="destructive"
                aria-label={`删除 ${displayName}`}
                onClick={() => void deleteDocument(document.id)}
              >
                删除
              </Button>
            </div>
            {versions[document.id] && (
              <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
                {versions[document.id].map((version) => (
                  <div key={`${document.id}-${version.version}`}>
                    v{version.version} {version.fileName}
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
        {currentDocuments.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            暂无文档记录。
          </div>
        )}
      </div>
      {(message || error) && (
        <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
          {message || error}
        </div>
      )}
    </SectionCard>
  );
}

function onlyOfficeStatusLabel(status?: string | null) {
  if (status === "editing") return "编辑中";
  if (status === "ready") return "可编辑";
  if (status === "unavailable") return "不可用";
  return "不可用";
}

function downloadStatusLabel(status?: string | null) {
  if (status === "available") return "可用";
  if (status === "preparing") return "准备中";
  if (status === "unavailable") return "不可用";
  return "不可用";
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
    <PageFrame onNavigate={onNavigate}>
      <div>
        <h1>账号设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          个人资料、邮箱、头像、通知偏好和普通界面偏好。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard>
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
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base">通知偏好</h2>
                <p className="text-sm text-muted-foreground">生成完成、文档编辑和邀请通知。</p>
              </div>
              <Switch defaultChecked aria-label="启用通知" />
            </div>
            <Button type="button" onClick={() => void saveProfile()} disabled={saving || loading}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              保存资料
            </Button>
            {(message || error) && (
              <div className="rounded-md border border-border bg-muted p-3 text-sm">
                {message || error}
              </div>
            )}
          </div>
        </SectionCard>
        <SectionCard>
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
        </SectionCard>
      </div>
    </PageFrame>
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
    <PageFrame onNavigate={onNavigate}>
      <div>
        <h1>安全设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          修改密码、MFA、活跃会话、最近登录记录和异常登录提醒。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard>
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            <h2 className="text-base">修改密码</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">重置后会强制旧会话失效。</p>
          <Button type="button" className="mt-4" variant="outline">修改密码</Button>
        </SectionCard>
        <SectionCard>
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
        </SectionCard>
        <SectionCard>
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            <h2 className="text-base">异常登录提醒</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">新设备或异常 IP 登录时发送邮件提醒。</p>
          <Switch defaultChecked aria-label="异常登录提醒" className="mt-4" />
        </SectionCard>
      </div>
      {(message || error) && (
        <div className="rounded-md border border-border bg-muted p-3 text-sm">
          {message || error}
        </div>
      )}
      <SectionCard>
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
                <div>{session.userAgent ?? "未知设备"} · {session.ipAddress ?? "未知 IP"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  最近活动：{formatDateTime(session.lastSeenAt)}
                </div>
              </div>
            ))}
          {!loading && sessions.length === 0 && (
            <div className="text-sm text-muted-foreground">暂无活跃会话。</div>
          )}
        </div>
      </SectionCard>
      <SectionCard>
        <h2 className="text-base">最近登录记录</h2>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          {loading && <span>正在加载登录记录...</span>}
          {!loading &&
            loginEvents.map((event) => (
              <span key={event.id}>
                {event.email ?? "未知账号"} · {event.outcome === "success" ? "成功" : "失败"} ·{" "}
                {event.ipAddress ?? "未知 IP"} · {formatDateTime(event.createdAt)}
              </span>
            ))}
          {!loading && loginEvents.length === 0 && <span>暂无登录记录。</span>}
        </div>
      </SectionCard>
    </PageFrame>
  );
}

export function ModelSettingsPage({ onNavigate }: { onNavigate: Navigate }) {
  const repository = useWorkspaceRepository();
  const allowLegacyProviderSettings = legacyProviderSettingsEnabled();
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings());
  const [showKey, setShowKey] = useState(false);
  const [showLegacyProvider, setShowLegacyProvider] = useState(false);
  const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
  const [providerLoading, setProviderLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    setProviderLoading(true);
    platformApi
      .listProviderConfigs()
      .then((response) => {
        if (!active) return;
        const activeConfigs = response.providerConfigs.filter(
          (config) => config.status === "active",
        );
        setProviderConfigs(activeConfigs);
        if (activeConfigs[0]) {
          setSettings((current) =>
            current.providerConfigId
              ? current
              : {
                  ...current,
                  providerConfigId: activeConfigs[0].id,
                  apiKey: "",
                  apiBaseUrl: "",
                },
          );
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof PlatformApiError && error.status === 401) {
          setStatus(
            allowLegacyProviderSettings
              ? "需要登录后加载托管 Provider 配置；legacy/dev Provider 仅限显式开发模式。"
              : "需要登录后加载托管 Provider 配置。",
          );
          return;
        }
        if (error instanceof PlatformApiError && error.status === 403) {
          setStatus("当前账号没有托管 Provider 配置访问权限，请联系管理员检查项目或组织权限。");
          return;
        }
        setStatus(error instanceof Error ? error.message : "托管供应商配置加载失败。");
      })
      .finally(() => {
        if (active) setProviderLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setStatus("");
  };

  const save = () => {
    try {
      saveUserSettings({
        ...settings,
        apiKey: settings.providerConfigId ? "" : settings.apiKey,
        apiBaseUrl: settings.providerConfigId
          ? ""
          : normalizeApiBaseUrl(settings.apiBaseUrl),
      });
      setSettings(loadUserSettings());
      setStatus("模型配置已保存。");
      toast.success("模型配置已保存");
    } catch {
      setStatus("API Base URL 不是合法地址。");
      toast.error("API Base URL 不是合法地址");
    }
  };

  const reset = () => {
    setSettings(DEFAULT_USER_SETTINGS);
    setStatus("已恢复默认值，点击保存后生效。");
  };

  const testConnection = async () => {
    setTesting(true);
    setStatus("");
    try {
      if (settings.providerConfigId) {
        const result = await platformApi.testProviderConfig(settings.providerConfigId);
        if (result.ok === false) {
          throw new Error(result.message ?? "托管配置连接测试失败。");
        }
        setStatus(`连接成功：${result.message ?? "托管配置可用"}`);
        return;
      }
      if (!allowLegacyProviderSettings) {
        throw new Error("请先选择托管供应商配置。");
      }
      const result = await repository.testProviderSettings({
        apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
        apiKey: settings.apiKey,
        model: settings.defaultModel,
      });
      setStatus(`连接成功：${result.capability.modeLabel}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "连接测试失败。");
    } finally {
      setTesting(false);
    }
  };

  const maskedKey = useMemo(() => maskApiKey(settings.apiKey), [settings.apiKey]);
  const selectedProviderConfig = providerConfigs.find(
    (config) => config.id === settings.providerConfigId,
  );

  return (
    <PageFrame onNavigate={onNavigate}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>模型设置</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            登录态优先使用服务端托管 Provider Config。API Key 不作为主要路径写入本地；
            {allowLegacyProviderSettings
              ? "legacy/dev 备选仅用于显式本地开发兼容。"
              : "普通登录态不会保存或回显明文 API Key。"}
          </p>
        </div>
        <Badge variant="secondary">
          <KeyRound className="mr-1 size-3.5" />
          {selectedProviderConfig?.maskedKey ?? maskedKey}
        </Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="managed-provider-config">托管供应商配置</Label>
              <SelectControl
                id="managed-provider-config"
                aria-label="托管供应商配置"
                value={settings.providerConfigId}
                onValueChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    providerConfigId: value,
                    apiBaseUrl: value ? "" : current.apiBaseUrl,
                    apiKey: value ? "" : current.apiKey,
                  }))
                }
                className="h-9"
                disabled={providerLoading || providerConfigs.length === 0}
                options={[
                  {
                    value: "",
                    label: providerLoading ? "正在加载托管配置" : "不使用托管配置",
                  },
                  ...providerConfigs.map((config) => ({
                    value: config.id,
                    label: config.name,
                  })),
                ]}
              />
              {selectedProviderConfig && (
                <span className="text-[11px] text-muted-foreground">
                  {selectedProviderConfig.provider} · {selectedProviderConfig.baseUrl} ·{" "}
                  {selectedProviderConfig.maskedKey} · {selectedProviderConfig.riskState}
                </span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="managed-default-model">默认模型</Label>
              <Input
                id="managed-default-model"
                value={settings.defaultModel}
                onChange={(event) => update("defaultModel", event.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            {allowLegacyProviderSettings && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowLegacyProvider((value) => !value)}
              >
                {showLegacyProvider ? "隐藏 legacy/dev 备选" : "显示 legacy/dev 备选"}
              </Button>
            )}
            {allowLegacyProviderSettings && showLegacyProvider && (
              <ModelSettingsFields
                settings={settings}
                showKey={showKey}
                onToggleKey={() => setShowKey((value) => !value)}
                onChange={update}
              />
            )}
          </div>
          <Separator className="my-5" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save}>保存模型设置</Button>
            <Button
              type="button"
              variant="outline"
              onClick={testConnection}
              disabled={
                testing ||
                (!settings.providerConfigId &&
                  (!allowLegacyProviderSettings ||
                    !settings.apiBaseUrl.trim() ||
                    !settings.apiKey.trim()))
              }
            >
              {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              {settings.providerConfigId ? "测试托管配置" : "测试连接"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              <RotateCw className="size-4" />
              恢复默认
            </Button>
          </div>
          {status && (
            <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
              {status}
            </div>
          )}
        </SectionCard>
        <SectionCard className="h-fit">
          <h2 className="text-base">后续服务端托管</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>密钥新增后只显示尾号、用途、创建人和最近使用时间。</li>
            <li>支持测试连接、撤销、轮换和风险状态展示。</li>
            <li>后端会限制供应商 Base URL 白名单，避免任意地址请求。</li>
            <li>高危操作会进入审计日志。</li>
          </ul>
        </SectionCard>
      </div>
    </PageFrame>
  );
}

export function ProjectWorkspaceBanner({
  projectId,
  onOpenDrawer,
}: {
  projectId: string;
  onOpenDrawer?: (kind: ProjectDrawerKind) => void;
}) {
  const overview = useProjectOverview(projectId);
  const activeRuns = overview.runs.filter(
    (run) => run.status === "queued" || run.status === "running",
  ).length;
  useEffect(() => {
    const defaultProviderConfigId = overview.project?.defaultProviderConfigId;
    if (!defaultProviderConfigId) return;
    let active = true;
    platformApi
      .listProjectProviderConfigs(projectId)
      .then((response) => {
        if (!active) return;
        const config = response.providerConfigs.find(
          (item) => item.id === defaultProviderConfigId,
        );
        patchUserSettings({
          providerConfigId: defaultProviderConfigId,
          defaultModel: config?.defaultModel ?? loadUserSettings().defaultModel,
          apiBaseUrl: "",
          apiKey: "",
        });
      })
      .catch(() => {
        if (!active) return;
        patchUserSettings({
          providerConfigId: defaultProviderConfigId,
          apiBaseUrl: "",
          apiKey: "",
        });
      });
    return () => {
      active = false;
    };
  }, [overview.project?.defaultProviderConfigId, projectId]);
  const shortcuts: Array<{ label: string; kind: ProjectDrawerKind; icon: typeof Settings }> = [
    { label: "项目设置", kind: "settings", icon: Settings },
    { label: "成员", kind: "members", icon: Users },
    { label: "文档中心", kind: "documents", icon: BookOpen },
  ];

  if (overview.loading) {
    return (
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          项目数据加载中...
        </div>
      </div>
    );
  }

  if (overview.authRequired || overview.forbidden || overview.error || !overview.project) {
    return (
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Badge variant={overview.forbidden ? "destructive" : "outline"}>
              {overview.forbidden ? "权限不足" : "项目工作台"}
            </Badge>
            <span className="font-semibold">项目 {projectId}</span>
          </div>
          <span className="text-muted-foreground">
            {overview.authRequired
              ? "需要登录后查看项目工作台"
              : overview.error || "项目数据不可用"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-card px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">项目工作台</Badge>
          <span className="font-semibold">{overview.project.name}</span>
          <span className="text-muted-foreground">成员 {overview.members.length}</span>
          <span className="text-muted-foreground">
            权限 {overview.membership?.role ?? "unknown"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {onOpenDrawer && (
            <ProjectWorkspaceActions projectId={projectId} onOpenDrawer={onOpenDrawer} />
          )}
          {onOpenDrawer &&
            shortcuts.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Button
                  key={shortcut.kind}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenDrawer(shortcut.kind)}
                >
                  <Icon className="size-4" />
                  {shortcut.label}
                </Button>
              );
            })}
          <span>已同步</span>
          <span>{overview.membership?.role ?? "unknown"}</span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-4" />
            运行中 {activeRuns}
          </span>
          <span>项目状态：{overview.project.status}</span>
          <span className="inline-flex items-center gap-1">
            <FileText className="size-4" />
            文档 {overview.documents.length}
          </span>
        </div>
      </div>
    </div>
  );
}
