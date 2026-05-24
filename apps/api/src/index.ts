import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ZodError } from "zod";
import { designDiagramKindSchema } from "@uml-platform/contracts";
import {
  createRealLlmTransport,
  type ImageGenerationClient,
  type LlmTransport,
} from "./llm.js";
import {
  createInMemoryLlmScheduler,
  createLlmSchedulerLimitsFromEnv,
  type LlmScheduler,
} from "./adapters/llm/llm-scheduler.js";
import { getCodeSkillRuntimeStatus } from "./code-skills.js";
import {
  createCorsOriginChecker,
  DEFAULT_LOCAL_CORS_ORIGINS,
} from "./server/cors.js";
import { isMainModule, resolveRuntimeCwd } from "./server/runtime.js";
import {
  createInMemoryAuthStore,
  hasProjectPermission,
  type AuthStore,
} from "./auth/in-memory-auth-store.js";
import { createPostgresAuthRepository } from "./auth/postgres-auth-repository.js";
import { readSessionCookie } from "./auth/session-cookie.js";
import { createPostgresPoolFromEnv, getDatabaseUrl } from "./db/postgres.js";
import { runMigrations } from "./db/migrations.js";
import { createInMemoryAcademicAdminRepository } from "./db/academic-admin-repository.js";
import { createPostgresAcademicAdminRepository } from "./db/postgres-academic-admin-repository.js";
import { registerAccountRoutes } from "./routes/account/register-account-routes.js";
import { registerHealthRoutes } from "./routes/health/register-health-routes.js";
import { registerAdminRoutes } from "./routes/admin/register-admin-routes.js";
import type { AdminRiskEvent } from "./routes/admin/register-admin-routes.js";
import { registerAuthRoutes } from "./routes/auth/register-auth-routes.js";
import { registerDocumentRoutes } from "./routes/documents/register-document-routes.js";
import { registerProjectRoutes } from "./routes/projects/register-project-routes.js";
import { registerProviderConfigRoutes } from "./routes/provider-configs/register-provider-config-routes.js";
import { registerRenderRoutes } from "./routes/render/register-render-routes.js";
import {
  registerRunRoutes,
  type RunAccessContext,
} from "./routes/runs/register-run-routes.js";
import { createFileDocumentLibrary } from "./documents/library/document-library.js";
import type { DocumentLibrary } from "./documents/library/document-library.js";
import { createPostgresDocumentLibrary } from "./documents/library/postgres-document-library.js";
import {
  createMailAdapterFromEnv,
  type MailAdapter,
} from "./mail/mail-adapter.js";
import {
  createProviderConfigStore,
  type ProviderConfigStore,
} from "./provider-configs/provider-config-store.js";
import { createPostgresProviderConfigRepository } from "./provider-configs/postgres-provider-config-repository.js";
import { createProviderUsageTracker } from "./provider-configs/provider-usage-tracker.js";
import { createPostgresRunRecordStore } from "./runs/records/postgres-run-record-store.js";
import { createRunRecordStore, type RunRecordStore } from "./runs/records/run-record-store.js";
import {
  createRenderClient,
  type AnyPlantUmlArtifact,
  type RenderClient,
} from "./adapters/render/render-client.js";
import {
  createPngRenderClient,
  type PngRenderClient,
} from "./adapters/render/png-render-client.js";
import { runCodeStagePipeline } from "./runs/pipelines/code-pipeline.js";
import { runDesignStagePipeline } from "./runs/pipelines/design-pipeline.js";
import { runDocumentStagePipeline } from "./runs/pipelines/document-pipeline.js";
import { runStagePipeline } from "./runs/pipelines/requirements-pipeline.js";
import { addCodeDiagnostic } from "./runs/pipelines/code/code-run-diagnostics.js";
import { hashPassword } from "./security/password-hashing.js";
import type { AdminRole } from "@uml-platform/contracts";

const DEFAULT_PORT = Number(process.env.API_PORT ?? 4001);
const DEFAULT_HOST = process.env.API_HOST ?? "127.0.0.1";
const DEFAULT_RENDER_SERVICE_BASE_URL =
  process.env.RENDER_SERVICE_BASE_URL ?? "http://127.0.0.1:4002";
const DEFAULT_DOCUMENT_STORAGE_DIR =
  process.env.UML_DOCUMENT_STORAGE_DIR ??
  join(resolveRuntimeCwd(), "data", "documents");

const RELEASE_STARTED_AT =
  process.env.UML_RELEASE_STARTED_AT ?? new Date().toISOString();
