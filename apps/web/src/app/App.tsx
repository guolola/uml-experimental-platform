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
import { HistoryDrawer } from "../features/history/components/history-drawer";
import { TextRequirementView } from "../features/requirements/components/text-requirement-page";
import { TraceabilityMatrixPage } from "../features/traceability/components/traceability-matrix-page";
import { MarketingHomePage } from "../features/marketing-site/components/marketing-home-page";
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
import { Workspace } from "../features/workspace-shell/components/workspace-placeholder";
import { WorkspaceRepositoryProvider } from "../services/workspace-repository";
import { WorkspaceShellProvider, useWorkspaceShell } from "../features/workspace-shell/state";
import { WorkspaceSessionProvider } from "../features/workspace-session/state";
import {
  AuthenticatedRoute,
  AuthPage,
  InvitationAcceptPage,
  ModelSettingsPage,
  ProjectNewPage,
  ProjectWorkspaceDrawer,
  type ProjectDrawerKind,
  ProjectWorkspaceAccessBoundary,
  ProjectsIndexPage,
  ProjectWorkspaceBanner,
} from "../features/user-platform/components/user-platform-pages";

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
    route.kind === "legacy-account" ||
    route.kind === "legacy-settings"
  ) {
    return route.path;
  }
  return null;
}

export function Shell() {
  const { selection, historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  const [activeProjectDrawer, setActiveProjectDrawer] = useState<ProjectDrawerKind | null>(null);
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
      window.dispatchEvent(new Event("uml-route-change"));
    }
    setRoute(matchAppRoute(nextUrl.pathname));
  }, []);

  let body: ReactNode;
  switch (selection.kind) {
    case "requirements-text":
      body = <TextRequirementView />;
      break;
    case "requirement-trace-matrix":
      body = <TraceabilityMatrixPage mode="requirements" />;
      break;
    case "diagram-element":
      body = (
        <DiagramView
          type={selection.diagram}
          highlightedElement={{
            kind: selection.elementKind,
            id: selection.elementId,
          }}
        />
      );
      break;
    case "diagram":
      body = <DiagramView type={selection.diagram} highlightedElement={null} />;
      break;
    case "design-home":
      body = <DesignModelPage />;
      break;
    case "design-trace-matrix":
      body = <TraceabilityMatrixPage mode="design" />;
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

  const renderWorkspace = (projectId: string | null, routeDrawer: ProjectDrawerKind | null = null) => {
    const activeDrawer = routeDrawer ?? activeProjectDrawer;
    const closeDrawer = () => {
      setActiveProjectDrawer(null);
      if (routeDrawer && projectId) {
        navigate(`/projects/${encodeURIComponent(projectId)}`);
      }
    };

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
            <SidebarMenu />
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-border/70" />
        <ResizablePanel defaultSize={90}>
          <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
            {projectId && (
              <ProjectWorkspaceBanner
                projectId={projectId}
                onOpenDrawer={setActiveProjectDrawer}
              />
            )}
            <WorkspaceTabsBar />
            <div className="min-h-0 flex-1">{body}</div>
            {projectId && (
              <ProjectWorkspaceDrawer
                projectId={projectId}
                activeDrawer={activeDrawer}
                onNavigate={navigate}
                onClose={closeDrawer}
              />
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  };

  const renderRoute = () => {
    if (route.kind === "marketing-home") {
      return <MarketingHomePage path={route.path} onNavigate={navigate} />;
    }
    if (route.kind === "shell") {
      return route.path === "/workspace" ? (
        <RedirectRoute to="/projects" onNavigate={navigate} />
      ) : (
        <StandaloneRoutePage route={route.path as Exclude<ShellRoutePath, "/workspace">} />
      );
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
    if (route.kind === "legacy-account") {
      return <RedirectRoute to="/projects" onNavigate={navigate} />;
    }
    if (route.kind === "legacy-settings") {
      return <ModelSettingsPage onNavigate={navigate} />;
    }
    if (route.kind === "project-workspace") {
      return (
        <ProjectWorkspaceAccessBoundary projectId={route.projectId} onNavigate={navigate}>
          {renderWorkspace(route.projectId, route.drawer ?? null)}
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
    route.kind !== "invitation-accept";
  const guardedRouteContent = (
    <>
      {showWorkspaceTopBar && (
        <TopBar
          currentRoute={route.path}
          onNavigate={navigate}
        />
      )}
      {routeContent}
    </>
  );

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      {protectedRoutePath ? (
        <AuthenticatedRoute routeKey={protectedRoutePath} onNavigate={navigate}>
          {guardedRouteContent}
        </AuthenticatedRoute>
      ) : (
        guardedRouteContent
      )}
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
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
      <WorkspaceShellProvider>
        <WorkspaceRepositoryProvider>
          <WorkspaceSessionProvider>
            <Shell />
          </WorkspaceSessionProvider>
        </WorkspaceRepositoryProvider>
      </WorkspaceShellProvider>
    </ThemeProvider>
  );
}
