import assert from "node:assert/strict";
import test from "node:test";
import { assertProviderConfig, loadFixtures, renderMarkdownReport, runEval } from "./index.js";

test("harness reports missing provider configuration outside mock mode", () => {
  assert.throws(
    () => assertProviderConfig({}),
    /UML_EVAL_PROVIDER_API_BASE_URL.*UML_EVAL_API_KEY.*UML_EVAL_MODEL/,
  );
});

test("harness loads three bundled Chinese fixtures", async () => {
  const fixtures = await loadFixtures();
  assert.equal(fixtures.length, 3);
  assert.match(fixtures[0].requirementText, /订单管理系统/);
});

test("harness mock mode produces json and markdown reports", async () => {
  const report = await runEval({ UML_EVAL_MOCK: "1" });
  assert.equal(report.mode, "mock");
  assert.equal(report.totals.cases, 3);
  assert.equal(report.totals.completed, 3);
  assert.equal(report.totals.svgSuccessCount, 12);
  assert.match(renderMarkdownReport(report), /UML 生成质量评测报告/);
});