const DEFAULT_SSE_ALLOW_ORIGIN = "http://localhost:5173";
const DEFAULT_PROVIDER_BASE_URL_ALLOWLIST = (
  process.env.UML_PROVIDER_BASE_URL_ALLOWLIST ??
  "https://ai.comfly.org,https://api.openai.com"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const DEFAULT_ALLOW_LEGACY_PLAINTEXT_PROVIDER_TEST =
  process.env.UML_ALLOW_LEGACY_PROVIDER_TEST === "true";
const DEFAULT_DEV_ADMIN_MFA_SECRET = "JBSWY3DPEHPK3PXP";









export async function createApiServer(options?: {
  llmTransport?: LlmTransport;
  imageClient?: ImageGenerationClient;
  renderClient?: RenderClient;
  pngRenderClient?: PngRenderClient;
  renderServiceBaseUrl?: string;
  adminProviderBaseUrlAllowlist?: string[];
  providerConfigStore?: ProviderConfigStore;
  authStore?: AuthStore;
  runRecordStore?: RunRecordStore;
  documentLibrary?: DocumentLibrary;
  mailAdapter?: MailAdapter;
  llmScheduler?: LlmScheduler;
  allowLegacyPlaintextProviderTest?: boolean;
  testRunAccessContext?: RunAccessContext;
  nodeEnv?: string | null;
}) {
  const runtimeNodeEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? null;
  // Test-only fallback used by API integration tests that construct run records
  // without a browser session. Production never accepts this synthetic context.
  const testRunAccessContext =
    runtimeNodeEnv === "production" ? undefined : options?.testRunAccessContext;
  const databaseUrl = getDatabaseUrl();
  const hasInjectedPersistence =
    Boolean(options?.authStore) &&
    Boolean(options?.providerConfigStore) &&
    Boolean(options?.runRecordStore) &&
    Boolean(options?.documentLibrary);
  if (runtimeNodeEnv === "production" && !databaseUrl && !hasInjectedPersistence) {
    throw new Error(
      "DATABASE_URL is required in production unless all persistence stores are explicitly injected",
    );
  }

  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(cors, {
    origin: createCorsOriginChecker("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  await app.register(multipart);
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError) {
      reply.code(400).send({
        message: error.issues
          .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "request";
            return `${path}: ${issue.message}`;
          })
          .join("; "),
      });
      return;
    }
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : null;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send({
        message: error instanceof Error ? error.message : "Bad request",
      });
      return;
    }

    reply.code(500).send({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  });

  const llmTransport =
    options?.llmTransport ??
    createRealLlmTransport({
      baseUrlAllowlist: DEFAULT_PROVIDER_BASE_URL_ALLOWLIST,
    });
  const llmScheduler =
    options?.llmScheduler ??
    createInMemoryLlmScheduler(createLlmSchedulerLimitsFromEnv());
  const renderServiceBaseUrl =
    options?.renderServiceBaseUrl ?? DEFAULT_RENDER_SERVICE_BASE_URL;
  const renderClient: RenderClient =
    options?.renderClient ??
    ((artifact: AnyPlantUmlArtifact) =>
      createRenderClient(renderServiceBaseUrl, artifact));
  const pngRenderClient: PngRenderClient =
    options?.pngRenderClient ??
    ((artifact: AnyPlantUmlArtifact) =>
      createPngRenderClient(renderServiceBaseUrl, artifact));
  const pool =
    (!options?.authStore ||
      !options?.providerConfigStore ||
      !options?.runRecordStore ||
      !options?.documentLibrary) &&
    databaseUrl
      ? createPostgresPoolFromEnv()
      : null;
  if (pool) {
    await runMigrations(pool);
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }
  const authStore =
    options?.authStore ??
    (pool
      ? (createPostgresAuthRepository(pool) as unknown as AuthStore)
      : createInMemoryAuthStore());
  const providerConfigs =
    options?.providerConfigStore ??
    (pool
      ? (createPostgresProviderConfigRepository({
          db: pool,
          baseUrlAllowlist:
            options?.adminProviderBaseUrlAllowlist ??
            DEFAULT_PROVIDER_BASE_URL_ALLOWLIST,
        }) as unknown as ProviderConfigStore)
      : createProviderConfigStore({
          baseUrlAllowlist:
            options?.adminProviderBaseUrlAllowlist ??
            DEFAULT_PROVIDER_BASE_URL_ALLOWLIST,
        }));

  const runs =
    options?.runRecordStore ??
    (pool ? await createPostgresRunRecordStore(pool) : createRunRecordStore());
  const fileDocumentLibrary = createFileDocumentLibrary(DEFAULT_DOCUMENT_STORAGE_DIR);
  const documentLibrary =
    options?.documentLibrary ??
    (pool
      ? createPostgresDocumentLibrary({
          db: pool,
          blobStorage: fileDocumentLibrary,
        })
      : fileDocumentLibrary);
  const mailAdapter = options?.mailAdapter ?? createMailAdapterFromEnv();
  const providerUsageTracker = pool ? createProviderUsageTracker(pool) : undefined;
  const academicStore = pool
    ? createPostgresAcademicAdminRepository(pool)
    : createInMemoryAcademicAdminRepository();
  const riskEvents: AdminRiskEvent[] = [];

  if (runtimeNodeEnv !== "production") {
    await seedDevelopmentAdmin(authStore);
  }

  const healthPayload = () => ({
    status: "ok",
    renderServiceBaseUrl,
  });
  const versionPayload = () => ({
    status: "ok",
    releaseSha: process.env.UML_RELEASE_SHA ?? null,
    releaseDir: process.env.UML_RELEASE_DIR ?? null,
    runtimeCwd: resolveRuntimeCwd(),
    startedAt: RELEASE_STARTED_AT,
    nodeEnv: process.env.NODE_ENV ?? null,
    renderServiceBaseUrl,
    features: {
      supportsDesignTableDiagram:
        designDiagramKindSchema.safeParse("table").success,
      onlyOfficeDocumentServerConfigured: Boolean(
        process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim(),
      ),
    },
    codeSkillStatus: getCodeSkillRuntimeStatus(),
  });
  const activeUserIdFromRequest = async (request: Parameters<typeof readSessionCookie>[0]) => {
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

  registerHealthRoutes({ app, healthPayload, versionPayload });
  registerAuthRoutes({ app, authStore, mailAdapter });
  registerAccountRoutes({
    app,
    authStore,
    avatarStorageDir:
      process.env.UML_AVATAR_STORAGE_DIR ??
      join(resolveRuntimeCwd(), "data", "avatars"),
  });
  registerProjectRoutes({
    app,
    authStore,
    mailAdapter,
    nodeEnv: options?.nodeEnv ?? process.env.NODE_ENV ?? null,
    academicStore,
  });
  registerProviderConfigRoutes({ app, authStore, providerConfigs });
  registerAdminRoutes({
    app,
    authStore,
    runs,
    documentLibrary,
    providerConfigs,
    providerUsageTracker,
    riskEvents: () => riskEvents.map((event) => ({ ...event })),
    academicStore,
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
    providerUsageTracker,
    runAccessGuard: {
      async resolveRunAccess(request) {
        const projectIdHeader = request.headers["x-uml-project-id"];
        const userId = await activeUserIdFromRequest(request);
        return {
          userId: userId ?? testRunAccessContext?.userId,
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
    allowLegacyPlaintextProviderTest:
      options?.allowLegacyPlaintextProviderTest ??
      DEFAULT_ALLOW_LEGACY_PLAINTEXT_PROVIDER_TEST,
    nodeEnv: runtimeNodeEnv,
  });

  return app;
}

async function seedDevelopmentAdmin(authStore: AuthStore) {
  const email = process.env.UML_DEV_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.UML_DEV_ADMIN_PASSWORD?.trim();
  if (!email || !password) return;

  const displayName = process.env.UML_DEV_ADMIN_DISPLAY_NAME?.trim() || "本地管理员";
  const mfaSecret = process.env.UML_DEV_ADMIN_MFA_SECRET?.trim() || DEFAULT_DEV_ADMIN_MFA_SECRET;
  const systemRoles: AdminRole[] = ["super_admin"];
  const existing = await authStore.findUserByEmail(email);
  const patch = {
    displayName,
    passwordHash: hashPassword(password),
    emailVerified: true,
    systemRoles,
    mfaEnabled: true,
    mfaSecret,
    mfaPendingSecret: null,
    mfaPendingExpiresAt: null,
  };

  if (existing) {
    await authStore.updateUser(existing.id, patch);
    return;
  }

  const created = await authStore.createUser({
    email,
    displayName,
    passwordHash: patch.passwordHash,
    systemRoles,
    emailVerified: true,
  });
  if (created) {
    await authStore.updateUser(created.id, {
      mfaEnabled: true,
      mfaSecret,
      mfaPendingSecret: null,
      mfaPendingExpiresAt: null,
    });
  }
}

async function start() {
  const app = await createApiServer();
  await app.listen({ host: DEFAULT_HOST, port: DEFAULT_PORT });
}

if (isMainModule(import.meta.url)) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
