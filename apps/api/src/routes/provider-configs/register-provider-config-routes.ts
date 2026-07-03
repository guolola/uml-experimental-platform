// Registers user/project-visible provider config routes with strict no-secret DTOs.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  providerConfigDtoSchema,
  providerConfigListResponseSchema,
  providerConfigTestRequestSchema,
  providerConfigTestResponseSchema,
  providerModelCapabilityMapSchema,
  providerModelDiscoveryRequestSchema,
  providerModelDiscoveryProgressEventSchema,
  providerModelDiscoveryResponseSchema,
  type ProviderModelDiscoveryProgressEvent,
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
import {
  assertManagedProviderBaseUrlResolvesPublicly,
  ProviderConfigPolicyError,
  type ProviderHostnameResolver,
} from "../../provider-configs/provider-url-policy.js";
import {
  ProviderHttpError,
  runOpenAiCompatibleChatCompletionHealthcheck,
} from "../../llm.js";
import { discoverOpenAiCompatibleModelCapabilities } from "../../provider-configs/provider-model-discovery.js";
import {
  DEFAULT_LOCAL_CORS_ORIGINS,
  readCorsOrigins,
} from "../../server/cors.js";

export type ProviderConfigRiskEventRecorder = (event: {
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  actorUserId: string | null;
  projectId: string | null;
  targetType: string;
  targetId: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}) => void | Promise<void>;

function toProviderConfigDto(view: ProviderConfigView) {
  return providerConfigDtoSchema.parse({
    id: view.id,
    name: view.name,
    provider: view.provider,
    baseUrl: view.baseUrl,
    defaultModel: view.defaultModel,
    allowedModels: view.allowedModels,
    modelCapabilities: view.modelCapabilities,
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

const providerConfigSelfServiceRotateRequestSchema = z
  .object({
    apiKey: z.string().trim().min(1),
    model: z.string().trim().min(1).optional(),
  })
  .strict();

const providerConfigSelfServiceCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1),
    provider: z.string().trim().min(1).optional(),
    baseUrl: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
    defaultModel: z.string().trim().min(1),
    allowedModels: z.array(z.string().trim().min(1)).min(1),
    modelCapabilities: providerModelCapabilityMapSchema.optional(),
    keyPurpose: z.string().trim().min(1).optional(),
  })
  .strict();

const providerConfigSelfServiceUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    baseUrl: z.string().trim().min(1).optional(),
    apiKey: z.string().trim().min(1).optional(),
    defaultModel: z.string().trim().min(1).optional(),
    allowedModels: z.array(z.string().trim().min(1)).min(1).optional(),
    modelCapabilities: providerModelCapabilityMapSchema.optional(),
    keyPurpose: z.string().trim().min(1).optional(),
  })
  .strict();

const providerConfigTemporaryTestRequestSchema = z
  .object({
    baseUrl: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
    model: z.string().trim().min(1),
  })
  .strict();

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

function summarizeProviderErrorText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, 240);
}

async function readProviderErrorDetail(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();
  const textSummary = summarizeProviderErrorText(rawText);

  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(rawText) as {
        message?: unknown;
        error?: { message?: unknown } | unknown;
      };
      if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message.trim();
      }
      if (
        typeof payload.error === "object" &&
        payload.error !== null &&
        "message" in payload.error &&
        typeof payload.error.message === "string" &&
        payload.error.message.trim()
      ) {
        return payload.error.message.trim();
      }
    } catch {
      // Fall back to a compact raw response summary below.
    }
  }

  return textSummary;
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

