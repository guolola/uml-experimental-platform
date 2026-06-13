// Derives session UI state from run event stream messages without touching React state.
import type { RunEvent } from "@uml-platform/contracts";

export function shouldRefreshRunSnapshotFromEvent(event: RunEvent) {
  if (
    event.type === "artifact_ready" &&
    (event.artifactKind === "model" ||
      event.artifactKind === "plantuml" ||
      event.artifactKind === "svg")
  ) {
    return Boolean(event.diagramKind || event.modelId);
  }
  return (
    event.type === "stage_progress" &&
    event.subtaskStatus === "failed" &&
    Boolean(event.diagramKind || event.modelId)
  );
}

export function isTerminalRunEvent(event: RunEvent) {
  return (
    event.type === "completed" ||
    event.type === "failed" ||
    event.type === "cancelled"
  );
}

export function statusFromRunEvent(event: RunEvent) {
  if (event.type === "queued") return "queued";
  if (event.type === "failed") return "failed";
  if (event.type === "completed") return "completed";
  if (event.type === "cancelled") return "cancelled";
  return "running";
}

export function runErrorMessage(snapshot?: { error?: { message?: string } | null }) {
  return snapshot?.error?.message ?? null;
}

export function cancelledRunMessage(snapshot?: {
  error?: { message?: string } | null;
}) {
  return runErrorMessage(snapshot) ?? "任务已取消";
}
