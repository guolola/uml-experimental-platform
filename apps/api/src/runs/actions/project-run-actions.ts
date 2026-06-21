// Recreates queued project runs for retry/rerun after route-level access is resolved.
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ProviderSettings, RunAction } from "@uml-platform/contracts";
import type { BillingService } from "../../billing/billing-service.js";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderRateLimitPolicy,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { reserveBillingRunUsage } from "../billing/run-billing-gates.js";
import {
  checkGenerationUsageLimit,
  checkProviderUsageLimit,
  isActiveRun,
  recordGenerationUsage,
  recordProviderUsage,
  rememberProviderSettings,
  resolveProviderConfigIdForRun,
  resolveProviderSettingsForRun,
  snapshotProviderSettings,
  taskTypeForRun,
} from "../providers/run-provider-gates.js";
import {
  createQueuedRunFromSource,
  isRetryableRun,
} from "../records/run-actions.js";
import type {
  RunRecord,
  RunRecordMetadata,
  RunRecordStore,
} from "../records/run-record-store.js";

type ProjectRunAction = Extract<RunAction, "retry" | "rerun">;

type StartProjectRunActionPipeline = (input: {
  record: RunRecord;
  providerSettings: ProviderSettings;
  providerConfigId: string | null;
}) => void | Promise<void>;

type RunAccessResolver = {
  resolveRunAccess(request: FastifyRequest): Promise<{
    userId?: string;
    email?: string | null;
  }>;
};

export async function createProjectRunAction({
  request,
  reply,
  action,
  projectId,
  runId,
  actorUserId,
  runs,
  runAccessGuard,
  providerConfigs,
  resolveProjectDefaultProviderConfig,
  providerUsageTracker,
  generationUsage,
  billingEntitlements,
  providerRateLimitPolicy,
  startRecordPipeline,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  action: ProjectRunAction;
  projectId: string;
  runId: string;
  actorUserId?: string;
  runs: RunRecordStore;
  runAccessGuard: RunAccessResolver;
  providerConfigs?: ProviderConfigStore;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
  providerUsageTracker?: ProviderUsageTracker;
  generationUsage?: GenerationUsageService;
  billingEntitlements?: Pick<
    BillingService,
    "reserveRunUsage" | "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
  >;
  providerRateLimitPolicy: ProviderRateLimitPolicy;
  startRecordPipeline: StartProjectRunActionPipeline;
}) {
  const source = runs.get(runId);
  if (!source || source.metadata?.projectId !== projectId) {
    reply.code(404);
    return { message: "Run not found" };
  }
  if (action === "retry" && !isRetryableRun(source)) {
    reply.code(409);
    return { message: "Only failed, cancelled, or interrupted runs can be retried" };
  }
  if (isActiveRun(source)) {
    reply.code(409);
    return { message: "Running or queued runs cannot be rerun" };
  }

  const metadata: RunRecordMetadata = {
    userId: actorUserId,
    projectId,
    createdAt: new Date().toISOString(),
  };
  const providerSettingsInput = snapshotProviderSettings(source);
  const providerSettings = await resolveProviderSettingsForRun({
    providerSettings: providerSettingsInput,
    metadata,
    providerConfigs,
    resolveProjectDefaultProviderConfig,
    request,
    reply,
  });
  if (!providerSettings) {
    return {
      message: "Runs must use an admin-managed provider config with an allowed model.",
    };
  }
  const providerConfigId = await resolveProviderConfigIdForRun({
    providerSettings: providerSettingsInput,
    metadata,
    resolveProjectDefaultProviderConfig,
  });
  const taskType = taskTypeForRun(source);
  const generationLimitCheck = await checkGenerationUsageLimit({
    generationUsage,
    runAccessGuard,
    request,
    reply,
  });
  if (generationLimitCheck !== true) return generationLimitCheck;
  const limitCheck = await checkProviderUsageLimit({
    usageTracker: providerUsageTracker,
    providerConfigId,
    metadata,
    request,
    taskType,
    policy: providerRateLimitPolicy,
    reply,
  });
  if (limitCheck !== true) return limitCheck;
  const newRunId = randomUUID();
  const billingCheck = await reserveBillingRunUsage({
    billingEntitlements,
    metadata,
    runId: newRunId,
    taskType,
    reply,
  });
  if (billingCheck !== true) return billingCheck;
  await recordProviderUsage({
    usageTracker: providerUsageTracker,
    providerConfigId,
    metadata,
    request,
    taskType,
  });
  await recordGenerationUsage({
    generationUsage,
    runAccessGuard,
    request,
    taskType,
    providerConfigId,
  });

  // Retry/rerun reuse the source snapshot, then start a fresh pipeline for the queued copy.
  const result = createQueuedRunFromSource({
    runs,
    source,
    metadata,
    action,
    sourceRunId: runId,
    actorUserId,
    runId: newRunId,
  });
  const newRecord = runs.get(result.runId);
  if (newRecord) {
    rememberProviderSettings(newRecord, providerSettingsInput, {
      providerConfigId,
      model: providerSettings.model,
    });
    await startRecordPipeline({
      record: newRecord,
      providerSettings,
      providerConfigId,
    });
  }

  reply.code(202);
  return result;
}
