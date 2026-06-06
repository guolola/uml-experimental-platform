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

test("llm chunk events notify live listeners without entering run history by default", () => {
  const previousPersistChunks = process.env.UML_PERSIST_LLM_CHUNKS;
  delete process.env.UML_PERSIST_LLM_CHUNKS;

  try {
    const snapshot = createEmptySnapshot("run-live", "项目需求", ["usecase"]);
    const seen: string[] = [];
    const record = {
      snapshot,
      events: [],
      listeners: new Set([(event: { type: string }) => seen.push(event.type)]),
      terminal: false,
    };

    emitEvent(record, {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "partial",
    });

    assert.deepEqual(seen, ["llm_chunk"]);
    assert.equal(record.events.length, 0);
  } finally {
    if (previousPersistChunks === undefined) {
      delete process.env.UML_PERSIST_LLM_CHUNKS;
    } else {
      process.env.UML_PERSIST_LLM_CHUNKS = previousPersistChunks;
    }
  }
});

test("llm chunk event history can be enabled for temporary diagnostics", () => {
  const previousPersistChunks = process.env.UML_PERSIST_LLM_CHUNKS;
  process.env.UML_PERSIST_LLM_CHUNKS = "true";

  try {
    const snapshot = createEmptySnapshot("run-debug", "项目需求", ["usecase"]);
    const record = {
      snapshot,
      events: [],
      listeners: new Set<() => void>(),
      terminal: false,
    };

    emitEvent(record, {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "debug",
    });

    assert.equal(record.events.length, 1);
    assert.equal(record.events[0]?.type, "llm_chunk");
  } finally {
    if (previousPersistChunks === undefined) {
      delete process.env.UML_PERSIST_LLM_CHUNKS;
    } else {
      process.env.UML_PERSIST_LLM_CHUNKS = previousPersistChunks;
    }
  }
});

test("run record store ignores late progress after terminal events", () => {
  const snapshot = createEmptySnapshot("run-terminal", "项目需求", ["usecase"]);
  const seen: string[] = [];
  const record = {
    snapshot,
    events: [],
    listeners: new Set([(event: { type: string }) => seen.push(event.type)]),
    terminal: false,
  };

  emitEvent(record, { type: "completed", snapshot });
  emitEvent(record, {
    type: "stage_progress",
    stage: "generate_models",
    progress: 95,
    message: "late progress",
  });

  assert.equal(record.terminal, true);
  assert.deepEqual(seen, ["completed"]);
  assert.equal(record.events.length, 1);
  assert.equal(record.events[0]?.type, "completed");
});
