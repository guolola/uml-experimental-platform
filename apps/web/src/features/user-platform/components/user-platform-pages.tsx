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
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BookOpen,
  Clock3,
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
  const { t } = useTranslation();
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
              : t("projectShell.access.loadFailedFallback"),
        });
      });
    return () => {
      active = false;
    };
  }, [contextOverview, projectId, t]);

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

  useEffect(() => {
    if (contextOverview) return;
    let active = true;
    const refreshCompletedRuns = () => {
      void platformApi.listProjectRuns(projectId).then((response) => {
        if (!active) return;
        setState((current) => ({ ...current, runs: response.runs }));
      }).catch(() => {
        // Completion refresh is best-effort; the manual history refresh remains available.
      });
    };
    window.addEventListener("uml-generation-completed", refreshCompletedRuns);
    return () => {
      active = false;
      window.removeEventListener("uml-generation-completed", refreshCompletedRuns);
    };
  }, [contextOverview, projectId]);

  return contextOverview ?? state;
}

function renderAccessMessage(
  overview: ProjectOverviewState,
  t: TFunction,
  onNavigate?: Navigate,
) {
  if (overview.authRequired) {
    return (
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base">{t("projectShell.access.loginTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("projectShell.access.loginDescription")}
            </p>
          </div>
          {onNavigate && (
            <Button type="button" onClick={() => onNavigate("/login")}>
              {t("projectShell.access.loginAction")}
            </Button>
          )}
        </div>
      </SectionCard>
    );
  }
  if (overview.forbidden) {
    return (
      <SectionCard>
        <h2 className="text-base">{t("projectShell.access.forbiddenTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("projectShell.access.forbiddenDescription")}
        </p>
      </SectionCard>
    );
  }
  if (overview.error) {
    return (
      <SectionCard>
        <h2 className="text-base">{t("projectShell.access.loadFailedTitle")}</h2>
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
  const { t } = useTranslation();
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
  const overlayMessage = childLoading.message ?? t("projectShell.checkingSession");
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
  const { t } = useTranslation();
  const overview = useProjectOverview(projectId);
  const sectionTitle = {
    settings: t("projectShell.sections.settings"),
    members: t("projectShell.sections.members"),
    history: t("projectShell.sections.history"),
    documents: t("projectShell.sections.documents"),
  }[section];
  const projectName =
    overview.project?.name ??
    (overview.loading ? t("projectShell.loadingProject") : t("projectShell.projectFallback", { projectId }));
  const accessMessage = renderAccessMessage(overview, t, onNavigate);

  return (
    <PageFrame onNavigate={onNavigate}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{sectionTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{projectName}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => onNavigate(`/projects/${projectId}`)}>
          {t("projectShell.backToWorkspace")}
        </Button>
      </div>
      {overview.loading && (
        <SectionCard>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("projectShell.loadingProjectData")}
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
    titleKey: string;
    descriptionKey: string;
    icon: typeof Users;
    width: "compact" | "history" | "wide";
  }
> = {
  tasks: {
    titleKey: "projectShell.drawer.tasks",
    descriptionKey: "projectShell.drawer.tasksDescription",
    icon: Activity,
    width: "history",
  },
  members: {
    titleKey: "projectShell.drawer.members",
    descriptionKey: "projectShell.drawer.membersDescription",
    icon: Users,
    width: "compact",
  },
  history: {
    titleKey: "projectShell.drawer.history",
    descriptionKey: "projectShell.drawer.historyDescription",
    icon: Clock3,
    width: "history",
  },
  documents: {
    titleKey: "projectShell.drawer.documents",
    descriptionKey: "projectShell.drawer.documentsDescription",
    icon: BookOpen,
    width: "compact",
  },
  settings: {
    titleKey: "projectShell.drawer.settings",
    descriptionKey: "projectShell.drawer.settingsDescription",
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
  const { t } = useTranslation();
  if (!open) return null;
  const meta = projectDrawerMeta[kind];
  const Icon = meta.icon;
  const title = t(meta.titleKey);
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
        aria-label={t("projectShell.drawer.closeOverlay", { title })}
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
                {title}
              </h2>
              <p className="truncate font-mono text-xs leading-4 text-muted-foreground">{projectName}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 rounded-full"
            aria-label={t("projectShell.drawer.close", { title })}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex min-h-[33px] min-w-0 items-center justify-between gap-3 overflow-hidden border-b border-border/60 bg-muted/70 px-6 py-2 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("projectShell.drawer.permission", { role: accessLabel ?? "unknown" })}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-primary">
            <CheckStatusDot />
            {t("projectShell.drawer.synced")}
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
  const { t } = useTranslation();
  const overview = useProjectOverview(projectId);
  if (!activeDrawer) return null;

  const projectName =
    overview.project?.name ??
    (overview.loading ? t("projectShell.loadingProject") : t("projectShell.projectFallback", { projectId }));
  const accessMessage = renderAccessMessage(overview, t, onNavigate);
  const handleProjectDeleted = () => {
    onClose();
    onNavigate?.("/projects");
  };
  let content: React.ReactNode;

  if (overview.loading) {
    content = (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("projectShell.loadingProjectData")}
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
  const { t } = useTranslation();
  const overview = useProjectOverview(projectId);
  const accessMessage = renderAccessMessage(overview, t, onNavigate);
  const coordinatedLoading = usePlatformRouteLoading(
    t("projectShell.openingWorkspace"),
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
          message={t("projectShell.openingWorkspace")}
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
            message={t("projectShell.openingWorkspace")}
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
          message={t("projectShell.openingWorkspace")}
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
  const { t } = useTranslation();
  const overview = useProjectOverview(projectId);
  const activeServerRuns = overview.runs.filter(
    (run) => run.status === "queued" || run.status === "running",
  ).length;
  const [lineageOpen, setLineageOpen] = useState(false);
  const activeRuns = Math.max(activeServerRuns, activeGenerationTaskCount);
  const shortcuts: Array<{ label: string; kind: ProjectDrawerKind; icon: typeof Settings }> = [
    { label: t("projectShell.drawer.settingsShort"), kind: "settings", icon: Settings },
    { label: t("projectShell.drawer.membersShort"), kind: "members", icon: Users },
    { label: t("projectShell.drawer.documentsShort"), kind: "documents", icon: BookOpen },
  ];

  if (overview.loading) {
    return (
      <div className="flex min-h-[53px] items-center border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("projectShell.projectDataLoading")}
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
              {overview.forbidden ? t("projectShell.access.forbiddenTitle") : t("projectShell.workspace")}
            </Badge>
            <span className="font-semibold">{t("projectShell.projectFallback", { projectId })}</span>
          </div>
          <span className="text-muted-foreground">
            {overview.authRequired
              ? t("projectShell.requiresLoginWorkspace")
              : overview.error || t("projectShell.projectDataUnavailable")}
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
            <Badge variant="secondary">{t("projectShell.workspace")}</Badge>
            <span className="min-w-0 truncate font-semibold">{overview.project.name}</span>
            <span className="hidden text-muted-foreground sm:inline">
              {t("projectShell.membersCount", { count: overview.members.length })}
            </span>
            <span className="hidden text-muted-foreground sm:inline">
              {t("projectShell.permission", { role: overview.membership?.role ?? "unknown" })}
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
          </div>
          {onOpenDrawer && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 rounded-full md:hidden"
                  aria-label={t("projectShell.openActions")}
                  title={t("projectShell.openActions")}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuLabel>
                  {overview.membership?.role ?? "unknown"} · {t("projectShell.drawer.synced")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setLineageOpen(true)}>
                  <GitBranch className="size-4" />
                  {t("status.lineage")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenDrawer("tasks")}>
                  <Activity className="size-4" />
                  {t("status.tasks")}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {activeRuns}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenDrawer("history")}>
                  <Clock3 className="size-4" />
                  {t("status.runHistory")}
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
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </>
  );
}
