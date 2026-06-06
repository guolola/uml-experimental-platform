// Registers user/project-visible provider config routes with strict no-secret DTOs.
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  providerConfigDtoSchema,
  providerConfigListResponseSchema,
  providerConfigTestRequestSchema,
  providerConfigTestResponseSchema,
} from "@uml-platform/contracts";
import { getModelCapability } from "../../model-capabilities.js";
import { getHealthcheckResponseFormat } from "../../adapters/llm/response-formats/index.js";
import {
  isAuthError,
  isProjectPermissionError,
  requireAuth,
  requireProjectPermission,
} from "../../auth/guards.js";
import type { AuthContext } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type {
  ProviderConfigStore,
  ProviderConfigView,
} from "../../provider-configs/provider-config-store.js";

function toProviderConfigDto(view: ProviderConfigView) {
  return providerConfigDtoSchema.parse({
    id: view.id,
    name: view.name,
    provider: view.provider,
    baseUrl: view.baseUrl,
    defaultModel: view.defaultModel,
    allowedModels: view.allowedModels,
    maskedKey: view.maskedKey,
    status: view.status,
    riskState: view.riskState,
    quota: view.quota,
    lastUsedAt: view.lastUsedAt,
    scopeType: view.scopeType,
    scopeId: view.scopeId,
    breakerState: view.breakerState,
  });
}

function isUserVisibleProvider(view: ProviderConfigView, userId: string) {
  return (
    view.scopeType === "system" ||
    (view.scopeType === "user" && view.scopeId === userId)
  );
}

function isProjectVisibleProvider(
  view: ProviderConfigView,
  userId: string,
  projectId: string,
) {
  return (
    isUserVisibleProvider(view, userId) ||
    (view.scopeType === "project" && view.scopeId === projectId)
  );
}

function providerVisibilityPriority(
  view: ProviderConfigView,
  userId: string,
  projectId?: string,
) {
  if (projectId && view.scopeType === "project" && view.scopeId === projectId) return 0;
  if (view.scopeType === "user" && view.scopeId === userId) return 1;
  if (view.scopeType === "system") return 2;
  return 3;
}

function sortVisibleProviders(
  providers: ProviderConfigView[],
  userId: string,
  projectId?: string,
) {
  return [...providers].sort((left, right) => {
    const priority =
      providerVisibilityPriority(left, userId, projectId) -
      providerVisibilityPriority(right, userId, projectId);
    if (priority !== 0) return priority;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });
}

function breakerDto(view: ProviderConfigView) {
  return {
    state: view.breakerState,
    failureCount: view.breakerFailureCount,
    openedAt: view.breakerOpenedAt,
    lastFailureAt: view.breakerLastFailureAt,
  };
}

function parseProviderTestInput(body: unknown, reply: FastifyReply) {
  const parsed = providerConfigTestRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    reply.code(400);
    return {
      message: parsed.error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "request";
          return `${path}: ${issue.message}`;
        })
        .join("; "),
    } as const;
  }
  return parsed.data;
}

