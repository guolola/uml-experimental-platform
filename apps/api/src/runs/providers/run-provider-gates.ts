// Centralizes run provider config resolution, rate-limit gates, and usage accounting.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ProviderSettings, ProviderSettingsInput } from "@uml-platform/contracts";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderRateLimitPolicy,
  ProviderTaskType,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import type { RunRecord, RunRecordMetadata } from "../records/run-record-store.js";

type RunAccessResolver = {
  resolveRunAccess(request: FastifyRequest): Promise<{
    userId?: string;
    email?: string | null;
  }>;
};

function stringHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function organizationIdFromRequest(request: FastifyRequest) {
  return stringHeader(request, "x-uml-organization-id") ?? null;
}

function ipAddressFromRequest(request: FastifyRequest) {
  return stringHeader(request, "x-forwarded-for")?.split(",")[0]?.trim() ??
    request.ip ??
    null;
}

function isManagedProviderSettings(
  providerSettings: ProviderSettingsInput | undefined,
): providerSettings is Extract<ProviderSettingsInput, { providerConfigId: string }> {
  return Boolean(providerSettings && "providerConfigId" in providerSettings);
}

export async function resolveProviderSettingsForRun({
  providerSettings,
  metadata,
  providerConfigs,
  resolveProjectDefaultProviderConfig,
  request,
  reply,
}: {
  providerSettings: ProviderSettingsInput | undefined;
  metadata: RunRecordMetadata | undefined;
  providerConfigs?: ProviderConfigStore;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
  request: FastifyRequest;
  reply: FastifyReply;
}): Promise<ProviderSettings | null> {
  const isProjectRun = Boolean(metadata?.projectId);

  if (!providerSettings) {
    if (!isProjectRun || !metadata?.projectId || !providerConfigs || !resolveProjectDefaultProviderConfig) {
      reply.code(400);
      return null;
    }
    const providerConfigId = await resolveProjectDefaultProviderConfig(metadata.projectId);
    if (!providerConfigId) {
      reply.code(400);
      return null;
    }
    const providerConfig = await providerConfigs.get(providerConfigId);
    if (!providerConfig) {
      reply.code(400);
      return null;
    }
    providerSettings = {
      providerConfigId,
      model: providerConfig.defaultModel,
    };
  }

  if (isManagedProviderSettings(providerSettings)) {
    if (!isProjectRun) {
      reply.code(401);
      return null;
    }
    if (!providerConfigs) {
      reply.code(500);
      return null;
    }
    const providerConfig = await providerConfigs.get(providerSettings.providerConfigId);
    if (!providerConfig) {
      reply.code(400);
      return null;
    }
    if (!providerConfig.allowlisted) {
      reply.code(400);
      return null;
    }
    if (providerConfig.status !== "active") {
      reply.code(400);
      return null;
    }
    if (providerConfig.breakerState === "open") {
      reply.code(503);
      return null;
    }
    if (!providerConfig.allowedModels.includes(providerSettings.model)) {
      reply.code(400);
      return null;
    }
    const apiKey = await providerConfigs.getSecret(providerSettings.providerConfigId);
    if (!apiKey) {
      reply.code(400);
      return null;
    }
    const modelCapability = providerConfig.modelCapabilities[providerSettings.model];
    return {
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      model: providerSettings.model,
      ...(modelCapability ? { modelCapability } : {}),
    };
  }

  reply.code(400);
  return null;
}

function providerConfigIdFromSettings(providerSettings: ProviderSettingsInput | undefined) {
  return isManagedProviderSettings(providerSettings)
    ? providerSettings.providerConfigId
    : null;
}

export async function resolveProviderConfigIdForRun({
  providerSettings,
  metadata,
  resolveProjectDefaultProviderConfig,
}: {
  providerSettings: ProviderSettingsInput | undefined;
  metadata: RunRecordMetadata | undefined;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
}) {
  const explicitProviderConfigId = providerConfigIdFromSettings(providerSettings);
  if (explicitProviderConfigId) return explicitProviderConfigId;
  if (!metadata?.projectId || !resolveProjectDefaultProviderConfig) return null;
  return resolveProjectDefaultProviderConfig(metadata.projectId);
}

