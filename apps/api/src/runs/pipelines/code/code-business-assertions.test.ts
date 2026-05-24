// Verifies deterministic business assertions that bind generated code evidence to requirement IDs.
import assert from "node:assert/strict";
import test from "node:test";
import type { CodeBusinessLogic } from "@uml-platform/contracts";
import { buildRequirementBaseline } from "../../baselines/requirement-baseline.js";
import { buildCodeBusinessAssertionResults } from "./code-business-assertions.js";

const rule = {
  id: "r1",
  category: "业务规则" as const,
  text: "用户必须登录后才能访问主要功能。",
  relatedDiagrams: ["usecase" as const],
};

const businessLogic: CodeBusinessLogic = {
  appName: "访问控制",
  domainSummary: "登录后访问主要功能。",
  coreWorkflow: "用户登录后访问主要功能，未登录时显示异常反馈。",
  actors: [
    {
      id: "actor-user",
      name: "用户",
      type: "human",
      responsibilities: ["登录后访问主要功能"],
    },
  ],
  businessEntities: [],
  pageFlows: [
    {
      id: "page-main",
      name: "主要功能",
      route: "/main",
      purpose: "登录后访问主要功能",
      actors: ["用户"],
      entryPoints: ["登录成功"],
      userActions: ["访问主要功能"],
      states: ["未登录", "已登录"],
      sourceRefs: ["r1"],
    },
  ],
  stateMachines: [
    {
      entity: "会话",
      states: ["未登录", "已登录"],
      transitions: ["登录: 未登录 -> 已登录"],
    },
  ],
  permissions: [
    {
      actor: "用户",
      allowedActions: ["访问主要功能"],
      restrictedActions: ["未登录访问主要功能"],
    },
  ],
  edgeCases: ["未登录时显示请先登录反馈"],
  frontendOperations: ["登录", "访问主要功能"],
  plantUmlTraceability: ["usecase:uc-login"],
};

test("buildCodeBusinessAssertionResults fails UI-only code for behavior requirements", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-ui-only",
    requirementText: rule.text,
    rules: [rule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const result = buildCodeBusinessAssertionResults({
    runId: "run-ui-only",
    baseline,
    businessLogic,
    files: {
      "/src/App.tsx": "export default function App(){ return <button>登录后访问主要功能</button>; }",
    },
    generatedAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(result.passed, false);
  assert.equal(result.blockingFailureIds.length > 0, true);
  assert.equal(
    result.assertions.some(
      (item) => item.requirementId === "REQ-001" && item.status === "failed",
    ),
    true,
  );
});

test("buildCodeBusinessAssertionResults passes guarded behavior evidence", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-guarded",
    requirementText: rule.text,
    rules: [rule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const result = buildCodeBusinessAssertionResults({
    runId: "run-guarded",
    baseline,
    businessLogic,
    files: {
      "/src/App.tsx":
        "const isLoggedIn = true; export default function App(){ return isLoggedIn ? <main>登录后访问主要功能</main> : <main>请先登录</main>; }",
    },
    generatedAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(result.passed, true);
  assert.equal(result.blockingFailureIds.length, 0);
  assert.equal(
    result.assertions.every((item) => item.requirementId === "REQ-001"),
    true,
  );
});
