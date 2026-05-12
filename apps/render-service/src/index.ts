import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  renderSvgRequestSchema,
  renderSvgResponseSchema,
  type RenderSvgRequest,
  type RenderSvgResponse,
} from "@uml-platform/contracts";

const DEFAULT_PORT = Number(process.env.RENDER_SERVICE_PORT ?? 4002);
const DEFAULT_HOST = process.env.RENDER_SERVICE_HOST ?? "127.0.0.1";
const DEFAULT_JAR_PATH = fileURLToPath(
  new URL("../../../plantuml/build/libs/plantuml-1.2026.3beta8.jar", import.meta.url),
);

export async function renderSvgWithPlantUml(
  input: RenderSvgRequest,
  jarPath = DEFAULT_JAR_PATH,
): Promise<RenderSvgResponse> {
  renderSvgRequestSchema.parse(input);
  const startedAt = Date.now();

  const result = await new Promise<{ svg: string; stderr: string; code: number | null }>(
    (resolve, reject) => {
      const child = spawn(
        "java",
        ["-jar", jarPath, "-tsvg", "-charset", "UTF-8", "-pipe"],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ svg: stdout, stderr, code });
      });

      child.stdin.write(input.plantUmlSource);
      child.stdin.end();
    },
  );

  if (result.code !== 0) {
    throw new Error(
      `PlantUML exited with code ${result.code ?? "unknown"}: ${result.stderr || "no stderr"}`,
    );
  }

  const svg = result.svg.trim();
  if (!svg.includes("<svg")) {
    throw new Error(
      `PlantUML did not return SVG content: ${result.stderr || "empty output"}`,
    );
  }

  return renderSvgResponseSchema.parse({
    svg,
    renderMeta: {
      engine: "plantuml",
      generatedAt: new Date().toISOString(),
      sourceLength: input.plantUmlSource.length,
      durationMs: Date.now() - startedAt,
    },
  });
}

export async function createRenderServiceServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/health", async () => {
    let jarAvailable = true;
    try {
      await access(DEFAULT_JAR_PATH);
    } catch {
      jarAvailable = false;
    }

    return {
      status: "ok",
      jarPath: DEFAULT_JAR_PATH,
      jarAvailable,
    };
  });

  app.post("/render/svg", async (request, reply) => {
    try {
      const input = renderSvgRequestSchema.parse(request.body);
      const result = await renderSvgWithPlantUml(input);
      return result;
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  return app;
}

async function start() {
  const app = await createRenderServiceServer();
  await app.listen({ host: DEFAULT_HOST, port: DEFAULT_PORT });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
