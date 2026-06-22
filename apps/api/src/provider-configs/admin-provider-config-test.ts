// Runs admin provider config health checks outside the admin HTTP route registration layer.
import { getModelCapability } from "../model-capabilities.js";
import { getHealthcheckResponseFormat } from "../adapters/llm/response-formats/index.js";
import {
  ProviderHttpError,
  runOpenAiCompatibleChatCompletionHealthcheck,
} from "../llm.js";
import type { AdminActor } from "../security/admin-guard.js";
import type { ProviderConfigStore } from "./provider-config-store.js";
import {
  selectProviderRateLimitPolicy,
  type ProviderRateLimitPolicy,
  type ProviderRateLimitPolicyRecord,
  type ProviderUsageTracker,
} from "./provider-usage-tracker.js";

export async function testAdminProviderConfigConnection({
  providerConfigs,
  providerUsageTracker,
  rateLimitPolicies,
  providerRateLimitPolicy,
  providerConfigId,
  actor,
  ipAddress,
  model,
}: {
  providerConfigs: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker;
  rateLimitPolicies: ProviderRateLimitPolicyRecord[];
  providerRateLimitPolicy: ProviderRateLimitPolicy;
  providerConfigId: string;
  actor: AdminActor;
  ipAddress: string;
  model?: string;
}): Promise<{ statusCode: number; body: unknown }> {
  const providerConfig = await providerConfigs.get(providerConfigId);
  if (!providerConfig) {
    return { statusCode: 404, body: { message: "Provider config not found" } };
  }
  if (!providerConfig.allowlisted) {
    return {
      statusCode: 400,
      body: { ok: false, message: "Provider Base URL is not allowlisted" },
    };
  }
  if (providerConfig.status !== "active") {
    return {
      statusCode: 400,
      body: { ok: false, message: "Provider config is revoked, disabled, or inactive" },
    };
  }
  if (providerConfig.breakerState === "open") {
    return {
      statusCode: 503,
      body: {
        ok: false,
        message: "Provider circuit breaker is open",
        breaker: {
          state: providerConfig.breakerState,
          failureCount: providerConfig.breakerFailureCount,
          openedAt: providerConfig.breakerOpenedAt,
          lastFailureAt: providerConfig.breakerLastFailureAt,
        },
      },
    };
  }
  const testModel = model ?? providerConfig.defaultModel;
  if (!providerConfig.allowedModels.includes(testModel)) {
    return {
      statusCode: 400,
      body: { ok: false, message: "Provider model is not allowed by this config" },
    };
  }
  const apiKey = await providerConfigs.getSecret(providerConfigId);
  if (!apiKey) {
    return {
      statusCode: 400,
      body: { ok: false, message: "Provider config secret is revoked" },
    };
  }

  if (providerUsageTracker) {
    const policy = selectProviderRateLimitPolicy(
      {
        userId: actor.id,
        projectId: null,
        providerConfigId,
        taskType: "provider_test",
        ipAddress,
      },
      rateLimitPolicies,
      providerRateLimitPolicy,
    );
    const limitDecision = await providerUsageTracker.checkLimit({
      userId: actor.id,
      projectId: null,
      ipAddress,
      providerConfigId,
      taskType: "provider_test",
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
    });
    if (!limitDecision.allowed) {
      return {
        statusCode: 429,
        body: {
          ok: false,
          message: "Provider rate limit exceeded",
          rateLimit: limitDecision,
        },
      };
    }
  }

  const modelCapability = providerConfig.modelCapabilities[testModel];
  const capability = getModelCapability(modelCapability ?? testModel);
  try {
    await runOpenAiCompatibleChatCompletionHealthcheck({
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      model: testModel,
      responseFormat: getHealthcheckResponseFormat(modelCapability ?? testModel),
    });
  } catch (error) {
    const breaker = await providerConfigs.recordFailure?.(providerConfigId);
    const providerStatus =
      error instanceof ProviderHttpError ? error.status : null;
    return {
      statusCode:
        providerStatus !== null && providerStatus >= 400 && providerStatus < 500
          ? 400
          : 502,
      body: {
        ok: false,
        message:
          error instanceof Error ? error.message : "Provider test failed",
        capability,
        breaker: breaker
          ? {
              state: breaker.breakerState,
              failureCount: breaker.breakerFailureCount,
              openedAt: breaker.breakerOpenedAt,
              lastFailureAt: breaker.breakerLastFailureAt,
            }
          : undefined,
      },
    };
  }

  await providerConfigs.markUsed(providerConfigId);
  await providerConfigs.resetBreaker?.(providerConfigId);
  await providerUsageTracker?.recordUsage({
    userId: actor.id,
    projectId: null,
    ipAddress,
    providerConfigId,
    provider: providerConfig.provider,
    model: testModel,
    taskType: "provider_test",
    outcome: "success",
  });
  return {
    statusCode: 200,
    body: {
      ok: true,
      message: "Provider connection ok",
      capability,
    },
  };
}
