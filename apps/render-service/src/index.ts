import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { realpathSync } from "node:fs";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderPngRequestSchema,
  renderPngResponseSchema,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
  type RenderPngRequest,
  type RenderPngResponse,
  type RenderSvgRequest,
  type RenderSvgResponse,
} from "@uml-platform/contracts";

const DEFAULT_PORT = Number(process.env.RENDER_SERVICE_PORT ?? 4002);
const DEFAULT_HOST = process.env.RENDER_SERVICE_HOST ?? "127.0.0.1";
const DEFAULT_JAR_PATH = fileURLToPath(
  new URL("../../../plantuml/build/libs/plantuml-1.2026.3beta8.jar", import.meta.url),
);

async function renderWithPlantUml(
  input: RenderSvgRequest,
  outputFormat: "svg" | "png",
  jarPath = DEFAULT_JAR_PATH,
): Promise<{ output: Buffer; stderr: string; durationMs: number }> {
  renderSvgRequestSchema.parse(input);
  const startedAt = Date.now();

  const result = await new Promise<{ output: Buffer; stderr: string; code: number | null }>(
    (resolve, reject) => {
      const child = spawn(
        "java",
        ["-jar", jarPath, outputFormat === "svg" ? "-tsvg" : "-tpng", "-charset", "UTF-8", "-pipe"],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      const chunks: Buffer[] = [];
      let stderr = "";

      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ output: Buffer.concat(chunks), stderr, code });
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

  return {
    output: result.output,
    stderr: result.stderr,
    durationMs: Date.now() - startedAt,
  };
}

export async function renderSvgWithPlantUml(
  input: RenderSvgRequest,
  jarPath = DEFAULT_JAR_PATH,
): Promise<RenderSvgResponse> {
  renderSvgRequestSchema.parse(input);
  const result = await renderWithPlantUml(input, "svg", jarPath);
  const svg = result.output.toString("utf8").trim();

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
      durationMs: result.durationMs,
    },
  });
}

export async function renderPngWithPlantUml(
  input: RenderPngRequest,
  jarPath = DEFAULT_JAR_PATH,
): Promise<RenderPngResponse> {
  renderPngRequestSchema.parse(input);
  const result = await renderWithPlantUml(input, "png", jarPath);
  const pngSignature = result.output.subarray(0, 8).toString("hex");
  if (pngSignature !== "89504e470d0a1a0a") {
    throw new Error(
      `PlantUML did not return PNG content: ${result.stderr || "empty output"}`,
    );
  }

  return renderPngResponseSchema.parse({
    pngBase64: result.output.toString("base64"),
    renderMeta: {
      engine: "plantuml",
      generatedAt: new Date().toISOString(),
      sourceLength: input.plantUmlSource.length,
      durationMs: result.durationMs,
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

  app.post("/render/png", async (request, reply) => {
    try {
      const input = renderPngRequestSchema.parse(request.body);
      const result = await renderPngWithPlantUml(input);
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

function resolveEntrypointPath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function isMainModule(metaUrl: string, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return (
    resolveEntrypointPath(fileURLToPath(metaUrl)) ===
    resolveEntrypointPath(argvPath)
  );
}

if (isMainModule(import.meta.url)) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
