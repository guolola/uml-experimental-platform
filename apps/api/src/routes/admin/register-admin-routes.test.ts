// Verifies admin API security, telemetry, and provider configuration contracts.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { createApiServer } from "../../index.js";
import { createMockPaymentAdapter } from "../../adapters/payments/mock-payment-adapter.js";
import type { PaymentProviderRegistry } from "../../adapters/payments/types.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createBillingService } from "../../billing/billing-service.js";
import { createInMemoryBillingRepository } from "../../billing/in-memory-billing-repository.js";
import { hashPassword } from "../../security/password-hashing.js";
import { createFileDocumentLibrary } from "../../documents/library/document-library.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderRateLimitPolicyRecord,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import {
  createRunRecordStore,
  type RunRecord,
  type RunRecordStore,
} from "../../runs/records/run-record-store.js";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "../../runs/records/snapshots.js";
import { buildRequirementBaseline } from "../../runs/baselines/requirement-baseline.js";
import { createInMemoryAcademicAdminRepository } from "../../db/academic-admin-repository.js";
import { registerAdminRoutes } from "./register-admin-routes.js";
import type { AdminRiskEvent } from "./register-admin-routes.js";

const ADMIN_HEADERS = {
  "x-uml-admin-role": "super-admin",
};

function createChatProbeStream(content: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function mockPaymentProviders(): PaymentProviderRegistry {
  return {
    wechat_native: createMockPaymentAdapter({
      channel: "wechat_native",
      nodeEnv: "test",
      secret: "admin-routes-billing-test-secret",
    }),
    alipay_page: createMockPaymentAdapter({
      channel: "alipay_page",
      nodeEnv: "test",
      secret: "admin-routes-billing-test-secret",
    }),
  };
}

async function createAdminBillingService() {
  const billingService = createBillingService({
    repository: createInMemoryBillingRepository(),
    paymentProviders: mockPaymentProviders(),
    nodeEnv: "test",
    now: () => new Date("2026-06-05T04:00:00.000Z"),
  });
  await billingService.ensureSkuCatalog();
  return billingService;
}

async function createSessionCookie(
  authStore: ReturnType<typeof createInMemoryAuthStore>,
  userId: string,
) {
  const session = await authStore.createSession({
    userId,
    ipAddress: "127.0.0.1",
    userAgent: "admin-routes-test",
  });
  return `uml_session=${encodeURIComponent(session.id)}`;
}

async function createAdminSessionCookie(
  authStore: ReturnType<typeof createInMemoryAuthStore>,
  userId: string,
) {
  const session = await authStore.createSession({
    userId,
    ipAddress: "127.0.0.1",
    userAgent: "admin-routes-test",
  });
  return `uml_admin_session=${encodeURIComponent(session.id)}`;
}

async function createAdminSessionApp(
  options?: Parameters<typeof createApiServer>[0],
) {
  const authStore = createInMemoryAuthStore();
  const admin = authStore.createUser({
    email: "admin@example.com",
    displayName: "Admin User",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["super_admin"],
  });
  assert.ok(admin);
  authStore.updateUser(admin.id, { mfaEnabled: true, mfaSecret: "TESTADMINMFASECRET" });
  const app = await createApiServer({ ...options, authStore });

  return { app, authStore, cookie: await createAdminSessionCookie(authStore, admin.id) };
}

function putRunRecord(
  runs: RunRecordStore,
  input: {
    runId: string;
    projectId: string;
    status: RunRecord["snapshot"]["status"];
    terminal?: boolean;
    completedAt?: string;
    userId?: string;
    model?: string;
  },
) {
  const snapshot = createEmptySnapshot(
    input.runId,
    `需求 ${input.runId}`,
    ["usecase"],
  );
  snapshot.status = input.status;
  snapshot.currentStage = input.status === "queued" ? null : "generate_models";
  snapshot.error =
    input.status === "failed"
      ? {
          code: "RUN_INTERNAL_ERROR",
          message: "LLM failed",
          category: "internal",
          retryable: false,
        }
      : null;
  if (input.model) {
    (snapshot as unknown as { providerSettings?: { model: string } }).providerSettings = {
      model: input.model,
    };
  }
  runs.set(input.runId, {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: input.terminal ?? (input.status === "failed" || input.status === "cancelled"),
    metadata: {
      projectId: input.projectId,
      userId: input.userId ?? "source-user",
      model: input.model,
      createdAt: "2026-05-22T00:00:00.000Z",
      completedAt: input.completedAt,
    },
  });
}

function shanghaiTodayIso(hour: number, minute = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(
    Date.UTC(part("year"), part("month") - 1, part("day"), hour, minute) -
      8 * 60 * 60 * 1000,
  ).toISOString();
}

function shanghaiYesterdayIso(hour: number, minute = 0) {
  return shanghaiDaysAgoIso(1, hour, minute);
}

function shanghaiDaysAgoIso(daysAgo: number, hour: number, minute = 0) {
  return new Date(new Date(shanghaiTodayIso(hour, minute)).getTime() - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString();
}

function shanghaiDateFromIso(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function putMetricRun(
  runs: RunRecordStore,
  input: {
    runId: string;
    snapshot: RunRecord["snapshot"];
    status: RunRecord["snapshot"]["status"];
    createdAt: string;
    completedAt?: string;
  },
) {
  input.snapshot.status = input.status;
  input.snapshot.currentStage = input.status === "queued" ? null : "generate_models";
  runs.set(input.runId, {
    snapshot: input.snapshot,
    events: [],
    listeners: new Set(),
    terminal: ["completed", "failed", "cancelled"].includes(input.status),
    metadata: {
      projectId: "project-alpha",
      userId: "source-user",
      createdAt: input.createdAt,
      completedAt: input.completedAt,
    },
  });
}

async function createAdminRouteTestApp({
  providerUsageTracker,
  riskEvents,
  runs = createRunRecordStore(),
  documentLibrary = {} as DocumentLibrary,
  llmScheduler,
  startRunPipeline,
}: {
  providerUsageTracker?: ProviderUsageTracker;
  riskEvents?: () => AdminRiskEvent[];
  runs?: RunRecordStore;
  documentLibrary?: DocumentLibrary;
  llmScheduler?: Parameters<typeof registerAdminRoutes>[0]["llmScheduler"];
  startRunPipeline?: Parameters<typeof registerAdminRoutes>[0]["startRunPipeline"];
} = {}) {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const admin = authStore.createUser({
    email: "admin@example.com",
    displayName: "Admin User",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["super_admin"],
  });
  assert.ok(admin);
  authStore.updateUser(admin.id, { mfaEnabled: true, mfaSecret: "TESTADMINMFASECRET" });
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  registerAdminRoutes({
    app,
    authStore,
    runs,
    documentLibrary,
    providerConfigs,
    providerUsageTracker,
    llmScheduler,
    startRunPipeline,
    riskEvents,
  });
  return {
    app,
    authStore,
    providerConfigs,
    cookie: await createAdminSessionCookie(authStore, admin.id),
  };
}

test("admin risk events endpoint exposes recorded document security events", async () => {
  const { app, cookie } = await createAdminRouteTestApp({
    riskEvents: () => [
      {
        id: "risk-1",
        eventType: "document.onlyoffice_callback_oversized",
        severity: "high",
        actorUserId: "user-alpha",
        projectId: "project-alpha",
        targetType: "document",
        targetId: "doc-1",
        message: "OnlyOffice save download exceeded 4 bytes",
        metadata: { maxBytes: 4 },
        createdAt: "2026-05-22T00:00:00.000Z",
      },
    ],
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/risk-events",
      headers: { Cookie: cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.json().riskEvents[0].eventType,
      "document.onlyoffice_callback_oversized",
    );
  } finally {
    await app.close();
  }
});

function createPolicyAwareUsageTracker(options?: {
  checkAllowed?: boolean;
  onCheck?: (input: {
    userId: string | null;
    projectId: string | null;
    providerConfigId: string;
    taskType: string;
    limit: number;
    windowSeconds: number;
  }) => void;
}): ProviderUsageTracker {
  const policies: ProviderRateLimitPolicyRecord[] = [];
  return {
    async recordUsage() {
      return undefined;
    },
    async checkLimit(input) {
      options?.onCheck?.(input);
      return {
        allowed: options?.checkAllowed ?? true,
        usedUnits: options?.checkAllowed === false ? input.limit : 0,
        remainingUnits: options?.checkAllowed === false ? 0 : input.limit,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      };
    },
    async listRateLimitPolicies() {
      return [...policies];
    },
    async createRateLimitPolicy(input) {
      const now = "2026-05-22T00:00:00.000Z";
      const policy = {
        id: `policy-${policies.length + 1}`,
        createdAt: now,
        updatedAt: now,
        ...input,
        scopeId: input.scopeId ?? null,
        providerConfigId: input.providerConfigId ?? null,
        taskType: input.taskType ?? null,
        enabled: input.enabled ?? true,
      };
      policies.push(policy);
      return policy;
    },
    async updateRateLimitPolicy(id, input) {
      const policy = policies.find((item) => item.id === id);
      if (!policy) return null;
      Object.assign(policy, input, {
        updatedAt: "2026-05-22T00:01:00.000Z",
      });
      return policy;
    },
  };
}

test("admin endpoints require an authenticated user with a system admin role", async () => {
  const { app, cookie } = await createAdminSessionApp();

  const blocked = await app.inject({
    method: "GET",
    url: "/api/admin/metrics",
  });
  const allowed = await app.inject({
    method: "GET",
    url: "/api/admin/metrics",
    headers: { cookie },
  });

  assert.equal(blocked.statusCode, 403);
  assert.match(blocked.body, /admin/i);
  assert.equal(allowed.statusCode, 200);
  assert.equal(typeof allowed.json().generatedAt, "string");

  await app.close();
});

test("admin header bootstrap is disabled unless explicitly allowed", async () => {
  const originalAllowHeader = process.env.UML_ALLOW_ADMIN_HEADER;
  delete process.env.UML_ALLOW_ADMIN_HEADER;
  const app = await createApiServer();

  try {
    const blocked = await app.inject({
      method: "GET",
      url: "/api/admin/metrics",
      headers: ADMIN_HEADERS,
    });

    assert.equal(blocked.statusCode, 403);
    assert.match(blocked.body, /admin/i);
  } finally {
    await app.close();
    if (originalAllowHeader === undefined) {
      delete process.env.UML_ALLOW_ADMIN_HEADER;
    } else {
      process.env.UML_ALLOW_ADMIN_HEADER = originalAllowHeader;
    }
  }
});

test("admin header bootstrap remains available behind the explicit local switch", async () => {
  const originalAllowHeader = process.env.UML_ALLOW_ADMIN_HEADER;
  process.env.UML_ALLOW_ADMIN_HEADER = "true";
  const app = await createApiServer();

  try {
    const allowed = await app.inject({
      method: "GET",
      url: "/api/admin/metrics",
      headers: ADMIN_HEADERS,
    });

    assert.equal(allowed.statusCode, 200);
  } finally {
    await app.close();
    if (originalAllowHeader === undefined) {
      delete process.env.UML_ALLOW_ADMIN_HEADER;
    } else {
      process.env.UML_ALLOW_ADMIN_HEADER = originalAllowHeader;
    }
  }
});

test("admin metrics expose cumulative overview and single-day generation breakdowns", async () => {
  const runs = createRunRecordStore();
  const todayOne = shanghaiYesterdayIso(1);
  const todayTwo = shanghaiYesterdayIso(2);
  const todayThree = shanghaiYesterdayIso(3);
  const todayFourThirty = shanghaiYesterdayIso(4, 30);
  const todayFourThirtyFive = shanghaiYesterdayIso(4, 35);
  const yesterday = shanghaiDaysAgoIso(2, 1);

  const requirementSnapshot = createEmptySnapshot("req-completed", "需求", ["usecase"]);
  (requirementSnapshot as unknown as { rules: unknown[]; models: unknown[] }).rules = [
    { id: "rule-1", text: "规则 1" },
    { id: "rule-2", text: "规则 2" },
  ];
  (requirementSnapshot as unknown as { models: unknown[] }).models = [{ id: "model-1" }];
  putMetricRun(runs, {
    runId: "req-completed",
    snapshot: requirementSnapshot,
    status: "completed",
    createdAt: todayOne,
    completedAt: todayTwo,
  });

  putMetricRun(runs, {
    runId: "req-failed",
    snapshot: createEmptySnapshot("req-failed", "失败需求", ["usecase"]),
    status: "failed",
    createdAt: todayOne,
    completedAt: todayTwo,
  });
  const yesterdayRequirementSnapshot = createEmptySnapshot("req-yesterday", "昨日需求", ["usecase"]);
  (yesterdayRequirementSnapshot as unknown as { rules: unknown[]; models: unknown[] }).rules = [
    { id: "rule-yesterday", text: "昨日规则" },
  ];
  (yesterdayRequirementSnapshot as unknown as { models: unknown[] }).models = [{ id: "model-yesterday" }];
  putMetricRun(runs, {
    runId: "req-yesterday",
    snapshot: yesterdayRequirementSnapshot,
    status: "completed",
    createdAt: yesterday,
    completedAt: yesterday,
  });

  const designSnapshot = createEmptySnapshot("design-completed", "设计", ["class"]);
  (designSnapshot as unknown as { designModelTraceability: unknown[]; models: unknown[] }).designModelTraceability = [];
  (designSnapshot as unknown as { models: unknown[] }).models = [{ id: "design-1" }, { id: "design-2" }];
  putMetricRun(runs, {
    runId: "design-completed",
    snapshot: designSnapshot,
    status: "completed",
    createdAt: todayOne,
    completedAt: todayThree,
  });

  const codeSnapshot = createEmptyCodeSnapshot("code-completed", {
    designModels: [],
  });
  codeSnapshot.files = { "/src/App.tsx": "export default null", "/src/main.tsx": "main" };
  putMetricRun(runs, {
    runId: "code-completed",
    snapshot: codeSnapshot,
    status: "completed",
    createdAt: todayOne,
    completedAt: todayTwo,
  });

  const quickCodeSnapshot = createEmptyCodeSnapshot("code-quick", {
    designModels: [],
  });
  quickCodeSnapshot.files = { "/src/Quick.tsx": "export default null" };
  putMetricRun(runs, {
    runId: "code-quick",
    snapshot: quickCodeSnapshot,
    status: "completed",
    createdAt: todayFourThirty,
    completedAt: todayFourThirtyFive,
  });

  const documentRequirement = createEmptyDocumentSnapshot("doc-requirements", {
    documentKind: "requirementsSpec",
    requirementText: "需求说明",
  });
  documentRequirement.documentId = "doc-req";
  putMetricRun(runs, {
    runId: "doc-requirements",
    snapshot: documentRequirement,
    status: "completed",
    createdAt: todayOne,
    completedAt: todayTwo,
  });

  const documentDesign = createEmptyDocumentSnapshot("doc-design", {
    documentKind: "softwareDesignSpec",
    requirementText: "设计说明",
  });
  documentDesign.documentId = "doc-design";
  putMetricRun(runs, {
    runId: "doc-design",
    snapshot: documentDesign,
    status: "completed",
    createdAt: todayOne,
    completedAt: todayTwo,
  });

  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage() {},
    async checkLimit(input) {
      return {
        allowed: true,
        usedUnits: 0,
        remainingUnits: input.limit,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      };
    },
    async sumUsageUnits(input) {
      assert.ok(input.createdAfter);
      assert.ok(input.createdBefore);
      if (input.createdAfter === "1970-01-01T00:00:00.000Z") {
        return [
          { taskType: "requirements_to_uml", units: 6 },
          { taskType: "design_modeling", units: 2 },
          { taskType: "document_generation", units: 1 },
          { taskType: "code_generation", units: 4 },
        ];
      }
      if (input.createdAfter === shanghaiDaysAgoIso(2, 0)) {
        return [
          { taskType: "requirements_to_uml", units: 2 },
          { taskType: "design_modeling", units: 0 },
          { taskType: "document_generation", units: 0 },
          { taskType: "code_generation", units: 0 },
        ];
      }
      return [
        { taskType: "requirements_to_uml", units: 4 },
        { taskType: "design_modeling", units: 2 },
        { taskType: "document_generation", units: 1 },
        { taskType: "code_generation", units: 4 },
      ];
    },
  };
  const documentLibrary = {
    async listAllDocuments() {
      return [
        {
          id: "doc-req",
          sourceRunId: "doc-requirements",
          documentKind: "requirementsSpec",
          createdAt: todayTwo,
          status: "active",
        },
        {
          id: "doc-design",
          sourceRunId: "doc-design",
          documentKind: "softwareDesignSpec",
          createdAt: todayTwo,
          status: "active",
        },
      ];
    },
  } as unknown as DocumentLibrary;
  const { app, cookie } = await createAdminRouteTestApp({
    runs,
    providerUsageTracker,
    documentLibrary,
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/admin/metrics?date=${shanghaiDateFromIso(todayOne)}`,
    headers: { Cookie: cookie },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.metricWindow.timeZone, "Asia/Shanghai");
  assert.equal(body.metrics.find((item: { label: string }) => item.label === "生成次数")?.value, "8");
  assert.equal(body.metrics.find((item: { label: string }) => item.label === "今日生成次数"), undefined);
  assert.equal(body.metrics.find((item: { label: string }) => item.label === "模型调用量")?.value, "13");
  assert.equal(body.metrics.find((item: { label: string }) => item.label === "文档生成量")?.value, "2");
  assert.equal(body.metrics.find((item: { label: string }) => item.label === "平均耗时")?.value === "n/a", false);
  assert.doesNotMatch(JSON.stringify(body), /first-pass|live auth store|live project store/);

  const totalByType = new Map(
    body.totalGenerationBreakdown.map((row: { taskType: string }) => [row.taskType, row]),
  );
  const totalRequirements = totalByType.get("requirements_to_uml") as Record<string, unknown>;
  assert.equal(totalRequirements.generatedCount, 3);
  assert.equal(totalRequirements.successRate, "67%");
  assert.equal(totalRequirements.failureRate, "33%");
  assert.equal(totalRequirements.modelCallCount, 6);
  const totalDesign = totalByType.get("design_modeling") as Record<string, unknown>;
  assert.equal(totalDesign.generatedCount, 1);
  assert.equal(totalDesign.modelCallCount, 2);
  const totalDocuments = totalByType.get("document_generation") as Record<string, unknown>;
  assert.equal(totalDocuments.generatedCount, 2);
  assert.equal(totalDocuments.modelCallCount, 1);
  const totalCode = totalByType.get("code_generation") as Record<string, unknown>;
  assert.equal(totalCode.generatedCount, 2);
  assert.equal(totalCode.modelCallCount, 4);

  const byType = new Map(
    body.generationBreakdown.map((row: { taskType: string }) => [row.taskType, row]),
  );
  const requirements = byType.get("requirements_to_uml") as Record<string, unknown>;
  assert.equal(requirements.generatedCount, 2);
  assert.equal(requirements.successRate, "50%");
  assert.equal(requirements.failureRate, "50%");
  assert.equal(requirements.modelCallCount, 4);
  assert.equal(requirements.artifactSummary, "规则 2 · 需求模型 1");

  const design = byType.get("design_modeling") as Record<string, unknown>;
  assert.equal(design.generatedCount, 1);
  assert.equal(design.artifactSummary, "设计模型 2");
  assert.equal(design.modelCallCount, 2);

  const documents = byType.get("document_generation") as Record<string, unknown>;
  assert.equal(documents.generatedCount, 2);
  assert.equal(documents.artifactSummary, "需求规格说明书 1 · 软件设计说明书 1");
  assert.equal(documents.modelCallCount, 1);

  const code = byType.get("code_generation") as Record<string, unknown>;
  assert.equal(code.generatedCount, 2);
  assert.equal(code.artifactSummary, "代码文件 3");
  assert.equal(code.averageDuration, "32.5分钟");
  assert.equal(code.modelCallCount, 4);

  const yesterdayResponse = await app.inject({
    method: "GET",
    url: `/api/admin/metrics?date=${shanghaiDateFromIso(yesterday)}`,
    headers: { Cookie: cookie },
  });
  assert.equal(yesterdayResponse.statusCode, 200);
  const yesterdayBody = yesterdayResponse.json();
  assert.equal(yesterdayBody.metrics.find((item: { label: string }) => item.label === "生成次数")?.value, "8");
  assert.equal(yesterdayBody.metrics.find((item: { label: string }) => item.label === "模型调用量")?.value, "13");
  const yesterdayTotalRequirements = new Map(
    yesterdayBody.totalGenerationBreakdown.map((row: { taskType: string }) => [row.taskType, row]),
  ).get("requirements_to_uml") as Record<string, unknown>;
  assert.equal(yesterdayTotalRequirements.generatedCount, 3);
  assert.equal(yesterdayTotalRequirements.modelCallCount, 6);
  const yesterdayByType = new Map(
    yesterdayBody.generationBreakdown.map((row: { taskType: string }) => [row.taskType, row]),
  );
  const yesterdayRequirements = yesterdayByType.get("requirements_to_uml") as Record<string, unknown>;
  assert.equal(yesterdayRequirements.generatedCount, 1);
  assert.equal(yesterdayRequirements.successRate, "100%");
  assert.equal(yesterdayRequirements.artifactSummary, "规则 1 · 需求模型 1");
  assert.equal(yesterdayRequirements.modelCallCount, 2);
  const yesterdayDesign = yesterdayByType.get("design_modeling") as Record<string, unknown>;
  assert.equal(yesterdayDesign.generatedCount, 0);
  assert.equal(yesterdayDesign.artifactSummary, "暂无所选日期产物");

  const invalidDate = await app.inject({
    method: "GET",
    url: "/api/admin/metrics?date=2026-13-01",
    headers: { Cookie: cookie },
  });
  assert.equal(invalidDate.statusCode, 400);
  const futureDate = await app.inject({
    method: "GET",
    url: "/api/admin/metrics?date=2999-01-01",
    headers: { Cookie: cookie },
  });
  assert.equal(futureDate.statusCode, 400);

  await app.close();
});

test("admin session endpoint returns RBAC context only for authenticated admins", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const regular = authStore.createUser({
    email: "regular@example.com",
    displayName: "Regular User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(regular);
  const regularCookie = await createSessionCookie(authStore, regular.id);

  const anonymous = await app.inject({
    method: "GET",
    url: "/api/admin/session",
  });
  const blocked = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie: regularCookie },
  });
  const allowed = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie },
  });

  assert.equal(anonymous.statusCode, 401);
  assert.equal(blocked.statusCode, 401);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().user.email, "admin@example.com");
  assert.deepEqual(allowed.json().roles, ["super_admin"]);
  assert.ok(allowed.json().permissions.includes("admin.users.write"));
  assert.ok(allowed.json().capabilities.includes("manageUsers"));
  assert.ok(allowed.json().dataScopes.includes("all_projects"));
  assert.equal(allowed.json().mfaRequired, true);
  assert.doesNotMatch(allowed.body, /passwordHash/i);

  await app.close();
});

test("admin endpoints ignore ordinary frontend sessions", async () => {
  const { app, authStore } = await createAdminSessionApp();
  const admin = await authStore.findUserByEmail("admin@example.com");
  assert.ok(admin);
  const frontendCookie = await createSessionCookie(authStore, admin.id);
  const adminCookie = await createAdminSessionCookie(authStore, admin.id);

  const blocked = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie: frontendCookie },
  });
  const allowed = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie: adminCookie },
  });

  assert.equal(blocked.statusCode, 401);
  assert.equal(allowed.statusCode, 200);

  await app.close();
});

test("admin role users must enable MFA before accessing admin endpoints", async () => {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const admin = authStore.createUser({
    email: "no-mfa-admin@example.com",
    displayName: "No MFA Admin",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["super_admin"],
  });
  assert.ok(admin);
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  registerAdminRoutes({
    app,
    authStore,
    runs: createRunRecordStore(),
    documentLibrary: {} as DocumentLibrary,
    providerConfigs,
  });
  const cookie = await createAdminSessionCookie(authStore, admin.id);

  const session = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie },
  });
  const metrics = await app.inject({
    method: "GET",
    url: "/api/admin/metrics",
    headers: { cookie },
  });

  assert.equal(session.statusCode, 403);
  assert.match(session.body, /MFA/i);
  assert.equal(metrics.statusCode, 403);
  assert.match(metrics.body, /MFA/i);

  await app.close();
});

test("admin endpoints expose real users, projects, and audit logs from the platform store", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const owner = authStore.createUser({
    email: "owner@example.com",
    displayName: "Project Owner",
    passwordHash: hashPassword("password-123"),
    emailVerified: false,
  });
  assert.ok(owner);
  const { project } = authStore.createProject({
    ownerUserId: owner.id,
    name: "真实项目",
    description: "后台应能看到这个项目",
    visibility: "private",
  });
  authStore.recordAuditLog({
    actorUserId: owner.id,
    action: "project.create",
    targetType: "project",
    targetId: project.id,
    outcome: "success",
  });

  const users = await app.inject({
    method: "GET",
    url: "/api/admin/users",
    headers: { cookie },
  });
  const projects = await app.inject({
    method: "GET",
    url: "/api/admin/projects",
    headers: { cookie },
  });
  const auditLogs = await app.inject({
    method: "GET",
    url: "/api/admin/audit-logs",
    headers: { cookie },
  });

  assert.equal(users.statusCode, 200);
  assert.deepEqual(
    users.json().users.map((user: { email: string }) => user.email).sort(),
    ["admin@example.com", "owner@example.com"],
  );
  const ownerUser = users.json().users.find((user: { email: string }) => user.email === "owner@example.com");
  assert.ok(ownerUser);
  assert.equal(ownerUser.emailVerified, false);
  assert.equal(ownerUser.status, "pending_email_verification");
  assert.equal(typeof ownerUser.billingSummary.creditBalance, "number");
  assert.doesNotMatch(users.body, /passwordHash/i);
  assert.equal(projects.statusCode, 200);
  assert.equal(projects.json().projects[0].name, "真实项目");
  assert.equal(auditLogs.statusCode, 200);
  assert.match(auditLogs.body, /project\.create/);

  await app.close();
});

test("admin can view user login records without secret-bearing fields", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const target = authStore.createUser({
    email: "target@example.com",
    displayName: "Target User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(target);
  await authStore.recordLoginEvent({
    userId: target.id,
    email: target.email,
    outcome: "success",
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0 Admin Test",
    message: "Logged in",
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await authStore.recordLoginEvent({
    userId: target.id,
    email: target.email,
    outcome: "failure",
    ipAddress: "10.0.0.8",
    userAgent: "Suspicious Agent",
    message: "MFA code did not match",
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/admin/users/${target.id}/login-records`,
    headers: { cookie },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.email, "target@example.com");
  assert.deepEqual(
    response.json().loginRecords.map((event: { outcome: string }) => event.outcome),
    ["failure", "success"],
  );
  assert.equal(response.json().loginRecords[1].locationLabel, "本机");
  assert.doesNotMatch(response.body, /passwordHash|mfaSecret|uml_admin_session/i);

  await app.close();
});

test("user login record admin route enforces role, data scope, and existence", async () => {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const academicStore = createInMemoryAcademicAdminRepository();
  const runs = createRunRecordStore();
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  registerAdminRoutes({
    app,
    authStore,
    runs,
    documentLibrary: {} as DocumentLibrary,
    providerConfigs,
    academicStore,
  });

  const courseAdmin = authStore.createUser({
    email: "course-admin@example.com",
    displayName: "Course Admin",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["course_admin"],
  });
  const ownerA = authStore.createUser({
    email: "owner-a@example.com",
    displayName: "Owner A",
    passwordHash: hashPassword("password-123"),
  });
  const ownerB = authStore.createUser({
    email: "owner-b@example.com",
    displayName: "Owner B",
    passwordHash: hashPassword("password-123"),
  });
  const regular = authStore.createUser({
    email: "regular@example.com",
    displayName: "Regular User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(courseAdmin);
  assert.ok(ownerA);
  assert.ok(ownerB);
  assert.ok(regular);
  authStore.updateUser(courseAdmin.id, { mfaEnabled: true, mfaSecret: "COURSEADMINMFA" });

  const org = await academicStore.createOrganization({
    name: "软件学院",
    code: null,
    type: "school",
    status: "active",
  });
  const courseA = await academicStore.createCourse({
    organizationId: org.id,
    name: "软件工程 A",
    code: null,
    term: null,
    status: "active",
  });
  const courseB = await academicStore.createCourse({
    organizationId: org.id,
    name: "软件工程 B",
    code: null,
    term: null,
    status: "active",
  });
  await academicStore.createMembership({
    targetType: "course",
    targetId: courseA.id,
    userId: courseAdmin.id,
    email: courseAdmin.email,
    displayName: courseAdmin.displayName,
    role: "course_admin",
    status: "active",
  });
  authStore.createProject({
    ownerUserId: ownerA.id,
    name: "课程 A 项目",
    description: null,
    visibility: "team",
    organizationId: org.id,
    courseId: courseA.id,
  });
  authStore.createProject({
    ownerUserId: ownerB.id,
    name: "课程 B 项目",
    description: null,
    visibility: "team",
    organizationId: org.id,
    courseId: courseB.id,
  });
  const scopedCookie = await createAdminSessionCookie(authStore, courseAdmin.id);
  const regularCookie = await createSessionCookie(authStore, regular.id);

  const allowed = await app.inject({
    method: "GET",
    url: `/api/admin/users/${ownerA.id}/login-records`,
    headers: { cookie: scopedCookie },
  });
  const outOfScope = await app.inject({
    method: "GET",
    url: `/api/admin/users/${ownerB.id}/login-records`,
    headers: { cookie: scopedCookie },
  });
  const missing = await app.inject({
    method: "GET",
    url: "/api/admin/users/missing-user/login-records",
    headers: { cookie: scopedCookie },
  });
  const nonAdmin = await app.inject({
    method: "GET",
    url: `/api/admin/users/${ownerA.id}/login-records`,
    headers: { cookie: regularCookie },
  });

  assert.equal(allowed.statusCode, 200);
  assert.equal(outOfScope.statusCode, 403);
  assert.equal(missing.statusCode, 404);
  assert.equal(nonAdmin.statusCode, 403);
  assert.doesNotMatch(outOfScope.body, /owner-b@example\.com/);

  await app.close();
});

test("admin organization endpoints create, read, and list v1 school/course/class/team data", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const regular = authStore.createUser({
    email: "regular@example.com",
    displayName: "Regular User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(regular);
  const regularCookie = await createSessionCookie(authStore, regular.id);

  const blocked = await app.inject({
    method: "GET",
    url: "/api/admin/organizations",
    headers: { cookie: regularCookie },
  });
  assert.equal(blocked.statusCode, 401);
  assert.match(blocked.body, /Authentication/i);

  const organization = await app.inject({
    method: "POST",
    url: "/api/admin/organizations",
    headers: { cookie },
    payload: {
      name: "工程学院",
      code: "ENG",
      type: "school",
    },
  });
  assert.equal(organization.statusCode, 201);
  assert.equal(organization.json().organization.name, "工程学院");

  const course = await app.inject({
    method: "POST",
    url: "/api/admin/courses",
    headers: { cookie },
    payload: {
      organizationId: organization.json().organization.id,
      name: "软件工程",
      code: "SE101",
      term: "2026 Spring",
    },
  });
  assert.equal(course.statusCode, 201);
  assert.equal(course.json().course.organizationId, organization.json().organization.id);

  const classRecord = await app.inject({
    method: "POST",
    url: "/api/admin/classes",
    headers: { cookie },
    payload: {
      courseId: course.json().course.id,
      name: "一班",
    },
  });
  assert.equal(classRecord.statusCode, 201);
  assert.equal(classRecord.json().class.courseId, course.json().course.id);

  const team = await app.inject({
    method: "POST",
    url: "/api/admin/teams",
    headers: { cookie },
    payload: {
      classId: classRecord.json().class.id,
      name: "建模小组 A",
    },
  });
  assert.equal(team.statusCode, 201);
  assert.equal(team.json().team.classId, classRecord.json().class.id);

  const member = await app.inject({
    method: "POST",
    url: "/api/admin/organization-members",
    headers: { cookie },
    payload: {
      targetType: "course",
      targetId: course.json().course.id,
      userId: regular.id,
      email: regular.email,
      displayName: regular.displayName,
      role: "student",
    },
  });
  assert.equal(member.statusCode, 201);
  assert.equal(member.json().membership.targetId, course.json().course.id);

  const quota = await app.inject({
    method: "POST",
    url: "/api/admin/quotas",
    headers: { cookie },
    payload: {
      scopeType: "course",
      scopeId: course.json().course.id,
      resource: "runs",
      limit: 120,
      resetPeriod: "monthly",
    },
  });
  assert.equal(quota.statusCode, 201);
  assert.equal(quota.json().quota.limit, 120);

  const organizations = await app.inject({
    method: "GET",
    url: "/api/admin/organizations",
    headers: { cookie },
  });
  const courses = await app.inject({
    method: "GET",
    url: "/api/admin/courses",
    headers: { cookie },
  });
  const classes = await app.inject({
    method: "GET",
    url: "/api/admin/classes",
    headers: { cookie },
  });
  const teams = await app.inject({
    method: "GET",
    url: "/api/admin/teams",
    headers: { cookie },
  });
  const members = await app.inject({
    method: "GET",
    url: "/api/admin/organization-members",
    headers: { cookie },
  });
  const quotas = await app.inject({
    method: "GET",
    url: "/api/admin/quotas",
    headers: { cookie },
  });
  const organizationById = await app.inject({
    method: "GET",
    url: `/api/admin/organizations/${organization.json().organization.id}`,
    headers: { cookie },
  });

  assert.equal(organizations.statusCode, 200);
  assert.equal(organizations.json().organizations[0].name, "工程学院");
  assert.equal(courses.statusCode, 200);
  assert.equal(courses.json().courses[0].name, "软件工程");
  assert.equal(classes.statusCode, 200);
  assert.equal(classes.json().classes[0].name, "一班");
  assert.equal(teams.statusCode, 200);
  assert.equal(teams.json().teams[0].name, "建模小组 A");
  assert.equal(members.statusCode, 200);
  assert.equal(members.json().memberships[0].role, "student");
  assert.equal(quotas.statusCode, 200);
  assert.equal(quotas.json().quotas[0].resource, "runs");
  assert.equal(organizationById.statusCode, 200);
  assert.equal(organizationById.json().organization.code, "ENG");

  await app.close();
});

test("course admins only list organization data in their membership scope", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const scopedAdmin = authStore.createUser({
    email: "course-admin@example.com",
    displayName: "Course Admin",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["course_admin"],
  });
  assert.ok(scopedAdmin);
  authStore.updateUser(scopedAdmin.id, {
    mfaEnabled: true,
    mfaSecret: "TESTCOURSEADMINMFASECRET",
  });
  const scopedCookie = await createAdminSessionCookie(authStore, scopedAdmin.id);

  const orgA = await app.inject({
    method: "POST",
    url: "/api/admin/organizations",
    headers: { cookie },
    payload: { name: "工程学院", code: "ENG" },
  });
  const orgB = await app.inject({
    method: "POST",
    url: "/api/admin/organizations",
    headers: { cookie },
    payload: { name: "商学院", code: "BUS" },
  });
  const courseA = await app.inject({
    method: "POST",
    url: "/api/admin/courses",
    headers: { cookie },
    payload: {
      organizationId: orgA.json().organization.id,
      name: "软件工程",
    },
  });
  const courseB = await app.inject({
    method: "POST",
    url: "/api/admin/courses",
    headers: { cookie },
    payload: {
      organizationId: orgB.json().organization.id,
      name: "会计学",
    },
  });
  await app.inject({
    method: "POST",
    url: "/api/admin/classes",
    headers: { cookie },
    payload: {
      courseId: courseA.json().course.id,
      name: "一班",
    },
  });
  await app.inject({
    method: "POST",
    url: "/api/admin/classes",
    headers: { cookie },
    payload: {
      courseId: courseB.json().course.id,
      name: "二班",
    },
  });
  const membership = await app.inject({
    method: "POST",
    url: "/api/admin/organization-members",
    headers: { cookie },
    payload: {
      targetType: "course",
      targetId: courseA.json().course.id,
      userId: scopedAdmin.id,
      email: scopedAdmin.email,
      displayName: scopedAdmin.displayName,
      role: "course_admin",
    },
  });
  assert.equal(membership.statusCode, 201);

  const organizations = await app.inject({
    method: "GET",
    url: "/api/admin/organizations",
    headers: { cookie: scopedCookie },
  });
  const courses = await app.inject({
    method: "GET",
    url: "/api/admin/courses",
    headers: { cookie: scopedCookie },
  });
  const classes = await app.inject({
    method: "GET",
    url: "/api/admin/classes",
    headers: { cookie: scopedCookie },
  });

  assert.equal(organizations.statusCode, 200);
  assert.deepEqual(
    organizations.json().organizations.map((item: { name: string }) => item.name),
    ["工程学院"],
  );
  assert.equal(courses.statusCode, 200);
  assert.deepEqual(
    courses.json().courses.map((item: { name: string }) => item.name),
    ["软件工程"],
  );
  assert.equal(classes.statusCode, 200);
  assert.deepEqual(
    classes.json().classes.map((item: { name: string }) => item.name),
    ["一班"],
  );

  await app.close();
});

test("read-only admin gap endpoints require admin role and expose v1 admin data", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const regular = authStore.createUser({
    email: "regular@example.com",
    displayName: "Regular User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(regular);
  const regularCookie = await createSessionCookie(authStore, regular.id);
  const endpoints = [
    { url: "/api/admin/roles", key: "roles" },
    { url: "/api/admin/prompt-runtime", key: "promptRuntimeItems" },
    { url: "/api/admin/system/config", key: "systemConfig" },
  ] as const;

  for (const endpoint of endpoints) {
    const blocked = await app.inject({
      method: "GET",
      url: endpoint.url,
      headers: { cookie: regularCookie },
    });
    assert.equal(blocked.statusCode, 403);
    assert.match(blocked.body, /admin/i);
  }

  const roles = await app.inject({
    method: "GET",
    url: "/api/admin/roles",
    headers: { cookie },
  });
  const promptRuntime = await app.inject({
    method: "GET",
    url: "/api/admin/prompt-runtime",
    headers: { cookie },
  });
  const systemConfig = await app.inject({
    method: "GET",
    url: "/api/admin/system/config",
    headers: { cookie },
  });

  assert.equal(roles.statusCode, 200);
  assert.ok(
    roles
      .json()
      .roles.some(
        (role: { id: string; permissions: string[]; highRisk: boolean }) =>
          role.id === "super_admin" &&
          role.permissions.includes("admin.users.write") &&
          role.highRisk,
      ),
  );
  assert.equal(promptRuntime.statusCode, 200);
  assert.ok(
    promptRuntime
      .json()
      .promptRuntimeItems.some(
        (item: { id: string; kind: string; status: string }) =>
          item.id === "requirements-modeling-prompt" &&
          item.kind === "prompt" &&
          item.status === "stable",
      ),
  );
  assert.equal(systemConfig.statusCode, 200);
  assert.ok(
    systemConfig
      .json()
      .systemConfig.some(
        (item: { id: string; name: string; auditRequired: boolean }) =>
          item.id === "admin-api" &&
          /API/.test(item.name) &&
          item.auditRequired === false,
      ),
  );
  assert.doesNotMatch(systemConfig.body, /secret|apiKey|passwordHash/i);

  await app.close();
});

test("admin prompt runtime governance actions update state and write audit logs", async () => {
  const { app, cookie } = await createAdminSessionApp();
  const before = await app.inject({
    method: "GET",
    url: "/api/admin/prompt-runtime",
    headers: { cookie },
  });
  assert.equal(before.statusCode, 200);
  const itemId = before.json().promptRuntimeItems[0].id;

  const submitted = await app.inject({
    method: "POST",
    url: `/api/admin/prompt-runtime/${itemId}/submit`,
    headers: { cookie },
  });
  assert.equal(submitted.statusCode, 200);
  assert.equal(submitted.json().promptRuntimeItem.status, "canary");
  assert.equal(submitted.json().auditLog.action, "admin.prompt_runtime.submit");

  const approved = await app.inject({
    method: "POST",
    url: `/api/admin/prompt-runtime/${itemId}/approve`,
    headers: { cookie },
  });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().promptRuntimeItem.status, "stable");

  const rolledBack = await app.inject({
    method: "POST",
    url: `/api/admin/prompt-runtime/${itemId}/rollback`,
    headers: { cookie },
  });
  assert.equal(rolledBack.statusCode, 200);
  assert.equal(rolledBack.json().promptRuntimeItem.status, "rollback-ready");

  const disabled = await app.inject({
    method: "POST",
    url: `/api/admin/prompt-runtime/${itemId}/disable`,
    headers: { cookie },
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.json().promptRuntimeItem.status, "disabled");

  const audit = await app.inject({
    method: "GET",
    url: "/api/admin/audit-logs",
    headers: { cookie },
  });
  assert.match(audit.body, /admin\.prompt_runtime\.disable/);

  await app.close();
});

test("admin role high-risk permission review writes audit logs and requires role write permission", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const roles = await app.inject({
    method: "GET",
    url: "/api/admin/roles",
    headers: { cookie },
  });
  assert.equal(roles.statusCode, 200);
  const roleId = roles.json().roles.find((role: { highRisk: boolean }) => role.highRisk).id as string;

  const reviewed = await app.inject({
    method: "POST",
    url: `/api/admin/roles/${roleId}/high-risk-permissions/review`,
    headers: { cookie },
  });
  assert.equal(reviewed.statusCode, 200);
  assert.equal(reviewed.json().role.id, roleId);
  assert.equal(reviewed.json().auditLog.action, "admin.role_permissions.review");

  const auditor = authStore.createUser({
    email: "role-auditor@example.com",
    displayName: "Role Auditor",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["auditor"],
  });
  assert.ok(auditor);
  authStore.updateUser(auditor.id, {
    mfaEnabled: true,
    mfaSecret: "TESTROLEAUDITORMFA",
  });
  const auditorCookie = await createAdminSessionCookie(authStore, auditor.id);

  const forbidden = await app.inject({
    method: "POST",
    url: `/api/admin/roles/${roleId}/high-risk-permissions/review`,
    headers: { cookie: auditorCookie },
  });
  assert.equal(forbidden.statusCode, 403);
  assert.match(forbidden.body, /admin\.roles\.write/);

  await app.close();
});

test("admin prompt runtime governance actions require write permission", async () => {
  const { app, authStore } = await createAdminSessionApp();
  const auditor = authStore.createUser({
    email: "auditor@example.com",
    displayName: "Auditor",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["auditor"],
  });
  assert.ok(auditor);
  authStore.updateUser(auditor.id, {
    mfaEnabled: true,
    mfaSecret: "TESTAUDITORMFASECRET",
  });
  const auditorCookie = await createAdminSessionCookie(authStore, auditor.id);

  const readable = await app.inject({
    method: "GET",
    url: "/api/admin/prompt-runtime",
    headers: { cookie: auditorCookie },
  });
  assert.equal(readable.statusCode, 200);
  const itemId = readable.json().promptRuntimeItems[0].id;

  const submitted = await app.inject({
    method: "POST",
    url: `/api/admin/prompt-runtime/${itemId}/submit`,
    headers: { cookie: auditorCookie },
  });
  assert.equal(submitted.statusCode, 403);
  assert.match(submitted.body, /admin\.prompt_runtime\.write/);

  await app.close();
});

test("admin project and user lists are filtered by course data scope", async () => {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const academicStore = createInMemoryAcademicAdminRepository();
  const runs = createRunRecordStore();
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  const billingService = await createAdminBillingService();
  registerAdminRoutes({
    app,
    authStore,
    runs,
    documentLibrary: {} as DocumentLibrary,
    providerConfigs,
    academicStore,
    billingService,
  });

  const courseAdmin = authStore.createUser({
    email: "course-admin@example.com",
    displayName: "Course Admin",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["course_admin"],
  });
  const ownerA = authStore.createUser({
    email: "owner-a@example.com",
    displayName: "Owner A",
    passwordHash: "hash",
  });
  const ownerB = authStore.createUser({
    email: "owner-b@example.com",
    displayName: "Owner B",
    passwordHash: "hash",
  });
  assert.ok(courseAdmin);
  assert.ok(ownerA);
  assert.ok(ownerB);
  authStore.updateUser(courseAdmin.id, { mfaEnabled: true, mfaSecret: "COURSEADMINMFA" });
  await billingService.compensateCredits({
    userId: ownerA.id,
    creditAmount: 7,
    reason: "course-visible test credits",
    actorUserId: courseAdmin.id,
  });
  await billingService.compensateCredits({
    userId: ownerB.id,
    creditAmount: 13,
    reason: "course-hidden test credits",
    actorUserId: courseAdmin.id,
  });

  const org = await academicStore.createOrganization({
    name: "软件学院",
    code: null,
    type: "school",
    status: "active",
  });
  const courseA = await academicStore.createCourse({
    organizationId: org.id,
    name: "软件工程 A",
    code: null,
    term: null,
    status: "active",
  });
  const courseB = await academicStore.createCourse({
    organizationId: org.id,
    name: "软件工程 B",
    code: null,
    term: null,
    status: "active",
  });
  await academicStore.createMembership({
    targetType: "course",
    targetId: courseA.id,
    userId: courseAdmin.id,
    email: courseAdmin.email,
    displayName: courseAdmin.displayName,
    role: "course_admin",
    status: "active",
  });
  const projectA = authStore.createProject({
    ownerUserId: ownerA.id,
    name: "课程 A 项目",
    description: null,
    visibility: "team",
    organizationId: org.id,
    courseId: courseA.id,
  }).project;
  const projectB = authStore.createProject({
    ownerUserId: ownerB.id,
    name: "课程 B 项目",
    description: null,
    visibility: "team",
    organizationId: org.id,
    courseId: courseB.id,
  }).project;
  const cookie = await createAdminSessionCookie(authStore, courseAdmin.id);

  const projects = await app.inject({
    method: "GET",
    url: "/api/admin/projects",
    headers: { cookie },
  });
  const users = await app.inject({
    method: "GET",
    url: "/api/admin/users",
    headers: { cookie },
  });

  assert.equal(projects.statusCode, 200);
  assert.deepEqual(
    projects.json().projects.map((project: { id: string }) => project.id),
    [projectA.id],
  );
  assert.equal(users.statusCode, 200);
  const visibleOwner = users.json().users.find((user: { id: string }) => user.id === ownerA.id);
  assert.ok(visibleOwner);
  assert.equal(visibleOwner.billingSummary.creditBalance, 7);
  assert.equal(
    users.json().users.some((user: { id: string }) => user.id === ownerB.id),
    false,
  );
  assert.equal(projectB.courseId, courseB.id);

  await app.close();
});

test("admin documents endpoint exposes real document library records", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-admin-documents-"));
  const documentLibrary = createFileDocumentLibrary(rootDir);
  await documentLibrary.authenticateWorkspace({
    workspaceId: "workspace_123456",
    workspaceSecret: "workspace-secret-value-1234567890",
  });
  await documentLibrary.saveGeneratedDocument({
    workspaceId: "workspace_123456",
    projectId: "project-1",
    createdByUserId: "user-1",
    documentKind: "requirementsSpec",
    sourceRunId: "run-1",
    fileName: "需求规格说明书.docx",
    buffer: Buffer.from("docx"),
  });

  try {
    const { app, cookie } = await createAdminSessionApp({ documentLibrary });
    const documents = await app.inject({
      method: "GET",
      url: "/api/admin/documents",
      headers: { cookie },
    });

    assert.equal(documents.statusCode, 200);
    assert.equal(documents.json().documents[0].projectId, "project-1");
    assert.equal(documents.json().documents[0].fileName, "需求规格说明书.docx");

    await app.close();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("admin rate limits endpoint returns stored policies and the fallback provider policy", async () => {
  const { app, cookie } = await createAdminSessionApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/admin/rate-limits",
    headers: { cookie },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().rateLimits, []);
  assert.deepEqual(response.json().fallbackPolicy, {
    limit: 60,
    windowSeconds: 60 * 60,
    source: "default",
  });

  await app.close();
});

test("admin provider usage and quotas expose telemetry with billing disabled", async () => {
  let providerConfigId = "provider-1";
  const providerUsageTracker = {
    async recordUsage() {
      return undefined;
    },
    async checkLimit(input: {
      limit: number;
      windowSeconds: number;
    }) {
      return {
        allowed: true,
        usedUnits: 1,
        remainingUnits: input.limit - 1,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      };
    },
    async listUsageEvents() {
      return [
        {
          id: "usage-1",
          userId: "user-1",
          projectId: "project-1",
          courseId: "course-1",
          classId: "class-1",
          providerConfigId,
          provider: "openai",
          model: "gpt-4.1",
          taskType: "requirements_to_uml",
          outcome: "success",
          units: 1,
          tokenUsage: null,
          createdAt: "2026-05-22T00:00:00.000Z",
        },
      ];
    },
    async listQuotaSnapshots() {
      return [
        {
          providerConfigId,
          provider: "openai",
          model: "gpt-4.1",
          taskType: "requirements_to_uml",
          scopeType: "project",
          scopeId: "project-1",
          limit: 12,
          windowSeconds: 3600,
          usedUnits: 2,
          remainingUnits: 10,
          resetAt: null,
        },
      ];
    },
  } as ProviderUsageTracker & {
    listUsageEvents(): Promise<unknown[]>;
    listQuotaSnapshots(): Promise<unknown[]>;
  };
  const { app, cookie, providerConfigs } = await createAdminRouteTestApp({
    providerUsageTracker,
  });
  const provider = await providerConfigs.create({
    name: "OpenAI production gateway",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-live-secret-a91f",
    defaultModel: "gpt-4.1",
    allowedModels: ["gpt-4.1"],
    createdBy: "admin",
  });
  providerConfigId = provider.id;

  const usage = await app.inject({
    method: "GET",
    url: "/api/admin/provider-usage",
    headers: { cookie },
  });
  const quotas = await app.inject({
    method: "GET",
    url: "/api/admin/provider-quotas",
    headers: { cookie },
  });

  assert.equal(usage.statusCode, 200);
  assert.equal(usage.json().usage[0].providerConfigId, provider.id);
  assert.equal(usage.json().usage[0].courseId, "course-1");
  assert.equal(usage.json().usage[0].classId, "class-1");
  assert.equal(usage.json().usage[0].model, "gpt-4.1");
  assert.equal(usage.json().usage[0].tokenUsage, null);
  assert.equal(usage.json().usage[0].costEstimate.enabled, false);
  assert.equal(
    usage.json().usage[0].costEstimate.externalBillingSource,
    "external_provider",
  );
  assert.doesNotMatch(usage.body, /invoice|charged|real bill/i);

  assert.equal(quotas.statusCode, 200);
  assert.equal(quotas.json().quotas[0].providerConfigId, provider.id);
  assert.equal(quotas.json().quotas[0].remainingUnits, 10);
  assert.equal(quotas.json().quotas[0].costEstimate.amount, null);
  assert.equal(
    quotas.json().quotas[0].costEstimate.externalBillingSource,
    "external_provider",
  );

  await app.close();
});

test("admin can create and patch rate limit policies with audit logs", async () => {
  const providerUsageTracker = createPolicyAwareUsageTracker();
  const { app, cookie } = await createAdminRouteTestApp({ providerUsageTracker });

  const created = await app.inject({
    method: "POST",
    url: "/api/admin/rate-limits",
    headers: { cookie },
    payload: {
      scopeType: "project",
      scopeId: "project-1",
      providerConfigId: "provider-1",
      taskType: "requirements_to_uml",
      limit: 8,
      windowSeconds: 600,
      enabled: true,
    },
  });
  const id = created.json().rateLimit.id as string;
  const patched = await app.inject({
    method: "PATCH",
    url: `/api/admin/rate-limits/${id}`,
    headers: { cookie },
    payload: {
      limit: 5,
      enabled: false,
    },
  });
  const listed = await app.inject({
    method: "GET",
    url: "/api/admin/rate-limits",
    headers: { cookie },
  });
  const auditLogs = await app.inject({
    method: "GET",
    url: "/api/admin/audit-logs",
    headers: { cookie },
  });

  assert.equal(created.statusCode, 201);
  assert.equal(created.json().rateLimit.scopeType, "project");
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().rateLimit.limit, 5);
  assert.equal(patched.json().rateLimit.enabled, false);
  assert.equal(listed.json().rateLimits[0].id, id);
  assert.ok(
    auditLogs.json().auditLogs.some(
      (log: { action: string; targetId: string | null; outcome: string }) =>
        log.action === "admin.rate_limit.update" &&
        log.targetId === id &&
        log.outcome === "success",
    ),
  );

  await app.close();
});

test("admin rate limit mutations require write permission", async () => {
  const { app, authStore } = await createAdminSessionApp();
  const operator = authStore.createUser({
    email: "operator@example.com",
    displayName: "System Operator",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["system_operator"],
  });
  assert.ok(operator);
  authStore.updateUser(operator.id, {
    mfaEnabled: true,
    mfaSecret: "TESTOPERATORMFASECRET",
  });
  const operatorCookie = await createAdminSessionCookie(authStore, operator.id);

  const list = await app.inject({
    method: "GET",
    url: "/api/admin/rate-limits",
    headers: { cookie: operatorCookie },
  });
  assert.equal(list.statusCode, 200);

  const created = await app.inject({
    method: "POST",
    url: "/api/admin/rate-limits",
    headers: { cookie: operatorCookie },
    payload: {
      scopeType: "ip",
      limit: 20,
      windowSeconds: 60,
      enabled: true,
    },
  });
  assert.equal(created.statusCode, 403);
  assert.match(created.body, /admin\.rate_limits\.write/);

  await app.close();
});

test("non-admin users cannot execute dangerous admin actions or receive admin data", async () => {
  const { app, authStore } = await createAdminSessionApp();
  const target = authStore.createUser({
    email: "target@example.com",
    displayName: "Target User",
    passwordHash: hashPassword("password-123"),
  });
  const regular = authStore.createUser({
    email: "regular@example.com",
    displayName: "Regular User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(target);
  assert.ok(regular);
  const regularCookie = await createSessionCookie(authStore, regular.id);

  const blocked = await app.inject({
    method: "POST",
    url: `/api/admin/users/${target.id}/disable`,
    headers: { cookie: regularCookie },
  });

  assert.equal(blocked.statusCode, 403);
  assert.match(blocked.body, /admin/i);
  assert.doesNotMatch(blocked.body, /target@example\.com/);

  await app.close();
});

test("admin can disable a user, revoke sessions, and audit the action", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const target = authStore.createUser({
    email: "target@example.com",
    displayName: "Target User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(target);
  const targetCookie = await createSessionCookie(authStore, target.id);

  const disabled = await app.inject({
    method: "POST",
    url: `/api/admin/users/${target.id}/disable`,
    headers: { cookie },
  });
  const loginAfterDisable = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "target@example.com",
      password: "password-123",
    },
  });
  const sessionAfterDisable = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: targetCookie },
  });
  const auditLogs = await app.inject({
    method: "GET",
    url: "/api/admin/audit-logs",
    headers: { cookie },
  });

  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.json().user.status, "disabled");
  assert.equal(disabled.json().revokedSessions, 1);
  assert.equal(loginAfterDisable.statusCode, 403);
  assert.equal(sessionAfterDisable.statusCode, 401);
  assert.ok(
    auditLogs.json().auditLogs.some(
      (log: { action: string; actorUserId: string | null; targetId: string | null; outcome: string; message: string | null }) =>
        log.action === "admin.user.disable" &&
        log.actorUserId &&
        log.targetId === target.id &&
        log.outcome === "success" &&
        /Admin User/.test(log.message ?? "") &&
        /Target User/.test(log.message ?? ""),
    ),
  );

  await app.close();
});

test("admin force logout and MFA reset write audit logs", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const target = authStore.createUser({
    email: "target@example.com",
    displayName: "Target User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(target);
  const targetCookie = await createSessionCookie(authStore, target.id);

  const loggedOut = await app.inject({
    method: "POST",
    url: `/api/admin/users/${target.id}/force-logout`,
    headers: { cookie },
  });
  const revokedSession = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: targetCookie },
  });
  const mfaReset = await app.inject({
    method: "POST",
    url: `/api/admin/users/${target.id}/reset-mfa`,
    headers: { cookie },
  });
  const auditLogs = await app.inject({
    method: "GET",
    url: "/api/admin/audit-logs",
    headers: { cookie },
  });
  const actions = auditLogs.json().auditLogs.map((log: { action: string }) => log.action);

  assert.equal(loggedOut.statusCode, 200);
  assert.equal(loggedOut.json().revokedSessions, 1);
  assert.equal(revokedSession.statusCode, 401);
  assert.equal(mfaReset.statusCode, 200);
  assert.match(mfaReset.json().message, /MFA/i);
  assert.ok(actions.includes("admin.user.force_logout"));
  assert.ok(actions.includes("admin.user.reset_mfa"));

  await app.close();
});

