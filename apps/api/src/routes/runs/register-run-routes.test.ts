// Verifies project-aware run route access without depending on future auth routes.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { ProjectPermission, ProviderSettings, RunEvent } from "@uml-platform/contracts";
import type { LlmTransport } from "../../llm.js";
import {
  createInMemoryLlmScheduler,
  type LlmScheduler,
} from "../../adapters/llm/llm-scheduler.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import { createRunRecordStore, emitEvent } from "../../runs/records/run-record-store.js";
import type { RunRecord } from "../../runs/records/run-record-store.js";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "../../runs/records/snapshots.js";
import { registerRunRoutes, type RunAccessGuard } from "./register-run-routes.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderLimitCheckInput,
  ProviderUsageInput,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { createGenerationUsageService } from "../../generation/generation-usage.js";
import { buildRequirementBaseline } from "../../runs/baselines/requirement-baseline.js";
import { buildEvidencePackage } from "../../runs/evidence/evidence-package.js";

const providerSettings: ProviderSettings = {
  apiBaseUrl: "https://ai.comfly.org",
  apiKey: "sk-test",
  model: "gpt-5.5",
};

const minimalUseCaseModel = {
  diagramKind: "usecase",
  title: "用例模型",
  summary: "主要参与者和用例",
  notes: [],
  actors: [
    {
      id: "actor-user",
      name: "用户",
      actorType: "human",
      responsibilities: ["使用系统"],
    },
  ],
  useCases: [
    {
      id: "usecase-view",
      name: "查看活动",
      goal: "查看公开活动日历",
      preconditions: [],
      postconditions: ["活动列表已展示"],
      primaryActorId: "actor-user",
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [{ id: "boundary-calendar", name: "公众活动日历" }],
  relationships: [
    {
      id: "rel-view",
      sourceId: "actor-user",
      targetId: "usecase-view",
      type: "association",
      label: "查看",
    },
  ],
};

function stringHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function createTestRunAccessGuard(
  memberships: Record<string, Partial<Record<ProjectPermission, string[]>>>,
): RunAccessGuard {
  return {
    async resolveRunAccess(request) {
      return {
        userId: stringHeader(request, "x-test-user-id"),
        projectId: stringHeader(request, "x-test-project-id"),
      };
    },
    async canAccessProject({ userId, projectId, permission }) {
      return Boolean(
        userId && memberships[userId]?.[permission]?.includes(projectId),
      );
    },
  };
}

async function createRunRouteTestApp(options?: {
  runAccessGuard?: RunAccessGuard;
  providerConfigs?: ReturnType<typeof createProviderConfigStore>;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
  providerUsageTracker?: ProviderUsageTracker;
  llmTransport?: LlmTransport;
  allowLegacyProjectProviderSettings?: boolean;
  completeRuns?: boolean;
  documentLibrary?: DocumentLibrary;
  llmScheduler?: LlmScheduler;
  runStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runStagePipeline"];
  runDesignStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDesignStagePipeline"];
  runDocumentStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDocumentStagePipeline"];
  generationUsage?: Parameters<typeof registerRunRoutes>[0]["generationUsage"];
}) {
  return (await createRunRouteTestContext(options)).app;
}

async function createRunRouteTestContext(options?: {
  runAccessGuard?: RunAccessGuard;
  providerConfigs?: ReturnType<typeof createProviderConfigStore>;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
  providerUsageTracker?: ProviderUsageTracker;
  llmTransport?: LlmTransport;
  allowLegacyProjectProviderSettings?: boolean;
  completeRuns?: boolean;
  documentLibrary?: DocumentLibrary;
  llmScheduler?: LlmScheduler;
  runStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runStagePipeline"];
  runDesignStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDesignStagePipeline"];
  runDocumentStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDocumentStagePipeline"];
  generationUsage?: Parameters<typeof registerRunRoutes>[0]["generationUsage"];
}) {
  const app = Fastify({ logger: false });
  const runs = createRunRecordStore();
  const noOpLlmTransport = options?.llmTransport ?? ({} as LlmTransport);
  const noOpRenderClient = (async () => {
    throw new Error("render client should not be called by route tests");
  }) as RenderClient;
  const noOpPngRenderClient = noOpRenderClient as PngRenderClient;
  const noOpDocumentLibrary = options?.documentLibrary ?? ({} as DocumentLibrary);
  const completeQueuedRun = async (record: RunRecord) => {
    if (options?.completeRuns === false) return;
    record.snapshot.status = "completed";
    emitEvent(record, {
      type: "completed",
      snapshot: record.snapshot,
    } as RunEvent);
  };

  registerRunRoutes({
    app,
    runs,
    documentLibrary: noOpDocumentLibrary,
    llmTransport: noOpLlmTransport,
    renderClient: noOpRenderClient,
    pngRenderClient: noOpPngRenderClient,
    defaultSseAllowOrigin: "http://localhost:5173",
    runStagePipeline: options?.runStagePipeline ?? completeQueuedRun,
    runDesignStagePipeline: options?.runDesignStagePipeline ?? completeQueuedRun,
    runCodeStagePipeline: completeQueuedRun,
    runDocumentStagePipeline: options?.runDocumentStagePipeline ?? (async () => undefined),
    addCodeDiagnostic: () => undefined,
    runAccessGuard: options?.runAccessGuard,
    providerConfigs: options?.providerConfigs,
    resolveProjectDefaultProviderConfig: options?.resolveProjectDefaultProviderConfig,
    providerUsageTracker: options?.providerUsageTracker,
    generationUsage: options?.generationUsage,
    llmScheduler: options?.llmScheduler,
    allowLegacyProjectProviderSettings:
      options?.allowLegacyProjectProviderSettings ?? true,
  });

  return { app, runs };
}

test("requirement rule repair returns only the updated current requirement", async () => {
  const rule = {
    id: "r10",
    category: "业务规则" as const,
    text: "普通读者只能查询其自己当前借出的书目。",
    relatedDiagrams: ["usecase" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-baseline",
    requirementText: "普通读者只能查询其自己当前借出的书目。",
    rules: [
      rule,
      {
        id: "r11",
        category: "业务规则" as const,
        text: "管理员可以增加图书。",
        relatedDiagrams: ["usecase" as const],
      },
    ],
  });
  const llmTransport: LlmTransport = {
    async *streamChatCompletion() {
      yield JSON.stringify({
        fields: {
          actor: {
            source: "ai-suggested",
            status: "accepted",
            value: "普通读者",
            originalValue: null,
            rationale: "原文明确说明普通读者。",
          },
          subject: {
            source: "ai-suggested",
            status: "accepted",
            value: "普通读者",
            originalValue: null,
            rationale: "主体与角色一致。",
          },
        },
        confidence: 0.82,
        status: "accepted",
        rationale: "只补齐当前规则的角色和主体。",
      });
    },
  };
  const app = await createRunRouteTestApp({
    llmTransport,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs/requirement-rule-repair",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "普通读者只能查询其自己当前借出的书目。",
      rule,
      baseline,
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.requirement.sourceRuleId, "r10");
  assert.equal(body.requirement.actor, "普通读者");
  assert.equal(body.requirement.fieldProvenance.actor.status, "accepted");
  assert.ok(!("requirements" in body), "repair endpoint must not return regenerated rules");
});

test("requirement rule repair normalizes array field values from model output", async () => {
  const rule = {
    id: "r13",
    category: "业务规则" as const,
    text: "在同一时刻，一本书不能既被借出，又可供借阅。",
    relatedDiagrams: ["class" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-baseline",
    requirementText: rule.text,
    rules: [rule],
  });
  const llmTransport: LlmTransport = {
    async *streamChatCompletion() {
      yield JSON.stringify({
        fields: {
          acceptanceCriteria: {
            source: "ai-suggested",
            status: "accepted",
            value: [
              "同一本书在同一时刻只能处于一种借阅状态",
              "已借出的书不得同时展示为可借阅",
            ],
            originalValue: [
              "验证：一本书不能既处于已借出状态",
              "又处于可借阅状态",
            ],
            rationale: "原文明确说明书籍状态互斥。",
          },
        },
        confidence: 0.9,
        status: "accepted",
        rationale: "只规范化当前规则的验收标准。",
      });
    },
  };
  const app = await createRunRouteTestApp({
    llmTransport,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs/requirement-rule-repair",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: rule.text,
      rule,
      baseline,
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.deepEqual(body.requirement.acceptanceCriteria, [
    "同一本书在同一时刻只能处于一种借阅状态",
    "已借出的书不得同时展示为可借阅",
  ]);
  assert.equal(
    body.requirement.fieldProvenance.acceptanceCriteria.originalValue,
    "验证：一本书不能既处于已借出状态；又处于可借阅状态",
  );
  assert.equal(body.requirement.fieldProvenance.acceptanceCriteria.status, "accepted");
});

test("requirement rule repair normalizes string confidence from model output", async () => {
  const rule = {
    id: "r15",
    category: "功能需求" as const,
    text: "用户可以提交订单。",
    relatedDiagrams: ["usecase" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-baseline",
    requirementText: rule.text,
    rules: [rule],
  });
  const llmTransport: LlmTransport = {
    async *streamChatCompletion() {
      yield JSON.stringify({
        fields: {
          actor: {
            source: "ai-suggested",
            status: "accepted",
            value: "用户",
            originalValue: null,
            rationale: "原文明确说明用户。",
          },
        },
        confidence: "82%",
        status: "accepted",
        rationale: "补齐角色。",
      });
    },
  };
  const app = await createRunRouteTestApp({
    llmTransport,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs/requirement-rule-repair",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: rule.text,
      rule,
      baseline,
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().requirement.confidence, 0.82);
});

test("requirement rule batch repair uses one LLM call and returns candidates", async () => {
  const rules = [
    {
      id: "r20",
      category: "功能需求" as const,
      text: "普通读者可以查询当前借出的书目。",
      relatedDiagrams: ["usecase" as const],
    },
    {
      id: "r21",
      category: "业务规则" as const,
      text: "管理员可以增加图书。",
      relatedDiagrams: ["usecase" as const],
    },
  ];
  const baseline = buildRequirementBaseline({
    runId: "run-baseline",
    requirementText: rules.map((rule) => rule.text).join("\n"),
    rules,
  });
  let llmCallCount = 0;
  const llmTransport: LlmTransport = {
    async *streamChatCompletion() {
      llmCallCount += 1;
      yield JSON.stringify({
        repairs: [
          {
            ruleId: "r20",
            fields: {
              actor: {
                source: "ai-suggested",
                status: "accepted",
                value: "普通读者",
                originalValue: null,
                rationale: "原文明确说明普通读者。",
              },
            },
            confidence: "0.82",
            status: "accepted",
            rationale: "补齐普通读者。",
          },
          {
            ruleId: "r21",
            fields: {
              actor: {
                source: "ai-suggested",
                status: "accepted",
                value: "管理员",
                originalValue: null,
                rationale: "原文明确说明管理员。",
              },
            },
            confidence: 0.88,
            status: "accepted",
            rationale: "补齐管理员。",
          },
        ],
      });
    },
  };
  const app = await createRunRouteTestApp({
    llmTransport,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs/requirement-rule-repairs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: rules.map((rule) => rule.text).join("\n"),
      rules,
      targetRuleIds: ["r20", "r21"],
      baseline,
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(llmCallCount, 1);
  const body = response.json();
  assert.equal(body.failures.length, 0);
  assert.deepEqual(
    body.candidates.map((candidate: { ruleId: string }) => candidate.ruleId),
    ["r20", "r21"],
  );
  assert.equal(body.candidates[0].requirement.actor, "普通读者");
  assert.equal(body.candidates[0].requirement.confidence, 0.82);
  assert.equal(body.candidates[1].requirement.actor, "管理员");
});

test("requirement rule batch repair isolates missing and invalid repairs", async () => {
  const rules = [
    {
      id: "r30",
      category: "功能需求" as const,
      text: "普通读者可以查询当前借出的书目。",
      relatedDiagrams: ["usecase" as const],
    },
    {
      id: "r31",
      category: "业务规则" as const,
      text: "管理员可以增加图书。",
      relatedDiagrams: ["usecase" as const],
    },
    {
      id: "r32",
      category: "业务规则" as const,
      text: "系统必须记录图书库存。",
      relatedDiagrams: ["class" as const],
    },
  ];
  const baseline = buildRequirementBaseline({
    runId: "run-baseline",
    requirementText: rules.map((rule) => rule.text).join("\n"),
    rules,
  });
  const originalConfidence = baseline.requirements.find(
    (requirement) => requirement.sourceRuleId === "r30",
  )?.confidence;
  const llmTransport: LlmTransport = {
    async *streamChatCompletion() {
      yield JSON.stringify({
        repairs: [
          {
            ruleId: "r30",
            fields: {
              actor: {
                source: "ai-suggested",
                status: "accepted",
                value: "普通读者",
                originalValue: null,
                rationale: "原文明确说明普通读者。",
              },
            },
            confidence: "high",
            status: "accepted",
            rationale: "无法解析的置信度应被忽略。",
          },
          {
            ruleId: "r31",
            fields: {
              actor: {
                source: "ai-suggested",
              },
            },
            confidence: 0.8,
            status: "accepted",
            rationale: "字段结构不完整。",
          },
        ],
      });
    },
  };
  const app = await createRunRouteTestApp({
    llmTransport,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs/requirement-rule-repairs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: rules.map((rule) => rule.text).join("\n"),
      rules,
      targetRuleIds: ["r30", "r31", "r32"],
      baseline,
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.deepEqual(
    body.candidates.map((candidate: { ruleId: string }) => candidate.ruleId),
    ["r30"],
  );
  assert.equal(body.candidates[0].requirement.confidence, originalConfidence);
  assert.deepEqual(
    body.failures.map((failure: { ruleId: string }) => failure.ruleId).sort(),
    ["r31", "r32"],
  );
});

test("requirement rule repair rejects invalid model output without mutating baseline", async () => {
  const rule = {
    id: "r14",
    category: "业务规则" as const,
    text: "一个读者一次借出的书籍数目不能超过预定值。",
    relatedDiagrams: ["class" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-baseline",
    requirementText: rule.text,
    rules: [rule],
  });
  const llmTransport: LlmTransport = {
    async *streamChatCompletion() {
      yield "{\"fields\":{\"condition\":{\"source\":\"ai-suggested\"}}}";
    },
  };
  const app = await createRunRouteTestApp({
    llmTransport,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs/requirement-rule-repair",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: rule.text,
      rule,
      baseline,
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.json().message, /智能修复失败/);
});

test("project run snapshots reject unauthenticated and cross-project users", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
      "user-b": { start_runs: ["project-b"], view_runs: ["project-b"] },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();

  const anonymousSnapshot = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  assert.equal(anonymousSnapshot.statusCode, 401);

  const crossProjectSnapshot = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-b",
    },
  });
  assert.equal(crossProjectSnapshot.statusCode, 403);

  const ownerSnapshot = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  assert.equal(ownerSnapshot.statusCode, 200);
  assert.equal(ownerSnapshot.json().runId, runId);

  await app.close();
});

test("project run starts reject frontend plaintext provider credentials", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
    allowLegacyProjectProviderSettings: false,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /provider config/i);

  await app.close();
});

test("project run starts can resolve managed provider config secrets", async () => {
  let resolvedProviderSettings: ProviderSettings | null = null;
  const usageInputs: ProviderUsageInput[] = [];
  const limitInputs: ProviderLimitCheckInput[] = [];
  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage(input) {
      usageInputs.push(input);
    },
    async checkLimit(input) {
      limitInputs.push(input);
      return {
        allowed: true,
        usedUnits: 0,
        remainingUnits: input.limit,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      };
    },
  };
  const providerConfigs = createProviderConfigStore({
    baseUrlAllowlist: ["https://ai.comfly.org"],
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "教学模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    defaultModel: "gpt-5.5",
    createdBy: "admin",
  });
  const app = Fastify({ logger: false });
  const runs = createRunRecordStore();
  const completeQueuedRun = async (
    record: RunRecord,
    resolved: ProviderSettings,
  ) => {
    resolvedProviderSettings = resolved;
    record.snapshot.status = "completed";
    emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
  };

  registerRunRoutes({
    app,
    runs,
    documentLibrary: {} as DocumentLibrary,
    llmTransport: {} as LlmTransport,
    renderClient: (async () => {
      throw new Error("render client should not be called by route tests");
    }) as RenderClient,
    pngRenderClient: (async () => {
      throw new Error("png client should not be called by route tests");
    }) as PngRenderClient,
    defaultSseAllowOrigin: "http://localhost:5173",
    runStagePipeline: completeQueuedRun,
    runDesignStagePipeline: completeQueuedRun,
    runCodeStagePipeline: completeQueuedRun,
    runDocumentStagePipeline: async () => undefined,
    addCodeDiagnostic: () => undefined,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
    providerUsageTracker,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(resolvedProviderSettings, {
    apiBaseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    model: "gpt-5.5",
  });
  assert.deepEqual(usageInputs, [
    {
      userId: "user-a",
      projectId: "project-a",
      organizationId: null,
      ipAddress: "127.0.0.1",
      providerConfigId: provider.id,
      taskType: "requirements_to_uml",
      outcome: "success",
    },
  ]);
  assert.deepEqual(limitInputs, [
    {
      userId: "user-a",
      projectId: "project-a",
      organizationId: null,
      ipAddress: "127.0.0.1",
      providerConfigId: provider.id,
      taskType: "requirements_to_uml",
      limit: 60,
      windowSeconds: 60 * 60,
    },
  ]);

  await app.close();
});

test("project run starts derive provider settings from the project default config", async () => {
  let resolvedProviderSettings: ProviderSettings | null = null;
  const providerConfigs = createProviderConfigStore({
    baseUrlAllowlist: ["https://ai.comfly.org"],
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "项目默认模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-project-default",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "admin",
  });
  const app = Fastify({ logger: false });
  const runs = createRunRecordStore();
  const completeQueuedRun = async (
    record: RunRecord,
    resolved: ProviderSettings,
  ) => {
    resolvedProviderSettings = resolved;
    record.snapshot.status = "completed";
    emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
  };

  registerRunRoutes({
    app,
    runs,
    documentLibrary: {} as DocumentLibrary,
    llmTransport: {} as LlmTransport,
    renderClient: (async () => {
      throw new Error("render client should not be called by route tests");
    }) as RenderClient,
    pngRenderClient: (async () => {
      throw new Error("png client should not be called by route tests");
    }) as PngRenderClient,
    defaultSseAllowOrigin: "http://localhost:5173",
    runStagePipeline: completeQueuedRun,
    runDesignStagePipeline: completeQueuedRun,
    runCodeStagePipeline: completeQueuedRun,
    runDocumentStagePipeline: async () => undefined,
    addCodeDiagnostic: () => undefined,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
    resolveProjectDefaultProviderConfig: async (projectId) =>
      projectId === "project-a" ? provider.id : null,
    allowLegacyProjectProviderSettings: false,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(resolvedProviderSettings, {
    apiBaseUrl: "https://ai.comfly.org",
    apiKey: "sk-project-default",
    model: "gpt-5.5",
  });

  await app.close();
});

test("project run starts reject managed provider models not allowed by the config", async () => {
  let pipelineCalls = 0;
  const providerConfigs = createProviderConfigStore({
    baseUrlAllowlist: ["https://ai.comfly.org"],
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "教学模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "admin",
  });
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
    allowLegacyProjectProviderSettings: false,
    completeRuns: false,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-6-unapproved",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /model/i);
  assert.equal(pipelineCalls, 0);

  await app.close();
});

test("anonymous run starts are rejected before provider compatibility checks", async () => {
  const app = await createRunRouteTestApp({
    allowLegacyProjectProviderSettings: false,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "匿名本地工作台需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 401);
  assert.match(response.json().message, /Authentication required/i);

  await app.close();
});

test("project run starts return 429 and do not call the pipeline when provider quota is exhausted", async () => {
  let pipelineCalls = 0;
  const usageInputs: ProviderUsageInput[] = [];
  const providerConfigs = createProviderConfigStore({
    baseUrlAllowlist: ["https://ai.comfly.org"],
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "教学模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    defaultModel: "gpt-5.5",
    createdBy: "admin",
  });
  const app = Fastify({ logger: false });
  const runs = createRunRecordStore();
  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage(input) {
      usageInputs.push(input);
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

  registerRunRoutes({
    app,
    runs,
    documentLibrary: {} as DocumentLibrary,
    llmTransport: {} as LlmTransport,
    renderClient: (async () => {
      throw new Error("render client should not be called by route tests");
    }) as RenderClient,
    pngRenderClient: (async () => {
      throw new Error("png client should not be called by route tests");
    }) as PngRenderClient,
    defaultSseAllowOrigin: "http://localhost:5173",
    runStagePipeline: async () => {
      pipelineCalls += 1;
    },
    runDesignStagePipeline: async () => undefined,
    runCodeStagePipeline: async () => undefined,
    runDocumentStagePipeline: async () => undefined,
    addCodeDiagnostic: () => undefined,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
    providerUsageTracker,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 429);
  assert.match(response.body, /rate limit/i);
  assert.equal(pipelineCalls, 0);
  assert.equal(runs.size, 0);
  assert.deepEqual(usageInputs, []);

  await app.close();
});

test("project run SSE rejects cross-project users before opening the stream", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
      "user-b": { start_runs: ["project-b"], view_runs: ["project-b"] },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  const { runId } = startResponse.json();

  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      "x-test-user-id": "user-b",
      origin: "http://localhost:5173",
    },
  });

  assert.equal(eventsResponse.statusCode, 403);
  assert.notEqual(
    eventsResponse.headers["content-type"],
    "text/event-stream; charset=utf-8",
  );

  await app.close();
});

test("legacy no-context run records are not readable anonymously", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({}),
  });
  const legacyRunId = "legacy-no-context-run";

  runs.set(legacyRunId, {
    snapshot: {
      runId: legacyRunId,
      requirementText: "旧匿名运行",
      selectedDiagrams: ["usecase"],
      rules: [],
      models: [],
      requirementModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      currentStage: "extract_rules",
      status: "completed",
      errorMessage: null,
    },
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: undefined,
  });

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${legacyRunId}`,
  });

  assert.equal(snapshotResponse.statusCode, 401);
  assert.match(snapshotResponse.body, /Authentication required/);

  await app.close();
});

test("project run starts require start_runs permission", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "viewer-a": { view_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "viewer-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 403);

  await app.close();
});

test("project run history lists only runs for an authorized project member", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a", "project-b"],
        view_runs: ["project-a"],
      },
      "user-b": {
        view_runs: ["project-b"],
      },
    }),
  });

  const projectA = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  const projectB = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-b",
      requirementText: "项目 B 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  assert.equal(projectA.statusCode, 202);
  assert.equal(projectB.statusCode, 202);

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const crossProjectHistory = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-b",
    },
  });

  assert.equal(history.statusCode, 200);
  assert.equal(history.json().runs.length, 1);
  const projectRun = history.json().runs[0];
  assert.equal(projectRun.runId, projectA.json().runId);
  assert.equal(projectRun.projectId, "project-a");
  assert.equal(projectRun.stage, "completed");
  assert.equal(projectRun.createdByUserId, "user-a");
  assert.equal(typeof projectRun.startedAt, "string");
  assert.equal(typeof projectRun.updatedAt, "string");
  assert.equal(projectRun.terminal, true);
  assert.equal(crossProjectHistory.statusCode, 403);

  await app.close();
});

test("project run history exposes run kind for each snapshot type", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        view_runs: ["project-a"],
      },
    }),
  });
  const metadata = {
    userId: "user-a",
    projectId: "project-a",
    createdAt: "2026-05-22T02:00:00.000Z",
  };
  const records: RunRecord[] = [
    {
      snapshot: {
        ...createEmptySnapshot("run-requirements", "需求", ["usecase"]),
        currentStage: "render_svg",
        status: "completed",
      },
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata,
    },
    {
      snapshot: {
        ...createEmptyDesignSnapshot("run-design", {
          requirementText: "需求",
          selectedDiagrams: ["sequence"],
          rules: [],
          requirementModels: [],
          requirementModelTraceability: [],
        }),
        currentStage: "render_svg",
        status: "completed",
      },
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata,
    },
    {
      snapshot: {
        ...createEmptyCodeSnapshot("run-code", {
          requirementText: "需求",
          rules: [],
          designModels: [],
        }),
        currentStage: "generate_code_files",
        status: "completed",
      },
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata,
    },
    {
      snapshot: {
        ...createEmptyDocumentSnapshot("run-document", {
          documentKind: "requirementsSpec",
          requirementText: "需求",
        }),
        currentStage: "render_document_file",
        status: "completed",
      },
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata,
    },
  ];
  for (const record of records) {
    runs.set(record.snapshot.runId, record);
  }

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(history.statusCode, 200);
  const runKinds = Object.fromEntries(
    history.json().runs.map((run: { runId: string; runKind: string }) => [
      run.runId,
      run.runKind,
    ]),
  );
  assert.deepEqual(runKinds, {
    "run-document": "document",
    "run-code": "code",
    "run-design": "design",
    "run-requirements": "requirements",
  });

  await app.close();
});

test("project run history exposes snapshot and document capabilities without embedding snapshots", async () => {
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
        manage_documents: ["project-a"],
      },
      "viewer-a": {
        view_runs: ["project-a"],
        view_documents: ["project-a"],
      },
    }),
    allowLegacyProjectProviderSettings: true,
    runDocumentStagePipeline: async (record) => {
      record.documentBuffer = Buffer.from("requirements document");
      Object.assign(record.snapshot, {
        status: "completed",
        currentStage: "render_document_file",
        documentId: "doc-1",
        fileName: "requirements.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 12,
      });
      emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
    },
  });

  const started = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      requirementText: "生成说明书",
      rules: [],
      requirementModels: [minimalUseCaseModel],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings,
      useAiText: false,
    },
  });
  assert.equal(started.statusCode, 202);

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
  });
  assert.equal(history.statusCode, 200);
  const run = history.json().runs[0];
  assert.equal(run.snapshotAvailable, true);
  assert.equal(run.canRestore, true);
  assert.equal(run.documentDownloadAvailable, true);
  assert.equal("snapshot" in run, false);

  const viewerDownload = await app.inject({
    method: "GET",
    url: `/api/document-runs/${run.runId}/download`,
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });
  assert.equal(viewerDownload.statusCode, 200);

  await app.close();
});

test("document run download falls back to persisted project document after run buffer is gone", async () => {
  const persistedDocument = Buffer.from("persisted requirements document");
  const documentLookups: Array<{ workspaceId: string; documentId: string }> = [];
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
        manage_documents: ["project-a"],
      },
      "viewer-a": {
        view_runs: ["project-a"],
        view_documents: ["project-a"],
      },
    }),
    documentLibrary: {
      async getDocumentBuffer(workspaceId, documentId) {
        documentLookups.push({ workspaceId, documentId });
        return documentId === "doc-persisted" ? persistedDocument : null;
      },
    } as DocumentLibrary,
    allowLegacyProjectProviderSettings: true,
    runDocumentStagePipeline: async (record) => {
      Object.assign(record.snapshot, {
        status: "completed",
        currentStage: "render_document_file",
        documentId: "doc-persisted",
        fileName: "persisted-requirements.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: persistedDocument.byteLength,
      });
      emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
    },
  });

  const started = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      requirementText: "生成说明书",
      rules: [],
      requirementModels: [minimalUseCaseModel],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings,
      useAiText: false,
    },
  });
  assert.equal(started.statusCode, 202);

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${started.json().runId}/download`,
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });

  assert.equal(download.statusCode, 200);
  assert.equal(download.body, persistedDocument.toString());
  assert.deepEqual(documentLookups, [
    { workspaceId: "project-project-a", documentId: "doc-persisted" },
  ]);

  await app.close();
});

test("project run history marks terminal running records as interrupted", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
    completeRuns: false,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "中断的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  const runId = response.json().runId as string;
  const record = runs.get(runId);
  assert.ok(record);
  record.snapshot.status = "running";
  record.snapshot.currentStage = "generate_models";
  record.terminal = true;

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(history.statusCode, 200);
  assert.equal(history.json().runs[0].status, "interrupted");
  assert.equal(history.json().runs[0].stage, "generate_models");

  await app.close();
});

test("project run history deletes only authorized terminal project records", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
      "user-b": {
        start_runs: ["project-b"],
        view_runs: ["project-b"],
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "待删除的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  const runId = startResponse.json().runId as string;

  const crossProjectDelete = await app.inject({
    method: "DELETE",
    url: `/api/projects/project-a/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-b",
    },
  });
  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/api/projects/project-a/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(crossProjectDelete.statusCode, 403);
  assert.equal(deleteResponse.statusCode, 204);
  assert.deepEqual(history.json().runs, []);

  await app.close();
});

test("project document runs do not require legacy workspace credentials", async () => {
  let capturedWorkspaceId = "";
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        manage_documents: ["project-a"],
      },
    }),
    runDocumentStagePipeline: async (
      _record,
      _input,
      _documentLibrary,
      workspaceId,
    ) => {
      capturedWorkspaceId = workspaceId;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      requirementText: "生成项目说明书",
      rules: [],
      requirementModels: [minimalUseCaseModel],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings,
      useAiText: true,
    },
  });

  assert.equal(response.statusCode, 202);
  assert.equal(capturedWorkspaceId, "project-project-a");

  await app.close();
});

test("project run history supports detail and status filters for authorized members", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
  });

  const completedRun = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "已完成的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  const failedRun = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "失败的需求",
      selectedDiagrams: ["class"],
      providerSettings,
    },
  });
  const failedRunId = failedRun.json().runId as string;
  const failedRecord = runs.get(failedRunId);
  assert.ok(failedRecord);
  failedRecord.snapshot.status = "failed";
  failedRecord.snapshot.errorMessage = "LLM repair exhausted";
  emitEvent(failedRecord, {
    type: "failed",
    message: failedRecord.snapshot.errorMessage,
  });

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs?status=failed",
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const detail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${failedRunId}`,
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(completedRun.statusCode, 202);
  assert.equal(failedRun.statusCode, 202);
  assert.equal(history.statusCode, 200);
  assert.deepEqual(
    history.json().runs.map((run: { runId: string }) => run.runId),
    [failedRunId],
  );
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().snapshot.runId, failedRunId);
  assert.equal(detail.json().snapshot.status, "failed");
  assert.equal(detail.json().events.at(-1).type, "failed");

  await app.close();
});

test("project run cancel requires start permission, cancels scheduled work, records a terminal event, and is not repeatable", async () => {
  const cancelledRunIds: string[] = [];
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "runner-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
      "viewer-a": {
        view_runs: ["project-a"],
      },
    }),
    completeRuns: false,
    llmScheduler: {
      run: async (_context, task) => task(),
      stream: (_context, task) => task(),
      cancelRun: (runId) => {
        cancelledRunIds.push(runId);
      },
      snapshot: () => ({ running: 0, queued: 0 }),
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "runner-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "可取消的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  const runId = startResponse.json().runId as string;

  const viewerCancel = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${runId}/cancel`,
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });
  const cancel = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${runId}/cancel`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const duplicateCancel = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${runId}/cancel`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const detail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${runId}`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const sseHistory = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      "x-test-user-id": "runner-a",
      origin: "http://localhost:5173",
    },
  });

  assert.equal(viewerCancel.statusCode, 403);
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().action, "cancel");
  assert.equal(cancel.json().status, "cancelled");
  assert.deepEqual(cancelledRunIds, [runId]);
  assert.equal(duplicateCancel.statusCode, 409);
  assert.equal(detail.json().snapshot.status, "cancelled");
  assert.equal(detail.json().events.at(-1).type, "cancelled");
  assert.match(sseHistory.body, /"type":"queued"/);
  assert.match(sseHistory.body, /"type":"cancelled"/);

  await app.close();
});

