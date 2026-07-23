// Registers feasibility run endpoints; lifecycle work is delegated to the formal run pipeline.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  contextDiagramSpecSchema,
  contextTraceRowSchema,
  feasibilityInputsSchema,
  feasibilityRunSnapshotSchema,
  queuedRunEventSchema,
  requirementBaselineSchema,
  requirementRulesSchema,
  snapshotInputFingerprint,
  startFeasibilityRunRequestSchema,
  type ProviderSettings,
} from "@uml-platform/contracts";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import type { LlmTransport } from "../../llm.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import {
  resolveProviderRateLimitPolicy,
  type ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { BillingService } from "../../billing/billing-service.js";
import { generatePlantUmlArtifacts } from "../../plantuml.js";
import { createEmptyFeasibilitySnapshot } from "../../runs/records/snapshots.js";
import {
  emitEvent,
  refreshRunRecordIfAvailable,
  type RunRecord,
  type RunRecordMetadata,
  type RunRecordStore,
} from "../../runs/records/run-record-store.js";
import { registerRunEventsRoute } from "../../runs/records/run-events.js";
import { flushRunStoreIfAvailable, type RunQueue } from "../../runs/queue/run-queue.js";
import {
  checkGenerationUsageLimit,
  checkProviderUsageLimit,
  recordGenerationUsage,
  recordProviderUsage,
  resolveProviderConfigIdForRun,
  resolveProviderSettingsForRun,
} from "../../runs/providers/run-provider-gates.js";
import { reserveBillingRunUsage } from "../../runs/billing/run-billing-gates.js";
import { startFeasibilityRecordPipeline } from "../../runs/pipelines/run-record-pipeline-starter.js";
import {
  attachProjectWorkspaceSync,
  type ProjectWorkspaceSync,
} from "../runs/project-workspace-sync.js";

type ProjectWorkspace = { version: number; state: Record<string, unknown> };
type RunBillingEntitlements = Pick<
  BillingService,
  "reserveRunUsage" | "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
>;

function acceptedRules(state: Record<string, unknown>) {
  const rules = requirementRulesSchema.parse(state.rules ?? []);
  const baselineResult = requirementBaselineSchema.nullable().safeParse(state.requirementBaseline ?? null);
  const baseline = baselineResult.success ? baselineResult.data : null;
  if (!baseline) return { rules, baseline };
  const acceptedRuleIds = new Set(
    baseline.requirements
      .filter((requirement) => requirement.status === "accepted")
      .map((requirement) => requirement.sourceRuleId)
      .filter((id): id is string => Boolean(id)),
  );
  return { rules: rules.filter((rule) => acceptedRuleIds.has(rule.id)), baseline };
}

function existingContextFromWorkspace(
  state: Record<string, unknown>,
  expectedFingerprint: string,
) {
  const context = contextDiagramSpecSchema.safeParse(state.feasibilityContextModel ?? null);
  const source = typeof state.feasibilityContextPlantUml === "string" ? state.feasibilityContextPlantUml : "";
  const svg = typeof state.feasibilityContextSvg === "string" ? state.feasibilityContextSvg : "";
  const fingerprint = typeof state.feasibilityContextFingerprint === "string"
    ? state.feasibilityContextFingerprint
    : null;
  if (!context.success || !source || !svg || fingerprint !== expectedFingerprint) return null;
  const generatedArtifact = generatePlantUmlArtifacts([context.data])[0];
  if (!generatedArtifact) return null;
  const traceability = contextTraceRowSchema.array().safeParse(state.feasibilityContextTraceability ?? []);
  return {
    contextModel: context.data,
    contextTraceability: traceability.success ? traceability.data : [],
    contextPlantUml: { ...generatedArtifact, source },
    contextSvg: {
      ...generatedArtifact,
      svg,
      renderMeta: {
        engine: "workspace",
        generatedAt: new Date().toISOString(),
        sourceLength: source.length,
        durationMs: 0,
      },
    },
    contextFingerprint: fingerprint,
  };
}