test("admin can freeze projects and audit the archived permission state", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp();
  const owner = authStore.createUser({
    email: "owner@example.com",
    displayName: "Project Owner",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(owner);
  const { project } = authStore.createProject({
    ownerUserId: owner.id,
    name: "Freeze Me",
    description: null,
    visibility: "private",
  });

  const frozen = await app.inject({
    method: "POST",
    url: `/api/admin/projects/${project.id}/freeze`,
    headers: { cookie },
  });
  const auditLogs = await app.inject({
    method: "GET",
    url: "/api/admin/audit-logs",
    headers: { cookie },
  });

  assert.equal(frozen.statusCode, 200);
  assert.equal(frozen.json().project.status, "archived");
  assert.ok(
    auditLogs.json().auditLogs.some(
      (log: { action: string; targetId: string | null; outcome: string; message: string | null }) =>
        log.action === "admin.project.freeze" &&
        log.targetId === project.id &&
        log.outcome === "success" &&
        /archived/.test(log.message ?? ""),
    ),
  );

  await app.close();
});

test("admin can cancel and retry runs through write-scoped admin endpoints", async () => {
  const runs = createRunRecordStore();
  putRunRecord(runs, {
    runId: "run-active",
    projectId: "project-a",
    status: "running",
  });
  putRunRecord(runs, {
    runId: "run-failed",
    projectId: "project-a",
    status: "failed",
  });
  const { app, authStore, cookie } = await createAdminSessionApp({
    runRecordStore: runs,
  });
  const auditor = authStore.createUser({
    email: "auditor@example.com",
    displayName: "Auditor",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["auditor"],
  });
  assert.ok(auditor);
  authStore.updateUser(auditor.id, {
    mfaEnabled: true,
    mfaSecret: "TESTAUDITORMFASECRET",
  });
  const auditorCookie = await createAdminSessionCookie(authStore, auditor.id);

  const readOnlyCancel = await app.inject({
    method: "POST",
    url: "/api/admin/runs/run-active/cancel",
    headers: { cookie: auditorCookie },
  });
  const cancel = await app.inject({
    method: "POST",
    url: "/api/admin/runs/run-active/cancel",
    headers: { cookie },
  });
  const retry = await app.inject({
    method: "POST",
    url: "/api/admin/runs/run-failed/retry",
    headers: { cookie },
  });
  const auditLogs = await app.inject({
    method: "GET",
    url: "/api/admin/audit-logs",
    headers: { cookie },
  });

  assert.equal(readOnlyCancel.statusCode, 403);
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().action, "cancel");
  assert.equal(cancel.json().status, "cancelled");
  assert.equal(runs.get("run-active")?.snapshot.status, "cancelled");
  assert.equal(runs.get("run-active")?.events.at(-1)?.type, "cancelled");
  assert.equal(retry.statusCode, 202);
  assert.equal(retry.json().action, "retry");
  assert.notEqual(retry.json().runId, "run-failed");
  assert.equal(runs.get(retry.json().runId)?.snapshot.status, "queued");
  assert.equal(runs.get("run-failed")?.events.at(-1)?.type, "run_action");
  assert.ok(
    auditLogs.json().auditLogs.some(
      (log: { action: string; targetId: string | null; outcome: string }) =>
        log.action === "admin.run.cancel" &&
        log.targetId === "run-active" &&
        log.outcome === "success",
    ),
  );
  assert.ok(
    auditLogs.json().auditLogs.some(
      (log: { action: string; targetId: string | null; outcome: string }) =>
        log.action === "admin.run.retry" &&
        log.targetId === "run-failed" &&
        log.outcome === "success",
    ),
  );

  await app.close();
});

