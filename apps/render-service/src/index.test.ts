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
