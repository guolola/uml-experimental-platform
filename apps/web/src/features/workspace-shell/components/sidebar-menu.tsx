import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ChevronRight,
  FileText,
  Layers,
  Code2,
  Palette,
  Network,
  User,
  Box,
  Package,
  Cloud,
  Database,
  Server,
  Component as ComponentIcon,
  Diamond,
  CircleDot,
  Activity as ActivityIcon,
  Type as TypeIcon,
  Plug,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import { cn } from "../../../shared/ui/utils";
import {
  DESIGN_DIAGRAM_ORDER,
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  getSelectionKey,
  useWorkspaceShell,
} from "../state";

type Node = {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: Node[];
  selectable?: boolean;
  badge?: string | number;
  onSelect?: () => void;
};

const KIND_ICON: Record<SemanticElementKind, ReactNode> = {
  actor: <User className="size-3.5 text-muted-foreground" />,
  usecase: <CircleDot className="size-3.5 text-muted-foreground" />,
  component: <ComponentIcon className="size-3.5 text-muted-foreground" />,
  interface: <Plug className="size-3.5 text-muted-foreground" />,
  "external-system": <Cloud className="size-3.5 text-muted-foreground" />,
  "deployment-node": <Server className="size-3.5 text-muted-foreground" />,
  database: <Database className="size-3.5 text-muted-foreground" />,
  class: <Box className="size-3.5 text-muted-foreground" />,
  enum: <TypeIcon className="size-3.5 text-muted-foreground" />,
  activity: <ActivityIcon className="size-3.5 text-muted-foreground" />,
  decision: <Diamond className="size-3.5 text-muted-foreground" />,
  "system-boundary": <Package className="size-3.5 text-muted-foreground" />,
  "start-node": <CircleDot className="size-3.5 text-muted-foreground" />,
  "end-node": <CircleDot className="size-3.5 text-muted-foreground" />,
  "merge-node": <Diamond className="size-3.5 text-muted-foreground" />,
  "fork-node": <Diamond className="size-3.5 text-muted-foreground" />,
  "join-node": <Diamond className="size-3.5 text-muted-foreground" />,
  swimlane: <Layers className="size-3.5 text-muted-foreground" />,
  artifact: <Package className="size-3.5 text-muted-foreground" />,
  participant: <User className="size-3.5 text-muted-foreground" />,
  message: <MessageSquare className="size-3.5 text-muted-foreground" />,
  fragment: <GitBranch className="size-3.5 text-muted-foreground" />,
  table: <Database className="size-3.5 text-muted-foreground" />,
  "table-column": <TypeIcon className="size-3.5 text-muted-foreground" />,
};

