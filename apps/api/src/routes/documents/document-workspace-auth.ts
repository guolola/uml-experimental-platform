// Resolves anonymous document workspace credentials from API request headers.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DocumentLibrary } from "../../documents/library/document-library.js";

const WORKSPACE_ID_HEADER = "x-uml-workspace-id";
const WORKSPACE_SECRET_HEADER = "x-uml-workspace-secret";

function stringHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function requireDocumentWorkspace(
  request: FastifyRequest,
  reply: FastifyReply,
  documentLibrary: DocumentLibrary,
) {
  const workspaceId = stringHeader(request.headers[WORKSPACE_ID_HEADER]);
  const workspaceSecret = stringHeader(request.headers[WORKSPACE_SECRET_HEADER]);

  if (!workspaceId || !workspaceSecret) {
    reply.code(401);
    return { error: { message: "缺少说明书工作区凭据" } } as const;
  }

  try {
    return await documentLibrary.authenticateWorkspace({
      workspaceId,
      workspaceSecret,
    });
  } catch {
    reply.code(403);
    return { error: { message: "说明书工作区凭据无效" } } as const;
  }
}

export function isWorkspaceAuthError(
  value: unknown,
): value is { error: { message: string } } {
  return Boolean(value && typeof value === "object" && "error" in value);
}
