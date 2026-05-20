// Exposes generated DOCX files to the web app and OnlyOffice Document Server.
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  documentLibraryListResponseSchema,
  onlyOfficeEditorConfigResponseSchema,
  onlyOfficeUiThemeSchema,
} from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import {
  isWorkspaceAuthError,
  requireDocumentWorkspace,
} from "./document-workspace-auth.js";

function publicBaseUrlForRequest(request: FastifyRequest) {
  const configured = process.env.PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = request.headers.host;
  const protocol =
    typeof request.protocol === "string" ? request.protocol : "http";
  return host ? `${protocol}://${host}` : "http://127.0.0.1:4001";
}

function onlyOfficeCallbackPayload(body: unknown) {
  if (!body || typeof body !== "object") {
    return { status: null, url: null };
  }
  const status = "status" in body ? body.status : null;
  const url = "url" in body ? body.url : null;
  return {
    status: typeof status === "number" ? status : null,
    url: typeof url === "string" ? url : null,
  };
}

function onlyOfficeAccessTokenSecret() {
  return (
    process.env.ONLYOFFICE_ACCESS_TOKEN_SECRET?.trim() ||
    process.env.ONLYOFFICE_JWT_SECRET?.trim() ||
    "uml-platform-dev-onlyoffice-access-secret"
  );
}

function accessTokenFromRequest(request: FastifyRequest) {
  const query = request.query as { accessToken?: unknown };
  return typeof query.accessToken === "string" ? query.accessToken : null;
}

export function registerDocumentRoutes({
  app,
  documentLibrary,
}: {
  app: FastifyInstance;
  documentLibrary: DocumentLibrary;
}) {
  app.get("/api/documents", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    return documentLibraryListResponseSchema.parse({
      documents: await documentLibrary.listDocuments(workspace.workspaceId),
    });
  });

  app.get("/api/documents/:documentId/editor-config", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const { documentId } = request.params as { documentId: string };
    const document = await documentLibrary.getDocument(
      workspace.workspaceId,
      documentId,
    );
    if (!document) {
      reply.code(404);
      return { message: "Document not found" };
    }

    const documentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim();
    if (!documentServerUrl) {
      reply.code(503);
      return { message: "请先配置 ONLYOFFICE_DOCUMENT_SERVER_URL" };
    }
    const rawUiTheme = (request.query as { uiTheme?: unknown }).uiTheme;
    const parsedUiTheme = onlyOfficeUiThemeSchema.safeParse(
      rawUiTheme ?? "theme-dark",
    );
    if (!parsedUiTheme.success) {
      reply.code(400);
      return { message: "Invalid OnlyOffice uiTheme" };
    }
    const uiTheme = parsedUiTheme.data;

    return onlyOfficeEditorConfigResponseSchema.parse(
      documentLibrary.createOnlyOfficeConfig({
        document,
        documentServerUrl,
        publicBaseUrl: publicBaseUrlForRequest(request),
        accessTokenSecret: onlyOfficeAccessTokenSecret(),
        uiTheme,
        jwtSecret: process.env.ONLYOFFICE_JWT_SECRET,
      }),
    );
  });

  app.get("/api/documents/:documentId/file", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const access = documentLibrary.verifyOnlyOfficeAccessToken({
      documentId,
      purpose: "file",
      token: accessTokenFromRequest(request),
      accessTokenSecret: onlyOfficeAccessTokenSecret(),
    });
    if (!access) {
      reply.code(403);
      return { message: "Document access token invalid" };
    }

    const document = await documentLibrary.getDocument(
      access.workspaceId,
      documentId,
    );
    const buffer = await documentLibrary.getDocumentBuffer(
      access.workspaceId,
      documentId,
    );
    if (!document || !buffer) {
      reply.code(404);
      return { message: "Document file not found" };
    }

    reply.header("Content-Type", document.mimeType);
    reply.header(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return buffer;
  });

  app.get("/api/documents/:documentId/download", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const { documentId } = request.params as { documentId: string };
    const document = await documentLibrary.getDocument(
      workspace.workspaceId,
      documentId,
    );
    const buffer = await documentLibrary.getDocumentBuffer(
      workspace.workspaceId,
      documentId,
    );
    if (!document || !buffer) {
      reply.code(404);
      return { message: "Document file not found" };
    }

    reply.header("Content-Type", document.mimeType);
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return buffer;
  });

  app.post("/api/documents/:documentId/onlyoffice/callback", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const access = documentLibrary.verifyOnlyOfficeAccessToken({
      documentId,
      purpose: "callback",
      token: accessTokenFromRequest(request),
      accessTokenSecret: onlyOfficeAccessTokenSecret(),
    });
    if (!access) {
      reply.code(403);
      return { error: 1, message: "Document access token invalid" };
    }

    const { status, url } = onlyOfficeCallbackPayload(request.body);

    if ((status === 2 || status === 6) && url) {
      const response = await fetch(url);
      if (!response.ok) {
        reply.code(502);
        return { error: 1, message: `OnlyOffice save download failed: ${response.status}` };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const updated = await documentLibrary.updateDocumentBuffer(
        access.workspaceId,
        documentId,
        buffer,
      );
      if (!updated) {
        reply.code(404);
        return { error: 1, message: "Document not found" };
      }
    }

    return { error: 0 };
  });
}
