// Registers shared Server-Sent Events endpoints for all run kinds.
import type { FastifyInstance } from "fastify";
import type { RunEvent } from "@uml-platform/contracts";
import type { RunRecord } from "../runs/records/run-record-store.js";

export function registerRunEventsRoute({
  app,
  runs,
  path,
  notFoundMessage,
  defaultAllowOrigin,
  heartbeatMs = 15000,
}: {
  app: FastifyInstance;
  runs: Map<string, RunRecord>;
  path: string;
  notFoundMessage: string;
  defaultAllowOrigin: string;
  heartbeatMs?: number;
}) {
  app.get(path, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: notFoundMessage };
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin = requestOrigin ?? defaultAllowOrigin;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
    });

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
      if (event.type === "completed" || event.type === "failed") {
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
