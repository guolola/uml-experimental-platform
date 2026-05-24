// Verifies the run record store can be serialized for first-pass persistence.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunRecordStore,
  emitEvent,
  serializeRunRecordStore,
} from "./run-record-store.js";
import { createEmptySnapshot } from "./snapshots.js";

test("run record store serializes metadata, snapshots, and events without listeners", () => {
  const runs = createRunRecordStore();
  const snapshot = createEmptySnapshot(
    "run-1",
    "项目需求",
    ["usecase"],
  );
  const record = {
    snapshot,
    events: [],
    listeners: new Set<() => void>(),
    terminal: false,
    metadata: {
      userId: "user-a",
      projectId: "project-a",
      createdAt: "2026-05-22T00:00:00.000Z",
    },
  };
  runs.set(snapshot.runId, record);
  emitEvent(record, { type: "queued" });

  const serialized = serializeRunRecordStore(runs);
  const restored = createRunRecordStore(serialized);

  assert.deepEqual(serialized.records[0]?.metadata, record.metadata);
  assert.equal(serialized.records[0]?.events.length, 1);
  assert.equal(serialized.records[0]?.listeners, undefined);
  assert.equal(restored.get("run-1")?.metadata?.projectId, "project-a");
  assert.equal(restored.get("run-1")?.events[0]?.type, "queued");
  assert.equal(restored.get("run-1")?.listeners.size, 0);
});
