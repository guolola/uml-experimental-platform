import { Download, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { downloadBlobFile, downloadTextFile } from "../../../shared/lib/download";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  buildRunMarkdownReport,
  getRunHistorySnapshotLabel,
  getRunHistorySnapshotSummary,
  isDocumentRunSnapshot,
} from "../index";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
    restoreRunHistory,
    deleteRunHistory,
    clearRunHistory,
  } = useWorkspaceSession();
  const repository = useWorkspaceRepository();

  if (!open) return null;

  const restore = async (id: string) => {
    await restoreRunHistory(id);
    toast.success("已恢复历史快照");
    onClose();
  };

  const downloadDocument = async (id: string) => {
    if (!repository.downloadDocumentRun) {
      toast.error("当前仓储不支持重新下载说明书");
      return;
    }
    try {
      const downloaded = await repository.downloadDocumentRun(id);
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
                const succeeded = item.snapshot.status === "completed";
                const stageLabel = getRunHistorySnapshotLabel(item.snapshot);
                const snapshotSummary = getRunHistorySnapshotSummary(item.snapshot);
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
                            variant={succeeded ? "secondary" : "destructive"}
                            className="shrink-0 font-mono"
                          >
                            {item.snapshot.status}
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
                        {item.snapshot.errorMessage && (
                          <div className="mt-2 text-xs text-destructive">
                            {item.snapshot.errorMessage}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="恢复"
                          onClick={() => void restore(item.id)}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="导出 Markdown"
                          onClick={() => {
                            downloadTextFile(
                              `${item.id}.md`,
                              buildRunMarkdownReport(item.snapshot),
                              "text/markdown",
                            );
                            toast.success("已导出运行报告");
                          }}
                        >
                          <Download className="size-4" />
                        </Button>
                        {isDocumentRunSnapshot(item.snapshot) && succeeded && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="重新下载 DOCX"
                            onClick={() => void downloadDocument(item.id)}
                          >
                            <Download className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          title="删除"
                          onClick={() => void deleteRunHistory(item.id)}
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
              onClick={() => {
                void clearRunHistory();
                toast.success("已清空历史");
              }}
            >
              <Trash2 className="size-3.5" /> 清空历史
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
