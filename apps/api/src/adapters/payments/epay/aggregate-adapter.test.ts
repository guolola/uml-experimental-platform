// Verifies aggregate payment MD5 signing and callback normalization.
import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeEpayParams,
  createEpayAlipayPaymentAdapter,
  signEpayParams,
} from "./aggregate-adapter.js";

const TEST_ENV = {
  EPAY_GATEWAY_URL: "https://zpayz.cn/",
  EPAY_PID: "test-pid",
  EPAY_KEY: "test-secret",
  EPAY_NOTIFY_URL: "https://jianglisoftware.com/api/billing/callbacks/epay",
  EPAY_RETURN_URL: "https://jianglisoftware.com/billing/alipay/return",
  EPAY_SITE_NAME: "UML Experimental Platform",
};

test("epay signing sorts parameters and excludes sign metadata", () => {
  const params = {
    sign: "ignored",
    sign_type: "MD5",
    type: "alipay",
    money: "9.90",
    pid: "test-pid",
    out_trade_no: "UML202606050001",
    empty: "",
  };

  assert.equal(
    canonicalizeEpayParams(params),
    "money=9.90&out_trade_no=UML202606050001&pid=test-pid&type=alipay",
  );
  assert.equal(
    signEpayParams(params, "test-secret"),
    "a1a2d110e0d0fa91b772c0bc92e4b7bb",
  );
});

test("epay adapter creates Alipay submit forms without exposing the merchant key", async () => {
  const adapter = createEpayAlipayPaymentAdapter(TEST_ENV);
  const result = await adapter.createPayment({
    merchantOrderNo: "UML202606050001",
    subject: "100 次包",
    amountCents: 9900,
    currency: "CNY",
    expiresAt: "2026-06-05T04:15:00.000Z",
    notifyUrl: "",
    returnUrl: "https://jianglisoftware.com/billing/alipay/return",
    param: "order-1",
  });

  assert.match(result.paymentFormHtml ?? "", /https:\/\/zpayz\.cn\/submit\.php/);
  assert.match(result.paymentFormHtml ?? "", /name="type" value="alipay"/);
  assert.match(result.paymentFormHtml ?? "", /name="money" value="99.00"/);
  assert.match(result.paymentFormHtml ?? "", /name="return_url" value="https:\/\/jianglisoftware\.com\/billing\/alipay\/return"/);
  assert.match(result.paymentFormHtml ?? "", /name="param" value="order-1"/);
  assert.doesNotMatch(result.paymentFormHtml ?? "", /orderId=/);
  assert.doesNotMatch(result.paymentFormHtml ?? "", /test-secret/);
});

test("epay callback verification rejects bad signatures and normalizes paid callbacks", async () => {
  const adapter = createEpayAlipayPaymentAdapter(TEST_ENV);
  const callback = {
    pid: "test-pid",
    trade_no: "202606050001",
    out_trade_no: "UML202606050001",
    type: "alipay",
    name: "100 次包",
    money: "99.00",
    trade_status: "TRADE_SUCCESS",
  };
  const rawBody = new URLSearchParams({
    ...callback,
    sign: signEpayParams(callback, TEST_ENV.EPAY_KEY),
    sign_type: "MD5",
  }).toString();

  const normalized = await adapter.verifyCallback({
    headers: {},
    body: Object.fromEntries(new URLSearchParams(rawBody)),
    rawBody,
  });
  assert.equal(normalized.channel, "alipay");
  assert.equal(normalized.merchantOrderNo, "UML202606050001");
  assert.equal(normalized.amountCents, 9900);
  assert.equal(normalized.state, "paid");

  await assert.rejects(
    () =>
      adapter.verifyCallback({
        headers: {},
        body: { ...callback, sign: "bad", sign_type: "MD5" },
        rawBody: "",
      }),
    /signature is invalid/,
  );
});

test("epay order query treats status zero as pending", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 1,
        trade_no: "202606050001",
        out_trade_no: "UML202606050001",
        type: "alipay",
        money: "99.00",
        status: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  try {
    const adapter = createEpayAlipayPaymentAdapter(TEST_ENV);
    const queried = await adapter.queryPayment({
      id: "order-1",
      merchantOrderNo: "UML202606050001",
      userId: "user-1",
      skuId: "sku-1",
      sku: {
        id: "sku-1",
        code: "credits_100",
        name: "100 次包",
        kind: "credit_pack",
        description: "买 100 次送 20 次，到账 120 次",
        durationDays: null,
        creditAmount: 120,
        amountCents: 9900,
        currency: "CNY",
        active: true,
        sortOrder: 130,
        metadata: {},
        createdAt: "2026-06-05T04:00:00.000Z",
        updatedAt: "2026-06-05T04:00:00.000Z",
      },
      provider: "alipay",
      amountCents: 9900,
      currency: "CNY",
      status: "pending",
      providerTransactionId: null,
      providerPayload: {},
      clientReturnUrl: null,
      expiresAt: "2026-06-05T04:15:00.000Z",
      paidAt: null,
      createdAt: "2026-06-05T04:00:00.000Z",
      updatedAt: "2026-06-05T04:00:00.000Z",
    });
    assert.equal(queried?.state, "pending");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
