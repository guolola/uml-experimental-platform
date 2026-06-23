// Handles admin provider config mutations after route-level permission and schema checks.
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { ProviderModelCapabilityMap } from "@uml-platform/contracts";
import type { AdminActor } from "../security/admin-guard.js";
import {
  ProviderConfigPolicyError,
  type ProviderConfigScopeType,
  type ProviderConfigStore,
} from "../provider-configs/provider-config-store.js";
import { actorLabel } from "./admin-route-presenters.js";
import { recordAdminAction } from "./admin-route-security.js";

type CreateProviderConfigInput = {
  name: string;
  provider?: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  allowedModels?: string[];
  modelCapabilities?: ProviderModelCapabilityMap;
  keyPurpose?: string;
  quota?: string;
  scopeType: ProviderConfigScopeType;
  scopeId?: string | null;
};

type UpdateProviderConfigInput = {
  name?: string;
  defaultModel?: string;
  allowedModels?: string[];
  modelCapabilities?: ProviderModelCapabilityMap;
  keyPurpose?: string;
  quota?: string;
  scopeType?: ProviderConfigScopeType;
  scopeId?: string | null;
};

type ProviderConfigActionResult = Promise<{ statusCode: number; body: unknown }>;

type ProviderConfigScopeResult =
  | {
      ok: true;
      scopeType: ProviderConfigScopeType;
      scopeId: string | null;
    }
  | {
      ok: false;
      statusCode: number;
      body: { message: string };
    };

async function resolveProviderConfigScope({
  authStore,
  scopeType,
  scopeId,
}: {
  authStore: AuthStore;
  scopeType: ProviderConfigScopeType;
  scopeId?: string | null;
}): Promise<ProviderConfigScopeResult> {
  const resolvedScopeId = scopeType === "system" ? null : scopeId ?? null;
  if (scopeType !== "system" && !resolvedScopeId) {
    return {
      ok: false,
      statusCode: 400,
      body: { message: "Provider config scopeId is required for user or project scope" },
    };
  }
  if (
    scopeType === "user" &&
    resolvedScopeId &&
    !(await authStore.getUser(resolvedScopeId))
  ) {
    return {
      ok: false,
      statusCode: 400,
      body: { message: "Provider config scope user does not exist" },
    };
  }
  if (
    scopeType === "project" &&
    resolvedScopeId &&
    !(await authStore.getProject(resolvedScopeId))
  ) {
    return {
      ok: false,
      statusCode: 400,
      body: { message: "Provider config scope project does not exist" },
    };
  }
  return { ok: true, scopeType, scopeId: resolvedScopeId };
}

export async function createAdminProviderConfig({
  authStore,
  providerConfigs,
  actor,
  input,
}: {
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
  input: CreateProviderConfigInput;
}): ProviderConfigActionResult {
  const scope = await resolveProviderConfigScope({
    authStore,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  });
  if (!scope.ok) return { statusCode: scope.statusCode, body: scope.body };

  try {
    const created = await providerConfigs.create({
      ...input,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      createdBy: actor.name,
    });
    await recordAdminAction(authStore, {
      actor,
      action: "admin.provider_config.create",
      targetType: "provider_config",
      targetId: created.id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} created provider config ${created.name}`,
    });
    return { statusCode: 201, body: created };
  } catch (error) {
    if (error instanceof ProviderConfigPolicyError) {
      return { statusCode: 400, body: { message: error.message } };
    }
    throw error;
  }
}

export async function updateAdminProviderConfig({
  authStore,
  providerConfigs,
  actor,
  providerConfigId,
  input,
}: {
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
  providerConfigId: string;
  input: UpdateProviderConfigInput;
}): ProviderConfigActionResult {
  if (!providerConfigs.updateMetadata) {
    return {
      statusCode: 501,
      body: { message: "Provider config update is not supported by this store" },
    };
  }

  const current = await providerConfigs.get(providerConfigId);
  if (!current) {
    return { statusCode: 404, body: { message: "Provider config not found" } };
  }
  if (current.scopeType === "user") {
    return {
      statusCode: 403,
      body: {
        message:
          "User-owned provider configs can only be changed by the owning user",
      },
    };
  }

  const scopeType = input.scopeType ?? current.scopeType;
  const scope = await resolveProviderConfigScope({
    authStore,
    scopeType,
    scopeId: scopeType === "system" ? null : input.scopeId ?? current.scopeId,
  });
  if (!scope.ok) return { statusCode: scope.statusCode, body: scope.body };

  try {
    const updated = await providerConfigs.updateMetadata(
      providerConfigId,
      { ...input, scopeType: scope.scopeType, scopeId: scope.scopeId },
      actor.name,
    );
    if (!updated) {
      return {
        statusCode: 404,
        body: { message: "Provider config not found or revoked" },
      };
    }
    await recordAdminAction(authStore, {
      actor,
      action: "admin.provider_config.update",
      targetType: "provider_config",
      targetId: providerConfigId,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} updated provider config ${updated.name}`,
    });
    return { statusCode: 200, body: updated };
  } catch (error) {
    if (error instanceof ProviderConfigPolicyError) {
      return { statusCode: 400, body: { message: error.message } };
    }
    throw error;
  }
}

