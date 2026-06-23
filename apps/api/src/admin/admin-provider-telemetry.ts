// Builds admin provider telemetry and rate-limit read models for route callers.
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import type {
  ProviderRateLimitPolicy,
  ProviderRateLimitPolicyRecord,
  ProviderUsageTracker,
} from "../provider-configs/provider-usage-tracker.js";
import {
  buildProviderQuotaFallback,
  disabledProviderCostEstimate,
  providerRateLimitDto,
} from "./admin-route-presenters.js";

type RateLimitPolicyReader = {
  listRateLimitPolicies(): Promise<ProviderRateLimitPolicyRecord[]>;
};

export async function buildAdminProviderConfigListView({
  authStore,
  providerConfigs,
}: {
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
}) {
  const providerConfigRows = await providerConfigs.list();
  const providerConfigDtos = await Promise.all(
    providerConfigRows.map(async (config) => {
      if (config.scopeType === "user" && config.scopeId) {
        const owner = await authStore.getUser(config.scopeId);
        return {
          ...config,
          scopeLabel: `用户：${owner?.displayName ?? config.scopeId}`,
          ownerUserName: owner?.displayName ?? null,
          ownerUserEmail: owner?.email ?? null,
        };
      }
      if (config.scopeType === "project" && config.scopeId) {
        const project = await authStore.getProject(config.scopeId);
        return {
          ...config,
          scopeLabel: `项目：${project?.name ?? config.scopeId}`,
          ownerUserName: null,
          ownerUserEmail: null,
        };
      }
      return {
        ...config,
        scopeLabel: "系统级",
        ownerUserName: null,
        ownerUserEmail: null,
      };
    }),
  );
  return {
    generatedAt: new Date().toISOString(),
    providerConfigs: providerConfigDtos,
  };
}

export async function buildAdminRateLimitPolicyView({
  rateLimitPolicyStore,
  providerRateLimitPolicy,
}: {
  rateLimitPolicyStore: RateLimitPolicyReader;
  providerRateLimitPolicy: ProviderRateLimitPolicy;
}) {
  return {
    rateLimits: await rateLimitPolicyStore.listRateLimitPolicies(),
    fallbackPolicy: providerRateLimitDto(providerRateLimitPolicy),
  };
}

export async function buildAdminRateLimitPolicyListView({
  rateLimitPolicyStore,
  providerRateLimitPolicy,
}: {
  rateLimitPolicyStore: RateLimitPolicyReader;
  providerRateLimitPolicy: ProviderRateLimitPolicy;
}) {
  return {
    generatedAt: new Date().toISOString(),
    ...(await buildAdminRateLimitPolicyView({
      rateLimitPolicyStore,
      providerRateLimitPolicy,
    })),
  };
}

export async function listAdminProviderUsage({
  providerUsageTracker,
}: {
  providerUsageTracker?: ProviderUsageTracker;
}) {
  const events = providerUsageTracker?.listUsageEvents
    ? await providerUsageTracker.listUsageEvents()
    : [];

  return events.map((event) => ({
    ...event,
    costEstimate: disabledProviderCostEstimate(),
  }));
}

export async function buildAdminProviderUsageView({
  providerUsageTracker,
}: {
  providerUsageTracker?: ProviderUsageTracker;
}) {
  return {
    generatedAt: new Date().toISOString(),
    usage: await listAdminProviderUsage({ providerUsageTracker }),
  };
}

export async function listAdminProviderQuotas({
  providerUsageTracker,
  providerConfigs,
  rateLimitPolicyStore,
}: {
  providerUsageTracker?: ProviderUsageTracker;
  providerConfigs: ProviderConfigStore;
  rateLimitPolicyStore: RateLimitPolicyReader;
}) {
  const quotas = providerUsageTracker?.listQuotaSnapshots
    ? await providerUsageTracker.listQuotaSnapshots()
    : await buildProviderQuotaFallback({
        providerConfigs,
        policies: await rateLimitPolicyStore.listRateLimitPolicies(),
      });

  return quotas.map((quota) => ({
    ...quota,
    costEstimate: disabledProviderCostEstimate(),
  }));
}

export async function buildAdminProviderQuotaView({
  providerUsageTracker,
  providerConfigs,
  rateLimitPolicyStore,
}: {
  providerUsageTracker?: ProviderUsageTracker;
  providerConfigs: ProviderConfigStore;
  rateLimitPolicyStore: RateLimitPolicyReader;
}) {
  return {
    generatedAt: new Date().toISOString(),
    quotas: await listAdminProviderQuotas({
      providerUsageTracker,
      providerConfigs,
      rateLimitPolicyStore,
    }),
  };
}
