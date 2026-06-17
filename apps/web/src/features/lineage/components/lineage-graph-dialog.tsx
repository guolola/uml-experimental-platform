// Presents the full project generation lineage as a fixed-column dependency map.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
};

type LineageFilter = "all" | "stale" | "error" | "impact";

type LineageAnchor = {
  left: number;
  right: number;
  centerY: number;
};

const EDGE_SOURCE_OFFSET = 12;
const EDGE_TARGET_OFFSET = 22;

const STATUS_LABELS: Record<LineageNodeStatus, string> = {
  "not-generated": "未生成",
  current: "最新",
  stale: "需更新",
  error: "错误",
  running: "生成中",
};

const STATUS_BADGE_CLASS: Record<LineageNodeStatus, string> = {
  "not-generated": "border-slate-200 bg-slate-50 text-slate-600",
  current: "border-emerald-200 bg-emerald-50 text-emerald-700",
  stale: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
  running: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

const FILTERS: Array<{ value: LineageFilter; label: string }> = [
  { value: "all", label: "全部链路" },
  { value: "stale", label: "需更新" },
  { value: "error", label: "错误" },
  { value: "impact", label: "影响路径" },
];

function edgeColor(status: string) {
  if (status === "stale") return "var(--warning)";
  if (status === "error") return "var(--destructive)";
  return "var(--border)";
}

function selectedEdgeColor(status: string) {
  if (status === "error") return "var(--destructive)";
  if (status === "stale") return "var(--warning)";
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
        <p className="mt-2 text-sm text-muted-foreground">暂无关联节点。</p>
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
  if (!selectedNode) {
    return (
      <aside className="w-full border-l bg-card p-5">
        <h3 className="text-base font-semibold">节点详情</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          选择一个节点后查看上下游来源、影响范围和建议操作。
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
                {selectedNode.stageLabel} · {LINEAGE_KIND_STYLES[selectedNode.kind].label}
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
            {STATUS_LABELS[selectedNode.status]}
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
            disabled={selectedNode.status !== "current"}
            onClick={() => onViewArtifact(selectedNode)}
          >
            查看产物
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground">状态原因</h4>
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm leading-6">
            {selectedNode.reason}
          </p>
        </section>
        <DetailList title="上游来源" ids={selectedNode.upstreamIds} graph={graph} />
        <DetailList title="下游影响" ids={selectedNode.downstreamIds} graph={graph} />
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground">建议操作</h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {selectedNode.status === "stale"
              ? "优先更新此节点，再检查下游节点是否恢复可生成。"
              : selectedNode.status === "error"
                ? "查看生成任务中的执行详情，确认失败原因后重试此阶段。"
                : selectedNode.status === "not-generated"
                  ? "从上游满足条件的节点开始生成，逐步推进链路。"
                  : selectedNode.status === "running"
                    ? "保持在当前链路视图或打开生成任务查看实时日志。"
                    : "当前节点可作为下游生成输入。"}
          </p>
        </section>
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground">最近生成记录</h4>
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
            <p className="mt-2 text-sm text-muted-foreground">暂无最近生成记录。</p>
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [anchors, setAnchors] = useState<Map<string, LineageAnchor>>(
    () => new Map(),
  );
  const columns = useMemo(() => groupLineageColumns(graph), [graph]);
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
              key={item.value}
              type="button"
              variant={filter === item.value ? "default" : "ghost"}
              size="sm"
              onClick={() => handleFilterClick(item.value)}
            >
              {item.label}
            </Button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          <Button type="button" variant="ghost" size="sm" onClick={resetView}>
            <RotateCcw className="size-4" />
            重置视图
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>最新 {graph.summary.current}</span>
            <span>需更新 {graph.summary.stale}</span>
            <span>错误 {graph.summary.error}</span>
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
                  : edge.status === "stale"
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
                    strokeDasharray={edge.status === "error" ? "6 5" : undefined}
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
                  strokeDasharray={edge.status === "error" ? "6 5" : undefined}
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
}: LineageGraphDialogProps) {
  const session = useWorkspaceSession();
  const workspaceShell = useWorkspaceShell();
  const [filter, setFilter] = useState<LineageFilter>("all");
  const graph = useMemo(() => buildLineageGraph(session), [session]);
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
        workspaceShell.openWorkspacePlaceholder("code", "代码");
      } else if (node.kind === "document") {
        workspaceShell.openDocumentsHome();
      }
      onOpenChange(false);
    },
    [onOpenChange, workspaceShell],
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
                全局链路图
              </DialogTitle>
              <DialogDescription className="mt-1">
                查看需求规则、需求模型、设计模型、代码和文档之间的上下游映射。
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Search className="size-3" />
                {graph.summary.total} 个节点
              </Badge>
              <Badge variant="warning">需更新 {graph.summary.stale}</Badge>
              <Badge variant="destructive">错误 {graph.summary.error}</Badge>
              <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="关闭链路图">
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
