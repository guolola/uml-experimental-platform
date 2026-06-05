// Defines billing persistence contracts shared by services and repositories.
import type {
  BillingOrderStatus,
  BillingSkuDto,
  PaymentChannel,
} from "@uml-platform/contracts";
import type { ProviderTaskType } from "../provider-configs/provider-usage-tracker.js";

export type BillingSkuRecord = BillingSkuDto & {
  id: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PaymentOrderRecord = {
  id: string;
  merchantOrderNo: string;
  userId: string;
  skuId: string;
  sku: BillingSkuRecord;
  provider: PaymentChannel;
  amountCents: number;
  currency: "CNY";
  status: BillingOrderStatus;
  providerTransactionId: string | null;
  providerPayload: Record<string, unknown>;
  clientReturnUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingLedgerSourceType =
  | "purchase"
  | "signup_bonus"
  | "admin_adjustment"
  | "refund"
  | "usage";

export type BillingLedgerEntryRecord = {
  id: string;
  userId: string;
  sourceType: BillingLedgerSourceType;
  sourceId: string;
  skuCode: string | null;
  skuName: string | null;
  creditDelta: number;
  validFrom: string;
  validUntil: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type BillingReservationKind = "time_pass" | "credit";
export type BillingReservationStatus = "reserved" | "confirmed" | "released";

export type BillingUsageReservationRecord = {
  id: string;
  runId: string;
  userId: string;
  projectId: string | null;
  taskType: ProviderTaskType;
  entitlementKind: BillingReservationKind;
  creditDelta: number;
  status: BillingReservationStatus;
  reservedAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  metadata: Record<string, unknown>;
};

export type PaymentNotificationRecord = {
  id: string;
  provider: PaymentChannel;
  providerEventId: string | null;
  merchantOrderNo: string | null;
  providerTransactionId: string | null;
  status: "received" | "verified" | "rejected" | "duplicate" | "processed" | "ignored" | "failed";
  payload: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
};

export type CreatePaymentOrderInput = {
  merchantOrderNo: string;
  userId: string;
  sku: BillingSkuRecord;
  provider: PaymentChannel;
  amountCents: number;
  currency: "CNY";
  clientReturnUrl: string | null;
  expiresAt: string;
};

export type CreateLedgerEntryInput = {
  userId: string;
  sourceType: BillingLedgerSourceType;
  sourceId: string;
  skuCode?: string | null;
  skuName?: string | null;
  creditDelta: number;
  validFrom: string;
  validUntil?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateUsageReservationInput = {
  runId: string;
  userId: string;
  projectId?: string | null;
  taskType: ProviderTaskType;
  entitlementKind: BillingReservationKind;
  creditDelta: number;
  reservedAt: string;
  metadata?: Record<string, unknown>;
};

export type CreatePaymentNotificationInput = {
  provider: PaymentChannel;
  providerEventId?: string | null;
  merchantOrderNo?: string | null;
  providerTransactionId?: string | null;
  status: PaymentNotificationRecord["status"];
  payload: Record<string, unknown>;
  errorMessage?: string | null;
};

export type MarkOrderPaidInput = {
  orderId: string;
  providerTransactionId: string;
  providerPayload: Record<string, unknown>;
  paidAt: string;
};

export type MarkOrderStatusInput = {
  orderId: string;
  status: BillingOrderStatus;
  providerTransactionId?: string | null;
  providerPayload?: Record<string, unknown>;
};

export interface BillingRepository {
  withTransaction<T>(operation: (repository: BillingRepository) => Promise<T>): Promise<T>;
  upsertSkus(skus: BillingSkuDto[], source: string): Promise<void>;
  listActiveSkus(): Promise<BillingSkuRecord[]>;
  getSkuByCode(code: string): Promise<BillingSkuRecord | null>;
  getSkuById(id: string): Promise<BillingSkuRecord | null>;
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderRecord>;
  updateOrderProviderPayload(
    orderId: string,
    providerPayload: Record<string, unknown>,
  ): Promise<PaymentOrderRecord | null>;
  getOrderById(orderId: string): Promise<PaymentOrderRecord | null>;
  getOrderByMerchantOrderNo(merchantOrderNo: string): Promise<PaymentOrderRecord | null>;
  listOrdersForUser(userId: string, limit?: number): Promise<PaymentOrderRecord[]>;
  listOrders(limit?: number): Promise<PaymentOrderRecord[]>;
  markOrderPaid(input: MarkOrderPaidInput): Promise<PaymentOrderRecord | null>;
  markOrderStatus(input: MarkOrderStatusInput): Promise<PaymentOrderRecord | null>;
  getLedgerEntryBySource(
    sourceType: BillingLedgerSourceType,
    sourceId: string,
  ): Promise<BillingLedgerEntryRecord | null>;
  addLedgerEntry(input: CreateLedgerEntryInput): Promise<BillingLedgerEntryRecord>;
  listLedgerEntriesForUser(userId: string): Promise<BillingLedgerEntryRecord[]>;
  createUsageReservation(input: CreateUsageReservationInput): Promise<BillingUsageReservationRecord>;
  getReservationByRunId(runId: string): Promise<BillingUsageReservationRecord | null>;
  confirmUsageReservation(runId: string, confirmedAt: string): Promise<BillingUsageReservationRecord | null>;
  releaseUsageReservation(runId: string, releasedAt: string): Promise<BillingUsageReservationRecord | null>;
  countReservedUsageForUser(userId: string): Promise<number>;
  countReservedCreditsForUser(userId: string): Promise<number>;
  countConfirmedPassUsageSince(userId: string, since: string): Promise<number>;
  recordPaymentNotification(
    input: CreatePaymentNotificationInput,
  ): Promise<{ record: PaymentNotificationRecord; inserted: boolean }>;
  listPaymentNotifications(limit?: number): Promise<PaymentNotificationRecord[]>;
}
