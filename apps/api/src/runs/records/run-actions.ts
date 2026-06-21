// Owns reusable run lifecycle actions shared by project and admin routes.
import { randomUUID } from "node:crypto";
import {
  cancelledRunEventSchema,
  queuedRunEventSchema,
  runActionResultSchema,
  runActionRunEventSchema,
  type RunAction,
  type RunActionResult,
} from "@uml-platform/contracts";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "./snapshots.js";
import { buildEmptyRequirementBaseline } from "../baselines/requirement-baseline.js";
import {
  emitEvent,
  type RunRecord,
  type RunRecordMetadata,
  type RunRecordStore,
} from "./run-record-store.js";
import { createRunError } from "../pipelines/shared/errors.js";

function createQueuedSnapshotFromSource(
  source: RunRecord["snapshot"],
  newRunId: string,
): RunRecord["snapshot"] {
  if ("documentKind" in source) {
    return createEmptyDocumentSnapshot(newRunId, {
      documentKind: source.documentKind,
      requirementText: source.requirementText,
      requirementBaseline: source.requirementBaseline,
    });
  }

  if ("files" in source) {
    return createEmptyCodeSnapshot(newRunId, {
      requirementText: source.requirementText,
      rules: source.rules,
      requirementBaseline: source.requirementBaseline,
      designModels: source.designModels,
      designPlantUml: source.designPlantUml,
      existingFiles: source.files,
      generationMode: source.generationMode,
    });
  }

  if ("designModelTraceability" in source) {
    return createEmptyDesignSnapshot(newRunId, {
      selectedDiagrams: source.selectedDiagrams,
      requestedDiagrams: source.requestedDiagrams,
      requirementBaseline:
        source.requirementBaseline ?? buildEmptyRequirementBaseline({ runId: newRunId }),
      requirementModels: source.requirementModels,
      requirementModelTraceability: source.requirementModelTraceability,
    });
  }

  return createEmptySnapshot(
    newRunId,
    source.requirementText,
    source.selectedDiagrams,
    source.rules,
    {
      analysisTargetUseCaseIds: source.analysisTargetUseCaseIds,
      requestedDiagrams: source.requestedDiagrams,
      dependencyDiagrams: source.dependencyDiagrams,
    },
  );
}

export function isRetryableRun(record: RunRecord) {
  return (
    record.snapshot.status === "failed" ||
    record.snapshot.status === "cancelled" ||
    (record.terminal &&
      (record.snapshot.status === "running" || record.snapshot.status === "queued"))
  );
}

function displaySourceRunStatus(record: RunRecord) {
  if (
    record.terminal &&
    (record.snapshot.status === "running" || record.snapshot.status === "queued")
  ) {
    return "interrupted";
  }
  return record.snapshot.status;
}

export function cancelRunRecord(record: RunRecord, runId: string): RunActionResult {
  // Cancellation is a terminal lifecycle transition; SSE readers close on this event.
  record.snapshot.status = "cancelled";
  record.snapshot.error = createRunError("RUN_CANCELLED", "Run cancelled by user");
  emitEvent(
    record,
    cancelledRunEventSchema.parse({
      type: "cancelled",
      stage: record.snapshot.currentStage ?? undefined,
      message: record.snapshot.error.message,
    }),
  );

  return runActionResultSchema.parse({
    action: "cancel",
    sourceRunId: runId,
    runId,
    status: record.snapshot.status,
  });
}

export function createQueuedRunFromSource({
  runs,
  source,
  metadata,
  action,
  sourceRunId,
  actorUserId,
  runId = randomUUID(),
}: {
  runs: RunRecordStore;
  source: RunRecord;
  metadata?: RunRecordMetadata;
  action: Extract<RunAction, "retry" | "rerun">;
  sourceRunId: string;
  actorUserId?: string;
  runId?: string;
}): RunActionResult {
  const record: RunRecord = {
    snapshot: createQueuedSnapshotFromSource(source.snapshot, runId),
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      ...(metadata ?? { createdAt: new Date().toISOString() }),
      sourceRunId,
      sourceAction: action,
      sourceRunStatus: displaySourceRunStatus(source),
    },
  };
  runs.set(runId, record);
  emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
  emitEvent(
    source,
    runActionRunEventSchema.parse({
      type: "run_action",
      action,
      sourceRunId,
      newRunId: runId,
      actorUserId,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
    }),
  );

  return runActionResultSchema.parse({
    action,
    sourceRunId,
    runId,
    status: record.snapshot.status,
  });
}
