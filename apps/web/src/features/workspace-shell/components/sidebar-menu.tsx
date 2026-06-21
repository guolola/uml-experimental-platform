// Renders the workspace sidebar navigation and diagram status tree used by desktop and wide viewport layouts.
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
  Clock3,
  Loader2,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../shared/ui/utils";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  getDesignModelId,
  getRequirementModelId,
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
import {
  deriveSidebarDiagramState,
  diagramUnavailableReason,
  generationStatusTooltip,
  mergeSidebarStatus,
  type SidebarNodeStatus,
} from "../lib/sidebar-menu-model";

type Node = {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: Node[];
  selectable?: boolean;
  badge?: string | number;
  badgeTooltip?: string;
  badges?: string[];
  status?: SidebarNodeStatus;
  statusTooltip?: string;
  unavailableReason?: string;
  onSelect?: () => void;
};

type SidebarMenuProps = {
  onNavigateItemSelect?: () => void;
  projectRuns?: PlatformRunSummary[];
};

const KIND_ICON: Record<SemanticElementKind, ReactNode> = {
  actor: <User className="size-3.5 text-muted-foreground" />,
  usecase: <CircleDot className="size-3.5 text-muted-foreground" />,
  function: <GitBranch className="size-3.5 text-muted-foreground" />,
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
  package: <Package className="size-3.5 text-muted-foreground" />,
  table: <Database className="size-3.5 text-muted-foreground" />,
  "table-column": <TypeIcon className="size-3.5 text-muted-foreground" />,
  screen: <Palette className="size-3.5 text-muted-foreground" />,
  module: <Layers className="size-3.5 text-muted-foreground" />,
  "entry-point": <Plug className="size-3.5 text-muted-foreground" />,
};

