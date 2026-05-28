// Exposes generated DOCX files to the web app and OnlyOffice Document Server.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  documentLibraryListResponseSchema,
  documentLibraryItemSchema,
  documentLibraryVersionsResponseSchema,
  onlyOfficeEditorConfigResponseSchema,
  onlyOfficeUiThemeSchema,
  type ProjectPermission,
} from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import {
  documentProjectContextFromRequest,
  isWorkspaceAuthError,
  requireDocumentWorkspace,
  type DocumentProjectContext,
  type DocumentProjectMembershipGuard,
  type DocumentUserResolver,
} from "./document-workspace-auth.js";
import type { DocumentLibraryItem } from "@uml-platform/contracts";

export type DocumentAuditLogRecorder = (event: {
  actorUserId: string | null;
  action: string;
  targetType: "document";
  targetId: string | null;
  outcome: "success" | "failure";
  message: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown> | unknown;

export type DocumentRiskEventRecorder = (event: {
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  actorUserId: string | null;
  projectId: string | null;
  targetType: "document";
  targetId: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown> | unknown;

const documentRenameRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine((value) => !/[\\/]/.test(value), {
      message: "Document fileName must not contain path separators",
    }),
});

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

function isAllowedOnlyOfficeDownloadUrl(rawUrl: string) {
  const documentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim();
  if (!documentServerUrl) return false;

  try {
    const candidate = new URL(rawUrl);
    const documentServer = new URL(documentServerUrl);
    return (
      (candidate.protocol === "https:" || candidate.protocol === "http:") &&
      candidate.origin === documentServer.origin
    );
  } catch {
    return false;
  }
}

function accessTokenFromRequest(request: FastifyRequest) {
  const query = request.query as { accessToken?: unknown };
  return typeof query.accessToken === "string" ? query.accessToken : null;
}

function headerString(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function onlyOfficeCallbackMaxBytes() {
  const configured = Number(process.env.ONLYOFFICE_CALLBACK_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 50 * 1024 * 1024;
}

function responseContentLength(response: Response) {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function projectContextFromPath(
  request: FastifyRequest,
  projectId: string,
  permission: ProjectPermission,
  resolveUserId?: DocumentUserResolver,
) {
  const userId = resolveUserId
    ? await resolveUserId(request)
    : headerString(request, "x-uml-user-id");
  if (!userId) return "missing-project-context" as const;
  return { projectId, userId, permission };
}

async function requireProjectMembership(
  request: FastifyRequest,
  reply: FastifyReply,
  projectMembershipGuard: DocumentProjectMembershipGuard | undefined,
  context: DocumentProjectContext,
) {
  if (!projectMembershipGuard) {
    reply.code(403);
    return { error: { message: "缺少项目权限校验能力" } } as const;
  }
  if (!(await projectMembershipGuard(context, request))) {
    reply.code(403);
    return { error: { message: "无权访问该项目说明书" } } as const;
  }
  return context;
}

async function requireProjectAccessForDocument({
  request,
  reply,
  document,
  projectMembershipGuard,
  permission,
  resolveUserId,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  document: DocumentLibraryItem;
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  permission: ProjectPermission;
  resolveUserId?: DocumentUserResolver;
}) {
  const requestContext = await documentProjectContextFromRequest(
    request,
    permission,
    resolveUserId,
  );
  if (requestContext === "missing-project-context") {
    reply.code(401);
    return { error: { message: "缺少项目访问凭据" } } as const;
  }

  const documentProjectId = document.projectId ?? null;
  if (!requestContext) {
    reply.code(401);
    return { error: { message: "缺少项目访问凭据" } } as const;
  }
  if (documentProjectId && requestContext.projectId !== documentProjectId) {
    reply.code(403);
    return { error: { message: "说明书不属于当前项目" } } as const;
  }

  return requireProjectMembership(
    request,
    reply,
    projectMembershipGuard,
    requestContext,
  );
}

function isProjectAccessError(
  value: unknown,
): value is { error: { message: string } } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

async function requireProjectAccessFromToken({
  request,
  reply,
  document,
  access,
  projectMembershipGuard,
  permission,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  document: DocumentLibraryItem;
  access: { projectId: string | null; userId: string | null };
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  permission: ProjectPermission;
}) {
  const documentProjectId = document.projectId ?? null;
  if (!documentProjectId) return null;
  if (access.projectId !== documentProjectId || !access.userId) {
    reply.code(403);
    return { error: { message: "Document access token project context invalid" } } as const;
  }
  return requireProjectMembership(
    request,
    reply,
    projectMembershipGuard,
    { projectId: access.projectId, userId: access.userId, permission },
  );
}

async function requireProjectAccessFromPath({
  request,
  reply,
  projectId,
  projectMembershipGuard,
  permission,
  resolveUserId,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  projectId: string;
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  permission: ProjectPermission;
  resolveUserId?: DocumentUserResolver;
}) {
  const context = await projectContextFromPath(
    request,
    projectId,
    permission,
    resolveUserId,
  );
  if (context === "missing-project-context") {
    reply.code(401);
    return { error: { message: "缺少项目访问凭据" } } as const;
  }
  return requireProjectMembership(
    request,
    reply,
    projectMembershipGuard,
    context,
  );
}

export function registerDocumentRoutes({
  app,
  documentLibrary,
  projectMembershipGuard,
  resolveUserId,
  recordAuditLog,
  recordRiskEvent,
  allowLegacyWorkspaceRoutes = false,
}: {
  app: FastifyInstance;
  documentLibrary: DocumentLibrary;
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  resolveUserId?: DocumentUserResolver;
  recordAuditLog?: DocumentAuditLogRecorder;
  recordRiskEvent?: DocumentRiskEventRecorder;
  allowLegacyWorkspaceRoutes?: boolean;
}) {
  async function auditDocument(input: {
    actorUserId?: string | null;
    action: string;
    documentId?: string | null;
    outcome: "success" | "failure";
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    await recordAuditLog?.({
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: "document",
      targetId: input.documentId ?? null,
      outcome: input.outcome,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async function recordDocumentRisk(input: {
    eventType: string;
    severity: "low" | "medium" | "high" | "critical";
    actorUserId?: string | null;
    projectId?: string | null;
    documentId?: string | null;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    await recordRiskEvent?.({
      eventType: input.eventType,
      severity: input.severity,
      actorUserId: input.actorUserId ?? null,
      projectId: input.projectId ?? null,
      targetType: "document",
      targetId: input.documentId ?? null,
      message: input.message,
      metadata: input.metadata,
    });
  }

  const legacyWorkspaceRoutesDeprecated = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(410);
    return {
      message:
        "Legacy document workspace routes are disabled; use project-scoped document routes.",
    };
  };

  if (!allowLegacyWorkspaceRoutes) {
    app.get("/api/documents", legacyWorkspaceRoutesDeprecated);
    app.get("/api/documents/:documentId/editor-config", legacyWorkspaceRoutesDeprecated);
    app.get("/api/documents/:documentId/download", legacyWorkspaceRoutesDeprecated);
    app.patch("/api/documents/:documentId", legacyWorkspaceRoutesDeprecated);
    app.delete("/api/documents/:documentId", legacyWorkspaceRoutesDeprecated);
  }

  if (allowLegacyWorkspaceRoutes) {
  app.get("/api/documents", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const projectContext = await documentProjectContextFromRequest(
      request,
      "view_documents",
      resolveUserId,
    );
    if (projectContext === "missing-project-context") {
      reply.code(401);
      return { error: { message: "缺少项目访问凭据" } };
    }
    if (!projectContext) {
      reply.code(401);
      return { error: { message: "请先登录并进入项目" } };
    }
    if (projectContext) {
      const projectAccess = await requireProjectMembership(
        request,
        reply,
        projectMembershipGuard,
        projectContext,
      );
      if (isProjectAccessError(projectAccess)) return projectAccess;
    }

    await auditDocument({
      actorUserId: projectContext?.userId ?? null,
      action: "document.list",
      outcome: "success",
      message: projectContext
        ? `Listed documents for project ${projectContext.projectId}`
        : `Listed documents for workspace ${workspace.workspaceId}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: projectContext?.projectId ?? null,
      },
    });
    return documentLibraryListResponseSchema.parse({
      documents: await documentLibrary.listDocuments(workspace.workspaceId, {
        projectId: projectContext ? projectContext.projectId : null,
      }),
    });
  });
  }

  async function auditDocumentBestEffort(
    request: FastifyRequest,
    input: Parameters<typeof auditDocument>[0],
  ) {
    try {
      await auditDocument(input);
    } catch (error) {
      request.log.warn(
        {
          operation: "document.audit_best_effort_failed",
          action: input.action,
          documentId: input.documentId ?? null,
          err: error,
        },
        "document audit logging failed after access was authorized",
      );
    }
  }

  app.get("/api/projects/:projectId/documents", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const projectAccess = await requireProjectAccessFromPath({
      request,
      reply,
      projectId,
      projectMembershipGuard,
      permission: "view_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    await auditDocument({
      actorUserId: projectAccess.userId,
      action: "document.list",
      outcome: "success",
      message: `Listed documents for project ${projectId}`,
      metadata: { projectId },
    });
    return documentLibraryListResponseSchema.parse({
      documents: await documentLibrary.listAllDocuments({ projectId }),
    });
  });

  async function projectDocumentFromRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    options?: { includeDeleted?: boolean },
  ) {
    const { projectId, documentId } = request.params as {
      projectId: string;
      documentId: string;
    };
    const documents = await documentLibrary.listAllDocuments({
      includeDeleted: true,
    });
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      reply.code(404);
      return { error: { message: "Document not found" } } as const;
    }
    if ((document.projectId ?? null) !== projectId) {
      reply.code(403);
      return { error: { message: "说明书不属于当前项目" } } as const;
    }
    if (!options?.includeDeleted && document.status === "deleted") {
      reply.code(404);
      return { error: { message: "Document not found" } } as const;
    }
    return document;
  }

  app.get(
    "/api/projects/:projectId/documents/:documentId/download",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "view_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply);
      if (isProjectAccessError(document)) return document;
      const buffer = await documentLibrary.getDocumentBuffer(
        document.workspaceId,
        documentId,
      );
      if (!buffer) {
        reply.code(404);
        return { message: "Document file not found" };
      }
      request.log.info(
        {
          operation: "document.project_download",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document download requested",
      );
      await auditDocumentBestEffort(request, {
        actorUserId: projectAccess.userId,
        action: "document.download",
        documentId,
        outcome: "success",
        message: `Downloaded document ${document.fileName} for project ${projectId}`,
        metadata: {
          workspaceId: document.workspaceId,
          projectId,
          byteLength: document.byteLength,
        },
      });

      reply.header("Content-Type", document.mimeType);
      reply.header("Content-Length", String(buffer.byteLength));
      reply.header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      );
      return buffer;
    },
  );

  app.get(
    "/api/projects/:projectId/documents/:documentId/editor-config",
    async (request, reply) => {
      const { projectId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "manage_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply);
      if (isProjectAccessError(document)) return document;

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

      return onlyOfficeEditorConfigResponseSchema.parse(
        documentLibrary.createOnlyOfficeConfig({
          document,
          documentServerUrl,
          publicBaseUrl: publicBaseUrlForRequest(request),
          accessTokenSecret: onlyOfficeAccessTokenSecret(),
          userId: projectAccess.userId,
          uiTheme: parsedUiTheme.data,
          jwtSecret: process.env.ONLYOFFICE_JWT_SECRET,
        }),
      );
    },
  );

  app.get(
    "/api/projects/:projectId/documents/:documentId/versions",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "view_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply, {
        includeDeleted: true,
      });
      if (isProjectAccessError(document)) return document;
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.versions",
        documentId,
        outcome: "success",
        message: `Listed versions for document ${documentId}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      return documentLibraryVersionsResponseSchema.parse({
        versions: await documentLibrary.listDocumentVersions(
          document.workspaceId,
          documentId,
        ),
      });
    },
  );

  app.patch(
    "/api/projects/:projectId/documents/:documentId",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "manage_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply);
      if (isProjectAccessError(document)) return document;
      const input = documentRenameRequestSchema.parse(request.body);
      const updated = await documentLibrary.renameDocument(
        document.workspaceId,
        documentId,
        input.fileName,
      );
      if (!updated) {
        reply.code(404);
        return { message: "Document not found" };
      }
      request.log.info(
        {
          operation: "document.project_rename",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document renamed",
      );
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.rename",
        documentId,
        outcome: "success",
        message: `Renamed document ${documentId} to ${updated.fileName}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      return { document: documentLibraryItemSchema.parse(updated) };
    },
  );

  app.delete(
    "/api/projects/:projectId/documents/:documentId",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "manage_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply);
      if (isProjectAccessError(document)) return document;
      const deleted = await documentLibrary.deleteDocument(
        document.workspaceId,
        documentId,
      );
      if (!deleted) {
        reply.code(404);
        return { message: "Document not found" };
      }
      request.log.info(
        {
          operation: "document.project_delete",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document deleted",
      );
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.delete",
        documentId,
        outcome: "success",
        message: `Deleted document ${documentId}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      reply.code(204);
      return null;
    },
  );

  app.post(
    "/api/projects/:projectId/documents/:documentId/restore",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "manage_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply, {
        includeDeleted: true,
      });
      if (isProjectAccessError(document)) return document;
      const restored = await documentLibrary.restoreDocument(
        document.workspaceId,
        documentId,
      );
      if (!restored) {
        reply.code(404);
        return { message: "Document not found" };
      }
      request.log.info(
        {
          operation: "document.project_restore",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document restored",
      );
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.restore",
        documentId,
        outcome: "success",
        message: `Restored document ${documentId}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      return { document: documentLibraryItemSchema.parse(restored) };
    },
  );

  if (allowLegacyWorkspaceRoutes) {
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
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "manage_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

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
        userId: projectAccess?.userId,
        uiTheme,
        jwtSecret: process.env.ONLYOFFICE_JWT_SECRET,
      }),
    );
  });
  }

  app.get("/api/documents/:documentId/file", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const access = documentLibrary.verifyOnlyOfficeAccessToken({
      documentId,
      purpose: "file",
      token: accessTokenFromRequest(request),
      accessTokenSecret: onlyOfficeAccessTokenSecret(),
    });
    if (!access) {
      await auditDocument({
        action: "document.file_access",
        documentId,
        outcome: "failure",
        message: "Document file access token invalid",
      });
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
    const projectAccess = await requireProjectAccessFromToken({
      request,
      reply,
      document,
      access,
      projectMembershipGuard,
      permission: "manage_documents",
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    await auditDocument({
      actorUserId: projectAccess?.userId ?? access.userId,
      action: "document.file_access",
      documentId,
      outcome: "success",
      message: `OnlyOffice file URL accessed document ${documentId}`,
      metadata: {
        workspaceId: access.workspaceId,
        projectId: document.projectId ?? null,
      },
    });
    reply.header("Content-Type", document.mimeType);
    reply.header(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return buffer;
  });

  if (allowLegacyWorkspaceRoutes) {
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
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "view_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;
    request.log.info(
      {
        operation: "document.download",
        documentId,
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
        userId: projectAccess?.userId ?? null,
      },
      "document download requested",
    );
    await auditDocumentBestEffort(request, {
      actorUserId: projectAccess?.userId ?? null,
      action: "document.download",
      documentId,
      outcome: "success",
      message: `Downloaded document ${document.fileName}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
        byteLength: document.byteLength,
      },
    });

    reply.header("Content-Type", document.mimeType);
    reply.header("Content-Length", String(buffer.byteLength));
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return buffer;
  });
  }

  if (allowLegacyWorkspaceRoutes) {
  app.patch("/api/documents/:documentId", async (request, reply) => {
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
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "manage_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    const input = documentRenameRequestSchema.parse(request.body);
    const updated = await documentLibrary.renameDocument(
      workspace.workspaceId,
      documentId,
      input.fileName,
    );
    if (!updated) {
      reply.code(404);
      return { message: "Document not found" };
    }
    request.log.info(
      {
        operation: "document.rename",
        documentId,
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
        userId: projectAccess?.userId ?? null,
      },
      "document renamed",
    );
    await auditDocument({
      actorUserId: projectAccess?.userId ?? null,
      action: "document.rename",
      documentId,
      outcome: "success",
      message: `Renamed document ${documentId} to ${updated.fileName}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
      },
    });

    return { document: documentLibraryItemSchema.parse(updated) };
  });
  }

  if (allowLegacyWorkspaceRoutes) {
  app.delete("/api/documents/:documentId", async (request, reply) => {
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
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "manage_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    const deleted = await documentLibrary.deleteDocument(
      workspace.workspaceId,
      documentId,
    );
    if (!deleted) {
      reply.code(404);
      return { message: "Document not found" };
    }
    request.log.info(
      {
        operation: "document.delete",
        documentId,
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
        userId: projectAccess?.userId ?? null,
      },
      "document deleted",
    );
    await auditDocument({
      actorUserId: projectAccess?.userId ?? null,
      action: "document.delete",
      documentId,
      outcome: "success",
      message: `Deleted document ${documentId}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
      },
    });

    reply.code(204);
    return null;
  });
  }

  app.post("/api/documents/:documentId/onlyoffice/callback", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const access = documentLibrary.verifyOnlyOfficeAccessToken({
      documentId,
      purpose: "callback",
      token: accessTokenFromRequest(request),
      accessTokenSecret: onlyOfficeAccessTokenSecret(),
    });
    if (!access) {
      await auditDocument({
        action: "document.onlyoffice_callback",
        documentId,
        outcome: "failure",
        message: "OnlyOffice callback access token invalid",
      });
      await recordDocumentRisk({
        eventType: "document.onlyoffice_callback_invalid_token",
        severity: "high",
        documentId,
        message: "OnlyOffice callback access token invalid",
      });
      reply.code(403);
      return { error: 1, message: "Document access token invalid" };
    }

    const document = await documentLibrary.getDocument(
      access.workspaceId,
      documentId,
    );
    if (!document) {
      await auditDocument({
        actorUserId: access.userId,
        action: "document.onlyoffice_callback",
        documentId,
        outcome: "failure",
        message: "OnlyOffice callback document not found",
        metadata: { workspaceId: access.workspaceId },
      });
      reply.code(404);
      return { error: 1, message: "Document not found" };
    }
    const projectAccess = await requireProjectAccessFromToken({
      request,
      reply,
      document,
      access,
      projectMembershipGuard,
      permission: "manage_documents",
    });
    if (isProjectAccessError(projectAccess)) {
      await auditDocument({
        actorUserId: access.userId,
        action: "document.onlyoffice_callback",
        documentId,
        outcome: "failure",
        message: projectAccess.error.message,
        metadata: {
          workspaceId: access.workspaceId,
          projectId: document.projectId ?? null,
        },
      });
      await recordDocumentRisk({
        eventType: "document.onlyoffice_callback_permission_denied",
        severity: "high",
        actorUserId: access.userId,
        projectId: document.projectId ?? null,
        documentId,
        message: projectAccess.error.message,
      });
      return { error: 1, message: projectAccess.error.message };
    }

    const { status, url } = onlyOfficeCallbackPayload(request.body);

    if ((status === 2 || status === 6) && url) {
      if (!isAllowedOnlyOfficeDownloadUrl(url)) {
        await auditDocument({
          actorUserId: projectAccess?.userId ?? access.userId,
          action: "document.onlyoffice_callback",
          documentId,
          outcome: "failure",
          message: "OnlyOffice save URL origin is not allowed",
          metadata: { workspaceId: access.workspaceId, projectId: document.projectId ?? null, url },
        });
        await recordDocumentRisk({
          eventType: "document.onlyoffice_callback_untrusted_origin",
          severity: "high",
          actorUserId: projectAccess?.userId ?? access.userId,
          projectId: document.projectId ?? null,
          documentId,
          message: "OnlyOffice save URL origin is not allowed",
          metadata: { url },
        });
        reply.code(403);
        return { error: 1, message: "OnlyOffice save URL origin is not allowed" };
      }
      const response = await fetch(url);
      if (!response.ok) {
        await auditDocument({
          actorUserId: projectAccess?.userId ?? access.userId,
          action: "document.onlyoffice_callback",
          documentId,
          outcome: "failure",
          message: `OnlyOffice save download failed: ${response.status}`,
          metadata: { workspaceId: access.workspaceId, projectId: document.projectId ?? null },
        });
        reply.code(502);
        return { error: 1, message: `OnlyOffice save download failed: ${response.status}` };
      }
      const maxBytes = onlyOfficeCallbackMaxBytes();
      const declaredLength = responseContentLength(response);
      if (declaredLength !== null && declaredLength > maxBytes) {
        await auditDocument({
          actorUserId: projectAccess?.userId ?? access.userId,
          action: "document.onlyoffice_callback",
          documentId,
          outcome: "failure",
          message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
          metadata: {
            workspaceId: access.workspaceId,
            projectId: document.projectId ?? null,
            declaredLength,
            maxBytes,
          },
        });
        await recordDocumentRisk({
          eventType: "document.onlyoffice_callback_oversized",
          severity: "high",
          actorUserId: projectAccess?.userId ?? access.userId,
          projectId: document.projectId ?? null,
          documentId,
          message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
          metadata: { declaredLength, maxBytes },
        });
        reply.code(413);
        return { error: 1, message: "OnlyOffice save download is too large" };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > maxBytes) {
        await auditDocument({
          actorUserId: projectAccess?.userId ?? access.userId,
          action: "document.onlyoffice_callback",
          documentId,
          outcome: "failure",
          message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
          metadata: {
            workspaceId: access.workspaceId,
            projectId: document.projectId ?? null,
            byteLength: buffer.byteLength,
            maxBytes,
          },
        });
        await recordDocumentRisk({
          eventType: "document.onlyoffice_callback_oversized",
          severity: "high",
          actorUserId: projectAccess?.userId ?? access.userId,
          projectId: document.projectId ?? null,
          documentId,
          message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
          metadata: { byteLength: buffer.byteLength, maxBytes },
        });
        reply.code(413);
        return { error: 1, message: "OnlyOffice save download is too large" };
      }
      const updated = await documentLibrary.updateDocumentBuffer(
        access.workspaceId,
        documentId,
        buffer,
      );
      if (!updated) {
        await auditDocument({
          actorUserId: projectAccess?.userId ?? access.userId,
          action: "document.onlyoffice_callback",
          documentId,
          outcome: "failure",
          message: "Document not found during OnlyOffice save",
          metadata: { workspaceId: access.workspaceId, projectId: document.projectId ?? null },
        });
        reply.code(404);
        return { error: 1, message: "Document not found" };
      }
      request.log.info(
        {
          operation: "document.onlyoffice_callback_save",
          documentId,
          workspaceId: access.workspaceId,
          projectId: document.projectId ?? null,
          userId: projectAccess?.userId ?? null,
          status,
        },
        "OnlyOffice document save callback accepted",
      );
      await auditDocument({
        actorUserId: projectAccess?.userId ?? access.userId,
        action: "document.onlyoffice_callback",
        documentId,
        outcome: "success",
        message: `OnlyOffice save callback updated document ${documentId}`,
        metadata: {
          workspaceId: access.workspaceId,
          projectId: document.projectId ?? null,
          status,
          byteLength: updated.byteLength,
        },
      });
    }

    return { error: 0 };
  });
}
