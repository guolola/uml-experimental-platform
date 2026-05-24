// Verifies trusted-chain evidence is reviewable and exportable in a real browser.
import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

const projectId = "project-trusted";
const runId = "run-evidence-browser";
const now = "2026-05-24T08:00:00.000Z";

function json(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function createRunSnapshot() {
  return {
    runId,
    requirementText:
      "图书馆管理员必须能审批借阅申请；冲突规则、低置信关键需求和非功能性能需求必须进入复核。",
    selectedDiagrams: [],
    rules: [],
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    currentStage: "completed",
    status: "completed",
    errorMessage: null,
  };
}

function createEvidencePackage(status: "blocked" | "complete" = "blocked") {
  const resolved = status === "complete";
  return {
    runId,
    generatedAt: now,
    status,
    requirementBaseline: {
      runId,
      sourceDocumentId: "inline-requirement",
      createdAt: now,
      assumptions: [
        {
          id: "ASM-001",
          requirementId: "REQ-004",
          statement: "性能需求改用浏览器验收和人工确认作为替代证据。",
          confidence: 0.64,
          sourceFragment: "响应时间不超过2秒",
          status: resolved ? "accepted" : "pending-review",
        },
      ],
      conflicts: [
        {
          id: "CON-001",
          requirementIds: ["REQ-002", "REQ-003"],
          summary: "同一订单状态既要求允许取消又要求禁止取消。",
          severity: "blocking",
          status: resolved ? "resolved" : "open",
          sourceFragments: ["已支付订单可取消", "已支付订单不可取消"],
        },
      ],
      qualityReport: {
        runId,
        status: resolved ? "passed" : "needs-review",
        summary: "关键需求低置信度和冲突必须复核。",
        issues: [
          {
            id: "RQI-LOW-CONFIDENCE",
            requirementId: "REQ-003",
            severity: "error",
            category: "low-confidence",
            message: "关键需求置信度低于阈值。",
            blocksDownstream: !resolved,
          },
        ],
        blockingIssueIds: resolved ? [] : ["RQI-LOW-CONFIDENCE"],
        reviewRequiredRequirementIds: resolved ? [] : ["REQ-003", "REQ-004"],
      },
      requirements: [
        {
          id: "REQ-001",
          sourceFragment: "管理员审批借阅申请。",
          sourceLocation: { section: "input", startOffset: 0, endOffset: 10 },
          type: "functional",
          actor: "管理员",
          subject: "借阅申请",
          action: "审批",
          object: "申请",
          condition: "用户提交借阅申请后",
          outcome: "审批结果被记录",
          confidence: 0.91,
          status: "accepted",
          criticality: "critical",
          acceptanceCriteria: ["未授权用户不能审批。"],
          priority: "must",
        },
        {
          id: "REQ-002",
          sourceFragment: "已支付订单可取消。",
          sourceLocation: { section: "input", startOffset: 11, endOffset: 20 },
          type: "business-rule",
          actor: "用户",
          subject: "订单",
          action: "取消",
          object: "已支付订单",
          condition: "订单已支付",
          outcome: "订单取消成功",
          confidence: 0.86,
          status: resolved ? "accepted" : "conflict",
          criticality: "high",
          acceptanceCriteria: ["冲突解除前不能标记覆盖。"],
          priority: "must",
        },
        {
          id: "REQ-003",
          sourceFragment: "低置信关键审批规则。",
          sourceLocation: { section: "input", startOffset: 21, endOffset: 31 },
          type: "functional",
          actor: "审批人",
          subject: "审批流",
          action: "流转",
          object: "申请",
          condition: "材料不完整",
          outcome: "显示异常反馈",
          confidence: 0.48,
          status: resolved ? "accepted" : "pending-review",
          criticality: "critical",
          acceptanceCriteria: ["材料缺失时阻断提交并显示原因。"],
          priority: "must",
        },
        {
          id: "REQ-004",
          sourceFragment: "响应时间不超过2秒。",
          sourceLocation: { section: "input", startOffset: 32, endOffset: 42 },
          type: "non-functional",
          actor: "系统",
          subject: "系统",
          action: "响应",
          object: "页面",
          condition: "普通操作",
          outcome: "2秒内完成",
          confidence: 0.72,
          status: resolved ? "accepted" : "derived",
          criticality: "high",
          acceptanceCriteria: ["用浏览器证据和人工复核确认。"],
          priority: "should",
        },
      ],
    },
    qualityReport: {
      runId,
      status: resolved ? "passed" : "needs-review",
      summary: "关键质量失败在复核完成前阻断下游。",
      issues: [],
      blockingIssueIds: resolved ? [] : ["RQI-LOW-CONFIDENCE"],
      reviewRequiredRequirementIds: resolved ? [] : ["REQ-003", "REQ-004"],
    },
    coverageMatrix: {
      runId,
      rows: [
        {
          requirementId: "REQ-001",
          status: "covered",
          rationale: "权限、状态流转和异常反馈均有业务断言与浏览器证据。",
          modelElements: ["usecase:approve-loan"],
          designElements: ["sequence:approve-loan"],
          codeArtifacts: ["src/workflows/approval.ts"],
          tests: ["approval-flow.spec.ts"],
          reviewItems: [],
        },
        {
          requirementId: "REQ-002",
          status: resolved ? "covered" : "conflict",
          rationale: "冲突解除前不能当作 covered。",
          modelElements: [],
          designElements: [],
          codeArtifacts: [],
          tests: [],
          reviewItems: resolved ? [] : ["REV-CONFLICT"],
        },
        {
          requirementId: "REQ-003",
          status: resolved ? "covered" : "partially-covered",
          rationale: "critical partial coverage blocks completion until reviewed.",
          modelElements: ["activity:approval-exception"],
          designElements: [],
          codeArtifacts: ["src/workflows/approval.ts"],
          tests: ["approval-exception.spec.ts"],
          reviewItems: resolved ? [] : ["REV-LOW-CONFIDENCE"],
        },
        {
          requirementId: "REQ-004",
          status: resolved ? "not-modelable" : "pending-review",
          rationale: "非功能需求使用替代证据路径。",
          modelElements: [],
          designElements: [],
          codeArtifacts: [],
          tests: ["browser-performance.spec.ts"],
          reviewItems: resolved ? [] : ["REV-NOT-MODELABLE"],
        },
      ],
    },
    traceabilityMatrix: {
      runId,
      links: [
        {
          id: "TRACE-001",
          source: { type: "requirement", id: "REQ-001" },
          target: { type: "requirements-model", id: "usecase:approve-loan" },
          direction: "forward",
          relation: "satisfies",
          confidence: 0.9,
          rationale: "actor/action/object/condition/outcome slots align.",
        },
        {
          id: "TRACE-002",
          source: { type: "test", id: "approval-flow.spec.ts" },
          target: { type: "requirement", id: "REQ-001" },
          direction: "backward",
          relation: "verifies",
          confidence: 0.88,
          rationale: "browser assertion verifies permission and state transition.",
        },
      ],
      diagnostics: resolved
        ? []
        : [
            {
              code: "fake-shallow-trace",
              severity: "error",
              artifactId: "TRACE-FAKE",
              requirementId: "REQ-003",
              message: "只有关键词重叠，没有 actor/action/object/condition 语义证据。",
              blocksCompletion: true,
            },
          ],
    },
    modelArtifacts: [],
    codeArtifacts: [
      {
        id: "src/workflows/approval.ts",
        kind: "code",
        label: "审批业务流",
        requirementIds: ["REQ-001", "REQ-003"],
      },
    ],
    businessAssertionResults: {
      runId,
      status: resolved ? "passed" : "blocked",
      assertions: [
        {
          id: "ASSERT-PERMISSION",
          requirementId: "REQ-001",
          category: "permission",
          status: "passed",
          message: "未授权用户被拒绝。",
          evidence: ["BR-PERMISSION"],
        },
        {
          id: "ASSERT-IDEMPOTENCY",
          requirementId: "REQ-001",
          category: "idempotency",
          status: "passed",
          message: "重复审批不会产生重复记录。",
          evidence: ["BR-IDEMPOTENCY"],
        },
      ],
      blockingAssertionIds: [],
      uiOnlyRequirementIds: [],
    },
    browserEvidence: [
      {
        id: "BR-SCREENSHOT",
        kind: "screenshot",
        label: "EvidencePackage 页面截图已记录",
        artifactId: "REQ-001",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-DOM",
        kind: "dom",
        label: "DOM 快照包含 baseline coverage traceability",
        artifactId: "REQ-001",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-CONSOLE",
        kind: "console",
        label: "Console 无错误",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-NETWORK",
        kind: "network",
        label: "Network 无失败请求",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-PERMISSION",
        kind: "assertion",
        label: "生成 workflow 权限守卫拒绝未授权用户",
        artifactId: "REQ-001",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-REQUIRED",
        kind: "assertion",
        label: "生成 workflow 必填字段阻断提交",
        artifactId: "REQ-003",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-STATE",
        kind: "assertion",
        label: "生成 workflow 状态流转按审批规则执行",
        artifactId: "REQ-001",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-BOUNDARY",
        kind: "assertion",
        label: "生成 workflow 边界值显示异常反馈",
        artifactId: "REQ-003",
        status: "passed",
        capturedAt: now,
      },
      {
        id: "BR-IDEMPOTENCY",
        kind: "assertion",
        label: "生成 workflow 重复操作保持幂等",
        artifactId: "REQ-001",
        status: "passed",
        capturedAt: now,
      },
    ],
    reviewItems: [
      {
        id: "REV-CONFLICT",
        source: "conflict",
        status: resolved ? "resolved" : "pending",
        severity: "error",
        requirementId: "REQ-002",
        reason: "conflict 阻断：订单取消规则互相矛盾。",
      },
      {
        id: "REV-LOW-CONFIDENCE",
        source: "requirement-quality",
        status: resolved ? "resolved" : "pending",
        severity: "error",
        requirementId: "REQ-003",
        reason: "low-confidence critical requirement 阻断：需要人工确认语义。",
      },
      {
        id: "REV-PARTIAL",
        source: "coverage",
        status: resolved ? "resolved" : "pending",
        severity: "error",
        requirementId: "REQ-003",
        reason: "critical partial coverage 阻断：设计元素未完整解释覆盖关系。",
      },
      {
        id: "REV-NOT-MODELABLE",
        source: "assumption",
        status: resolved ? "resolved" : "pending",
        severity: "warning",
        requirementId: "REQ-004",
        reason: "not-modelable 非功能需求必须走替代证据路径。",
      },
    ].map((item) =>
      resolved
        ? {
            ...item,
            decision: {
              id: `DEC-${item.id}`,
              reviewItemId: item.id,
              decision: "accepted-risk",
              comment: "人工复核确认替代证据和风险可接受。",
              decidedAt: "2026-05-24T08:10:00.000Z",
            },
          }
        : item,
    ),
    reviewDecisions: resolved
      ? ["REV-CONFLICT", "REV-LOW-CONFIDENCE", "REV-PARTIAL", "REV-NOT-MODELABLE"].map(
          (reviewItemId) => ({
            id: `DEC-${reviewItemId}`,
            reviewItemId,
            decision: "accepted-risk",
            comment: "人工复核确认替代证据和风险可接受。",
            decidedAt: "2026-05-24T08:10:00.000Z",
          }),
        )
      : [],
    failureRecords: resolved
      ? []
      : [
          {
            id: "FAIL-BLOCKED",
            stage: "evidence-review",
            message: "EvidencePackage review is unresolved.",
            requirementIds: ["REQ-002", "REQ-003", "REQ-004"],
            occurredAt: now,
          },
        ],
    repairRecords: [],
  };
}

async function mockTrustedChainApi(page: Parameters<typeof test>[0]["page"]) {
  let evidence = createEvidencePackage("blocked");
  const requests: Array<{ method: string; url: string }> = [];

  await page.route("http://127.0.0.1:4001/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    requests.push({ method: request.method(), url: request.url() });

    if (pathname === "/api/auth/me") {
      await route.fulfill(
        json({
          user: {
            id: "user-1",
            email: "reviewer@example.com",
            displayName: "Reviewer",
            status: "active",
            emailVerified: true,
            mfaEnabled: false,
          },
          session: {
            id: "session-1",
            userId: "user-1",
            createdAt: now,
            expiresAt: "2026-05-25T08:00:00.000Z",
            lastSeenAt: now,
            ipAddress: "127.0.0.1",
            userAgent: "Playwright",
          },
        }),
      );
      return;
    }

    if (pathname === `/api/projects/${projectId}`) {
      await route.fulfill(
        json({
          project: {
            id: projectId,
            name: "可信生成验收项目",
            description: "Phase 7 browser acceptance",
            visibility: "private",
            status: "active",
            ownerUserId: "user-1",
            updatedAt: now,
            memberCount: 1,
          },
          membership: {
            id: "member-1",
            projectId,
            userId: "user-1",
            email: "reviewer@example.com",
            displayName: "Reviewer",
            role: "owner",
            status: "active",
            joinedAt: now,
          },
        }),
      );
      return;
    }

    if (pathname === `/api/projects/${projectId}/members`) {
      await route.fulfill(
        json({
          members: [
            {
              id: "member-1",
              projectId,
              userId: "user-1",
              email: "reviewer@example.com",
              displayName: "Reviewer",
              role: "owner",
              status: "active",
              joinedAt: now,
            },
          ],
        }),
      );
      return;
    }

    if (pathname === `/api/projects/${projectId}/documents`) {
      await route.fulfill(json({ documents: [] }));
      return;
    }

    if (pathname === `/api/projects/${projectId}/workspace`) {
      await route.fulfill(
        json({
          projectId,
          version: 1,
          state: {
            requirementText:
              "图书馆管理员必须能审批借阅申请；冲突、低置信关键需求和非功能需求必须复核。",
            selectedDiagramTypes: [],
            generatedDiagramTypes: [],
            rules: [],
          },
        }),
      );
      return;
    }

    if (pathname === `/api/projects/${projectId}/runs`) {
      const snapshot = createRunSnapshot();
      await route.fulfill(
        json({
          generatedAt: now,
          projectId,
          runs: [
            {
              id: runId,
              runId,
              createdAt: now,
              updatedAt: now,
              startedAt: now,
              completedAt: now,
              title: "可信链路验收运行",
              status: "completed",
              runKind: "requirements",
              providerModel: "test-model",
              model: "test-model",
              snapshotAvailable: true,
              canRestore: true,
              snapshot,
            },
          ],
        }),
      );
      return;
    }

    if (pathname === `/api/projects/${projectId}/runs/${runId}/evidence`) {
      await route.fulfill(json({ projectId, evidencePackage: evidence }));
      return;
    }

    if (
      pathname === `/api/projects/${projectId}/runs/${runId}/review-decisions` &&
      request.method() === "POST"
    ) {
      evidence = createEvidencePackage("complete");
      await route.fulfill(json({ projectId, evidencePackage: evidence }));
      return;
    }

    await route.fulfill(json({ message: `Unhandled mock route: ${pathname}` }));
  });

  return requests;
}

