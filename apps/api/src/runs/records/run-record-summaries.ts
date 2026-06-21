// Builds run history summaries and filters from run records without mutating lifecycle state.
import type { RunRecord } from "./run-record-store.js";

type SnapshotDiagramErrorSummary = {
  diagramId: string;
  stage: string | null;
  message: string;
};

const MISSING_ARTIFACT_SUMMARY_LIMIT = 3;
const CODE_DIAGNOSTIC_SUMMARY_LIMIT = 3;

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

function readDiagramErrorSummary(
  snapshot: RunRecord["snapshot"],
): SnapshotDiagramErrorSummary[] {
  if (!("diagramErrors" in snapshot) || !snapshot.diagramErrors) return [];
  return Object.entries(snapshot.diagramErrors).flatMap(([diagramId, value]) => {
    if (!value || typeof value !== "object") return [];
    const diagramError = value as {
      stage?: unknown;
      error?: { message?: unknown };
    };
    const message = diagramError.error?.message;
    if (typeof message !== "string" || !message.trim()) return [];
    return [
      {
        diagramId,
        stage: typeof diagramError.stage === "string" ? diagramError.stage : null,
        message,
      },
    ];
  });
}

function readMissingArtifactSummary(snapshot: RunRecord["snapshot"]) {
  if (!("missingArtifacts" in snapshot) || !Array.isArray(snapshot.missingArtifacts)) {
    return [];
  }
  return snapshot.missingArtifacts
    .map((artifact) => artifact.trim())
    .filter(Boolean)
    .slice(0, MISSING_ARTIFACT_SUMMARY_LIMIT);
}

function readCodeDiagnosticSummary(snapshot: RunRecord["snapshot"]) {
  if (!("files" in snapshot)) {
    return {
      count: 0,
      summary: [] as string[],
      qualityIssueCount: 0,
    };
  }

  const diagnostics = Array.isArray(snapshot.diagnostics)
    ? snapshot.diagnostics
    : [];
  const fileDiagnostics = Array.isArray(snapshot.fileGenerationDiagnostics)
    ? snapshot.fileGenerationDiagnostics
    : [];
  const latestQualityDiagnostic = Array.isArray(snapshot.qualityDiagnostics)
    ? snapshot.qualityDiagnostics.at(-1)
    : null;
  const qualityIssues = latestQualityDiagnostic?.issues ?? [];
  const summary = [
    ...diagnostics.map((diagnostic) => `${diagnostic.stage}：${diagnostic.message}`),
    ...fileDiagnostics.map((diagnostic) => {
      const target = diagnostic.path ? `${diagnostic.path} ` : "";
      return `${diagnostic.stage}：${target}${diagnostic.message}`;
    }),
    ...qualityIssues.map((issue) => {
      const target = issue.path ? `${issue.path} ` : "";
      return `quality：${target}${issue.message}`;
    }),
  ]
    .map((message) => message.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, CODE_DIAGNOSTIC_SUMMARY_LIMIT);

  return {
    count: diagnostics.length + fileDiagnostics.length + qualityIssues.length,
    summary,
    qualityIssueCount: qualityIssues.length,
  };
}

function readSelectedDiagrams(snapshot: RunRecord["snapshot"]) {
  return "selectedDiagrams" in snapshot && Array.isArray(snapshot.selectedDiagrams)
    ? snapshot.selectedDiagrams
    : [];
}

function readRequestedDiagrams(snapshot: RunRecord["snapshot"]) {
  return "requestedDiagrams" in snapshot && Array.isArray(snapshot.requestedDiagrams)
    ? snapshot.requestedDiagrams
    : [];
}

function runActionEvents(record: RunRecord) {
  return record.events.filter((event) => event.type === "run_action");
}

export function summarizeRunRecord(record: RunRecord) {
  const snapshot = record.snapshot;
  const createdAt = record.metadata?.createdAt ?? new Date().toISOString();
  const completedAt = record.metadata?.completedAt ?? (record.terminal ? createdAt : null);
  const status = displayRunStatus(record);
  const stage = snapshot.currentStage ?? status;
  const isActive = !record.terminal && (status === "running" || status === "queued");
  const snapshotAvailable = Boolean(snapshot);
  const isDocumentRun = "documentKind" in snapshot;
  const documentDownloadAvailable = "documentKind" in snapshot
    ? (
    status === "completed" &&
    typeof snapshot.documentId === "string" &&
    snapshot.documentId.trim().length > 0
    )
    : false;
  const diagramErrorSummary = readDiagramErrorSummary(snapshot);
  const missingArtifactSummary = readMissingArtifactSummary(snapshot);
  const codeDiagnosticSummary = readCodeDiagnosticSummary(snapshot);
  const actions = runActionEvents(record);
  const latestAction = actions.at(-1) ?? null;
  return {
    runId: snapshot.runId,
    projectId: record.metadata?.projectId ?? null,
    status,
    stage,
    currentStage: snapshot.currentStage,
    error: snapshot.error,
    errorMessage: snapshot.error?.message ?? null,
    diagramErrorCount: diagramErrorSummary.length,
    diagramErrorSummary,
    partialFailure:
      diagramErrorSummary.length > 0 &&
      (snapshot.status === "completed" || snapshot.status === "failed"),
    missingArtifactCount:
      "missingArtifacts" in snapshot && Array.isArray(snapshot.missingArtifacts)
        ? snapshot.missingArtifacts.filter((artifact) => artifact.trim()).length
        : 0,
    missingArtifactSummary,
    codeDiagnosticCount: codeDiagnosticSummary.count,
    codeDiagnosticSummary: codeDiagnosticSummary.summary,
    codeQualityIssueCount: codeDiagnosticSummary.qualityIssueCount,
    model: readSnapshotModel(snapshot) ?? null,
    runKind: inferRunKind(snapshot),
    documentKind:
      "documentKind" in snapshot ? snapshot.documentKind : null,
    selectedDiagrams: readSelectedDiagrams(snapshot),
    requestedDiagrams: readRequestedDiagrams(snapshot),
    createdByUserId: record.metadata?.userId ?? null,
    sourceRunId: record.metadata?.sourceRunId ?? null,
    sourceAction: record.metadata?.sourceAction ?? null,
    sourceRunStatus: record.metadata?.sourceRunStatus ?? null,
    derivedRunIds: actions.map((event) => event.newRunId),
    latestAction: latestAction?.action ?? null,
    latestActionRunId: latestAction?.newRunId ?? null,
    latestActionAt: latestAction?.createdAt ?? null,
    startedAt: createdAt,
    updatedAt: completedAt ?? createdAt,
    completedAt,
    metadata: record.metadata ?? null,
    eventCount: record.events.length,
    terminal: record.terminal,
    snapshotAvailable,
    canRestore: snapshotAvailable && !isActive && !isDocumentRun,
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