test("project run retry and rerun create queued records and start their pipeline", async () => {
  const pipelineRunIds: string[] = [];
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "runner-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
    completeRuns: false,
    runStagePipeline: async (record) => {
      pipelineRunIds.push(record.snapshot.runId);
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "runner-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "需要重试的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  const sourceRunId = startResponse.json().runId as string;
  await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${sourceRunId}/cancel`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });

  const retry = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${sourceRunId}/retry`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const rerun = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${sourceRunId}/rerun`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const retryDetail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${retry.json().runId}`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const sourceDetail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${sourceRunId}`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });

  assert.equal(retry.statusCode, 202);
  assert.equal(rerun.statusCode, 202);
  assert.notEqual(retry.json().runId, sourceRunId);
  assert.notEqual(rerun.json().runId, sourceRunId);
  assert.equal(retryDetail.json().snapshot.status, "queued");
  assert.equal(retryDetail.json().snapshot.requirementText, "需要重试的需求");
  assert.equal(sourceDetail.json().snapshot.status, "cancelled");
  assert.equal(sourceDetail.json().events.at(-1).type, "run_action");
  assert.deepEqual(pipelineRunIds, [
    sourceRunId,
    retry.json().runId,
    rerun.json().runId,
  ]);

  await app.close();
});

test("project run evidence exposes review items and records human decisions", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "reviewer-a": {
        view_runs: ["project-a"],
        start_runs: ["project-a"],
      },
    }),
  });
  const baseline = buildRequirementBaseline({
    runId: "run-evidence-review",
    requirementText: "系统响应时间不超过2秒。",
    rules: [
      {
        id: "r1",
        category: "非功能需求",
        text: "系统响应时间不超过2秒。",
        relatedDiagrams: ["deployment"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const snapshot = createEmptySnapshot(
    "run-evidence-review",
    "系统响应时间不超过2秒。",
    ["deployment"],
  );
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.requirementBaseline = baseline;
  snapshot.coverageMatrix = {
    runId: snapshot.runId,
    rows: [
      {
        requirementId: "REQ-001",
        status: "not-modelable",
        rationale: "Requirement needs alternative evidence.",
        modelElements: [],
        designElements: [],
        codeArtifacts: [],
        tests: [],
        reviewItems: ["alternative-evidence:REQ-001"],
      },
    ],
  };
  snapshot.traceabilityMatrix = { runId: snapshot.runId, links: [], diagnostics: [] };
  runs.set(snapshot.runId, {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: {
      userId: "reviewer-a",
      projectId: "project-a",
      createdAt: "2026-05-24T00:00:00.000Z",
    },
  });

  const initialEvidence = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${snapshot.runId}/evidence`,
    headers: { "x-test-user-id": "reviewer-a" },
  });
  assert.equal(initialEvidence.statusCode, 200);
  assert.equal(initialEvidence.json().evidencePackage.status, "blocked");
  const reviewItemId = initialEvidence.json().evidencePackage.reviewItems[0].id;

  const decisionResponse = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${snapshot.runId}/review-decisions`,
    headers: { "x-test-user-id": "reviewer-a" },
    payload: {
      reviewItemId,
      decision: "accepted-risk",
      comment: "以压测报告作为替代证据。",
    },
  });

  assert.equal(decisionResponse.statusCode, 200);
  assert.equal(decisionResponse.json().evidencePackage.status, "complete");
  assert.equal(decisionResponse.json().evidencePackage.reviewItems[0].status, "resolved");
  assert.equal(
    decisionResponse.json().evidencePackage.reviewDecisions[0].reviewerId,
    "reviewer-a",
  );

  await app.close();
});

test("blocked evidence package prevents downstream design run start", async () => {
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "reviewer-a": {
        start_runs: ["project-a"],
      },
    }),
  });
  const baseline = buildRequirementBaseline({
    runId: "run-blocked-evidence",
    requirementText: "系统响应时间不超过2秒。",
    rules: [
      {
        id: "r1",
        category: "非功能需求",
        text: "系统响应时间不超过2秒。",
        relatedDiagrams: ["deployment"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const snapshot = createEmptySnapshot(
    "run-blocked-evidence",
    "系统响应时间不超过2秒。",
    ["deployment"],
  );
  snapshot.status = "completed";
  snapshot.requirementBaseline = baseline;
  snapshot.coverageMatrix = {
    runId: snapshot.runId,
    rows: [
      {
        requirementId: "REQ-001",
        status: "not-modelable",
        rationale: "Requirement needs alternative evidence.",
        modelElements: [],
        designElements: [],
        codeArtifacts: [],
        tests: [],
        reviewItems: ["alternative-evidence:REQ-001"],
      },
    ],
  };
  const evidencePackage = buildEvidencePackage({ snapshot });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: { "x-test-user-id": "reviewer-a" },
    payload: {
      projectId: "project-a",
      requirementText: "系统响应时间不超过2秒。",
      rules: [],
      requirementBaseline: baseline,
      requirementModels: [minimalUseCaseModel],
      requirementModelTraceability: [
        {
          ruleId: "REQ-001",
          target: {
            diagramKind: "usecase",
            elementId: "usecase-view",
            elementKind: "useCase",
            label: "查看活动",
          },
        },
      ],
      selectedDiagrams: ["sequence"],
      providerSettings,
      evidencePackage,
    },
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.json().message, /EvidencePackage review is unresolved/);

  await app.close();
});

test("guest project run starts return 429 after the visitor daily generation limit", async () => {
  let pipelineCalls = 0;
  const generationUsage = createGenerationUsageService({
    guestEmail: "guest@example.edu",
    guestDailyLimit: 1,
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  });
  const app = await createRunRouteTestApp({
    generationUsage,
    runAccessGuard: {
      async resolveRunAccess(request) {
        return {
          userId: "guest-user",
          projectId: stringHeader(request, "x-test-project-id"),
          email: "guest@example.edu",
        };
      },
      async canAccessProject({ projectId }) {
        return projectId === "project-a";
      },
    },
    runStagePipeline: async () => {
      pipelineCalls += 1;
    },
  });

  const first = await app.inject({
    method: "POST",
    url: "/api/runs",
    remoteAddress: "203.0.113.10",
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  assert.equal(first.statusCode, 202);

  const second = await app.inject({
    method: "POST",
    url: "/api/runs",
    remoteAddress: "203.0.113.10",
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings,
    },
  });
  assert.equal(second.statusCode, 429);
  assert.match(second.json().message, /generation limit/i);
  assert.equal(pipelineCalls, 1);

  await app.close();
});

test("design LLM scheduler completion marks the subtask completed", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "reviewer-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
    llmScheduler: createInMemoryLlmScheduler({
      globalConcurrency: 1,
      providerConcurrency: 1,
      projectConcurrency: 1,
      userConcurrency: 1,
      runConcurrency: 1,
    }),
    llmTransport: {
      async *streamChatCompletion() {
        yield "{}";
      },
    },
    runDesignStagePipeline: async (record, providerSettings, llmTransport) => {
      record.snapshot.status = "running";
      record.snapshot.currentStage = "generate_design_models";
      for await (const _chunk of llmTransport.streamChatCompletion({
        providerSettings,
        messages: [
          {
            role: "user",
            content: "只生成以下设计图类型：\nclass",
          },
        ],
      })) {
        // The route-level scheduler emits status events while the pipeline consumes output.
      }
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: { "x-test-user-id": "reviewer-a" },
    payload: {
      projectId: "project-a",
      requirementText: "系统支持查看活动。",
      rules: [],
      requirementModels: [minimalUseCaseModel],
      requirementModelTraceability: [
        {
          ruleId: "REQ-001",
          target: {
            diagramKind: "usecase",
            elementId: "usecase-view",
            elementKind: "useCase",
            label: "查看活动",
          },
        },
      ],
      selectedDiagrams: ["class"],
      providerSettings,
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  const record = runs.get(response.json().runId);
  assert.ok(record);
  const startedAt = Date.now();
  while (
    Date.now() - startedAt < 1000 &&
    !record.events.some(
      (event) =>
        event.type === "stage_progress" && event.message === "模型调用完成",
    )
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.subtaskId === "class" &&
        event.subtaskStatus === "completed" &&
        event.message === "模型调用完成",
    ),
  );

  await app.close();
});
