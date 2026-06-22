// Registers admin endpoints and delegates provider key handling to secure storage.
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminOrganizationCreateRequestSchema,
  adminOrganizationListResponseSchema,
  adminCourseCreateRequestSchema,
  adminCourseListResponseSchema,
  adminClassCreateRequestSchema,
  adminClassListResponseSchema,
  adminTeamCreateRequestSchema,
  adminTeamListResponseSchema,
  adminOrganizationMembershipCreateRequestSchema,
  adminOrganizationMembershipListResponseSchema,
  adminQuotaCreateRequestSchema,
  adminQuotaListResponseSchema,
  adminProviderQuotaListResponseSchema,
  adminProviderUsageListResponseSchema,
  adminRateLimitPolicyCreateRequestSchema,
  adminRateLimitPolicyListResponseSchema,
  adminRateLimitPolicyUpdateRequestSchema,
  providerModelDiscoveryRequestSchema,
  providerModelDiscoveryResponseSchema,
  providerModelDiscoveryProgressEventSchema,
  providerModelCapabilityMapSchema,
  type ProviderModelDiscoveryProgressEvent,
} from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { BillingService } from "../../billing/billing-service.js";
import type { RunRecordStore } from "../../runs/records/run-record-store.js";
import { buildOrganizationUnits } from "../../admin/admin-route-presenters.js";
import { requireHighRiskAdmin } from "../../admin/admin-route-security.js";
import {
  buildAdminDocumentListView,
  downloadAdminDocument,
  resolveAdminDocumentProjectScope,
  restoreAdminDocument,
} from "../../admin/admin-document-actions.js";
import {
  buildAdminClassListView,
  buildAdminCourseListView,
  buildAdminMembershipListView,
  buildAdminOrganizationListView,
  buildAdminQuotaListView,
  buildAdminTeamListView,
  createAdminClass,
  createAdminCourse,
  createAdminMembership,
  createAdminOrganization,
  createAdminQuota,
  createAdminTeam,
  denyScopedAdminOrganizationCreate,
  getVisibleAdminClass,
  getVisibleAdminCourse,
  getVisibleAdminMembership,
  getVisibleAdminOrganization,
  getVisibleAdminQuota,
  getVisibleAdminTeam,
} from "../../admin/admin-academic-actions.js";
import {
  createAdminProviderConfig,
  resetAdminProviderConfigBreaker,
  revokeAdminProviderConfig,
  rotateAdminProviderConfigKey,
  updateAdminProviderConfig,
  updateAdminProviderConfigStatus,
} from "../../admin/admin-provider-config-actions.js";
import {
  disableAdminUser,
  forceLogoutAdminUser,
  freezeAdminProject,
  resetAdminUserMfa,
} from "../../admin/admin-user-project-actions.js";
import {
  mutateAdminPromptRuntime,
  reviewAdminRoleHighRiskPermissions,
  type AdminPromptRuntimeAction,
  type AdminPromptRuntimeStatus,
} from "../../admin/admin-governance-actions.js";
import {
  createAdminRateLimitPolicy,
  updateAdminRateLimitPolicy,
} from "../../admin/admin-rate-limit-actions.js";
import {
  buildAdminProviderConfigListView,
  buildAdminProviderQuotaView,
  buildAdminProviderUsageView,
  buildAdminRateLimitPolicyListView,
} from "../../admin/admin-provider-telemetry.js";
import { buildAdminAuditLogView } from "../../admin/admin-audit-log-view.js";
import { buildAdminMetricsView } from "../../admin/admin-metrics-view.js";
import {
  buildAdminRunListView,
  getAdminRunDetail,
} from "../../admin/admin-run-read-model.js";
import {
  cancelAdminRun,
  createAdminRunAction,
  type AdminRunPipelineStarter,
} from "../../admin/admin-run-actions.js";
import {
  buildAdminRiskEventsView,
  type AdminRiskEvent,
} from "../../admin/admin-risk-events-view.js";
import {
  getAdminSessionView,
  requireScopedAdminActor,
} from "../../admin/admin-session-view.js";
import {
  buildAdminProjectListView,
  buildAdminUserListView,
  getAdminUserLoginRecordView,
} from "../../admin/admin-user-project-read-model.js";
import {
  buildPromptRuntimeListView,
  buildRolePermissionsView,
  buildSystemConfigView,
  buildSystemHealthView,
  buildSystemLogsView,
  buildSystemReleasesView,
  createPromptRuntimeItems,
  findRolePermission,
  getPromptRuntimeVersionsView,
} from "./admin-console-model.js";
import {
  hasAcademicRead,
  hasAcademicWrite,
} from "../../admin/academic-scope.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { requireAdminPermission } from "../../security/admin-guard.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import {
  createInMemoryAcademicAdminRepository,
  type AcademicAdminRepository,
} from "../../db/academic-admin-repository.js";
import { createPostgresAcademicAdminRepository } from "../../db/postgres-academic-admin-repository.js";
import {
  createPostgresPoolFromEnv,
  getDatabaseUrl,
} from "../../db/postgres.js";
import {
  resolveProviderRateLimitPolicy,
  type ProviderRateLimitPolicy,
  type ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { createRateLimitPolicyStoreWithFallback } from "../../provider-configs/fallback-rate-limit-policy-store.js";
import { testAdminProviderConfigConnection } from "../../provider-configs/admin-provider-config-test.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import { ProviderHttpError } from "../../llm.js";
import { discoverOpenAiCompatibleModelCapabilities } from "../../provider-configs/provider-model-discovery.js";
import {
  normalizeManagedProviderBaseUrl,
  ProviderConfigPolicyError,
} from "../../provider-configs/provider-url-policy.js";
import {
  DEFAULT_LOCAL_CORS_ORIGINS,
  readCorsOrigins,
} from "../../server/cors.js";

export type { AdminRiskEvent };

function createAcademicAdminRepository(app: FastifyInstance): AcademicAdminRepository {
  if (!getDatabaseUrl()) {
    return createInMemoryAcademicAdminRepository();
  }

  const pool = createPostgresPoolFromEnv();
  app.addHook("onClose", async () => {
    await pool.end();
  });
  return createPostgresAcademicAdminRepository(pool);
}

const createProviderConfigRequestSchema = z.object({
  name: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  defaultModel: z.string().trim().min(1),
  allowedModels: z.array(z.string().trim().min(1)).optional(),
  modelCapabilities: providerModelCapabilityMapSchema.optional(),
  keyPurpose: z.string().trim().min(1).optional(),
  quota: z.string().trim().min(1).optional(),
  scopeType: z.enum(["system", "user", "project"]).default("system"),
  scopeId: z.string().trim().min(1).nullable().optional(),
});

const updateProviderConfigRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  defaultModel: z.string().trim().min(1).optional(),
  allowedModels: z.array(z.string().trim().min(1)).optional(),
  modelCapabilities: providerModelCapabilityMapSchema.optional(),
  keyPurpose: z.string().trim().min(1).optional(),
  quota: z.string().trim().min(1).optional(),
  scopeType: z.enum(["system", "user", "project"]).optional(),
  scopeId: z.string().trim().min(1).nullable().optional(),
}).strict();

const rotateProviderKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1),
});

const providerTestRequestSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
  })
  .strict()
  .default({});

function sendAdminOnly(
  app: FastifyInstance,
  path: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => unknown,
) {
  app.get(path, handler);
}

export function registerAdminRoutes({
  app,
  authStore,
  runs,
  documentLibrary,
  providerConfigs,
  providerUsageTracker,
  llmScheduler,
  startRunPipeline,
  riskEvents = () => [],
  providerRateLimitPolicy = resolveProviderRateLimitPolicy(),
  academicStore: providedAcademicStore,
  billingService,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  runs: RunRecordStore;
  documentLibrary: DocumentLibrary;
  providerConfigs: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker;
  llmScheduler?: LlmScheduler;
  startRunPipeline?: AdminRunPipelineStarter;
  riskEvents?: () => AdminRiskEvent[];
  providerRateLimitPolicy?: ProviderRateLimitPolicy;
  academicStore?: AcademicAdminRepository;
  billingService?: Pick<BillingService, "getSummary">;
}) {
  const rateLimitPolicyStore =
    createRateLimitPolicyStoreWithFallback(providerUsageTracker);
  const academicStore = providedAcademicStore ?? createAcademicAdminRepository(app);
  const promptRuntimeItems = createPromptRuntimeItems();

  async function requireAcademicRead(request: FastifyRequest, reply: FastifyReply) {
    const actor = await requireScopedAdminActor(request, reply, authStore);
    if ("message" in actor) return actor;
    if (!hasAcademicRead(actor)) {
      reply.code(403);
      return { message: "Admin project read capability required" } as const;
    }
    return actor;
  }

  async function requireAcademicWrite(request: FastifyRequest, reply: FastifyReply) {
    const actor = await requireScopedAdminActor(request, reply, authStore);
    if ("message" in actor) return actor;
    if (!hasAcademicWrite(actor)) {
      reply.code(403);
      return { message: "Admin project write capability required" } as const;
    }
    return actor;
  }

  sendAdminOnly(app, "/api/admin/session", async (request, reply) => {
    return getAdminSessionView(request, reply, authStore);
  });

  sendAdminOnly(app, "/api/admin/metrics", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.metrics.read",
    );
    if ("message" in actor) return actor;

    const query = request.query as { date?: unknown };
    const metrics = await buildAdminMetricsView({
      authStore,
      documentLibrary,
      providerUsageTracker,
      queryDate: query.date,
      runs,
    });
    if (!metrics.ok) {
      reply.code(400);
      return { message: metrics.message };
    }
    return metrics.view;
  });

  sendAdminOnly(app, "/api/admin/users", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;
    return buildAdminUserListView({
      academicStore,
      authStore,
      billingService,
      actor,
    });
  });

  sendAdminOnly(app, "/api/admin/users/:id/login-records", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;

    const { id } = request.params as { id: string };
    const result = await getAdminUserLoginRecordView({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/projects", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.projects.read",
    );
    if ("message" in actor) return actor;
    return buildAdminProjectListView({
      academicStore,
      authStore,
      actor,
    });
  });

  sendAdminOnly(app, "/api/admin/organizations", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminOrganizationListResponseSchema.parse(
      await buildAdminOrganizationListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/organizations/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminOrganization({
      academicStore,
      actor,
      organizationId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/organizations", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const denied = denyScopedAdminOrganizationCreate(actor);
    if (denied) {
      reply.code(denied.statusCode);
      return denied.body;
    }
    const input = adminOrganizationCreateRequestSchema.parse(request.body);
    const result = await createAdminOrganization({ academicStore, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/courses", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminCourseListResponseSchema.parse(
      await buildAdminCourseListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/courses/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminCourse({
      academicStore,
      actor,
      courseId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/courses", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminCourseCreateRequestSchema.parse(request.body);
    const result = await createAdminCourse({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/classes", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminClassListResponseSchema.parse(
      await buildAdminClassListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/classes/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminClass({
      academicStore,
      actor,
      classId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/classes", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminClassCreateRequestSchema.parse(request.body);
    const result = await createAdminClass({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/teams", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminTeamListResponseSchema.parse(
      await buildAdminTeamListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/teams/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminTeam({
      academicStore,
      actor,
      teamId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/teams", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminTeamCreateRequestSchema.parse(request.body);
    const result = await createAdminTeam({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/organization-members", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminOrganizationMembershipListResponseSchema.parse(
      await buildAdminMembershipListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/organization-members/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminMembership({
      academicStore,
      actor,
      membershipId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/organization-members", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminOrganizationMembershipCreateRequestSchema.parse(request.body);
    const result = await createAdminMembership({
      academicStore,
      authStore,
      actor,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/quotas", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminQuotaListResponseSchema.parse(
      await buildAdminQuotaListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/quotas/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminQuota({
      academicStore,
      actor,
      quotaId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/quotas", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminQuotaCreateRequestSchema.parse(request.body);
    const result = await createAdminQuota({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/roles", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;
    return buildRolePermissionsView();
  });

  app.post("/api/admin/roles/:id/high-risk-permissions/review", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.role_permissions.review";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "admin_role",
      id,
      "admin.roles.write",
    );
    if ("message" in actor) return actor;

    const result = await reviewAdminRoleHighRiskPermissions({
      authStore,
      actor,
      roleId: id,
      findRole: findRolePermission,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/prompt-runtime", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildPromptRuntimeListView(promptRuntimeItems);
  });

  app.get("/api/admin/prompt-runtime/:id/versions", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = getPromptRuntimeVersionsView(promptRuntimeItems, id);
    reply.code(result.statusCode);
    return result.body;
  });

  async function mutatePromptRuntime(
    request: FastifyRequest,
    reply: FastifyReply,
    nextStatus: AdminPromptRuntimeStatus,
    action: AdminPromptRuntimeAction,
  ) {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      `admin.prompt_runtime.${action}`,
      "prompt_runtime",
      id,
      "admin.prompt_runtime.write",
    );
    if ("message" in actor) return actor;
    const result = await mutateAdminPromptRuntime({
      authStore,
      actor,
      promptRuntimeItems,
      promptRuntimeItemId: id,
      nextStatus,
      action,
    });
    reply.code(result.statusCode);
    return result.body;
  }

  app.post("/api/admin/prompt-runtime/:id/submit", (request, reply) =>
    mutatePromptRuntime(request, reply, "canary", "submit"),
  );
  app.post("/api/admin/prompt-runtime/:id/approve", (request, reply) =>
    mutatePromptRuntime(request, reply, "stable", "approve"),
  );
  app.post("/api/admin/prompt-runtime/:id/rollback", (request, reply) =>
    mutatePromptRuntime(request, reply, "rollback-ready", "rollback"),
  );
  app.post("/api/admin/prompt-runtime/:id/disable", (request, reply) =>
    mutatePromptRuntime(request, reply, "disabled", "disable"),
  );

  sendAdminOnly(app, "/api/admin/documents", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.documents.read",
    );
    if ("message" in actor) return actor;
    const visibleProjectIds = await resolveAdminDocumentProjectScope({
      academicStore,
      authStore,
      actor,
    });
    return buildAdminDocumentListView({
      documentLibrary,
      visibleProjectIds,
    });
  });

  app.get("/api/admin/documents/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.documents.read",
    );
    if ("message" in actor) return actor;

    const visibleProjectIds = await resolveAdminDocumentProjectScope({
      academicStore,
      authStore,
      actor,
    });
    const result = await downloadAdminDocument({
      authStore,
      documentLibrary,
      actor,
      documentId: id,
      visibleProjectIds,
    });
    reply.code(result.statusCode);
    if ("buffer" in result) {
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", result.contentDisposition);
      return result.buffer;
    }
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/risk-events", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.risk_events.read",
    );
    if ("message" in actor) return actor;
    return buildAdminRiskEventsView(riskEvents);
  });

  sendAdminOnly(app, "/api/admin/rate-limits", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.rate_limits.read",
    );
    if ("message" in actor) return actor;
    return adminRateLimitPolicyListResponseSchema.parse(
      await buildAdminRateLimitPolicyListView({
        rateLimitPolicyStore,
        providerRateLimitPolicy,
      }),
    );
  });

  sendAdminOnly(app, "/api/admin/provider-usage", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    return adminProviderUsageListResponseSchema.parse(
      await buildAdminProviderUsageView({ providerUsageTracker }),
    );
  });

  sendAdminOnly(app, "/api/admin/provider-quotas", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    return adminProviderQuotaListResponseSchema.parse(
      await buildAdminProviderQuotaView({
        providerUsageTracker,
        providerConfigs,
        rateLimitPolicyStore,
      }),
    );
  });

  app.post("/api/admin/rate-limits", async (request, reply) => {
    const action = "admin.rate_limit.create";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "rate_limit_policy",
      null,
      "admin.rate_limits.write",
    );
    if ("message" in actor) return actor;
    const input = adminRateLimitPolicyCreateRequestSchema.parse(request.body);
    const result = await createAdminRateLimitPolicy({
      authStore,
      rateLimitPolicyStore,
      actor,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.patch("/api/admin/rate-limits/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.rate_limit.update";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "rate_limit_policy",
      id,
      "admin.rate_limits.write",
    );
    if ("message" in actor) return actor;
    const input = adminRateLimitPolicyUpdateRequestSchema.parse(request.body);
    const result = await updateAdminRateLimitPolicy({
      authStore,
      rateLimitPolicyStore,
      actor,
      rateLimitPolicyId: id,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/runs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.read",
    );
    if ("message" in actor) return actor;

    return buildAdminRunListView({
      academicStore,
      authStore,
      actor,
      runs,
    });
  });

  app.get("/api/admin/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.read",
    );
    if ("message" in actor) return actor;

    const result = await getAdminRunDetail({
      academicStore,
      authStore,
      actor,
      runs,
      runId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/runs/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.write",
    );
    if ("message" in actor) return actor;
    const result = await cancelAdminRun({
      academicStore,
      authStore,
      actor,
      runs,
      runId: id,
      llmScheduler,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  async function createAdminRunActionResponse(
    request: FastifyRequest,
    reply: FastifyReply,
    actionKind: "retry" | "rerun",
  ) {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.write",
    );
    if ("message" in actor) return actor;
    const result = await createAdminRunAction({
      academicStore,
      authStore,
      actor,
      runs,
      runId: id,
      actionKind,
      request,
      startRunPipeline,
    });
    reply.code(result.statusCode);
    return result.body;
  }

  app.post("/api/admin/runs/:id/retry", (request, reply) =>
    createAdminRunActionResponse(request, reply, "retry"),
  );

  app.post("/api/admin/runs/:id/rerun", (request, reply) =>
    createAdminRunActionResponse(request, reply, "rerun"),
  );

  app.post("/api/admin/users/:id/disable", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.disable";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const result = await disableAdminUser({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/users/:id/force-logout", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.force_logout";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const result = await forceLogoutAdminUser({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/users/:id/reset-mfa", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.reset_mfa";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const result = await resetAdminUserMfa({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/projects/:id/freeze", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.project.freeze";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "project",
      id,
      "admin.projects.write",
    );
    if ("message" in actor) return actor;

    const result = await freezeAdminProject({
      academicStore,
      authStore,
      actor,
      projectId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/documents/:id/restore", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.document.restore";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "document",
      id,
      "admin.documents.write",
    );
    if ("message" in actor) return actor;

    const result = await restoreAdminDocument({
      authStore,
      documentLibrary,
      actor,
      documentId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  function createProviderModelDiscoveryStream(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const allowedOrigins = new Set(
      readCorsOrigins("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    );
    const origin = request.headers.origin;
    const abortController = new AbortController();
    let closed = false;
    let completed = false;

    reply.hijack();
    const response = reply.raw;
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Credentials", "true");
    }
    response.flushHeaders?.();

    const heartbeat = setInterval(() => {
      if (closed || response.writableEnded || response.destroyed) return;
      response.write(": heartbeat\n\n");
    }, 15_000);

    request.raw.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      if (!completed) abortController.abort();
    });

    return {
      abortSignal: abortController.signal,
      close() {
        completed = true;
        closed = true;
        clearInterval(heartbeat);
        if (!response.writableEnded && !response.destroyed) {
          response.end();
        }
      },
      send(event: ProviderModelDiscoveryProgressEvent) {
        if (closed || response.writableEnded || response.destroyed) return;
        const parsed = providerModelDiscoveryProgressEventSchema.parse(event);
        response.write(`event: ${parsed.type}\n`);
        response.write(`data: ${JSON.stringify(parsed)}\n\n`);
      },
    };
  }

  function isAbortError(error: unknown) {
    return error instanceof Error && error.name === "AbortError";
  }

  async function runProviderModelDiscoveryStream({
    apiBaseUrl,
    apiKey,
    onFailure,
    onSuccess,
    reply,
    request,
  }: {
    apiBaseUrl: string;
    apiKey: string;
    onFailure?: () => Promise<void>;
    onSuccess?: () => Promise<void>;
    reply: FastifyReply;
    request: FastifyRequest;
  }) {
    const stream = createProviderModelDiscoveryStream(request, reply);
    stream.send({ type: "started", sourceBaseUrl: apiBaseUrl });
    try {
      const discovery = await discoverOpenAiCompatibleModelCapabilities({
        apiBaseUrl,
        apiKey,
        abortSignal: stream.abortSignal,
        onProgress: stream.send,
      });
      const result = providerModelDiscoveryResponseSchema.parse({
        ...discovery,
        fetchedAt: new Date().toISOString(),
        sourceBaseUrl: apiBaseUrl,
      });
      await onSuccess?.();
      stream.send({ type: "completed", result });
    } catch (error) {
      if (!isAbortError(error)) {
        await onFailure?.();
        const providerStatus =
          error instanceof ProviderHttpError ? error.status : undefined;
        stream.send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Provider model discovery failed",
          status: providerStatus ?? 502,
        });
      }
    } finally {
      stream.close();
    }
  }

  sendAdminOnly(app, "/api/admin/provider-configs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    return buildAdminProviderConfigListView({ providerConfigs });
  });

  app.post("/api/admin/provider-configs/discover-models", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const input = providerModelDiscoveryRequestSchema.parse(request.body);
    let sourceBaseUrl: string;
    try {
      sourceBaseUrl = normalizeManagedProviderBaseUrl(input.baseUrl);
    } catch (error) {
      if (error instanceof ProviderConfigPolicyError) {
        reply.code(400);
        return { message: error.message };
      }
      throw error;
    }

    try {
      const discovery = await discoverOpenAiCompatibleModelCapabilities({
        apiBaseUrl: sourceBaseUrl,
        apiKey: input.apiKey,
      });
      return providerModelDiscoveryResponseSchema.parse({
        ...discovery,
        fetchedAt: new Date().toISOString(),
        sourceBaseUrl,
      });
    } catch (error) {
      const providerStatus =
        error instanceof ProviderHttpError ? error.status : null;
      reply.code(providerStatus ?? 502);
      return {
        message:
          error instanceof Error
            ? error.message
            : "Provider model discovery failed",
      };
    }
  });

  app.post("/api/admin/provider-configs/discover-models/stream", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const input = providerModelDiscoveryRequestSchema.parse(request.body);
    let sourceBaseUrl: string;
    try {
      sourceBaseUrl = normalizeManagedProviderBaseUrl(input.baseUrl);
    } catch (error) {
      if (error instanceof ProviderConfigPolicyError) {
        reply.code(400);
        return { message: error.message };
      }
      throw error;
    }

    return runProviderModelDiscoveryStream({
      apiBaseUrl: sourceBaseUrl,
      apiKey: input.apiKey,
      reply,
      request,
    });
  });

  app.post("/api/admin/provider-configs", async (request, reply) => {
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.create",
      "provider_config",
      null,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = createProviderConfigRequestSchema.parse(request.body);
    const result = await createAdminProviderConfig({
      authStore,
      providerConfigs,
      actor,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.patch("/api/admin/provider-configs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.update",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = updateProviderConfigRequestSchema.parse(request.body);
    const result = await updateAdminProviderConfig({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/provider-configs/:id/rotate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.rotate",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = rotateProviderKeyRequestSchema.parse(request.body);
    const result = await rotateAdminProviderConfigKey({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
      apiKey: input.apiKey,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/provider-configs/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.revoke",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const result = await revokeAdminProviderConfig({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  async function updateProviderConfigStatus(
    request: FastifyRequest,
    reply: FastifyReply,
    nextStatus: "active" | "disabled",
    action: "enable" | "disable",
  ) {
    const { id } = request.params as { id: string };
    const adminAction = `admin.provider_config.${action}`;
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      adminAction,
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const result = await updateAdminProviderConfigStatus({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
      nextStatus,
      action,
    });
    reply.code(result.statusCode);
    return result.body;
  }

  app.post("/api/admin/provider-configs/:id/disable", (request, reply) =>
    updateProviderConfigStatus(request, reply, "disabled", "disable"),
  );

  app.post("/api/admin/provider-configs/:id/enable", (request, reply) =>
    updateProviderConfigStatus(request, reply, "active", "enable"),
  );

  app.post("/api/admin/provider-configs/:id/reset-breaker", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.reset_breaker",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const result = await resetAdminProviderConfigBreaker({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.get("/api/admin/provider-configs/:id/models", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const { id } = request.params as { id: string };
    const providerConfig = await providerConfigs.get(id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    if (!providerConfig.allowlisted) {
      reply.code(400);
      return { message: "Provider Base URL is not allowlisted" };
    }
    if (providerConfig.status !== "active") {
      reply.code(400);
      return { message: "Provider config is revoked, disabled, or inactive" };
    }
    if (providerConfig.breakerState === "open") {
      reply.code(503);
      return { message: "Provider circuit breaker is open" };
    }

    const apiKey = await providerConfigs.getSecret(id);
    if (!apiKey) {
      reply.code(400);
      return { message: "Provider config secret is revoked" };
    }

    try {
      const discovery = await discoverOpenAiCompatibleModelCapabilities({
        apiBaseUrl: providerConfig.baseUrl,
        apiKey,
      });
      await providerConfigs.markUsed(id);
      await providerConfigs.resetBreaker?.(id);
      return providerModelDiscoveryResponseSchema.parse({
        ...discovery,
        fetchedAt: new Date().toISOString(),
        sourceBaseUrl: providerConfig.baseUrl,
      });
    } catch (error) {
      const breaker = await providerConfigs.recordFailure?.(id);
      const providerStatus =
        error instanceof ProviderHttpError ? error.status : null;
      reply.code(providerStatus ?? 502);
      return {
        message:
          error instanceof Error
            ? error.message
            : "Provider model discovery failed",
        breaker: breaker
          ? {
              state: breaker.breakerState,
              failureCount: breaker.breakerFailureCount,
              openedAt: breaker.breakerOpenedAt,
              lastFailureAt: breaker.breakerLastFailureAt,
            }
          : undefined,
      };
    }
  });

  app.get("/api/admin/provider-configs/:id/models/stream", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const { id } = request.params as { id: string };
    const providerConfig = await providerConfigs.get(id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    if (!providerConfig.allowlisted) {
      reply.code(400);
      return { message: "Provider Base URL is not allowlisted" };
    }
    if (providerConfig.status !== "active") {
      reply.code(400);
      return { message: "Provider config is revoked, disabled, or inactive" };
    }
    if (providerConfig.breakerState === "open") {
      reply.code(503);
      return { message: "Provider circuit breaker is open" };
    }

    const apiKey = await providerConfigs.getSecret(id);
    if (!apiKey) {
      reply.code(400);
      return { message: "Provider config secret is revoked" };
    }

    return runProviderModelDiscoveryStream({
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      onFailure: async () => {
        await providerConfigs.recordFailure?.(id);
      },
      onSuccess: async () => {
        await providerConfigs.markUsed(id);
        await providerConfigs.resetBreaker?.(id);
      },
      reply,
      request,
    });
  });

  app.post("/api/admin/provider-configs/:id/test", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const input = providerTestRequestSchema.parse(request.body ?? {});
    const result = await testAdminProviderConfigConnection({
      providerConfigs,
      providerUsageTracker,
      rateLimitPolicies: await rateLimitPolicyStore.listRateLimitPolicies(),
      providerRateLimitPolicy,
      providerConfigId: id,
      actor,
      ipAddress: request.ip,
      model: input.model,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/audit-logs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.audit_logs.read",
    );
    if ("message" in actor) return actor;
    return buildAdminAuditLogView({
      academicStore,
      authStore,
      providerConfigs,
      actor,
    });
  });

  sendAdminOnly(app, "/api/admin/system/health", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemHealthView();
  });

  sendAdminOnly(app, "/api/admin/system/config", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemConfigView();
  });

  sendAdminOnly(app, "/api/admin/system/logs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemLogsView();
  });

  sendAdminOnly(app, "/api/admin/system/releases", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemReleasesView();
  });
}
