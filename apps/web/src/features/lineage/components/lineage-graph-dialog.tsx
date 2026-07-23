// Presents the full project generation lineage as a fixed-column dependency map.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import {
  getDesignDiagramDescription,
  getDesignDiagramLabel,
  getDiagramDescription,
  getDiagramLabel,
} from "../../../entities/diagram/model";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../../workspace-shell/state";
import {
  buildLineageGraph,
  collectLineagePath,
  groupLineageColumns,
  type LineageGraph,
  type LineageNode,
  type LineageNodeStatus,
} from "../lib/lineage-graph-model";
import {
  LINEAGE_KIND_STYLES,
  LineageKindIcon,
  LineageNodeCard,
} from "./lineage-node";

type LineageGraphDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRuns?: PlatformRunSummary[];
};

type LineageFilter = "all" | "stale" | "error" | "impact";

type LineageAnchor = {
  left: number;
  right: number;
  centerY: number;
};

const EDGE_SOURCE_OFFSET = 12;
const EDGE_TARGET_OFFSET = 22;

const STATUS_BADGE_CLASS: Record<LineageNodeStatus, string> = {
  "not-generated": "border-slate-200 bg-slate-50 text-slate-600",
  current: "border-emerald-200 bg-emerald-50 text-emerald-700",
  stale: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
  running: "border-indigo-200 bg-indigo-50 text-indigo-700",
  interrupted: "border-amber-200 bg-amber-50 text-amber-700",
};

const FILTERS: LineageFilter[] = ["all", "stale", "error", "impact"];

function lineageStatusKey(status: LineageNodeStatus) {
  return status === "not-generated" ? "not_generated" : status;
}

function localizeLineageGraph(graph: LineageGraph, t: TFunction): LineageGraph {
  const actionByStatus: Record<LineageNodeStatus, string> = {
    "not-generated": "generate",
    current: "view",
    stale: "update",
    error: "retry",
    running: "progress",
    interrupted: "retry",
  };
  const categoryKeys: Record<string, string> = {
    "\u4e1a\u52a1\u89c4\u5219": "business", "\u529f\u80fd\u9700\u6c42": "functional",
    "\u5916\u90e8\u63a5\u53e3": "externalInterface", "\u754c\u9762\u9700\u6c42": "interface",
    "\u6570\u636e\u9700\u6c42": "data", "\u975e\u529f\u80fd\u9700\u6c42": "nonFunctional",
    "\u90e8\u7f72\u9700\u6c42": "deployment", "\u5f02\u5e38\u5904\u7406": "exception",
  };
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const stageKey = node.stage.replace("-", "_");
      const reasonKey = lineageStatusKey(node.status);
      let label = node.label;
      let description = node.description;
      let eyebrow = node.eyebrow;
      if (node.kind === "requirement-model" && node.payload?.diagramKind) {
        label = getDiagramLabel(node.payload.diagramKind, t);
        description = getDiagramDescription(node.payload.diagramKind, t);
      } else if (node.kind === "design-model" && node.payload?.designDiagramKind) {
        label = getDesignDiagramLabel(node.payload.designDiagramKind, t);
        description = getDesignDiagramDescription(node.payload.designDiagramKind, t);
      } else if (node.kind === "document" && node.payload?.documentKind) {
        const productKey = node.payload.documentKind === "requirementsSpec"
          ? "requirementsSpec"
          : "softwareDesignSpec";
        label = t(`lineage.products.${productKey}.label`);
        description = t(`lineage.products.${productKey}.description`);
      } else if (node.kind === "code") {
        label = t("lineage.products.code.label");
        description = t("lineage.products.code.description");
      } else if (node.kind === "rule" && node.id.endsWith(":empty")) {
        label = t("lineage.products.emptyRules.label");
        description = t("lineage.products.emptyRules.description");
      } else if (node.kind === "rule" && categoryKeys[eyebrow]) {
        eyebrow = t(`requirements.categories.${categoryKeys[eyebrow]}`);
      }
      return {
        ...node,
        stageLabel: t(`lineage.stages.${stageKey}`),
        label,
        eyebrow,
        description,
        reason: t(`lineage.reasons.${reasonKey}`),
        actionLabel: t(`lineage.actions.${actionByStatus[node.status]}`),
      };
    }),
  };
}