function TreeItem({
  node,
  depth,
  selectedKey,
  openKeys,
  setOpenKeys,
}: {
  node: Node;
  depth: number;
  selectedKey: string;
  openKeys: Set<string>;
  setOpenKeys: Dispatch<SetStateAction<Set<string>>>;
}) {
  const hasChildren = !!node.children?.length;
  const open = openKeys.has(node.key);
  const selected = selectedKey === node.key;
  const selectable = node.selectable ?? true;
  const toggleOpen = () =>
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(node.key)) {
        next.delete(node.key);
      } else {
        next.add(node.key);
      }
      return next;
    });
  const handleSelect = () => {
    if (selectable) {
      node.onSelect?.();
      return;
    }
    if (hasChildren) {
      toggleOpen();
    }
  };

  return (
    <div>
      <div
        className={cn(
          "mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl py-1.5 pr-2 text-left text-sm font-medium text-sidebar-foreground/82 transition-colors hover:bg-muted hover:text-sidebar-foreground [&_svg]:transition-colors",
          depth === 0 && "min-h-11 text-[15px] font-semibold",
          depth > 0 && "min-h-10",
          selected &&
            "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm [&_svg]:text-sidebar-accent-foreground",
        )}
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${open ? "折叠" : "展开"} ${node.label}`}
            onClick={toggleOpen}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        {node.icon}
        <button
          type="button"
          onClick={handleSelect}
          className="min-w-0 flex-1 truncate text-left"
        >
          {node.label}
        </button>
        {node.badge !== undefined && (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {node.badge}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.key}
              node={child}
              depth={depth + 1}
              selectedKey={selectedKey}
              openKeys={openKeys}
              setOpenKeys={setOpenKeys}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildDiagramNode(
  diagram: DiagramType,
  model: ReturnType<typeof useWorkspaceSession>["models"][DiagramType],
  stale: boolean,
  failed: boolean,
  openDiagram: (diagram: DiagramType) => void,
  openDiagramElement: (
    diagram: DiagramType,
    elementKind: string,
    elementId: string,
    label: string,
  ) => void,
): Node {
  const detail = buildDiagramDetailModel(model);
  const children: Node[] = detail.groups.map((group) => ({
    key: `diagram-group:${diagram}:${group.kind}`,
    label: SEMANTIC_KIND_META[group.kind].label,
    selectable: false,
    badge: group.items.length,
    children: group.items.map((element) => ({
      key: `diagram-element:${diagram}:${element.kind}:${element.id}`,
      label: element.label,
      icon: KIND_ICON[element.kind],
      onSelect: () =>
        openDiagramElement(diagram, element.kind, element.id, element.label),
    })),
  }));

  return {
    key: `diagram:${diagram}`,
    label: DIAGRAM_META[diagram].label,
    icon: (
      <span className="relative inline-flex">
        <Network className="size-4 text-muted-foreground" />
        {stale && (
          <span
            title="基于过时的需求规则"
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
          />
        )}
        {failed && (
          <span
            title="此图生成失败"
            className="absolute -left-0.5 -top-0.5 size-1.5 rounded-full bg-destructive"
          />
        )}
      </span>
    ),
    children,
    badge: failed ? "失败" : detail.items.length || undefined,
    onSelect: () => openDiagram(diagram),
  };
}

function buildDesignDiagramNode(
  diagram: DesignDiagramType,
  model: ReturnType<typeof useWorkspaceSession>["designModels"][DesignDiagramType],
  failed: boolean,
  openDesignDiagram: (diagram: DesignDiagramType) => void,
  openDesignDiagramElement: (
    diagram: DesignDiagramType,
    elementKind: string,
    elementId: string,
    label: string,
  ) => void,
): Node {
  const detail = buildDiagramDetailModel(model);
  const children: Node[] = detail.groups.map((group) => ({
    key: `design-diagram-group:${diagram}:${group.kind}`,
    label: SEMANTIC_KIND_META[group.kind].label,
    selectable: false,
    badge: group.items.length,
    children: group.items.map((element) => ({
      key: `design-diagram-element:${diagram}:${element.kind}:${element.id}`,
      label: element.label,
      icon: KIND_ICON[element.kind],
      onSelect: () =>
        openDesignDiagramElement(diagram, element.kind, element.id, element.label),
    })),
  }));

  return {
    key: `design-diagram:${diagram}`,
    label: DESIGN_DIAGRAM_META[diagram].label,
    icon: (
      <span className="relative inline-flex">
        <Network className="size-4 text-muted-foreground" />
        {failed && (
          <span
            title="此设计图生成失败"
            className="absolute -left-0.5 -top-0.5 size-1.5 rounded-full bg-destructive"
          />
        )}
      </span>
    ),
    children,
    badge: failed ? "失败" : detail.items.length || undefined,
    onSelect: () => openDesignDiagram(diagram),
  };
}

export function SidebarMenu() {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const {
    generatedDiagrams,
    models,
    staleDiagrams,
    diagramErrors,
    generatedDesignDiagrams,
    designModels,
    designDiagramErrors,
  } =
    useWorkspaceSession();
  const {
    selection,
    openRequirementsText,
    openDiagram,
    openDesignHome,
    openDesignDiagram,
    openDesignDiagramElement,
    openDiagramElement,
    openWorkspacePlaceholder,
  } = useWorkspaceShell();
  const selectedKey = getSelectionKey(selection);
  const orderedDesignDiagrams = DESIGN_DIAGRAM_ORDER.filter((diagram) =>
    generatedDesignDiagrams.includes(diagram),
  );

  useEffect(() => {
    const handleCompleted = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail;
      if (detail?.kind !== "requirements" && detail?.kind !== "design") {
        return;
      }
      setOpenKeys((current) => {
        const next = new Set(current);
        next.add(detail.kind === "requirements" ? "requirements" : "design");
        return next;
      });
    };

    window.addEventListener("uml-generation-completed", handleCompleted);
    return () => {
      window.removeEventListener("uml-generation-completed", handleCompleted);
    };
  }, []);

  const tree: Node[] = [
    {
      key: "requirements",
      label: "需求",
      icon: <FileText className="size-4 text-muted-foreground" />,
      onSelect: openRequirementsText,
      children: [
        ...generatedDiagrams.map((diagram) =>
          buildDiagramNode(
            diagram,
            models[diagram],
            staleDiagrams.includes(diagram),
            Boolean(diagramErrors[diagram]),
            openDiagram,
            openDiagramElement,
          ),
        ),
      ],
    },
    {
      key: "design",
      label: "设计",
      icon: <Palette className="size-4 text-muted-foreground" />,
      onSelect: openDesignHome,
      children: [
        ...orderedDesignDiagrams.map((diagram) =>
          buildDesignDiagramNode(
            diagram,
            designModels[diagram],
            Boolean(designDiagramErrors[diagram]),
            openDesignDiagram,
            openDesignDiagramElement,
          ),
        ),
      ],
    },
    {
      key: "workspace:code",
      label: "代码",
      icon: <Code2 className="size-4 text-muted-foreground" />,
      onSelect: () => openWorkspacePlaceholder("code", "代码"),
    },
  ];

  return (
    <nav className="flex h-full flex-col overflow-hidden py-4 text-sidebar-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-button]:size-0 [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="mb-2 flex items-center gap-2 px-5 py-2">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            项目导航
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {tree.map((node) => (
            <TreeItem
              key={node.key}
              node={node}
              depth={0}
              selectedKey={selectedKey}
              openKeys={openKeys}
              setOpenKeys={setOpenKeys}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