function parseProviderModelDiscoveryInput(body: unknown, reply: FastifyReply) {
  const parsed = providerModelDiscoveryRequestSchema.safeParse(body ?? {});
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

function parseTemporaryProviderTestInput(body: unknown, reply: FastifyReply) {
  const parsed = providerConfigTemporaryTestRequestSchema.safeParse(body ?? {});
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

function parseSelfServiceCreateInput(body: unknown, reply: FastifyReply) {
  const parsed = providerConfigSelfServiceCreateRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    reply.code(400);
    return { message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ") } as const;
  }
  return parsed.data;
}

function parseSelfServiceUpdateInput(body: unknown, reply: FastifyReply) {
  const parsed = providerConfigSelfServiceUpdateRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    reply.code(400);
    return { message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ") } as const;
  }
  return parsed.data;
}

function parseSelfServiceRotateInput(body: unknown, reply: FastifyReply) {
  const parsed = providerConfigSelfServiceRotateRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    reply.code(400);
    return { message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ") } as const;
  }
  return parsed.data;
}

function redactProviderSecret(message: string, apiKey: string) {
  return message.replaceAll(apiKey, "[redacted-api-key]");
}

async function recordSelfServiceProviderAudit({
  providerConfigs,
  actor,
  action,
  target,
  result,
}: {
  providerConfigs: ProviderConfigStore;
  actor: string;
  action: string;
  target: string;
  result: "success" | "blocked" | "failed";
}) {
  await providerConfigs.recordAudit?.({ actor, action, target, result });
}

function providerFailureRiskLevel(error: unknown) {
  return error instanceof ProviderConfigPolicyError ? "high" : "medium";
}

function providerFailureResult(error: unknown) {
  return error instanceof ProviderConfigPolicyError ? "blocked" : "failed";
}

function baseUrlRiskMetadata(baseUrl: string) {
  try {
    const url = new URL(baseUrl.trim());
    return {
      origin: `${url.protocol}//${url.host}`,
      hostname: url.hostname,
      protocol: url.protocol,
      port: url.port || null,
    };
  } catch {
    return { origin: null, hostname: null, protocol: null, port: null };
  }
}

async function recordSelfServiceProviderRiskEvent({
  recordRiskEvent,
  actorUserId,
  action,
  providerName,
  providerConfigId = null,
  baseUrl,
  model,
  message,
  error,
}: {
  recordRiskEvent?: ProviderConfigRiskEventRecorder;
  actorUserId: string;
  action: "create" | "rotate" | "update";
  providerName: string;
  providerConfigId?: string | null;
  baseUrl: string;
  model: string;
  message: string;
  error: unknown;
}) {
  const result = providerFailureResult(error);
  await recordRiskEvent?.({
    eventType: `provider_config_${action}_${result}`,
    severity: providerFailureRiskLevel(error),
    actorUserId,
    projectId: null,
    targetType: "provider_config",
    targetId: providerConfigId,
    message: `User provider config ${action} ${result}: ${providerName}`,
    metadata: {
      providerName,
      model,
      result,
      reason: message,
      baseUrl: baseUrlRiskMetadata(baseUrl),
    },
  });
}

async function verifyTemporaryProviderConnection({
  baseUrl,
  apiKey,
  model,
  resolveHostname,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  resolveHostname?: ProviderHostnameResolver;
}) {
  const normalizedBaseUrl = await assertManagedProviderBaseUrlResolvesPublicly(
    baseUrl,
    resolveHostname,
  );
  await runOpenAiCompatibleChatCompletionHealthcheck({
    apiBaseUrl: normalizedBaseUrl,
    apiKey,
    model,
    responseFormat: getHealthcheckResponseFormat(model),
    resolveHostname,
  });
  return normalizedBaseUrl;
}

function providerConnectionFailureStatus(error: unknown) {
  if (error instanceof ProviderConfigPolicyError) return 400;
  if (error instanceof ProviderHttpError) {
    return error.status >= 400 && error.status < 500 ? 400 : 502;
  }
  return 502;
}

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
  reply,
  request,
  resolveHostname,
}: {
  apiBaseUrl: string;
  apiKey: string;
  reply: FastifyReply;
  request: FastifyRequest;
  resolveHostname?: ProviderHostnameResolver;
}) {
  const stream = createProviderModelDiscoveryStream(request, reply);
  stream.send({ type: "started", sourceBaseUrl: apiBaseUrl });
  try {
    const discovery = await discoverOpenAiCompatibleModelCapabilities({
      apiBaseUrl,
      apiKey,
      abortSignal: stream.abortSignal,
      onProgress: stream.send,
      resolveHostname,
    });
    const result = providerModelDiscoveryResponseSchema.parse({
      ...discovery,
      fetchedAt: new Date().toISOString(),
      sourceBaseUrl: apiBaseUrl,
    });
    stream.send({ type: "completed", result });
  } catch (error) {
    if (!isAbortError(error)) {
      const providerStatus =
        error instanceof ProviderHttpError ? error.status : undefined;
      stream.send({
        type: "error",
        message:
          error instanceof Error
            ? redactProviderSecret(error.message, apiKey)
            : "Provider model discovery failed",
        status: providerStatus ?? 502,
      });
    }
  } finally {
    stream.close();
  }
}

