// Registers render/provider endpoints and delegates external calls to adapters.
import type { FastifyInstance } from "fastify";
import {
  providerSettingsSchema,
  renderPngRequestSchema,
  renderPngResponseSchema,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
} from "@uml-platform/contracts";
import { getModelCapability } from "../../model-capabilities.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";

export function registerRenderRoutes({
  app,
  renderClient,
  pngRenderClient,
}: {
  app: FastifyInstance;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
}) {
  app.post("/api/render/svg", async (request, reply) => {
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

  app.post("/api/render/png", async (request, reply) => {
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
    const providerSettings = providerSettingsSchema.parse(request.body);
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
