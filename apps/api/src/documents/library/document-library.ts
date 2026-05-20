// Persists generated DOCX files so editor services can load and save them by URL.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  documentLibraryItemSchema,
  onlyOfficeEditorConfigResponseSchema,
  type DocumentKind,
  type DocumentLibraryItem,
  type OnlyOfficeEditorConfigResponse,
  type OnlyOfficeUiTheme,
} from "@uml-platform/contracts";
import { documentTitle } from "../context/document-context.js";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCUMENT_FILE_NAME = "document.docx";
const METADATA_FILE_NAME = "metadata.json";
const WORKSPACE_SECRET_FILE_NAME = "workspace-secret.json";

function fileNameWithDuplicateSuffix(fileName: string, suffix: number) {
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, extensionIndex)}-${suffix}${fileName.slice(
    extensionIndex,
  )}`;
}
const ONLYOFFICE_ACCESS_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export type OnlyOfficeDocumentAccessPurpose = "file" | "callback";

export interface DocumentWorkspaceCredentials {
  workspaceId: string;
  workspaceSecret: string;
}

export interface DocumentLibrary {
  authenticateWorkspace(
    credentials: DocumentWorkspaceCredentials,
  ): Promise<{ workspaceId: string }>;
  listDocuments(workspaceId: string): Promise<DocumentLibraryItem[]>;
  getDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentLibraryItem | null>;
  getDocumentBuffer(workspaceId: string, documentId: string): Promise<Buffer | null>;
  saveGeneratedDocument(input: {
    workspaceId: string;
    documentKind: DocumentKind;
    sourceRunId: string;
    fileName: string;
    mimeType?: string | null;
    buffer: Buffer;
  }): Promise<DocumentLibraryItem>;
  updateDocumentBuffer(
    workspaceId: string,
    documentId: string,
    buffer: Buffer,
  ): Promise<DocumentLibraryItem | null>;
  createOnlyOfficeConfig(input: {
    document: DocumentLibraryItem;
    publicBaseUrl: string;
    documentServerUrl: string;
    accessTokenSecret: string;
    uiTheme?: OnlyOfficeUiTheme;
    jwtSecret?: string;
  }): OnlyOfficeEditorConfigResponse;
  verifyOnlyOfficeAccessToken(input: {
    documentId: string;
    purpose: OnlyOfficeDocumentAccessPurpose;
    token: string | null | undefined;
    accessTokenSecret: string;
  }): { workspaceId: string } | null;
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function safePathSegment(value: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    return null;
  }
  return value;
}

function workspaceFolder(rootDir: string, workspaceId: string) {
  const safeWorkspaceId = safePathSegment(workspaceId);
  if (!safeWorkspaceId) {
    throw new Error("Invalid workspace id");
  }
  return join(rootDir, safeWorkspaceId);
}

function documentFolder(rootDir: string, workspaceId: string, documentId: string) {
  const safeDocumentId = safePathSegment(documentId);
  if (!safeDocumentId) {
    throw new Error("Invalid document id");
  }
  return join(workspaceFolder(rootDir, workspaceId), safeDocumentId);
}

function workspaceSecretPath(rootDir: string, workspaceId: string) {
  return join(workspaceFolder(rootDir, workspaceId), WORKSPACE_SECRET_FILE_NAME);
}

function metadataPath(rootDir: string, workspaceId: string, documentId: string) {
  return join(documentFolder(rootDir, workspaceId, documentId), METADATA_FILE_NAME);
}

function contentPath(rootDir: string, workspaceId: string, documentId: string) {
  return join(documentFolder(rootDir, workspaceId, documentId), DOCUMENT_FILE_NAME);
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(
    normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="),
    "base64",
  ).toString("utf8");
}

function signJwt(payload: unknown, secret: string) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64Url(signature)}`;
}

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function workspaceSecretHash(workspaceId: string, workspaceSecret: string) {
  return hmac(workspaceSecret, `uml-workspace:${workspaceId}`);
}