test("admin cancel calls the scheduler and retry starts the new run pipeline", async () => {
  const runs = createRunRecordStore();
  putRunRecord(runs, {
    runId: "run-active-admin",
    projectId: "project-a",
    status: "running",
  });
  putRunRecord(runs, {
    runId: "run-failed-admin",
    projectId: "project-a",
    status: "failed",
  });
  const cancelledRunIds: string[] = [];
  const startedRunIds: string[] = [];
  const { app, cookie } = await createAdminRouteTestApp({
    runs,
    llmScheduler: {
      run: async (_context, task) => task(),
      stream: (_context, task) => task(),
      cancelRun: (runId) => {
        cancelledRunIds.push(runId);
      },
      snapshot: () => ({ running: 0, queued: 0 }),
    },
    startRunPipeline: ({ record }) => {
      startedRunIds.push(record.snapshot.runId);
    },
  });

  const cancel = await app.inject({
    method: "POST",
    url: "/api/admin/runs/run-active-admin/cancel",
    headers: { cookie },
  });
  const retry = await app.inject({
    method: "POST",
    url: "/api/admin/runs/run-failed-admin/retry",
    headers: { cookie },
  });

  assert.equal(cancel.statusCode, 200);
  assert.deepEqual(cancelledRunIds, ["run-active-admin"]);
  assert.equal(retry.statusCode, 202);
  assert.deepEqual(startedRunIds, [retry.json().runId]);

  await app.close();
});

