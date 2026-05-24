// Verifies SSE-specific headers because hijacked streams bypass Fastify CORS.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { RunEvent, RunSnapshot } from "@uml-platform/contracts";
import type { RunRecord } from "../runs/records/run-record-store.js";
import { registerRunEventsRoute } from "./run-events.js";

const completedSnapshot = {
  runId: "run-1",
  status: "completed",
} as RunSnapshot;

function createCompletedRunRecord(): RunRecord {
  const event = {
    type: "completed",
    snapshot: completedSnapshot,
  } as RunEvent;

  return {
    snapshot: completedSnapshot,
    events: [event],
    listeners: new Set(),
    terminal: true,
  };
}

async function createSseTestApp() {
  const app = Fastify({ logger: false });
  const runs = new Map<string, RunRecord>();
  runs.set("run-1", createCompletedRunRecord());

  registerRunEventsRoute({
    app,
    runs,
    path: "/runs/:runId/events",
    notFoundMessage: "Run not found",
    defaultAllowOrigin: "http://localhost:5173",
    heartbeatMs: 1000,
  });

  return app;
}

async function withApiCorsOrigins<T>(
  value: string | undefined,
  callback: () => Promise<T>,
) {
  const original = process.env.API_CORS_ORIGINS;
  if (value === undefined) {
    delete process.env.API_CORS_ORIGINS;
  } else {
    process.env.API_CORS_ORIGINS = value;
  }

  try {
    return await callback();
  } finally {
    if (original === undefined) {
      delete process.env.API_CORS_ORIGINS;
    } else {
      process.env.API_CORS_ORIGINS = original;
    }
  }
}

test("run event SSE allows an allowlisted default origin", async () => {
  await withApiCorsOrigins("http://localhost:5173", async () => {
    const app = await createSseTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/runs/run-1/events",
      headers: {
        origin: "http://localhost:5173",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://localhost:5173",
    );
    assert.equal(response.headers["access-control-allow-credentials"], "true");

    await app.close();
  });
});

test("run event SSE allows origins from the API CORS allowlist", async () => {
  await withApiCorsOrigins("https://app.example.com", async () => {
    const app = await createSseTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/runs/run-1/events",
      headers: {
        origin: "https://app.example.com",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "https://app.example.com",
    );

    await app.close();
  });
});

test("run event SSE does not reflect hostile origins", async () => {
  await withApiCorsOrigins("https://app.example.com", async () => {
    const app = await createSseTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/runs/run-1/events",
      headers: {
        origin: "https://attacker.example",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["access-control-allow-origin"], undefined);

    await app.close();
  });
});

test("run event SSE keeps no-origin requests usable", async () => {
  const app = await createSseTestApp();

  const response = await app.inject({
    method: "GET",
    url: "/runs/run-1/events",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
  assert.match(response.body, /"type":"completed"/);

  await app.close();
});
