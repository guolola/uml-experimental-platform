// Keeps project workspace state in step with terminal run snapshots when clients disconnect.
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { RunRecord } from "../../runs/records/run-record-store.js";
import {
  isRestorableRunSnapshot,
  restoreRunSnapshotToWorkspaceState,
} from "../projects/workspace-snapshot-restore.js";

type RestorableSnapshot = RunSnapshot | DesignRunSnapshot | CodeRunSnapshot;
type AnySnapshot = RestorableSnapshot | DocumentRunSnapshot;

type ProjectWorkspaceSync = (record: RunRecord) => Promise<void>;

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

export function createProjectWorkspaceSync(authStore: AuthStore): ProjectWorkspaceSync {
  return async (record) => {
    const projectId = record.metadata?.projectId;
    const userId = record.metadata?.userId;
    if (!projectId || !userId || !snapshotIsRestorable(record.snapshot)) return;

    let current = await authStore.getProjectWorkspace(projectId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const state = restoreRunSnapshotToWorkspaceState({
        currentState: current.state,
        snapshot: record.snapshot,
        mode: "merge",
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
