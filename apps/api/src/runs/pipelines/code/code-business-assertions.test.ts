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
        "import { useState } from 'react'; export default function App(){ const currentUser = { isLoggedIn: false }; const [isLoggedIn, setIsLoggedIn] = useState(currentUser.isLoggedIn); return isLoggedIn ? <main>登录后访问主要功能</main> : <button onClick={() => setIsLoggedIn(true)}>请先登录</button>; }",
    },
    generatedAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(result.passed, true, JSON.stringify(result.assertions, null, 2));
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

test("buildCodeBusinessAssertionResults rejects console-only interactions without observable feedback", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-console-only",
    requirementText: "学生提交预约时必须填写实验目的，缺失时提示具体字段。",
    rules: [
      {
        id: "r1",
        category: "异常处理",
        text: "学生提交预约时必须填写实验目的，缺失时提示具体字段。",
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-27T00:00:00.000Z",
  });
  const result = buildCodeBusinessAssertionResults({
    runId: "run-console-only",
    baseline,
    businessLogic: null,
    files: {
      "/src/Reservation.tsx":
        "export function submit(purpose:string){ if (purpose) console.log('提交预约', purpose); }",
    },
    generatedAt: "2026-05-27T00:00:00.000Z",
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockingFailureIds.length > 0);
});

test("buildCodeBusinessAssertionResults sends performance requirements to alternative evidence", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-performance",
    requirementText: "在100个并发用户下，95百分位响应时间不超过2秒。",
    rules: [
      {
        id: "r1",
        category: "非功能需求",
        text: "在100个并发用户下，95百分位响应时间不超过2秒。",
        relatedDiagrams: ["deployment"],
      },
    ],
    createdAt: "2026-05-27T00:00:00.000Z",
  });
  const result = buildCodeBusinessAssertionResults({
    runId: "run-performance",
    baseline,
    businessLogic: null,
    files: {},
    generatedAt: "2026-05-27T00:00:00.000Z",
  });

  assert.equal(result.passed, true, JSON.stringify(result.assertions, null, 2));
  assert.equal(result.assertions[0]?.status, "pending-review");
  assert.equal(result.assertions[0]?.verificationMethod, "manual-review");
});

test("buildCodeBusinessAssertionResults requires the inclusive numeric boundary in executable evidence", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-inclusive-threshold",
    requirementText: "报销总额达到5000元时必须由直属经理审批。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "报销总额达到5000元时必须由直属经理审批。",
        relatedDiagrams: ["activity"],
      },
    ],
    createdAt: "2026-07-30T00:00:00.000Z",
  });
  const missingBoundary = buildCodeBusinessAssertionResults({
    runId: "run-inclusive-threshold-missing",
    baseline,
    businessLogic: null,
    files: {
      "/src/Expense.tsx":
        "export function submit(amount:number){ if(amount > 100){ alert('请上传发票'); } }",
    },
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(missingBoundary.passed, false);

  const implemented = buildCodeBusinessAssertionResults({
    runId: "run-inclusive-threshold-implemented",
    baseline,
    businessLogic: null,
    files: {
      "/src/Expense.tsx":
        "export function submit(amount:number, currentUser:{role:string}, setStatus:(value:string)=>void){ if(amount >= 5000 && currentUser.role !== 'manager'){ setStatus('manager-review'); alert('需要直属经理审批'); return; } }",
    },
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(
    implemented.passed,
    true,
    JSON.stringify(implemented.assertions, null, 2),
  );
});

test("buildCodeBusinessAssertionResults preserves OR logic and each permission role", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-role-or",
    requirementText:
      "[R-OR] 参会人数50人以上，或者结束时间晚于21:00时必须由部门审批员审批。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "参会人数50人以上，或者结束时间晚于21:00时必须由部门审批员审批。",
        relatedDiagrams: ["activity"],
        sourceFragment:
          "[R-OR] 参会人数50人以上，或者结束时间晚于21:00时必须由部门审批员审批。",
      },
    ],
    createdAt: "2026-07-30T00:00:00.000Z",
  });
  const weakened = buildCodeBusinessAssertionResults({
    runId: "run-role-or-weakened",
    baseline,
    businessLogic: null,
    files: {
      "/src/Booking.tsx":
        "export function submit(attendees:number){ if(attendees >= 50){ alert('需要审批'); } }",
    },
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(
    weakened.passed,
    false,
    JSON.stringify(weakened.assertions, null, 2),
  );

  const implemented = buildCodeBusinessAssertionResults({
    runId: "run-role-or-implemented",
    baseline,
    businessLogic: null,
    files: {
      "/src/Booking.tsx":
        "export function submit(attendees:number,endTime:string,approver:{role:string},setStatus:(value:string)=>void){ if((attendees >= 50 || endTime > '21:00') && approver.role === 'approver'){ setStatus('pending-approval'); alert('部门审批员审批'); } }",
    },
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(
    implemented.passed,
    true,
    JSON.stringify(implemented.assertions, null, 2),
  );
});
