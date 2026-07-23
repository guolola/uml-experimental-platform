// Keeps project workspace state in step with terminal run snapshots when clients disconnect.
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentRunSnapshot,
  FeasibilityRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { RunRecord, RunRecordStore } from "../../runs/records/run-record-store.js";
import {
  isRestorableRunSnapshot,
  restoreRunSnapshotToWorkspaceState,
} from "../projects/workspace-snapshot-restore.js";

type RestorableSnapshot = RunSnapshot | DesignRunSnapshot | CodeRunSnapshot;
type AnySnapshot = RestorableSnapshot | DocumentRunSnapshot | FeasibilityRunSnapshot;

type ProjectWorkspaceSync = (record: RunRecord) => Promise<void>;
type RestorableRunKind = "requirements" | "design" | "code";

function isTerminalEvent(event: RunEvent | undefined) {
  return Boolean(
    event &&
      (event.type === "completed" ||
        event.type === "failed" ||
        event.type === "cancelled"),
  );
}

function snapshotIsRestorable(snapshot: AnySnapshot): snapshot is RestorableSnapshot {
  return isRestorableRunSnapshot(snapshot);
}

function snapshotIsFeasibility(snapshot: AnySnapshot): snapshot is FeasibilityRunSnapshot {
  return "selectedArtifacts" in snapshot;
}

function mergeFeasibilitySnapshot(
  state: Record<string, unknown>,
  snapshot: FeasibilityRunSnapshot,
) {
  const next = { ...state, feasibilityInputs: snapshot.inputs };
  // Partial context is durable even if implementation generation fails; an old
  // implementation remains untouched until a new plan has passed validation.
  if (snapshot.contextModel && snapshot.contextPlantUml && snapshot.contextSvg) {
    Object.assign(next, {
      feasibilityContextModel: snapshot.contextModel,
      feasibilityContextTraceability: snapshot.contextTraceability,
      feasibilityContextPlantUml: snapshot.contextPlantUml.source,
      feasibilityContextSvg: snapshot.contextSvg.svg,
      feasibilityContextFingerprint: snapshot.contextFingerprint,
    });
  }
  if (snapshot.implementationPlan && snapshot.implementationFingerprint) {
    Object.assign(next, {
      feasibilityImplementationPlan: snapshot.implementationPlan,
      feasibilityImplementationFingerprint: snapshot.implementationFingerprint,
    });
  }
  return next;
}

function inferRestorableRunKind(snapshot: RestorableSnapshot): RestorableRunKind {
  if ("files" in snapshot) return "code";
  if ("designModelTraceability" in snapshot) return "design";
  return "requirements";
}

function timestampIsAfter(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime > rightTime;
  }
  return left.localeCompare(right) > 0;
}

function shouldSkipOlderSameKindSnapshot(input: {
  currentSourceRunId: string | null;
  incomingRecord: RunRecord;
  runs?: RunRecordStore;
}) {
  if (!input.runs || !input.currentSourceRunId) return false;
  if (input.currentSourceRunId === input.incomingRecord.snapshot.runId) return false;
  if (snapshotIsFeasibility(input.incomingRecord.snapshot)) {
    const currentSource = input.runs.get(input.currentSourceRunId);
    return Boolean(
      currentSource &&
      snapshotIsFeasibility(currentSource.snapshot) &&
      timestampIsAfter(currentSource.metadata?.createdAt, input.incomingRecord.metadata?.createdAt),
    );
  }
  if (!snapshotIsRestorable(input.incomingRecord.snapshot)) return false;
  const currentSource = input.runs.get(input.currentSourceRunId);
  if (!currentSource || !snapshotIsRestorable(currentSource.snapshot)) return false;
  if (
    inferRestorableRunKind(currentSource.snapshot) !==
    inferRestorableRunKind(input.incomingRecord.snapshot)
  ) {
    return false;
  }
  return timestampIsAfter(
    currentSource.metadata?.createdAt,
    input.incomingRecord.metadata?.createdAt,
  );
}

export function createProjectWorkspaceSync(
  authStore: AuthStore,
  options: { runs?: RunRecordStore } = {},
): ProjectWorkspaceSync {
  return async (record) => {
    const projectId = record.metadata?.projectId;
    const userId = record.metadata?.userId;
    if (
      !projectId ||
      !userId ||
      (!snapshotIsRestorable(record.snapshot) && !snapshotIsFeasibility(record.snapshot))
    ) return;

    let current = await authStore.getProjectWorkspace(projectId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (
        shouldSkipOlderSameKindSnapshot({
          currentSourceRunId: current.sourceRunId,
          incomingRecord: record,
          runs: options.runs,
        })
      ) {
        await authStore.recordAuditLog({
          actorUserId: userId,
          action: "project.workspace.auto-sync",
          targetType: "project",
          targetId: projectId,
          outcome: "success",
          message: `sourceRunId=${record.snapshot.runId}; skipped older terminal snapshot; currentSourceRunId=${current.sourceRunId}`,
        });
        return;
      }
      const state = snapshotIsFeasibility(record.snapshot)
        ? mergeFeasibilitySnapshot(current.state, record.snapshot)
        : restoreRunSnapshotToWorkspaceState({
            currentState: current.state,
            snapshot: record.snapshot,
            mode: "merge",
            replaceRequirementInput:
              inferRestorableRunKind(record.snapshot) === "requirements" &&
              "rules" in record.snapshot &&
              (record.snapshot.rules?.length ?? 0) > 0,
          });
      const result = await authStore.saveProjectWorkspace({
        projectId,
        baseVersion: current.version,
        state,
        updatedByUserId: userId,
        sourceRunId: record.snapshot.runId,
      });
      if (result.ok) {
        await authStore.recordAuditLog({
          actorUserId: userId,
          action: "project.workspace.auto-sync",
          targetType: "project",
          targetId: projectId,
          outcome: "success",
          message: `sourceRunId=${record.snapshot.runId}`,
        });
        return;
      }
      current = result.workspace;
    }

    await authStore.recordAuditLog({
      actorUserId: userId,
      action: "project.workspace.auto-sync",
      targetType: "project",
      targetId: projectId,
      outcome: "failure",
      message: `sourceRunId=${record.snapshot.runId}; version conflict`,
    });
  };
}

export function attachProjectWorkspaceSync(
  record: RunRecord,
  syncProjectWorkspace?: ProjectWorkspaceSync,
) {
  if (!syncProjectWorkspace) return;
  const persist = record.persist;
  let synced = false;
  record.persist = async (nextRecord, event) => {
    await persist?.(nextRecord, event);
    if (!isTerminalEvent(event) || synced) return;
    synced = true;
    try {
      await syncProjectWorkspace(nextRecord);
    } catch (error) {
      console.error("Failed to auto-sync project workspace from run snapshot", error);
    }
  };
}

export type { ProjectWorkspaceSync };