async function findOwnedUserProvider(
  providerConfigs: ProviderConfigStore,
  providerConfigId: string,
  userId: string,
) {
  const providerConfig = await providerConfigs.get(providerConfigId);
  if (
    !providerConfig ||
    providerConfig.scopeType !== "user" ||
    providerConfig.scopeId !== userId
  ) {
    return null;
  }
  return providerConfig;
}

async function testProviderConfig({
  providerConfigs,
  providerConfig,
  model,
  reply,
  resolveHostname,
}: {
  providerConfigs: ProviderConfigStore;
  providerConfig: ProviderConfigView;
  model: string | undefined;
  reply: FastifyReply;
  resolveHostname?: ProviderHostnameResolver;
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

  const modelCapability = providerConfig.modelCapabilities[testModel];
  const capability = getModelCapability(modelCapability ?? testModel);
  try {
    await runOpenAiCompatibleChatCompletionHealthcheck({
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      model: testModel,
      responseFormat: getHealthcheckResponseFormat(modelCapability ?? testModel),
      resolveHostname,
    });
  } catch (error) {
    const breaker = await providerConfigs.recordFailure?.(providerConfig.id);
    const providerStatus =
      error instanceof ProviderHttpError ? error.status : null;
    reply.code(
      providerStatus !== null && providerStatus >= 400 && providerStatus < 500
        ? 400
        : 502,
    );
    return providerConfigTestResponseSchema.parse({
      ok: false,
      message: error instanceof Error ? error.message : "Provider test failed",
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
  recordRiskEvent,
  resolveProviderHostname,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  providerConfigs: ProviderConfigStore;
  recordRiskEvent?: ProviderConfigRiskEventRecorder;
  resolveProviderHostname?: ProviderHostnameResolver;
}) {
  app.get("/api/provider-configs", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return providerConfigListResponseSchema.parse({
      providerConfigs: sortVisibleProviders(
        (await providerConfigs.list()).filter(
          (config) =>
            config.status === "active" &&
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
        (await providerConfigs.list()).filter(
          (config) =>
            config.status === "active" &&
            isProjectVisibleProvider(config, context.user.id, projectId),
        ),
        context.user.id,
        projectId,
      )
        .map(toProviderConfigDto),
    });
  });

  app.post("/api/provider-configs/discover-models", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = parseProviderModelDiscoveryInput(request.body, reply);
    if ("message" in input) return input;

    let sourceBaseUrl: string;
    try {
      sourceBaseUrl = await assertManagedProviderBaseUrlResolvesPublicly(
        input.baseUrl,
        resolveProviderHostname,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? redactProviderSecret(error.message, input.apiKey)
          : "Provider Base URL policy check failed";
      reply.code(providerConnectionFailureStatus(error));
      return { message };
    }

    try {
      const discovery = await discoverOpenAiCompatibleModelCapabilities({
        apiBaseUrl: sourceBaseUrl,
        apiKey: input.apiKey,
        resolveHostname: resolveProviderHostname,
      });
      return providerModelDiscoveryResponseSchema.parse({
        ...discovery,
        fetchedAt: new Date().toISOString(),
        sourceBaseUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? redactProviderSecret(error.message, input.apiKey)
          : "Provider model discovery failed";
      reply.code(providerConnectionFailureStatus(error));
      return { message };
    }
  });

  app.post("/api/provider-configs/discover-models/stream", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = parseProviderModelDiscoveryInput(request.body, reply);
    if ("message" in input) return input;

    let sourceBaseUrl: string;
    try {
      sourceBaseUrl = await assertManagedProviderBaseUrlResolvesPublicly(
        input.baseUrl,
        resolveProviderHostname,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? redactProviderSecret(error.message, input.apiKey)
          : "Provider Base URL policy check failed";
      reply.code(providerConnectionFailureStatus(error));
      return { message };
    }

    return runProviderModelDiscoveryStream({
      apiBaseUrl: sourceBaseUrl,
      apiKey: input.apiKey,
      reply,
      request,
      resolveHostname: resolveProviderHostname,
    });
  });

  app.post("/api/provider-configs/test-temporary", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = parseTemporaryProviderTestInput(request.body, reply);
    if ("message" in input) return input;

    try {
      await verifyTemporaryProviderConnection({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.model,
        resolveHostname: resolveProviderHostname,
      });
      return providerConfigTestResponseSchema.parse({
        ok: true,
        message: "Provider connection ok",
        capability: getModelCapability(input.model),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? redactProviderSecret(error.message, input.apiKey)
          : "Provider connection test failed";
      reply.code(providerConnectionFailureStatus(error));
      return providerConfigTestResponseSchema.parse({
        ok: false,
        message,
        capability: getModelCapability(input.model),
      });
    }
  });

  app.post("/api/provider-configs", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = parseSelfServiceCreateInput(request.body, reply);
    if ("message" in input) return input;

    try {
      await verifyTemporaryProviderConnection({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.defaultModel,
        resolveHostname: resolveProviderHostname,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? redactProviderSecret(error.message, input.apiKey)
          : "Provider connection test failed";
      await recordSelfServiceProviderAudit({
        providerConfigs,
        actor: auth.user.id,
        action: "user.provider_config.create",
        target: input.name,
        result: providerFailureResult(error),
      });
      await recordSelfServiceProviderRiskEvent({
        recordRiskEvent,
        actorUserId: auth.user.id,
        action: "create",
        providerName: input.name,
        baseUrl: input.baseUrl,
        model: input.defaultModel,
        message,
        error,
      });
      reply.code(providerConnectionFailureStatus(error));
      return providerConfigTestResponseSchema.parse({
        ok: false,
        message,
      });
    }

    const created = await providerConfigs.create({
      name: input.name,
      provider: input.provider,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      defaultModel: input.defaultModel,
      allowedModels: input.allowedModels,
      modelCapabilities: input.modelCapabilities,
      keyPurpose: input.keyPurpose ?? "user-managed provider key",
      createdBy: auth.user.id,
      riskState: "medium",
      scopeType: "user",
      scopeId: auth.user.id,
    });
    await providerConfigs.markUsed(created.id);
    reply.code(201);
    return toProviderConfigDto((await providerConfigs.get(created.id)) ?? created);
  });

  app.patch("/api/provider-configs/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const { id } = request.params as { id: string };
    const input = parseSelfServiceUpdateInput(request.body, reply);
    if ("message" in input) return input;
    const providerConfig = await findOwnedUserProvider(providerConfigs, id, auth.user.id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    if (!providerConfigs.updateMetadata) {
      reply.code(501);
      return { message: "Provider config update is unavailable" };
    }

    if (input.baseUrl && input.baseUrl.trim() !== providerConfig.baseUrl && !input.apiKey?.trim()) {
      reply.code(400);
      return { message: "API Key is required when changing Provider Base URL" };
    }

    const nextBaseUrl = input.baseUrl ?? providerConfig.baseUrl;
    const nextModel = input.defaultModel ?? providerConfig.defaultModel;
    const nextAllowedModels = input.allowedModels ?? providerConfig.allowedModels;
    if (!nextAllowedModels.includes(nextModel)) {
      reply.code(400);
      return { message: "Provider default model must be included in allowed models" };
    }

    const apiKey = input.apiKey?.trim() || (await providerConfigs.getSecret(id));
    if (!apiKey) {
      reply.code(400);
      return { message: "Provider config secret is revoked" };
    }

    let normalizedBaseUrl: string;
    try {
      normalizedBaseUrl = await verifyTemporaryProviderConnection({
        baseUrl: nextBaseUrl,
        apiKey,
        model: nextModel,
        resolveHostname: resolveProviderHostname,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? redactProviderSecret(error.message, apiKey)
          : "Provider connection test failed";
      await recordSelfServiceProviderAudit({
        providerConfigs,
        actor: auth.user.id,
        action: "user.provider_config.update",
        target: providerConfig.name,
        result: providerFailureResult(error),
      });
      await recordSelfServiceProviderRiskEvent({
        recordRiskEvent,
        actorUserId: auth.user.id,
        action: "update",
        providerName: input.name ?? providerConfig.name,
        providerConfigId: providerConfig.id,
        baseUrl: nextBaseUrl,
        model: nextModel,
        message,
        error,
      });
      reply.code(providerConnectionFailureStatus(error));
      return { message };
    }

    try {
      const updated = await providerConfigs.updateMetadata(
        id,
        {
          ...input,
          baseUrl: normalizedBaseUrl,
          apiKey: input.apiKey,
          scopeType: "user",
          scopeId: auth.user.id,
        },
        auth.user.id,
      );
      if (!updated) {
        reply.code(404);
        return { message: "Provider config not found" };
      }
      await providerConfigs.markUsed(id);
      await providerConfigs.resetBreaker?.(id);
      return toProviderConfigDto((await providerConfigs.get(id)) ?? updated);
    } catch (error) {
      if (error instanceof ProviderConfigPolicyError) {
        reply.code(400);
        return { message: error.message };
      }
      throw error;
    }
  });

  app.post("/api/provider-configs/:id/rotate", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const { id } = request.params as { id: string };
    const input = parseSelfServiceRotateInput(request.body, reply);
    if ("message" in input) return input;
    const providerConfig = await findOwnedUserProvider(providerConfigs, id, auth.user.id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }

    const testModel = input.model ?? providerConfig.defaultModel;
    if (!providerConfig.allowedModels.includes(testModel)) {
      reply.code(400);
      return providerConfigTestResponseSchema.parse({
        ok: false,
        message: "Provider model is not allowed by this config",
      });
    }

    try {
      await verifyTemporaryProviderConnection({
        baseUrl: providerConfig.baseUrl,
        apiKey: input.apiKey,
        model: testModel,
        resolveHostname: resolveProviderHostname,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? redactProviderSecret(error.message, input.apiKey)
          : "Provider connection test failed";
      await recordSelfServiceProviderAudit({
        providerConfigs,
        actor: auth.user.id,
        action: "user.provider_config.rotate",
        target: providerConfig.name,
        result: providerFailureResult(error),
      });
      await recordSelfServiceProviderRiskEvent({
        recordRiskEvent,
        actorUserId: auth.user.id,
        action: "rotate",
        providerName: providerConfig.name,
        providerConfigId: providerConfig.id,
        baseUrl: providerConfig.baseUrl,
        model: testModel,
        message,
        error,
      });
      reply.code(providerConnectionFailureStatus(error));
      return providerConfigTestResponseSchema.parse({
        ok: false,
        message,
      });
    }

    const rotated = await providerConfigs.rotate(id, input.apiKey, auth.user.id);
    if (!rotated) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    return toProviderConfigDto(rotated);
  });

  async function updateOwnedProviderStatus(
    providerConfigId: string,
    actorUserId: string,
    action: "disable" | "enable",
    reply: FastifyReply,
  ) {
    const providerConfig = await findOwnedUserProvider(
      providerConfigs,
      providerConfigId,
      actorUserId,
    );
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    const updater = action === "enable" ? providerConfigs.enable : providerConfigs.disable;
    if (!updater) {
      reply.code(501);
      return { message: "Provider config status update is unavailable" };
    }
    const updated = await updater.call(providerConfigs, providerConfigId, actorUserId);
    if (!updated) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    return toProviderConfigDto(updated);
  }

  app.post("/api/provider-configs/:id/disable", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const { id } = request.params as { id: string };
    return updateOwnedProviderStatus(id, auth.user.id, "disable", reply);
  });

  app.post("/api/provider-configs/:id/enable", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const { id } = request.params as { id: string };
    return updateOwnedProviderStatus(id, auth.user.id, "enable", reply);
  });

  app.post("/api/provider-configs/:id/revoke", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const { id } = request.params as { id: string };
    const providerConfig = await findOwnedUserProvider(providerConfigs, id, auth.user.id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    const revoked = await providerConfigs.revoke(id, auth.user.id);
    if (!revoked) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    return toProviderConfigDto(revoked);
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
      resolveHostname: resolveProviderHostname,
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
        resolveHostname: resolveProviderHostname,
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
