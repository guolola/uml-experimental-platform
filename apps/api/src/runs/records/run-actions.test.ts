// Verifies run action snapshot cloning preserves retry/rerun target scope.
import assert from "node:assert/strict";
import test from "node:test";
import type { DesignRunSnapshot, RunSnapshot } from "@uml-platform/contracts";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import { createQueuedRunFromSource } from "./run-actions.js";
import type { RunRecord, RunRecordStore } from "./run-record-store.js";
import { createEmptyDesignSnapshot, createEmptySnapshot } from "./snapshots.js";

const rule = {
  id: "REQ-001",
  category: "功能需求" as const,
  text: "用户可以查看图书。",
  relatedDiagrams: ["analysis" as const],
};

function createSourceRecord(snapshot: RunRecord["snapshot"]): RunRecord {
  return {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: { createdAt: "2026-06-21T00:00:00.000Z" },
  };
}

test("createQueuedRunFromSource preserves requirement analysis target ids", () => {
  const runs: RunRecordStore = new Map();
  const sourceSnapshot = createEmptySnapshot(
    "source-requirements-run",
    "用户可以查看图书。",
    ["analysis"],
    [rule],
    { analysisTargetUseCaseIds: ["uc_view_books"] },
  );
  sourceSnapshot.status = "failed";
  const source = createSourceRecord(sourceSnapshot);

  createQueuedRunFromSource({
    runs,
    source,
    action: "retry",
    sourceRunId: sourceSnapshot.runId,
    runId: "retry-requirements-run",
  });

  const retrySnapshot = runs.get("retry-requirements-run")
    ?.snapshot as RunSnapshot;
  assert.deepEqual(retrySnapshot.selectedDiagrams, ["analysis"]);
  assert.deepEqual(retrySnapshot.analysisTargetUseCaseIds, ["uc_view_books"]);
});

test("createQueuedRunFromSource preserves design requested diagram scope", () => {
  const runs: RunRecordStore = new Map();
  const requirementBaseline = buildRequirementBaseline({
    runId: "baseline-run",
    requirementText: "用户可以查看图书。",
    rules: [rule],
  });
  const sourceSnapshot = createEmptyDesignSnapshot("source-design-run", {
    selectedDiagrams: ["sequence"],
    requestedDiagrams: ["sequence"],
    requirementBaseline,
    requirementModels: [],
    requirementModelTraceability: [],
  });
  sourceSnapshot.status = "failed";
  const source = createSourceRecord(sourceSnapshot);

  createQueuedRunFromSource({
    runs,
    source,
    action: "rerun",
    sourceRunId: sourceSnapshot.runId,
    runId: "rerun-design-run",
  });

  const rerunSnapshot = runs.get("rerun-design-run")
    ?.snapshot as DesignRunSnapshot;
  assert.deepEqual(rerunSnapshot.selectedDiagrams, ["sequence"]);
  assert.deepEqual(rerunSnapshot.requestedDiagrams, ["sequence"]);
});