function edgeColor(status: string) {
  if (status === "stale") return "var(--warning)";
  if (status === "error") return "var(--destructive)";
  if (status === "interrupted") return "var(--warning)";
  return "var(--border)";
}

function selectedEdgeColor(status: string) {
  if (status === "error") return "var(--destructive)";
  if (status === "stale" || status === "interrupted") return "var(--warning)";
  return "var(--primary)";
}

export function buildLineageStepPath(source: LineageAnchor, target: LineageAnchor) {
  const sourceX = source.right + EDGE_SOURCE_OFFSET;
  const targetX = target.left - EDGE_TARGET_OFFSET;
  const middleX = sourceX + Math.max(18, (targetX - sourceX) / 2);
  if (Math.abs(source.centerY - target.centerY) < 2) {
    return `M ${sourceX} ${source.centerY} L ${targetX} ${target.centerY}`;
  }
  return [
    `M ${sourceX} ${source.centerY}`,
    `L ${middleX} ${source.centerY}`,
    `L ${middleX} ${target.centerY}`,
    `L ${targetX} ${target.centerY}`,
  ].join(" ");
}

function nodeMatchesFilter(
  node: LineageNode,
  filter: LineageFilter,
  impactPath: Set<string>,
) {
  if (filter === "all") return true;
  if (filter === "stale") return node.status === "stale";
  if (filter === "error") return node.status === "error";
  return impactPath.has(node.id);
}

function edgeMatchesFilter(
  edge: { source: string; target: string; status: string },
  filter: LineageFilter,
  impactPath: Set<string>,
) {
  if (filter === "all") return true;
  if (filter === "stale") return edge.status === "stale";
  if (filter === "error") return edge.status === "error";
  return impactPath.has(edge.source) && impactPath.has(edge.target);
}

