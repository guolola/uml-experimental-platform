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

test("buildCodeBusinessAssertionResults matches Chinese behavior evidence without accepting static copy", () => {
  const calendarRule = {
    id: "r1",
    category: "功能需求" as const,
    text: "系统应提供面向公众的活动安排展示功能。",
    relatedDiagrams: ["usecase" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-calendar",
    requirementText: calendarRule.text,
    rules: [calendarRule],
    createdAt: "2026-05-27T00:00:00.000Z",
  });
  const calendarBusinessLogic: CodeBusinessLogic = {
    appName: "公共活动日历",
    domainSummary: "展示面向公众的活动安排。",
    coreWorkflow: "系统筛选公开活动并展示活动安排。",
    actors: [],
    businessEntities: [],
    pageFlows: [
      {
        id: "page-calendar",
        name: "活动安排",
        route: "/calendar",
        purpose: "展示公开活动安排",
        actors: ["公众"],
        entryPoints: ["打开公开日历"],
        userActions: ["查看活动安排"],
        states: ["公开"],
        sourceRefs: ["r1"],
      },
    ],
    stateMachines: [],
    permissions: [],
    edgeCases: [],
    frontendOperations: ["查看活动安排"],
    plantUmlTraceability: [],
  };

  const uiOnly = buildCodeBusinessAssertionResults({
    runId: "run-calendar-ui-only",
    baseline,
    businessLogic: calendarBusinessLogic,
    files: {
      "/src/App.tsx": "export default function App(){ return <main>面向公众的活动安排展示功能</main>; }",
    },
    generatedAt: "2026-05-27T00:00:00.000Z",
  });
  assert.equal(uiOnly.passed, false);

  const implemented = buildCodeBusinessAssertionResults({
    runId: "run-calendar-implemented",
    baseline,
    businessLogic: calendarBusinessLogic,
    files: {
      "/src/App.tsx":
        "const activities = [{ title: '发布会', visibility: 'public' }]; export default function App(){ const publicActivities = activities.filter((activity) => activity.visibility === 'public'); return <main>{publicActivities.map((activity) => <article key={activity.title}>活动安排 {activity.title}</article>)}</main>; }",
    },
    generatedAt: "2026-05-27T00:00:00.000Z",
  });
  assert.equal(implemented.passed, true);
  assert.equal(implemented.blockingFailureIds.length, 0);
});