export function snapshotProviderSettings(record: RunRecord) {
  const settings = (record.snapshot as { providerSettings?: unknown }).providerSettings;
  return settings && typeof settings === "object"
    ? (settings as ProviderSettingsInput)
    : undefined;
}

export function rememberProviderSettings(
  record: RunRecord,
  providerSettings: ProviderSettingsInput | undefined,
  resolved?: { providerConfigId: string | null; model: string },
) {
  const settingsToRemember =
    providerSettings ??
    (resolved?.providerConfigId
      ? {
          providerConfigId: resolved.providerConfigId,
          model: resolved.model,
        }
      : undefined);
  if (!settingsToRemember) return;
  (record.snapshot as { providerSettings?: ProviderSettingsInput }).providerSettings =
    settingsToRemember;
}

export function isActiveRun(record: RunRecord) {
  return (
    !record.terminal &&
    (record.snapshot.status === "queued" || record.snapshot.status === "running")
  );
}

export function taskTypeForRun(record: RunRecord): ProviderTaskType {
  const snapshot = record.snapshot;
  if ("documentKind" in snapshot) return "document_generation";
  if ("files" in snapshot) return "code_generation";
  if ("designModelTraceability" in snapshot) return "design_modeling";
  return "requirements_to_uml";
}

export async function recordProviderUsage({
  usageTracker,
  providerConfigId,
  metadata,
  request,
  taskType,
}: {
  usageTracker?: ProviderUsageTracker;
  providerConfigId: string | null;
  metadata?: RunRecordMetadata;
  request: FastifyRequest;
  taskType: ProviderTaskType;
}) {
  if (!usageTracker || !providerConfigId) return;
  await usageTracker.recordUsage({
    userId: metadata?.userId ?? null,
    projectId: metadata?.projectId ?? null,
    organizationId: organizationIdFromRequest(request),
    ipAddress: ipAddressFromRequest(request),
    providerConfigId,
    taskType,
    outcome: "success",
  });
}

export async function checkProviderUsageLimit({
  usageTracker,
  providerConfigId,
  metadata,
  request,
  taskType,
  policy,
  reply,
}: {
  usageTracker?: ProviderUsageTracker;
  providerConfigId: string | null;
  metadata?: RunRecordMetadata;
  request: FastifyRequest;
  taskType: ProviderTaskType;
  policy: ProviderRateLimitPolicy;
  reply: FastifyReply;
}) {
  if (!usageTracker || !providerConfigId) return true;

  const decision = await usageTracker.checkLimit({
    userId: metadata?.userId ?? null,
    projectId: metadata?.projectId ?? null,
    organizationId: organizationIdFromRequest(request),
    ipAddress: ipAddressFromRequest(request),
    providerConfigId,
    taskType,
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
  });
  if (decision.allowed) return true;

  reply.code(429);
  return {
    message: "Provider rate limit exceeded",
    rateLimit: decision,
  };
}

export async function checkGenerationUsageLimit({
  generationUsage,
  runAccessGuard,
  request,
  reply,
}: {
  generationUsage?: GenerationUsageService;
  runAccessGuard: RunAccessResolver;
  request: FastifyRequest;
  reply: FastifyReply;
}) {
  if (!generationUsage) return true;
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) return true;
  const decision = await generationUsage.checkGenerationLimit({
    userId: access.userId,
    email: access.email,
    ipAddress: ipAddressFromRequest(request),
  });
  if (decision.allowed) return true;

  reply.code(429);
  return {
    message: "Guest generation limit exceeded",
    generationUsage: decision.usage,
  };
}

export async function recordGenerationUsage({
  generationUsage,
  runAccessGuard,
  request,
  taskType,
  providerConfigId,
}: {
  generationUsage?: GenerationUsageService;
  runAccessGuard: RunAccessResolver;
  request: FastifyRequest;
  taskType: ProviderTaskType;
  providerConfigId: string | null;
}) {
  if (!generationUsage) return;
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) return;
  await generationUsage.recordGenerationUsage({
    userId: access.userId,
    email: access.email,
    ipAddress: ipAddressFromRequest(request),
    taskType,
    providerConfigId,
  });
}
