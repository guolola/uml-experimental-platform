import assert from "node:assert/strict";
import test from "node:test";
import { assertProviderConfig, loadFixtures, renderMarkdownReport, runEval } from "./index.js";

test("harness reports missing provider configuration outside mock mode", () => {
  assert.throws(
    () => assertProviderConfig({}),
    /UML_EVAL_PROVIDER_API_BASE_URL.*UML_EVAL_API_KEY.*UML_EVAL_MODEL/,
  );
});

test("harness loads baseline and A/B/C retest fixtures", async () => {
  const fixtures = await loadFixtures();
  assert.equal(fixtures.length, 6);
  assert.match(fixtures[0].requirementText, /订单管理系统/);
  assert.equal(
    fixtures.some(
      (fixture) =>
        fixture.id === "04-retest-a-boundary-full-chain" &&
        fixture.expectedFacts.length > 0,
    ),
    true,
  );
});

test("harness mock mode produces json and markdown reports", async () => {
  const report = await runEval({ UML_EVAL_MOCK: "1" });
  assert.equal(report.mode, "mock");
  assert.equal(report.totals.cases, 6);
  assert.equal(report.totals.completed, 6);
  assert.equal(report.totals.svgSuccessCount, 24);
  assert.equal(report.totals.semanticAccuracyRate, 1);
  assert.equal(report.totals.harmfulRepairCount, 0);
  assert.equal(report.totals.terminalInconsistencyCount, 0);
  assert.match(renderMarkdownReport(report), /UML 生成质量评测报告/);
  assert.match(renderMarkdownReport(report), /关键语义准确率: 100\.0%/);
});
