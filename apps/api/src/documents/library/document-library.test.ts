import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createFileDocumentLibrary } from "./document-library.js";

function decodeJwtPayload(token: string) {
  const [, body] = token.split(".");
  assert.ok(body);
  const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(
    Buffer.from(
      normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="),
      "base64",
    ).toString("utf8"),
  ) as Record<string, unknown>;
}

test("file document library persists generated documents and builds OnlyOffice config", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    await library.authenticateWorkspace({
      workspaceId: "workspace-a",
      workspaceSecret: "workspace-a-secret-value-123456",
    });
    const saved = await library.saveGeneratedDocument({
      workspaceId: "workspace-a",
      documentKind: "requirementsSpec",
      sourceRunId: "run-1",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("docx"),
    });

    assert.equal(saved.title, "需求规格说明书");
    assert.equal(saved.workspaceId, "workspace-a");
    assert.equal(saved.version, 1);
    assert.equal((await library.listDocuments("workspace-a")).length, 1);
    assert.equal(
      (await library.getDocumentBuffer("workspace-a", saved.id))?.toString(),
      "docx",
    );
    assert.equal((await library.listDocuments("workspace-b")).length, 0);

    const second = await library.saveGeneratedDocument({
      workspaceId: "workspace-a",
      documentKind: "requirementsSpec",
      sourceRunId: "run-2",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("docx-2"),
    });
    assert.notEqual(second.id, saved.id);
    assert.equal(second.fileName, "需求规格说明书-2.docx");
    assert.equal(second.version, 1);
    assert.equal((await library.listDocuments("workspace-a")).length, 2);

    const config = library.createOnlyOfficeConfig({
      document: saved,
      documentServerUrl: "http://127.0.0.1:8080/",
      publicBaseUrl: "http://127.0.0.1:4001/",
      accessTokenSecret: "access-secret",
      uiTheme: "theme-classic-light",
      jwtSecret: "secret",
    });
    assert.equal(config.documentServerUrl, "http://127.0.0.1:8080");
    assert.equal(config.config.documentType, "word");
    assert.equal(typeof config.config.token, "string");
    assert.equal(
      (
        config.config.editorConfig as {
          customization: { uiTheme: string };
        }
      ).customization.uiTheme,
      "theme-classic-light",
    );
    assert.equal(
      (
        decodeJwtPayload(config.config.token as string).editorConfig as {
          customization: { uiTheme: string };
        }
      ).customization.uiTheme,
      "theme-classic-light",
    );
    const fileUrl = (config.config.document as { url: string }).url;
    const accessToken = new URL(fileUrl).searchParams.get("accessToken");
    assert.deepEqual(
      library.verifyOnlyOfficeAccessToken({
        documentId: saved.id,
        purpose: "file",
        token: accessToken,
        accessTokenSecret: "access-secret",
      }),
      { workspaceId: "workspace-a" },
    );

    const updated = await library.updateDocumentBuffer(
      "workspace-a",
      saved.id,
      Buffer.from("edited"),
    );
    assert.equal(updated?.version, 2);
    assert.equal(
      (await library.getDocumentBuffer("workspace-a", saved.id))?.toString(),
      "edited",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("file document library rejects mismatched workspace secrets", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    await library.authenticateWorkspace({
      workspaceId: "workspace-a",
      workspaceSecret: "workspace-a-secret-value-123456",
    });
    await assert.rejects(
      () =>
        library.authenticateWorkspace({
          workspaceId: "workspace-a",
          workspaceSecret: "workspace-a-secret-value-changed",
        }),
      /Workspace secret mismatch/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
