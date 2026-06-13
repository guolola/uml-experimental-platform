// Handles admin run cancel/retry/rerun actions after route-level write permission.
import type { FastifyRequest } from "fastify";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import type { LlmScheduler } from "../adapters/llm/llm-scheduler.js";
import {
  cancelRunRecord,
  createQueuedRunFromSource,
  isRetryableRun,
} from "../runs/records/run-actions.js";
import type {
  RunRecord,
  RunRecordMetadata,
  RunRecordStore,
} from "../runs/records/run-record-store.js";
import type { AdminActor } from "../security/admin-guard.js";
import { canSeeProjectByScope } from "./academic-scope.js";
import { actorLabel } from "./admin-route-presenters.js";
import { recordAdminAction } from "./admin-route-security.js";

export type AdminRunPipelineStarter = (input: {
  record: RunRecord;
  source: RunRecord;
  request: FastifyRequest;
  actorUserId: string;
}) => Promise<void> | void;

type AdminRunActionInput = {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
  runs: RunRecordStore;
  runId: string;
};

type AdminRunActionResult = Promise<{ statusCode: number; body: unknown }>;

async function getWritableAdminRun({
  academicStore,
  authStore,
  actor,
  runs,
  runId,
  action,
}: AdminRunActionInput & { action: string }) {
  const record = runs.get(runId);
  if (!record) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "run",
      targetId: runId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} attempted ${action} for missing run (${runId})`,
    });
    return { ok: false, statusCode: 404, body: { message: "Run not found" } } as const;
  }

  const projectId =
    typeof record.metadata?.projectId === "string" ? record.metadata.projectId : null;
  const project = projectId ? await authStore.getProject(projectId) : null;
  if (project && !(await canSeeProjectByScope(academicStore, authStore, actor, project))) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "run",
      targetId: runId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} attempted ${action} for run outside data scope (${runId})`,
    });
    return {
      ok: false,
      statusCode: 403,
      body: { message: "Run is outside admin data scope" },
    } as const;
  }

  return { ok: true, record } as const;
}

export async function cancelAdminRun({
  academicStore,
  authStore,
  actor,
  runs,
  runId,
  llmScheduler,
}: AdminRunActionInput & {
  llmScheduler?: LlmScheduler;
}): AdminRunActionResult {
  const action = "admin.run.cancel";
  const access = await getWritableAdminRun({
    academicStore,
    authStore,
    actor,
    runs,
    runId,
    action,
  });
  if (!access.ok) {
    return { statusCode: access.statusCode, body: access.body };
  }
  if (access.record.terminal) {
    return {
      statusCode: 409,
      body: { message: "Terminal runs cannot be cancelled again" },
    };
  }

  llmScheduler?.cancelRun(runId);
  const result = cancelRunRecord(access.record, runId);
  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "run",
    targetId: runId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} cancelled run ${runId}`,
  });
  return { statusCode: 200, body: result };
}

export async function createAdminRunAction({
  academicStore,
  authStore,
  actor,
  runs,
  runId,
  actionKind,
  request,
  startRunPipeline,
}: AdminRunActionInput & {
  actionKind: "retry" | "rerun";
  request: FastifyRequest;
  startRunPipeline?: AdminRunPipelineStarter;
}): AdminRunActionResult {
  const action = `admin.run.${actionKind}`;
  const access = await getWritableAdminRun({
    academicStore,
    authStore,
    actor,
    runs,
    runId,
    action,
  });
  if (!access.ok) {
    return { statusCode: access.statusCode, body: access.body };
  }
  if (actionKind === "retry" && !isRetryableRun(access.record)) {
    return {
      statusCode: 409,
      body: { message: "Only failed, cancelled, or interrupted runs can be retried" },
    };
  }
  if (
    !access.record.terminal &&
    (access.record.snapshot.status === "queued" ||
      access.record.snapshot.status === "running")
  ) {
    return {
      statusCode: 409,
      body: { message: "Running or queued runs cannot be rerun" },
    };
  }

  const metadata: RunRecordMetadata = {
    userId: actor.id,
    createdAt: new Date().toISOString(),
    ...(typeof access.record.metadata?.projectId === "string"
      ? { projectId: access.record.metadata.projectId }
      : {}),
  };
  const result = createQueuedRunFromSource({
    runs,
    source: access.record,
    metadata,
    action: actionKind,
    sourceRunId: runId,
    actorUserId: actor.id,
  });
  const newRecord = runs.get(result.runId);
  if (newRecord) {
    await startRunPipeline?.({
      record: newRecord,
      source: access.record,
      request,
      actorUserId: actor.id,
    });
  }
  await recordAdminAction(authStore, {
    actor,
    action,
    targetType: "run",
    targetId: runId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} ${actionKind}ed run ${runId} as ${result.runId}`,
  });
  return { statusCode: 202, body: result };
}
