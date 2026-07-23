// Owns project run history filtering, actions, snapshot restore, and document download flows.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Download, RotateCw, Trash2 } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { downloadBlobFile } from "../../../shared/lib/download";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { isDocumentRunSnapshot } from "../../../entities/run-history";
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
import { useAppI18n } from "../../../shared/i18n/i18n-provider";
import { localizeApiFailure } from "../../../shared/i18n/api-errors";

function runActionLabel(action: string | null | undefined, t: TFunction) {
  if (action === "retry") return t("projectShell.historyUi.retry");
  if (action === "rerun") return t("projectShell.historyUi.rerun");
  return t("projectShell.historyUi.derived");
}

function runRelationText(run: PlatformRunSummary, t: TFunction) {
  const parts = [
    run.sourceRunId ? t("projectShell.historyUi.relationSource", { action: runActionLabel(run.sourceAction, t), runId: run.sourceRunId }) : null,
    run.latestActionRunId
      ? t("projectShell.historyUi.relationDerived", { action: runActionLabel(run.latestAction, t), runId: run.latestActionRunId })
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

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
  const { t } = useTranslation();
  const { locale } = useAppI18n();
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
    refreshHistory,
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
      setMessage(t("projectShell.historyUi.cancelled"));
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : t("projectShell.historyUi.cancelFailed"),
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
      const sourceRun = runs.find((run) => run.runId === runId);
      const responseAction = response.action ?? action;
      const nextRun = {
        ...(
          response.run ??
          ({
            runId: response.runId ?? runId,
            status: response.status ?? "queued",
          } satisfies PlatformRunSummary)
        ),
        sourceRunId: response.run?.sourceRunId ?? response.sourceRunId ?? runId,
        sourceAction: response.run?.sourceAction ?? responseAction,
        sourceRunStatus:
          response.run?.sourceRunStatus ?? sourceRun?.status ?? null,
      } satisfies PlatformRunSummary;
      if (nextRun.runId !== runId) {
        setRuns((current) => [
          nextRun,
          ...current.map((run) =>
            run.runId === runId
              ? {
                  ...run,
                  derivedRunIds: [
                    ...(run.derivedRunIds ?? []).filter((id) => id !== nextRun.runId),
                    nextRun.runId,
                  ],
                  latestAction: responseAction,
                  latestActionRunId: nextRun.runId,
                  latestActionAt: nextRun.updatedAt ?? nextRun.startedAt ?? nextRun.createdAt ?? null,
                }
              : run,
          ),
        ]);
      } else {
        setRuns((current) =>
          current.map((run) =>
            run.runId === runId ? { ...run, ...nextRun } : run,
          ),
        );
      }
      setMessage(t("projectShell.historyUi.requeued"));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : action === "retry"
            ? t("projectShell.historyUi.retryFailed")
            : t("projectShell.historyUi.rerunFailed"),
      );
    }
  };

  const restoreSnapshot = async (runId: string) => {
    setMessage("");
    setError("");
    try {
      await restoreRunHistory(runId);
      setMessage(t("projectShell.historyUi.restored"));
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : t("projectShell.historyUi.restoreFailed"),
      );
    }
  };

  const downloadDocumentRun = async (runId: string) => {
    const historyItem = historyItems.find((item) => item.id === runId);
    const run = runs.find((item) => item.runId === runId);
    if (!repository.downloadDocumentRun) {
      setError(t("projectShell.historyUi.downloadUnsupported"));
      return;
    }
    try {
      const downloaded = await repository.downloadDocumentRun(
        runId,
        run?.documentFileName ??
          historyItem?.documentFileName ??
          (historyItem?.snapshot && isDocumentRunSnapshot(historyItem.snapshot)
          ? historyItem.snapshot.fileName ?? undefined
          : undefined),
      );
      downloadBlobFile(downloaded.fileName, downloaded.blob);
      setMessage(t("projectShell.historyUi.downloaded", { file: downloaded.fileName }));
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : t("projectShell.historyUi.downloadFailed"),
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
      setMessage(t("projectShell.historyUi.deleted"));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : t("projectShell.historyUi.deleteFailed"),
      );
    }
  };

  const refreshRuns = async () => {
    setMessage("");
    setError("");
    try {
      const [runResponse] = await Promise.all([
        platformApi.listProjectRuns(projectId),
        refreshHistory().catch(() => undefined),
      ]);
      setRuns(runResponse.runs ?? []);
      setMessage(t("projectShell.historyUi.refreshed"));
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : t("projectShell.historyUi.refreshFailed"),
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
    const documentRun = getProjectRunKind(run) === "document" || Boolean(hasDocumentSnapshot);
    const feasibilityRun = getProjectRunKind(run) === "feasibility";
    const canUseSnapshot =
      !documentRun &&
      !feasibilityRun &&
      (hasSnapshot || run.canRestore) &&
      !running;
    const canDownloadDocument =
      run.status === "completed" &&
      run.documentDownloadAvailable !== false &&
      (Boolean(hasDocumentSnapshot) || Boolean(run.documentDownloadAvailable));
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
            {t("projectShell.historyUi.cancel")}
          </Button>
        )}
        {!running && run.errorMessage && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => setSelectedErrorRunId(run.runId)}
          >
            {t("projectShell.historyUi.viewError")}
          </Button>
        )}
        {!running && retryable && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "retry")}
          >
            {t("projectShell.historyUi.retry")}
          </Button>
        )}
        {canRerun && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "rerun")}
          >
            {t("projectShell.historyUi.rerun")}
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
            {t("projectShell.historyUi.restore")}
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
            {t("projectShell.historyUi.download")}
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
            {t("projectShell.historyUi.delete")}
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
      ["all", t("projectShell.historyUi.all")],
      ["requirements", t("projectShell.historyUi.requirements")],
      ["feasibility", t("projectShell.historyUi.feasibility")],
      ["design", t("projectShell.historyUi.models")],
      ["code", t("projectShell.historyUi.code")],
      ["document", t("projectShell.historyUi.documents")],
    ];

    return (
      <div className="grid min-h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            [t("projectShell.historyUi.total"), runs.length],
            [t("projectShell.historyUi.running"), runningCount],
            [t("projectShell.historyUi.failed"), failedCount],
            [t("projectShell.historyUi.latest"), latestRun ? formatDateTime(getProjectRunDisplayTime(latestRun) ?? "", locale) : t("projectShell.historyUi.none")],
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
              aria-label={t("projectShell.historyUi.statusFilter")}
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="h-9 text-xs"
              options={[
                { value: "all", label: t("projectShell.historyUi.allStatuses") },
                ...statuses.map((status) => ({
                  value: status,
                  label: getProjectRunStatusLabel(status, t),
                })),
              ]}
            />
            <SelectControl
              aria-label={t("projectShell.historyUi.modelFilter")}
              value={modelFilter}
              onValueChange={setModelFilter}
              className="h-9 text-xs"
              options={[
                { value: "all", label: t("projectShell.historyUi.allModels") },
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
              const stageLabel = getProjectRunStageLabel(run, t);
              const statusLabel = getProjectRunStatusLabel(run.status, t);
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
                        {displayTime ? formatDateTime(displayTime, locale) : t("generation.stages.waiting")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>{t("projectShell.historyUi.model", { model: getProjectRunModelLabel(run) })}</span>
                      <span>{t("projectShell.historyUi.operator", { operator: operatorLabel })}</span>
                    </div>
                    {runRelationText(run, t) && (
                      <div className="truncate text-xs text-muted-foreground" title={runRelationText(run, t)}>
                        {runRelationText(run, t)}
                      </div>
                    )}
                    {running && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-2/3 rounded-full bg-primary" />
                      </div>
                    )}
                    {index === 0 && (
                      <div className="rounded-md border border-border/70 bg-muted/50 p-3 text-xs text-muted-foreground">
                        <div>{t("projectShell.historyUi.stage", { stage: stageLabel })}</div>
                        <div>{t("projectShell.historyUi.updated", { time: displayTime ? formatDateTime(displayTime, locale) : t("projectShell.historyUi.noTime") })}</div>
                      </div>
                    )}
                    {run.errorMessage && selectedErrorRunId === run.runId && (
                      <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                        <div>{localizeApiFailure(run.error ? { error: run.error } : null, 500)}</div>
                        <details className="text-muted-foreground">
                          <summary className="cursor-pointer font-medium text-foreground">{t("projectShell.historyUi.technicalDetails")}</summary>
                          <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{run.errorMessage}</pre>
                        </details>
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
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t("projectShell.historyUi.empty")}</div>
            )}
            {runs.length > 0 && filteredRuns.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t("projectShell.historyUi.noMatches")}</div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between gap-2 border-t border-border/60 bg-card/90 px-6 py-4 backdrop-blur-md">
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshRuns()}>
            <RotateCw className="size-4" />
            {t("projectShell.historyUi.refresh")}
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
          aria-label={t("projectShell.historyUi.stageFilter")}
          value={stageFilter}
          onValueChange={setStageFilter}
          className="h-9"
          options={[
            { value: "all", label: t("projectShell.historyUi.allStages") },
            ...stages.map((stage) => ({
              value: stage,
              label: stage,
            })),
          ]}
        />
        <SelectControl
          aria-label={t("projectShell.historyUi.statusFilter")}
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="h-9"
          options={[
            { value: "all", label: t("projectShell.historyUi.allStatuses") },
            ...statuses.map((status) => ({
              value: status,
              label: getProjectRunStatusLabel(status, t),
            })),
          ]}
        />
        <SelectControl
          aria-label={t("projectShell.historyUi.modelFilter")}
          value={modelFilter}
          onValueChange={setModelFilter}
          className="h-9"
          options={[
            { value: "all", label: t("projectShell.historyUi.allModels") },
            ...models.map((model) => ({
              value: model,
              label: model,
            })),
          ]}
        />
        <Input
          placeholder={t("projectShell.historyUi.operatorPlaceholder")}
          aria-label={t("projectShell.historyUi.operatorFilter")}
          value={operatorFilter}
          onChange={(event) => setOperatorFilter(event.target.value)}
        />
        <Input
          placeholder={t("projectShell.historyUi.timePlaceholder")}
          aria-label={t("projectShell.historyUi.timeFilter")}
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
          const stageLabel = getProjectRunStageLabel(run, t);
          const statusLabel = getProjectRunStatusLabel(run.status, t);
          const statusClasses = getProjectRunStatusClasses(run.status);
          return (
            <div key={run.runId} className="grid gap-2 border-b border-border p-4 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr_1fr_auto]">
              <div className="contents">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{stageLabel}</span>
                  {runRelationText(run, t) && (
                    <span className="block truncate text-xs text-muted-foreground" title={runRelationText(run, t)}>
                      {runRelationText(run, t)}
                    </span>
                  )}
                </span>
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
          <div className="p-4 text-sm text-muted-foreground">{t("projectShell.historyUi.empty")}</div>
        )}
        {runs.length > 0 && filteredRuns.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">{t("projectShell.historyUi.noMatches")}</div>
        )}
      </div>
      {selectedErrorRun && (
        <div className="mt-4 grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div>{selectedErrorRun.error || selectedErrorRun.errorMessage
            ? localizeApiFailure(selectedErrorRun.error ? { error: selectedErrorRun.error } : null, 500)
            : t("errors.http.unknown")}</div>
          {selectedErrorRun.errorMessage ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">{t("projectShell.historyUi.technicalDetails")}</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{selectedErrorRun.errorMessage}</pre>
            </details>
          ) : null}
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
