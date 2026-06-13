// Owns project run history filtering, actions, snapshot restore, and export flows.
import { useEffect, useMemo, useState } from "react";
import { Download, RotateCw, Trash2 } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { downloadBlobFile, downloadTextFile } from "../../../shared/lib/download";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import {
  buildRunMarkdownReport,
  isDocumentRunSnapshot,
} from "../../../entities/run-history";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  formatDateTime,
  getProjectRunDisplayTime,
  getProjectRunKind,
  getProjectRunModelLabel,
  getProjectRunOperatorLabel,
  getProjectRunOperatorSearchText,
  getProjectRunStageLabel,
  getProjectRunStatusClasses,
  getProjectRunStatusLabel,
} from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformProjectMember,
  type PlatformRunSummary,
} from "../services/platform-api";

export function ProjectHistory({
  projectId,
  initialRuns,
  members,
  layout = "page",
}: {
  projectId: string;
  initialRuns: PlatformRunSummary[];
  members: PlatformProjectMember[];
  layout?: "page" | "drawer";
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [selectedErrorRunId, setSelectedErrorRunId] = useState("");
  const {
    historyItems,
    restoreRunHistory,
    deleteRunHistory,
  } = useWorkspaceSession();
  const repository = useWorkspaceRepository();

  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  const cancelRun = async (runId: string) => {
    setMessage("");
    setError("");
    try {
      const response = await platformApi.cancelProjectRun(projectId, runId);
      const nextRun =
        response.run ??
        ({
          runId: response.runId ?? runId,
          status: response.status ?? "cancelled",
        } satisfies PlatformRunSummary);
      setRuns((current) =>
        current.map((run) =>
          run.runId === runId ? { ...run, ...nextRun } : run,
        ),
      );
      setMessage("任务已取消。");
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : "取消运行失败。",
      );
    }
  };

  const runAction = async (
    runId: string,
    action: "retry" | "rerun",
  ) => {
    setMessage("");
    setError("");
    try {
      const response =
        action === "retry"
          ? await platformApi.retryProjectRun(projectId, runId)
          : await platformApi.rerunProjectRun(projectId, runId);
      const nextRun =
        response.run ??
        ({
          runId: response.runId ?? runId,
          status: response.status ?? "queued",
        } satisfies PlatformRunSummary);
      if (nextRun.runId !== runId) {
        setRuns((current) => [nextRun, ...current]);
      } else {
        setRuns((current) =>
          current.map((run) =>
            run.runId === runId ? { ...run, ...nextRun } : run,
          ),
        );
      }
      setMessage("已重新排队，稍后启动。");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : action === "retry"
            ? "重试运行失败。"
            : "重新运行失败。",
      );
    }
  };

  const restoreSnapshot = async (runId: string) => {
    setMessage("");
    setError("");
    try {
      await restoreRunHistory(runId);
      setMessage("已恢复工作台快照。");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "恢复工作台快照失败。",
      );
    }
  };

  const exportRunReport = async (run: PlatformRunSummary) => {
    const runId = run.runId;
    const historyItem = historyItems.find((item) => item.id === runId);
    let snapshot = historyItem?.snapshot;
    if (!snapshot) {
      try {
        const detail = await platformApi.getProjectRun(projectId, runId);
        snapshot = detail.snapshot;
      } catch (reportError) {
        setError(
          reportError instanceof Error
            ? reportError.message
            : "读取运行快照失败。",
        );
        return;
      }
    }
    if (!snapshot) {
      setError("该运行暂未保存可导出的快照。");
      return;
    }
    downloadTextFile(
      `运行报告-${getProjectRunStageLabel(run)}.md`,
      buildRunMarkdownReport(snapshot),
      "text/markdown",
    );
    setMessage("已导出 Markdown 报告。");
  };

  const downloadDocumentRun = async (runId: string) => {
    const historyItem = historyItems.find((item) => item.id === runId);
    if (!repository.downloadDocumentRun) {
      setError("当前仓储不支持重新下载说明书。");
      return;
    }
    try {
      const downloaded = await repository.downloadDocumentRun(
        runId,
        historyItem?.snapshot && isDocumentRunSnapshot(historyItem.snapshot)
          ? historyItem.snapshot.fileName ?? undefined
          : undefined,
      );
      downloadBlobFile(downloaded.fileName, downloaded.blob);
      setMessage(`已重新下载 ${downloaded.fileName}。`);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "重新下载说明书失败。",
      );
    }
  };

  const deleteRun = async (runId: string) => {
    setMessage("");
    setError("");
    try {
      await platformApi.deleteProjectRun(projectId, runId);
      await deleteRunHistory(runId).catch(() => []);
      setRuns((current) => current.filter((run) => run.runId !== runId));
      setMessage("已删除运行记录。");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "删除运行历史失败。",
      );
    }
  };

  const stages = useMemo(
    () => Array.from(new Set(runs.map((run) => run.stage).filter(Boolean))) as string[],
    [runs],
  );
  const statuses = useMemo(
    () => Array.from(new Set(runs.map((run) => run.status).filter(Boolean))),
    [runs],
  );
  const models = useMemo(
    () => Array.from(new Set(runs.map((run) => run.model).filter(Boolean))) as string[],
    [runs],
  );
  const filteredRuns = runs.filter((run) => {
    if (
      stageFilter !== "all" &&
      run.stage !== stageFilter &&
      getProjectRunKind(run) !== stageFilter
    ) {
      return false;
    }
    if (statusFilter !== "all" && run.status !== statusFilter) return false;
    if (modelFilter !== "all" && run.model !== modelFilter) return false;
    if (
      operatorFilter.trim() &&
      !getProjectRunOperatorSearchText(run, members).includes(operatorFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (timeFilter.trim()) {
      const timeText = [run.startedAt, run.completedAt, run.updatedAt].filter(Boolean).join(" ");
      if (!timeText.includes(timeFilter.trim())) return false;
    }
    return true;
  });

  const renderRunActions = ({
    run,
    hasSnapshot,
    hasDocumentSnapshot,
    size,
    withIcons = false,
  }: {
    run: PlatformRunSummary;
    hasSnapshot: boolean;
    hasDocumentSnapshot: boolean | undefined;
    size?: "sm";
    withIcons?: boolean;
  }) => {
    const running = run.status === "running" || run.status === "queued";
    const retryable =
      run.status === "failed" ||
      run.status === "cancelled" ||
      run.status === "interrupted";
    const canUseSnapshot = (hasSnapshot || run.canRestore) && !running;
    const canDownloadDocument =
      (Boolean(hasDocumentSnapshot) || Boolean(run.documentDownloadAvailable)) && !running;
    const canRerun = !running;
    const canDelete = !running;
    const buttonSizeProps = size ? { size } : {};

    return (
      <div className="flex flex-wrap gap-2">
        {running && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void cancelRun(run.runId)}
          >
            取消任务
          </Button>
        )}
        {!running && run.errorMessage && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => setSelectedErrorRunId(run.runId)}
          >
            查看错误
          </Button>
        )}
        {!running && retryable && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "retry")}
          >
            重试
          </Button>
        )}
        {canRerun && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "rerun")}
          >
            重新运行
          </Button>
        )}
        {canUseSnapshot && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void restoreSnapshot(run.runId)}
          >
            {withIcons && <RotateCw className="size-3.5" />}
            恢复快照
          </Button>
        )}
        {canUseSnapshot && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void exportRunReport(run)}
          >
            {withIcons && <Download className="size-3.5" />}
            导出报告
          </Button>
        )}
        {canDownloadDocument && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void downloadDocumentRun(run.runId)}
          >
            {withIcons && <Download className="size-3.5" />}
            重新下载
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            className="text-destructive hover:text-destructive"
            onClick={() => void deleteRun(run.runId)}
          >
            {withIcons && <Trash2 className="size-3.5" />}
            删除记录
          </Button>
        )}
      </div>
    );
  };
  const selectedErrorRun = runs.find((run) => run.runId === selectedErrorRunId);

  const sectionClass = layout === "drawer" ? "p-4" : "";
  const filterClass = layout === "drawer" ? "mb-4 grid gap-2" : "mb-4 grid gap-3 md:grid-cols-5";
  const listClass =
    layout === "drawer" ? "grid gap-3" : "overflow-hidden rounded-md border border-border";

  if (layout === "drawer") {
    const runningCount = runs.filter((run) => run.status === "running" || run.status === "queued").length;
    const failedCount = runs.filter((run) => run.status === "failed").length;
    const latestRun = [...runs].sort((a, b) =>
      String(getProjectRunDisplayTime(b) ?? "").localeCompare(
        String(getProjectRunDisplayTime(a) ?? ""),
      ),
    )[0];
    const stageChips: Array<[string, string]> = [
      ["all", "全部"],
      ["requirements", "需求分析"],
      ["design", "模型生成"],
      ["code", "代码构建"],
      ["document", "说明书"],
    ];

    return (
      <div className="grid min-h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            ["总计", runs.length],
            ["运行中", runningCount],
            ["失败", failedCount],
            ["最近", latestRun ? formatDateTime(getProjectRunDisplayTime(latestRun) ?? "") : "暂无"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/60 bg-muted/60 px-2.5 py-2 shadow-sm">
              <div className="truncate font-mono text-[11px] leading-4 text-muted-foreground">{label}</div>
              <div className="truncate text-sm font-semibold leading-5">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3">
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {stageChips.map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={stageFilter === value ? "secondary" : "ghost"}
                size="sm"
                className="h-8 shrink-0 rounded-md px-3 text-xs"
                onClick={() => setStageFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectControl
              aria-label="筛选状态"
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="h-9 text-xs"
              options={[
                { value: "all", label: "全部状态" },
                ...statuses.map((status) => ({
                  value: status,
                  label: getProjectRunStatusLabel(status),
                })),
              ]}
            />
            <SelectControl
              aria-label="筛选模型"
              value={modelFilter}
              onValueChange={setModelFilter}
              className="h-9 text-xs"
              options={[
                { value: "all", label: "全部模型" },
                ...models.map((model) => ({
                  value: model,
                  label: model,
                })),
              ]}
            />
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-3">
            {filteredRuns.map((run, index) => {
              const historyItem = historyItems.find((item) => item.id === run.runId);
              const hasSnapshot = Boolean(historyItem) || Boolean(run.snapshotAvailable);
              const hasDocumentSnapshot =
                Boolean(run.documentDownloadAvailable) ||
                Boolean(historyItem?.snapshot && isDocumentRunSnapshot(historyItem.snapshot));
              const running = run.status === "running" || run.status === "queued";
              const stageLabel = getProjectRunStageLabel(run);
              const statusLabel = getProjectRunStatusLabel(run.status);
              const displayTime = getProjectRunDisplayTime(run);
              const operatorLabel = getProjectRunOperatorLabel(run, members);
              const statusClasses = getProjectRunStatusClasses(run.status);
              return (
                <div
                  key={run.runId}
                  className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm"
                >
                  <div className={`h-1 ${statusClasses.bar}`} />
                  <div className="grid gap-3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={statusClasses.badge}
                          >
                            {statusLabel}
                          </Badge>
                          <span className="truncate text-sm font-medium">{stageLabel}</span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] leading-4 text-muted-foreground">
                        {displayTime ? formatDateTime(displayTime) : "暂无时间"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>模型 {getProjectRunModelLabel(run)}</span>
                      <span>操作者 {operatorLabel}</span>
                    </div>
                    {running && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-2/3 rounded-full bg-primary" />
                      </div>
                    )}
                    {index === 0 && (
                      <div className="rounded-md border border-border/70 bg-muted/50 p-3 text-xs text-muted-foreground">
                        <div>阶段：{stageLabel}</div>
                        <div>更新时间：{displayTime ? formatDateTime(displayTime) : "暂无时间"}</div>
                      </div>
                    )}
                    {run.errorMessage && selectedErrorRunId === run.runId && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                        {run.errorMessage}
                      </div>
                    )}
                    {renderRunActions({
                      run,
                      hasSnapshot,
                      hasDocumentSnapshot,
                      size: "sm",
                    })}
                  </div>
                </div>
              );
            })}
            {runs.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">暂无运行历史。</div>
            )}
            {runs.length > 0 && filteredRuns.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">没有匹配的运行历史。</div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between gap-2 border-t border-border/60 bg-card/90 px-6 py-4 backdrop-blur-md">
          <Button type="button" variant="outline" size="sm" onClick={() => setMessage("运行历史已是最新。")}>
            <RotateCw className="size-4" />
            刷新历史
          </Button>
          <Button type="button" size="sm" onClick={() => setMessage("批量导出会逐条导出可用报告。")}>
            <Download className="size-4" />
            批量导出
          </Button>
        </div>
        {(message || error) && (
          <div className="rounded-md border border-border bg-muted p-3 text-sm">
            {message || error}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className={`rounded-md border border-border bg-card p-5 ${sectionClass}`}>
      <div className={filterClass}>
        <SelectControl
          aria-label="筛选阶段"
          value={stageFilter}
          onValueChange={setStageFilter}
          className="h-9"
          options={[
            { value: "all", label: "全部阶段" },
            ...stages.map((stage) => ({
              value: stage,
              label: stage,
            })),
          ]}
        />
        <SelectControl
          aria-label="筛选状态"
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="h-9"
          options={[
            { value: "all", label: "全部状态" },
            ...statuses.map((status) => ({
              value: status,
              label: getProjectRunStatusLabel(status),
            })),
          ]}
        />
        <SelectControl
          aria-label="筛选模型"
          value={modelFilter}
          onValueChange={setModelFilter}
          className="h-9"
          options={[
            { value: "all", label: "全部模型" },
            ...models.map((model) => ({
              value: model,
              label: model,
            })),
          ]}
        />
        <Input
          placeholder="操作者"
          aria-label="筛选操作者"
          value={operatorFilter}
          onChange={(event) => setOperatorFilter(event.target.value)}
        />
        <Input
          placeholder="时间"
          aria-label="筛选时间"
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
        />
      </div>
      <div className={listClass}>
        {filteredRuns.map((run) => {
          const historyItem = historyItems.find((item) => item.id === run.runId);
          const hasSnapshot = Boolean(historyItem) || Boolean(run.snapshotAvailable);
          const hasDocumentSnapshot =
            Boolean(run.documentDownloadAvailable) ||
            Boolean(historyItem?.snapshot && isDocumentRunSnapshot(historyItem.snapshot));
          const stageLabel = getProjectRunStageLabel(run);
          const statusLabel = getProjectRunStatusLabel(run.status);
          const statusClasses = getProjectRunStatusClasses(run.status);
          return (
            <div key={run.runId} className="grid gap-2 border-b border-border p-4 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr_1fr_auto]">
              <div className="contents">
                <span className="text-sm font-medium">{stageLabel}</span>
                <span className="text-sm text-muted-foreground">{getProjectRunOperatorLabel(run, members)}</span>
                <Badge variant="outline" className={statusClasses.badge}>{statusLabel}</Badge>
                <span className="text-sm text-muted-foreground">
                  {getProjectRunModelLabel(run)}
                </span>
              </div>
              {renderRunActions({
                run,
                hasSnapshot,
                hasDocumentSnapshot,
                withIcons: true,
              })}
            </div>
          );
        })}
        {runs.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">暂无运行历史。</div>
        )}
        {runs.length > 0 && filteredRuns.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">没有匹配的运行历史。</div>
        )}
      </div>
      {selectedErrorRun && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {selectedErrorRun.errorMessage ?? "该运行没有错误详情。"}
        </div>
      )}
      {(message || error) && (
        <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
          {message || error}
        </div>
      )}
    </section>
  );
}