function TraceBadge({
  label,
  tooltip,
}: {
  label: string | number;
  tooltip?: string;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = `sidebar-trace-${String(label).replace(/\W+/g, "-")}`;

  return (
    <span
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={tooltip ? 0 : undefined}
        aria-describedby={tooltip && open ? tooltipId : undefined}
        className="block max-w-24 truncate rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground outline-none ring-ring focus-visible:ring-2"
        title={tooltip ? undefined : String(label)}
      >
        {label}
      </span>
      {tooltip && open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute right-0 top-full z-30 mt-1 w-max max-w-64 rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg"
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}

function GenerationStatusIndicator({
  status,
  tooltip,
}: {
  status: NonNullable<Node["status"]>;
  tooltip?: string;
}) {
  const label =
    tooltip ??
    (status === "queued"
      ? "排队中"
      : status === "running"
      ? "生成中"
      : status === "failed"
        ? "生成失败"
        : "已生成");
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex size-5 shrink-0 items-center justify-center"
    >
      {status === "queued" ? (
        <Clock3 className="size-3.5 text-muted-foreground" />
      ) : status === "running" ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : status === "failed" ? (
        <XCircle className="size-3.5 text-destructive" />
      ) : (
        <CheckCircle2 className="size-3.5 text-primary" />
      )}
    </span>
  );
}

function rootGenerationStatusTooltip(
  label: string,
  status: Node["status"],
) {
  if (status === "queued") return `${label}生成排队中`;
  if (status === "running") return `${label}生成中`;
  return undefined;
}

function TreeItem({
  node,
  depth,
  selectedKey,
  openKeys,
  setOpenKeys,
  onNavigateItemSelect,
}: {
  node: Node;
  depth: number;
  selectedKey: string;
  openKeys: Set<string>;
  setOpenKeys: Dispatch<SetStateAction<Set<string>>>;
  onNavigateItemSelect?: () => void;
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
      if (node.onSelect) {
        node.onSelect();
        onNavigateItemSelect?.();
      }
      return;
    }
    if (node.unavailableReason) {
      toast.message(node.unavailableReason);
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
          "mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-xl py-1.5 pr-2 text-left text-sm font-medium text-sidebar-foreground/82 transition-colors hover:bg-muted hover:text-sidebar-foreground [&_svg]:transition-colors",
          depth === 0 && "min-h-11",
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
          <TraceBadge label={node.badge} tooltip={node.badgeTooltip} />
        )}
        {node.badges?.map((badge) => (
          <TraceBadge key={badge} label={badge} />
        ))}
        {node.status && (
          <GenerationStatusIndicator
            status={node.status}
            tooltip={node.statusTooltip}
          />
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
              onNavigateItemSelect={onNavigateItemSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildDiagramNode(
  diagram: DiagramType,
  model: ReturnType<typeof useWorkspaceSession>["models"][string] | undefined,
  stale: boolean,
  failed: boolean,
  status: Node["status"],
  statusTooltip: string | undefined,
  viewable: boolean,
  hasStructuredModel: boolean,
  openDiagram: (diagram: DiagramType, modelId?: string, label?: string) => void,
  openRequirementTraceMatrix: (
    diagram: DiagramType,
    modelId?: string,
    label?: string,
  ) => void,
  openDiagramElement: (
    diagram: DiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
  ) => void,
): Node {
  const modelId = model ? getRequirementModelId(model) : diagram;
  const canOpen = viewable && status !== "failed";
  const label =
    diagram === "analysis" && model
      ? ("sourceUseCaseName" in model ? model.sourceUseCaseName : undefined) ?? model.title
      : DIAGRAM_META[diagram].label;
  const detail = buildDiagramDetailModel(model);
  const children: Node[] = [
    ...(model
      ? [
          {
            key: `requirements:trace-matrix:${modelId}`,
            label: "跟踪矩阵",
            icon: <Network className="size-3.5 text-muted-foreground" />,
            onSelect: () => openRequirementTraceMatrix(diagram, modelId, label),
          },
        ]
      : []),
    ...buildDiagramElementGroupNodes(
      detail,
      modelId,
      "diagram-group",
      "diagram-element",
      (element) =>
        openDiagramElement(diagram, element.kind, element.id, element.label, modelId),
      { showGroupBadges: true },
    ),
  ];

  return {
    key: `diagram:${modelId}`,
    label,
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
    badge: detail.items.length || undefined,
    selectable: canOpen,
    status,
    statusTooltip,
    unavailableReason: canOpen
      ? undefined
      : diagramUnavailableReason(status, hasStructuredModel),
    onSelect: canOpen ? () => openDiagram(diagram, modelId, label) : undefined,
  };
}

function buildPendingRequirementDiagramNode(
  diagram: DiagramType,
  modelId: string,
  label: string,
  status: Node["status"],
  statusTooltip: string | undefined,
): Node {
  return {
    key: `diagram:${modelId}`,
    label,
    icon: <Network className="size-4 text-muted-foreground" />,
    selectable: false,
    status,
    statusTooltip,
    unavailableReason: diagramUnavailableReason(status, false),
  };
}

function buildDiagramElementGroupNodes(
  detail: ReturnType<typeof buildDiagramDetailModel>,
  modelId: string,
  groupKeyPrefix: string,
  elementKeyPrefix: string,
  onSelectElement: (element: ReturnType<typeof buildDiagramDetailModel>["items"][number]) => void,
  options: { showGroupBadges: boolean },
): Node[] {
  const tableColumnsByTableId = new Map<
    string,
    ReturnType<typeof buildDiagramDetailModel>["items"]
  >();
  for (const column of detail.groups.find((group) => group.kind === "table-column")?.items ?? []) {
    const tableId = column.id.split(".").slice(0, -1).join(".");
    if (!tableId) continue;
    tableColumnsByTableId.set(tableId, [
      ...(tableColumnsByTableId.get(tableId) ?? []),
      column,
    ]);
  }
  const hasTableHierarchy = tableColumnsByTableId.size > 0;

  return detail.groups
    .filter((group) => !(hasTableHierarchy && group.kind === "table-column"))
    .map((group) => ({
      key: `${groupKeyPrefix}:${modelId}:${group.kind}`,
      label: SEMANTIC_KIND_META[group.kind].label,
      selectable: false,
      badge: options.showGroupBadges ? group.items.length : undefined,
      children: group.items.map((element) => {
        const columnChildren =
          element.kind === "table" ? tableColumnsByTableId.get(element.id) ?? [] : [];
        return {
          key: `${elementKeyPrefix}:${modelId}:${element.kind}:${element.id}`,
          label: element.label,
          icon: KIND_ICON[element.kind],
          children: columnChildren.map((column) => ({
            key: `${elementKeyPrefix}:${modelId}:${column.kind}:${column.id}`,
            label: column.label.includes(".")
              ? column.label.split(".").slice(1).join(".")
              : column.label,
            icon: KIND_ICON[column.kind],
            onSelect: () => onSelectElement(column),
          })),
          onSelect: () => onSelectElement(element),
        };
      }),
    }));
}

function buildDesignDiagramNode(
  diagram: DesignDiagramType,
  model: ReturnType<typeof useWorkspaceSession>["designModels"][string] | undefined,
  failed: boolean,
  stale: boolean,
  staleReason: string | undefined,
  status: Node["status"],
  statusTooltip: string | undefined,
  viewable: boolean,
  hasStructuredModel: boolean,
  openDesignDiagram: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void,
  openDesignTraceMatrix: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void,
  openDesignDiagramElement: (
    diagram: DesignDiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
  ) => void,
): Node {
  const modelId = model ? getDesignModelId(model) : diagram;
  const canOpen = viewable && status !== "failed";
  const label =
    diagram === "sequence" && model
      ? ("sourceUseCaseName" in model ? model.sourceUseCaseName : undefined) ?? model.title
      : DESIGN_DIAGRAM_META[diagram].label;
  const detail = buildDiagramDetailModel(model);
  const children: Node[] = [
    ...(model
      ? [
          {
            key: `design:trace-matrix:${modelId}`,
            label: "跟踪矩阵",
            icon: <Network className="size-3.5 text-muted-foreground" />,
            onSelect: () => openDesignTraceMatrix(diagram, modelId, label),
          },
        ]
      : []),
    ...buildDiagramElementGroupNodes(
      detail,
      modelId,
      "design-diagram-group",
      "design-diagram-element",
      (element) =>
        openDesignDiagramElement(
          diagram,
          element.kind,
          element.id,
          element.label,
          modelId,
        ),
      { showGroupBadges: false },
    ),
  ];

  return {
    key: `design-diagram:${modelId}`,
    label,
    icon: (
      <span className="relative inline-flex">
        <Network className="size-4 text-muted-foreground" />
        {stale && (
          <span
            title={staleReason ?? "此设计模型需更新"}
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
          />
        )}
        {failed && (
          <span
            title="此设计图生成失败"
            className="absolute -left-0.5 -top-0.5 size-1.5 rounded-full bg-destructive"
          />
        )}
      </span>
    ),
    children,
    selectable: canOpen,
    status,
    statusTooltip,
    unavailableReason: canOpen
      ? undefined
      : diagramUnavailableReason(status, hasStructuredModel),
    onSelect: canOpen ? () => openDesignDiagram(diagram, modelId, label) : undefined,
  };
}

function buildPendingDesignDiagramNode(
  diagram: DesignDiagramType,
  modelId: string,
  label: string,
  status: Node["status"],
  statusTooltip: string | undefined,
): Node {
  return {
    key: `design-diagram:${modelId}`,
    label,
    icon: <Network className="size-4 text-muted-foreground" />,
    selectable: false,
    status,
    statusTooltip,
    unavailableReason: diagramUnavailableReason(status, false),
  };
}

export function SidebarMenu({
  onNavigateItemSelect,
  projectRuns = [],
}: SidebarMenuProps = {}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const {
    generatedDiagrams,
    models,
    staleDiagrams,
    staleDesignDiagrams,
    staleDesignModelIds,
    designStaleReasons,
    diagramErrors,
    svgArtifacts,
    generatedDesignDiagrams,
    designModels,
    designSvgArtifacts,
    designDiagramErrors,
    generationTasks,
  } =
    useWorkspaceSession();
  const {
    selection,
    openRequirementsText,
    openRequirementTraceMatrix,
    openDiagram,
    openDesignHome,
    openDesignTraceMatrix,
    openTestHome,
    openDesignDiagram,
    openDesignDiagramElement,
    openDiagramElement,
    openDocumentsHome,
    openWorkspacePlaceholder,
  } = useWorkspaceShell();
  const selectedKey = getSelectionKey(selection);
  const {
    requirementModelViewable,
    designModelViewable,
    requirementModelsByDiagram,
    designModelsByDiagram,
    requirementNodeDiagrams,
    orderedDesignDiagrams,
    requirementStatusFor,
    designStatusFor,
    analysisGenerationActive,
    analysisSubtaskNodes,
    sequenceGenerationActive,
    sequenceSubtaskNodes,
    requirementRootStatus,
    designRootStatus,
    codeRootStatus,
    documentRootStatus,
  } = deriveSidebarDiagramState({
    generatedDiagrams,
    models,
    staleDiagrams,
    staleDesignDiagrams,
    staleDesignModelIds,
    diagramErrors,
    svgArtifacts,
    generatedDesignDiagrams,
    designModels,
    designSvgArtifacts,
    designDiagramErrors,
    generationTasks,
    projectRuns,
  });

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
      status: requirementRootStatus,
      statusTooltip: rootGenerationStatusTooltip("需求链路", requirementRootStatus),
      onSelect: openRequirementsText,
      children: [
        ...requirementNodeDiagrams.map((diagram) => {
          if (
            diagram === "analysis" &&
            (analysisSubtaskNodes.length > 1 ||
              (analysisGenerationActive && analysisSubtaskNodes.length > 0))
          ) {
            const groupStatus = analysisSubtaskNodes.reduce<Node["status"]>(
              (current, model) =>
                mergeSidebarStatus(current, model.status ?? null),
              undefined,
            );
            return {
              key: "diagram-group:analysis",
              label: `${DIAGRAM_META.analysis.label}（${analysisSubtaskNodes.length}）`,
              icon: <MessageSquare className="size-4 text-muted-foreground" />,
              selectable: false,
              status: groupStatus,
              statusTooltip: generationStatusTooltip(
                DIAGRAM_META.analysis.label,
                groupStatus,
                analysisSubtaskNodes.some((node) =>
                  requirementModelViewable("analysis", node.id),
                ),
                analysisSubtaskNodes.some((node) => Boolean(models[node.id])),
              ),
              children: analysisSubtaskNodes.map((node) => {
                const model = models[node.id];
                const status = node.status;
                if (!model) {
                  return buildPendingRequirementDiagramNode(
                    diagram,
                    node.id,
                    node.label,
                    status,
                    generationStatusTooltip(node.label, status, false),
                  );
                }
                const viewable = requirementModelViewable(diagram, node.id);
                const hasStructuredModel = Boolean(model);
                return buildDiagramNode(
                  diagram,
                  model,
                  staleDiagrams.includes(diagram),
                  Boolean(diagramErrors[node.id] ?? diagramErrors[diagram]),
                  status,
                  generationStatusTooltip(
                    model.title,
                    status,
                    viewable,
                    hasStructuredModel,
                  ),
                  viewable,
                  hasStructuredModel,
                  openDiagram,
                  openRequirementTraceMatrix,
                  openDiagramElement,
                );
              }),
            };
          }
          const model = requirementModelsByDiagram[diagram][0] ?? models[diagram];
          const modelId = model ? getRequirementModelId(model) : undefined;
          const status = requirementStatusFor(diagram, modelId);
          const viewable = requirementModelViewable(diagram, modelId);
          const hasStructuredModel = Boolean(model) || generatedDiagrams.includes(diagram);
          return buildDiagramNode(
            diagram,
            model,
            staleDiagrams.includes(diagram),
            Boolean((modelId ? diagramErrors[modelId] : undefined) ?? diagramErrors[diagram]),
            status,
            generationStatusTooltip(
              DIAGRAM_META[diagram].label,
              status,
              viewable,
              hasStructuredModel,
            ),
            viewable,
            hasStructuredModel,
            openDiagram,
            openRequirementTraceMatrix,
            openDiagramElement,
          );
        }),
      ],
    },
    {
      key: "design",
      label: "设计",
      icon: <Palette className="size-4 text-muted-foreground" />,
      status: designRootStatus,
      statusTooltip: rootGenerationStatusTooltip("设计链路", designRootStatus),
      onSelect: openDesignHome,
      children: [
        ...orderedDesignDiagrams.map((diagram) => {
          const diagramModels = designModelsByDiagram[diagram];
          if (
            diagram === "sequence" &&
            (sequenceSubtaskNodes.length > 1 ||
              (sequenceGenerationActive && sequenceSubtaskNodes.length > 0))
          ) {
            const sequenceGroupStale =
              staleDesignDiagrams.includes("sequence") ||
              sequenceSubtaskNodes.some((node) =>
                staleDesignModelIds.includes(node.id),
              );
            const sequenceGroupStaleReason =
              sequenceSubtaskNodes
                .map((node) => designStaleReasons[node.id])
                .find(Boolean) ??
              (staleDesignDiagrams.includes("sequence")
                ? "上游需求模型或追踪指纹已变化，此设计模型需更新。"
                : undefined);
            const groupStatus = sequenceSubtaskNodes.reduce<Node["status"]>(
              (current, model) =>
                mergeSidebarStatus(
                  current,
                  model.status ?? null,
                ),
              undefined,
            );
            return {
              key: "design-diagram-group:sequence",
              label: `${DESIGN_DIAGRAM_META.sequence.label}（${sequenceSubtaskNodes.length}）`,
              icon: (
                <span className="relative inline-flex">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  {sequenceGroupStale && (
                    <span
                      title={sequenceGroupStaleReason ?? "此设计模型需更新"}
                      className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
                    />
                  )}
                </span>
              ),
              selectable: false,
              status: groupStatus,
              statusTooltip:
                generationStatusTooltip(
                  DESIGN_DIAGRAM_META.sequence.label,
                  groupStatus,
                  sequenceSubtaskNodes.some((node) =>
                    designModelViewable("sequence", node.id),
                  ),
                  sequenceSubtaskNodes.some((node) => Boolean(designModels[node.id])),
                ),
              children: sequenceSubtaskNodes.map((node) =>
                {
                  const model = designModels[node.id];
                  const status = node.status;
                  if (!model) {
                    return buildPendingDesignDiagramNode(
                      diagram,
                      node.id,
                      node.label,
                      status,
                      generationStatusTooltip(node.label, status, false),
                    );
                  }
                  const viewable = designModelViewable(diagram, node.id);
                  const hasStructuredModel = Boolean(model);
                  const stale = staleDesignModelIds.includes(node.id);
                  const staleReason = designStaleReasons[node.id];
                  return buildDesignDiagramNode(
                    diagram,
                    model,
                    status === "failed",
                    stale,
                    staleReason,
                    status,
                    generationStatusTooltip(
                      model.title,
                      status,
                      viewable,
                      hasStructuredModel,
                    ),
                    viewable,
                    hasStructuredModel,
                    openDesignDiagram,
                    openDesignTraceMatrix,
                    openDesignDiagramElement,
                  );
                }
              ),
            };
          }
          const model = diagramModels[0];
          const status = designStatusFor(
            diagram,
            model ? getDesignModelId(model) : undefined,
          );
          const modelId = model ? getDesignModelId(model) : undefined;
          const viewable = designModelViewable(diagram, modelId);
          const hasStructuredModel =
            Boolean(model) || generatedDesignDiagrams.includes(diagram);
          const stale = Boolean(
            (modelId && staleDesignModelIds.includes(modelId)) ||
              staleDesignDiagrams.includes(diagram),
          );
          const staleReason =
            (modelId ? designStaleReasons[modelId] : undefined) ??
            (stale ? "上游需求模型或追踪指纹已变化，此设计模型需更新。" : undefined);
          return buildDesignDiagramNode(
            diagram,
            model,
            status === "failed",
            stale,
            staleReason,
            status,
            generationStatusTooltip(
              DESIGN_DIAGRAM_META[diagram].label,
              status,
              viewable,
              hasStructuredModel,
            ),
            viewable,
            hasStructuredModel,
            openDesignDiagram,
            openDesignTraceMatrix,
            openDesignDiagramElement,
          );
        }),
      ],
    },
    {
      key: "workspace:code",
      label: "代码",
      icon: <Code2 className="size-4 text-muted-foreground" />,
      status: codeRootStatus,
      statusTooltip: rootGenerationStatusTooltip("代码原型", codeRootStatus),
      onSelect: () => openWorkspacePlaceholder("code", "代码"),
    },
    {
      key: "test",
      label: "测试",
      icon: <ClipboardCheck className="size-4 text-muted-foreground" />,
      onSelect: openTestHome,
    },
    {
      key: "documents",
      label: "说明书",
      icon: <FileText className="size-4 text-muted-foreground" />,
      status: documentRootStatus,
      statusTooltip: rootGenerationStatusTooltip("说明书", documentRootStatus),
      onSelect: openDocumentsHome,
    },
  ];

  return (
    <nav
      aria-label="项目导航"
      className="flex h-full w-full flex-col overflow-hidden py-6 text-sidebar-foreground"
    >
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-button]:size-0 [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="mb-3 flex items-center gap-2 px-4 py-2">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-[0.88px] text-muted-foreground">
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
              onNavigateItemSelect={onNavigateItemSelect}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
