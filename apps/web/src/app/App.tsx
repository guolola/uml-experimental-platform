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
import { DesignModelPage } from "../features/design/components/design-model-page";
import { HistoryDrawer } from "../features/history/components/history-drawer";
import { TextRequirementView } from "../features/requirements/components/text-requirement-page";
import { SidebarMenu } from "../features/workspace-shell/components/sidebar-menu";
import {
  TopBar,
  type ShellRoutePath,
} from "../features/workspace-shell/components/top-bar";
import { WorkspaceTabsBar } from "../features/workspace-shell/components/workspace-tabs-bar";
import { Workspace } from "../features/workspace-shell/components/workspace-placeholder";
import { WorkspaceRepositoryProvider } from "../services/workspace-repository";
import { WorkspaceShellProvider, useWorkspaceShell } from "../features/workspace-shell/state";
import { WorkspaceSessionProvider } from "../features/workspace-session/state";

function normalizeRoute(pathname: string): ShellRoutePath {
  if (pathname === "/exam" || pathname === "/tutorial" || pathname === "/about") {
    return pathname;
  }
  return "/";
}

function StandaloneRoutePage({ route }: { route: Exclude<ShellRoutePath, "/"> }) {
  const meta = {
    "/exam": {
      title: "考试",
      description: "考试模块正在建设中，后续会承载课程测评、题目生成和评分流程。",
    },
    "/tutorial": {
      title: "教程",
      description: "教程模块正在建设中，后续会沉淀平台使用指南和 UML 建模方法。",
    },
    "/about": {
      title: "关于",
      description: "关于页面正在建设中，后续会展示平台定位、版本信息和项目说明。",
    },
  }[route];

  return (
    <main className="flex min-h-0 flex-1 bg-background px-8 py-8">
      <section className="flex w-full items-center justify-center rounded-2xl border border-border bg-card text-center">
        <div className="flex max-w-xl flex-col items-center gap-3 px-6">
          <h1 className="text-3xl font-semibold">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>
      </section>
    </main>
  );
}

export function Shell() {
  const { selection, historyDrawerOpen, closeHistoryDrawer } = useWorkspaceShell();
  const [route, setRoute] = useState<ShellRoutePath>(() =>
    typeof window === "undefined" ? "/" : normalizeRoute(window.location.pathname),
  );

  useEffect(() => {
    const handlePopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigate = useCallback((nextRoute: ShellRoutePath) => {
    if (normalizeRoute(window.location.pathname) !== nextRoute) {
      window.history.pushState({}, "", nextRoute);
    }
    setRoute(nextRoute);
  }, []);

  let body: ReactNode;
  switch (selection.kind) {
    case "requirements-text":
      body = <TextRequirementView />;
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
    case "design-diagram":
      body = <DesignDiagramView type={selection.diagram} />;
      break;
    case "workspace-placeholder":
      body = <Workspace title={selection.label} />;
      break;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      <TopBar currentRoute={route} onNavigate={navigate} />
      {route === "/" ? (
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel
            data-testid="workspace-sidebar-panel"
            data-default-size="12"
            data-min-size="10"
            data-max-size="22"
            defaultSize={12}
            minSize={10}
            maxSize={22}
          >
            <aside className="h-full border-r border-sidebar-border bg-sidebar">
              <SidebarMenu />
            </aside>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border/70" />
          <ResizablePanel defaultSize={88}>
            <main className="flex h-full flex-col bg-background">
              <WorkspaceTabsBar />
              <div className="min-h-0 flex-1">{body}</div>
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <StandaloneRoutePage route={route} />
      )}
      <HistoryDrawer open={historyDrawerOpen} onClose={closeHistoryDrawer} />
      <Toaster position="bottom-right" />
    </div>
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
