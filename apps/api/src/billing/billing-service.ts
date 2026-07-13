// Owns billing business rules: server-priced orders, entitlement grants, and run reservations.
import {
  billingOrderStatusDtoSchema,
  billingSkuListResponseSchema,
  billingSummarySchema,
  createPaymentOrderResponseSchema,
  resumePaymentOrderResponseSchema,
  runErrorSchema,
  type BillingEntitlementFailureReason,
  type BillingOrderStatusDto,
  type RunError,
  type BillingSkuDto,
  type BillingSummary,
  type CreatePaymentOrderRequest,
  type CreatePaymentOrderResponse,
  type ResumePaymentOrderResponse,
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

function merchantOrderNo(now: Date) {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `UML${stamp}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function isValidLedgerEntry(entry: BillingLedgerEntryRecord, nowIso: string) {
  return entry.validFrom <= nowIso && (!entry.validUntil || entry.validUntil > nowIso);
}

function isOrderExpired(order: PaymentOrderRecord, current: Date) {
  return new Date(order.expiresAt).getTime() <= current.getTime();
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

function isCurrentCreditSku(sku: { kind: string }) {
  return sku.kind === "credit_pack";
}

function entitlementMessage(reason: BillingEntitlementFailureReason) {
  if (reason === "negative_balance") {
    return "账户权益余额异常，请先购买次数包或联系管理员处理。";
  }
  return "当前账户没有可用于 AI 生成的权益，请先购买次数包。";
}

function entitlementCode(reason: BillingEntitlementFailureReason) {
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
  const production = nodeEnv === "production";

  async function ensureSkuCatalog() {
    const resolved = resolveBillingSkusFromEnv({ env });
    skuCatalogSource = resolved.source;
    await repository.upsertSkus(resolved.skus, resolved.source);
    return resolved;
  }

  async function listSkus() {
    return billingSkuListResponseSchema.parse({
      skus: (await repository.listActiveSkus()).filter(isCurrentCreditSku).map(skuDto),
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
    const [ledger, recentOrders, reservedCredits] = await Promise.all([
      summaryRepository.listLedgerEntriesForUser(userId),
      summaryRepository.listOrdersForUser(userId, 10),
      summaryRepository.countReservedCreditsForUser(userId),
    ]);
    const syncedRecentOrders = await Promise.all(
      recentOrders.map((order) => syncPendingOrder(summaryRepository, order)),
    );
    const validLedger = ledger.filter((entry) => isValidLedgerEntry(entry, nowString));
    const creditBalance =
      validLedger.reduce((total, entry) => total + entry.creditDelta, 0) - reservedCredits;
    const signupBonus = ledger.find(
      (entry) =>
        entry.sourceType === "signup_bonus" &&
        entry.sourceId === `email_verification_signup:${userId}`,
    );
    return billingSummarySchema.parse({
      creditBalance,
      signupBonus: {
        granted: Boolean(signupBonus),
        creditAmount: signupBonus ? Math.max(signupBonus.creditDelta, 0) : 0,
        validUntil: signupBonus?.validUntil ?? null,
      },
      recentOrders: syncedRecentOrders.filter((order) => isCurrentCreditSku(order.sku)).map(orderToDto),
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

  async function grantPurchaseEntitlement(
    targetRepository: BillingRepository,
    order: PaymentOrderRecord,
  ) {
    if (order.sku.kind !== "credit_pack") {
      throw new BillingValidationError("Billing SKU is not available");
    }
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
  }

  async function markOrderPaidAndGrant(
    targetRepository: BillingRepository,
    orderId: string,
    callback: ProviderPaymentCallback,
  ) {
    return targetRepository.withTransaction(async (tx) => {
      const currentOrder = await tx.getOrderById(orderId);
      if (!currentOrder) return null;
      const paidOrder =
        currentOrder.status === "paid"
          ? currentOrder
          : await tx.markOrderPaid({
              orderId: currentOrder.id,
              providerTransactionId: callback.providerTransactionId,
              providerPayload: buildProviderPayload(callback),
              paidAt: callback.paidAt ?? now().toISOString(),
            });
      if (paidOrder) await grantPurchaseEntitlement(tx, paidOrder);
      return paidOrder;
    });
  }

  async function syncPendingOrder(
    targetRepository: BillingRepository,
    order: PaymentOrderRecord,
  ) {
    if (order.status !== "pending") return order;
    let currentOrder = order;
    const adapter = paymentProviders[order.provider];
    if (adapter?.isConfigured()) {
      const providerState = await adapter.queryPayment(order).catch(() => null);
      if (providerState?.merchantOrderNo === order.merchantOrderNo) {
        if (providerState.state === "paid") {
          assertCallbackMatchesOrder(providerState, order);
          currentOrder =
            (await markOrderPaidAndGrant(targetRepository, order.id, providerState)) ?? order;
        } else if (providerState.state === "closed" || providerState.state === "failed") {
          assertCallbackMatchesOrder(providerState, order);
          currentOrder =
            (await targetRepository.markOrderStatus({
              orderId: order.id,
              status: transactionStateToOrderStatus(providerState.state),
              providerTransactionId: providerState.providerTransactionId,
              providerPayload: buildProviderPayload(providerState),
            })) ?? order;
        }
      }
    }
    if (currentOrder.status === "pending" && isOrderExpired(currentOrder, now())) {
      currentOrder =
        (await targetRepository.markOrderStatus({
          orderId: currentOrder.id,
          status: "expired",
        })) ?? currentOrder;
    }
    return currentOrder;
  }

  async function buildPaymentResponse(
    order: PaymentOrderRecord,
  ): Promise<CreatePaymentOrderResponse | ResumePaymentOrderResponse> {
    const adapter = paymentProviders[order.provider];
    if (!adapter?.isConfigured()) {
      throw new BillingConfigurationError(`${order.provider} payment configuration is incomplete`);
    }
    const providerPayment = await adapter.createPayment({
      merchantOrderNo: order.merchantOrderNo,
      subject: order.sku.name,
      amountCents: order.amountCents,
      currency: "CNY",
      expiresAt: order.expiresAt,
      notifyUrl: "",
      returnUrl: order.clientReturnUrl,
      param: order.id,
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
    if (!sku || !sku.active || !isCurrentCreditSku(sku)) {
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
    return createPaymentOrderResponseSchema.parse(await buildPaymentResponse(order));
  }

  async function getOrderForUser(userId: string, orderId: string) {
    let order = await repository.getOrderById(orderId);
    if (!order || order.userId !== userId) {
      throw new BillingNotFoundError("Payment order not found");
    }
    order = await syncPendingOrder(repository, order);
    return orderToDto(order);
  }

  async function getOrderForUserByMerchantOrderNo(userId: string, merchantOrderNo: string) {
    let order = await repository.getOrderByMerchantOrderNo(merchantOrderNo);
    if (!order || order.userId !== userId) {
      throw new BillingNotFoundError("Payment order not found");
    }
    order = await syncPendingOrder(repository, order);
    return orderToDto(order);
  }

  async function resumeOrderForUser(
    userId: string,
    orderId: string,
  ): Promise<ResumePaymentOrderResponse> {
    let order = await repository.getOrderById(orderId);
    if (!order || order.userId !== userId) {
      throw new BillingNotFoundError("Payment order not found");
    }
    order = await syncPendingOrder(repository, order);
    if (order.status !== "pending") {
      throw new BillingValidationError("Payment order is no longer payable");
    }
    if (isOrderExpired(order, now())) {
      await repository.markOrderStatus({ orderId: order.id, status: "expired" });
      throw new BillingValidationError("Payment order is no longer payable");
    }
    return resumePaymentOrderResponseSchema.parse(await buildPaymentResponse(order));
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
        await markOrderPaidAndGrant(tx, order.id, callback);
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
              label: "查看定价",
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
      if (summary.creditBalance > 0) {
        return {
          allowed: true,
          reservation: await tx.createUsageReservation({
            ...input,
            entitlementKind: "credit",
            creditDelta: -1,
            reservedAt: now().toISOString(),
            metadata: { fallbackReason: "credit_pack" },
          }),
        };
      }
      return entitlementError(summary, "no_entitlement", 402);
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
      // Platform-side provider failures should not consume purchased credits.
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
    getOrderForUserByMerchantOrderNo,
    resumeOrderForUser,
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
