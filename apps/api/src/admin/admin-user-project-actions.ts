// Handles high-risk admin user and project mutations after route-level permission checks.
import type { BillingService } from "../billing/billing-service.js";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import { toProjectDto } from "../auth/dto.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import type { AdminActor } from "../security/admin-guard.js";
import {
  canSeeProjectByScope,
  visibleUserIdsForAdmin,
} from "./academic-scope.js";
import {
  actorLabel,
  toAdminUserDto,
  userLabel,
} from "./admin-route-presenters.js";
import {
  recordAdminAction,
  revokeActiveSessionsForUser,
} from "./admin-route-security.js";

type AdminActionResult = Promise<{ statusCode: number; body: unknown }>;
type AdminBillingSummaryProvider = Pick<BillingService, "getSummary">;

async function requireVisibleAdminUser({
  academicStore,
  authStore,
  actor,
  userId,
  action,
  missingMessage,
  outOfScopeMessage,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
  userId: string;
  action: string;
  missingMessage: string;
  outOfScopeMessage: string;
}) {
  const user = await authStore.getUser(userId);
  if (!user) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "user",
      targetId: userId,
      outcome: "failure",
      message: missingMessage,
    });
    return { ok: false, statusCode: 404, body: { message: "User not found" } } as const;
  }

  const visibleUserIds = await visibleUserIdsForAdmin(
    academicStore,
    authStore,
    actor,
  );
  if (visibleUserIds !== null && !visibleUserIds.has(userId)) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "user",
      targetId: userId,
      outcome: "failure",
      message: outOfScopeMessage,
    });
    return {
      ok: false,
      statusCode: 403,
      body: { message: "User is outside admin data scope" },
    } as const;
  }

  return { ok: true, user } as const;
}

export async function disableAdminUser({
  academicStore,
  authStore,
  billingService,
  actor,
  userId,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  billingService?: AdminBillingSummaryProvider;
  actor: AdminActor;
  userId: string;
}): AdminActionResult {
  const action = "admin.user.disable";
  const userResult = await requireVisibleAdminUser({
    academicStore,
    authStore,
    actor,
    userId,
    action,
    missingMessage: `Actor ${actorLabel(actor)} failed to disable missing user (${userId})`,
    outOfScopeMessage: `Actor ${actorLabel(actor)} attempted to disable user outside data scope (${userId})`,
  });
  if (!userResult.ok) {
    return { statusCode: userResult.statusCode, body: userResult.body };
  }

  const updated = await authStore.updateUser(userId, { status: "disabled" });
  const revokedSessions = await revokeActiveSessionsForUser(authStore, userId);
  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "user",
    targetId: userId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} disabled user ${userLabel(userResult.user)} and revoked ${revokedSessions} active session(s)`,
  });

  return {
    statusCode: 200,
    body: {
      user: await toAdminUserDto(updated ?? userResult.user, billingService),
      revokedSessions,
    },
  };
}

export async function forceLogoutAdminUser({
  academicStore,
  authStore,
  billingService,
  actor,
  userId,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  billingService?: AdminBillingSummaryProvider;
  actor: AdminActor;
  userId: string;
}): AdminActionResult {
  const action = "admin.user.force_logout";
  const userResult = await requireVisibleAdminUser({
    academicStore,
    authStore,
    actor,
    userId,
    action,
    missingMessage: `Actor ${actorLabel(actor)} failed to force logout missing user (${userId})`,
    outOfScopeMessage: `Actor ${actorLabel(actor)} attempted to force logout user outside data scope (${userId})`,
  });
  if (!userResult.ok) {
    return { statusCode: userResult.statusCode, body: userResult.body };
  }

  const revokedSessions = await revokeActiveSessionsForUser(authStore, userId);
  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "user",
    targetId: userId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} forced logout for user ${userLabel(userResult.user)} and revoked ${revokedSessions} active session(s)`,
  });

  return {
    statusCode: 200,
    body: {
      user: await toAdminUserDto(userResult.user, billingService),
      revokedSessions,
    },
  };
}

export async function resetAdminUserMfa({
  academicStore,
  authStore,
  billingService,
  actor,
  userId,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  billingService?: AdminBillingSummaryProvider;
  actor: AdminActor;
  userId: string;
}): AdminActionResult {
  const action = "admin.user.reset_mfa";
  const userResult = await requireVisibleAdminUser({
    academicStore,
    authStore,
    actor,
    userId,
    action,
    missingMessage: `Actor ${actorLabel(actor)} failed to reset MFA for missing user (${userId})`,
    outOfScopeMessage: `Actor ${actorLabel(actor)} attempted to reset MFA for user outside data scope (${userId})`,
  });
  if (!userResult.ok) {
    return { statusCode: userResult.statusCode, body: userResult.body };
  }

  const updated = await authStore.updateUser(userId, { mfaEnabled: false });
  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "user",
    targetId: userId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} reset MFA state for user ${userLabel(userResult.user)}`,
  });

  return {
    statusCode: 200,
    body: {
      user: await toAdminUserDto(updated ?? userResult.user, billingService),
      message: "MFA state reset",
    },
  };
}

export async function freezeAdminProject({
  academicStore,
  authStore,
  actor,
  projectId,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
  projectId: string;
}): AdminActionResult {
  const action = "admin.project.freeze";
  const existingProject = await authStore.getProject(projectId);
  if (
    existingProject &&
    !(await canSeeProjectByScope(academicStore, authStore, actor, existingProject))
  ) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "project",
      targetId: projectId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} attempted to freeze project outside data scope (${projectId})`,
    });
    return {
      statusCode: 403,
      body: { message: "Project is outside admin data scope" },
    };
  }

  const project = await authStore.updateProject(projectId, { status: "archived" });
  if (!project) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "project",
      targetId: projectId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} failed to freeze missing project (${projectId})`,
    });
    return { statusCode: 404, body: { message: "Project not found" } };
  }

  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "project",
    targetId: projectId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} froze project ${project.name} (${project.id}) by setting status to archived`,
  });

  return {
    statusCode: 200,
    body: {
      project: toProjectDto(project),
      message: "Project frozen by setting status to archived",
    },
  };
}
