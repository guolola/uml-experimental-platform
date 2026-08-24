// Verifies failed business assertions prevent code completion and produce trusted evidence.
import assert from "node:assert/strict";
import test from "node:test";
import { buildRequirementBaseline } from "../../baselines/requirement-baseline.js";
import { createEmptyCodeSnapshot } from "../../records/snapshots.js";
import { verifyCodeCompletionEvidence } from "./code-completion-verification.js";

test("verifyCodeCompletionEvidence rejects a UI-only implementation", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-code-gate",
    requirementText: "用户必须登录后才能访问主要功能。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "用户必须登录后才能访问主要功能。",
        relatedDiagrams: ["usecase"],
      },
    ],
  });
  const snapshot = createEmptyCodeSnapshot("run-code-gate", {
    designModels: [],
  });
  snapshot.requirementBaseline = baseline;
  snapshot.files = {
    "/src/App.tsx":
      "export default function App(){ return <button>登录后访问主要功能</button>; }",
  };

  const result = verifyCodeCompletionEvidence(snapshot);

  assert.equal(result.skipped, false);
  assert.equal(result.passed, false);
  assert.ok(result.businessAssertionResults?.blockingFailureIds.length);
  assert.ok(
    result.trustedChain?.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "business-assertion-gap",
    ),
  );
});

test("verifyCodeCompletionEvidence keeps the legacy no-baseline path explicit", () => {
  const snapshot = createEmptyCodeSnapshot("run-code-legacy", {
    designModels: [],
  });

  const result = verifyCodeCompletionEvidence(snapshot);

  assert.equal(result.skipped, true);
  assert.equal(result.passed, true);
  assert.equal(result.businessAssertionResults, null);
});
