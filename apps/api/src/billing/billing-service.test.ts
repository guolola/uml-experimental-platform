// Exercises billing invariants around server-priced orders, idempotent grants, and run entitlement reservations.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { PaymentChannel } from "@uml-platform/contracts";
import { createMockPaymentAdapter } from "../adapters/payments/mock-payment-adapter.js";
import type { PaymentProviderRegistry } from "../adapters/payments/types.js";
import { createBillingService } from "./billing-service.js";
import { createInMemoryBillingRepository } from "./in-memory-billing-repository.js";

const MOCK_SECRET = "billing-service-test-secret";
const FIXED_NOW = new Date("2026-06-05T04:00:00.000Z");

function mockRegistry(nodeEnv = "test"): PaymentProviderRegistry {
  return {
    wechat_native: createMockPaymentAdapter({
      channel: "wechat_native",
      nodeEnv,
      secret: MOCK_SECRET,
    }),
    alipay_page: createMockPaymentAdapter({
      channel: "alipay_page",
      nodeEnv,
      secret: MOCK_SECRET,
    }),
  };
}

async function createTestService(input: {
  env?: Record<string, string | undefined>;
  nodeEnv?: string;
} = {}) {
  const repository = createInMemoryBillingRepository();
  const service = createBillingService({
    repository,
    paymentProviders: mockRegistry(input.nodeEnv ?? "test"),
    nodeEnv: input.nodeEnv ?? "test",
    env: input.env ?? {},
    now: () => FIXED_NOW,
  });
  await service.ensureSkuCatalog();
  return { repository, service };
}

function sign(rawBody: string) {
  return createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
}

async function payOrder(input: {
  service: Awaited<ReturnType<typeof createTestService>>["service"];
  userId: string;
  skuCode: string;
  channel?: PaymentChannel;
  amountOverride?: number;
  eventId?: string;
}) {
  const channel = input.channel ?? "wechat_native";
  const order = await input.service.createOrder(
    { id: input.userId, emailVerified: true },
    { skuCode: input.skuCode, channel },
  );
  const rawBody = JSON.stringify({
    channel,
    merchantOrderNo: order.merchantOrderNo,
    providerTransactionId: `txn_${order.merchantOrderNo}`,
    providerEventId: input.eventId ?? `evt_${order.merchantOrderNo}`,
    amountCents: input.amountOverride ?? order.amountCents,
    currency: "CNY",
    state: "paid",
    paidAt: FIXED_NOW.toISOString(),
  });
  const callbackResult = await input.service.processPaymentCallback({
    channel,
    headers: { "x-uml-mock-payment-signature": sign(rawBody) },
    body: JSON.parse(rawBody),
    rawBody,
  });
  return { order, callbackResult, rawBody };
}

test("billing catalog exposes the configured PC web SKUs and server-priced orders", async () => {
  const { service } = await createTestService();
  const catalog = await service.listSkus();

  assert.equal(catalog.skus.length, 8);
  assert.deepEqual(
    catalog.skus.map((sku) => sku.code),
    [
      "time_day",
      "time_week",
      "time_month",
      "time_year",
      "credits_10",
      "credits_50",
      "credits_100",
      "credits_500",
    ],
  );

  const order = await service.createOrder(
    { id: "user-price", emailVerified: true },
    { skuCode: "credits_10", channel: "wechat_native" },
  );
  assert.equal(order.amountCents, 990);
  assert.equal(order.currency, "CNY");
  assert.ok(order.codeUrl?.startsWith("uml-mock-pay://"));
});

test("email verification signup bonus is idempotent and powers credit reservations", async () => {
  const { service } = await createTestService();

  await service.grantSignupBonus("user-bonus");
  await service.grantSignupBonus("user-bonus");
  assert.equal((await service.getSummary("user-bonus")).creditBalance, 5);

  const reserved = await service.reserveRunUsage({
    runId: "run-reserve-release",
    userId: "user-bonus",
    taskType: "requirements_to_uml",
  });
  assert.equal(reserved.allowed, true);
  assert.equal((await service.getSummary("user-bonus")).creditBalance, 4);
  await service.releaseRunUsage("run-reserve-release");
  assert.equal((await service.getSummary("user-bonus")).creditBalance, 5);

  const confirmed = await service.reserveRunUsage({
    runId: "run-confirm",
    userId: "user-bonus",
    taskType: "design_modeling",
  });
  assert.equal(confirmed.allowed, true);
  await service.confirmRunUsage("run-confirm");
  await service.confirmRunUsage("run-confirm");
  assert.equal((await service.getSummary("user-bonus")).creditBalance, 4);
});

test("run reservation distinguishes no entitlement from pass soft protection", async () => {
  const empty = await createTestService();
  const noEntitlement = await empty.service.reserveRunUsage({
    runId: "run-empty",
    userId: "user-empty",
    taskType: "requirements_to_uml",
  });
  if (noEntitlement.allowed) assert.fail("reservation unexpectedly succeeded");
  assert.equal(noEntitlement.statusCode, 402);
  assert.equal(noEntitlement.error.reason, "no_entitlement");

  const softLimited = await createTestService({
    env: { UML_BILLING_PASS_DAILY_SOFT_LIMIT: "1" },
  });
  await payOrder({
    service: softLimited.service,
    userId: "user-pass",
    skuCode: "time_day",
  });
  const firstPassRun = await softLimited.service.reserveRunUsage({
    runId: "run-pass-1",
    userId: "user-pass",
    taskType: "requirements_to_uml",
  });
  assert.equal(firstPassRun.allowed, true);
  await softLimited.service.confirmRunUsage("run-pass-1");

  const blocked = await softLimited.service.reserveRunUsage({
    runId: "run-pass-2",
    userId: "user-pass",
    taskType: "requirements_to_uml",
  });
  if (blocked.allowed) assert.fail("soft-limited pass reservation unexpectedly succeeded");
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.error.reason, "pass_soft_limit");
});

test("payment callbacks verify signatures, validate amount, and grant purchases idempotently", async () => {
  const { service } = await createTestService();
  const paid = await payOrder({
    service,
    userId: "user-callback",
    skuCode: "credits_10",
    eventId: "evt-paid-once",
  });
  assert.deepEqual(paid.callbackResult, { ok: true, duplicate: false });

  const duplicate = await service.processPaymentCallback({
    channel: "wechat_native",
    headers: { "x-uml-mock-payment-signature": sign(paid.rawBody) },
    body: JSON.parse(paid.rawBody),
    rawBody: paid.rawBody,
  });
  assert.deepEqual(duplicate, { ok: true, duplicate: true });
  assert.equal((await service.getSummary("user-callback")).creditBalance, 10);

  await assert.rejects(
    () =>
      payOrder({
        service,
        userId: "user-callback",
        skuCode: "credits_50",
        amountOverride: 1,
        eventId: "evt-bad-amount",
      }),
    /amount does not match/,
  );
});

test("production orders fail closed without explicit official payment configuration", async () => {
  const { service } = await createTestService({ nodeEnv: "production" });

  await assert.rejects(
    () =>
      service.createOrder(
        { id: "user-prod", emailVerified: true },
        { skuCode: "credits_10", channel: "wechat_native" },
      ),
    /Production billing requires UML_BILLING_SKUS_JSON/,
  );
});
