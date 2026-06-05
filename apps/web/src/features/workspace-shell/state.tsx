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
  | { kind: "requirement-trace-matrix"; diagram: DiagramType; modelId?: string; label: string }
  | { kind: "diagram"; diagram: DiagramType; modelId?: string; label: string }
  | { kind: "design-home"; label: string }
  | {
      kind: "design-trace-matrix";
      diagram: DesignDiagramType;
      modelId?: string;
      label: string;
    }
  | { kind: "test-home"; label: string }
  | {
      kind: "design-diagram";
      diagram: DesignDiagramType;
      label: string;
      modelId?: string;
    }
  | { kind: "documents-home"; label: string }
  | { kind: "document-editor"; documentId: string; label: string }
  | {
      kind: "design-diagram-element";
      diagram: DesignDiagramType;
      modelId?: string;
      elementKind: string;
      elementId: string;
      label: string;
    }
  | {
      kind: "diagram-element";
      diagram: DiagramType;
      modelId?: string;
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
  closeOtherWorkspaceTabs: (tabId: string) => void;
  closeWorkspaceTabsByStage: (tabId: string) => void;
  openRequirementsText: () => void;
  openRequirementTraceMatrix: (
    diagram: DiagramType,
    modelId?: string,
    label?: string,
  ) => void;
  openHistoryDrawer: () => void;
  closeHistoryDrawer: () => void;
  openDiagram: (diagram: DiagramType, modelId?: string, label?: string) => void;
  openDesignHome: () => void;
  openDesignTraceMatrix: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void;
  openTestHome: () => void;
  openDesignDiagram: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void;
  openDocumentsHome: () => void;
  openDocumentEditor: (documentId: string, label: string) => void;
  openDesignDiagramElement: (
    diagram: DesignDiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
  ) => void;
  openDiagramElement: (
    diagram: DiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
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
    case "requirement-trace-matrix":
      return `requirements:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "diagram":
    case "diagram-element":
      return `diagram:${selection.modelId ?? selection.diagram}`;
    case "design-home":
      return "design";
    case "design-trace-matrix":
      return `design:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "test-home":
      return "test";
    case "design-diagram":
    case "design-diagram-element":
      return `design-diagram:${selection.modelId ?? selection.diagram}`;
    case "documents-home":
      return "documents";
    case "document-editor":
      return `document:${selection.documentId}`;
    case "workspace-placeholder":
      return `workspace:${selection.workspaceId}`;
  }
}

