// Implements WeChat Pay v3 Native payment calls and verified callback normalization.
import { createDecipheriv, createSign, createVerify, randomBytes } from "node:crypto";
import type { PaymentProviderAdapter, PaymentCallbackInput } from "../types.js";
import type { PaymentOrderRecord } from "../../../billing/types.js";

type WechatEnv = Record<string, string | undefined>;

type WechatCallbackResource = {
  algorithm: string;
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

type WechatCallbackBody = {
  id?: string;
  create_time?: string;
  event_type?: string;
  resource?: WechatCallbackResource;
};

type WechatTransaction = {
  appid?: string;
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  success_time?: string;
  amount?: {
    total?: number;
    currency?: string;
    payer_total?: number;
    payer_currency?: string;
  };
};

function requiredConfig(env: WechatEnv) {
  return {
    appId: env.WECHAT_PAY_APP_ID?.trim(),
    mchId: env.WECHAT_PAY_MCH_ID?.trim(),
    serialNo: env.WECHAT_PAY_SERIAL_NO?.trim(),
    privateKey: env.WECHAT_PAY_PRIVATE_KEY?.replace(/\\n/g, "\n").trim(),
    apiV3Key: env.WECHAT_PAY_API_V3_KEY?.trim(),
    notifyUrl: env.WECHAT_PAY_NOTIFY_URL?.trim(),
    platformPublicKey: env.WECHAT_PAY_PLATFORM_PUBLIC_KEY?.replace(/\\n/g, "\n").trim(),
    gateway: env.WECHAT_PAY_GATEWAY?.trim() ?? "https://api.mch.weixin.qq.com",
  };
}

function configured(config: ReturnType<typeof requiredConfig>) {
  return Boolean(
    config.appId &&
      config.mchId &&
      config.serialNo &&
      config.privateKey &&
      config.apiV3Key &&
      config.notifyUrl,
  );
}

function signRequest({
  method,
  path,
  body,
  mchId,
  serialNo,
  privateKey,
}: {
  method: string;
  path: string;
  body: string;
  mchId: string;
  serialNo: string;
  privateKey: string;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = createSign("RSA-SHA256").update(message).sign(privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

function headerValue(headers: PaymentCallbackInput["headers"], name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function verifyWechatSignature(input: PaymentCallbackInput, platformPublicKey: string) {
  const timestamp = headerValue(input.headers, "wechatpay-timestamp");
  const nonce = headerValue(input.headers, "wechatpay-nonce");
  const signature = headerValue(input.headers, "wechatpay-signature");
  if (!timestamp || !nonce || !signature) {
    throw new Error("WeChat Pay callback signature headers are missing");
  }
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonce}\n${input.rawBody}\n`);
  if (!verifier.verify(platformPublicKey, signature, "base64")) {
    throw new Error("WeChat Pay callback signature is invalid");
  }
}

function decryptResource(resource: WechatCallbackResource, apiV3Key: string) {
  if (resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error("WeChat Pay callback resource uses an unsupported algorithm");
  }
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8"),
  );
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as WechatTransaction;
}

function parseWechatBody(input: PaymentCallbackInput) {
  if (input.body && typeof input.body === "object") {
    return input.body as WechatCallbackBody;
  }
  return JSON.parse(input.rawBody || "{}") as WechatCallbackBody;
}

function centsFromYuanString(value: string) {
  const [yuan = "0", fraction = ""] = value.split(".");
  return Number(yuan) * 100 + Number((fraction + "00").slice(0, 2));
}

export function createWechatNativePaymentAdapter(
  env: WechatEnv = process.env,
): PaymentProviderAdapter {
  const config = requiredConfig(env);
  return {
    channel: "wechat_native",
    isConfigured() {
      return configured(config);
    },
    async createPayment(input) {
      if (!configured(config)) {
        throw new Error("WeChat Pay Native configuration is incomplete");
      }
      const path = "/v3/pay/transactions/native";
      const payload = {
        appid: config.appId,
        mchid: config.mchId,
        description: input.subject,
        out_trade_no: input.merchantOrderNo,
        notify_url: config.notifyUrl,
        amount: {
          total: input.amountCents,
          currency: "CNY",
        },
        time_expire: input.expiresAt,
      };
      const body = JSON.stringify(payload);
      const response = await fetch(`${config.gateway}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: signRequest({
            method: "POST",
            path,
            body,
            mchId: config.mchId!,
            serialNo: config.serialNo!,
            privateKey: config.privateKey!,
          }),
        },
        body,
      });
      const responseBody = (await response.json().catch(() => ({}))) as { code_url?: string; message?: string };
      if (!response.ok || typeof responseBody.code_url !== "string") {
        throw new Error(responseBody.message ?? `WeChat Pay Native request failed with HTTP ${response.status}`);
      }
      return {
        providerPayload: {
          wechat: responseBody,
          request: { outTradeNo: input.merchantOrderNo, amountCents: input.amountCents },
        },
        codeUrl: responseBody.code_url,
      };
    },
    async queryPayment(order: PaymentOrderRecord) {
      // WeChat Pay order polling is intentionally conservative here; callbacks own
      // final state transitions so idempotency and signature checks stay centralized.
      return {
        channel: "wechat_native",
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
      if (!configured(config) || !config.platformPublicKey || !config.apiV3Key) {
        throw new Error("WeChat Pay callback verification configuration is incomplete");
      }
      verifyWechatSignature(input, config.platformPublicKey);
      const body = parseWechatBody(input);
      if (!body.resource) {
        throw new Error("WeChat Pay callback resource is missing");
      }
      const transaction = decryptResource(body.resource, config.apiV3Key);
      if (!transaction.out_trade_no || !transaction.transaction_id) {
        throw new Error("WeChat Pay callback transaction is incomplete");
      }
      const amountCents =
        typeof transaction.amount?.total === "number"
          ? transaction.amount.total
          : typeof transaction.amount?.payer_total === "number"
            ? transaction.amount.payer_total
            : 0;
      const currency = transaction.amount?.currency ?? transaction.amount?.payer_currency;
      if (currency !== "CNY") {
        throw new Error("WeChat Pay callback currency is not CNY");
      }
      return {
        channel: "wechat_native",
        merchantOrderNo: transaction.out_trade_no,
        providerTransactionId: transaction.transaction_id,
        providerEventId: body.id ?? transaction.transaction_id,
        amountCents,
        currency: "CNY",
        state:
          transaction.trade_state === "SUCCESS"
            ? "paid"
            : transaction.trade_state === "CLOSED" || transaction.trade_state === "REVOKED"
              ? "closed"
              : "failed",
        paidAt: transaction.success_time ?? null,
        rawPayload: { notification: body, transaction },
      };
    },
  };
}

export { centsFromYuanString };