test("trusted-chain evidence is visible, reviewable, exportable, and captured", async ({
  page,
}, testInfo) => {
  const consoleMessages: Array<{ type: string; text: string }> = [];
  const failedRequests: Array<{ url: string; failure: string | null }> = [];
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText ?? null,
    });
  });
  const requests = await mockTrustedChainApi(page);

  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "可信证据" }).click();

  await expect(page.getByRole("heading", { name: "可信证据包" })).toBeVisible();
  await expect(page.getByText("EvidencePackage 待复核")).toBeVisible();
  await expect(page.getByRole("heading", { name: "RequirementBaseline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CoverageMatrix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TraceabilityMatrix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "浏览器验收证据" })).toBeVisible();
  await expect(page.getByText("conflict 阻断")).toBeVisible();
  await expect(page.getByText("low-confidence critical requirement 阻断")).toBeVisible();
  await expect(page.getByText("critical partial coverage 阻断")).toBeVisible();
  await expect(page.getByText("not-modelable 非功能需求")).toBeVisible();
  await expect(page.getByText("生成 workflow 权限守卫拒绝未授权用户")).toBeVisible();
  await expect(page.getByText("生成 workflow 必填字段阻断提交")).toBeVisible();
  await expect(page.getByText("生成 workflow 状态流转按审批规则执行")).toBeVisible();
  await expect(page.getByText("生成 workflow 边界值显示异常反馈")).toBeVisible();
  await expect(page.getByText("生成 workflow 重复操作保持幂等")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("evidence-blocked.png"),
    fullPage: true,
  });
  await fs.writeFile(
    testInfo.outputPath("evidence-blocked.html"),
    await page.content(),
    "utf8",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 EvidencePackage JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = testInfo.outputPath("evidence-package.json");
  await download.saveAs(exportedPath);
  await expect
    .poll(async () => JSON.parse(await fs.readFile(exportedPath, "utf8")).runId)
    .toBe(runId);

  await page.getByRole("button", { name: "接受风险并记录决策" }).first().click();
  await expect(page.getByText("EvidencePackage 已完成")).toBeVisible();
  await expect(page.getByText("当前证据包没有未解决复核项。")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("evidence-reviewed.png"),
    fullPage: true,
  });
  await fs.writeFile(
    testInfo.outputPath("evidence-reviewed.html"),
    await page.content(),
    "utf8",
  );
  await fs.writeFile(
    testInfo.outputPath("console-network.json"),
    JSON.stringify({ consoleMessages, failedRequests, requests }, null, 2),
    "utf8",
  );

  expect(failedRequests).toEqual([]);
  expect(consoleMessages.filter((message) => message.type === "error")).toEqual([]);
});