function tabLabelForSelection(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "requirements-text":
      return "需求";
    case "requirement-trace-matrix":
      return selection.label;
    case "diagram":
    case "diagram-element":
      return selection.label || DIAGRAM_META[selection.diagram].label;
    case "design-home":
      return "设计";
    case "design-trace-matrix":
      return selection.label;
    case "test-home":
      return "测试";
    case "design-diagram":
    case "design-diagram-element":
      return selection.label || DESIGN_DIAGRAM_META[selection.diagram].label;
    case "documents-home":
      return "说明书";
    case "document-editor":
      return selection.label;
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

function stageForSelection(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "requirements-text":
    case "requirement-trace-matrix":
    case "diagram":
    case "diagram-element":
      return "requirements";
    case "design-home":
    case "design-trace-matrix":
    case "design-diagram":
    case "design-diagram-element":
      return "design";
    case "test-home":
      return "test";
    case "documents-home":
    case "document-editor":
      return "documents";
    case "workspace-placeholder":
      return selection.workspaceId;
  }
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

  const closeOtherWorkspaceTabs = useCallback(
    (tabId: string) => {
      setOpenTabs((current) => {
        const target = current.find((tab) => tab.id === tabId) ?? defaultTab;
        setActiveTabId(target.id);
        return [target];
      });
    },
    [defaultTab],
  );

  const closeWorkspaceTabsByStage = useCallback(
    (tabId: string) => {
      setOpenTabs((current) => {
        const target = current.find((tab) => tab.id === tabId);
        if (!target) return current;
        const targetStage = stageForSelection(target.selection);
        const next = current.filter((tab) => {
          if (tab.id === target.id) return true;
          return stageForSelection(tab.selection) !== targetStage;
        });
        if (!next.some((tab) => tab.id === activeTabId)) {
          setActiveTabId(target.id);
        }
        return next.length > 0 ? next : [defaultTab];
      });
    },
    [activeTabId, defaultTab],
  );

  const openRequirementsText = useCallback(() => {
    openWorkspaceTab({ kind: "requirements-text", label: "需求" });
  }, [openWorkspaceTab]);

  const openRequirementTraceMatrix = useCallback((
    diagram: DiagramType,
    modelId?: string,
    label?: string,
  ) => {
    openWorkspaceTab({
      kind: "requirement-trace-matrix",
      diagram,
      modelId,
      label: label ? `跟踪矩阵 · ${label}` : `跟踪矩阵 · ${DIAGRAM_META[diagram].label}`,
    });
  }, [openWorkspaceTab]);

  const openHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(true);
  }, []);

  const closeHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(false);
  }, []);

  const openDiagram = useCallback((diagram: DiagramType, modelId?: string, label?: string) => {
    openWorkspaceTab({
      kind: "diagram",
      diagram,
      modelId,
      label: label ?? DIAGRAM_META[diagram].label,
    });
  }, [openWorkspaceTab]);

  const openDesignHome = useCallback(() => {
    openWorkspaceTab({ kind: "design-home", label: "设计" });
  }, [openWorkspaceTab]);

  const openDesignTraceMatrix = useCallback((
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => {
    openWorkspaceTab({
      kind: "design-trace-matrix",
      diagram,
      modelId,
      label: label ? `跟踪矩阵 · ${label}` : `跟踪矩阵 · ${DESIGN_DIAGRAM_META[diagram].label}`,
    });
  }, [openWorkspaceTab]);

  const openTestHome = useCallback(() => {
    openWorkspaceTab({ kind: "test-home", label: "测试" });
  }, [openWorkspaceTab]);

  const openDesignDiagram = useCallback((
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => {
    openWorkspaceTab({
      kind: "design-diagram",
      diagram,
      modelId,
      label: label ?? DESIGN_DIAGRAM_META[diagram].label,
    });
  }, [openWorkspaceTab]);

  const openDocumentsHome = useCallback(() => {
    openWorkspaceTab({ kind: "documents-home", label: "说明书" });
  }, [openWorkspaceTab]);

  const openDocumentEditor = useCallback(
    (documentId: string, label: string) => {
      openWorkspaceTab({ kind: "document-editor", documentId, label });
    },
    [openWorkspaceTab],
  );

  const openDesignDiagramElement = useCallback(
    (
      diagram: DesignDiagramType,
      elementKind: string,
      elementId: string,
      label: string,
      modelId?: string,
    ) => {
      openWorkspaceTab({
        kind: "design-diagram-element",
        diagram,
        modelId,
        elementKind,
        elementId,
        label,
      });
    },
    [openWorkspaceTab],
  );

  const openDiagramElement = useCallback(
    (
      diagram: DiagramType,
      elementKind: string,
      elementId: string,
      label: string,
      modelId?: string,
    ) => {
      openWorkspaceTab({
        kind: "diagram-element",
        diagram,
        modelId,
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
      closeOtherWorkspaceTabs,
      closeWorkspaceTabsByStage,
      openRequirementsText,
      openRequirementTraceMatrix,
      openHistoryDrawer,
      closeHistoryDrawer,
      openDiagram,
      openDesignHome,
      openDesignTraceMatrix,
      openTestHome,
      openDesignDiagram,
      openDocumentsHome,
      openDocumentEditor,
      openDesignDiagramElement,
      openDiagramElement,
      openWorkspacePlaceholder,
    }),
    [
      activeTabId,
      openTabs,
      openRequirementsText,
      openRequirementTraceMatrix,
      openHistoryDrawer,
      closeHistoryDrawer,
      openWorkspaceTab,
      activateWorkspaceTab,
      closeWorkspaceTab,
      closeOtherWorkspaceTabs,
      closeWorkspaceTabsByStage,
      openDiagram,
      openDesignHome,
      openDesignTraceMatrix,
      openTestHome,
      openDesignDiagram,
      openDocumentsHome,
      openDocumentEditor,
      openDesignDiagramElement,
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
    case "requirement-trace-matrix":
      return `requirements:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "diagram":
      return `diagram:${selection.modelId ?? selection.diagram}`;
    case "design-home":
      return "design";
    case "design-trace-matrix":
      return `design:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "test-home":
      return "test";
    case "design-diagram":
      return `design-diagram:${selection.modelId ?? selection.diagram}`;
    case "documents-home":
      return "documents";
    case "document-editor":
      return `document:${selection.documentId}`;
    case "design-diagram-element":
      return `design-diagram-element:${selection.modelId ?? selection.diagram}:${selection.elementKind}:${selection.elementId}`;
    case "diagram-element":
      return `diagram-element:${selection.modelId ?? selection.diagram}:${selection.elementKind}:${selection.elementId}`;
    case "workspace-placeholder":
      return `workspace:${selection.workspaceId}`;
  }
}
