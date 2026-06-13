// Handles admin rate-limit policy mutations after route-level permission checks.
import type {
  AdminRateLimitPolicyCreateRequest,
  AdminRateLimitPolicyUpdateRequest,
} from "@uml-platform/contracts";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { ProviderRateLimitPolicyRecord } from "../provider-configs/provider-usage-tracker.js";
import type { AdminActor } from "../security/admin-guard.js";
import { actorLabel } from "./admin-route-presenters.js";
import { recordAdminAction } from "./admin-route-security.js";

type RateLimitPolicyStore = {
  createRateLimitPolicy(
    input: Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<ProviderRateLimitPolicyRecord>;
  updateRateLimitPolicy(
    id: string,
    input: Partial<
      Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">
    >,
  ): Promise<ProviderRateLimitPolicyRecord | null>;
};

type AdminRateLimitActionResult = Promise<{
  statusCode: number;
  body: unknown;
}>;

export async function createAdminRateLimitPolicy({
  authStore,
  rateLimitPolicyStore,
  actor,
  input,
}: {
  authStore: AuthStore;
  rateLimitPolicyStore: RateLimitPolicyStore;
  actor: AdminActor;
  input: AdminRateLimitPolicyCreateRequest;
}): AdminRateLimitActionResult {
  const created = await rateLimitPolicyStore.createRateLimitPolicy({
    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,
    providerConfigId: input.providerConfigId ?? null,
    taskType: input.taskType ?? null,
    limit: input.limit,
    windowSeconds: input.windowSeconds,
    enabled: input.enabled,
  });
  await recordAdminAction(authStore, {
    actor,
    action: "admin.rate_limit.create",
    targetType: "rate_limit_policy",
    targetId: created.id,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} created rate limit policy ${created.id}`,
  });
  return { statusCode: 201, body: { rateLimit: created } };
}

export async function updateAdminRateLimitPolicy({
  authStore,
  rateLimitPolicyStore,
  actor,
  rateLimitPolicyId,
  input,
}: {
  authStore: AuthStore;
  rateLimitPolicyStore: RateLimitPolicyStore;
  actor: AdminActor;
  rateLimitPolicyId: string;
  input: AdminRateLimitPolicyUpdateRequest;
}): AdminRateLimitActionResult {
  const updated = await rateLimitPolicyStore.updateRateLimitPolicy(
    rateLimitPolicyId,
    input,
  );
  if (!updated) {
    return { statusCode: 404, body: { message: "Rate limit policy not found" } };
  }
  await recordAdminAction(authStore, {
    actor,
    action: "admin.rate_limit.update",
    targetType: "rate_limit_policy",
    targetId: rateLimitPolicyId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} updated rate limit policy ${rateLimitPolicyId}`,
  });
  return { statusCode: 200, body: { rateLimit: updated } };
}
