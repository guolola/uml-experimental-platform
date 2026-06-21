// Registers shared Server-Sent Events endpoints for all run kinds.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RunEvent } from "@uml-platform/contracts";
import {
  refreshRunRecordIfAvailable,
  type RunRecord,
  type RunRecordStore,
} from "../runs/records/run-record-store.js";
import { DEFAULT_LOCAL_CORS_ORIGINS, readCorsOrigins } from "../server/cors.js";

type CanReadRunRecord = (
  request: FastifyRequest,
  reply: FastifyReply,
  record: RunRecord,
) => Promise<boolean>;

export function registerRunEventsRoute({
  app,
  runs,
  path,
  notFoundMessage,
  defaultAllowOrigin,
  canReadRunRecord,
  heartbeatMs = 15000,
}: {
  app: FastifyInstance;
  runs: RunRecordStore;
  path: string;
  notFoundMessage: string;
  defaultAllowOrigin: string;
  canReadRunRecord?: CanReadRunRecord;
  heartbeatMs?: number;
}) {
  const allowedOrigins = new Set(
    readCorsOrigins("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
  );

  app.get(path, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return { message: notFoundMessage };
    }
    if (canReadRunRecord && !(await canReadRunRecord(request, reply, record))) {
      return reply;
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin =
      requestOrigin && allowedOrigins.has(requestOrigin)
        ? requestOrigin
        : requestOrigin
          ? null
          : defaultAllowOrigin;
    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      Vary: "Origin",
    };
    if (allowOrigin) {
      headers["Access-Control-Allow-Origin"] = allowOrigin;
      headers["Access-Control-Allow-Credentials"] = "true";
    }

    reply.hijack();
    reply.raw.writeHead(200, headers);

    const send = (event: RunEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    let listener: ((event: RunEvent) => void) | null = null;
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, heartbeatMs);
    const close = () => {
      clearInterval(heartbeat);
      if (listener) {
        record.listeners.delete(listener);
      }
      reply.raw.end();
    };

    for (const event of record.events) {
      send(event);
    }

    if (record.terminal) {
      close();
      return;
    }

    listener = (event: RunEvent) => {
      send(event);
      if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
        close();
      }
    };

    record.listeners.add(listener);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      if (listener) {
        record.listeners.delete(listener);
      }
    });
  });
}
