// Owns run billing reservation gates used before pipeline execution.
import type { FastifyReply } from "fastify";
import type { BillingService } from "../../billing/billing-service.js";
import type { ProviderTaskType } from "../../provider-configs/provider-usage-tracker.js";
import type { RunRecordMetadata } from "../records/run-record-store.js";

export async function reserveBillingRunUsage({
  billingEntitlements,
  metadata,
  runId,
  taskType,
  reply,
}: {
  billingEntitlements?: Pick<BillingService, "reserveRunUsage">;
  metadata?: RunRecordMetadata;
  runId: string;
  taskType: ProviderTaskType;
  reply: FastifyReply;
}) {
  if (!billingEntitlements) return true;
  if (!metadata?.userId) {
    reply.code(401);
    return { message: "Authentication required" };
  }
  const decision = await billingEntitlements.reserveRunUsage({
    runId,
    userId: metadata.userId,
    projectId: metadata.projectId,
    taskType,
  });
  if (decision.allowed) return true;
  reply.code(decision.statusCode);
  return { error: decision.error };
}
