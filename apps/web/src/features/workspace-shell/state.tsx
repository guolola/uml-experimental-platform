import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  type DesignDiagramType,
  type DiagramType,
} from "../../entities/diagram/model";

const DEFAULT_SELECTION: WorkspaceSelection = {
  kind: "requirements-text",
  label: "需求",
};

export type WorkspaceSelection =
  | { kind: "requirements-text"; label: string }
  | { kind: "diagram"; diagram: DiagramType; label: string }
  | { kind: "design-home"; label: string }
  | { kind: "design-diagram"; diagram: DesignDiagramType; label: string }
  | {
      kind: "diagram-element";
      diagram: DiagramType;
      elementKind: string;
      elementId: string;
      label: string;
    }
  | { kind: "workspace-placeholder"; workspaceId: WorkspacePlaceholderId; label: string };

export type WorkspacePlaceholderId =
  | "code";

export interface WorkspaceTab {
  id: string;
  label: string;
  selection: WorkspaceSelection;
}

interface WorkspaceShellState {
  selection: WorkspaceSelection;
  openTabs: WorkspaceTab[];
  activeTabId: string;
  historyDrawerOpen: boolean;
  openWorkspaceTab: (selection: WorkspaceSelection) => void;
  activateWorkspaceTab: (tabId: string) => void;
  closeWorkspaceTab: (tabId: string) => void;
  openRequirementsText: () => void;
  openHistoryDrawer: () => void;
  closeHistoryDrawer: () => void;
  openDiagram: (diagram: DiagramType) => void;
  openDesignHome: () => void;
  openDesignDiagram: (diagram: DesignDiagramType) => void;
  openDiagramElement: (
    diagram: DiagramType,
    elementKind: string,
    elementId: string,
    label: string,
  ) => void;
  openWorkspacePlaceholder: (
    workspaceId: WorkspacePlaceholderId,
    label: string,
  ) => void;
}

const WorkspaceShellContext = createContext<WorkspaceShellState | null>(null);

function tabIdForSelection(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "requirements-text":
      return "requirements";
    case "diagram":
    case "diagram-element":
      return `diagram:${selection.diagram}`;
    case "design-home":
      return "design";
    case "design-diagram":
      return `design-diagram:${selection.diagram}`;
    case "workspace-placeholder":
      return `workspace:${selection.workspaceId}`;
  }
}

function tabLabelForSelection(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "requirements-text":
      return "需求";
    case "diagram":
    case "diagram-element":
      return DIAGRAM_META[selection.diagram].label;
    case "design-home":
      return "设计";
    case "design-diagram":
      return DESIGN_DIAGRAM_META[selection.diagram].label;
    case "workspace-placeholder":
      return selection.label;
  }
}

function createWorkspaceTab(selection: WorkspaceSelection): WorkspaceTab {
  return {
    id: tabIdForSelection(selection),
    label: tabLabelForSelection(selection),
    selection,
  };
}

export function WorkspaceShellProvider({ children }: { children: ReactNode }) {
  const defaultTab = useMemo(() => createWorkspaceTab(DEFAULT_SELECTION), []);
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([defaultTab]);
  const [activeTabId, setActiveTabId] = useState(defaultTab.id);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const selection =
    openTabs.find((tab) => tab.id === activeTabId)?.selection ?? DEFAULT_SELECTION;

  const openWorkspaceTab = useCallback((nextSelection: WorkspaceSelection) => {
    const tab = createWorkspaceTab(nextSelection);
    setOpenTabs((current) => {
      const existing = current.find((item) => item.id === tab.id);
      if (existing) {
        return current.map((item) => (item.id === tab.id ? tab : item));
      }
      return [...current, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const activateWorkspaceTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const closeWorkspaceTab = useCallback(
    (tabId: string) => {
      setOpenTabs((current) => {
        const closingIndex = current.findIndex((tab) => tab.id === tabId);
        if (closingIndex < 0) return current;
        if (current.length === 1) {
          setActiveTabId(defaultTab.id);
          return [defaultTab];
        }

        const next = current.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          const nextActive = next[Math.min(closingIndex, next.length - 1)];
          setActiveTabId(nextActive?.id ?? defaultTab.id);
        }
        return next;
      });
    },
    [activeTabId, defaultTab],
  );

  const openRequirementsText = useCallback(() => {
    openWorkspaceTab({ kind: "requirements-text", label: "需求" });
  }, [openWorkspaceTab]);

  const openHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(true);
  }, []);

  const closeHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(false);
  }, []);

  const openDiagram = useCallback((diagram: DiagramType) => {
    openWorkspaceTab({
      kind: "diagram",
      diagram,
      label: DIAGRAM_META[diagram].label,
    });
  }, [openWorkspaceTab]);

  const openDesignHome = useCallback(() => {
    openWorkspaceTab({ kind: "design-home", label: "设计" });
  }, [openWorkspaceTab]);

  const openDesignDiagram = useCallback((diagram: DesignDiagramType) => {
    openWorkspaceTab({
      kind: "design-diagram",
      diagram,
      label: DESIGN_DIAGRAM_META[diagram].label,
    });
  }, [openWorkspaceTab]);

  const openDiagramElement = useCallback(
    (
      diagram: DiagramType,
      elementKind: string,
      elementId: string,
      label: string,
    ) => {
      openWorkspaceTab({
        kind: "diagram-element",
        diagram,
        elementKind,
        elementId,
        label,
      });
    },
    [openWorkspaceTab],
  );

  const openWorkspacePlaceholder = useCallback(
    (workspaceId: WorkspacePlaceholderId, label: string) => {
      openWorkspaceTab({
        kind: "workspace-placeholder",
        workspaceId,
        label,
      });
    },
    [openWorkspaceTab],
  );

  const value = useMemo(
    () => ({
      selection,
      openTabs,
      activeTabId,
      historyDrawerOpen,
      openWorkspaceTab,
      activateWorkspaceTab,
      closeWorkspaceTab,
      openRequirementsText,
      openHistoryDrawer,
      closeHistoryDrawer,
      openDiagram,
      openDesignHome,
      openDesignDiagram,
      openDiagramElement,
      openWorkspacePlaceholder,
    }),
    [
      activeTabId,
      openTabs,
      openRequirementsText,
      openHistoryDrawer,
      closeHistoryDrawer,
      openWorkspaceTab,
      activateWorkspaceTab,
      closeWorkspaceTab,
      openDiagram,
      openDesignHome,
      openDesignDiagram,
      openDiagramElement,
      openWorkspacePlaceholder,
      historyDrawerOpen,
      selection,
    ],
  );

  return (
    <WorkspaceShellContext.Provider value={value}>
      {children}
    </WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShell() {
  const value = useContext(WorkspaceShellContext);
  if (!value) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShellProvider");
  }
  return value;
}

export function getSelectionKey(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "requirements-text":
      return "requirements";
    case "diagram":
      return `diagram:${selection.diagram}`;
    case "design-home":
      return "design";
    case "design-diagram":
      return `design-diagram:${selection.diagram}`;
    case "diagram-element":
      return `diagram-element:${selection.diagram}:${selection.elementKind}:${selection.elementId}`;
    case "workspace-placeholder":
      return `workspace:${selection.workspaceId}`;
  }
}
