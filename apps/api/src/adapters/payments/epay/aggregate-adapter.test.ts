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
    returnUrl: "https://jianglisoftware.com/billing/alipay/return?orderId=order-1",
  });

  assert.match(result.paymentFormHtml ?? "", /https:\/\/zpayz\.cn\/submit\.php/);
  assert.match(result.paymentFormHtml ?? "", /name="type" value="alipay"/);
  assert.match(result.paymentFormHtml ?? "", /name="money" value="99.00"/);
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
