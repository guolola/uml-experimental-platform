// Registers public read and admin configuration routes for system notices.
import type { FastifyInstance } from "fastify";
import {
  systemNoticeCreateRequestSchema,
  systemNoticeDtoSchema,
  systemNoticeListResponseSchema,
  systemNoticeReadRequestSchema,
  systemNoticeUpdateRequestSchema,
} from "@uml-platform/contracts";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { requireAdminPermission } from "../../security/admin-guard.js";
import type {
  SystemNoticeRecord,
  SystemNoticeStore,
} from "../../system-notices/records/system-notice-store.js";

function noticeDto(
  notice: SystemNoticeRecord,
  readIds?: Set<string>,
) {
  return systemNoticeDtoSchema.parse({
    ...notice,
    unread: readIds ? !readIds.has(notice.id) : undefined,
  });
}

function noticeListResponse({
  notices,
  readIds,
}: {
  notices: SystemNoticeRecord[];
  readIds?: Set<string>;
}) {
  const dtoNotices = notices.map((notice) => noticeDto(notice, readIds));
  return systemNoticeListResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    notices: dtoNotices,
    unreadCount: readIds
      ? dtoNotices.filter((notice) => notice.unread).length
      : 0,
  });
}

async function recordSystemNoticeAudit(
  authStore: AuthStore,
  input: {
    actorUserId: string;
    action: string;
    targetId: string | null;
    outcome: "success" | "failure";
    message: string;
  },
) {
  await authStore.recordAuditLog({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: "system_notice",
    targetId: input.targetId,
    outcome: input.outcome,
    message: input.message,
  });
}

export function registerSystemNoticeRoutes({
  app,
  authStore,
  systemNotices,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  systemNotices: SystemNoticeStore;
}) {
  app.get("/api/system-notices", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const [notices, readIds] = await Promise.all([
      systemNotices.listPublished(),
      systemNotices.listReadNoticeIds(auth.user.id),
    ]);
    return noticeListResponse({ notices, readIds });
  });

  app.post("/api/system-notices/read", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const input = systemNoticeReadRequestSchema.parse(request.body ?? {});
    const published = await systemNotices.listPublished();
    const publishedIds = new Set(published.map((notice) => notice.id));
    const noticeIds =
      input.noticeIds && input.noticeIds.length > 0
        ? input.noticeIds.filter((id) => publishedIds.has(id))
        : [...publishedIds];
    await systemNotices.markRead(auth.user.id, noticeIds);
    const readIds = await systemNotices.listReadNoticeIds(auth.user.id);
    return noticeListResponse({ notices: published, readIds });
  });

  app.get("/api/admin/system-notices", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_notices.read",
    );
    if ("message" in actor) return actor;

    return noticeListResponse({ notices: await systemNotices.listAll() });
  });

  app.post("/api/admin/system-notices", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_notices.write",
    );
    if ("message" in actor) return actor;
    const input = systemNoticeCreateRequestSchema.parse(request.body);
    const notice = await systemNotices.create(input);
    // Admin writes cross the route -> store boundary and must be auditable.
    await recordSystemNoticeAudit(authStore, {
      actorUserId: actor.id,
      action: "admin.system_notice.create",
      targetId: notice.id,
      outcome: "success",
      message: `Created system notice ${notice.title}`,
    });
    reply.code(201);
    return { notice: noticeDto(notice) };
  });

  app.patch("/api/admin/system-notices/:id", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_notices.write",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const input = systemNoticeUpdateRequestSchema.parse(request.body);
    const notice = await systemNotices.update(id, input);
    if (!notice) {
      await recordSystemNoticeAudit(authStore, {
        actorUserId: actor.id,
        action: "admin.system_notice.update",
        targetId: id,
        outcome: "failure",
        message: `Failed to update missing system notice ${id}`,
      });
      reply.code(404);
      return { message: "System notice not found" };
    }
    await recordSystemNoticeAudit(authStore, {
      actorUserId: actor.id,
      action: "admin.system_notice.update",
      targetId: id,
      outcome: "success",
      message: `Updated system notice ${notice.title}`,
    });
    return { notice: noticeDto(notice) };
  });

  app.delete("/api/admin/system-notices/:id", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_notices.write",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const deleted = await systemNotices.delete(id);
    if (!deleted) {
      await recordSystemNoticeAudit(authStore, {
        actorUserId: actor.id,
        action: "admin.system_notice.delete",
        targetId: id,
        outcome: "failure",
        message: `Failed to delete missing system notice ${id}`,
      });
      reply.code(404);
      return { message: "System notice not found" };
    }
    await recordSystemNoticeAudit(authStore, {
      actorUserId: actor.id,
      action: "admin.system_notice.delete",
      targetId: id,
      outcome: "success",
      message: `Deleted system notice ${id}`,
    });
    return { message: "System notice deleted" };
  });
}