function DetailList({
  title,
  ids,
  graph,
}: {
  title: string;
  ids: string[];
  graph: LineageGraph;
}) {
  const { t } = useTranslation();
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  return (
    <section>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      {ids.length > 0 ? (
        <div className="mt-2 space-y-2">
          {ids.map((id) => (
            <div
              key={id}
              className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{labels.get(id) ?? id}</span>
              <GitBranch className="size-4 shrink-0 text-muted-foreground" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("lineage.noRelated")}</p>
      )}
    </section>
  );
}

function LineageDetailPanel({
  graph,
  selectedNode,
  onPrimaryAction,
  onViewArtifact,
}: {
  graph: LineageGraph;
  selectedNode: LineageNode | null;
  onPrimaryAction: (node: LineageNode) => void;
  onViewArtifact: (node: LineageNode) => void;
}) {
  const { t } = useTranslation();
  if (!selectedNode) {
    return (
      <aside className="w-full border-l bg-card p-5">
        <h3 className="text-base font-semibold">{t("lineage.detail")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("lineage.detailHint")}
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex w-full flex-col border-l bg-card">
      <div className="border-b p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <LineageKindIcon kind={selectedNode.kind} className="size-10" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {selectedNode.stageLabel} · {t(`lineage.kinds.${selectedNode.kind.replace("-", "_")}`)}
              </p>
              <h3 className="mt-1 truncate text-lg font-semibold">{selectedNode.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{selectedNode.eyebrow}</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0", STATUS_BADGE_CLASS[selectedNode.status])}
          >
            {selectedNode.status === "running" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : selectedNode.status === "current" ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <AlertCircle className="size-3" />
            )}
            {t(`lineage.statuses.${lineageStatusKey(selectedNode.status)}`)}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() => onPrimaryAction(selectedNode)}
            disabled={selectedNode.status === "running"}
          >
            {selectedNode.actionLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!selectedNode.hasViewableArtifact}
            onClick={() => onViewArtifact(selectedNode)}
          >
            {selectedNode.status === "running" ? t("lineage.viewOld") : t("lineage.viewArtifact")}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground">{t("lineage.statusReason")}</h4>
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm leading-6">
            {selectedNode.reason}
          </p>
        </section>
        <DetailList title={t("lineage.upstream")} ids={selectedNode.upstreamIds} graph={graph} />
        <DetailList title={t("lineage.downstream")} ids={selectedNode.downstreamIds} graph={graph} />
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground">{t("lineage.recommendation")}</h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {selectedNode.status === "stale"
              ? t("lineage.staleAdvice")
              : selectedNode.status === "error"
                ? t("lineage.errorAdvice")
                : selectedNode.status === "interrupted"
                  ? t("lineage.interruptedAdvice")
                  : selectedNode.status === "not-generated"
                    ? t("lineage.notGeneratedAdvice")
                    : selectedNode.status === "running"
                      ? selectedNode.hasViewableArtifact
                        ? t("lineage.runningOldAdvice")
                        : t("lineage.runningAdvice")
                      : t("lineage.currentAdvice")}
          </p>
        </section>
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground">{t("lineage.recent")}</h4>
          {selectedNode.recentEvents.length > 0 ? (
            <div className="mt-2 space-y-2">
              {selectedNode.recentEvents.map((event) => (
                <div key={`${event.label}:${event.description}`} className="text-sm">
                  <p className="font-medium">{event.label}</p>
                  <p className="text-muted-foreground">{event.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("lineage.noRecent")}</p>
          )}
        </section>
      </div>
    </aside>
  );
}

function LineageCanvas({
  graph,
  selectedNodeId,
  setSelectedNodeId,
  filter,
  onFilterChange,
  onPrimaryAction,
}: {
  graph: LineageGraph;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  filter: LineageFilter;
  onFilterChange: (filter: LineageFilter) => void;
  onPrimaryAction: (node: LineageNode) => void;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [anchors, setAnchors] = useState<Map<string, LineageAnchor>>(
    () => new Map(),
  );
  const columns = useMemo(
    () => groupLineageColumns(graph).map((column) => ({
      ...column,
      label: t(`lineage.stages.${column.id.replace("-", "_")}`),
    })),
    [graph, t],
  );
  const impactPath = useMemo(
    () => collectLineagePath(graph, selectedNodeId),
    [graph, selectedNodeId],
  );
  const effectiveFilter = filter === "impact" && !selectedNodeId ? "all" : filter;

  const measureAnchors = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const surfaceRect = surface.getBoundingClientRect();
    const next = new Map<string, LineageAnchor>();
    nodeRefs.current.forEach((element, id) => {
      const rect = element.getBoundingClientRect();
      next.set(id, {
        left: rect.left - surfaceRect.left,
        right: rect.right - surfaceRect.left,
        centerY: rect.top - surfaceRect.top + rect.height / 2,
      });
    });
    setAnchors(next);
  }, []);

  const registerNode = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) {
        nodeRefs.current.set(id, element);
      } else {
        nodeRefs.current.delete(id);
      }
      window.requestAnimationFrame(measureAnchors);
    },
    [measureAnchors],
  );

  useLayoutEffect(() => {
    measureAnchors();
    const frame = window.requestAnimationFrame(measureAnchors);
    return () => window.cancelAnimationFrame(frame);
  }, [columns, filter, measureAnchors, selectedNodeId]);

  useEffect(() => {
    const measuredNodes = [...nodeRefs.current.values()];
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => measureAnchors());
    if (resizeObserver) {
      if (surfaceRef.current) resizeObserver.observe(surfaceRef.current);
      measuredNodes.forEach((element) => resizeObserver.observe(element));
    }
    window.addEventListener("resize", measureAnchors);
    measureAnchors();
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureAnchors);
    };
  }, [columns, measureAnchors]);

  const connections = useMemo(
    () =>
      graph.edges.flatMap((edge) => {
        const source = anchors.get(edge.source);
        const target = anchors.get(edge.target);
        if (!source || !target) return [];
        const inImpactPath = Boolean(
          selectedNodeId &&
            impactPath.has(edge.source) &&
            impactPath.has(edge.target),
        );
        const matches = edgeMatchesFilter(edge, effectiveFilter, impactPath);
        const muted =
          effectiveFilter === "all"
            ? Boolean(selectedNodeId && !inImpactPath)
            : !matches && !inImpactPath;
        const stroke = inImpactPath
          ? selectedEdgeColor(edge.status)
          : edgeColor(edge.status);
        return {
          edge,
          path: buildLineageStepPath(source, target),
          style: { stroke, muted, inImpactPath },
        };
      }),
    [anchors, effectiveFilter, graph.edges, impactPath, selectedNodeId],
  );

  const resetView = useCallback(() => {
    scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, []);

  const handleFilterClick = useCallback(
    (nextFilter: LineageFilter) => {
      if (nextFilter === "all") {
        setSelectedNodeId(null);
        onFilterChange("all");
        return;
      }
      if (nextFilter === "impact" && !selectedNodeId) {
        onFilterChange("all");
        return;
      }
      onFilterChange(nextFilter);
    },
    [onFilterChange, selectedNodeId, setSelectedNodeId],
  );

  const nodeIsMuted = useCallback(
    (node: LineageNode) => {
      const matches = nodeMatchesFilter(node, effectiveFilter, impactPath);
      if (effectiveFilter !== "all") return !matches;
      return Boolean(selectedNodeId && !impactPath.has(node.id));
    },
    [effectiveFilter, impactPath, selectedNodeId],
  );

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-background">
      <div ref={surfaceRef} className="relative min-h-[720px] min-w-[1300px] p-5 pt-[4.5rem]">
        <div className="absolute left-4 right-4 top-4 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 p-2 shadow-sm backdrop-blur">
          {FILTERS.map((item) => (
            <Button
              key={item}
              type="button"
              variant={filter === item ? "default" : "ghost"}
              size="sm"
              onClick={() => handleFilterClick(item)}
            >
              {t(`lineage.filters.${item}`)}
            </Button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          <Button type="button" variant="ghost" size="sm" onClick={resetView}>
            <RotateCcw className="size-4" />
            {t("lineage.reset")}
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("lineage.summaryCurrent", { count: graph.summary.current })}</span>
            <span>{t("lineage.summaryStale", { count: graph.summary.stale })}</span>
            <span>{t("lineage.summaryError", { count: graph.summary.error })}</span>
            <span>{t("lineage.summaryInterrupted", { count: graph.summary.interrupted })}</span>
          </div>
        </div>
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="lineage-arrow-default"
              markerWidth="14"
              markerHeight="14"
              refX="12"
              refY="7"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 1 1 L 13 7 L 1 13 z" fill="var(--border)" />
            </marker>
            <marker
              id="lineage-arrow-selected"
              markerWidth="14"
              markerHeight="14"
              refX="12"
              refY="7"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 1 1 L 13 7 L 1 13 z" fill="var(--primary)" />
            </marker>
            <marker
              id="lineage-arrow-stale"
              markerWidth="14"
              markerHeight="14"
              refX="12"
              refY="7"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 1 1 L 13 7 L 1 13 z" fill="var(--warning)" />
            </marker>
            <marker
              id="lineage-arrow-error"
              markerWidth="14"
              markerHeight="14"
              refX="12"
              refY="7"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 1 1 L 13 7 L 1 13 z" fill="var(--destructive)" />
            </marker>
          </defs>
          {connections.map(({ edge, path, style }) => {
            const marker =
              style.inImpactPath && edge.status === "default"
                ? "url(#lineage-arrow-selected)"
                : edge.status === "error"
                  ? "url(#lineage-arrow-error)"
                  : edge.status === "stale" || edge.status === "interrupted"
                    ? "url(#lineage-arrow-stale)"
                    : "url(#lineage-arrow-default)";
            return (
              <g key={edge.id}>
                {style.inImpactPath && !style.muted ? (
                  <path
                    d={path}
                    fill="none"
                    stroke="var(--background)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="7"
                    strokeDasharray={
                      edge.status === "error" || edge.status === "interrupted"
                        ? "6 5"
                        : undefined
                    }
                    opacity="0.88"
                  />
                ) : null}
                <path
                  data-testid={`lineage-edge-${edge.id}`}
                  d={path}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={style.inImpactPath ? 3 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={
                    edge.status === "error" || edge.status === "interrupted"
                      ? "6 5"
                      : undefined
                  }
                  markerEnd={marker}
                  opacity={style.muted ? 0.16 : 0.92}
                />
              </g>
            );
          })}
        </svg>
        <div className="relative z-10 grid grid-cols-[250px_250px_250px_250px] gap-[76px]">
          {columns.map((column) => (
            <section key={column.id} aria-label={column.label}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {column.label}
                </h3>
                <span className="rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground">
                  {column.nodes.length}
                </span>
              </div>
              <div className="space-y-7">
                {column.nodes.map((node) => (
                  <LineageNodeCard
                    key={node.id}
                    node={node}
                    selected={selectedNodeId === node.id}
                    muted={nodeIsMuted(node)}
                    registerNode={registerNode(node.id)}
                    onSelect={(nextNode) => setSelectedNodeId(nextNode.id)}
                    onPrimaryAction={onPrimaryAction}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LineageGraphDialog({
  open,
  onOpenChange,
  projectRuns = [],
}: LineageGraphDialogProps) {
  const { t, i18n } = useTranslation();
  const session = useWorkspaceSession();
  const workspaceShell = useWorkspaceShell();
  const [filter, setFilter] = useState<LineageFilter>("all");
  const graph = useMemo(
    () => localizeLineageGraph(buildLineageGraph({ ...session, projectRuns }), t),
    [i18n.resolvedLanguage, projectRuns, session, t],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) ?? null;

  useEffect(() => {
    if (open) {
      setSelectedNodeId(null);
      setFilter("all");
    }
  }, [open]);

  useEffect(() => {
    if (selectedNodeId && !graph.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setFilter((currentFilter) =>
        currentFilter === "impact" ? "all" : currentFilter,
      );
    }
  }, [graph.nodes, selectedNodeId]);

  const handleViewArtifact = useCallback(
    (node: LineageNode) => {
      if (node.kind === "rule") {
        workspaceShell.openRequirementsText();
      } else if (node.kind === "requirement-model" && node.payload?.diagramKind) {
        workspaceShell.openDiagram(node.payload.diagramKind, undefined, node.label);
      } else if (node.kind === "design-model" && node.payload?.designDiagramKind) {
        workspaceShell.openDesignDiagram(
          node.payload.designDiagramKind,
          undefined,
          node.label,
        );
      } else if (node.kind === "code") {
        workspaceShell.openWorkspacePlaceholder("code", t("workspace.sidebar.code"));
      } else if (node.kind === "document") {
        workspaceShell.openDocumentsHome();
      }
      onOpenChange(false);
    },
    [onOpenChange, t, workspaceShell],
  );

  const handlePrimaryAction = useCallback(
    (node: LineageNode) => {
      if (node.status === "current") {
        handleViewArtifact(node);
        return;
      }
      if (node.status === "running") return;
      if (node.kind === "rule") {
        void session.generateRules();
        return;
      }
      if (node.kind === "requirement-model" && node.payload?.diagramKind) {
        void session.generateDiagrams([node.payload.diagramKind]);
        return;
      }
      if (node.kind === "design-model" && node.payload?.designDiagramKind) {
        void session.generateDesignDiagrams([node.payload.designDiagramKind]);
        return;
      }
      if (node.kind === "code") {
        void session.generateCodePrototype(node.status === "error" ? "regenerate" : "continue");
        return;
      }
      if (node.payload?.documentKind === "requirementsSpec") {
        void session.generateRequirementsSpec();
      }
      if (node.payload?.documentKind === "softwareDesignSpec") {
        void session.generateSoftwareDesignSpec();
      }
      if (node.payload?.documentKind === "feasibilityStudy") {
        void session.generateFeasibilityStudy();
      }
    },
    [handleViewArtifact, session],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0"
        style={{
          width: "min(1580px, calc(100vw - 4rem))",
          maxWidth: "min(1580px, calc(100vw - 4rem))",
          height: "min(920px, calc(100vh - 4rem))",
        }}
        overlayClassName="bg-black/35"
      >
        <DialogHeader className="border-b px-5 py-4 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <GitBranch className="size-5 text-primary" />
                {t("lineage.title")}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {t("lineage.description")}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Search className="size-3" />
                {t("lineage.nodes", { count: graph.summary.total })}
              </Badge>
              <Badge variant="warning">{t("lineage.summaryStale", { count: graph.summary.stale })}</Badge>
              <Badge variant="destructive">{t("lineage.summaryError", { count: graph.summary.error })}</Badge>
              <Badge variant="warning">{t("lineage.summaryInterrupted", { count: graph.summary.interrupted })}</Badge>
              <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label={t("lineage.close")}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <LineageCanvas
            graph={graph}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            filter={filter}
            onFilterChange={setFilter}
            onPrimaryAction={handlePrimaryAction}
          />
          <LineageDetailPanel
            graph={graph}
            selectedNode={selectedNode}
            onPrimaryAction={handlePrimaryAction}
            onViewArtifact={handleViewArtifact}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
