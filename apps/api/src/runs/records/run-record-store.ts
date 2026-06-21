// Defines the in-memory run record boundary shared by routes, pipelines, and SSE.
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";

export interface RunRecord {
  snapshot: RunSnapshot | DesignRunSnapshot | CodeRunSnapshot | DocumentRunSnapshot;
  events: RunEvent[];
  listeners: Set<(event: RunEvent) => void>;
  terminal: boolean;
  documentBuffer?: Buffer;
  metadata?: RunRecordMetadata;
  persist?: (record: RunRecord, event?: RunEvent) => void | Promise<void>;
}

export type RunRecordStore = Map<string, RunRecord>;

export interface RunRecordMetadata {
  userId?: string;
  projectId?: string;
  model?: string;
  createdAt: string;
  completedAt?: string;
  sourceRunId?: string;
  sourceAction?: "retry" | "rerun";
  sourceRunStatus?: string;
}

export interface SerializedRunRecord {
  snapshot: RunRecord["snapshot"];
  events: RunEvent[];
  terminal: boolean;
  metadata?: RunRecordMetadata;
  documentBufferBase64?: string;
}

export interface SerializedRunRecordStore {
  version: 1;
  records: SerializedRunRecord[];
}

function shouldStoreEvent(event: RunEvent) {
  if (event.type !== "llm_chunk") return true;
  return process.env.UML_PERSIST_LLM_CHUNKS === "true";
}

function isTerminalRunEvent(event: RunEvent) {
  return event.type === "completed" || event.type === "failed" || event.type === "cancelled";
}

function terminalStatusFromEvent(event: RunEvent) {
  return isTerminalRunEvent(event) ? event.type : null;
}

function recordedTerminalStatus(record: RunRecord) {
  for (const event of record.events) {
    const status = terminalStatusFromEvent(event);
    if (status) return status;
  }
  return record.snapshot.status === "completed" ||
    record.snapshot.status === "failed" ||
    record.snapshot.status === "cancelled"
    ? record.snapshot.status
    : null;
}

function restoreRecordedTerminalStatus(record: RunRecord) {
  const status = recordedTerminalStatus(record);
  if (status) {
    record.snapshot.status = status;
  }
}

export function createRunRecordStore(
  initialState?: SerializedRunRecordStore,
): RunRecordStore {
  const store = new Map<string, RunRecord>();
  for (const record of initialState?.records ?? []) {
    store.set(record.snapshot.runId, {
      snapshot: record.snapshot,
      events: record.events,
      listeners: new Set(),
      terminal: record.terminal,
      metadata: record.metadata,
      documentBuffer: record.documentBufferBase64
        ? Buffer.from(record.documentBufferBase64, "base64")
        : undefined,
    });
  }
  return store;
}

export function serializeRunRecordStore(
  runs: RunRecordStore,
): SerializedRunRecordStore {
  return {
    version: 1,
    records: Array.from(runs.values(), (record) => ({
      snapshot: record.snapshot,
      events: record.events,
      terminal: record.terminal,
      metadata: record.metadata,
      documentBufferBase64: record.documentBuffer?.toString("base64"),
    })),
  };
}

export function emitEvent(record: RunRecord, event: RunEvent) {
  // Terminal lifecycle events close SSE streams; late worker progress after that
  // would make the task drawer appear completed while details still mutate.
  if (record.terminal) {
    if (event.type === "run_action") {
      // Retry/rerun lineage is allowed after terminal, but lifecycle terminal
      // state itself is immutable once the first terminal event closes the run.
    } else {
      if (isTerminalRunEvent(event)) {
        restoreRecordedTerminalStatus(record);
      }
      return;
    }
  }
  const storeEvent = shouldStoreEvent(event);
  if (storeEvent) {
    record.events.push(event);
  }
  for (const listener of record.listeners) {
    listener(event);
  }

  // completed/failed/cancelled are terminal events; SSE subscribers can close after them.
  if (isTerminalRunEvent(event)) {
    record.terminal = true;
    record.metadata = {
      ...(record.metadata ?? { createdAt: new Date().toISOString() }),
      completedAt: record.metadata?.completedAt ?? new Date().toISOString(),
    };
  }

  if (storeEvent) {
    void record.persist?.(record, event);
  }
}
