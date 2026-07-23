// Composes application providers, route matching, workspace shell layout, and top-level page selection.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../shared/ui/resizable";
import { Toaster } from "../shared/ui/sonner";
import { Button } from "../shared/ui/button";
import { ThemeProvider } from "./providers/theme-provider";
import { useTranslation } from "react-i18next";
import { AppI18nProvider, useAppI18n } from "./providers/i18n-provider";
import {
  DesignDiagramView,
  DiagramView,
} from "../features/diagrams/components/diagram-detail-page";
import { CodeGenerationPage } from "../features/code/components/code-generation-page";
import { DesignModelPage } from "../features/design/components/design-model-page";
import { InstructionDocumentsPage } from "../features/documents/components/instruction-documents-page";
import { RequirementsModelPage, SystemRequirementsPage } from "../features/requirements/components/text-requirement-page";
import { FeasibilityPage } from "../features/feasibility/components/feasibility-page";
import { TraceabilityMatrixPage } from "../features/traceability/components/traceability-matrix-page";
import { TestModelPage } from "../features/testing/components/test-model-page";
import { MarketingHomePage } from "../features/marketing-site/components/marketing-home-page";
import { applyRouteMetadata } from "../features/marketing-site/model/seo";
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
import {
  AlipayReturnPage,
  AccountBillingPage,
  PricingBillingPage,
} from "../features/user-platform/components/billing-pages";

function StandaloneRoutePage({ route }: { route: Exclude<ShellRoutePath, "/workspace"> }) {
  const { t } = useTranslation();
  const meta = findShellRouteModule(route);
  const routeKey = route === "/exam" ? "exam" : route === "/tutorial" ? "tutorial" : "workspace";

  return (
    <main className="flex min-h-0 flex-1 bg-background px-8 py-8">
      <section className="flex w-full items-center justify-center rounded-2xl border border-border bg-card text-center">
        <div className="flex max-w-xl flex-col items-center gap-3 px-6">
          <h1 className="text-3xl font-semibold">{t(`nav.${routeKey}`)}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`workspace.routeDescriptions.${routeKey}`, {
              defaultValue: meta.description,
            })}
          </p>
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
    route.kind === "account-billing" ||
    route.kind === "alipay-return"
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
  const { t } = useTranslation();
  const { selection } = useWorkspaceShell();
  const { generationTasks } = useWorkspaceSession();
  const projectOverview = useCurrentProjectOverview();
  const projectRuns = projectOverview?.projectId === projectId ? projectOverview.overview.runs : [];
  const compactViewport = useCompactViewport();
  const activeGenerationTaskCount = generationTasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  ).length;
  const activeDrawer = routeDrawer ?? activeProjectDrawer;
  const traceabilityPrefix = t("traceability.title.scoped", { label: "" });
  const traceabilityScopeLabel = (label: string) =>
    label.startsWith(traceabilityPrefix) ? label.slice(traceabilityPrefix.length) : label;
  const closeDrawer = () => {
    onActiveProjectDrawerChange(null);
    if (routeDrawer) {
      onNavigate(`/projects/${encodeURIComponent(projectId)}`);
    }
  };

  let body: ReactNode;
  switch (selection.kind) {
    case "system-requirements":
      body = <SystemRequirementsPage />;
      break;
    case "requirements-text":
      body = <RequirementsModelPage />;
      break;
    case "feasibility-home":
      body = <FeasibilityPage view="overview" />;
      break;
    case "feasibility-context":
      body = <FeasibilityPage view="context" />;
      break;
    case "feasibility-context-element":
      body = (
        <FeasibilityPage
          view="context"
          highlightedElement={{
            kind: selection.elementKind,
            id: selection.elementId,
          }}
        />
      );
      break;
    case "feasibility-context-trace":
      body = <FeasibilityPage view="trace" />;
      break;
    case "feasibility-context-elements":
      body = <FeasibilityPage view="elements" />;
      break;
    case "feasibility-context-relations":
      body = <FeasibilityPage view="relations" />;
      break;
    case "feasibility-implementation":
      body = <FeasibilityPage view="implementation" />;
      break;
    case "requirement-trace-matrix":
      body = (
        <TraceabilityMatrixPage
          mode="requirements"
          scope={{
            diagramKind: selection.diagram,
            modelId: selection.modelId,
            label: traceabilityScopeLabel(selection.label),
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
            label: traceabilityScopeLabel(selection.label),
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

export function Shell({ initialPath }: { initialPath?: string }) {
  const { t } = useTranslation();
  const { locale } = useAppI18n();
  const [activeProjectDrawer, setActiveProjectDrawer] = useState<ProjectDrawerKind | null>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => {
    const pathname = initialPath ?? (typeof window === "undefined" ? "/" : window.location.pathname);
    return matchAppRoute(pathname);
  });

  useEffect(() => {
    // Keep head metadata aligned with client-side History API navigation.
    applyRouteMetadata(route, undefined, locale);
  }, [locale, route]);

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
        return <PricingBillingPage signedIn={false} onNavigate={navigate} />;
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
    if (route.kind === "alipay-return") {
      return <AlipayReturnPage onNavigate={navigate} />;
    }
    if (route.kind === "account-billing") {
      return <AccountBillingPage onNavigate={navigate} />;
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
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-background px-6 text-center">
        <section className="max-w-xl">
          <p className="font-display text-7xl font-black text-primary">404</p>
          <h1 className="mt-4 font-display text-3xl font-semibold text-foreground">
            {t("seo.notFoundHeading")}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {t("common.notFoundDescription")}
          </p>
          <Button
            type="button"
            className="mt-6 rounded-full px-6 py-3"
            onClick={() => navigate("/")}
          >
            {t("common.backToHome")}
          </Button>
        </section>
      </main>
    );
  };

  const protectedRoutePath = getProtectedRoutePath(route);
  const routeContent = renderRoute();
  const showWorkspaceTopBar =
    route.kind !== "marketing-home" &&
    route.kind !== "auth" &&
    route.kind !== "invitation-accept" &&
    route.kind !== "legacy-redirect" &&
    route.kind !== "not-found";
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
      <RedirectMessage />
    </main>
  );
}

function RedirectMessage() {
  const { t } = useTranslation();
  return <>{t("common.loading")}</>;
}

export default function App({ initialPath }: { initialPath?: string }) {
  return (
    <AppI18nProvider>
      <ThemeProvider>
        <WorkspaceRepositoryProvider>
          <WorkspaceSessionProvider>
            <Shell initialPath={initialPath} />
          </WorkspaceSessionProvider>
        </WorkspaceRepositoryProvider>
      </ThemeProvider>
    </AppI18nProvider>
  );
}