function createOnlyOfficeAccessToken(input: {
  workspaceId: string;
  documentId: string;
  purpose: OnlyOfficeDocumentAccessPurpose;
  secret: string;
}) {
  const payload = {
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    purpose: input.purpose,
    expiresAt: Date.now() + ONLYOFFICE_ACCESS_TOKEN_TTL_MS,
    nonce: base64Url(randomBytes(12)),
  };
  const body = base64Url(JSON.stringify(payload));
  const signature = hmac(body, input.secret);
  return `${body}.${signature}`;
}

function appendAccessToken(url: string, token: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}accessToken=${encodeURIComponent(token)}`;
}

async function readDocumentMetadata(
  rootDir: string,
  workspaceId: string,
  documentId: string,
) {
  try {
    const raw = await readFile(metadataPath(rootDir, workspaceId, documentId), "utf8");
    return documentLibraryItemSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeDocument(
  rootDir: string,
  item: DocumentLibraryItem,
  buffer: Buffer,
) {
  const folder = documentFolder(rootDir, item.workspaceId, item.id);
  await mkdir(folder, { recursive: true });
  await writeFile(contentPath(rootDir, item.workspaceId, item.id), buffer);
  await writeFile(
    metadataPath(rootDir, item.workspaceId, item.id),
    JSON.stringify(item, null, 2),
  );
}

export function createFileDocumentLibrary(rootDir: string): DocumentLibrary {
  async function authenticateWorkspace(
    credentials: DocumentWorkspaceCredentials,
  ) {
    const workspaceId = credentials.workspaceId.trim();
    const workspaceSecret = credentials.workspaceSecret.trim();
    if (!safePathSegment(workspaceId) || workspaceSecret.length < 24) {
      throw new Error("Invalid workspace credentials");
    }

    const folder = workspaceFolder(rootDir, workspaceId);
    const secretPath = workspaceSecretPath(rootDir, workspaceId);
    const nextHash = workspaceSecretHash(workspaceId, workspaceSecret);
    await mkdir(folder, { recursive: true });

    try {
      const raw = await readFile(secretPath, "utf8");
      const existing = JSON.parse(raw) as { secretHash?: unknown };
      if (
        typeof existing.secretHash !== "string" ||
        !constantTimeEqual(existing.secretHash, nextHash)
      ) {
        throw new Error("Workspace secret mismatch");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Workspace secret mismatch") {
        throw error;
      }
      await writeFile(
        secretPath,
        JSON.stringify({ workspaceId, secretHash: nextHash }, null, 2),
      );
    }

    return { workspaceId };
  }

  async function listDocuments(workspaceId: string) {
    const folder = workspaceFolder(rootDir, workspaceId);
    await mkdir(folder, { recursive: true });
    const entries = await readdir(folder, { withFileTypes: true });
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readDocumentMetadata(rootDir, workspaceId, entry.name)),
    );
    return documents
      .filter((item): item is DocumentLibraryItem => Boolean(item))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function getDocument(workspaceId: string, documentId: string) {
    return readDocumentMetadata(rootDir, workspaceId, documentId);
  }

  async function getDocumentBuffer(workspaceId: string, documentId: string) {
    const document = await getDocument(workspaceId, documentId);
    if (!document) return null;
    try {
      return await readFile(contentPath(rootDir, workspaceId, documentId));
    } catch {
      return null;
    }
  }

  async function saveGeneratedDocument(input: {
    workspaceId: string;
    documentKind: DocumentKind;
    sourceRunId: string;
    fileName: string;
    mimeType?: string | null;
    buffer: Buffer;
  }) {
    const now = new Date().toISOString();
    const existingNames = new Set(
      (await listDocuments(input.workspaceId)).map((document) => document.fileName),
    );
    let fileName = input.fileName;
    for (let suffix = 2; existingNames.has(fileName); suffix += 1) {
      fileName = fileNameWithDuplicateSuffix(input.fileName, suffix);
    }
    const item = documentLibraryItemSchema.parse({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      documentKind: input.documentKind,
      title: documentTitle(input.documentKind),
      fileName,
      mimeType: input.mimeType ?? DOCX_MIME_TYPE,
      byteLength: input.buffer.byteLength,
      version: 1,
      sourceRunId: input.sourceRunId,
      createdAt: now,
      updatedAt: now,
    });
    await writeDocument(rootDir, item, input.buffer);
    return item;
  }

  async function updateDocumentBuffer(
    workspaceId: string,
    documentId: string,
    buffer: Buffer,
  ) {
    const existing = await getDocument(workspaceId, documentId);
    if (!existing) return null;
    const item = documentLibraryItemSchema.parse({
      ...existing,
      byteLength: buffer.byteLength,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await writeDocument(rootDir, item, buffer);
    return item;
  }

  function verifyOnlyOfficeAccessToken(input: {
    documentId: string;
    purpose: OnlyOfficeDocumentAccessPurpose;
    token: string | null | undefined;
    accessTokenSecret: string;
  }) {
    if (!input.token) return null;
    const [body, signature] = input.token.split(".");
    if (!body || !signature) return null;
    if (!constantTimeEqual(hmac(body, input.accessTokenSecret), signature)) {
      return null;
    }

    try {
      const payload = JSON.parse(base64UrlDecode(body)) as {
        workspaceId?: unknown;
        documentId?: unknown;
        purpose?: unknown;
        expiresAt?: unknown;
      };
      if (
        typeof payload.workspaceId !== "string" ||
        typeof payload.documentId !== "string" ||
        typeof payload.purpose !== "string" ||
        typeof payload.expiresAt !== "number" ||
        payload.documentId !== input.documentId ||
        payload.purpose !== input.purpose ||
        payload.expiresAt < Date.now() ||
        !safePathSegment(payload.workspaceId)
      ) {
        return null;
      }
      return { workspaceId: payload.workspaceId };
    } catch {
      return null;
    }
  }

  function createOnlyOfficeConfig(input: {
    document: DocumentLibraryItem;
    publicBaseUrl: string;
    documentServerUrl: string;
    accessTokenSecret: string;
    uiTheme?: OnlyOfficeUiTheme;
    jwtSecret?: string;
  }) {
    const publicBaseUrl = normalizeBaseUrl(input.publicBaseUrl);
    const fileUrl = `${publicBaseUrl}/api/documents/${input.document.id}/file`;
    const callbackUrl = `${publicBaseUrl}/api/documents/${input.document.id}/onlyoffice/callback`;
    const config = {
      documentType: "word",
      document: {
        fileType: "docx",
        key: `${input.document.id}-v${input.document.version}`,
        title: input.document.fileName,
        url: appendAccessToken(
          fileUrl,
          createOnlyOfficeAccessToken({
            workspaceId: input.document.workspaceId,
            documentId: input.document.id,
            purpose: "file",
            secret: input.accessTokenSecret,
          }),
        ),
        permissions: {
          download: true,
          edit: true,
          print: true,
        },
      },
      editorConfig: {
        callbackUrl: appendAccessToken(
          callbackUrl,
          createOnlyOfficeAccessToken({
            workspaceId: input.document.workspaceId,
            documentId: input.document.id,
            purpose: "callback",
            secret: input.accessTokenSecret,
          }),
        ),
        lang: "zh-CN",
        mode: "edit",
        customization: {
          uiTheme: input.uiTheme ?? "theme-dark",
        },
        user: {
          id: "uml-platform-user",
          name: "UML 用户",
        },
      },
    };
    const signedConfig = input.jwtSecret
      ? { ...config, token: signJwt(config, input.jwtSecret) }
      : config;
    return onlyOfficeEditorConfigResponseSchema.parse({
      document: input.document,
      documentServerUrl: normalizeBaseUrl(input.documentServerUrl),
      config: signedConfig,
    });
  }

  return {
    authenticateWorkspace,
    listDocuments,
    getDocument,
    getDocumentBuffer,
    saveGeneratedDocument,
    updateDocumentBuffer,
    createOnlyOfficeConfig,
    verifyOnlyOfficeAccessToken,
  };
}
