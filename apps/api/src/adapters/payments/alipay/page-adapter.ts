// Implements Alipay computer website payment signing and callback verification.
import { createSign, createVerify } from "node:crypto";
import type { PaymentProviderAdapter, PaymentCallbackInput } from "../types.js";

type AlipayEnv = Record<string, string | undefined>;

function configFromEnv(env: AlipayEnv) {
  return {
    appId: env.ALIPAY_APP_ID?.trim(),
    privateKey: env.ALIPAY_PRIVATE_KEY?.replace(/\\n/g, "\n").trim(),
    publicKey: env.ALIPAY_PUBLIC_KEY?.replace(/\\n/g, "\n").trim(),
    notifyUrl: env.ALIPAY_NOTIFY_URL?.trim(),
    gateway: env.ALIPAY_GATEWAY_URL?.trim() ?? "https://openapi.alipay.com/gateway.do",
  };
}

function configured(config: ReturnType<typeof configFromEnv>) {
  return Boolean(config.appId && config.privateKey && config.publicKey && config.notifyUrl);
}

function formatAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function centsFromAmount(value: string) {
  const [yuan = "0", fraction = ""] = value.split(".");
  return Number(yuan) * 100 + Number((fraction + "00").slice(0, 2));
}

function canonicalParams(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function signParams(params: Record<string, string>, privateKey: string) {
  return createSign("RSA-SHA256")
    .update(canonicalParams(params))
    .sign(privateKey, "base64");
}

function verifyParams(params: Record<string, string>, publicKey: string) {
  const signature = params.sign;
  if (!signature) return false;
  const unsigned = { ...params };
  delete unsigned.sign;
  delete unsigned.sign_type;
  return createVerify("RSA-SHA256")
    .update(canonicalParams(unsigned))
    .verify(publicKey, signature, "base64");
}

function formHtml(action: string, params: Record<string, string>) {
  const fields = Object.entries(params)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${key}" value="${value.replace(/"/g, "&quot;")}" />`,
    )
    .join("");
  return `<form id="alipay-submit" name="alipay-submit" method="post" action="${action}">${fields}<noscript><button type="submit">继续支付</button></noscript></form><script>document.getElementById("alipay-submit").submit();</script>`;
}

function bodyToParams(input: PaymentCallbackInput) {
  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    return Object.fromEntries(
      Object.entries(input.body as Record<string, unknown>).map(([key, value]) => [
        key,
        Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""),
      ]),
    );
  }
  return Object.fromEntries(new URLSearchParams(input.rawBody));
}

export function createAlipayPagePaymentAdapter(
  env: AlipayEnv = process.env,
): PaymentProviderAdapter {
  const config = configFromEnv(env);
  return {
    channel: "alipay_page",
    isConfigured() {
      return configured(config);
    },
    async createPayment(input) {
      if (!configured(config)) {
        throw new Error("Alipay page payment configuration is incomplete");
      }
      const bizContent = JSON.stringify({
        out_trade_no: input.merchantOrderNo,
        product_code: "FAST_INSTANT_TRADE_PAY",
        total_amount: formatAmount(input.amountCents),
        subject: input.subject,
        time_expire: input.expiresAt.replace("T", " ").replace(/\.\d{3}Z$/, ""),
      });
      const params: Record<string, string> = {
        app_id: config.appId!,
        method: "alipay.trade.page.pay",
        format: "JSON",
        charset: "utf-8",
        sign_type: "RSA2",
        timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
        version: "1.0",
        notify_url: config.notifyUrl!,
        biz_content: bizContent,
      };
      if (input.returnUrl) params.return_url = input.returnUrl;
      params.sign = signParams(params, config.privateKey!);
      return {
        providerPayload: {
          alipay: {
            outTradeNo: input.merchantOrderNo,
            amountCents: input.amountCents,
          },
        },
        paymentFormHtml: formHtml(config.gateway, params),
      };
    },
    async queryPayment(order) {
      return {
        channel: "alipay_page",
        merchantOrderNo: order.merchantOrderNo,
        providerTransactionId: order.providerTransactionId ?? "",
        providerEventId: null,
        amountCents: order.amountCents,
        currency: "CNY",
        state: order.status === "paid" ? "paid" : "pending",
        paidAt: order.paidAt,
        rawPayload: order.providerPayload,
      };
    },
    async verifyCallback(input) {
      if (!configured(config)) {
        throw new Error("Alipay callback verification configuration is incomplete");
      }
      const params = bodyToParams(input);
      if (!verifyParams(params, config.publicKey!)) {
        throw new Error("Alipay callback signature is invalid");
      }
      const tradeStatus = params.trade_status;
      if (!params.out_trade_no || !params.trade_no || !params.total_amount) {
        throw new Error("Alipay callback payload is incomplete");
      }
      return {
        channel: "alipay_page",
        merchantOrderNo: params.out_trade_no,
        providerTransactionId: params.trade_no,
        providerEventId: params.notify_id || params.trade_no,
        amountCents: centsFromAmount(params.total_amount),
        currency: "CNY",
        state:
          tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED"
            ? "paid"
            : tradeStatus === "TRADE_CLOSED"
              ? "closed"
              : "pending",
        paidAt: params.gmt_payment || null,
        rawPayload: params,
      };
    },
  };
}

export { centsFromAmount };