test("representative generated workflow enforces business assertions in browser", async ({
  page,
}, testInfo) => {
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>Generated Workflow Acceptance</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #18212f; }
          main { max-width: 720px; display: grid; gap: 16px; }
          label { display: grid; gap: 6px; font-weight: 600; }
          input, select, button { min-height: 36px; font: inherit; }
          button { width: fit-content; padding: 0 14px; }
          #feedback { min-height: 28px; padding: 10px 12px; border: 1px solid #bac6d8; }
          #status { font-weight: 700; }
        </style>
      </head>
      <body>
        <main>
          <h1>审批工作流</h1>
          <label>角色
            <select id="role" aria-label="角色">
              <option value="viewer">访客</option>
              <option value="approver">审批人</option>
            </select>
          </label>
          <label>申请编号
            <input id="requestId" aria-label="申请编号" />
          </label>
          <label>金额
            <input id="amount" aria-label="金额" type="number" />
          </label>
          <button id="submit" type="button">提交审批</button>
          <button id="approve" type="button">批准</button>
          <div>状态：<span id="status">draft</span></div>
          <div>批准次数：<span id="approvalCount">0</span></div>
          <div id="feedback" role="status" aria-live="polite"></div>
        </main>
        <script>
          const role = document.querySelector("#role");
          const requestId = document.querySelector("#requestId");
          const amount = document.querySelector("#amount");
          const status = document.querySelector("#status");
          const approvalCount = document.querySelector("#approvalCount");
          const feedback = document.querySelector("#feedback");
          const setFeedback = (message) => { feedback.textContent = message; };
          document.querySelector("#submit").addEventListener("click", () => {
            if (role.value !== "approver") {
              setFeedback("未授权用户不能审批");
              return;
            }
            if (!requestId.value.trim()) {
              setFeedback("申请编号必填");
              return;
            }
            const numericAmount = Number(amount.value);
            if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
              setFeedback("金额必须大于0");
              return;
            }
            if (numericAmount > 100) {
              setFeedback("金额不能超过100");
              return;
            }
            status.textContent = "pending";
            setFeedback("申请已提交，等待批准");
          });
          document.querySelector("#approve").addEventListener("click", () => {
            if (status.textContent === "approved") {
              setFeedback("重复审批已忽略");
              return;
            }
            if (status.textContent !== "pending") {
              setFeedback("只有待审批状态可以批准");
              return;
            }
            status.textContent = "approved";
            approvalCount.textContent = String(Number(approvalCount.textContent) + 1);
            setFeedback("审批已通过");
          });
        </script>
      </body>
    </html>
  `);

  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("未授权用户不能审批");

  await page.getByLabel("角色").selectOption("approver");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("申请编号必填");

  await page.getByLabel("申请编号").fill("REQ-001");
  await page.getByLabel("金额").fill("-1");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("金额必须大于0");

  await page.getByLabel("金额").fill("101");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("金额不能超过100");

  await page.getByLabel("金额").fill("80");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByText("状态：pending")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("申请已提交，等待批准");

  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.getByText("状态：approved")).toBeVisible();
  await expect(page.locator("#approvalCount")).toHaveText("1");
  await expect(page.getByRole("status")).toHaveText("审批已通过");

  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.locator("#approvalCount")).toHaveText("1");
  await expect(page.getByRole("status")).toHaveText("重复审批已忽略");

  await page.screenshot({
    path: testInfo.outputPath("generated-workflow-accepted.png"),
    fullPage: true,
  });
  await fs.writeFile(
    testInfo.outputPath("generated-workflow.html"),
    await page.content(),
    "utf8",
  );
});