export async function rotateAdminProviderConfigKey({
  authStore,
  providerConfigs,
  actor,
  providerConfigId,
  apiKey,
}: {
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
  providerConfigId: string;
  apiKey: string;
}): ProviderConfigActionResult {
  const current = await providerConfigs.get(providerConfigId);
  if (!current) {
    return { statusCode: 404, body: { message: "Provider config not found" } };
  }
  if (current.scopeType === "user") {
    return {
      statusCode: 403,
      body: {
        message:
          "User-owned provider configs can only be rotated by the owning user",
      },
    };
  }
  const rotated = await providerConfigs.rotate(providerConfigId, apiKey, actor.name);
  if (!rotated) {
    return { statusCode: 404, body: { message: "Provider config not found" } };
  }
  await recordAdminAction(authStore, {
    actor,
    action: "admin.provider_config.rotate",
    targetType: "provider_config",
    targetId: providerConfigId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} rotated provider config ${rotated.name}`,
  });
  return { statusCode: 200, body: rotated };
}

export async function revokeAdminProviderConfig({
  authStore,
  providerConfigs,
  actor,
  providerConfigId,
}: {
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
  providerConfigId: string;
}): ProviderConfigActionResult {
  const revoked = await providerConfigs.revoke(providerConfigId, actor.name);
  if (!revoked) {
    return { statusCode: 404, body: { message: "Provider config not found" } };
  }
  await recordAdminAction(authStore, {
    actor,
    action: "admin.provider_config.revoke",
    targetType: "provider_config",
    targetId: providerConfigId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} revoked provider config ${revoked.name}`,
  });
  return { statusCode: 200, body: revoked };
}

export async function updateAdminProviderConfigStatus({
  authStore,
  providerConfigs,
  actor,
  providerConfigId,
  nextStatus,
  action,
}: {
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
  providerConfigId: string;
  nextStatus: "active" | "disabled";
  action: "enable" | "disable";
}): ProviderConfigActionResult {
  const updateStatus =
    action === "enable" ? providerConfigs.enable : providerConfigs.disable;
  if (!updateStatus) {
    return {
      statusCode: 501,
      body: { message: "Provider config status update is not supported by this store" },
    };
  }

  const current = await providerConfigs.get(providerConfigId);
  if (!current) {
    return {
      statusCode: 404,
      body: { message: "Provider config not found or revoked" },
    };
  }
  if (current.scopeType === "user" && action === "enable") {
    return {
      statusCode: 403,
      body: {
        message:
          "User-owned provider configs can only be disabled or revoked by admins",
      },
    };
  }

  const updated = await updateStatus.call(providerConfigs, providerConfigId, actor.name);
  if (!updated) {
    return {
      statusCode: 404,
      body: { message: "Provider config not found or revoked" },
    };
  }

  const adminAction = `admin.provider_config.${action}`;
  await recordAdminAction(authStore, {
    actor,
    action: adminAction,
    targetType: "provider_config",
    targetId: providerConfigId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} changed provider config ${updated.name} to ${nextStatus}`,
  });
  return { statusCode: 200, body: updated };
}

export async function resetAdminProviderConfigBreaker({
  authStore,
  providerConfigs,
  actor,
  providerConfigId,
}: {
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
  providerConfigId: string;
}): ProviderConfigActionResult {
  if (!providerConfigs.resetBreaker) {
    return {
      statusCode: 501,
      body: { message: "Provider circuit breaker reset is not supported by this store" },
    };
  }

  const current = await providerConfigs.get(providerConfigId);
  if (!current) {
    return { statusCode: 404, body: { message: "Provider config not found" } };
  }
  if (current.scopeType === "user") {
    return {
      statusCode: 403,
      body: {
        message:
          "User-owned provider configs can only be disabled or revoked by admins",
      },
    };
  }

  const updated = await providerConfigs.resetBreaker(providerConfigId);
  if (!updated) {
    return { statusCode: 404, body: { message: "Provider config not found" } };
  }

  await recordAdminAction(authStore, {
    actor,
    action: "admin.provider_config.reset_breaker",
    targetType: "provider_config",
    targetId: providerConfigId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} reset provider config breaker for ${updated.name}`,
  });
  return { statusCode: 200, body: updated };
}
