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
import {
  DESIGN_DIAGRAM_ORDER,
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

type Node = {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: Node[];
  selectable?: boolean;
  badge?: string | number;
  badgeTooltip?: string;
  badges?: string[];
  status?: "queued" | "running" | "completed" | "failed";
  statusTooltip?: string;
  unavailableReason?: string;
  onSelect?: () => void;
};

type DesignSubtaskNode = {
  id: string;
  label: string;
  status: Node["status"];
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

function sidebarStatusFromSubtaskStatus(status: string | undefined) {
  switch (status) {
    case "failed":
      return "failed" as const;
    case "completed":
    case "pending_review":
      return "completed" as const;
    case "queued":
      return "queued" as const;
    case "running":
    case "repairing":
    case "rendering":
      return "running" as const;
    default:
      return null;
  }
}

function mergeSidebarStatus(
  current: Node["status"] | undefined,
  next: Node["status"] | null,
) {
  if (!next) return current;
  if (current === "failed" || next === "failed") return "failed";
  if (current === "running" || next === "running") return "running";
  if (current === "queued" || next === "queued") return "queued";
  return "completed";
}

const STAGE_SCOPED_SUBTASK_PREFIXES = [
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
  "generate_plantuml",
  "render_svg",
] as const;

type StageScopedSubtaskPrefix = (typeof STAGE_SCOPED_SUBTASK_PREFIXES)[number];
type StageStatusMap = Partial<Record<StageScopedSubtaskPrefix, Node["status"] | null>>;

function scopedSubtaskInfo(id: string) {
  const prefix = STAGE_SCOPED_SUBTASK_PREFIXES.find((candidate) =>
    id.startsWith(`${candidate}:`),
  );
  if (!prefix) return null;
  return {
    prefix,
    rawId: id.slice(prefix.length + 1),
  };
}

function aggregatePipelineStatus(stageStatuses: StageStatusMap) {
  const statuses = Object.values(stageStatuses).filter(Boolean);
  if (statuses.includes("failed")) return "failed" as const;
  if (stageStatuses.render_svg === "completed") return "completed" as const;
  if (
    statuses.includes("running") ||
    stageStatuses.generate_models === "completed" ||
    stageStatuses.generate_design_sequence === "completed" ||
    stageStatuses.generate_design_models === "completed" ||
    stageStatuses.generate_plantuml === "completed"
  ) {
    return "running" as const;
  }
  if (statuses.includes("queued")) return "queued" as const;
  return null;
}

function setSubtaskStatus(
  statuses: Map<string, Node["status"]>,
  labels: Map<string, string>,
  stageStatusesByRawId: Map<string, StageStatusMap>,
  id: string,
  label: string,
  status: Node["status"] | null,
) {
  statuses.set(id, mergeSidebarStatus(statuses.get(id), status));
  labels.set(id, label);
  // Generation tasks scope repeated pipeline phases by stage; the sidebar groups
  // by model id, so keep a raw-id alias for rendering and regeneration states.
  const scoped = scopedSubtaskInfo(id);
  if (scoped) {
    const stageStatuses = stageStatusesByRawId.get(scoped.rawId) ?? {};
    stageStatuses[scoped.prefix] = status;
    stageStatusesByRawId.set(scoped.rawId, stageStatuses);
    const rawStatus = aggregatePipelineStatus(stageStatuses);
    if (rawStatus) {
      statuses.set(scoped.rawId, rawStatus);
    } else {
      statuses.delete(scoped.rawId);
    }
    labels.set(scoped.rawId, label);
  }
}

function generationStatusTooltip(
  label: string,
  status: Node["status"],
  hasViewableSvg: boolean,
  hasStructuredModel = hasViewableSvg,
) {
  if (status === "queued") {
    return hasViewableSvg
      ? `${label}重新生成排队中，当前图仍可查看`
      : hasStructuredModel
        ? `${label}模型已生成，等待生成图像`
      : `${label}生成排队中`;
  }
  if (status === "running") {
    return hasViewableSvg
      ? `${label}重新生成中，当前图仍可查看`
      : hasStructuredModel
        ? `${label}模型已生成，正在生成图像`
      : `${label}生成中`;
  }
  if (status === "failed") return `${label}生成失败`;
  if (status === "completed") return `${label}已生成`;
  return undefined;
}

function diagramUnavailableReason(
  status: Node["status"],
  hasStructuredModel: boolean,
) {
  if (status === "failed") return "生成失败，请查看生成任务详情";
  if (status === "queued") return "生成排队中，完成后可查看";
  if (status === "running") {
    return hasStructuredModel
      ? "当前只有结构化模型，SVG 尚未生成"
      : "正在生成图像，渲染完成后可查看";
  }
  if (status === "completed" || hasStructuredModel) {
    return "当前只有结构化模型，SVG 尚未生成";
  }
  return "生成完成后可查看";
}

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
    ...detail.groups.map((group) => ({
      key: `diagram-group:${modelId}:${group.kind}`,
      label: SEMANTIC_KIND_META[group.kind].label,
      selectable: false,
      badge: group.items.length,
      children: group.items.map((element) => ({
        key: `diagram-element:${modelId}:${element.kind}:${element.id}`,
        label: element.label,
        icon: KIND_ICON[element.kind],
        onSelect: () =>
          openDiagramElement(diagram, element.kind, element.id, element.label, modelId),
      })),
    })),
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

function buildDesignDiagramNode(
  diagram: DesignDiagramType,
  model: ReturnType<typeof useWorkspaceSession>["designModels"][string] | undefined,
  failed: boolean,
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
    ...detail.groups.map((group) => ({
      key: `design-diagram-group:${modelId}:${group.kind}`,
      label: SEMANTIC_KIND_META[group.kind].label,
      selectable: false,
      children: group.items.map((element) => ({
        key: `design-diagram-element:${modelId}:${element.kind}:${element.id}`,
        label: element.label,
        icon: KIND_ICON[element.kind],
        onSelect: () =>
          openDesignDiagramElement(
            diagram,
            element.kind,
            element.id,
            element.label,
            modelId,
          ),
      })),
    })),
  ];

  return {
    key: `design-diagram:${modelId}`,
    label,
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

function sequenceUseCaseNodes(
  useCaseModel: ReturnType<typeof useWorkspaceSession>["models"]["usecase"],
) {
  if (!useCaseModel || !("useCases" in useCaseModel)) return [];
  return useCaseModel.useCases.map((useCase) => ({
    id: `sequence:${useCase.id}`,
    label: useCase.name,
  }));
}

function analysisUseCaseNodes(
  useCaseModel: ReturnType<typeof useWorkspaceSession>["models"]["usecase"],
) {
  if (!useCaseModel || !("useCases" in useCaseModel)) return [];
  return useCaseModel.useCases.map((useCase) => ({
    id: `analysis:${useCase.id}`,
    label: useCase.name,
  }));
}

export function SidebarMenu() {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const {
    generatedDiagrams,
    models,
    staleDiagrams,
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
  const requirementModelsByDiagram = (Object.keys(DIAGRAM_META) as DiagramType[]).reduce(
    (acc, diagram) => {
      acc[diagram] = Object.values(models).filter(
        (model): model is NonNullable<typeof model> =>
          Boolean(model) && model.diagramKind === diagram,
      );
      return acc;
    },
    {} as Record<DiagramType, Array<NonNullable<ReturnType<typeof useWorkspaceSession>["models"][string]>>>,
  );
  const designModelsByDiagram = DESIGN_DIAGRAM_ORDER.reduce(
    (acc, diagram) => {
      acc[diagram] = Object.values(designModels).filter(
        (model) => model.diagramKind === diagram,
      );
      return acc;
    },
    {} as Record<DesignDiagramType, Array<ReturnType<typeof useWorkspaceSession>["designModels"][string]>>,
  );
  const requirementSubtaskStatus = new Map<string, Node["status"]>();
  const requirementSubtaskLabels = new Map<string, string>();
  const requirementStageStatuses = new Map<string, StageStatusMap>();
  const designSubtaskStatus = new Map<string, Node["status"]>();
  const designSubtaskLabels = new Map<string, string>();
  const designStageStatuses = new Map<string, StageStatusMap>();
  for (const task of generationTasks.filter((item) =>
    item.status === "queued" || item.status === "running"
  )) {
    for (const subtask of task.subtasks) {
      const status = sidebarStatusFromSubtaskStatus(subtask.status);
      if (task.kind === "requirements") {
        setSubtaskStatus(
          requirementSubtaskStatus,
          requirementSubtaskLabels,
          requirementStageStatuses,
          subtask.id,
          subtask.label,
          status,
        );
      }
      if (task.kind === "design") {
        setSubtaskStatus(
          designSubtaskStatus,
          designSubtaskLabels,
          designStageStatuses,
          subtask.id,
          subtask.label,
          status,
        );
      }
    }
  }
  const requirementNodeDiagrams = (Object.keys(DIAGRAM_META) as DiagramType[]).filter(
    (diagram) =>
      requirementModelsByDiagram[diagram].length > 0 ||
      generatedDiagrams.includes(diagram) ||
      requirementSubtaskStatus.has(diagram) ||
      [...requirementSubtaskStatus.keys()].some((id) => id.startsWith(`${diagram}:`)) ||
      Boolean(diagramErrors[diagram]) ||
      Object.keys(diagramErrors).some((id) => id.startsWith(`${diagram}:`)),
  );
  const orderedDesignDiagrams = DESIGN_DIAGRAM_ORDER.filter(
    (diagram) =>
      designModelsByDiagram[diagram].length > 0 ||
      generatedDesignDiagrams.includes(diagram) ||
      designSubtaskStatus.has(diagram) ||
      Boolean(designDiagramErrors[diagram]) ||
      (diagram === "sequence" &&
        ([...designSubtaskStatus.keys()].some((id) => id.startsWith("sequence:")) ||
          Object.keys(designDiagramErrors).some((id) => id.startsWith("sequence:")))),
  );

  const requirementStatusFor = (diagram: DiagramType, modelId?: string): Node["status"] => {
    if (modelId && diagramErrors[modelId]) return "failed";
    if (diagramErrors[diagram]) return "failed";
    const activeStatus =
      (modelId ? requirementSubtaskStatus.get(modelId) : undefined) ??
      requirementSubtaskStatus.get(diagram);
    if (activeStatus) return activeStatus;
    const viewable = requirementModelViewable(diagram, modelId);
    const hasStructuredModel = Boolean(
      (modelId ? models[modelId] : undefined) ??
        models[diagram] ??
        requirementModelsByDiagram[diagram][0],
    );
    if (generatedDiagrams.includes(diagram) || hasStructuredModel) return "completed";
    return undefined;
  };
  const requirementModelViewable = (diagram: DiagramType, modelId?: string) =>
    Boolean((modelId ? svgArtifacts[modelId] : undefined) ?? svgArtifacts[diagram]);
  const analysisGenerationActive =
    requirementSubtaskStatus.has("analysis") ||
    [...requirementSubtaskStatus.keys()].some((id) => id.startsWith("analysis:"));
  const expectedAnalysisNodes = analysisGenerationActive
    ? analysisUseCaseNodes(models.usecase)
    : [];
  const analysisNodeIds = Array.from(
    new Set([
      ...expectedAnalysisNodes.map((node) => node.id),
      ...requirementModelsByDiagram.analysis.map((model) => getRequirementModelId(model)),
      ...[...requirementSubtaskStatus.keys()].filter((id) => id.startsWith("analysis:")),
      ...Object.keys(diagramErrors).filter((id) => id.startsWith("analysis:")),
    ]),
  );
  const analysisSubtaskNodes: DesignSubtaskNode[] = analysisNodeIds.map((id) => {
    const model = models[id];
    const expected = expectedAnalysisNodes.find((node) => node.id === id);
    const rawLabel =
      model && "sourceUseCaseName" in model
        ? model.sourceUseCaseName ?? model.title
        : requirementSubtaskLabels.get(id) ?? expected?.label ?? id.replace(/^analysis:/, "");
    return {
      id,
      label: rawLabel.replace(/^需求分析模型[：:]\s*/u, ""),
      status: requirementStatusFor("analysis", id),
    };
  });
  const designStatusFor = (diagram: DesignDiagramType, modelId?: string): Node["status"] => {
    if (modelId && designDiagramErrors[modelId]) return "failed";
    if (designDiagramErrors[diagram]) return "failed";
    const activeStatus =
      (modelId ? designSubtaskStatus.get(modelId) : undefined) ??
      designSubtaskStatus.get(diagram);
    if (activeStatus) return activeStatus;
    const viewable = designModelViewable(diagram, modelId);
    const hasStructuredModel = Boolean(
      (modelId ? designModels[modelId] : undefined) ??
        designModels[diagram] ??
        designModelsByDiagram[diagram][0],
    );
    if (generatedDesignDiagrams.includes(diagram) || hasStructuredModel) return "completed";
    return undefined;
  };
  const designModelViewable = (diagram: DesignDiagramType, modelId?: string) =>
    Boolean((modelId ? designSvgArtifacts[modelId] : undefined) ?? designSvgArtifacts[diagram]);
  const sequenceGenerationActive =
    designSubtaskStatus.has("sequence") ||
    [...designSubtaskStatus.keys()].some((id) => id.startsWith("sequence:"));
  const expectedSequenceNodes = sequenceGenerationActive
    ? sequenceUseCaseNodes(models.usecase)
    : [];
  const sequenceNodeIds = Array.from(
    new Set([
      ...expectedSequenceNodes.map((node) => node.id),
      ...designModelsByDiagram.sequence.map((model) => getDesignModelId(model)),
      ...[...designSubtaskStatus.keys()].filter((id) => id.startsWith("sequence:")),
      ...Object.keys(designDiagramErrors).filter((id) => id.startsWith("sequence:")),
    ]),
  );
  const sequenceSubtaskNodes: DesignSubtaskNode[] = sequenceNodeIds.map((id) => {
    const model = designModels[id];
    const expected = expectedSequenceNodes.find((node) => node.id === id);
    const rawLabel =
      model && "sourceUseCaseName" in model
        ? model.sourceUseCaseName ?? model.title
        : designSubtaskLabels.get(id) ?? expected?.label ?? id.replace(/^sequence:/, "");
    return {
      id,
      label: rawLabel.replace(/^(?:顺序图|用例实现设计)[：:]\s*/u, ""),
      status: designStatusFor("sequence", id),
    };
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
      onSelect: openDesignHome,
      children: [
        ...orderedDesignDiagrams.map((diagram) => {
          const diagramModels = designModelsByDiagram[diagram];
          if (
            diagram === "sequence" &&
            (sequenceSubtaskNodes.length > 1 ||
              (sequenceGenerationActive && sequenceSubtaskNodes.length > 0))
          ) {
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
              icon: <MessageSquare className="size-4 text-muted-foreground" />,
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
                  return buildDesignDiagramNode(
                    diagram,
                    model,
                    Boolean(designDiagramErrors[node.id] ?? designDiagramErrors[diagram]),
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
          return buildDesignDiagramNode(
            diagram,
            model,
            Boolean(designDiagramErrors[diagram]),
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
      key: "test",
      label: "测试",
      icon: <ClipboardCheck className="size-4 text-muted-foreground" />,
      onSelect: openTestHome,
    },
    {
      key: "workspace:code",
      label: "代码",
      icon: <Code2 className="size-4 text-muted-foreground" />,
      onSelect: () => openWorkspacePlaceholder("code", "代码"),
    },
    {
      key: "documents",
      label: "说明书",
      icon: <FileText className="size-4 text-muted-foreground" />,
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
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
