// Builds run history summaries and filters from run records without mutating lifecycle state.
import type { RunRecord } from "./run-record-store.js";

export function queryValue(query: unknown, key: string) {
  if (!query || typeof query !== "object" || !(key in query)) return undefined;
  const value = (query as Record<string, unknown>)[key];
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readSnapshotModel(snapshot: RunRecord["snapshot"]) {
  const settings = "providerSettings" in snapshot ? snapshot.providerSettings : undefined;
  if (!settings || typeof settings !== "object" || !("model" in settings)) return undefined;
  const model = (settings as { model?: unknown }).model;
  return typeof model === "string" ? model : undefined;
}

function displayRunStatus(record: RunRecord) {
  if (
    record.terminal &&
    (record.snapshot.status === "running" || record.snapshot.status === "queued")
  ) {
    return "interrupted";
  }
  return record.snapshot.status;
}

function inferRunKind(snapshot: RunRecord["snapshot"]) {
  if ("documentKind" in snapshot) return "document";
  if ("files" in snapshot) return "code";
  if ("designModelTraceability" in snapshot) return "design";
  return "requirements";
}

export function summarizeRunRecord(record: RunRecord) {
  const createdAt = record.metadata?.createdAt ?? new Date().toISOString();
  const status = displayRunStatus(record);
  const stage = record.snapshot.currentStage ?? status;
  const isActive = !record.terminal && (status === "running" || status === "queued");
  const snapshotAvailable = Boolean(record.snapshot);
  const documentDownloadAvailable =
    "documentKind" in record.snapshot &&
    typeof record.snapshot.documentId === "string" &&
    record.snapshot.documentId.trim().length > 0;
  return {
    runId: record.snapshot.runId,
    projectId: record.metadata?.projectId ?? null,
    status,
    stage,
    currentStage: record.snapshot.currentStage,
    error: record.snapshot.error,
    model: readSnapshotModel(record.snapshot) ?? null,
    runKind: inferRunKind(record.snapshot),
    documentKind:
      "documentKind" in record.snapshot ? record.snapshot.documentKind : null,
    createdByUserId: record.metadata?.userId ?? null,
    startedAt: createdAt,
    updatedAt: createdAt,
    completedAt: record.terminal ? createdAt : null,
    metadata: record.metadata ?? null,
    eventCount: record.events.length,
    terminal: record.terminal,
    snapshotAvailable,
    canRestore: snapshotAvailable && !isActive,
    documentDownloadAvailable,
  };
}

export function projectRecordMatchesFilters(record: RunRecord, query: unknown) {
  const status = queryValue(query, "status");
  if (status && record.snapshot.status !== status) return false;
  const stage = queryValue(query, "stage");
  if (stage && record.snapshot.currentStage !== stage) return false;
  const userId = queryValue(query, "userId");
  if (userId && record.metadata?.userId !== userId) return false;
  const model = queryValue(query, "model");
  if (model && readSnapshotModel(record.snapshot) !== model) return false;
  return true;
}