test("admin run detail endpoint exposes readable run metadata and artifact summary", async () => {
  const runs = createRunRecordStore();
  const { app, authStore, cookie } = await createAdminSessionApp({
    runRecordStore: runs,
  });
  const operator = authStore.createUser({
    email: "run-operator@example.com",
    displayName: "运行操作者",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(operator);
  const { project } = authStore.createProject({
    ownerUserId: operator.id,
    name: "可读项目名称",
    description: "运行详情应展示项目名",
    visibility: "private",
  });
  putRunRecord(runs, {
    runId: "run-diagnostic",
    projectId: project.id,
    userId: operator.id,
    status: "failed",
    completedAt: "2026-05-22T00:01:30.000Z",
    model: "gpt-admin-readable",
  });
  const record = runs.get("run-diagnostic");
  assert.ok(record);
  record.snapshot.models.push({
    diagramKind: "usecase",
    title: "登录用例",
    summary: "用户登录",
    notes: [],
    actors: [],
    useCases: [],
    relationships: [],
  });
  record.snapshot.plantUml.push({ diagramKind: "usecase", source: "@startuml\n@enduml" });
  record.snapshot.svgArtifacts.push({
    diagramKind: "usecase",
    svg: "<svg><text>登录用例</text></svg>",
    renderMeta: {
      engine: "plantuml",
      generatedAt: "2026-05-22T00:01:10.000Z",
      sourceLength: 16,
      durationMs: 42,
    },
  });
  record.events.push(
    { type: "queued" },
    { type: "stage_started", stage: "generate_models" },
    { type: "failed", stage: "generate_models", message: "LLM failed" },
  );
  const auditor = authStore.createUser({
    email: "run-auditor@example.com",
    displayName: "Run Auditor",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["auditor"],
  });
  assert.ok(auditor);
  authStore.updateUser(auditor.id, {
    mfaEnabled: true,
    mfaSecret: "TESTRUNAUDITORMFA",
  });
  const auditorCookie = await createAdminSessionCookie(authStore, auditor.id);

  const detail = await app.inject({
    method: "GET",
    url: "/api/admin/runs/run-diagnostic",
    headers: { cookie },
  });
  const auditorDetail = await app.inject({
    method: "GET",
    url: "/api/admin/runs/run-diagnostic",
    headers: { cookie: auditorCookie },
  });

  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().run.id, "run-diagnostic");
  assert.equal(detail.json().run.taskType, "requirements_to_uml");
  assert.equal(detail.json().run.projectId, project.id);
  assert.equal(detail.json().run.projectName, "可读项目名称");
  assert.equal(detail.json().run.operatorId, operator.id);
  assert.equal(detail.json().run.operatorName, "运行操作者");
  assert.equal(detail.json().run.model, "gpt-admin-readable");
  assert.equal(detail.json().run.createdAt, "2026-05-22T00:00:00.000Z");
  assert.equal(detail.json().run.completedAt, "2026-05-22T00:01:30.000Z");
  assert.equal(detail.json().run.durationMs, 90_000);
  assert.equal(detail.json().run.artifactSummary.title, "需求建模生成结果");
  assert.equal(detail.json().run.artifactSummary.metrics[1].label, "模型");
  assert.ok(
    detail.json().run.artifactItems.some(
      (item: { type: string; preview?: { svg?: string } }) =>
        item.type === "SVG/PNG" && item.preview?.svg === "<svg><text>登录用例</text></svg>",
    ),
  );
  assert.equal(detail.json().run.diagnostics.eventCount, 3);
  assert.equal(detail.json().run.diagnostics.errorMessage, "LLM failed");
  assert.equal(auditorDetail.statusCode, 200);

  await app.close();
});

test("admin run list classifies run kinds and returns readable summaries", async () => {
  const runs = createRunRecordStore();
  const { app, authStore, cookie, providerConfigs } = await createAdminRouteTestApp({ runs });
  const operator = authStore.createUser({
    email: "operator@example.com",
    displayName: "任务操作者",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(operator);
  const { project } = authStore.createProject({
    ownerUserId: operator.id,
    name: "任务项目",
    description: "四类任务归类测试",
    visibility: "private",
  });
  const provider = await providerConfigs.create({
    name: "Admin readable provider",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-run-provider-a91f",
    defaultModel: "gpt-admin-readable",
    allowedModels: ["gpt-admin-readable"],
    createdBy: "admin",
    scopeType: "system",
  });
  const snapshots: Array<{ snapshot: RunRecord["snapshot"]; expectedType: string; expectedTitle: string; createdAt: string }> = [
    {
      snapshot: createEmptySnapshot("run-req", "需求建模文本", ["usecase"]),
      expectedType: "requirements_to_uml",
      expectedTitle: "需求建模生成结果",
      createdAt: "2026-05-22T00:00:00.000Z",
    },
    {
      snapshot: createEmptyDesignSnapshot("run-design", {
        selectedDiagrams: ["sequence"],
        requestedDiagrams: ["sequence"],
        requirementBaseline: buildRequirementBaseline({
          runId: "run-design",
          requirementText: "设计建模文本",
          rules: [],
        }),
        requirementModels: [],
        requirementModelTraceability: [],
      }),
      expectedType: "design_modeling",
      expectedTitle: "设计建模生成结果",
      createdAt: "2026-05-22T00:03:00.000Z",
    },
    {
      snapshot: createEmptyCodeSnapshot("run-code", {
        designModels: [],
        existingFiles: { "/src/App.tsx": "export default function App() { return null; }" },
      }),
      expectedType: "code_generation",
      expectedTitle: "代码原型生成结果",
      createdAt: "2026-05-22T00:02:00.000Z",
    },
    {
      snapshot: createEmptyDocumentSnapshot("run-doc", {
        documentKind: "requirementsSpec",
        requirementText: "文档生成文本",
      }),
      expectedType: "document_generation",
      expectedTitle: "文档生成结果",
      createdAt: "2026-05-22T00:01:00.000Z",
    },
  ];

  for (const { snapshot, createdAt } of snapshots) {
    snapshot.status = "completed";
    snapshot.currentStage = "completed";
    (snapshot as unknown as { providerSettings?: { providerConfigId: string; model: string } }).providerSettings = {
      providerConfigId: provider.id,
      model: "gpt-admin-readable",
    };
    if ("models" in snapshot && "plantUml" in snapshot && "svgArtifacts" in snapshot) {
      (snapshot.models as unknown[]).push({
        diagramKind: snapshot.runId === "run-design" ? "sequence" : "usecase",
        title: snapshot.runId === "run-design" ? "提交设计时序图" : "登录用例图",
        summary: "测试模型",
        notes: [],
      });
      (snapshot.plantUml as unknown[]).push({
        diagramKind: snapshot.runId === "run-design" ? "sequence" : "usecase",
        source: "@startuml\n@enduml",
      });
      (snapshot.svgArtifacts as unknown[]).push({
        diagramKind: snapshot.runId === "run-design" ? "sequence" : "usecase",
        svg: `<svg><text>${snapshot.runId}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: createdAt,
          sourceLength: 16,
          durationMs: 12,
        },
      });
    }
    runs.set(snapshot.runId, {
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata: {
        projectId: project.id,
        userId: operator.id,
        createdAt,
        completedAt: new Date(new Date(createdAt).getTime() + 5_000).toISOString(),
      },
    });
  }

  const response = await app.inject({
    method: "GET",
    url: "/api/admin/runs",
    headers: { cookie },
  });

  assert.equal(response.statusCode, 200);
  const listedRuns = response.json().runs as Array<{
    id: string;
    taskType: string;
    model: string;
    providerConfigId: string;
    providerName: string;
    provider: string;
    providerScopeType: string;
    projectName: string;
    operatorName: string;
    durationMs: number;
    artifactSummary: { title: string };
    artifactItems: Array<{ type: string; preview?: unknown; previewAvailable: boolean }>;
  }>;
  assert.deepEqual(listedRuns.map((item) => item.id), ["run-design", "run-code", "run-doc", "run-req"]);
  for (const { snapshot, expectedType, expectedTitle } of snapshots) {
    const run = listedRuns.find((item) => item.id === snapshot.runId);
    assert.ok(run);
    assert.equal(run.taskType, expectedType);
    assert.equal(run.model, "gpt-admin-readable");
    assert.equal(run.providerConfigId, provider.id);
    assert.equal(run.providerName, "Admin readable provider");
    assert.equal(run.provider, "openai");
    assert.equal(run.providerScopeType, "system");
    assert.equal(run.projectName, "任务项目");
    assert.equal(run.operatorName, "任务操作者");
    assert.equal(run.durationMs, 5_000);
    assert.equal(run.artifactSummary.title, expectedTitle);
    if (snapshot.runId === "run-req" || snapshot.runId === "run-design") {
      assert.ok(run.artifactItems.some((item) => item.type === "SVG/PNG" && item.previewAvailable));
      assert.ok(run.artifactItems.every((item) => !item.preview));
    }
  }

  await app.close();
});

test("admin can restore deleted documents through the document library and audit the action", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-admin-document-restore-"));
  const documentLibrary = createFileDocumentLibrary(rootDir);
  await documentLibrary.authenticateWorkspace({
    workspaceId: "workspace_123456",
    workspaceSecret: "workspace-secret-value-1234567890",
  });
  const document = await documentLibrary.saveGeneratedDocument({
    workspaceId: "workspace_123456",
    projectId: "project-1",
    createdByUserId: "user-1",
    documentKind: "requirementsSpec",
    sourceRunId: "run-1",
    fileName: "需求规格说明书.docx",
    buffer: Buffer.from("docx"),
  });
  await documentLibrary.deleteDocument(document.workspaceId, document.id);

  try {
    const { app, cookie } = await createAdminSessionApp({ documentLibrary });
    const restored = await app.inject({
      method: "POST",
      url: `/api/admin/documents/${document.id}/restore`,
      headers: { cookie },
    });
    const auditLogs = await app.inject({
      method: "GET",
      url: "/api/admin/audit-logs",
      headers: { cookie },
    });

    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().document.id, document.id);
    assert.equal(restored.json().document.status, "active");
    assert.ok(
      auditLogs.json().auditLogs.some(
        (log: { action: string; targetId: string | null; outcome: string; message: string | null }) =>
          log.action === "admin.document.restore" &&
          log.targetId === document.id &&
          log.outcome === "success" &&
          /restored document/i.test(log.message ?? ""),
      ),
    );

    await app.close();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("admin can download visible documents through the admin document endpoint", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-admin-document-download-"));
  const documentLibrary = createFileDocumentLibrary(rootDir);
  await documentLibrary.authenticateWorkspace({
    workspaceId: "workspace_123456",
    workspaceSecret: "workspace-secret-value-1234567890",
  });
  const document = await documentLibrary.saveGeneratedDocument({
    workspaceId: "workspace_123456",
    projectId: "project-1",
    createdByUserId: "user-1",
    documentKind: "requirementsSpec",
    sourceRunId: "run-1",
    fileName: "需求规格说明书.docx",
    buffer: Buffer.from("admin docx"),
  });

  try {
    const { app, cookie } = await createAdminSessionApp({ documentLibrary });
    const downloaded = await app.inject({
      method: "GET",
      url: `/api/admin/documents/${document.id}/download`,
      headers: { cookie },
    });
    const auditLogs = await app.inject({
      method: "GET",
      url: "/api/admin/audit-logs",
      headers: { cookie },
    });

    assert.equal(downloaded.statusCode, 200);
    assert.equal(downloaded.body, "admin docx");
    assert.match(String(downloaded.headers["content-disposition"]), /filename\*/);
    assert.ok(
      auditLogs.json().auditLogs.some(
        (log: { action: string; targetId: string | null; outcome: string }) =>
          log.action === "admin.document.download" &&
          log.targetId === document.id &&
          log.outcome === "success",
      ),
    );

    await app.close();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("provider config create accepts arbitrary public custom HTTPS base URLs", async () => {
  const { app, cookie } = await createAdminSessionApp({
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: {
      name: "Custom model gateway",
      baseUrl: "https://api.custom-provider.example/v1",
      apiKey: "sk-secret-should-not-pass",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().baseUrl, "https://api.custom-provider.example");
  assert.equal(response.json().provider, "openai-compatible");
  assert.equal(response.json().allowlisted, true);
  assert.doesNotMatch(response.body, /sk-secret-should-not-pass/);

  await app.close();
});

test("provider config create rejects non-public or non-HTTPS base URLs", async () => {
  const { app, cookie } = await createAdminSessionApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: {
      name: "Local model gateway",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "sk-secret-should-not-pass",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /HTTPS|public/i);

  await app.close();
});

test("provider configs accept SiliconFlow v1 endpoint with a fixed reviewed model catalog", async () => {
  const originalFetch = globalThis.fetch;
  let testedUrl = "";
  globalThis.fetch = (async (url) => {
    testedUrl = String(url);
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { app, cookie } = await createAdminSessionApp({
    });
    const allowedModels = [
      "deepseek-ai/DeepSeek-V4-Pro",
      "deepseek-ai/DeepSeek-V4-Flash",
      "Pro/moonshotai/Kimi-K2.6",
      "Pro/zai-org/GLM-5.1",
      "Pro/MiniMaxAI/MiniMax-M2.5",
      "Qwen/Qwen3.6-35B-A3B",
    ];

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/provider-configs",
      headers: { cookie },
      payload: {
        allowedModels,
        name: "SiliconFlow production gateway",
        baseUrl: "https://api.siliconflow.cn/v1",
        apiKey: "sk-siliconflow-secret-a91f",
        defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
      },
    });
    const id = created.json().id as string;
    const allowedTest = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/test`,
      headers: { cookie },
      payload: { model: "Pro/moonshotai/Kimi-K2.6" },
    });
    const rejectedTest = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/test`,
      headers: { cookie },
      payload: { model: "gpt-5.4" },
    });

    assert.equal(created.statusCode, 201);
    assert.equal(created.json().baseUrl, "https://api.siliconflow.cn");
    assert.equal(created.json().provider, "siliconflow");
    assert.deepEqual(created.json().allowedModels, allowedModels);
    assert.doesNotMatch(created.body, /sk-siliconflow-secret-a91f/);
    assert.equal(allowedTest.statusCode, 200);
    assert.equal(allowedTest.json().ok, true);
    assert.equal(testedUrl, "https://api.siliconflow.cn/v1/chat/completions");
    assert.equal(rejectedTest.statusCode, 400);
    assert.match(rejectedTest.body, /model/i);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin provider model discovery returns normalized OpenAI-compatible models", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (url, init) => {
    const testedUrl = String(url);
    calls.push({ url: testedUrl, method: init?.method ?? "GET" });
    if (testedUrl.endsWith("/v1/chat/completions")) {
      return createChatProbeStream('{"probe":"strict-json-ok","n":1}');
    }
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          {
            id: " gpt-4o ",
            object: "model",
            created: 1715558400,
            owned_by: "openai",
          },
          {
            id: "gemini-2.5-flash-image",
            object: "model",
            created: 0,
            owned_by: "nonelinear",
          },
          {
            object: "model",
            created: 0,
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const { app, cookie, providerConfigs } = await createAdminRouteTestApp();
    const provider = await providerConfigs.create({
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: "admin",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/admin/provider-configs/${provider.id}/models`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(calls[0]?.url, "https://api.openai.com/v1/models");
    assert.equal(calls[0]?.method, "GET");
    assert.equal(calls[1]?.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(response.json().sourceBaseUrl, "https://api.openai.com");
    const body = response.json();
    assert.equal(body.summary.rawCount, 2);
    assert.equal(body.summary.excludedByNameCount, 1);
    assert.equal(body.summary.strictCount, 1);
    assert.deepEqual(body.models.map((model: { id: string }) => model.id), ["gpt-4o"]);
    assert.equal(body.models[0].category, "text_chat");
    assert.equal(body.models[0].structuredOutputMode, "strict_json");
    assert.equal(body.models[0].supportsJsonSchema, true);
    assert.equal(body.models[0].supportsJsonObject, true);
    assert.equal(body.models[0].strictJson, true);
    assert.equal(body.models[0].probeStatus, "strict");
    assert.equal(typeof body.models[0].probedAt, "string");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin temporary provider model discovery uses supplied base URL and API key without saving a config", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string }> = [];
  globalThis.fetch = (async (url, init) => {
    const testedUrl = String(url);
    const testedAuthorization =
      init?.headers instanceof Headers
        ? init.headers.get("Authorization") ?? ""
        : String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
    calls.push({ url: testedUrl, authorization: testedAuthorization });
    if (testedUrl.endsWith("/v1/chat/completions")) {
      return createChatProbeStream('{"probe":"strict-json-ok","n":1}');
    }
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", created: 0, owned_by: "nonelinear" },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const { app, cookie } = await createAdminRouteTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/provider-configs/discover-models",
      headers: { cookie },
      payload: {
        baseUrl: "https://api.nonelinear.com/v1",
        apiKey: "sk-temporary-secret",
      },
    });
    const listed = await app.inject({
      method: "GET",
      url: "/api/admin/provider-configs",
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(calls[0]?.url, "https://api.nonelinear.com/v1/models");
    assert.equal(calls[0]?.authorization, "Bearer sk-temporary-secret");
    assert.equal(calls[1]?.url, "https://api.nonelinear.com/v1/chat/completions");
    assert.equal(calls[1]?.authorization, "Bearer sk-temporary-secret");
    assert.equal(response.json().sourceBaseUrl, "https://api.nonelinear.com");
    const body = response.json();
    assert.equal(body.summary.strictCount, 1);
    assert.equal(body.summary.jsonObjectCount, 0);
    assert.deepEqual(body.models.map((model: { id: string }) => model.id), [
      "deepseek-v4-flash",
    ]);
    assert.equal(body.models[0].structuredOutputMode, "strict_json");
    assert.equal(body.models[0].supportsJsonSchema, true);
    assert.equal(body.models[0].supportsJsonObject, true);
    assert.equal(body.models[0].probeStatus, "strict");
    assert.deepEqual(listed.json().providerConfigs, []);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin temporary provider model discovery classifies json_object capable models", async () => {
  const originalFetch = globalThis.fetch;
  const responseFormats: string[] = [];
  globalThis.fetch = (async (url, init) => {
    const testedUrl = String(url);
    if (testedUrl.endsWith("/v1/chat/completions")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        response_format?: { type?: string };
      };
      responseFormats.push(payload.response_format?.type ?? "none");
      if (payload.response_format?.type === "json_schema") {
        return createChatProbeStream('{"status":"ok"}');
      }
      if (payload.response_format?.type === "json_object") {
        return createChatProbeStream('{"ok":true,"n":1}');
      }
      return createChatProbeStream("ok");
    }
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          { id: "qwen3.7-plus", object: "model", created: 0, owned_by: "aliyun" },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const { app, cookie } = await createAdminRouteTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/provider-configs/discover-models",
      headers: { cookie },
      payload: {
        baseUrl: "https://api.nonelinear.com",
        apiKey: "sk-temporary-secret",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(responseFormats, ["json_schema", "json_object"]);
    const body = response.json();
    assert.equal(body.summary.strictCount, 0);
    assert.equal(body.summary.jsonObjectCount, 1);
    assert.equal(body.summary.compatibleCount, 0);
    assert.equal(body.models[0].id, "qwen3.7-plus");
    assert.equal(body.models[0].structuredOutputMode, "json_object");
    assert.equal(body.models[0].supportsJsonSchema, false);
    assert.equal(body.models[0].supportsJsonObject, true);
    assert.equal(body.models[0].probeStatus, "json_object");
    assert.equal(body.models[0].modeLabel, "JSON 模式");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin temporary provider model discovery stream emits progress events", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    const testedUrl = String(url);
    if (testedUrl.endsWith("/v1/chat/completions")) {
      return createChatProbeStream('{"probe":"strict-json-ok","n":1}');
    }
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", created: 0, owned_by: "nonelinear" },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const { app, cookie } = await createAdminRouteTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/provider-configs/discover-models/stream",
      headers: { cookie },
      payload: {
        baseUrl: "https://api.nonelinear.com/v1",
        apiKey: "sk-temporary-secret",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/event-stream/);
    const events = response.body
      .split(/\r?\n\r?\n/u)
      .flatMap((block) => {
        const data = block
          .split(/\r?\n/u)
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
          .trim();
        return data ? [JSON.parse(data) as { type: string }] : [];
      });
    assert.deepEqual(events.map((event) => event.type), [
      "started",
      "models_listed",
      "name_filtered",
      "probe_started",
      "probe_completed",
      "completed",
    ]);
    assert.equal(events.at(-1)?.type, "completed");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin temporary provider model discovery rejects private endpoints before provider calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("provider fetch should not be called");
  }) as typeof fetch;

  try {
    const { app, cookie } = await createAdminRouteTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/provider-configs/discover-models",
      headers: { cookie },
      payload: {
        baseUrl: "https://[::1]:11434/v1",
        apiKey: "sk-temporary-secret",
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /public HTTPS host/i);
    assert.equal(fetchCalls, 0);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin provider model discovery blocks disabled configs before provider calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("provider fetch should not be called");
  }) as typeof fetch;

  try {
    const { app, cookie, providerConfigs } = await createAdminRouteTestApp();
    const provider = await providerConfigs.create({
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: "admin",
    });
    providerConfigs.disable?.(provider.id, "admin");

    const response = await app.inject({
      method: "GET",
      url: `/api/admin/provider-configs/${provider.id}/models`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /disabled|inactive/i);
    assert.equal(fetchCalls, 0);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider configs mask keys and never read back plaintext secrets", async () => {
  const { app, cookie } = await createAdminSessionApp({
  });

  const created = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: {
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
    },
  });
  const listed = await app.inject({
    method: "GET",
    url: "/api/admin/provider-configs",
    headers: { cookie },
  });

  assert.equal(created.statusCode, 201);
  assert.equal(created.json().maskedKey, "sk-...a91f");
  assert.doesNotMatch(created.body, /sk-live-secret-a91f/);
  assert.doesNotMatch(listed.body, /sk-live-secret-a91f/);
  assert.equal(listed.json().providerConfigs[0].maskedKey, "sk-...a91f");

  await app.close();
});

test("admin provider configs include user-owned providers with owner display metadata", async () => {
  const { app, authStore, cookie, providerConfigs } = await createAdminRouteTestApp();
  const owner = authStore.createUser({
    email: "owner-provider@example.com",
    displayName: "Owner Provider User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(owner);
  const provider = await providerConfigs.create({
    name: "Owner private gateway",
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-owner-private-a91f",
    defaultModel: "gpt-4.1",
    allowedModels: ["gpt-4.1"],
    createdBy: owner.id,
    scopeType: "user",
    scopeId: owner.id,
  });

  const listed = await app.inject({
    method: "GET",
    url: "/api/admin/provider-configs",
    headers: { cookie },
  });

  assert.equal(listed.statusCode, 200);
  const row = listed.json().providerConfigs.find((item: { id: string }) => item.id === provider.id);
  assert.equal(row.scopeType, "user");
  assert.equal(row.scopeId, owner.id);
  assert.equal(row.scopeLabel, "用户：Owner Provider User");
  assert.equal(row.ownerUserName, "Owner Provider User");
  assert.equal(row.ownerUserEmail, "owner-provider@example.com");
  assert.doesNotMatch(listed.body, /sk-owner-private-a91f/);

  await app.close();
});

test("provider configs can update editable metadata without changing secrets or endpoints", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp({
  });
  const owner = authStore.createUser({
    email: "owner@example.com",
    displayName: "Project Owner",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(owner);
  const { project } = authStore.createProject({
    ownerUserId: owner.id,
    name: "Scoped Provider Project",
    description: null,
    visibility: "team",
  });
  const allowedModels = [
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Flash",
  ];
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: {
      allowedModels,
      name: "SiliconFlow gateway",
      provider: "siliconflow",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sk-siliconflow-secret-a91f",
      defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    },
  });
  const id = created.json().id as string;

  const updated = await app.inject({
    method: "PATCH",
    url: `/api/admin/provider-configs/${id}`,
    headers: { cookie },
    payload: {
      allowedModels,
      defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
      keyPurpose: "生产生成",
      name: "SiliconFlow gateway v2",
      quota: "合同标签：生产",
      scopeType: "project",
      scopeId: project.id,
    },
  });
  const rejected = await app.inject({
    method: "PATCH",
    url: `/api/admin/provider-configs/${id}`,
    headers: { cookie },
    payload: {
      allowedModels: ["deepseek-ai/DeepSeek-V4-Pro"],
      defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
    },
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().name, "SiliconFlow gateway v2");
  assert.equal(updated.json().baseUrl, "https://api.siliconflow.cn");
  assert.equal(updated.json().provider, "siliconflow");
  assert.equal(updated.json().defaultModel, "deepseek-ai/DeepSeek-V4-Flash");
  assert.deepEqual(updated.json().allowedModels, allowedModels);
  assert.equal(updated.json().keyPurpose, "生产生成");
  assert.equal(updated.json().quota, "合同标签：生产");
  assert.equal(updated.json().scopeType, "project");
  assert.equal(updated.json().scopeId, project.id);
  assert.doesNotMatch(updated.body, /sk-siliconflow-secret-a91f/);
  assert.equal(rejected.statusCode, 400);
  assert.match(rejected.body, /default model/i);

  await app.close();
});

test("provider config create requires scope ids for user and project ownership", async () => {
  const { app, authStore, cookie } = await createAdminSessionApp({
  });
  const owner = authStore.createUser({
    email: "owner@example.com",
    displayName: "Project Owner",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(owner);
  const { project } = authStore.createProject({
    ownerUserId: owner.id,
    name: "Scoped Provider Project",
    description: null,
    visibility: "team",
  });
  const basePayload = {
    name: "OpenAI scoped gateway",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-live-secret-a91f",
    defaultModel: "gpt-4.1",
    allowedModels: ["gpt-4.1"],
  };

  const missingUserScope = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: { ...basePayload, scopeType: "user" },
  });
  const userScoped = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: { ...basePayload, name: "OpenAI user gateway", scopeType: "user", scopeId: owner.id },
  });
  const missingProjectScope = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: { ...basePayload, scopeType: "project" },
  });
  const projectScoped = await app.inject({
    method: "POST",
    url: "/api/admin/provider-configs",
    headers: { cookie },
    payload: {
      ...basePayload,
      name: "OpenAI project gateway",
      scopeType: "project",
      scopeId: project.id,
    },
  });

  assert.equal(missingUserScope.statusCode, 400);
  assert.match(missingUserScope.body, /scopeId/i);
  assert.equal(userScoped.statusCode, 201);
  assert.equal(userScoped.json().scopeType, "user");
  assert.equal(userScoped.json().scopeId, owner.id);
  assert.equal(missingProjectScope.statusCode, 400);
  assert.match(missingProjectScope.body, /scopeId/i);
  assert.equal(projectScoped.statusCode, 201);
  assert.equal(projectScoped.json().scopeType, "project");
  assert.equal(projectScoped.json().scopeId, project.id);

  await app.close();
});

test("provider configs can rotate, revoke, and test allowlisted connections", async () => {
  const originalFetch = globalThis.fetch;
  let testedAuthorization: string | undefined;
  globalThis.fetch = (async (_url, init) => {
    const headers = init?.headers;
    testedAuthorization =
      headers instanceof Headers
        ? headers.get("authorization") ?? undefined
        : (headers as Record<string, string> | undefined)?.Authorization ??
          (headers as Record<string, string> | undefined)?.authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
      const { app, cookie } = await createAdminSessionApp({
      });

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/provider-configs",
      headers: { cookie },
      payload: {
        name: "OpenAI production gateway",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-live-secret-a91f",
        defaultModel: "gpt-4.1",
        allowedModels: ["gpt-4.1"],
      },
    });
    const id = created.json().id as string;

    const rotated = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/rotate`,
      headers: { cookie },
      payload: {
        apiKey: "sk-rotated-secret-77c2",
      },
    });
    const tested = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/test`,
      headers: { cookie },
    });
    const revoked = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/revoke`,
      headers: { cookie },
    });
    const retested = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/test`,
      headers: { cookie },
    });

    assert.equal(rotated.statusCode, 200);
    assert.equal(rotated.json().maskedKey, "sk-...77c2");
    assert.doesNotMatch(rotated.body, /sk-rotated-secret-77c2/);
    assert.equal(tested.statusCode, 200);
    assert.equal(tested.json().ok, true);
    assert.equal(testedAuthorization, "Bearer sk-rotated-secret-77c2");
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().status, "revoked");
    assert.equal(retested.statusCode, 400);
    assert.match(retested.body, /revoked/i);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin cannot rotate, test, or discover models for user-owned provider configs", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("admin must not call a user-owned provider key");
  }) as typeof fetch;

  try {
    const { app, authStore, providerConfigs, cookie } = await createAdminRouteTestApp({
    });
    const owner = authStore.createUser({
      email: "owner-private@example.com",
      displayName: "Owner Private",
      passwordHash: hashPassword("password-123"),
    });
    assert.ok(owner);
    const provider = await providerConfigs.create({
      name: "Owner private gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-owner-private-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: owner.id,
      scopeType: "user",
      scopeId: owner.id,
    });

    const rotate = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/rotate`,
      headers: { cookie },
      payload: { apiKey: "sk-admin-should-not-rotate" },
    });
    const update = await app.inject({
      method: "PATCH",
      url: `/api/admin/provider-configs/${provider.id}`,
      headers: { cookie },
      payload: { name: "Admin must not edit owner private gateway" },
    });
    const testConnection = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    const models = await app.inject({
      method: "GET",
      url: `/api/admin/provider-configs/${provider.id}/models`,
      headers: { cookie },
    });
    const streamModels = await app.inject({
      method: "GET",
      url: `/api/admin/provider-configs/${provider.id}/models/stream`,
      headers: { cookie },
    });
    const resetBreaker = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/reset-breaker`,
      headers: { cookie },
    });
    const disabled = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/disable`,
      headers: { cookie },
    });
    const enabled = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/enable`,
      headers: { cookie },
    });
    const revoked = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/revoke`,
      headers: { cookie },
    });

    assert.equal(rotate.statusCode, 403);
    assert.match(rotate.body, /owning user/i);
    assert.equal(update.statusCode, 403);
    assert.match(update.body, /owning user/i);
    assert.equal(testConnection.statusCode, 403);
    assert.match(testConnection.body, /cannot be tested by admins/i);
    assert.equal(models.statusCode, 403);
    assert.match(models.body, /cannot be tested by admins/i);
    assert.equal(streamModels.statusCode, 403);
    assert.match(streamModels.body, /cannot be tested by admins/i);
    assert.equal(resetBreaker.statusCode, 403);
    assert.match(resetBreaker.body, /disabled or revoked by admins/i);
    assert.equal(disabled.statusCode, 200);
    assert.equal(disabled.json().status, "disabled");
    assert.equal(enabled.statusCode, 403);
    assert.match(enabled.body, /disabled or revoked by admins/i);
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().status, "revoked");
    assert.equal(fetchCalls, 0);
    assert.doesNotMatch(
      `${rotate.body}\n${update.body}\n${testConnection.body}\n${models.body}\n${streamModels.body}\n${resetBreaker.body}\n${enabled.body}`,
      /sk-owner-private-a91f|sk-admin-should-not-rotate/,
    );

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider configs can be disabled and re-enabled with audit records", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { app, cookie } = await createAdminSessionApp({
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/provider-configs",
      headers: { cookie },
      payload: {
        name: "OpenAI production gateway",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-live-secret-a91f",
        defaultModel: "gpt-4.1",
        allowedModels: ["gpt-4.1"],
      },
    });
    const id = created.json().id as string;

    const disabled = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/disable`,
      headers: { cookie },
    });
    const disabledTest = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/test`,
      headers: { cookie },
    });
    assert.equal(disabled.statusCode, 200);
    assert.equal(disabled.json().status, "disabled");
    assert.equal(disabledTest.statusCode, 400);
    assert.match(disabledTest.body, /disabled|inactive/i);
    assert.equal(fetchCalls, 0);

    const enabled = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/enable`,
      headers: { cookie },
    });
    const enabledTest = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/test`,
      headers: { cookie },
    });
    const revoked = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/revoke`,
      headers: { cookie },
    });
    const enableAfterRevoke = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/enable`,
      headers: { cookie },
    });
    const disableAfterRevoke = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${id}/disable`,
      headers: { cookie },
    });
    const auditLogs = await app.inject({
      method: "GET",
      url: "/api/admin/audit-logs",
      headers: { cookie },
    });

    assert.equal(enabled.statusCode, 200);
    assert.equal(enabled.json().status, "active");
    assert.equal(enabledTest.statusCode, 200);
    assert.equal(enabledTest.json().ok, true);
    assert.equal(fetchCalls, 1);
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().status, "revoked");
    assert.equal(enableAfterRevoke.statusCode, 404);
    assert.equal(disableAfterRevoke.statusCode, 404);
    assert.match(auditLogs.body, /admin\.provider_config\.disable/);
    assert.match(auditLogs.body, /admin\.provider_config\.enable/);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider config test returns 429 and does not call provider when quota is exhausted", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage() {
      throw new Error("usage should not be recorded when quota blocks the call");
    },
    async checkLimit(input) {
      return {
        allowed: false,
        usedUnits: input.limit,
        remainingUnits: 0,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      };
    },
  };
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("provider fetch should not be called when quota blocks");
  }) as typeof fetch;

  try {
    const { app, cookie, providerConfigs } = await createAdminRouteTestApp({
      providerUsageTracker,
    });
    const provider = await providerConfigs.create({
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: "admin",
    });

    const tested = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });

    assert.equal(tested.statusCode, 429);
    assert.match(tested.body, /rate limit/i);
    assert.equal(fetchCalls, 0);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider config test rejects disabled configs and unapproved models before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("provider fetch should not be called");
  }) as typeof fetch;

  try {
    const { app, cookie, providerConfigs } = await createAdminRouteTestApp();
    const provider = await providerConfigs.create({
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: "admin",
    });
    providerConfigs.disable?.(provider.id, "admin");

    const disabledTest = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    providerConfigs.enable?.(provider.id, "admin");
    const modelTest = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
      payload: {
        model: "gpt-6-unapproved",
      },
    });

    assert.equal(disabledTest.statusCode, 400);
    assert.match(disabledTest.body, /disabled|inactive/i);
    assert.equal(modelTest.statusCode, 400);
    assert.match(modelTest.body, /model/i);
    assert.equal(fetchCalls, 0);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider config test opens the breaker after repeated provider failures", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("bad gateway", { status: 502 });
  }) as typeof fetch;

  try {
    const { app, cookie, providerConfigs } = await createAdminRouteTestApp();
    const provider = await providerConfigs.create({
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: "admin",
    });

    await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    const thirdFailure = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    const breakerBlocked = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });

    assert.equal(thirdFailure.statusCode, 502);
    assert.equal(breakerBlocked.statusCode, 503);
    assert.match(breakerBlocked.body, /breaker|circuit/i);
    assert.equal(fetchCalls, 3);
    assert.equal((await providerConfigs.get(provider.id))?.breakerState, "open");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin can reset an open provider circuit breaker", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return fetchCalls <= 3
      ? new Response("bad gateway", { status: 502 })
      : new Response(
          JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
  }) as typeof fetch;

  try {
    const { app, cookie, providerConfigs } = await createAdminRouteTestApp();
    const provider = await providerConfigs.create({
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: "admin",
    });

    await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });

    const reset = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/reset-breaker`,
      headers: { cookie },
    });
    const retest = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });
    const auditLogs = await app.inject({
      method: "GET",
      url: "/api/admin/audit-logs",
      headers: { cookie },
    });

    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().breakerState, "closed");
    assert.equal(reset.json().breakerFailureCount, 0);
    assert.equal(retest.statusCode, 200);
    assert.equal(retest.json().ok, true);
    assert.equal(fetchCalls, 4);
    assert.match(auditLogs.body, /admin\.provider_config\.reset_breaker/);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider config test uses the most specific enabled rate limit policy", async () => {
  const originalFetch = globalThis.fetch;
  const checks: Array<{ limit: number; windowSeconds: number }> = [];
  const providerUsageTracker = createPolicyAwareUsageTracker({
    onCheck(input) {
      checks.push({
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      });
    },
  });
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    const { app, cookie, providerConfigs } = await createAdminRouteTestApp({
      providerUsageTracker,
    });
    const provider = await providerConfigs.create({
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-live-secret-a91f",
      defaultModel: "gpt-4.1",
      allowedModels: ["gpt-4.1"],
      createdBy: "admin",
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/rate-limits",
      headers: { cookie },
      payload: {
        scopeType: "provider",
        providerConfigId: provider.id,
        taskType: "provider_test",
        limit: 3,
        windowSeconds: 120,
        enabled: true,
      },
    });

    const tested = await app.inject({
      method: "POST",
      url: `/api/admin/provider-configs/${provider.id}/test`,
      headers: { cookie },
    });

    assert.equal(tested.statusCode, 200);
    assert.deepEqual(checks, [{ limit: 3, windowSeconds: 120 }]);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
