// Handles admin document visibility, download, and restore workflows for route callers.
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { DocumentLibrary } from "../documents/library/document-library.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import type { AdminActor } from "../security/admin-guard.js";
import {
  hasFullProjectScope,
  visibleProjectsForAdmin,
} from "./academic-scope.js";
import { actorLabel } from "./admin-route-presenters.js";
import { recordAdminAction } from "./admin-route-security.js";

type VisibleProjectIds = Set<string> | null;

function canSeeDocument(
  document: { projectId?: string | null },
  visibleProjectIds: VisibleProjectIds,
) {
  return (
    visibleProjectIds === null ||
    (document.projectId && visibleProjectIds.has(document.projectId))
  );
}

export async function resolveAdminDocumentProjectScope({
  academicStore,
  authStore,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
}): Promise<VisibleProjectIds> {
  if (hasFullProjectScope(actor)) return null;
  return new Set(
    (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
      (project) => project.id,
    ),
  );
}

export async function listVisibleAdminDocuments({
  documentLibrary,
  visibleProjectIds,
}: {
  documentLibrary: DocumentLibrary;
  visibleProjectIds: VisibleProjectIds;
}) {
  return (await documentLibrary.listAllDocuments()).filter((document) =>
    canSeeDocument(document, visibleProjectIds),
  );
}

export async function buildAdminDocumentListView({
  documentLibrary,
  visibleProjectIds,
}: {
  documentLibrary: DocumentLibrary;
  visibleProjectIds: VisibleProjectIds;
}) {
  return {
    generatedAt: new Date().toISOString(),
    documents: await listVisibleAdminDocuments({
      documentLibrary,
      visibleProjectIds,
    }),
  };
}

export async function downloadAdminDocument({
  authStore,
  documentLibrary,
  actor,
  documentId,
  visibleProjectIds,
}: {
  authStore: AuthStore;
  documentLibrary: DocumentLibrary;
  actor: AdminActor;
  documentId: string;
  visibleProjectIds: VisibleProjectIds;
}) {
  const action = "admin.document.download";
  const document = (await documentLibrary.listAllDocuments()).find(
    (item) => item.id === documentId,
  );
  if (!document) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "document",
      targetId: documentId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} failed to download missing document (${documentId})`,
    });
    return { statusCode: 404, body: { message: "Document not found" } } as const;
  }

  if (!canSeeDocument(document, visibleProjectIds)) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "document",
      targetId: documentId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} was denied document download ${document.fileName} (${documentId}) outside their project scope`,
    });
    return {
      statusCode: 403,
      body: { message: "Document is outside admin data scope" },
    } as const;
  }

  const buffer = await documentLibrary.getDocumentBuffer(
    document.workspaceId,
    documentId,
  );
  if (!buffer) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "document",
      targetId: documentId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} failed to download missing document file ${document.fileName} (${documentId}) from workspace ${document.workspaceId}`,
    });
    return { statusCode: 404, body: { message: "Document file not found" } } as const;
  }

  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "document",
    targetId: documentId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} downloaded document ${document.fileName} (${documentId}) from workspace ${document.workspaceId}`,
  });

  return {
    statusCode: 200,
    buffer,
    contentType: document.mimeType,
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
  } as const;
}

export async function restoreAdminDocument({
  authStore,
  documentLibrary,
  actor,
  documentId,
}: {
  authStore: AuthStore;
  documentLibrary: DocumentLibrary;
  actor: AdminActor;
  documentId: string;
}) {
  const action = "admin.document.restore";
  const document = (
    await documentLibrary.listAllDocuments({ includeDeleted: true })
  ).find((item) => item.id === documentId);
  if (!document) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "document",
      targetId: documentId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} failed to restore missing document (${documentId})`,
    });
    return { statusCode: 404, body: { message: "Document not found" } } as const;
  }

  const restored = await documentLibrary.restoreDocument(
    document.workspaceId,
    documentId,
  );
  if (!restored) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "document",
      targetId: documentId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} failed to restore document (${documentId}) from workspace ${document.workspaceId}`,
    });
    return { statusCode: 404, body: { message: "Document not found" } } as const;
  }

  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "document",
    targetId: documentId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} restored document ${restored.fileName} (${documentId}) from workspace ${restored.workspaceId}`,
  });
  return { statusCode: 200, body: { document: restored } } as const;
}
