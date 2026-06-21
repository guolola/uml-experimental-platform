import { Download, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { downloadBlobFile } from "../../../shared/lib/download";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  getRunHistorySnapshotLabel,
  getRunHistorySnapshotSummary,
  isDocumentRunSnapshot,
} from "../index";

const DOCUMENT_RESTORE_DISABLED_REASON = "说明书快照不能恢复为项目工作台";
const INTERRUPTED_RESTORE_DISABLED_REASON =
  "服务中断的运行不能直接恢复，请从项目历史重试或重新运行";

function getHistoryItemStatus(item: {
  snapshot?: unknown;
  status?: string | null;
}) {
  if (
    typeof item.snapshot === "object" &&
    item.snapshot &&
    "status" in item.snapshot
  ) {
    return String((item.snapshot as { status?: string | null }).status ?? "unknown");
  }
  return item.status ?? "unknown";
}

function getHistoryStatusPresentation(status: string | null | undefined) {
  if (status === "completed") {
    return { label: "已完成", variant: "secondary" as const };
  }
  if (status === "interrupted") {
    return { label: "服务中断，可重试", variant: "warning" as const };
  }
  if (status === "queued") {
    return { label: "排队中", variant: "outline" as const };
  }
  if (status === "running") {
    return { label: "运行中", variant: "outline" as const };
  }
  if (status === "cancelled") {
    return { label: "已取消", variant: "outline" as const };
  }
  if (status === "failed") {
    return { label: "失败", variant: "destructive" as const };
  }
  return { label: status ?? "unknown", variant: "outline" as const };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRestoreDisabledReason(item: {
  snapshot?: unknown;
  status?: string | null;
  canRestore?: boolean | null;
  snapshotAvailable?: boolean | null;
}) {
  const status = getHistoryItemStatus(item);
  if (typeof item.snapshot === "object" && item.snapshot && "documentKind" in item.snapshot) {
    return DOCUMENT_RESTORE_DISABLED_REASON;
  }
  if (status === "queued" || status === "running") {
    return "运行仍在进行，完成后才能恢复";
  }
  if (status === "interrupted") {
    return INTERRUPTED_RESTORE_DISABLED_REASON;
  }
  if (item.canRestore === false) {
    return "该运行暂不可恢复";
  }
  if (!item.snapshot && !item.snapshotAvailable && !item.canRestore) {
    return "没有可恢复快照";
  }
  return null;
}

export function HistoryDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    historyItems,
    refreshHistory,
    restoreRunHistory,
    deleteRunHistory,
    clearRunHistory,
  } = useWorkspaceSession();
  const repository = useWorkspaceRepository();
  const [deletingHistoryIds, setDeletingHistoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [restoringHistoryIds, setRestoringHistoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [clearingHistory, setClearingHistory] = useState(false);

  useEffect(() => {
    if (!open) return;
    void refreshHistory().catch((error) => {
      toast.error(error instanceof Error ? error.message : "历史快照刷新失败");
    });
  }, [open, refreshHistory]);

  if (!open) return null;

  const restore = async (id: string) => {
    setRestoringHistoryIds((current) => new Set(current).add(id));
    try {
      await restoreRunHistory(id);
      toast.success("已恢复历史快照");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `恢复历史快照失败：${error.message}`
          : "恢复历史快照失败",
      );
      try {
        await refreshHistory();
      } catch {
        // The restore error above is the actionable user-facing failure.
      }
    } finally {
      setRestoringHistoryIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const deleteHistoryItem = async (id: string) => {
    setDeletingHistoryIds((current) => new Set(current).add(id));
    try {
      await deleteRunHistory(id);
      toast.success("已删除历史记录");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `删除历史记录失败：${error.message}`
          : "删除历史记录失败",
      );
    } finally {
      setDeletingHistoryIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const clearHistory = async () => {
    setClearingHistory(true);
    try {
      await clearRunHistory();
      toast.success("已清空历史");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `清空历史失败：${error.message}`
          : "清空历史失败",
      );
    } finally {
      setClearingHistory(false);
    }
  };

  const downloadDocument = async (id: string, defaultFileName?: string | null) => {
    if (!repository.downloadDocumentRun) {
      toast.error("当前仓储不支持重新下载说明书");
      return;
    }
    try {
      const downloaded = await repository.downloadDocumentRun(
        id,
        defaultFileName ?? undefined,
      );
      downloadBlobFile(downloaded.fileName, downloaded.blob);
      toast.success("已重新下载说明书");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `重新下载失败：${error.message}`
          : "重新下载失败",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/45 backdrop-blur-[1px]">
      <button
        type="button"
        aria-label="关闭历史抽屉遮罩"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-[min(460px,92vw)] flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-medium">历史快照</span>
          <Badge variant="secondary" className="font-mono">
            {historyItems.length}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8"
            title="关闭"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {historyItems.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              暂无历史快照。完成一次生成后会自动保存。
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {historyItems.map((item) => {
                const status = getHistoryItemStatus(item);
                const succeeded = status === "completed";
                const statusPresentation = getHistoryStatusPresentation(status);
                const displaySnapshot =
                  item.snapshot &&
                  isDocumentRunSnapshot(item.snapshot) &&
                  item.documentFileName
                    ? {
                        ...item.snapshot,
                        fileName: item.documentFileName,
                        byteLength:
                          item.documentByteLength ?? item.snapshot.byteLength,
                      }
                    : item.snapshot;
                const stageLabel = displaySnapshot
                  ? getRunHistorySnapshotLabel(displaySnapshot)
                  : item.stageLabel ?? "运行阶段";
                const snapshotSummary = displaySnapshot
                  ? getRunHistorySnapshotSummary(displaySnapshot)
                  : item.summary ?? (item.snapshotAvailable ? "快照可恢复" : "无快照");
                const errorMessage = item.snapshot?.error?.message ?? item.errorMessage;
                const restoreDisabledReason = getRestoreDisabledReason(item);
                const hideRestoreButton =
                  restoreDisabledReason === DOCUMENT_RESTORE_DISABLED_REASON;
                const restoring = restoringHistoryIds.has(item.id);
                const isDocumentHistory =
                  item.documentKind === "requirementsSpec" ||
                  item.documentKind === "softwareDesignSpec" ||
                  Boolean(item.snapshot && isDocumentRunSnapshot(item.snapshot));
                const documentDeleted = item.documentStatus === "deleted";
                const documentCanDownload =
                  succeeded &&
                  item.documentDownloadAvailable !== false &&
                  (Boolean(item.documentDownloadAvailable) ||
                    Boolean(item.snapshot && isDocumentRunSnapshot(item.snapshot)));
                return (
                  <article
                    key={item.id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {item.title}
                          </span>
                          <Badge
                            variant={statusPresentation.variant}
                            className="shrink-0 font-mono"
                          >
                            {statusPresentation.label}
                          </Badge>
                          <Badge variant="outline" className="shrink-0">
                            {stageLabel}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatDate(item.createdAt)}</span>
                          <span>{item.providerModel}</span>
                          {item.durationMs !== undefined && (
                            <span>{Math.round(item.durationMs / 1000)}s</span>
                          )}
                          <span>{snapshotSummary}</span>
                        </div>
                        {errorMessage && (
                          <div className="mt-2 text-xs text-destructive">
                            {errorMessage}
                          </div>
                        )}
                        {restoreDisabledReason && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {restoreDisabledReason}
                          </div>
                        )}
                        {isDocumentHistory && documentDeleted && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            说明书已在文档中心删除，恢复后可重新下载。
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!hideRestoreButton && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="恢复"
                            aria-label={`恢复历史快照：${item.title}`}
                            disabled={Boolean(restoreDisabledReason) || restoring}
                            onClick={() => void restore(item.id)}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        )}
                        {documentCanDownload && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="重新下载 DOCX"
                            onClick={() =>
                              void downloadDocument(
                                item.id,
                                item.documentFileName ??
                                  (item.snapshot && isDocumentRunSnapshot(item.snapshot)
                                  ? item.snapshot.fileName
                                  : undefined),
                              )
                            }
                          >
                            <Download className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          title="删除"
                          aria-label={`删除历史记录：${item.title}`}
                          disabled={deletingHistoryIds.has(item.id)}
                          onClick={() => void deleteHistoryItem(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {historyItems.length > 0 && (
          <div className="border-t border-border p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={clearingHistory}
              onClick={() => void clearHistory()}
            >
              <Trash2 className="size-3.5" /> 清空历史
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
