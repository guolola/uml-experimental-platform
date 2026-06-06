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

function canEmitAfterTerminal(event: RunEvent) {
  return isTerminalRunEvent(event) || event.type === "run_action";
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
  if (record.terminal && !canEmitAfterTerminal(event)) {
    return;
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
