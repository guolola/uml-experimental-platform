// Composes application providers, route matching, workspace shell layout, and top-level page selection.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../shared/ui/resizable";
import { Toaster } from "../shared/ui/sonner";
import { ThemeProvider } from "./providers/theme-provider";
import {
  DesignDiagramView,
  DiagramView,
} from "../features/diagrams/components/diagram-detail-page";
import { CodeGenerationPage } from "../features/code/components/code-generation-page";
import { DesignModelPage } from "../features/design/components/design-model-page";
import { InstructionDocumentsPage } from "../features/documents/components/instruction-documents-page";
import { TextRequirementView } from "../features/requirements/components/text-requirement-page";
import { TraceabilityMatrixPage } from "../features/traceability/components/traceability-matrix-page";
import { TestModelPage } from "../features/testing/components/test-model-page";
import { MarketingHomePage } from "../features/marketing-site/components/marketing-home-page";
import { ProductDocsPage } from "../features/product-docs/components/product-docs-page";
import { SidebarMenu } from "../features/workspace-shell/components/sidebar-menu";
import {
  TopBar,
} from "../features/workspace-shell/components/top-bar";
import {
  findShellRouteModule,
  type ShellRoutePath,
} from "./workspace-modules";
import { matchAppRoute, type AppRoute } from "./app-routes";
import { WorkspaceTabsBar } from "../features/workspace-shell/components/workspace-tabs-bar";
import { MobileWorkspaceNavigation } from "../features/workspace-shell/components/mobile-workspace-navigation";
import { Workspace } from "../features/workspace-shell/components/workspace-placeholder";
import { WorkspaceRepositoryProvider } from "../services/workspace-repository";
import { WorkspaceShellProvider, useWorkspaceShell } from "../features/workspace-shell/state";
import {
  WorkspaceSessionProvider,
  useWorkspaceSession,
} from "../features/workspace-session/state";
import { useCompactViewport } from "../features/workspace-shell/hooks/use-compact-viewport";
import {
  AuthenticatedRoute,
  AuthPage,
  InvitationAcceptPage,
  ProjectNewPage,
  ProjectWorkspaceDrawer,
  type ProjectDrawerKind,
  ProjectWorkspaceAccessBoundary,
  ProjectsIndexPage,
  ProjectWorkspaceBanner,
  useCurrentProjectOverview,
} from "../features/user-platform/components/user-platform-pages";
import { ManagedProviderSettingsSync } from "../features/user-platform/components/managed-provider-settings-sync";

function StandaloneRoutePage({ route }: { route: Exclude<ShellRoutePath, "/workspace"> }) {
  const meta = findShellRouteModule(route);

  return (
    <main className="flex min-h-0 flex-1 bg-background px-8 py-8">
      <section className="flex w-full items-center justify-center rounded-2xl border border-border bg-card text-center">
        <div className="flex max-w-xl flex-col items-center gap-3 px-6">
          <h1 className="text-3xl font-semibold">{meta.label}</h1>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>
      </section>
    </main>
  );
}

function getProtectedRoutePath(route: AppRoute) {
  if (
    route.kind === "shell" ||
    route.kind === "projects-index" ||
    route.kind === "projects-new" ||
    route.kind === "project-workspace" ||
    route.kind === "legacy-account"
  ) {
    return route.path;
  }
  return null;
}

