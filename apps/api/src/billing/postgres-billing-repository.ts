// Persists billing catalog, orders, entitlement ledger, and run reservations to PostgreSQL.
import { randomUUID } from "node:crypto";
import type { BillingOrderStatus, BillingSkuDto, PaymentChannel } from "@uml-platform/contracts";
import { withTransaction, type Queryable, type TransactionPool } from "../db/transactions.js";
import type {
  BillingLedgerEntryRecord,
  BillingLedgerSourceType,
  BillingRepository,
  BillingReservationKind,
  BillingReservationStatus,
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

type SkuRow = {
  id: string;
  code: string;
  kind: BillingSkuDto["kind"];
  name: string;
  description: string;
  duration_days: number | null;
  credit_amount: number | null;
  amount_cents: number;
  currency: "CNY";
  active: boolean;
  sort_order: number;
  metadata_json: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
};

type OrderRow = {
  id: string;
  merchant_order_no: string;
  user_id: string;
  sku_id: string;
  provider: PaymentChannel;
  amount_cents: number;
  currency: "CNY";
  status: BillingOrderStatus;
  provider_transaction_id: string | null;
  provider_payload_json: Record<string, unknown>;
  client_return_url: string | null;
  expires_at: string | Date;
  paid_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  sku_code: string;
  sku_kind: BillingSkuDto["kind"];
  sku_name: string;
  sku_description: string;
  sku_duration_days: number | null;
  sku_credit_amount: number | null;
  sku_amount_cents: number;
  sku_currency: "CNY";
  sku_active: boolean;
  sku_sort_order: number;
  sku_metadata_json: Record<string, unknown>;
  sku_created_at: string | Date;
  sku_updated_at: string | Date;
};

type LedgerRow = {
  id: string;
  user_id: string;
  source_type: BillingLedgerSourceType;
  source_id: string;
  credit_delta: number;
  valid_from: string | Date | null;
  valid_until: string | Date | null;
  metadata_json: Record<string, unknown>;
  created_at: string | Date;
  sku_code: string | null;
  sku_name: string | null;
};

type ReservationRow = {
  id: string;
  run_id: string;
  user_id: string;
  project_id: string | null;
  task_type: string;
  reservation_kind: BillingReservationKind;
  credit_delta: number;
  status: BillingReservationStatus;
  created_at: string | Date;
  confirmed_at: string | Date | null;
  released_at: string | Date | null;
  metadata_json: Record<string, unknown>;
};

type NotificationRow = {
  id: string;
  provider: PaymentChannel;
  provider_event_id: string | null;
  merchant_order_no: string | null;
  provider_transaction_id: string | null;
  notification_status: PaymentNotificationRecord["status"];
  sanitized_payload_json: Record<string, unknown>;
  error_message: string | null;
  created_at: string | Date;
};

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapSkuRow(row: SkuRow): BillingSkuRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    description: row.description,
    durationDays: row.duration_days,
    creditAmount: row.credit_amount,
    amountCents: Number(row.amount_cents),
    currency: "CNY",
    active: row.active,
    sortOrder: Number(row.sort_order),
    metadata: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapOrderRow(row: OrderRow): PaymentOrderRecord {
  const sku: BillingSkuRecord = {
    id: row.sku_id,
    code: row.sku_code,
    kind: row.sku_kind,
    name: row.sku_name,
    description: row.sku_description,
    durationDays: row.sku_duration_days,
    creditAmount: row.sku_credit_amount,
    amountCents: Number(row.sku_amount_cents),
    currency: "CNY",
    active: row.sku_active,
    sortOrder: Number(row.sku_sort_order),
    metadata: row.sku_metadata_json ?? {},
    createdAt: toIsoString(row.sku_created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.sku_updated_at) ?? new Date().toISOString(),
  };
  return {
    id: row.id,
    merchantOrderNo: row.merchant_order_no,
    userId: row.user_id,
    skuId: row.sku_id,
    sku,
    provider: row.provider,
    amountCents: Number(row.amount_cents),
    currency: "CNY",
    status: row.status,
    providerTransactionId: row.provider_transaction_id,
    providerPayload: row.provider_payload_json ?? {},
    clientReturnUrl: row.client_return_url ?? null,
    expiresAt: toIsoString(row.expires_at) ?? new Date().toISOString(),
    paidAt: toIsoString(row.paid_at),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapLedgerRow(row: LedgerRow): BillingLedgerEntryRecord {
  const metadata = row.metadata_json ?? {};
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    skuCode:
      row.sku_code ??
      (typeof metadata.skuCode === "string" ? metadata.skuCode : null),
    skuName:
      row.sku_name ??
      (typeof metadata.skuName === "string" ? metadata.skuName : null),
    creditDelta: Number(row.credit_delta),
    validFrom: toIsoString(row.valid_from) ?? toIsoString(row.created_at) ?? new Date().toISOString(),
    validUntil: toIsoString(row.valid_until),
    metadata,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

function mapReservationRow(row: ReservationRow): BillingUsageReservationRecord {
  return {
    id: row.id,
    runId: row.run_id,
    userId: row.user_id,
    projectId: row.project_id,
    taskType: row.task_type as BillingUsageReservationRecord["taskType"],
    entitlementKind: row.reservation_kind,
    creditDelta: Number(row.credit_delta),
    status: row.status,
    reservedAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    confirmedAt: toIsoString(row.confirmed_at),
    releasedAt: toIsoString(row.released_at),
    metadata: row.metadata_json ?? {},
  };
}

function mapNotificationRow(row: NotificationRow): PaymentNotificationRecord {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    merchantOrderNo: row.merchant_order_no,
    providerTransactionId: row.provider_transaction_id,
    status: row.notification_status,
    payload: row.sanitized_payload_json ?? {},
    errorMessage: row.error_message,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

const orderSelect = `
  select
    orders.id, orders.merchant_order_no, orders.user_id, orders.sku_id,
    orders.provider, orders.amount_cents, orders.currency, orders.status,
    orders.provider_transaction_id, orders.provider_payload_json,
    orders.client_return_url, orders.expires_at, orders.paid_at,
    orders.created_at, orders.updated_at,
    skus.code as sku_code, skus.kind as sku_kind, skus.name as sku_name,
    skus.description as sku_description, skus.duration_days as sku_duration_days,
    skus.credit_amount as sku_credit_amount, skus.amount_cents as sku_amount_cents,
    skus.currency as sku_currency, skus.active as sku_active,
    skus.sort_order as sku_sort_order, skus.metadata_json as sku_metadata_json,
    skus.created_at as sku_created_at, skus.updated_at as sku_updated_at
  from payment_orders orders
  join billing_skus skus on skus.id = orders.sku_id
`;

const ledgerSelect = `
  select ledger.id, ledger.user_id, ledger.source_type, ledger.source_id,
    ledger.credit_delta, ledger.valid_from, ledger.valid_until,
    ledger.metadata_json, ledger.created_at, skus.code as sku_code, skus.name as sku_name
  from billing_entitlement_ledger ledger
  left join billing_skus skus on skus.id = ledger.sku_id
`;

class PostgresBillingRepository implements BillingRepository {
  constructor(
    private readonly db: Queryable,
    private readonly pool?: TransactionPool,
  ) {}

  async withTransaction<T>(operation: (repository: BillingRepository) => Promise<T>): Promise<T> {
    if (!this.pool) return operation(this);
    return withTransaction(this.pool, (client) =>
      operation(new PostgresBillingRepository(client)),
    );
  }

  async upsertSkus(skus: BillingSkuDto[], source: string) {
    for (const sku of skus) {
      await this.db.query(
        `
          insert into billing_skus (
            id, code, kind, name, description, duration_days, credit_amount,
            amount_cents, currency, active, sort_order, metadata_json, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'CNY', $9, $10, $11::jsonb, now())
          on conflict (code) do update set
            kind = excluded.kind,
            name = excluded.name,
            description = excluded.description,
            duration_days = excluded.duration_days,
            credit_amount = excluded.credit_amount,
            amount_cents = excluded.amount_cents,
            active = excluded.active,
            sort_order = excluded.sort_order,
            metadata_json = excluded.metadata_json,
            updated_at = now()
        `,
        [
          `sku_${sku.code}`,
          sku.code,
          sku.kind,
          sku.name,
          sku.description,
          sku.durationDays,
          sku.creditAmount,
          sku.amountCents,
          sku.active,
          sku.sortOrder,
          JSON.stringify({ source }),
        ],
      );
    }
  }

  async listActiveSkus() {
    const result = await this.db.query<SkuRow>(
      `
        select id, code, kind, name, description, duration_days, credit_amount,
          amount_cents, currency, active, sort_order, metadata_json, created_at, updated_at
        from billing_skus
        where active = true
        order by sort_order asc
      `,
    );
    return result.rows.map(mapSkuRow);
  }

  async getSkuByCode(code: string) {
    const result = await this.db.query<SkuRow>(
      `
        select id, code, kind, name, description, duration_days, credit_amount,
          amount_cents, currency, active, sort_order, metadata_json, created_at, updated_at
        from billing_skus
        where code = $1
      `,
      [code],
    );
    return result.rows[0] ? mapSkuRow(result.rows[0]) : null;
  }

  async getSkuById(id: string) {
    const result = await this.db.query<SkuRow>(
      `
        select id, code, kind, name, description, duration_days, credit_amount,
          amount_cents, currency, active, sort_order, metadata_json, created_at, updated_at
        from billing_skus
        where id = $1
      `,
      [id],
    );
    return result.rows[0] ? mapSkuRow(result.rows[0]) : null;
  }

  async createOrder(input: CreatePaymentOrderInput) {
    const result = await this.db.query<OrderRow>(
      `
        insert into payment_orders (
          id, merchant_order_no, user_id, sku_id, provider, amount_cents,
          currency, status, client_return_url, expires_at
        )
        values ($1, $2, $3, $4, $5, $6, 'CNY', 'pending', $7, $8)
        returning *
      `,
      [
        randomUUID(),
        input.merchantOrderNo,
        input.userId,
        input.sku.id,
        input.provider,
        input.amountCents,
        input.clientReturnUrl,
        input.expiresAt,
      ],
    );
    const order = await this.getOrderById(result.rows[0]!.id);
    if (!order) throw new Error("Payment order was not persisted");
    return order;
  }

  async updateOrderProviderPayload(orderId: string, providerPayload: Record<string, unknown>) {
    await this.db.query(
      `
        update payment_orders
        set provider_payload_json = $2::jsonb, updated_at = now()
        where id = $1
      `,
      [orderId, JSON.stringify(providerPayload)],
    );
    return this.getOrderById(orderId);
  }

  async getOrderById(orderId: string) {
    const result = await this.db.query<OrderRow>(`${orderSelect} where orders.id = $1`, [
      orderId,
    ]);
    return result.rows[0] ? mapOrderRow(result.rows[0]) : null;
  }

  async getOrderByMerchantOrderNo(merchantOrderNo: string) {
    const result = await this.db.query<OrderRow>(
      `${orderSelect} where orders.merchant_order_no = $1`,
      [merchantOrderNo],
    );
    return result.rows[0] ? mapOrderRow(result.rows[0]) : null;
  }

  async listOrdersForUser(userId: string, limit = 20) {
    const result = await this.db.query<OrderRow>(
      `${orderSelect} where orders.user_id = $1 order by orders.created_at desc limit $2`,
      [userId, limit],
    );
    return result.rows.map(mapOrderRow);
  }

  async listOrders(limit = 100) {
    const result = await this.db.query<OrderRow>(
      `${orderSelect} order by orders.created_at desc limit $1`,
      [limit],
    );
    return result.rows.map(mapOrderRow);
  }

  async markOrderPaid(input: MarkOrderPaidInput) {
    await this.db.query(
      `
        update payment_orders
        set status = 'paid',
          provider_transaction_id = $2,
          provider_payload_json = $3::jsonb,
          paid_at = coalesce(paid_at, $4),
          updated_at = now()
        where id = $1
      `,
      [
        input.orderId,
        input.providerTransactionId,
        JSON.stringify(input.providerPayload),
        input.paidAt,
      ],
    );
    return this.getOrderById(input.orderId);
  }

  async markOrderStatus(input: MarkOrderStatusInput) {
    await this.db.query(
      `
        update payment_orders
        set status = case
            when status = 'paid' and $2 not in ('refund_pending', 'refunded') then status
            else $2
          end,
          provider_transaction_id = coalesce($3, provider_transaction_id),
          provider_payload_json = coalesce($4::jsonb, provider_payload_json),
          updated_at = now()
        where id = $1
      `,
      [
        input.orderId,
        input.status,
        input.providerTransactionId ?? null,
        input.providerPayload ? JSON.stringify(input.providerPayload) : null,
      ],
    );
    return this.getOrderById(input.orderId);
  }

  async getLedgerEntryBySource(sourceType: BillingLedgerSourceType, sourceId: string) {
    const result = await this.db.query<LedgerRow>(
      `${ledgerSelect} where ledger.source_type = $1 and ledger.source_id = $2 limit 1`,
      [sourceType, sourceId],
    );
    return result.rows[0] ? mapLedgerRow(result.rows[0]) : null;
  }

  async addLedgerEntry(input: CreateLedgerEntryInput) {
    const existing = await this.getLedgerEntryBySource(input.sourceType, input.sourceId);
    if (existing) return existing;

    const sku = input.skuCode ? await this.getSkuByCode(input.skuCode) : null;
    try {
      const result = await this.db.query<{ id: string }>(
        `
          insert into billing_entitlement_ledger (
            id, user_id, source_type, source_id, sku_id, credit_delta,
            valid_from, valid_until, metadata_json
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
          returning id
        `,
        [
          randomUUID(),
          input.userId,
          input.sourceType,
          input.sourceId,
          sku?.id ?? null,
          input.creditDelta,
          input.validFrom,
          input.validUntil ?? null,
          JSON.stringify({
            ...(input.metadata ?? {}),
            skuCode: input.skuCode ?? sku?.code ?? null,
            skuName: input.skuName ?? sku?.name ?? null,
          }),
        ],
      );
      const entry = await this.getLedgerById(result.rows[0]!.id);
      if (!entry) throw new Error("Billing ledger entry was not persisted");
      return entry;
    } catch (error) {
      const duplicate = await this.getLedgerEntryBySource(input.sourceType, input.sourceId);
      if (duplicate) return duplicate;
      throw error;
    }
  }

  async listLedgerEntriesForUser(userId: string) {
    const result = await this.db.query<LedgerRow>(
      `${ledgerSelect} where ledger.user_id = $1 order by ledger.created_at asc`,
      [userId],
    );
    return result.rows.map(mapLedgerRow);
  }

  async createUsageReservation(input: CreateUsageReservationInput) {
    await this.db.query(
      `
        insert into billing_usage_reservations (
          id, run_id, user_id, project_id, task_type, reservation_kind,
          credit_delta, status, created_at, metadata_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'reserved', $8, $9::jsonb)
        on conflict (run_id) do nothing
      `,
      [
        randomUUID(),
        input.runId,
        input.userId,
        input.projectId ?? null,
        input.taskType,
        input.entitlementKind,
        input.creditDelta,
        input.reservedAt,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const reservation = await this.getReservationByRunId(input.runId);
    if (!reservation) throw new Error("Billing usage reservation was not persisted");
    return reservation;
  }

  async getReservationByRunId(runId: string) {
    const result = await this.db.query<ReservationRow>(
      `
        select id, run_id, user_id, project_id, task_type, reservation_kind,
          credit_delta, status, created_at, confirmed_at, released_at, metadata_json
        from billing_usage_reservations
        where run_id = $1
      `,
      [runId],
    );
    return result.rows[0] ? mapReservationRow(result.rows[0]) : null;
  }

  async confirmUsageReservation(runId: string, confirmedAt: string) {
    await this.db.query(
      `
        update billing_usage_reservations
        set status = case when status = 'reserved' then 'confirmed' else status end,
          confirmed_at = case when confirmed_at is null and status = 'reserved' then $2 else confirmed_at end,
          updated_at = now()
        where run_id = $1
      `,
      [runId, confirmedAt],
    );
    return this.getReservationByRunId(runId);
  }

  async releaseUsageReservation(runId: string, releasedAt: string) {
    await this.db.query(
      `
        update billing_usage_reservations
        set status = 'released', released_at = $2, updated_at = now()
        where run_id = $1 and status = 'reserved'
      `,
      [runId, releasedAt],
    );
    return this.getReservationByRunId(runId);
  }

  async voidUsageReservation(runId: string, releasedAt: string) {
    await this.db.query(
      `
        update billing_usage_reservations
        set status = 'released',
          released_at = coalesce(released_at, $2),
          updated_at = now()
        where run_id = $1 and status <> 'released'
      `,
      [runId, releasedAt],
    );
    return this.getReservationByRunId(runId);
  }

  async countReservedCreditsForUser(userId: string) {
    const result = await this.db.query<{ count: string }>(
      `
        select count(*)::text as count
        from billing_usage_reservations
        where user_id = $1 and status = 'reserved' and reservation_kind = 'credit'
      `,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countConfirmedPassUsageSince(userId: string, since: string) {
    const result = await this.db.query<{ count: string }>(
      `
        select count(*)::text as count
        from billing_usage_reservations
        where user_id = $1
          and status = 'confirmed'
          and reservation_kind = 'time_pass'
          and confirmed_at >= $2
      `,
      [userId, since],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async recordPaymentNotification(input: CreatePaymentNotificationInput) {
    if (input.providerEventId) {
      const existing = await this.findNotification(input.provider, input.providerEventId);
      if (existing) return { record: existing, inserted: false };
    }
    try {
      const result = await this.db.query<{ id: string }>(
        `
          insert into payment_notifications (
            id, provider, provider_event_id, merchant_order_no, provider_transaction_id,
            notification_status, verified, sanitized_payload_json, error_message
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
          returning id
        `,
        [
          randomUUID(),
          input.provider,
          input.providerEventId ?? null,
          input.merchantOrderNo ?? null,
          input.providerTransactionId ?? null,
          input.status,
          input.status === "processed" || input.status === "verified",
          JSON.stringify(input.payload),
          input.errorMessage ?? null,
        ],
      );
      const record = await this.getNotificationById(result.rows[0]!.id);
      if (!record) throw new Error("Payment notification was not persisted");
      return { record, inserted: true };
    } catch (error) {
      if (input.providerEventId) {
        const duplicate = await this.findNotification(input.provider, input.providerEventId);
        if (duplicate) return { record: duplicate, inserted: false };
      }
      throw error;
    }
  }

  async listPaymentNotifications(limit = 100) {
    const result = await this.db.query<NotificationRow>(
      `
        select id, provider, provider_event_id, merchant_order_no,
          provider_transaction_id, notification_status, sanitized_payload_json,
          error_message, created_at
        from payment_notifications
        order by created_at desc
        limit $1
      `,
      [limit],
    );
    return result.rows.map(mapNotificationRow);
  }

  private async getLedgerById(id: string) {
    const result = await this.db.query<LedgerRow>(
      `${ledgerSelect} where ledger.id = $1 limit 1`,
      [id],
    );
    return result.rows[0] ? mapLedgerRow(result.rows[0]) : null;
  }

  private async findNotification(provider: PaymentChannel, providerEventId: string) {
    const result = await this.db.query<NotificationRow>(
      `
        select id, provider, provider_event_id, merchant_order_no,
          provider_transaction_id, notification_status, sanitized_payload_json,
          error_message, created_at
        from payment_notifications
        where provider = $1 and provider_event_id = $2
        limit 1
      `,
      [provider, providerEventId],
    );
    return result.rows[0] ? mapNotificationRow(result.rows[0]) : null;
  }

  private async getNotificationById(id: string) {
    const result = await this.db.query<NotificationRow>(
      `
        select id, provider, provider_event_id, merchant_order_no,
          provider_transaction_id, notification_status, sanitized_payload_json,
          error_message, created_at
        from payment_notifications
        where id = $1
      `,
      [id],
    );
    return result.rows[0] ? mapNotificationRow(result.rows[0]) : null;
  }
}

export function createPostgresBillingRepository(pool: Queryable & Partial<TransactionPool>) {
  const transactionPool =
    typeof pool.connect === "function" ? (pool as TransactionPool) : undefined;
  return new PostgresBillingRepository(pool, transactionPool);
}
