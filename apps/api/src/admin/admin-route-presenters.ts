// Builds admin console DTOs and display helpers outside the HTTP route registration file.
import type { BillingService } from "../billing/billing-service.js";
import type { DocumentLibrary } from "../documents/library/document-library.js";
import type { AuthStore, UserRecord } from "../auth/in-memory-auth-store.js";
import type { AdminActor } from "../security/admin-guard.js";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import type {
  ProviderRateLimitPolicy,
  ProviderRateLimitPolicyRecord,
  ProviderTaskType,
  ProviderUsageTracker,
} from "../provider-configs/provider-usage-tracker.js";
import type {
  RunRecord,
  RunRecordStore,
} from "../runs/records/run-record-store.js";
import {
  GENERATION_TASKS,
  buildRunArtifactItems,
  buildRunArtifactSummary,
  calculateDurationMs,
  isGenerationTaskType,
  readProviderConfigId,
  readProviderModel,
  snapshotErrorMessage,
  taskTypeForSnapshot,
  type AdminRunTaskType,
  type GenerationTaskType,
} from "../runs/records/admin-run-summaries.js";

export function metric(label: string, value: string, trend = "", tone = "neutral") {
  return { label, value, trend, tone };
}

export async function toAdminUserDto(
  user: UserRecord,
  billingService?: Pick<BillingService, "getSummary">,
) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled ?? false,
    systemRoles: user.systemRoles,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    billingSummary: billingService ? await billingService.getSummary(user.id) : undefined,
  };
}

export function userLabel(user: UserRecord) {
  return `${user.displayName} <${user.email}> (${user.id})`;
}

export function actorLabel(actor: AdminActor) {
  return `${actor.name} (${actor.id})`;
}

export function providerRateLimitDto(policy: ProviderRateLimitPolicy) {
  return {
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
    source:
      policy.source === "env"
        ? "environment"
        : policy.source === "stored"
          ? "admin_policy"
          : "default",
  };
}

export function disabledProviderCostEstimate() {
  return {
    enabled: false,
    amount: null,
    currency: null,
    externalBillingSource: "external_provider",
    note:
      "Provider usage is operational telemetry only; cost estimates are disabled and account billing stays with the external provider.",
  } as const;
}

export async function listMetricDocuments(documentLibrary: DocumentLibrary) {
  const listAllDocuments = (documentLibrary as { listAllDocuments?: unknown }).listAllDocuments;
  if (typeof listAllDocuments !== "function") return [];
  const documents = await listAllDocuments.call(documentLibrary);
  return Array.isArray(documents)
    ? documents.filter((document): document is Record<string, unknown> =>
        Boolean(document) && typeof document === "object" && !Array.isArray(document),
      )
    : [];
}

export async function modelUsageByTask(
  providerUsageTracker: ProviderUsageTracker | undefined,
  window: { startIso: string; endIso: string },
) {
  const usage = new Map<GenerationTaskType, number>(
    GENERATION_TASKS.map((item) => [item.taskType, 0]),
  );
  const sums = await providerUsageTracker?.sumUsageUnits?.({
    taskTypes: GENERATION_TASKS.map((item) => item.taskType as ProviderTaskType),
    createdAfter: window.startIso,
    createdBefore: window.endIso,
  });
  for (const sum of sums ?? []) {
    const taskType = sum.taskType as AdminRunTaskType;
    if (isGenerationTaskType(taskType)) {
      usage.set(taskType, sum.units);
    }
  }
  return usage;
}

export async function buildAdminRunDto(
  record: RunRecord,
  authStore: AuthStore,
  options: { includeArtifactPreviews?: boolean; providerConfigs?: ProviderConfigStore } = {},
) {
  const projectId = typeof record.metadata?.projectId === "string" ? record.metadata.projectId : null;
  const operatorId = typeof record.metadata?.userId === "string" ? record.metadata.userId : null;
  const providerConfigId = readProviderConfigId(record.snapshot);
  const [project, operator] = await Promise.all([
    projectId ? authStore.getProject(projectId) : Promise.resolve(null),
    operatorId ? authStore.getUser(operatorId) : Promise.resolve(null),
  ]);
  const providerConfig =
    providerConfigId && options.providerConfigs
      ? await options.providerConfigs.get(providerConfigId)
      : null;
  const createdAt = record.metadata?.createdAt ?? null;
  const completedAt = record.metadata?.completedAt ?? null;
  return {
    id: record.snapshot.runId,
    status: record.snapshot.status,
    currentStage: record.snapshot.currentStage,
    errorMessage: snapshotErrorMessage(record.snapshot),
    taskType: taskTypeForSnapshot(record.snapshot),
    model: readProviderModel(record.snapshot) ?? record.metadata?.model ?? null,
    providerConfigId,
    providerName: providerConfig?.name ?? null,
    provider: providerConfig?.provider ?? null,
    providerScopeType: providerConfig?.scopeType ?? null,
    providerStatus: providerConfig?.status ?? null,
    projectId,
    projectName: project?.name ?? null,
    operatorId,
    operatorName: operator?.displayName ?? operator?.email ?? null,
    createdAt,
    completedAt,
    durationMs: calculateDurationMs(createdAt ?? undefined, completedAt ?? undefined),
    artifactSummary: buildRunArtifactSummary(record.snapshot),
    artifactItems: buildRunArtifactItems(record.snapshot, {
      includePreviews: options.includeArtifactPreviews,
    }),
    metadata: record.metadata ?? null,
  };
}

function toOrganizationType(visibility: string) {
  if (visibility === "course") return "course";
  if (visibility === "team") return "team";
  return "team";
}

export async function buildOrganizationUnits(authStore: AuthStore, runs: RunRecordStore) {
  const projects = await authStore.listProjects();
  return Promise.all(
    projects.map(async (project) => {
      const owner = await authStore.getUser(project.ownerUserId);
      const members = await authStore.listProjectMembers(project.id);
      const projectRuns = Array.from(runs.values()).filter(
        (record) => record.metadata?.projectId === project.id,
      ).length;

      return {
        id: project.id,
        type: toOrganizationType(project.visibility),
        name: project.name,
        owner: owner?.displayName ?? owner?.email ?? project.ownerUserId,
        members: members.filter((member) => member.status === "active").length,
        projects: 1,
        quotaUsed: `${projectRuns} runs`,
      };
    }),
  );
}

export async function buildProviderQuotaFallback({
  providerConfigs,
  policies,
}: {
  providerConfigs: ProviderConfigStore;
  policies: ProviderRateLimitPolicyRecord[];
}) {
  const configsById = new Map(
    (await providerConfigs.list()).map((config) => [config.id, config]),
  );
  return policies.flatMap((policy) => {
    if (!policy.providerConfigId || !policy.enabled) return [];
    const config = configsById.get(policy.providerConfigId);
    if (!config) return [];
    return [
      {
        providerConfigId: policy.providerConfigId,
        provider: config.provider,
        model: config.defaultModel,
        taskType: policy.taskType,
        scopeType: policy.scopeType,
        scopeId: policy.scopeId,
        limit: policy.limit,
        windowSeconds: policy.windowSeconds,
        usedUnits: 0,
        remainingUnits: policy.limit,
        resetAt: null,
      },
    ];
  });
}
