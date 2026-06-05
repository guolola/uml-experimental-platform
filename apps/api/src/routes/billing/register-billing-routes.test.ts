// Verifies billing HTTP boundaries for authenticated users and super-admin compensation actions.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createMockPaymentAdapter } from "../../adapters/payments/mock-payment-adapter.js";
import type { PaymentProviderRegistry } from "../../adapters/payments/types.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { hashPassword } from "../../security/password-hashing.js";
import { createBillingService } from "../../billing/billing-service.js";
import { createInMemoryBillingRepository } from "../../billing/in-memory-billing-repository.js";
import { registerBillingRoutes } from "./register-billing-routes.js";

function mockPaymentProviders(): PaymentProviderRegistry {
  return {
    wechat_native: createMockPaymentAdapter({
      channel: "wechat_native",
      nodeEnv: "test",
      secret: "billing-routes-test-secret",
    }),
    alipay_page: createMockPaymentAdapter({
      channel: "alipay_page",
      nodeEnv: "test",
      secret: "billing-routes-test-secret",
    }),
  };
}

async function sessionCookie(
  authStore: ReturnType<typeof createInMemoryAuthStore>,
  userId: string,
  name: "uml_session" | "uml_admin_session",
) {
  const session = await authStore.createSession({
    userId,
    ipAddress: "127.0.0.1",
    userAgent: "billing-routes-test",
  });
  return `${name}=${encodeURIComponent(session.id)}`;
}

async function createBillingRouteTestApp() {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const user = authStore.createUser({
    email: "billing-user@example.com",
    displayName: "Billing User",
    passwordHash: hashPassword("password-123"),
    emailVerified: true,
  });
  const admin = authStore.createUser({
    email: "billing-admin@example.com",
    displayName: "Billing Admin",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["super_admin"],
  });
  assert.ok(user);
  assert.ok(admin);
  const billingService = createBillingService({
    repository: createInMemoryBillingRepository(),
    paymentProviders: mockPaymentProviders(),
    nodeEnv: "test",
    now: () => new Date("2026-06-05T04:00:00.000Z"),
  });
  await billingService.ensureSkuCatalog();
  registerBillingRoutes({ app, authStore, billingService });
  return {
    app,
    user,
    userCookie: await sessionCookie(authStore, user.id, "uml_session"),
    adminCookie: await sessionCookie(authStore, admin.id, "uml_admin_session"),
  };
}

test("billing routes expose SKUs, server-priced orders, and admin adjustments", async () => {
  const { app, user, userCookie, adminCookie } = await createBillingRouteTestApp();

  const skus = await app.inject({ method: "GET", url: "/api/billing/skus" });
  assert.equal(skus.statusCode, 200);
  assert.equal(skus.json().skus.length, 8);

  const blockedOrder = await app.inject({
    method: "POST",
    url: "/api/billing/orders",
    payload: { skuCode: "credits_10", channel: "wechat_native" },
  });
  assert.equal(blockedOrder.statusCode, 401);

  const createdOrder = await app.inject({
    method: "POST",
    url: "/api/billing/orders",
    headers: { cookie: userCookie },
    payload: { skuCode: "credits_10", channel: "wechat_native" },
  });
  assert.equal(createdOrder.statusCode, 201);
  assert.equal(createdOrder.json().amountCents, 990);

  const ownOrder = await app.inject({
    method: "GET",
    url: `/api/billing/orders/${createdOrder.json().orderId}`,
    headers: { cookie: userCookie },
  });
  assert.equal(ownOrder.statusCode, 200);
  assert.equal(ownOrder.json().merchantOrderNo, createdOrder.json().merchantOrderNo);

  const adminOrders = await app.inject({
    method: "GET",
    url: "/api/admin/billing/orders",
    headers: { cookie: adminCookie },
  });
  assert.equal(adminOrders.statusCode, 200);
  assert.equal(adminOrders.json().orders[0].userId, user.id);

  const adjustment = await app.inject({
    method: "POST",
    url: `/api/admin/billing/users/${user.id}/adjustments`,
    headers: { cookie: adminCookie },
    payload: { creditAmount: 3, reason: "support compensation" },
  });
  assert.equal(adjustment.statusCode, 201);

  const ledger = await app.inject({
    method: "GET",
    url: `/api/admin/billing/users/${user.id}/ledger`,
    headers: { cookie: adminCookie },
  });
  assert.equal(ledger.statusCode, 200);
  assert.equal(ledger.json().summary.creditBalance, 3);

  const refund = await app.inject({
    method: "POST",
    url: `/api/admin/billing/orders/${createdOrder.json().orderId}/refunds`,
    headers: { cookie: adminCookie },
  });
  assert.equal(refund.statusCode, 200);
  assert.equal(refund.json().order.status, "refund_pending");

  await app.close();
});
