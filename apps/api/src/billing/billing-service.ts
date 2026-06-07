// Owns billing business rules: server-priced orders, entitlement grants, and run reservations.
import {
  billingOrderStatusDtoSchema,
  billingSkuListResponseSchema,
  billingSummarySchema,
  createPaymentOrderResponseSchema,
  runErrorSchema,
  type BillingEntitlementFailureReason,
  type BillingOrderStatusDto,
  type RunError,
  type BillingSkuDto,
  type BillingSummary,
  type CreatePaymentOrderRequest,
  type CreatePaymentOrderResponse,
  type PaymentChannel,
} from "@uml-platform/contracts";
import type { PaymentProviderRegistry, ProviderPaymentCallback } from "../adapters/payments/types.js";
import type { ProviderTaskType } from "../provider-configs/provider-usage-tracker.js";
import { resolveBillingSkusFromEnv } from "./skus.js";
import type {
  BillingLedgerEntryRecord,
  BillingRepository,
  BillingUsageReservationRecord,
  PaymentOrderRecord,
} from "./types.js";

export class BillingConfigurationError extends Error {
  readonly statusCode = 503;
}

export class BillingValidationError extends Error {
  readonly statusCode = 400;
}

export class BillingNotFoundError extends Error {
  readonly statusCode = 404;
}

export type BillingEntitlementDecision =
  | {
      allowed: true;
      reservation: BillingUsageReservationRecord;
    }
  | {
      allowed: false;
      statusCode: 402 | 429;
      error: RunError;
    };

