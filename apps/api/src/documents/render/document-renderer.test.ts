// Verifies DOCX rendering passes diagram model-scoped PlantUML sources to image rendering.
import assert from "node:assert/strict";
import test from "node:test";
import {
  renderDocumentBuffer,
  resolvePngImageTransformation,
} from "./document-renderer.js";
import { type PngRenderClient } from "../../adapters/render/png-render-client.js";

const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function pngHeader(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test("renderDocumentBuffer renders same-kind sequence sections by diagramModelId", async () => {
  const calls: Parameters<PngRenderClient>[0][] = [];
  const renderPng: PngRenderClient = async (request) => {
    calls.push(request);
    return {
      png: VALID_PNG,
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-06-14T00:00:00.000Z",
        sourceLength: request.source.length,
        durationMs: 1,
      },
    };
  };
  const missingArtifacts: string[] = [];

  const buffer = await renderDocumentBuffer(
    "softwareDesignSpec",
    [
      {
        level: 3,
        title: "报名活动用例实现设计",
        body: [],
        diagramKind: "sequence",
        diagramModelId: "sequence:uc_apply",
      },
      {
        level: 3,
        title: "取消报名用例实现设计",
        body: [],
        diagramKind: "sequence",
        diagramModelId: "sequence:uc_cancel",
      },
    ],
    new Map([
      ["sequence:uc_apply", "@startuml\nparticipant Apply\n@enduml"],
      ["sequence:uc_cancel", "@startuml\nparticipant Cancel\n@enduml"],
    ]),
    new Set(),
    renderPng,
    missingArtifacts,
    { includeTableOfContents: false, autoNumberHeadings: false },
  );

  assert.ok(buffer.byteLength > 0);
  assert.deepEqual(missingArtifacts, []);
  assert.deepEqual(
    calls.map((call) => call.modelId),
    ["sequence:uc_apply", "sequence:uc_cancel"],
  );
  assert.match(calls[0]?.source ?? "", /participant Apply/u);
  assert.match(calls[1]?.source ?? "", /participant Cancel/u);
  assert.ok(
    calls.every((call) =>
      call.source.includes('skinparam defaultFontName "Microsoft YaHei"'),
    ),
  );
});

test("renderDocumentBuffer injects document fonts into WBS diagrams", async () => {
  const calls: Parameters<PngRenderClient>[0][] = [];
  const renderPng: PngRenderClient = async (request) => {
    calls.push(request);
    return {
      png: VALID_PNG,
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-06-14T00:00:00.000Z",
        sourceLength: request.source.length,
        durationMs: 1,
      },
    };
  };

  const buffer = await renderDocumentBuffer(
    "requirementsSpec",
    [
      {
        level: 2,
        title: "功能结构",
        body: [],
        diagramKind: "function",
      },
    ],
    new Map([["function", "@startwbs\n* 系统功能\n@endwbs"]]),
    new Set(),
    renderPng,
    [],
    { includeTableOfContents: false, autoNumberHeadings: false },
  );

  assert.ok(buffer.byteLength > 0);
  assert.match(calls[0]?.source ?? "", /@startwbs\nskinparam defaultFontName/u);
});

test("resolvePngImageTransformation preserves diagram aspect ratios", () => {
  assert.deepEqual(resolvePngImageTransformation(pngHeader(1600, 400)), {
    width: 560,
    height: 140,
  });
  assert.deepEqual(resolvePngImageTransformation(pngHeader(400, 1600)), {
    width: 170,
    height: 680,
  });
  assert.deepEqual(resolvePngImageTransformation(pngHeader(120, 80)), {
    width: 240,
    height: 160,
  });
});
