// Registers render/provider endpoints and delegates external calls to adapters.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  designDiagramModelSpecSchema,
  diagramModelSpecSchema,
  type ProjectPermission,
  renderPngRequestSchema,
  renderPngResponseSchema,
  renderStructuredModelRequestSchema,
  renderStructuredModelResponseSchema,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
} from "@uml-platform/contracts";
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
      const isRequirementOnlyModel =
        input.model.diagramKind === "usecase" ||
        input.model.diagramKind === "prototype" ||
        input.model.diagramKind === "analysis";
      const designModel = designDiagramModelSpecSchema.safeParse(input.model);
      const requirementModel = diagramModelSpecSchema.safeParse(input.model);
      const [artifact] =
        isRequirementOnlyModel || !designModel.success
          ? requirementModel.success
            ? generatePlantUmlArtifacts([requirementModel.data])
            : []
          : generateDesignPlantUmlArtifacts([designModel.data]);
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
    void request;
    reply.code(403);
    return {
      ok: false,
      message:
        "Plaintext apiBaseUrl/apiKey provider tests are disabled. Use a managed Provider configuration instead.",
    };
  });
}
