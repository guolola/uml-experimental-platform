// Builds admin audit log read models while preserving data-scope filtering.
import type { AuditLogDto } from "@uml-platform/contracts";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import type { AdminActor } from "../security/admin-guard.js";
import {
  hasFullProjectScope,
  visibleProjectsForAdmin,
} from "./academic-scope.js";

function toProviderAuditLogDto(
  log: Awaited<ReturnType<ProviderConfigStore["listAuditLogs"]>>[number],
): AuditLogDto {
  return {
    id: log.id,
    actorUserId: null,
    action: log.action,
    targetType: "provider_config",
    targetId: log.target,
    outcome: log.result === "success" ? "success" : "failure",
    message: `Provider action by ${log.actor} from ${log.ip}`,
    createdAt: log.createdAt,
  };
}

async function listVisiblePlatformAuditLogs({
  academicStore,
  authStore,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
}) {
  const visibleProjectIds = hasFullProjectScope(actor)
    ? null
    : new Set(
        (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
          (project) => project.id,
        ),
      );

  return (await authStore.listAuditLogs()).filter((log) => {
    if (visibleProjectIds === null || actor.dataScopes.includes("audit_logs")) {
      return true;
    }
    if (log.targetType === "project") {
      return log.targetId !== null && visibleProjectIds.has(log.targetId);
    }
    return true;
  });
}

export async function listAdminAuditLogs({
  academicStore,
  authStore,
  providerConfigs,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
}) {
  const [platformAuditLogs, providerAuditLogs] = await Promise.all([
    listVisiblePlatformAuditLogs({ academicStore, authStore, actor }),
    providerConfigs.listAuditLogs(),
  ]);

  return [
    ...platformAuditLogs,
    ...providerAuditLogs.map(toProviderAuditLogDto),
  ];
}

export async function buildAdminAuditLogView({
  academicStore,
  authStore,
  providerConfigs,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  actor: AdminActor;
}) {
  return {
    generatedAt: new Date().toISOString(),
    auditLogs: await listAdminAuditLogs({
      academicStore,
      authStore,
      providerConfigs,
      actor,
    }),
  };
}