type BillingServiceOptions = {
  repository: BillingRepository;
  paymentProviders: PaymentProviderRegistry;
  nodeEnv?: string | null;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

type ReserveRunUsageInput = {
  runId: string;
  userId: string;
  projectId?: string | null;
  taskType: ProviderTaskType;
};

type PaymentCallbackProcessInput = {
  channel: PaymentChannel;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody: string;
};

const SIGNUP_BONUS_CREDITS = 5;
const SIGNUP_BONUS_DAYS = 30;
const ORDER_EXPIRES_MINUTES = 15;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function nextUtcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function dayStartIso(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function merchantOrderNo(now: Date) {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `UML${stamp}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function readPositiveInt(
  value: string | undefined,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isValidLedgerEntry(entry: BillingLedgerEntryRecord, nowIso: string) {
  return entry.validFrom <= nowIso && (!entry.validUntil || entry.validUntil > nowIso);
}

function orderToDto(order: PaymentOrderRecord): BillingOrderStatusDto {
  return billingOrderStatusDtoSchema.parse({
    orderId: order.id,
    merchantOrderNo: order.merchantOrderNo,
    sku: order.sku,
    amountCents: order.amountCents,
    currency: order.currency,
    channel: order.provider,
    status: order.status,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
  });
}

function buildProviderPayload(callback: ProviderPaymentCallback) {
  return {
    providerTransactionId: callback.providerTransactionId,
    providerEventId: callback.providerEventId,
    state: callback.state,
    paidAt: callback.paidAt,
    rawPayload: callback.rawPayload,
  };
}

function transactionStateToOrderStatus(state: ProviderPaymentCallback["state"]) {
  if (state === "paid") return "paid" as const;
  if (state === "closed") return "closed" as const;
  if (state === "refunded") return "refunded" as const;
  if (state === "failed") return "failed" as const;
  return "pending" as const;
}

function skuDto(sku: BillingSkuDto) {
  return {
    code: sku.code,
    name: sku.name,
    kind: sku.kind,
    description: sku.description,
    durationDays: sku.durationDays,
    creditAmount: sku.creditAmount,
    amountCents: sku.amountCents,
    currency: "CNY" as const,
    active: sku.active,
    sortOrder: sku.sortOrder,
  };
}

function entitlementMessage(reason: BillingEntitlementFailureReason) {
  if (reason === "pass_soft_limit") {
    return "当前通行卡使用较多，已触发软保护。可购买次数包继续生成。";
  }
  if (reason === "negative_balance") {
    return "账户权益余额异常，请先购买次数包或联系管理员处理。";
  }
  return "当前账户没有可用于 AI 生成的权益，请先购买通行卡或次数包。";
}

function entitlementCode(reason: BillingEntitlementFailureReason) {
  if (reason === "pass_soft_limit") return "USER_PASS_SOFT_LIMIT";
  if (reason === "negative_balance") return "USER_ENTITLEMENT_NEGATIVE_BALANCE";
  return "USER_ENTITLEMENT_REQUIRED";
}

export function createBillingService({
  repository,
  paymentProviders,
  nodeEnv = process.env.NODE_ENV ?? null,
  env = process.env,
  now = () => new Date(),
}: BillingServiceOptions) {
  let skuCatalogSource: "default" | "env" = "default";
  const passDailyLimit = readPositiveInt(env.UML_BILLING_PASS_DAILY_SOFT_LIMIT, 50);
  const passConcurrentLimit = readPositiveInt(env.UML_BILLING_PASS_CONCURRENT_LIMIT, 2);
  const production = nodeEnv === "production";

  async function ensureSkuCatalog() {
    const resolved = resolveBillingSkusFromEnv({ env });
    skuCatalogSource = resolved.source;
    await repository.upsertSkus(resolved.skus, resolved.source);
    return resolved;
  }

  async function listSkus() {
    return billingSkuListResponseSchema.parse({
      skus: (await repository.listActiveSkus()).map(skuDto),
    });
  }

  async function readSummary(
    summaryRepository: BillingRepository,
    userId: string,
    options: { grantSignupBonus?: boolean } = {},
  ) {
    if (options.grantSignupBonus) {
      await grantSignupBonus(userId);
    }
    const current = now();
    const nowString = current.toISOString();
    const [ledger, recentOrders, reservedCredits, passUsage] = await Promise.all([
      summaryRepository.listLedgerEntriesForUser(userId),
      summaryRepository.listOrdersForUser(userId, 10),
      summaryRepository.countReservedCreditsForUser(userId),
      summaryRepository.countConfirmedPassUsageSince(userId, dayStartIso(current)),
    ]);
    const validLedger = ledger.filter((entry) => isValidLedgerEntry(entry, nowString));
    const creditBalance =
      validLedger.reduce((total, entry) => total + entry.creditDelta, 0) - reservedCredits;
    const passEntry = validLedger
      .filter((entry) => entry.skuCode?.startsWith("time_") && entry.validUntil)
      .sort((left, right) => (right.validUntil ?? "").localeCompare(left.validUntil ?? ""))[0];
    const signupBonus = ledger.find(
      (entry) =>
        entry.sourceType === "signup_bonus" &&
        entry.sourceId === `email_verification_signup:${userId}`,
    );
    return billingSummarySchema.parse({
      creditBalance,
      activePass: passEntry
        ? {
            skuCode: passEntry.skuCode,
            name: passEntry.skuName ?? "通行卡",
            validFrom: passEntry.validFrom,
            validUntil: passEntry.validUntil,
            remainingDailyStarts: Math.max(passDailyLimit - passUsage, 0),
          }
        : null,
      signupBonus: {
        granted: Boolean(signupBonus),
        creditAmount: signupBonus ? Math.max(signupBonus.creditDelta, 0) : 0,
        validUntil: signupBonus?.validUntil ?? null,
      },
      passDailyUsage: {
        usedToday: passUsage,
        limit: passDailyLimit,
      },
      softLimit: {
        passDailyLimit,
        passConcurrentLimit,
      },
      recentOrders: recentOrders.map(orderToDto),
    });
  }

  async function getSummary(userId: string, options: { grantSignupBonus?: boolean } = {}) {
    return readSummary(repository, userId, options);
  }

  async function grantSignupBonus(userId: string) {
    const sourceId = `email_verification_signup:${userId}`;
    const current = now();
    await repository.addLedgerEntry({
      userId,
      sourceType: "signup_bonus",
      sourceId,
      creditDelta: SIGNUP_BONUS_CREDITS,
      validFrom: current.toISOString(),
      validUntil: addDays(current, SIGNUP_BONUS_DAYS).toISOString(),
      metadata: {
        bonusType: "email_verification_signup",
        creditAmount: SIGNUP_BONUS_CREDITS,
      },
    });
  }

  async function grantGuestDevelopmentAllowance(userId: string, creditAmount: number) {
    if (!Number.isInteger(creditAmount) || creditAmount <= 0) {
      throw new BillingValidationError("Guest development allowance must be a positive integer");
    }
    const current = now();
    const day = current.toISOString().slice(0, 10);
    return repository.addLedgerEntry({
      userId,
      sourceType: "admin_adjustment",
      sourceId: `dev_guest_daily_allowance:${userId}:${day}`,
      creditDelta: creditAmount,
      validFrom: current.toISOString(),
      validUntil: nextUtcDayStart(current).toISOString(),
      metadata: {
        reason: "local_guest_development_allowance",
        creditAmount,
        day,
      },
    });
  }

  async function createOrder(
    user: { id: string; emailVerified?: boolean },
    input: CreatePaymentOrderRequest,
  ): Promise<CreatePaymentOrderResponse> {
    if (!user.emailVerified) {
      throw new BillingValidationError("Email verification is required before payment");
    }
    if (production && skuCatalogSource !== "env") {
      throw new BillingConfigurationError(
        "Production billing requires UML_BILLING_SKUS_JSON so prices are explicitly configured",
      );
    }
    const sku = await repository.getSkuByCode(input.skuCode);
    if (!sku || !sku.active) {
      throw new BillingValidationError("Billing SKU is not available");
    }
    const adapter = paymentProviders[input.channel];
    if (!adapter?.isConfigured()) {
      throw new BillingConfigurationError(`${input.channel} payment configuration is incomplete`);
    }
    const current = now();
    const order = await repository.createOrder({
      merchantOrderNo: merchantOrderNo(current),
      userId: user.id,
      sku,
      provider: input.channel,
      amountCents: sku.amountCents,
      currency: "CNY",
      clientReturnUrl: input.returnUrl ?? null,
      expiresAt: addMinutes(current, ORDER_EXPIRES_MINUTES).toISOString(),
    });
    const providerPayment = await adapter.createPayment({
      merchantOrderNo: order.merchantOrderNo,
      subject: sku.name,
      amountCents: sku.amountCents,
      currency: "CNY",
      expiresAt: order.expiresAt,
      notifyUrl: "",
      returnUrl: input.returnUrl,
    });
    const updatedOrder =
      (await repository.updateOrderProviderPayload(order.id, providerPayment.providerPayload)) ??
      order;
    return createPaymentOrderResponseSchema.parse({
      orderId: updatedOrder.id,
      merchantOrderNo: updatedOrder.merchantOrderNo,
      status: updatedOrder.status,
      amountCents: updatedOrder.amountCents,
      currency: "CNY",
      expiresAt: updatedOrder.expiresAt,
      channel: updatedOrder.provider,
      codeUrl: providerPayment.codeUrl,
      paymentFormHtml: providerPayment.paymentFormHtml,
      redirectUrl: providerPayment.redirectUrl,
    });
  }

  async function getOrderForUser(userId: string, orderId: string) {
    const order = await repository.getOrderById(orderId);
    if (!order || order.userId !== userId) {
      throw new BillingNotFoundError("Payment order not found");
    }
    return orderToDto(order);
  }

  async function grantPurchaseEntitlement(
    targetRepository: BillingRepository,
    order: PaymentOrderRecord,
  ) {
    if (order.sku.kind === "credit_pack") {
      await targetRepository.addLedgerEntry({
        userId: order.userId,
        sourceType: "purchase",
        sourceId: order.id,
        skuCode: order.sku.code,
        skuName: order.sku.name,
        creditDelta: order.sku.creditAmount ?? 0,
        validFrom: order.paidAt ?? now().toISOString(),
        validUntil: null,
        metadata: {
          merchantOrderNo: order.merchantOrderNo,
          provider: order.provider,
          entitlementKind: "credit_pack",
        },
      });
      return;
    }
    await targetRepository.addLedgerEntry({
      userId: order.userId,
      sourceType: "purchase",
      sourceId: order.id,
      skuCode: order.sku.code,
      skuName: order.sku.name,
      creditDelta: 0,
      validFrom: order.paidAt ?? now().toISOString(),
      validUntil: addDays(new Date(order.paidAt ?? now().toISOString()), order.sku.durationDays ?? 0).toISOString(),
      metadata: {
        merchantOrderNo: order.merchantOrderNo,
        provider: order.provider,
        entitlementKind: "time_pass",
      },
    });
  }

  function assertCallbackMatchesOrder(callback: ProviderPaymentCallback, order: PaymentOrderRecord) {
    if (callback.channel !== order.provider) {
      throw new BillingValidationError("Payment callback channel does not match order");
    }
    if (callback.amountCents !== order.amountCents) {
      throw new BillingValidationError("Payment callback amount does not match order");
    }
    if (callback.currency !== order.currency) {
      throw new BillingValidationError("Payment callback currency does not match order");
    }
    if (callback.state !== "paid" && callback.state !== "closed" && callback.state !== "failed") {
      throw new BillingValidationError("Payment callback trade status is not terminal");
    }
  }

  async function processPaymentCallback(input: PaymentCallbackProcessInput) {
    const adapter = paymentProviders[input.channel];
    if (!adapter?.isConfigured()) {
      throw new BillingConfigurationError(`${input.channel} payment callback configuration is incomplete`);
    }
    const callback = await adapter.verifyCallback({
      headers: input.headers,
      body: input.body,
      rawBody: input.rawBody,
    });
    return repository.withTransaction(async (tx) => {
      const notification = await tx.recordPaymentNotification({
        provider: input.channel,
        providerEventId: callback.providerEventId,
        merchantOrderNo: callback.merchantOrderNo,
        providerTransactionId: callback.providerTransactionId,
        status: "received",
        payload: callback.rawPayload,
      });
      const order = await tx.getOrderByMerchantOrderNo(callback.merchantOrderNo);
      if (!order) {
        await tx.recordPaymentNotification({
          provider: input.channel,
          providerEventId: `${callback.providerEventId ?? callback.providerTransactionId}:missing-order`,
          merchantOrderNo: callback.merchantOrderNo,
          providerTransactionId: callback.providerTransactionId,
          status: "rejected",
          payload: callback.rawPayload,
          errorMessage: "Order not found",
        });
        throw new BillingNotFoundError("Payment order not found");
      }
      assertCallbackMatchesOrder(callback, order);
      if (callback.state === "paid") {
        const paidOrder =
          order.status === "paid"
            ? order
            : await tx.markOrderPaid({
                orderId: order.id,
                providerTransactionId: callback.providerTransactionId,
                providerPayload: buildProviderPayload(callback),
                paidAt: callback.paidAt ?? now().toISOString(),
              });
        if (paidOrder) {
          await grantPurchaseEntitlement(tx, paidOrder);
        }
      } else {
        await tx.markOrderStatus({
          orderId: order.id,
          status: transactionStateToOrderStatus(callback.state),
          providerTransactionId: callback.providerTransactionId,
          providerPayload: buildProviderPayload(callback),
        });
      }
      if (!notification.inserted) {
        return { ok: true, duplicate: true };
      }
      await tx.recordPaymentNotification({
        provider: input.channel,
        providerEventId: `${callback.providerEventId ?? callback.providerTransactionId}:processed`,
        merchantOrderNo: callback.merchantOrderNo,
        providerTransactionId: callback.providerTransactionId,
        status: "processed",
        payload: callback.rawPayload,
      });
      return { ok: true, duplicate: false };
    });
  }

  function entitlementError(
    summary: BillingSummary,
    reason: BillingEntitlementFailureReason,
    statusCode: 402 | 429,
  ): BillingEntitlementDecision {
    return {
      allowed: false,
      statusCode,
      error: runErrorSchema.parse({
        code: entitlementCode(reason),
        message: entitlementMessage(reason),
        category: "user_entitlement",
        retryable: false,
        details: {
          billing: {
            reason,
            billingSummary: summary,
            payCta: {
              label: reason === "pass_soft_limit" ? "购买次数包" : "查看定价",
              href: "/pricing",
            },
          },
        },
      }),
    };
  }

  async function reserveRunUsage(input: ReserveRunUsageInput): Promise<BillingEntitlementDecision> {
    return repository.withTransaction(async (tx) => {
      const summary = await readSummary(tx, input.userId);
      if (summary.creditBalance < 0) {
        return entitlementError(summary, "negative_balance", 402);
      }
      const reservedConcurrent = await tx.countReservedUsageForUser(input.userId);
      const passAvailable =
        summary.activePass &&
        summary.passDailyUsage.usedToday < summary.softLimit.passDailyLimit &&
        reservedConcurrent < summary.softLimit.passConcurrentLimit;
      if (passAvailable) {
        return {
          allowed: true,
          reservation: await tx.createUsageReservation({
            ...input,
            entitlementKind: "time_pass",
            creditDelta: 0,
            reservedAt: now().toISOString(),
            metadata: {
              activePass: summary.activePass,
            },
          }),
        };
      }
      if (summary.creditBalance > 0) {
        return {
          allowed: true,
          reservation: await tx.createUsageReservation({
            ...input,
            entitlementKind: "credit",
            creditDelta: -1,
            reservedAt: now().toISOString(),
            metadata: summary.activePass
              ? { fallbackReason: "pass_soft_limit" }
              : { fallbackReason: "credit_pack" },
          }),
        };
      }
      return entitlementError(summary, summary.activePass ? "pass_soft_limit" : "no_entitlement", summary.activePass ? 429 : 402);
    });
  }

  async function confirmRunUsage(runId: string) {
    return repository.withTransaction(async (tx) => {
      const reservation = await tx.getReservationByRunId(runId);
      if (!reservation || reservation.status !== "reserved") return reservation;
      const confirmedAt = now().toISOString();
      if (reservation.entitlementKind === "credit") {
        await tx.addLedgerEntry({
          userId: reservation.userId,
          sourceType: "usage",
          sourceId: `run:${runId}`,
          creditDelta: -1,
          validFrom: confirmedAt,
          validUntil: null,
          metadata: {
            runId,
            taskType: reservation.taskType,
          },
        });
      }
      // Confirmation is the irreversible entitlement transition for a run.
      return tx.confirmUsageReservation(runId, confirmedAt);
    });
  }

  async function releaseRunUsage(runId: string) {
    return repository.releaseUsageReservation(runId, now().toISOString());
  }

  async function compensateRunUsage({
    runId,
    errorCode,
    reason,
  }: {
    runId: string;
    errorCode: string;
    reason: string;
  }) {
    return repository.withTransaction(async (tx) => {
      const reservation = await tx.getReservationByRunId(runId);
      if (!reservation || reservation.status === "released") return reservation;
      const compensatedAt = now().toISOString();
      if (reservation.status === "confirmed" && reservation.entitlementKind === "credit") {
        const sourceId = `run-compensation:${runId}`;
        const existing = await tx.getLedgerEntryBySource("admin_adjustment", sourceId);
        if (!existing) {
          await tx.addLedgerEntry({
            userId: reservation.userId,
            sourceType: "admin_adjustment",
            sourceId,
            creditDelta: Math.abs(reservation.creditDelta || 1),
            validFrom: compensatedAt,
            validUntil: null,
            metadata: {
              runId,
              taskType: reservation.taskType,
              errorCode,
              compensationReason: reason,
            },
          });
        }
      }
      // Platform-side provider failures should not consume credit or pass quota.
      return tx.voidUsageReservation(runId, compensatedAt);
    });
  }

  async function compensateCredits({
    userId,
    creditAmount,
    reason,
    actorUserId,
  }: {
    userId: string;
    creditAmount: number;
    reason: string;
    actorUserId: string;
  }) {
    if (!Number.isInteger(creditAmount) || creditAmount === 0) {
      throw new BillingValidationError("Credit adjustment must be a non-zero integer");
    }
    return repository.addLedgerEntry({
      userId,
      sourceType: "admin_adjustment",
      sourceId: `admin:${actorUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      creditDelta: creditAmount,
      validFrom: now().toISOString(),
      validUntil: null,
      metadata: { reason, actorUserId },
    });
  }

  async function markRefundPending(orderId: string) {
    const order = await repository.getOrderById(orderId);
    if (!order) throw new BillingNotFoundError("Payment order not found");
    return repository.markOrderStatus({
      orderId,
      status: "refund_pending",
    });
  }

  return {
    ensureSkuCatalog,
    listSkus,
    getSummary,
    grantSignupBonus,
    grantGuestDevelopmentAllowance,
    createOrder,
    getOrderForUser,
    processPaymentCallback,
    reserveRunUsage,
    confirmRunUsage,
    releaseRunUsage,
    compensateRunUsage,
    compensateCredits,
    markRefundPending,
    listAdminOrders: (limit?: number) => repository.listOrders(limit),
    listLedgerEntriesForUser: (userId: string) => repository.listLedgerEntriesForUser(userId),
    listPaymentNotifications: (limit?: number) => repository.listPaymentNotifications(limit),
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
