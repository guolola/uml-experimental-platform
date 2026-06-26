// Hosts authenticated project, account, and provider pages backed by the platform API.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  BookOpen,
  Clock3,
  FileText,
  GitBranch,
  Loader2,
  Lock,
  MoreHorizontal,
  RotateCw,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { cn } from "../../../shared/ui/utils";
import {
  ProjectGenerationTasksDrawerContent,
  ProjectWorkspaceActions,
} from "../../workspace-shell/components/top-bar";
import { formatDateTime } from "../lib/project-workspace-presentation";
import {
  AUTH_SESSION_CHANGED_EVENT,
  PlatformApiError,
  platformApi,
  type PlatformDocument,
  type PlatformProject,
  type PlatformProjectMember,
  type PlatformRunSummary,
  type PlatformAccountProfileResponse,
} from "../services/platform-api";
import {
  PlatformLoadingCoordinatorProvider,
  PlatformLoadingScreen,
  usePlatformLoadingCoordinatorState,
  usePlatformRouteLoading,
  useLoadingTransition,
} from "./platform-loading-screen";
import { AuthenticatedRouteSessionProvider } from "./authenticated-route-session";
import { ManagedProviderSettingsSync } from "./managed-provider-settings-sync";
import { ProjectDocuments } from "./project-documents";
import { ProjectHistory } from "./project-history";
import { ProjectMembers } from "./project-members";
import { PageFrame, SectionCard } from "./project-page-layout";
import { ProjectSettings } from "./project-settings";
import { LineageGraphDialog } from "../../lineage/components/lineage-graph-dialog";
export { AuthPage } from "./auth-page";
export { AccountPage, AccountSecurityPage } from "./account-pages";
export { InvitationAcceptPage } from "./invitation-accept-page";
export { ProjectNewPage } from "./project-new-page";
export { ProjectsIndexPage } from "./projects-index-page";

type Navigate = (path: string) => void;

const AUTH_ROUTE_SESSION_GRACE_MS = 60_000;
const ACTIVE_RUNS_REFRESH_MS = 8_000;

export type ProjectDrawerKind = "tasks" | "members" | "history" | "documents" | "settings";

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

const ProjectOverviewContext =
  createContext<{ projectId: string; overview: ProjectOverviewState } | null>(null);

export function useCurrentProjectOverview() {
  return useContext(ProjectOverviewContext);
}

