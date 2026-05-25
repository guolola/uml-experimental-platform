// Verifies initial run snapshots carry the trusted requirements baseline artifact.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "./snapshots.js";

const rule = {
  id: "r1",
  category: "业务规则" as const,
  text: "借阅者必须登录后才能借书。",
  relatedDiagrams: ["usecase" as const],
};

test("createEmptySnapshot produces a RequirementBaseline for requirements runs", () => {
  const snapshot = createEmptySnapshot("run-1", rule.text, ["usecase"], [rule]);

  assert.equal(snapshot.requirementBaseline?.runId, "run-1");
  assert.equal(snapshot.requirementBaseline?.requirements[0]?.sourceFragment, rule.text);
  assert.equal(snapshot.requirementBaseline?.qualityReport.status, "passed");
});

test("createEmptyDesignSnapshot carries a RequirementBaseline into design runs", () => {
  const snapshot = createEmptyDesignSnapshot("design-1", {
    requirementText: rule.text,
    selectedDiagrams: ["sequence"],
    rules: [rule],
    requirementModels: [],
    requirementModelTraceability: [],
  });

  assert.equal(snapshot.requirementBaseline?.requirements[0]?.id, "REQ-001");
});

test("createEmptyDesignSnapshot preserves the requested design selection", () => {
  const snapshot = createEmptyDesignSnapshot("design-append", {
    requirementText: rule.text,
    selectedDiagrams: ["class"],
    requestedDiagrams: ["class"],
    rules: [rule],
    requirementModels: [],
    requirementModelTraceability: [],
  });

  assert.deepEqual(snapshot.selectedDiagrams, ["class"]);
  assert.deepEqual(snapshot.requestedDiagrams, ["class"]);
});

test("createEmptyCodeSnapshot carries a RequirementBaseline into code runs", () => {
  const snapshot = createEmptyCodeSnapshot("code-1", {
    requirementText: rule.text,
    rules: [rule],
    designModels: [],
  });

  assert.equal(snapshot.requirementBaseline?.requirements[0]?.criticality, "critical");
});

test("createEmptyDocumentSnapshot preserves an empty baseline placeholder", () => {
  const snapshot = createEmptyDocumentSnapshot("doc-1", {
    documentKind: "requirementsSpec",
    requirementText: rule.text,
  });

  assert.equal(snapshot.requirementBaseline?.requirements.length, 0);
  assert.equal(snapshot.requirementBaseline?.qualityReport.status, "pending-review");
});
