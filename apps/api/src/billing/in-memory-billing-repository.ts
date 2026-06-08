// Provides an in-memory billing repository for local development and API tests.
import { randomUUID } from "node:crypto";
import type { BillingSkuDto } from "@uml-platform/contracts";
import type {
  BillingLedgerEntryRecord,
  BillingLedgerSourceType,
  BillingRepository,
  BillingSkuRecord,
  BillingUsageReservationRecord,
  CreateLedgerEntryInput,
  CreatePaymentNotificationInput,
  CreatePaymentOrderInput,
  CreateUsageReservationInput,
  MarkOrderPaidInput,
  MarkOrderStatusInput,
  PaymentNotificationRecord,
  PaymentOrderRecord,
} from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function skuIdFromCode(code: string) {
  return `sku_${code}`;
}

function toSkuRecord(sku: BillingSkuDto, existing?: BillingSkuRecord, source = "default") {
  const timestamp = nowIso();
  return {
    ...sku,
    id: existing?.id ?? skuIdFromCode(sku.code),
    metadata: { ...(existing?.metadata ?? {}), source },
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies BillingSkuRecord;
}

export function createInMemoryBillingRepository(): BillingRepository {
  const skus = new Map<string, BillingSkuRecord>();
  const orders = new Map<string, PaymentOrderRecord>();
  const ledger = new Map<string, BillingLedgerEntryRecord>();
  const reservations = new Map<string, BillingUsageReservationRecord>();
  const notifications = new Map<string, PaymentNotificationRecord>();

  const sourceKey = (sourceType: BillingLedgerSourceType, sourceId: string) =>
    `${sourceType}:${sourceId}`;
  const notificationKey = (input: {
    provider: string;
    providerEventId?: string | null;
    merchantOrderNo?: string | null;
  }) =>
    input.providerEventId
      ? `${input.provider}:event:${input.providerEventId}`
      : `${input.provider}:merchant:${input.merchantOrderNo ?? randomUUID()}`;

  return {
    async withTransaction(operation) {
      return operation(this);
    },

    async upsertSkus(nextSkus, source) {
      for (const sku of nextSkus) {
        const existing = skus.get(sku.code);
        skus.set(sku.code, toSkuRecord(sku, existing, source));
      }
    },

    async listActiveSkus() {
      return Array.from(skus.values())
        .filter((sku) => sku.active)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(clone);
    },

    async getSkuByCode(code) {
      return skus.has(code) ? clone(skus.get(code)!) : null;
    },

    async getSkuById(id) {
      const sku = Array.from(skus.values()).find((candidate) => candidate.id === id);
      return sku ? clone(sku) : null;
    },

    async createOrder(input: CreatePaymentOrderInput) {
      const timestamp = nowIso();
      const order: PaymentOrderRecord = {
        id: randomUUID(),
        merchantOrderNo: input.merchantOrderNo,
        userId: input.userId,
        skuId: input.sku.id,
        sku: clone(input.sku),
        provider: input.provider,
        amountCents: input.amountCents,
        currency: input.currency,
        status: "pending",
        providerTransactionId: null,
        providerPayload: {},
        clientReturnUrl: input.clientReturnUrl,
        expiresAt: input.expiresAt,
        paidAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      orders.set(order.id, order);
      return clone(order);
    },

    async updateOrderProviderPayload(orderId, providerPayload) {
      const order = orders.get(orderId);
      if (!order) return null;
      order.providerPayload = clone(providerPayload);
      order.updatedAt = nowIso();
      return clone(order);
    },

    async getOrderById(orderId) {
      return orders.has(orderId) ? clone(orders.get(orderId)!) : null;
    },

    async getOrderByMerchantOrderNo(merchantOrderNo) {
      const order = Array.from(orders.values()).find(
        (candidate) => candidate.merchantOrderNo === merchantOrderNo,
      );
      return order ? clone(order) : null;
    },

    async listOrdersForUser(userId, limit = 20) {
      return Array.from(orders.values())
        .filter((order) => order.userId === userId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
        .map(clone);
    },

    async listOrders(limit = 100) {
      return Array.from(orders.values())
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
        .map(clone);
    },

    async markOrderPaid(input: MarkOrderPaidInput) {
      const order = orders.get(input.orderId);
      if (!order) return null;
      if (order.status !== "paid") {
        order.status = "paid";
        order.paidAt = input.paidAt;
      }
      order.providerTransactionId = input.providerTransactionId;
      order.providerPayload = clone(input.providerPayload);
      order.updatedAt = nowIso();
      return clone(order);
    },

    async markOrderStatus(input: MarkOrderStatusInput) {
      const order = orders.get(input.orderId);
      if (!order) return null;
      if (order.status !== "paid" || input.status === "refunded" || input.status === "refund_pending") {
        order.status = input.status;
      }
      if (input.providerTransactionId !== undefined) {
        order.providerTransactionId = input.providerTransactionId;
      }
      if (input.providerPayload) order.providerPayload = clone(input.providerPayload);
      order.updatedAt = nowIso();
      return clone(order);
    },

    async getLedgerEntryBySource(sourceType, sourceId) {
      return ledger.has(sourceKey(sourceType, sourceId))
        ? clone(ledger.get(sourceKey(sourceType, sourceId))!)
        : null;
    },

    async addLedgerEntry(input: CreateLedgerEntryInput) {
      const key = sourceKey(input.sourceType, input.sourceId);
      const existing = ledger.get(key);
      if (existing) return clone(existing);
      const entry: BillingLedgerEntryRecord = {
        id: randomUUID(),
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        skuCode: input.skuCode ?? null,
        skuName: input.skuName ?? null,
        creditDelta: input.creditDelta,
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        metadata: clone(input.metadata ?? {}),
        createdAt: nowIso(),
      };
      ledger.set(key, entry);
      return clone(entry);
    },

    async listLedgerEntriesForUser(userId) {
      return Array.from(ledger.values())
        .filter((entry) => entry.userId === userId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(clone);
    },

    async createUsageReservation(input: CreateUsageReservationInput) {
      const existing = reservations.get(input.runId);
      if (existing) return clone(existing);
      const reservation: BillingUsageReservationRecord = {
        id: randomUUID(),
        runId: input.runId,
        userId: input.userId,
        projectId: input.projectId ?? null,
        taskType: input.taskType,
        entitlementKind: input.entitlementKind,
        creditDelta: input.creditDelta,
        status: "reserved",
        reservedAt: input.reservedAt,
        confirmedAt: null,
        releasedAt: null,
        metadata: clone(input.metadata ?? {}),
      };
      reservations.set(input.runId, reservation);
      return clone(reservation);
    },

    async getReservationByRunId(runId) {
      return reservations.has(runId) ? clone(reservations.get(runId)!) : null;
    },

    async confirmUsageReservation(runId, confirmedAt) {
      const reservation = reservations.get(runId);
      if (!reservation) return null;
      if (reservation.status === "reserved") {
        reservation.status = "confirmed";
        reservation.confirmedAt = confirmedAt;
      }
      return clone(reservation);
    },

    async releaseUsageReservation(runId, releasedAt) {
      const reservation = reservations.get(runId);
      if (!reservation) return null;
      if (reservation.status === "reserved") {
        reservation.status = "released";
        reservation.releasedAt = releasedAt;
      }
      return clone(reservation);
    },

    async voidUsageReservation(runId, releasedAt) {
      const reservation = reservations.get(runId);
      if (!reservation) return null;
      if (reservation.status !== "released") {
        reservation.status = "released";
        reservation.releasedAt = releasedAt;
      }
      return clone(reservation);
    },

    async countReservedCreditsForUser(userId) {
      return Array.from(reservations.values()).filter(
        (reservation) =>
          reservation.userId === userId &&
          reservation.status === "reserved" &&
          reservation.entitlementKind === "credit",
      ).length;
    },

    async countConfirmedPassUsageSince(userId, since) {
      return Array.from(reservations.values()).filter(
        (reservation) =>
          reservation.userId === userId &&
          reservation.status === "confirmed" &&
          reservation.entitlementKind === "time_pass" &&
          reservation.confirmedAt !== null &&
          reservation.confirmedAt >= since,
      ).length;
    },

    async recordPaymentNotification(input: CreatePaymentNotificationInput) {
      const key = notificationKey(input);
      const existing = notifications.get(key);
      if (existing) return { record: clone(existing), inserted: false };
      const record: PaymentNotificationRecord = {
        id: randomUUID(),
        provider: input.provider,
        providerEventId: input.providerEventId ?? null,
        merchantOrderNo: input.merchantOrderNo ?? null,
        providerTransactionId: input.providerTransactionId ?? null,
        status: input.status,
        payload: clone(input.payload),
        errorMessage: input.errorMessage ?? null,
        createdAt: nowIso(),
      };
      notifications.set(key, record);
      return { record: clone(record), inserted: true };
    },

    async listPaymentNotifications(limit = 100) {
      return Array.from(notifications.values())
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
        .map(clone);
    },
  };
}