async function testProviderConfig({
  providerConfigs,
  providerConfig,
  model,
  reply,
}: {
  providerConfigs: ProviderConfigStore;
  providerConfig: ProviderConfigView;
  model: string | undefined;
  reply: FastifyReply;
}) {
  if (!providerConfig.allowlisted) {
    reply.code(400);
    return providerConfigTestResponseSchema.parse({
      ok: false,
      message: "Provider Base URL is not allowlisted",
    });
  }
  if (providerConfig.status !== "active") {
    reply.code(400);
    return providerConfigTestResponseSchema.parse({
      ok: false,
      message: "Provider config is revoked, disabled, or inactive",
    });
  }
  if (providerConfig.breakerState === "open") {
    reply.code(503);
    return providerConfigTestResponseSchema.parse({
      ok: false,
      message: "Provider circuit breaker is open",
      breaker: breakerDto(providerConfig),
    });
  }

  const testModel = model ?? providerConfig.defaultModel;
  if (!providerConfig.allowedModels.includes(testModel)) {
    reply.code(400);
    return providerConfigTestResponseSchema.parse({
      ok: false,
      message: "Provider model is not allowed by this config",
    });
  }

  const apiKey = await providerConfigs.getSecret(providerConfig.id);
  if (!apiKey) {
    reply.code(400);
    return providerConfigTestResponseSchema.parse({
      ok: false,
      message: "Provider config secret is revoked",
    });
  }

  const capability = getModelCapability(testModel);
  const response = await fetch(
    new URL("/v1/chat/completions", providerConfig.baseUrl).toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: "user", content: "只回复 JSON：{\"ok\":true}" }],
        stream: false,
        temperature: 0,
        response_format: getHealthcheckResponseFormat(testModel),
        tools: [],
        tool_choice: "none",
      }),
    },
  );

  if (!response.ok) {
    const breaker = await providerConfigs.recordFailure?.(providerConfig.id);
    reply.code(response.status >= 400 && response.status < 500 ? 400 : 502);
    return providerConfigTestResponseSchema.parse({
      ok: false,
      message: `Provider test failed with HTTP ${response.status}`,
      capability,
      breaker: breaker ? breakerDto(breaker) : undefined,
    });
  }

  await providerConfigs.markUsed(providerConfig.id);
  await providerConfigs.resetBreaker?.(providerConfig.id);
  return providerConfigTestResponseSchema.parse({
    ok: true,
    message: "Provider connection ok",
    capability,
  });
}

export function registerProviderConfigRoutes({
  app,
  authStore,
  providerConfigs,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
}) {
  app.get("/api/provider-configs", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return providerConfigListResponseSchema.parse({
      providerConfigs: sortVisibleProviders(
        (await providerConfigs.list()).filter((config) =>
          isUserVisibleProvider(config, auth.user.id),
        ),
        auth.user.id,
      )
        .map(toProviderConfigDto),
    });
  });

  app.get("/api/projects/:projectId/provider-configs", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "view_project",
    );
    if (isProjectPermissionError(context)) return context;

    return providerConfigListResponseSchema.parse({
      providerConfigs: sortVisibleProviders(
        (await providerConfigs.list()).filter((config) =>
          isProjectVisibleProvider(config, context.user.id, projectId),
        ),
        context.user.id,
        projectId,
      )
        .map(toProviderConfigDto),
    });
  });

  app.post("/api/provider-configs/:id/test", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const { id } = request.params as { id: string };
    const input = parseProviderTestInput(request.body, reply);
    if ("message" in input) return input;
    const providerConfig = await providerConfigs.get(id);
    if (!providerConfig || !isUserVisibleProvider(providerConfig, auth.user.id)) {
      reply.code(404);
      return { message: "Provider config not found" };
    }

    return testProviderConfig({
      providerConfigs,
      providerConfig,
      model: input.model,
      reply,
    });
  });

  app.post(
    "/api/projects/:projectId/provider-configs/:id/test",
    async (request, reply) => {
      const { projectId, id } = request.params as {
        projectId: string;
        id: string;
      };
      const context = await requireProjectProviderContext({
        request,
        reply,
        authStore,
        projectId,
      });
      if ("message" in context) return context;

      const input = parseProviderTestInput(request.body, reply);
      if ("message" in input) return input;
      const providerConfig = await providerConfigs.get(id);
      if (
        !providerConfig ||
        !isProjectVisibleProvider(providerConfig, context.user.id, projectId)
      ) {
        reply.code(404);
        return { message: "Provider config not found" };
      }

      return testProviderConfig({
        providerConfigs,
        providerConfig,
        model: input.model,
        reply,
      });
    },
  );
}

async function requireProjectProviderContext({
  request,
  reply,
  authStore,
  projectId,
}: {
  request: Parameters<typeof requireProjectPermission>[0];
  reply: FastifyReply;
  authStore: AuthStore;
  projectId: string;
}): Promise<AuthContext | { message: string }> {
  const context = await requireProjectPermission(
    request,
    reply,
    authStore,
    projectId,
    "view_project",
  );
  if (isProjectPermissionError(context)) return context;
  return context;
}
