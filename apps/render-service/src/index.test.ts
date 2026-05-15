import assert from "node:assert/strict";
import test from "node:test";
import { createRenderServiceServer } from "./index.js";

const CASES = [
  {
    name: "usecase",
    payload: {
      diagramKind: "usecase",
      plantUmlSource: `@startuml
left to right direction
actor 用户
usecase "提交需求" as UC1
用户 --> UC1
@enduml`,
    },
  },
  {
    name: "class",
    payload: {
      diagramKind: "class",
      plantUmlSource: `@startuml
class User
class Order
User --> Order
@enduml`,
    },
  },
  {
    name: "activity",
    payload: {
      diagramKind: "activity",
      plantUmlSource: `@startuml
start
:输入需求;
:生成模型;
stop
@enduml`,
    },
  },
  {
    name: "deployment",
    payload: {
      diagramKind: "deployment",
      plantUmlSource: `@startuml
node Browser
node API
database DB
Browser --> API
API --> DB
@enduml`,
    },
  },
] as const;

for (const entry of CASES) {
  test(`render-service renders ${entry.name} svg`, async () => {
    const app = await createRenderServiceServer();
    const response = await app.inject({
      method: "POST",
      url: "/render/svg",
      payload: entry.payload,
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.match(body.svg, /<svg/i);
    assert.equal(body.renderMeta.engine, "plantuml");

    await app.close();
  });
}

test("render-service renders png", async () => {
  const app = await createRenderServiceServer();
  const response = await app.inject({
    method: "POST",
    url: "/render/png",
    payload: CASES[0].payload,
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  const signature = Buffer.from(body.pngBase64, "base64")
    .subarray(0, 8)
    .toString("hex");
  assert.equal(signature, "89504e470d0a1a0a");
  assert.equal(body.renderMeta.engine, "plantuml");

  await app.close();
});

test("render-service applies the configured CORS origin allowlist", async () => {
  const originalCorsOrigins = process.env.RENDER_SERVICE_CORS_ORIGINS;
  process.env.RENDER_SERVICE_CORS_ORIGINS =
    "https://app.example.com,http://localhost:5173";

  const app = await createRenderServiceServer();

  try {
    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://app.example.com" },
    });
    const blocked = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });

    assert.equal(allowed.statusCode, 200);
    assert.equal(
      allowed.headers["access-control-allow-origin"],
      "https://app.example.com",
    );
    assert.equal(blocked.statusCode, 200);
    assert.equal(blocked.headers["access-control-allow-origin"], undefined);
  } finally {
    await app.close();
    if (originalCorsOrigins === undefined) {
      delete process.env.RENDER_SERVICE_CORS_ORIGINS;
    } else {
      process.env.RENDER_SERVICE_CORS_ORIGINS = originalCorsOrigins;
    }
  }
});
