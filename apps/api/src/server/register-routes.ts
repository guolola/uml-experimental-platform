// Wires assembled server dependencies into HTTP route modules without owning route behavior.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ProviderSettings, ProviderSettingsInput } from "@uml-platform/contracts";
import { readSessionCookie } from "../auth/session-cookie.js";
import { hasProjectPermission, type AuthStore } from "../auth/in-memory-auth-store.js";
import { registerAccountRoutes } from "../routes/account/register-account-routes.js";
import { registerHealthRoutes } from "../routes/health/register-health-routes.js";
import { registerAdminRoutes } from "../routes/admin/register-admin-routes.js";
import type { AdminRiskEvent } from "../routes/admin/register-admin-routes.js";
import { registerAuthRoutes } from "../routes/auth/register-auth-routes.js";
import { registerBillingRoutes } from "../routes/billing/register-billing-routes.js";
import { registerDocumentRoutes } from "../routes/documents/register-document-routes.js";
import { registerProjectRoutes } from "../routes/projects/register-project-routes.js";
import { registerProviderConfigRoutes } from "../routes/provider-configs/register-provider-config-routes.js";
import { registerRenderRoutes } from "../routes/render/register-render-routes.js";
import { registerSystemNoticeRoutes } from "../routes/system-notices/register-system-notice-routes.js";
import { registerRunRoutes } from "../routes/runs/register-run-routes.js";
import type { RunAccessContext } from "../routes/runs/run-access.js";
import type { DocumentLibrary } from "../documents/library/document-library.js";
import type { MailAdapter } from "../mail/mail-adapter.js";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import type { ProviderUsageTracker } from "../provider-configs/provider-usage-tracker.js";
import type { BillingService } from "../billing/billing-service.js";
import type { RunRecord, RunRecordStore } from "../runs/records/run-record-store.js";
import type { RenderClient } from "../adapters/render/render-client.js";
import type { PngRenderClient } from "../adapters/render/png-render-client.js";
import type { LlmTransport } from "../llm.js";
import type { LlmScheduler } from "../adapters/llm/llm-scheduler.js";
import { runCodeStagePipeline } from "../runs/pipelines/code-pipeline.js";
import { runDesignStagePipeline } from "../runs/pipelines/design-pipeline.js";
import { runDocumentStagePipeline } from "../runs/pipelines/document-pipeline.js";
import { runStagePipeline } from "../runs/pipelines/requirements-pipeline.js";
import {
  handleRunPipelineError,
  startRunRecordPipeline,
} from "../runs/pipelines/run-record-pipeline-starter.js";
import { addCodeDiagnostic } from "../runs/pipelines/code/code-run-diagnostics.js";
import { createProjectWorkspaceSync } from "../routes/runs/project-workspace-sync.js";
import type { GenerationUsageService } from "../generation/generation-usage.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import type { SystemNoticeStore } from "../system-notices/records/system-notice-store.js";
import { DEFAULT_SSE_ALLOW_ORIGIN } from "./defaults.js";
import { resolveRuntimeCwd } from "./runtime.js";

export type { RunAccessContext } from "../routes/runs/run-access.js";

type HealthPayload = Parameters<typeof registerHealthRoutes>[0]["healthPayload"];
type VersionPayload = Parameters<typeof registerHealthRoutes>[0]["versionPayload"];

export type RegisterApiRoutesOptions = {
  app: FastifyInstance;
  healthPayload: HealthPayload;
  versionPayload: VersionPayload;
  authStore: AuthStore;
  mailAdapter: MailAdapter;
  billingService: BillingService;
  generationUsage: GenerationUsageService;
  nodeEnv: string | null;
  academicStore: AcademicAdminRepository;
  runs: RunRecordStore;
  documentLibrary: DocumentLibrary;
  providerConfigs: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker;
  llmScheduler: LlmScheduler;
  llmTransport: LlmTransport;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  systemNoticeStore: SystemNoticeStore;
  testRunAccessContext?: RunAccessContext;
  disableBillingEntitlementGuard?: boolean;
};

