// Renders the workspace sidebar navigation and diagram status tree used by desktop and wide viewport layouts.
import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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
  Wrench,
  TableProperties,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../shared/ui/utils";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  getDesignDiagramLabel,
  getDesignModelId,
  getDiagramLabel,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import { getRelationDisplayLabel } from "../../diagrams/lib/diagram-detail-view-model";
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
  const { t } = useTranslation();
  const label =
    tooltip ??
    (status === "queued"
      ? t("workspace.sidebar.queued")
      : status === "running"
      ? t("workspace.sidebar.generating")
      : status === "failed"
        ? t("workspace.sidebar.generationFailed")
        : t("workspace.sidebar.generated"));
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
  t: TFunction,
) {
  if (status === "queued") return t("workspace.sidebar.rootQueued", { label });
  if (status === "running") return t("workspace.sidebar.rootRunning", { label });
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
  const { t } = useTranslation();
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
            aria-label={t(open ? "workspace.sidebar.collapse" : "workspace.sidebar.expand", { label: node.label })}
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
  openDiagramRelationship: (
    diagram: DiagramType,
    relationshipId: string,
    label: string,
    modelId?: string,
  ) => void,
  t: TFunction,
): Node {
  const modelId = model ? getRequirementModelId(model) : diagram;
  const canOpen = viewable && status !== "failed";
  const label =
    diagram === "analysis" && model
      ? ("sourceUseCaseName" in model ? model.sourceUseCaseName : undefined) ?? model.title
      : getDiagramLabel(diagram, t);
  const detail = buildDiagramDetailModel(model);
  const children: Node[] = [
    ...(model
      ? [
          {
            key: `requirements:trace-matrix:${modelId}`,
            label: t("traceability.title.short"),
            icon: <Network className="size-3.5 text-muted-foreground" />,
            onSelect: () => openRequirementTraceMatrix(diagram, modelId, label),
          },
        ]
      : []),
    ...(model
      ? buildDiagramDetailCategoryNodes(
          detail,
          modelId,
          "diagram-category",
          "diagram-group",
          "diagram-element",
          "diagram-relationship",
          (element) =>
            openDiagramElement(
              diagram,
              element.kind,
              element.id,
              element.label,
              modelId,
            ),
          (relationship, relationshipLabel) =>
            openDiagramRelationship(
              diagram,
              relationship.id,
              relationshipLabel,
              modelId,
            ),
          { showGroupBadges: true },
          t,
        )
      : []),
  ];

  return {
    key: `diagram:${modelId}`,
    label,
    icon: (
      <span className="relative inline-flex">
        <Network className="size-4 text-muted-foreground" />
        {stale && (
          <span
            title={t("workspace.sidebar.requirementStale")}
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
          />
        )}
        {failed && (
          <span
            title={t("workspace.sidebar.requirementFailed")}
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
  t: TFunction,
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
      label: t(`diagrams.semantic.${group.kind}.label`, {
        defaultValue: SEMANTIC_KIND_META[group.kind].label,
      }),
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

function buildDiagramDetailCategoryNodes(
  detail: ReturnType<typeof buildDiagramDetailModel>,
  modelId: string,
  categoryKeyPrefix: string,
  groupKeyPrefix: string,
  elementKeyPrefix: string,
  relationshipKeyPrefix: string,
  onSelectElement: (
    element: ReturnType<typeof buildDiagramDetailModel>["items"][number],
  ) => void,
  onSelectRelationship: (
    relationship: ReturnType<typeof buildDiagramDetailModel>["relationships"][number],
    label: string,
  ) => void,
  options: { showGroupBadges: boolean },
  t: TFunction,
): Node[] {
  const itemsById = new Map(detail.items.map((item) => [item.id, item]));
  const elementGroups = buildDiagramElementGroupNodes(
    detail,
    modelId,
    groupKeyPrefix,
    elementKeyPrefix,
    onSelectElement,
    options,
    t,
  );

  return [
    {
      key: `${categoryKeyPrefix}:${modelId}:elements`,
      label: t("diagrams.tabs.elements"),
      icon: <Layers className="size-3.5 text-muted-foreground" />,
      selectable: false,
      badge: detail.items.length,
      children: elementGroups,
    },
    {
      key: `${categoryKeyPrefix}:${modelId}:relations`,
      label: t("diagrams.tabs.relations"),
      icon: <GitBranch className="size-3.5 text-muted-foreground" />,
      selectable: false,
      badge: detail.relationships.length,
      children: detail.relationships.map((relationship) => {
        const relationshipLabel = getRelationDisplayLabel(relationship, itemsById);
        return {
          key: `${relationshipKeyPrefix}:${modelId}:${relationship.id}`,
          label: relationshipLabel,
          icon: <GitBranch className="size-3.5 text-muted-foreground" />,
          onSelect: () => onSelectRelationship(relationship, relationshipLabel),
        };
      }),
    },
  ];
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
  openDesignDiagramRelationship: (
    diagram: DesignDiagramType,
    relationshipId: string,
    label: string,
    modelId?: string,
  ) => void,
  t: TFunction,
): Node {
  const modelId = model ? getDesignModelId(model) : diagram;
  const canOpen = viewable && status !== "failed";
  const label =
    diagram === "sequence" && model
      ? ("sourceUseCaseName" in model ? model.sourceUseCaseName : undefined) ?? model.title
      : getDesignDiagramLabel(diagram, t);
  const detail = buildDiagramDetailModel(model);
  const children: Node[] = [
    ...(model
      ? [
          {
            key: `design:trace-matrix:${modelId}`,
            label: t("traceability.title.short"),
            icon: <Network className="size-3.5 text-muted-foreground" />,
            onSelect: () => openDesignTraceMatrix(diagram, modelId, label),
          },
        ]
      : []),
    ...(model
      ? buildDiagramDetailCategoryNodes(
          detail,
          modelId,
          "design-diagram-category",
          "design-diagram-group",
          "design-diagram-element",
          "design-diagram-relationship",
          (element) =>
            openDesignDiagramElement(
              diagram,
              element.kind,
              element.id,
              element.label,
              modelId,
            ),
          (relationship, relationshipLabel) =>
            openDesignDiagramRelationship(
              diagram,
              relationship.id,
              relationshipLabel,
              modelId,
            ),
          { showGroupBadges: false },
          t,
        )
      : []),
  ];

  return {
    key: `design-diagram:${modelId}`,
    label,
    icon: (
      <span className="relative inline-flex">
        <Network className="size-4 text-muted-foreground" />
        {stale && (
          <span
            title={stale ? t("workspace.sidebar.designStale") : staleReason}
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
          />
        )}
        {failed && (
          <span
            title={t("workspace.sidebar.designFailed")}
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
  const { t } = useTranslation();
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
    feasibilityContextArtifact,
    hasFeasibilityContextArtifact,
    hasFeasibilityImplementationArtifact,
    feasibilityImplementationPlan,
  } =
    useWorkspaceSession();
  const {
    selection,
    openSystemRequirements,
    openRequirementsText,
    openFeasibilityHome,
    openFeasibilityContext,
    openFeasibilityContextTrace,
    openFeasibilityContextElement,
    openFeasibilityContextRelationship,
    openFeasibilityImplementation,
    openRequirementTraceMatrix,
    openDiagram,
    openDesignHome,
    openDesignTraceMatrix,
    openTestHome,
    openDesignDiagram,
    openDesignDiagramElement,
    openDesignDiagramRelationship,
    openDiagramElement,
    openDiagramRelationship,
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
      const detail = (event as CustomEvent<{ kind?: string; selectedArtifacts?: string[] }>).detail;
      if (
        detail?.kind !== "requirements" &&
        detail?.kind !== "design" &&
        detail?.kind !== "feasibility"
      ) {
        return;
      }
      setOpenKeys((current) => {
        const next = new Set(current);
        next.add(
          detail.kind === "requirements"
            ? "requirements"
            : detail.kind === "design"
              ? "design"
              : "feasibility",
        );
        if (
          detail.kind === "feasibility" &&
          detail.selectedArtifacts?.includes("context")
        ) {
          next.add("feasibility:context");
        }
        return next;
      });
    };

    window.addEventListener("uml-generation-completed", handleCompleted);
    return () => {
      window.removeEventListener("uml-generation-completed", handleCompleted);
    };
  }, []);

  const contextModel = feasibilityContextArtifact?.feasibilityContextModel ?? null;
  const contextDetail = buildDiagramDetailModel(contextModel);
  const contextModelId = contextModel?.modelId ?? "context";
  const feasibilityChildren: Node[] = [
    ...(hasFeasibilityContextArtifact
      ? [
          {
            key: "feasibility:context",
            label: t("workspace.sidebar.contextDiagram"),
            icon: <Network className="size-4 text-muted-foreground" />,
            onSelect: openFeasibilityContext,
            children: [
              { key: "feasibility:context:trace", label: t("workspace.sidebar.traceability"), icon: <TableProperties className="size-3.5 text-muted-foreground" />, onSelect: openFeasibilityContextTrace },
              ...buildDiagramDetailCategoryNodes(
                contextDetail,
                contextModelId,
                "feasibility-context-category",
                "feasibility-context-group",
                "feasibility-context-element",
                "feasibility-context-relationship",
                (element) => openFeasibilityContextElement(element.kind, element.id, element.label),
                (relationship, relationshipLabel) =>
                  openFeasibilityContextRelationship(
                    relationship.id,
                    relationshipLabel,
                  ),
                { showGroupBadges: true },
                t,
              ),
            ],
            badge: contextDetail.items.length || undefined,
          },
        ]
      : []),
    ...(hasFeasibilityImplementationArtifact
      ? [
          {
            key: "feasibility:implementation",
            label: t("workspace.sidebar.implementation"),
            icon: <Wrench className="size-4 text-muted-foreground" />,
            onSelect: openFeasibilityImplementation,
            children: feasibilityImplementationPlan?.candidates.map((candidate) => ({
              key: `feasibility:implementation:${candidate.id}`,
              label: candidate.name,
              icon: <Wrench className="size-3.5 text-muted-foreground" />,
              onSelect: () =>
                openFeasibilityImplementation(candidate.id, candidate.name),
            })),
          },
        ]
      : []),
  ];

  const tree: Node[] = [
    {
      key: "system-requirements",
      label: t("workspace.tabs.labels.systemRequirements"),
      icon: <FileText className="size-4 text-muted-foreground" />,
      onSelect: openSystemRequirements,
    },
    {
      key: "feasibility",
      label: t("workspace.tabs.labels.feasibility"),
      icon: <Wrench className="size-4 text-muted-foreground" />,
      onSelect: openFeasibilityHome,
      children: feasibilityChildren,
    },
    {
      key: "requirements",
      label: t("workspace.tabs.labels.requirements"),
      icon: <FileText className="size-4 text-muted-foreground" />,
      status: requirementRootStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.requirementPipeline"), requirementRootStatus, t),
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
              label: `${getDiagramLabel("analysis", t)}（${analysisSubtaskNodes.length}）`,
              icon: <MessageSquare className="size-4 text-muted-foreground" />,
              selectable: false,
              status: groupStatus,
              statusTooltip: generationStatusTooltip(
                getDiagramLabel("analysis", t),
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
                  openDiagramRelationship,
                  t,
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
              getDiagramLabel(diagram, t),
              status,
              viewable,
              hasStructuredModel,
            ),
            viewable,
            hasStructuredModel,
            openDiagram,
            openRequirementTraceMatrix,
            openDiagramElement,
            openDiagramRelationship,
            t,
          );
        }),
      ],
    },
    {
      key: "design",
      label: t("workspace.tabs.labels.design"),
      icon: <Palette className="size-4 text-muted-foreground" />,
      status: designRootStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.designPipeline"), designRootStatus, t),
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
                ? t("workspace.sidebar.designUpstreamStale")
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
              label: t("workspace.sidebar.groupCount", { label: getDesignDiagramLabel("sequence", t), count: sequenceSubtaskNodes.length }),
              icon: (
                <span className="relative inline-flex">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  {sequenceGroupStale && (
                    <span
                      title={sequenceGroupStaleReason ?? t("workspace.sidebar.designStale")}
                      className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
                    />
                  )}
                </span>
              ),
              selectable: false,
              status: groupStatus,
              statusTooltip:
                generationStatusTooltip(
                  getDesignDiagramLabel("sequence", t),
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
                    openDesignDiagramRelationship,
                    t,
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
            (stale ? t("workspace.sidebar.designUpstreamStale") : undefined);
          return buildDesignDiagramNode(
            diagram,
            model,
            status === "failed",
            stale,
            staleReason,
            status,
            generationStatusTooltip(
              getDesignDiagramLabel(diagram, t),
              status,
              viewable,
              hasStructuredModel,
            ),
            viewable,
            hasStructuredModel,
            openDesignDiagram,
            openDesignTraceMatrix,
            openDesignDiagramElement,
            openDesignDiagramRelationship,
            t,
          );
        }),
      ],
    },
    {
      key: "workspace:code",
      label: t("workspace.tabs.labels.code"),
      icon: <Code2 className="size-4 text-muted-foreground" />,
      status: codeRootStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.codePrototype"), codeRootStatus, t),
      onSelect: () => openWorkspacePlaceholder("code", t("workspace.tabs.labels.code")),
    },
    {
      key: "test",
      label: t("workspace.tabs.labels.tests"),
      icon: <ClipboardCheck className="size-4 text-muted-foreground" />,
      onSelect: openTestHome,
    },
    {
      key: "documents",
      label: t("workspace.tabs.labels.documents"),
      icon: <FileText className="size-4 text-muted-foreground" />,
      status: documentRootStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.documentPipeline"), documentRootStatus, t),
      onSelect: openDocumentsHome,
    },
  ];

  return (
    <nav
      aria-label={t("workspace.sidebar.navigation")}
      className="flex h-full w-full flex-col overflow-hidden py-6 text-sidebar-foreground"
    >
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-button]:size-0 [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="mb-3 flex items-center gap-2 px-4 py-2">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-[0.88px] text-muted-foreground">
            {t("workspace.sidebar.navigation")}
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
