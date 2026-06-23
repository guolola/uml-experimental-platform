// Registers shared Server-Sent Events endpoints for all run kinds.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RunEvent } from "@uml-platform/contracts";
import {
  refreshRunRecordIfAvailable,
  type RunRecord,
  type RunRecordStore,
} from "../runs/records/run-record-store.js";
import type {
  RunEventSubscription,
  SubscribeRunEvents,
} from "../runs/queue/run-queue.js";
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
  subscribeRunEvents,
  heartbeatMs = 15000,
}: {
  app: FastifyInstance;
  runs: RunRecordStore;
  path: string;
  notFoundMessage: string;
  defaultAllowOrigin: string;
  canReadRunRecord?: CanReadRunRecord;
  subscribeRunEvents?: SubscribeRunEvents;
  heartbeatMs?: number;
}) {
  const allowedOrigins = new Set(
    readCorsOrigins("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
  );

  app.get(path, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const initialRecord = await refreshRunRecordIfAvailable(runs, runId);
    if (!initialRecord) {
      reply.code(404);
      return { message: notFoundMessage };
    }
    let record = initialRecord;
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
    let redisSubscription: RunEventSubscription | null = null;
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, heartbeatMs);
    let closed = false;
    const cleanup = () => {
      clearInterval(heartbeat);
      if (listener) {
        record.listeners.delete(listener);
        listener = null;
      }
      if (redisSubscription) {
        void redisSubscription.close();
        redisSubscription = null;
      }
    };
    const close = () => {
      if (closed) return;
      closed = true;
      cleanup();
      reply.raw.end();
    };
    const sendAndMaybeClose = (event: RunEvent) => {
      if (closed) return;
      send(event);
      if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
        close();
      }
    };

    if (!record.terminal && subscribeRunEvents) {
      try {
        redisSubscription = await subscribeRunEvents(runId, sendAndMaybeClose, () => {
          close();
        });
        const refreshedRecord = await refreshRunRecordIfAvailable(runs, runId);
        if (refreshedRecord) {
          record = refreshedRecord;
        }
      } catch (error) {
        app.log.warn({ err: error, runId }, "failed to subscribe redis run events");
        close();
        return;
      }
    }

    for (const event of record.events) {
      send(event);
    }
    if (record.terminal) {
      close();
      return;
    }

    listener = sendAndMaybeClose;

    record.listeners.add(listener);
    request.raw.on("close", () => {
      cleanup();
    });
  });
}
