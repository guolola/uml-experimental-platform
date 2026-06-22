// Creates the base Fastify instance with shared plugins and normalized request error handling.
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { ZodError } from "zod";
import {
  createCorsOriginChecker,
  DEFAULT_LOCAL_CORS_ORIGINS,
} from "./cors.js";

type ZodLikeIssue = {
  message: string;
  path: Array<string | number>;
};

function isZodLikeError(error: unknown): error is { issues: ZodLikeIssue[] } {
  if (error instanceof ZodError) return true;
  const issues = (error as { issues?: unknown } | null)?.issues;
  return (
    Array.isArray(issues) &&
    issues.every((issue) => {
      const candidate = issue as Partial<ZodLikeIssue> | null;
      return (
        typeof candidate?.message === "string" &&
        Array.isArray(candidate.path)
      );
    })
  );
}

function formatZodIssues(issues: ZodLikeIssue[]) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "request";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export async function createConfiguredFastifyApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(cors, {
    origin: createCorsOriginChecker("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  await app.register(multipart);
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (isZodLikeError(error)) {
      reply.code(400).send({
        message: formatZodIssues(error.issues),
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
  return app;
}