function ProjectWorkspaceShell({
  projectId,
  routeDrawer,
  activeProjectDrawer,
  onActiveProjectDrawerChange,
  onNavigate,
}: {
  projectId: string;
  routeDrawer: ProjectDrawerKind | null;
  activeProjectDrawer: ProjectDrawerKind | null;
  onActiveProjectDrawerChange: (drawer: ProjectDrawerKind | null) => void;
  onNavigate: (route: string) => void;
}) {
  const { selection } = useWorkspaceShell();
  const { generationTasks } = useWorkspaceSession();
  const projectOverview = useCurrentProjectOverview();
  const projectRuns = projectOverview?.projectId === projectId ? projectOverview.overview.runs : [];
  const compactViewport = useCompactViewport();
  const activeGenerationTaskCount = generationTasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  ).length;
  const activeDrawer = routeDrawer ?? activeProjectDrawer;
  const closeDrawer = () => {
    onActiveProjectDrawerChange(null);
    if (routeDrawer) {
      onNavigate(`/projects/${encodeURIComponent(projectId)}`);
    }
  };

  let body: ReactNode;
  switch (selection.kind) {
    case "requirements-text":
      body = <TextRequirementView />;
      break;
    case "requirement-trace-matrix":
      body = (
        <TraceabilityMatrixPage
          mode="requirements"
          scope={{
            diagramKind: selection.diagram,
            modelId: selection.modelId,
            label: selection.label.replace(/^跟踪矩阵 · /u, ""),
          }}
        />
      );
      break;
    case "diagram-element":
      body = (
        <DiagramView
          type={selection.diagram}
          modelId={selection.modelId}
          highlightedElement={{
            kind: selection.elementKind,
            id: selection.elementId,
          }}
        />
      );
      break;
    case "diagram":
      body = (
        <DiagramView
          type={selection.diagram}
          modelId={selection.modelId}
          highlightedElement={null}
        />
      );
      break;
    case "design-home":
      body = <DesignModelPage />;
      break;
    case "design-trace-matrix":
      body = (
        <TraceabilityMatrixPage
          mode="design"
          scope={{
            diagramKind: selection.diagram,
            modelId: selection.modelId,
            label: selection.label.replace(/^跟踪矩阵 · /u, ""),
          }}
        />
      );
      break;
    case "test-home":
      body = <TestModelPage />;
      break;
    case "design-diagram":
      body = (
        <DesignDiagramView
          type={selection.diagram}
          modelId={selection.modelId}
          highlightedElement={null}
        />
      );
      break;
    case "design-diagram-element":
      body = (
        <DesignDiagramView
          type={selection.diagram}
          modelId={selection.modelId}
          highlightedElement={{
            kind: selection.elementKind,
            id: selection.elementId,
          }}
        />
      );
      break;
    case "documents-home":
      body = <InstructionDocumentsPage />;
      break;
    case "document-editor":
      body = <InstructionDocumentsPage activeDocumentId={selection.documentId} />;
      break;
    case "workspace-placeholder":
      body =
        selection.workspaceId === "code" ? (
          <CodeGenerationPage />
        ) : (
          <Workspace title={selection.label} />
        );
      break;
  }

  if (compactViewport) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <ProjectWorkspaceBanner
            projectId={projectId}
            onOpenDrawer={onActiveProjectDrawerChange}
            activeGenerationTaskCount={activeGenerationTaskCount}
          />
          <WorkspaceTabsBar />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="h-full min-h-0">{body}</div>
            <ProjectWorkspaceDrawer
              projectId={projectId}
              activeDrawer={activeDrawer}
              onNavigate={onNavigate}
              onClose={closeDrawer}
            />
          </div>
        </main>
        <MobileWorkspaceNavigation projectRuns={projectRuns} />
      </div>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      <ResizablePanel
        data-testid="workspace-sidebar-panel"
        data-default-size="10"
        data-min-size="8"
        data-max-size="22"
        defaultSize={10}
        minSize={8}
        maxSize={22}
      >
        <aside className="h-full w-full border-r border-sidebar-border bg-sidebar">
          <SidebarMenu projectRuns={projectRuns} />
        </aside>
      </ResizablePanel>
      <ResizableHandle withHandle className="bg-border/70" />
      <ResizablePanel defaultSize={90}>
        <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
          <ProjectWorkspaceBanner
            projectId={projectId}
            onOpenDrawer={onActiveProjectDrawerChange}
            activeGenerationTaskCount={activeGenerationTaskCount}
          />
          <WorkspaceTabsBar />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="h-full min-h-0">{body}</div>
            <ProjectWorkspaceDrawer
              projectId={projectId}
              activeDrawer={activeDrawer}
              onNavigate={onNavigate}
              onClose={closeDrawer}
            />
          </div>
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function Shell() {
  const [activeProjectDrawer, setActiveProjectDrawer] = useState<ProjectDrawerKind | null>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window === "undefined" ? { kind: "marketing-home", path: "/" } : matchAppRoute(window.location.pathname),
  );

  useEffect(() => {
    const handlePopState = () => {
      setActiveProjectDrawer(null);
      setRoute(matchAppRoute(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigate = useCallback((nextPath: string) => {
    const nextUrl = new URL(nextPath, window.location.origin);
    const nextLocation = `${nextUrl.pathname}${nextUrl.search}`;
    setActiveProjectDrawer(null);
    if (`${window.location.pathname}${window.location.search}` !== nextLocation) {
      window.history.pushState({}, "", nextLocation);
      window.dispatchEvent(
        new CustomEvent("uml-route-change", {
          detail: { path: nextUrl.pathname, location: nextLocation },
        }),
      );
    }
    setRoute(matchAppRoute(nextUrl.pathname));
  }, []);

  const renderRoute = () => {
    if (route.kind === "marketing-home") {
      if (route.path === "/pricing") {
        return <RedirectRoute to="/" onNavigate={navigate} />;
      }
      return <MarketingHomePage path={route.path} onNavigate={navigate} />;
    }
    if (route.kind === "shell") {
      if (route.path === "/workspace") {
        return <RedirectRoute to="/projects" onNavigate={navigate} />;
      }
      if (route.path === "/tutorial") {
        return <ProductDocsPage onNavigate={navigate} />;
      }
      return <StandaloneRoutePage route={route.path as Exclude<ShellRoutePath, "/workspace">} />;
    }
    if (route.kind === "auth") {
      return <AuthPage key={route.path} path={route.path} onNavigate={navigate} />;
    }
    if (route.kind === "invitation-accept") {
      return <InvitationAcceptPage onNavigate={navigate} />;
    }
    if (route.kind === "projects-index") {
      return <ProjectsIndexPage onNavigate={navigate} />;
    }
    if (route.kind === "projects-new") {
      return <ProjectNewPage onNavigate={navigate} />;
    }
    if (route.kind === "account-billing") {
      return <RedirectRoute to="/projects" onNavigate={navigate} />;
    }
    if (route.kind === "alipay-return") {
      return <RedirectRoute to="/projects" onNavigate={navigate} />;
    }
    if (route.kind === "legacy-account") {
      return <RedirectRoute to="/projects" onNavigate={navigate} />;
    }
    if (route.kind === "legacy-redirect") {
      return <RedirectRoute to={route.to} onNavigate={navigate} />;
    }
    if (route.kind === "project-workspace") {
      return (
        <ProjectWorkspaceAccessBoundary projectId={route.projectId} onNavigate={navigate}>
          <WorkspaceShellProvider key={route.projectId}>
            <ProjectWorkspaceShell
              projectId={route.projectId}
              routeDrawer={route.drawer ?? null}
              activeProjectDrawer={activeProjectDrawer}
              onActiveProjectDrawerChange={setActiveProjectDrawer}
              onNavigate={navigate}
            />
          </WorkspaceShellProvider>
        </ProjectWorkspaceAccessBoundary>
      );
    }
    return <MarketingHomePage path="/" onNavigate={navigate} />;
  };

  const protectedRoutePath = getProtectedRoutePath(route);
  const routeContent = renderRoute();
  const showWorkspaceTopBar =
    route.kind !== "marketing-home" &&
    route.kind !== "auth" &&
    route.kind !== "invitation-accept" &&
    route.kind !== "legacy-redirect";
  const guardedRouteContent = (
    <>
      {showWorkspaceTopBar && (
        <TopBar
          currentRoute={route.path}
          onNavigate={navigate}
          accountDialogOpen={accountDialogOpen}
          onAccountDialogOpenChange={setAccountDialogOpen}
        />
      )}
      {routeContent}
    </>
  );

  return (
    <div className="flex h-screen h-[100dvh] min-h-[100svh] w-full flex-col overflow-hidden bg-background text-foreground">
      {protectedRoutePath ? (
        <AuthenticatedRoute routeKey={protectedRoutePath} onNavigate={navigate}>
          <ManagedProviderSettingsSync />
          {guardedRouteContent}
        </AuthenticatedRoute>
      ) : (
        guardedRouteContent
      )}
      <Toaster position="bottom-right" />
    </div>
  );
}

function RedirectRoute({
  to,
  onNavigate,
}: {
  to: string;
  onNavigate: (route: string) => void;
}) {
  useEffect(() => {
    onNavigate(to);
  }, [onNavigate, to]);

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
      正在进入项目...
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <WorkspaceRepositoryProvider>
        <WorkspaceSessionProvider>
          <Shell />
        </WorkspaceSessionProvider>
      </WorkspaceRepositoryProvider>
    </ThemeProvider>
  );
}
