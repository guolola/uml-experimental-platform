// Creates the base Fastify instance with shared plugins and normalized request error handling.
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { apiErrorResponseSchema, type ApiErrorCategory } from "@uml-platform/contracts";
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

function categoryForStatus(status: number): ApiErrorCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404) return "not_found";
  if (status === 409 || status === 422) return "conflict";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "internal";
  return "validation";
}

function codeForStatus(status: number) {
  if (status === 400) return "VALIDATION_FAILED";
  if (status === 401) return "AUTHENTICATION_REQUIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "RESOURCE_NOT_FOUND";
  if (status === 409) return "RESOURCE_CONFLICT";
  if (status === 422) return "REQUEST_UNPROCESSABLE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

function errorResponse(input: {
  status: number;
  requestId: string;
  details?: Record<string, unknown>;
}) {
  return apiErrorResponseSchema.parse({
    error: {
      code: codeForStatus(input.status),
      category: categoryForStatus(input.status),
      retryable: input.status === 429 || input.status >= 500,
      details: input.details,
    },
    requestId: input.requestId,
  });
}

export async function createConfiguredFastifyApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(cors, {
    origin: createCorsOriginChecker("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  await app.register(multipart);
  app.addHook("preSerialization", async (request, reply, payload) => {
    if (reply.statusCode < 400 || typeof payload !== "object" || payload === null) {
      return payload;
    }
    const candidate = payload as Record<string, unknown>;
    const nestedError = candidate.error;
    const hasStructuredError =
      typeof nestedError === "object" &&
      nestedError !== null &&
      typeof (nestedError as Record<string, unknown>).code === "string";
    if (hasStructuredError || (
      typeof candidate.message !== "string" &&
      typeof nestedError !== "string"
    )) {
      return payload;
    }
    // Legacy routes may still construct `{ message }`; normalize them at the boundary
    // so client-visible responses never expose natural-language exception text.
    return errorResponse({
      status: reply.statusCode,
      requestId: request.id,
    });
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (isZodLikeError(error)) {
      reply.code(400).send(errorResponse({
        status: 400,
        requestId: request.id,
        details: { validation: formatZodIssues(error.issues) },
      }));
      return;
    }
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : null;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send(errorResponse({
        status: statusCode,
        requestId: request.id,
      }));
      return;
    }

    reply.code(500).send(errorResponse({
      status: 500,
      requestId: request.id,
    }));
  });
  return app;
}