export function registerFeasibilityRoutes({
  app,
  runs,
  renderClient,
  llmTransport,
  llmScheduler,
  providerConfigs,
  providerUsageTracker,
  generationUsage,
  billingEntitlements,
  runQueue,
  defaultSseAllowOrigin,
  resolveUserId,
  canUpdateProject,
  loadWorkspace,
  syncProjectWorkspace,
}: {
  app: FastifyInstance;
  runs: RunRecordStore;
  renderClient: RenderClient;
  llmTransport: LlmTransport;
  llmScheduler?: LlmScheduler;
  providerConfigs?: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker;
  generationUsage?: GenerationUsageService;
  billingEntitlements?: RunBillingEntitlements;
  runQueue?: RunQueue;
  defaultSseAllowOrigin: string;
  resolveUserId: (request: FastifyRequest) => Promise<string | null>;
  canUpdateProject: (projectId: string, userId: string) => Promise<boolean>;
  loadWorkspace: (projectId: string) => Promise<ProjectWorkspace>;
  syncProjectWorkspace?: ProjectWorkspaceSync;
}) {
  const usageAccess = {
    async resolveRunAccess(request: FastifyRequest) {
      return { userId: (await resolveUserId(request)) ?? undefined };
    },
  };

  app.post("/api/feasibility-runs", async (request, reply) => {
    const parsedInput = startFeasibilityRunRequestSchema.safeParse(request.body);
    if (!parsedInput.success) {
      return reply.code(400).send({ message: "请提交项目、目标产物以及有效的 Provider 和模型。" });
    }
    const input = parsedInput.data;
    const userId = await resolveUserId(request);
    if (!userId) return reply.code(401).send({ message: "Authentication required" });
    if (!(await canUpdateProject(input.projectId, userId))) {
      return reply.code(403).send({ message: "Project update access denied" });
    }
    const metadata: RunRecordMetadata = {
      userId,
      projectId: input.projectId,
      model: input.providerSettings.model,
      createdAt: new Date().toISOString(),
    };
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      request,
      reply,
    });
    if (!providerSettings) {
      return { message: "请选择有权限的 Provider 和模型。" };
    }
    const providerConfigId = await resolveProviderConfigIdForRun({ providerSettings: input.providerSettings });
    const generationCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard: usageAccess,
      request,
      reply,
    });
    if (generationCheck !== true) return generationCheck;
    const providerCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "feasibility_analysis",
      policy: resolveProviderRateLimitPolicy(),
      reply,
    });
    if (providerCheck !== true) return providerCheck;

    const workspace = await loadWorkspace(input.projectId);
    const { rules, baseline } = acceptedRules(workspace.state);
    if (rules.length === 0) {
      return reply.code(409).send({ message: "请先在系统需求页确认至少一条有效需求规则。" });
    }
    const inputs = feasibilityInputsSchema.parse(workspace.state.feasibilityInputs ?? {});
    const expectedContextFingerprint = snapshotInputFingerprint({ rules, requirementBaseline: baseline });
    const existingContext = existingContextFromWorkspace(workspace.state, expectedContextFingerprint);
    if (
      input.selectedArtifacts.includes("implementation") &&
      !input.selectedArtifacts.includes("context") &&
      !existingContext
    ) {
      return reply.code(409).send({ message: "实现方案依赖最新有效的上下文图，请同时选择上下文图。" });
    }

    const runId = randomUUID();
    let runBillingEntitlements = billingEntitlements;
    if (providerConfigId && providerConfigs) {
      const providerConfig = await providerConfigs.get(providerConfigId);
      if (providerConfig?.scopeType === "user" && providerConfig.scopeId === userId) {
        runBillingEntitlements = undefined;
      }
    }
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements: runBillingEntitlements,
      metadata,
      runId,
      taskType: "feasibility_analysis",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "feasibility_analysis",
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard: usageAccess,
      request,
      taskType: "feasibility_analysis",
      providerConfigId,
    });

    const record: RunRecord = {
      snapshot: createEmptyFeasibilitySnapshot(runId, {
        projectId: input.projectId,
        selectedArtifacts: input.selectedArtifacts,
        providerSettings: input.providerSettings,
        rules,
        requirementBaseline: baseline,
        inputs,
        ...(existingContext ?? {}),
      }),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    runs.set(runId, record);
    attachProjectWorkspaceSync(record, syncProjectWorkspace);
    runQueue?.attachEventPublisher(record);
    // PostgreSQL persistence must complete before any workspace sync can use this run as a foreign key.
    await flushRunStoreIfAvailable(runs);
    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    if (runQueue?.enabled) {
      await flushRunStoreIfAvailable(runs);
      await runQueue.enqueueRun({ record });
    } else {
      startFeasibilityRecordPipeline({
        record,
        providerSettings: providerSettings as ProviderSettings,
        providerConfigId,
        llmTransport,
        llmScheduler,
        renderClient,
        billingEntitlements: runBillingEntitlements,
      });
    }
    return reply.code(202).send({ runId });
  });

  app.get("/api/feasibility-runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || !("selectedArtifacts" in record.snapshot)) {
      return reply.code(404).send({ message: "Feasibility run not found" });
    }
    const userId = await resolveUserId(request);
    if (!userId) return reply.code(401).send({ message: "Authentication required" });
    if (!record.metadata?.projectId || !(await canUpdateProject(record.metadata.projectId, userId))) {
      return reply.code(403).send({ message: "Project access denied" });
    }
    return feasibilityRunSnapshotSchema.parse(record.snapshot);
  });

  registerRunEventsRoute({
    app,
    runs,
    path: "/api/feasibility-runs/:runId/events",
    notFoundMessage: "Feasibility run not found",
    defaultAllowOrigin: defaultSseAllowOrigin,
    subscribeRunEvents: runQueue?.subscribeRunEvents,
    canReadRunRecord: async (request, reply, record) => {
      if (!("selectedArtifacts" in record.snapshot)) return false;
      const userId = await resolveUserId(request);
      if (!userId) {
        reply.code(401);
        return false;
      }
      return Boolean(record.metadata?.projectId && await canUpdateProject(record.metadata.projectId, userId));
    },
  });
}
