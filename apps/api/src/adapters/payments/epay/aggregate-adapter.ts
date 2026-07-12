// Implements the MD5-signed aggregate payment gateway used for Alipay checkout.
import { createHash } from "node:crypto";
import type {
  PaymentCallbackInput,
  PaymentProviderAdapter,
  ProviderPaymentCallback,
} from "../types.js";
import type { PaymentOrderRecord } from "../../../billing/types.js";

type EpayEnv = Record<string, string | undefined>;

type EpayOrderQueryResponse = {
  code?: number | string;
  msg?: string;
  trade_no?: string;
  out_trade_no?: string;
  type?: string;
  money?: string | number;
  status?: string | number;
  trade_status?: string;
  endtime?: string;
  addtime?: string;
  [key: string]: unknown;
};

function configFromEnv(env: EpayEnv) {
  return {
    gatewayUrl: env.EPAY_GATEWAY_URL?.trim().replace(/\/+$/u, ""),
    pid: env.EPAY_PID?.trim(),
    key: env.EPAY_KEY?.trim(),
    notifyUrl: env.EPAY_NOTIFY_URL?.trim(),
    returnUrl: env.EPAY_RETURN_URL?.trim(),
    siteName: env.EPAY_SITE_NAME?.trim() || "UML Experimental Platform",
  };
}

function configured(config: ReturnType<typeof configFromEnv>) {
  return Boolean(config.gatewayUrl && config.pid && config.key && config.notifyUrl);
}

function formatAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function centsFromMoney(value: string | number) {
  const normalized = String(value).trim();
  const [yuan = "0", fraction = ""] = normalized.split(".");
  return Number(yuan) * 100 + Number((fraction + "00").slice(0, 2));
}

function canonicalizeEpayParams(params: Record<string, unknown>) {
  return Object.entries(params)
    .filter(([key, value]) => {
      if (key === "sign" || key === "sign_type") return false;
      return value !== undefined && value !== null && String(value) !== "";
    })
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
}

function signEpayParams(params: Record<string, unknown>, key: string) {
  return createHash("md5")
    .update(`${canonicalizeEpayParams(params)}${key}`)
    .digest("hex");
}

function formEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formHtml(action: string, params: Record<string, string>) {
  const fields = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${formEscape(value)}" />`)
    .join("");
  return `<form id="epay-submit" name="epay-submit" method="post" action="${formEscape(action)}">${fields}<noscript><button type="submit">继续支付</button></noscript></form><script>document.getElementById("epay-submit").submit();</script>`;
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

function providerState(value: string | number | undefined) {
  const status = String(value ?? "").toUpperCase();
  if (status === "TRADE_SUCCESS" || status === "SUCCESS" || status === "1" || status === "PAID") {
    return "paid" as const;
  }
  if (status === "TRADE_CLOSED" || status === "CLOSED" || status === "0") {
    return "closed" as const;
  }
  return "failed" as const;
}

function normalizePaidAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function assertEpaySignature(params: Record<string, string>, key: string) {
  const expected = signEpayParams(params, key);
  if (!params.sign || params.sign.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Epay callback signature is invalid");
  }
}

function normalizeCallback(params: Record<string, string>, key: string, pid: string): ProviderPaymentCallback {
  assertEpaySignature(params, key);
  if (params.pid && params.pid !== pid) {
    throw new Error("Epay callback merchant pid does not match");
  }
  if (!params.out_trade_no || !params.money) {
    throw new Error("Epay callback payload is incomplete");
  }
  const providerTransactionId = params.trade_no || params.out_trade_no;
  return {
    channel: "alipay",
    merchantOrderNo: params.out_trade_no,
    providerTransactionId,
    providerEventId: providerTransactionId,
    amountCents: centsFromMoney(params.money),
    currency: "CNY",
    state: providerState(params.trade_status),
    paidAt: normalizePaidAt(params.endtime),
    rawPayload: params,
  };
}

function normalizeQuery(order: PaymentOrderRecord, payload: EpayOrderQueryResponse): ProviderPaymentCallback | null {
  if (String(payload.code ?? "") !== "1") return null;
  const merchantOrderNo = String(payload.out_trade_no || order.merchantOrderNo);
  const providerTransactionId = String(payload.trade_no || order.providerTransactionId || merchantOrderNo);
  return {
    channel: "alipay",
    merchantOrderNo,
    providerTransactionId,
    providerEventId: `query:${providerTransactionId}`,
    amountCents:
      payload.money === undefined ? order.amountCents : centsFromMoney(payload.money),
    currency: "CNY",
    state: providerState(payload.trade_status ?? payload.status),
    paidAt: normalizePaidAt(payload.endtime),
    rawPayload: payload,
  };
}

export function createEpayAlipayPaymentAdapter(env: EpayEnv = process.env): PaymentProviderAdapter {
  const config = configFromEnv(env);
  return {
    channel: "alipay",
    isConfigured() {
      return configured(config);
    },
    async createPayment(input) {
      if (!configured(config)) {
        throw new Error("Epay Alipay configuration is incomplete");
      }
      const params: Record<string, string> = {
        pid: config.pid!,
        type: "alipay",
        out_trade_no: input.merchantOrderNo,
        notify_url: config.notifyUrl!,
        return_url: input.returnUrl ?? config.returnUrl ?? "",
        name: input.subject,
        money: formatAmount(input.amountCents),
        sitename: config.siteName,
      };
      params.sign = signEpayParams(params, config.key!);
      params.sign_type = "MD5";
      return {
        providerPayload: {
          epay: {
            outTradeNo: input.merchantOrderNo,
            amountCents: input.amountCents,
            type: "alipay",
          },
        },
        paymentFormHtml: formHtml(`${config.gatewayUrl}/submit.php`, params),
      };
    },
    async queryPayment(order) {
      if (!configured(config)) {
        throw new Error("Epay Alipay configuration is incomplete");
      }
      const url = new URL(`${config.gatewayUrl}/api.php`);
      url.searchParams.set("act", "order");
      url.searchParams.set("pid", config.pid!);
      url.searchParams.set("key", config.key!);
      url.searchParams.set("out_trade_no", order.merchantOrderNo);
      const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
      const payload = (await response.json().catch(() => ({}))) as EpayOrderQueryResponse;
      if (!response.ok) {
        throw new Error(`Epay order query failed with HTTP ${response.status}`);
      }
      return normalizeQuery(order, payload);
    },
    async verifyCallback(input) {
      if (!configured(config)) {
        throw new Error("Epay callback verification configuration is incomplete");
      }
      return normalizeCallback(bodyToParams(input), config.key!, config.pid!);
    },
  };
}

export {
  canonicalizeEpayParams,
  centsFromMoney,
  signEpayParams,
};
