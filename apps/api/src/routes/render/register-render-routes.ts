// Registers render/provider endpoints and delegates external calls to adapters.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type ProjectPermission,
  resolvedProviderSettingsSchema,
  renderPngRequestSchema,
  renderPngResponseSchema,
  renderStructuredModelRequestSchema,
  renderStructuredModelResponseSchema,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
} from "@uml-platform/contracts";
import { getModelCapability } from "../../model-capabilities.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import {
  generateDesignPlantUmlArtifacts,
  generatePlantUmlArtifacts,
} from "../../plantuml.js";

export function registerRenderRoutes({
  app,
  renderClient,
  pngRenderClient,
  resolveUserId,
  projectMembershipGuard,
  allowLegacyPlaintextProviderTest = false,
  nodeEnv,
}: {
  app: FastifyInstance;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  resolveUserId: (request: FastifyRequest) => Promise<string | null>;
  projectMembershipGuard: (input: {
    projectId: string;
    userId: string;
    permission: ProjectPermission;
  }) => Promise<boolean>;
  allowLegacyPlaintextProviderTest?: boolean;
  nodeEnv?: string | null;
}) {
  async function requireRenderProjectAccess(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const userId = await resolveUserId(request);
    const projectIdHeader = request.headers["x-uml-project-id"];
    const projectId =
      typeof projectIdHeader === "string" ? projectIdHeader.trim() : "";

    if (!userId || !projectId) {
      reply.code(401);
      return { ok: false as const, message: "请先登录并进入项目" };
    }

    const allowed = await projectMembershipGuard({
      projectId,
      userId,
      permission: "view_project",
    });
    if (!allowed) {
      reply.code(403);
      return { ok: false as const, message: "Project permission required" };
    }

    return { ok: true as const };
  }

  app.post("/api/render/svg", async (request, reply) => {
    const access = await requireRenderProjectAccess(request, reply);
    if (!access.ok) return { message: access.message };

    const input = renderSvgRequestSchema.parse(request.body);
    try {
      return renderSvgResponseSchema.parse(
        await renderClient({
          diagramKind: input.diagramKind,
          source: input.plantUmlSource,
        }),
      );
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/api/render/model", async (request, reply) => {
    const access = await requireRenderProjectAccess(request, reply);
    if (!access.ok) return { message: access.message };

    const input = renderStructuredModelRequestSchema.parse(request.body);
    try {
      const [artifact] =
        input.model.diagramKind === "usecase"
          ? generatePlantUmlArtifacts([input.model])
          : generateDesignPlantUmlArtifacts([input.model]);
      if (!artifact) {
        reply.code(400);
        return { message: "模型无法生成 PlantUML" };
      }
      const rendered = await renderClient({
        diagramKind: artifact.diagramKind,
        source: artifact.source,
      });
      return renderStructuredModelResponseSchema.parse({
        plantUmlSource: artifact.source,
        ...rendered,
      });
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/api/render/png", async (request, reply) => {
    const access = await requireRenderProjectAccess(request, reply);
    if (!access.ok) return { message: access.message };

    const input = renderPngRequestSchema.parse(request.body);
    try {
      const rendered = await pngRenderClient({
        diagramKind: input.diagramKind,
        source: input.plantUmlSource,
      });
      return renderPngResponseSchema.parse({
        pngBase64: rendered.png.toString("base64"),
        renderMeta: rendered.renderMeta,
      });
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/api/provider/test", async (request, reply) => {
    const legacyProviderTestAllowed =
      allowLegacyPlaintextProviderTest &&
      (nodeEnv === "development" || nodeEnv === "test");
    if (!legacyProviderTestAllowed) {
      reply.code(403);
      return {
        ok: false,
        message:
          "Plaintext apiBaseUrl/apiKey provider tests are disabled. Use a managed Provider configuration instead.",
      };
    }

    const providerSettings = resolvedProviderSettingsSchema.parse(request.body);
    const capability = getModelCapability(providerSettings.model);
    const response = await fetch(
      new URL("/v1/chat/completions", providerSettings.apiBaseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: providerSettings.model,
          messages: [
            {
              role: "user",
              content: "只回复 JSON：{\"ok\":true}",
            },
          ],
          stream: false,
          temperature: 0,
          response_format: { type: "json_object" },
          tools: [],
          tool_choice: "none",
        }),
      },
    );

    if (!response.ok) {
      let message = `Provider test failed with HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as {
          message?: string;
          error?: { message?: string };
        };
        message = payload.error?.message ?? payload.message ?? message;
      } catch {
        try {
          const text = await response.text();
          if (text.trim()) {
            message = `${message}: ${text.trim().slice(0, 240)}`;
          }
        } catch {
          // Keep the status-based message.
        }
      }
      reply.code(response.status >= 400 && response.status < 500 ? 400 : 502);
      return {
        ok: false,
        message,
        capability,
      };
    }

    return {
      ok: true,
      message: "Provider connection ok",
      capability,
    };
  });
}
