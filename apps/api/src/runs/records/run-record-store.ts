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
}

export type RunRecordStore = Map<string, RunRecord>;

export function createRunRecordStore(): RunRecordStore {
  return new Map<string, RunRecord>();
}

export function emitEvent(record: RunRecord, event: RunEvent) {
  record.events.push(event);
  for (const listener of record.listeners) {
    listener(event);
  }

  // completed/failed are terminal events; SSE subscribers can close after them.
  if (event.type === "completed" || event.type === "failed") {
    record.terminal = true;
  }
}
