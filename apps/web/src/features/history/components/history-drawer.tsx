import { Download, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { downloadBlobFile } from "../../../shared/lib/download";
import { localizeApiFailure } from "../../../shared/i18n/api-errors";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  getRunHistorySnapshotLabel,
  getRunHistorySnapshotSummary,
  isDocumentRunSnapshot,
} from "../index";

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

function getHistoryStatusPresentation(status: string | null | undefined, t: TFunction) {
  if (status === "completed") {
    return { label: t("generation.status.completed"), variant: "secondary" as const };
  }
  if (status === "interrupted") {
    return { label: t("generation.status.interrupted"), variant: "warning" as const };
  }
  if (status === "queued") {
    return { label: t("generation.status.queued"), variant: "outline" as const };
  }
  if (status === "running") {
    return { label: t("generation.status.running"), variant: "outline" as const };
  }
  if (status === "cancelled") {
    return { label: t("generation.status.cancelled"), variant: "outline" as const };
  }
  if (status === "failed") {
    return { label: t("generation.status.failed"), variant: "destructive" as const };
  }
  return { label: status ?? "unknown", variant: "outline" as const };
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function localizeHistoryFailure(error: unknown) {
  const status = error && typeof error === "object" && "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : 500;
  return localizeApiFailure(error, status);
}

function getRestoreDisabledReason(item: {
  snapshot?: unknown;
  status?: string | null;
  canRestore?: boolean | null;
  snapshotAvailable?: boolean | null;
}, t: TFunction) {
  const status = getHistoryItemStatus(item);
  if (typeof item.snapshot === "object" && item.snapshot && "documentKind" in item.snapshot) {
    return t("historyDrawer.documentCannotRestore");
  }
  if (status === "queued" || status === "running") {
    return t("historyDrawer.runningCannotRestore");
  }
  if (status === "interrupted") {
    return t("historyDrawer.interruptedCannotRestore");
  }
  if (item.canRestore === false) {
    return t("historyDrawer.cannotRestore");
  }
  if (!item.snapshot && !item.snapshotAvailable && !item.canRestore) {
    return t("historyDrawer.noRestorableSnapshot");
  }
  return t("historyDrawer.workspaceReadOnly");
}

export function HistoryDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  const {
    historyItems,
    refreshHistory,
    deleteRunHistory,
    clearRunHistory,
  } = useWorkspaceSession();
  const repository = useWorkspaceRepository();
  const [deletingHistoryIds, setDeletingHistoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [clearingHistory, setClearingHistory] = useState(false);

  useEffect(() => {
    if (!open) return;
    void refreshHistory().catch((error) => {
      toast.error(localizeHistoryFailure(error));
    });
  }, [open, refreshHistory, t]);

  if (!open) return null;

  const deleteHistoryItem = async (id: string) => {
    setDeletingHistoryIds((current) => new Set(current).add(id));
    try {
      await deleteRunHistory(id);
      toast.success(t("historyDrawer.deleted"));
    } catch (error) {
      toast.error(localizeHistoryFailure(error));
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
      toast.success(t("historyDrawer.cleared"));
    } catch (error) {
      toast.error(localizeHistoryFailure(error));
    } finally {
      setClearingHistory(false);
    }
  };

  const downloadDocument = async (id: string, defaultFileName?: string | null) => {
    if (!repository.downloadDocumentRun) {
      toast.error(t("historyDrawer.downloadUnsupported"));
      return;
    }
    try {
      const downloaded = await repository.downloadDocumentRun(
        id,
        defaultFileName ?? undefined,
      );
      downloadBlobFile(downloaded.fileName, downloaded.blob);
      toast.success(t("historyDrawer.downloaded"));
    } catch (error) {
      toast.error(localizeHistoryFailure(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/45 backdrop-blur-[1px]">
      <button
        type="button"
        aria-label={t("historyDrawer.closeOverlay")}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-[min(460px,92vw)] flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-medium">{t("historyDrawer.title")}</span>
          <Badge variant="secondary" className="font-mono">
            {historyItems.length}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8"
            title={t("historyDrawer.close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {historyItems.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              {t("historyDrawer.empty")}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {historyItems.map((item) => {
                const status = getHistoryItemStatus(item);
                const succeeded = status === "completed";
                const statusPresentation = getHistoryStatusPresentation(status, t);
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
                  : item.stageLabel ?? t("historyDrawer.runStage");
                const snapshotSummary = displaySnapshot
                  ? getRunHistorySnapshotSummary(displaySnapshot)
                  : item.summary ?? (item.snapshotAvailable ? t("historyDrawer.restorable") : t("historyDrawer.noSnapshot"));
                const errorMessage = item.snapshot?.error || item.errorMessage
                  ? localizeApiFailure(item.snapshot?.error ? { error: item.snapshot.error } : null, 500)
                  : null;
                const restoreDisabledReason = getRestoreDisabledReason(item, t);
                const isDocumentHistory =
                  item.documentKind === "requirementsSpec" ||
                  item.documentKind === "softwareDesignSpec" ||
                  item.documentKind === "feasibilityStudy" ||
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
                          <span>{formatDate(item.createdAt, locale)}</span>
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
                            {t("historyDrawer.documentDeleted")}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {documentCanDownload && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title={t("historyDrawer.redownload")}
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
                          title={t("historyDrawer.delete")}
                          aria-label={t("historyDrawer.deleteAria", { title: item.title })}
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
              <Trash2 className="size-3.5" /> {t("historyDrawer.clear")}
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