function isManagedProviderSettings(
  settings: ProviderSettingsInput | undefined,
): settings is Extract<ProviderSettingsInput, { providerConfigId: string }> {
  return Boolean(settings && "providerConfigId" in settings);
}

function readSnapshotProviderSettings(record: RunRecord) {
  const settings = (record.snapshot as { providerSettings?: unknown }).providerSettings;
  return settings && typeof settings === "object"
    ? (settings as ProviderSettingsInput)
    : undefined;
}

export function registerApiRoutes({
  app,
  healthPayload,
  versionPayload,
  authStore,
  mailAdapter,
  billingService,
  generationUsage,
  nodeEnv,
  academicStore,
  runs,
  documentLibrary,
  providerConfigs,
  providerUsageTracker,
  llmScheduler,
  llmTransport,
  renderClient,
  pngRenderClient,
  systemNoticeStore,
  testRunAccessContext,
  disableBillingEntitlementGuard,
}: RegisterApiRoutesOptions) {
  const riskEvents: AdminRiskEvent[] = [];

  const activeUserIdFromRequest = async (request: FastifyRequest) => {
    const sessionId = readSessionCookie(request);
    const session = sessionId ? await authStore.getActiveSession(sessionId) : null;
    const user = session ? await authStore.getUser(session.userId) : null;
    return user?.status === "active" ? user.id : null;
  };

  const projectMembershipGuard = async ({
    projectId,
    userId,
    permission,
  }: {
    projectId: string;
    userId: string;
    permission: Parameters<typeof hasProjectPermission>[1];
  }) => {
    const member = await authStore.findProjectMember(projectId, userId);
    return Boolean(member && hasProjectPermission(member.role, permission));
  };

  const resolveAdminRunProviderSettings = async (
    source: RunRecord,
  ): Promise<{
    input: ProviderSettingsInput | undefined;
    resolved: ProviderSettings | null;
    providerConfigId: string | null;
  }> => {
    let input = readSnapshotProviderSettings(source);
    if (!input && source.metadata?.projectId) {
      const project = await authStore.getProject(source.metadata.projectId);
      const providerConfigId = project?.defaultProviderConfigId ?? null;
      if (providerConfigId) {
        const config = await providerConfigs.get(providerConfigId);
        if (config) {
          input = { providerConfigId, model: config.defaultModel };
        }
      }
    }
    if (!input) {
      return { input, resolved: null, providerConfigId: null };
    }
    if (!isManagedProviderSettings(input)) {
      return { input, resolved: null, providerConfigId: null };
    }
    const config = await providerConfigs.get(input.providerConfigId);
    if (
      !config ||
      !config.allowlisted ||
      config.status !== "active" ||
      config.breakerState === "open" ||
      !config.allowedModels.includes(input.model)
    ) {
      return { input, resolved: null, providerConfigId: input.providerConfigId };
    }
    const apiKey = await providerConfigs.getSecret(input.providerConfigId);
    if (!apiKey) {
      return { input, resolved: null, providerConfigId: input.providerConfigId };
    }
    return {
      input,
      providerConfigId: input.providerConfigId,
      resolved: {
        apiBaseUrl: config.baseUrl,
        apiKey,
        model: input.model,
      },
    };
  };

  const startAdminRunPipeline = async ({
    record,
    source,
  }: {
    record: RunRecord;
    source: RunRecord;
  }) => {
    const provider = await resolveAdminRunProviderSettings(source);
    if (!provider.resolved) {
      if (!provider.input) return;
      handleRunPipelineError(
        record,
        new Error("Run cannot be started because no usable provider config is available"),
        addCodeDiagnostic,
      );
      return;
    }
    if (provider.input) {
      (record.snapshot as { providerSettings?: ProviderSettingsInput }).providerSettings =
        provider.input;
    }
    startRunRecordPipeline({
      record,
      providerSettings: provider.resolved,
      providerConfigId: provider.providerConfigId,
      llmTransport,
      llmScheduler,
      renderClient,
      pngRenderClient,
      documentLibrary,
      runStagePipeline,
      runDesignStagePipeline,
      runCodeStagePipeline,
      runDocumentStagePipeline,
      addCodeDiagnostic,
    });
  };

  registerHealthRoutes({ app, healthPayload, versionPayload });
  registerAuthRoutes({
    app,
    authStore,
    mailAdapter,
    billingEntitlements: billingService,
  });
  registerBillingRoutes({ app, authStore, billingService });
  registerAccountRoutes({
    app,
    authStore,
    generationUsage,
    avatarStorageDir:
      process.env.UML_AVATAR_STORAGE_DIR ??
      join(resolveRuntimeCwd(), "data", "avatars"),
  });
  registerProjectRoutes({
    app,
    authStore,
    mailAdapter,
    nodeEnv,
    academicStore,
    runs,
  });
  registerProviderConfigRoutes({ app, authStore, providerConfigs });
  registerSystemNoticeRoutes({
    app,
    authStore,
    systemNotices: systemNoticeStore,
  });
  registerAdminRoutes({
    app,
    authStore,
    runs,
    documentLibrary,
    providerConfigs,
    providerUsageTracker,
    llmScheduler,
    startRunPipeline: startAdminRunPipeline,
    riskEvents: () => riskEvents.map((event) => ({ ...event })),
    academicStore,
    billingService,
  });
  registerDocumentRoutes({
    app,
    documentLibrary,
    resolveUserId: activeUserIdFromRequest,
    projectMembershipGuard,
    recordAuditLog: (event) =>
      authStore.recordAuditLog({
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        outcome: event.outcome,
        message: event.message,
      }),
    recordRiskEvent: (event) => {
      riskEvents.unshift({
        id: randomUUID(),
        eventType: event.eventType,
        severity: event.severity,
        actorUserId: event.actorUserId,
        projectId: event.projectId,
        targetType: event.targetType,
        targetId: event.targetId,
        message: event.message,
        metadata: event.metadata ?? {},
        createdAt: new Date().toISOString(),
      });
    },
  });
  registerRunRoutes({
    app,
    runs,
    documentLibrary,
    llmTransport,
    llmScheduler,
    renderClient,
    pngRenderClient,
    defaultSseAllowOrigin: DEFAULT_SSE_ALLOW_ORIGIN,
    runStagePipeline,
    runDesignStagePipeline,
    runCodeStagePipeline,
    runDocumentStagePipeline,
    addCodeDiagnostic,
    providerConfigs,
    resolveProjectDefaultProviderConfig: async (projectId: string) => {
      const project = await authStore.getProject(projectId);
      return project?.defaultProviderConfigId ?? null;
    },
    resolveProjectName: async (projectId: string) => {
      const project = await authStore.getProject(projectId);
      return project?.name ?? null;
    },
    providerUsageTracker,
    generationUsage,
    billingEntitlements: disableBillingEntitlementGuard
      ? undefined
      : billingService,
    loadProjectWorkspace: async (projectId) => authStore.getProjectWorkspace(projectId),
    syncProjectWorkspace: createProjectWorkspaceSync(authStore),
    runAccessGuard: {
      async resolveRunAccess(request) {
        const projectIdHeader = request.headers["x-uml-project-id"];
        const sessionId = readSessionCookie(request);
        const session = sessionId ? await authStore.getActiveSession(sessionId) : null;
        const user = session ? await authStore.getUser(session.userId) : null;
        const userId = user?.status === "active" ? user.id : null;
        return {
          userId: userId ?? testRunAccessContext?.userId,
          email: user?.status === "active" ? user.email : testRunAccessContext?.email,
          projectId:
            typeof projectIdHeader === "string" && projectIdHeader.trim()
              ? projectIdHeader.trim()
              : testRunAccessContext?.projectId,
        };
      },
      async canAccessProject({ userId, projectId, permission }) {
        if (
          testRunAccessContext?.userId === userId &&
          testRunAccessContext.projectId === projectId
        ) {
          return true;
        }
        return projectMembershipGuard({ userId, projectId, permission });
      },
    },
  });
  registerRenderRoutes({
    app,
    renderClient,
    pngRenderClient,
    resolveUserId: activeUserIdFromRequest,
    projectMembershipGuard,
  });
}
