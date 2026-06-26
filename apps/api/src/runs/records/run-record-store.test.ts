// Verifies the run record store can be serialized for first-pass persistence.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunRecordStore,
  emitEvent,
  serializeRunRecordStore,
} from "./run-record-store.js";
import { createEmptyCodeSnapshot, createEmptySnapshot } from "./snapshots.js";
import { summarizeRunRecord } from "./run-record-summaries.js";

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

test("run record store keeps the first terminal state when late terminal events arrive", () => {
  const snapshot = createEmptySnapshot("run-cancel-race", "项目需求", ["usecase"]);
  snapshot.status = "cancelled";
  const seen: string[] = [];
  let persistCount = 0;
  const record = {
    snapshot,
    events: [],
    listeners: new Set([(event: { type: string }) => seen.push(event.type)]),
    terminal: false,
    metadata: {
      createdAt: "2026-06-21T00:00:00.000Z",
    },
    persist: () => {
      persistCount += 1;
    },
  };

  emitEvent(record, {
    type: "cancelled",
    stage: "generate_models",
    message: "Run cancelled by user",
  });
  const terminalCompletedAt = record.metadata.completedAt;
  // A worker can mutate the shared snapshot before trying to emit its late
  // terminal event; the record store restores the first terminal status.
  record.snapshot.status = "completed";
  emitEvent(record, { type: "completed", snapshot: record.snapshot });
  record.snapshot.status = "failed";
  emitEvent(record, {
    type: "failed",
    error: {
      code: "RUN_INTERNAL_ERROR",
      message: "late failure",
      category: "internal",
      retryable: false,
    },
  });

  assert.equal(record.terminal, true);
  assert.equal(record.snapshot.status, "cancelled");
  assert.deepEqual(seen, ["cancelled"]);
  assert.deepEqual(record.events.map((event) => event.type), ["cancelled"]);
  assert.equal(record.metadata.completedAt, terminalCompletedAt);
  assert.equal(persistCount, 1);
});

test("run record store still records run actions after terminal events", () => {
  const snapshot = createEmptySnapshot("run-action-after-terminal", "项目需求", ["usecase"]);
  snapshot.status = "failed";
  const seen: string[] = [];
  const record = {
    snapshot,
    events: [],
    listeners: new Set([(event: { type: string }) => seen.push(event.type)]),
    terminal: false,
  };

  emitEvent(record, {
    type: "failed",
    error: {
      code: "RUN_INTERNAL_ERROR",
      message: "failed",
      category: "internal",
      retryable: true,
    },
  });
  emitEvent(record, {
    type: "run_action",
    action: "retry",
    sourceRunId: "run-action-after-terminal",
    newRunId: "run-retry",
    createdAt: "2026-06-21T00:01:00.000Z",
  });

  assert.deepEqual(seen, ["failed", "run_action"]);
  assert.deepEqual(record.events.map((event) => event.type), [
    "failed",
    "run_action",
  ]);
  assert.equal(record.snapshot.status, "failed");
});

test("run summaries use terminal metadata timestamps for completedAt", () => {
  const snapshot = createEmptySnapshot("run-summary", "项目需求", ["usecase"]);
  snapshot.status = "failed";
  const record = {
    snapshot,
    events: [],
    listeners: new Set<() => void>(),
    terminal: true,
    metadata: {
      createdAt: "2026-06-18T13:49:59.000Z",
      completedAt: "2026-06-18T14:48:23.000Z",
    },
  };

  const summary = summarizeRunRecord(record);

  assert.equal(summary.startedAt, "2026-06-18T13:49:59.000Z");
  assert.equal(summary.completedAt, "2026-06-18T14:48:23.000Z");
  assert.equal(summary.updatedAt, "2026-06-18T14:48:23.000Z");
});

test("run summaries expose code diagnostics for project history and task drawers", () => {
  const snapshot = createEmptyCodeSnapshot("run-code-summary", {
    designModels: [],
  });
  snapshot.status = "completed";
  snapshot.currentStage = "verify_code_preview";
  snapshot.files = {
    "/src/App.tsx": "export default function App() { return null; }",
  };
  snapshot.diagnostics = [
    {
      stage: "verify_code_preview",
      message: "检测到真实网络请求痕迹，已切换到本地 mock。",
      at: "2026-06-21T00:00:00.000Z",
    },
  ];
  snapshot.fileGenerationDiagnostics = [
    {
      stage: "operation_manifest",
      status: "repaired",
      path: "/src/App.tsx",
      message: "入口文件缺失，已回退到 /src/App.tsx。",
      at: "2026-06-21T00:00:01.000Z",
    },
  ];
  snapshot.qualityDiagnostics = [
    {
      passed: false,
      metrics: {
        fileCount: 1,
        pageFileCount: 1,
        componentFileCount: 0,
      },
      issues: [
        {
          severity: "warning",
          path: "/src/App.tsx",
          message: "页面缺少空状态。",
        },
      ],
    },
  ];
  const record = {
    snapshot,
    events: [],
    listeners: new Set<() => void>(),
    terminal: true,
  };

  const summary = summarizeRunRecord(record);

  assert.equal(summary.runKind, "code");
  assert.equal(summary.codeDiagnosticCount, 3);
  assert.equal(summary.codeQualityIssueCount, 1);
  assert.deepEqual(summary.codeDiagnosticSummary, [
    "verify_code_preview：检测到真实网络请求痕迹，已切换到本地 mock。",
    "operation_manifest：/src/App.tsx 入口文件缺失，已回退到 /src/App.tsx。",
    "quality：/src/App.tsx 页面缺少空状态。",
  ]);
});
