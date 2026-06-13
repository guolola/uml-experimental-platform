// Owns admin session/RBAC response projection and scoped admin actor construction.
import type { FastifyReply, FastifyRequest } from "fastify";
import { adminSessionResponseSchema } from "@uml-platform/contracts";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import { isAuthError, requireAdminSessionAuth } from "../auth/guards.js";
import { toUserDto } from "../auth/dto.js";
import {
  getAdminHeaderActor,
  type AdminActor,
} from "../security/admin-guard.js";
import {
  buildAdminRbacContext,
  getAdminCapabilities,
  getAdminDataScopes,
  getAdminPermissions,
  getAdminRoles,
  hasAnyAdminRole,
} from "../security/admin-rbac.js";
import type { ScopedAdminActor } from "./academic-scope.js";

function withAdminCapabilities(actor: AdminActor): ScopedAdminActor {
  return {
    ...actor,
    capabilities: getAdminCapabilities(actor.roles),
  };
}

export async function requireScopedAdminActor(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
): Promise<ScopedAdminActor | { message: string }> {
  const headerActor = getAdminHeaderActor(request);
  if (headerActor) {
    return withAdminCapabilities(headerActor);
  }

  const auth = await requireAdminSessionAuth(request, reply, authStore);
  if (isAuthError(auth)) return auth;
  if (!hasAnyAdminRole(auth.user.systemRoles)) {
    reply.code(403);
    return { message: "Admin access required" };
  }
  if (!auth.user.mfaEnabled) {
    reply.code(403);
    return { message: "Admin MFA is required before accessing the admin console" };
  }

  const roles = getAdminRoles(auth.user.systemRoles);
  return {
    id: auth.user.id,
    name: auth.user.displayName,
    role: roles[0] ?? "admin",
    roles,
    permissions: getAdminPermissions(roles),
    dataScopes: getAdminDataScopes(roles),
    capabilities: getAdminCapabilities(roles),
  };
}

export async function getAdminSessionView(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
) {
  const auth = await requireAdminSessionAuth(request, reply, authStore);
  if (isAuthError(auth)) return auth;
  if (!hasAnyAdminRole(auth.user.systemRoles)) {
    reply.code(403);
    return { message: "Admin role required" };
  }
  if (!auth.user.mfaEnabled) {
    reply.code(403);
    return { message: "Admin MFA is required before accessing the admin console" };
  }

  return adminSessionResponseSchema.parse({
    user: toUserDto(auth.user),
    ...buildAdminRbacContext(auth.user.systemRoles),
  });
}
