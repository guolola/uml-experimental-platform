// Centralizes admin high-risk permission checks and audit helpers used by admin routes.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminPermission } from "@uml-platform/contracts";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import {
  type AdminActor,
  requireAdminPermission,
} from "../security/admin-guard.js";
import { actorLabel } from "./admin-route-presenters.js";

const HIGH_RISK_ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "super-admin",
  "system_admin",
  "system-admin",
  "system_operator",
  "security_admin",
  "security-admin",
]);

export async function revokeActiveSessionsForUser(
  authStore: AuthStore,
  userId: string,
) {
  const sessions = await authStore.listActiveSessionsForUser(userId);
  for (const session of sessions) {
    await authStore.revokeSession(session.id);
  }
  return sessions.length;
}

export async function recordAdminAction(
  authStore: AuthStore,
  input: {
    actor: AdminActor;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: "success" | "failure";
    message: string;
  },
) {
  return authStore.recordAuditLog({
    actorUserId: input.actor.id,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: input.outcome,
    message: input.message,
  });
}

export async function requireHighRiskAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  action: string,
  targetType: string,
  targetId: string | null,
  permission: AdminPermission,
) {
  const actor = await requireAdminPermission(request, reply, authStore, permission);
  if ("message" in actor) return actor;

  const providerConfigOperator =
    permission === "admin.provider_configs.write" && actor.roles.includes("model_admin");
  if (!providerConfigOperator && !HIGH_RISK_ADMIN_ROLES.has(actor.role)) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType,
      targetId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} is not allowed to perform ${action} on ${targetType}:${targetId ?? "unknown"}`,
    });
    reply.code(403);
    return { message: "High-risk admin permission required" } as const;
  }

  return actor;
}
