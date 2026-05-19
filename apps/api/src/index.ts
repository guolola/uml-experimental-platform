import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { designDiagramKindSchema } from "@uml-platform/contracts";
import {
  createRealLlmTransport,
  type ImageGenerationClient,
  type LlmTransport,
} from "./llm.js";
import { getCodeSkillRuntimeStatus } from "./code-skills.js";
import {
  createCorsOriginChecker,
  DEFAULT_LOCAL_CORS_ORIGINS,
} from "./server/cors.js";
import { isMainModule, resolveRuntimeCwd } from "./server/runtime.js";
import { registerHealthRoutes } from "./routes/health/register-health-routes.js";
import { registerRenderRoutes } from "./routes/render/register-render-routes.js";
import { registerRunRoutes } from "./routes/runs/register-run-routes.js";
import { createRunRecordStore } from "./runs/records/run-record-store.js";
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

const DEFAULT_PORT = Number(process.env.API_PORT ?? 4001);
const DEFAULT_HOST = process.env.API_HOST ?? "127.0.0.1";
const DEFAULT_RENDER_SERVICE_BASE_URL =
  process.env.RENDER_SERVICE_BASE_URL ?? "http://127.0.0.1:4002";

const RELEASE_STARTED_AT =
  process.env.UML_RELEASE_STARTED_AT ?? new Date().toISOString();
const DEFAULT_SSE_ALLOW_ORIGIN = "http://localhost:5173";









export async function createApiServer(options?: {
  llmTransport?: LlmTransport;
  imageClient?: ImageGenerationClient;
  renderClient?: RenderClient;
  pngRenderClient?: PngRenderClient;
  renderServiceBaseUrl?: string;
}) {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: createCorsOriginChecker("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    exposedHeaders: ["Content-Disposition"],
  });
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

    reply.code(500).send({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  });

  const llmTransport = options?.llmTransport ?? createRealLlmTransport();
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
  const runs = createRunRecordStore();

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
    },
    codeSkillStatus: getCodeSkillRuntimeStatus(),
  });

  registerHealthRoutes({ app, healthPayload, versionPayload });
  registerRunRoutes({
    app,
    runs,
    llmTransport,
    renderClient,
    pngRenderClient,
    defaultSseAllowOrigin: DEFAULT_SSE_ALLOW_ORIGIN,
    runStagePipeline,
    runDesignStagePipeline,
    runCodeStagePipeline,
    runDocumentStagePipeline,
    addCodeDiagnostic,
  });
  registerRenderRoutes({ app, renderClient, pngRenderClient });

  return app;
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