function useProjectOverview(projectId: string) {
  const providedOverview = useContext(ProjectOverviewContext);
  const contextOverview =
    providedOverview?.projectId === projectId ? providedOverview.overview : null;
  const [state, setState] = useState<ProjectOverviewState>(emptyProjectOverview);

  useEffect(() => {
    if (contextOverview) return;
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
  }, [contextOverview, projectId]);

  const hasActiveRuns = state.runs.some(
    (run) => run.status === "queued" || run.status === "running",
  );

  useEffect(() => {
    if (contextOverview || state.loading || !hasActiveRuns) return;
    let active = true;
    const refreshRuns = () => {
      platformApi
        .listProjectRuns(projectId)
        .then((response) => {
          if (!active) return;
          setState((current) => ({
            ...current,
            runs: response.runs,
          }));
        })
        .catch(() => {
          // Project overview remains usable when background run polling misses a beat.
        });
    };
    const intervalId = window.setInterval(refreshRuns, ACTIVE_RUNS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [contextOverview, hasActiveRuns, projectId, state.loading]);

  return contextOverview ?? state;
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

function ProjectWorkspaceLoadingLayout() {
  return (
    <div
      data-testid="project-workspace-loading-layout"
      className="pointer-events-none grid min-h-0 min-w-0 flex-1 grid-cols-[10%_1px_minmax(0,1fr)] overflow-hidden bg-background"
      aria-hidden="true"
    >
      <aside className="h-full min-w-20 border-r border-sidebar-border bg-sidebar" />
      <div className="h-full bg-border/70" />
      <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        <div className="h-[53px] shrink-0 border-b border-border bg-card" />
        <div className="h-12 shrink-0 border-b border-border bg-background" />
        <div className="min-h-0 flex-1 bg-background" />
      </main>
    </div>
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
  return (
    <PlatformLoadingCoordinatorProvider>
      <AuthenticatedRouteContent onNavigate={onNavigate} routeKey={routeKey}>
        {children}
      </AuthenticatedRouteContent>
    </PlatformLoadingCoordinatorProvider>
  );
}

function AuthenticatedRouteContent({
  children,
  onNavigate,
  routeKey,
}: {
  children: React.ReactNode;
  onNavigate: Navigate;
  routeKey?: string;
}) {
  const [checking, setChecking] = useState(true);
  const [verifiedRouteKey, setVerifiedRouteKey] = useState<string | undefined>(undefined);
  const [authSession, setAuthSession] = useState<PlatformAccountProfileResponse | null>(null);
  const childLoading = usePlatformLoadingCoordinatorState();
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const lastVerifiedAtRef = useRef(0);
  const hasVerifiedSession =
    Boolean(authSession) && verifiedRouteKey !== undefined;
  const hasFreshSession =
    hasVerifiedSession &&
    Date.now() - lastVerifiedAtRef.current < AUTH_ROUTE_SESSION_GRACE_MS;
  const effectiveChecking =
    !hasVerifiedSession && (checking || verifiedRouteKey !== routeKey);
  const overlayActive = effectiveChecking || childLoading.active;
  const overlayMessage = childLoading.message ?? "正在校验登录状态...";
  const loadingTransition = useLoadingTransition(overlayActive);

  const verifySession = useCallback((options: { blocking?: boolean } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (options.blocking !== false) {
      setChecking(true);
    }
    platformApi
      .me()
      .then((response) => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setAuthSession(response);
        lastVerifiedAtRef.current = Date.now();
        setVerifiedRouteKey(routeKey);
        setChecking(false);
      })
      .catch(() => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setAuthSession(null);
        setVerifiedRouteKey(undefined);
        setChecking(false);
        onNavigate("/");
      });
  }, [onNavigate, routeKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    verifySession({ blocking: !hasFreshSession });
  }, [hasFreshSession, routeKey, verifySession]);

  useEffect(() => {
    const handleSessionChanged = () => verifySession({ blocking: true });
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
    };
  }, [verifySession]);

  if (effectiveChecking) {
    return (
      <PlatformLoadingScreen
        message={overlayMessage}
        variant="fullscreen"
        phase={loadingTransition.phase === "hidden" ? "loading" : loadingTransition.phase}
        progress={loadingTransition.progress}
      />
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AuthenticatedRouteSessionProvider value={authSession}>
        <ManagedProviderSettingsSync session={authSession} />
        {children}
      </AuthenticatedRouteSessionProvider>
      {loadingTransition.visible && loadingTransition.phase !== "hidden" && (
        <PlatformLoadingScreen
          message={overlayMessage}
          variant="fullscreen"
          phase={loadingTransition.phase}
          progress={loadingTransition.progress}
          className={cn(
            "absolute inset-0 z-50",
            !overlayActive && "pointer-events-none",
          )}
        />
      )}
    </div>
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
        <ProjectSettings
          project={overview.project}
          membershipRole={overview.membership?.role ?? null}
          onProjectDeleted={() => onNavigate("/projects")}
        />
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
  const handleProjectDeleted = () => {
    onClose();
    onNavigate?.("/projects");
  };
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
    content = <ProjectGenerationTasksDrawerContent projectRuns={overview.runs} />;
  } else if (activeDrawer === "settings") {
    content = (
      <ProjectSettings
        project={overview.project}
        membershipRole={overview.membership?.role ?? null}
        layout="drawer"
        onProjectDeleted={handleProjectDeleted}
      />
    );
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
  const coordinatedLoading = usePlatformRouteLoading(
    "正在打开项目工作台...",
    overview.loading,
  );
  const loadingTransition = useLoadingTransition(overview.loading);
  const overviewContextValue = useMemo(
    () => ({ projectId, overview }),
    [overview, projectId],
  );

  if (overview.loading) {
    if (coordinatedLoading) {
      return <ProjectWorkspaceLoadingLayout />;
    }
    return (
      <PageFrame onNavigate={onNavigate}>
        <PlatformLoadingScreen
          message="正在打开项目工作台..."
          variant="content"
          phase={loadingTransition.phase === "hidden" ? "loading" : loadingTransition.phase}
          progress={loadingTransition.progress}
        />
      </PageFrame>
    );
  }

  if (accessMessage || !overview.project) {
    return (
      <div className="relative flex min-h-0 flex-1">
        <PageFrame onNavigate={onNavigate}>{accessMessage}</PageFrame>
        {!coordinatedLoading && loadingTransition.visible && loadingTransition.phase !== "hidden" && (
          <PlatformLoadingScreen
            message="正在打开项目工作台..."
            variant="content"
            phase={loadingTransition.phase}
            progress={loadingTransition.progress}
            className="absolute inset-6 z-20"
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <ProjectOverviewContext.Provider value={overviewContextValue}>
        {children}
      </ProjectOverviewContext.Provider>
      {!coordinatedLoading && loadingTransition.visible && loadingTransition.phase !== "hidden" && (
        <PlatformLoadingScreen
          message="正在打开项目工作台..."
          variant="content"
          phase={loadingTransition.phase}
          progress={loadingTransition.progress}
          className="absolute inset-6 z-20"
        />
      )}
    </div>
  );
}

export function ProjectWorkspaceBanner({
  projectId,
  onOpenDrawer,
  activeGenerationTaskCount = 0,
}: {
  projectId: string;
  onOpenDrawer?: (kind: ProjectDrawerKind) => void;
  activeGenerationTaskCount?: number;
}) {
  const overview = useProjectOverview(projectId);
  const activeServerRuns = overview.runs.filter(
    (run) => run.status === "queued" || run.status === "running",
  ).length;
  const [lineageOpen, setLineageOpen] = useState(false);
  const activeRuns = Math.max(activeServerRuns, activeGenerationTaskCount);
  const shortcuts: Array<{ label: string; kind: ProjectDrawerKind; icon: typeof Settings }> = [
    { label: "项目设置", kind: "settings", icon: Settings },
    { label: "成员", kind: "members", icon: Users },
    { label: "文档中心", kind: "documents", icon: BookOpen },
  ];

  if (overview.loading) {
    return (
      <div className="flex min-h-[53px] items-center border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          项目数据加载中...
        </div>
      </div>
    );
  }

  if (overview.authRequired || overview.forbidden || overview.error || !overview.project) {
    return (
      <div className="flex min-h-[53px] items-center border-b border-border bg-card px-4 py-2">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm">
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
    <>
      {lineageOpen && (
        <LineageGraphDialog
          open={lineageOpen}
          onOpenChange={setLineageOpen}
          projectRuns={overview.runs}
        />
      )}
      <div className="flex min-h-[53px] items-center border-b border-border bg-card px-3 py-2 md:px-4">
        <div className="flex w-full min-w-0 items-center justify-between gap-3 text-sm md:flex-wrap">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <Badge variant="secondary">项目工作台</Badge>
            <span className="min-w-0 truncate font-semibold">{overview.project.name}</span>
            <span className="hidden text-muted-foreground sm:inline">
              成员 {overview.members.length}
            </span>
            <span className="hidden text-muted-foreground sm:inline">
              权限 {overview.membership?.role ?? "unknown"}
            </span>
          </div>
          <div className="hidden flex-wrap items-center gap-2 text-muted-foreground md:flex">
            {onOpenDrawer && (
              <ProjectWorkspaceActions
                projectId={projectId}
                projectRuns={overview.runs}
                onOpenDrawer={onOpenDrawer}
              />
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
          {onOpenDrawer && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 rounded-full md:hidden"
                  aria-label="打开项目操作"
                  title="打开项目操作"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuLabel>
                  {overview.membership?.role ?? "unknown"} · 已同步
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setLineageOpen(true)}>
                  <GitBranch className="size-4" />
                  链路图
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenDrawer("tasks")}>
                  <Activity className="size-4" />
                  生成任务
                  <span className="ml-auto text-xs text-muted-foreground">
                    {activeRuns}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenDrawer("history")}>
                  <Clock3 className="size-4" />
                  运行历史
                </DropdownMenuItem>
                {shortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <DropdownMenuItem
                      key={shortcut.kind}
                      onSelect={() => onOpenDrawer(shortcut.kind)}
                    >
                      <Icon className="size-4" />
                      {shortcut.label}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  项目状态：{overview.project.status}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  文档 {overview.documents.length}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </>
  );
}
