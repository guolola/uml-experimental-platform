// Normalizes billing entitlement API errors into generation blocker dialog copy.
import {
  billingEntitlementErrorResponseSchema,
  type BillingEntitlementErrorResponse,
} from "@uml-platform/contracts";
import { ApiClientError } from "../../../services/api-client";

export function parseBillingEntitlementError(
  error: unknown,
): BillingEntitlementErrorResponse | null {
  if (!(error instanceof ApiClientError)) return null;
  const runError = error.error;
  if (!runError || runError.category !== "user_entitlement") return null;
  const billing = runError.details?.billing;
  if (!billing || typeof billing !== "object") return null;
  const parsed = billingEntitlementErrorResponseSchema.safeParse({
    message: runError.message,
    ...(billing as Record<string, unknown>),
  });
  return parsed.success ? parsed.data : null;
}

export function billingEntitlementDialogTitle(
  block: BillingEntitlementErrorResponse,
) {
  if (block.reason === "pass_daily_limit") return "通行卡今日次数已用完";
  if (block.reason === "negative_balance") return "权益余额异常";
  return "需要开通生成权益";
}

export function billingEntitlementDialogDetails(
  block: BillingEntitlementErrorResponse,
) {
  const details = [`可用次数：${block.billingSummary.creditBalance}`];
  const dailyLimit = block.billingSummary.passDailyUsage.limit;
  const usedToday = block.billingSummary.passDailyUsage.usedToday;
  if (block.billingSummary.activePass) {
    details.push(`通行卡今日使用：${usedToday}/${dailyLimit}`);
  }
  details.push(block.payCta.label);
  return details;
}
