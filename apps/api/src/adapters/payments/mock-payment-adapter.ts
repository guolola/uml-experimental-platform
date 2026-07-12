// Supplies signed sandbox payments for local development and automated tests only.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentChannel } from "@uml-platform/contracts";
import type {
  PaymentCallbackInput,
  PaymentProviderAdapter,
  ProviderCreatePaymentInput,
  ProviderPaymentCallback,
} from "./types.js";

type MockCallbackBody = {
  channel?: unknown;
  merchantOrderNo?: unknown;
  providerTransactionId?: unknown;
  providerEventId?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  state?: unknown;
  paidAt?: unknown;
};

function headerValue(headers: PaymentCallbackInput["headers"], name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function sign(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readBody(input: PaymentCallbackInput, secret?: string): MockCallbackBody {
  if (input.body && typeof input.body === "object") {
    const formBody = input.body as { payload?: unknown; signature?: unknown };
    if (typeof formBody.payload === "string") {
      if (
        typeof formBody.signature !== "string" ||
        !secureEqual(
          formBody.signature,
          sign(
            formBody.payload,
            secret ?? process.env.UML_MOCK_PAYMENT_SECRET ?? "local-mock-payment-secret",
          ),
        )
      ) {
        throw new Error("Mock payment form signature is invalid");
      }
      return JSON.parse(formBody.payload) as MockCallbackBody;
    }
    return input.body as MockCallbackBody;
  }
  return JSON.parse(input.rawBody || "{}") as MockCallbackBody;
}

function normalizeCallback(channel: PaymentChannel, body: MockCallbackBody): ProviderPaymentCallback {
  if (body.channel !== channel) {
    throw new Error("Mock payment channel mismatch");
  }
  if (
    typeof body.merchantOrderNo !== "string" ||
    typeof body.providerTransactionId !== "string" ||
    typeof body.amountCents !== "number" ||
    body.currency !== "CNY"
  ) {
    throw new Error("Mock payment callback payload is incomplete");
  }
  const state = body.state === "paid" ? "paid" : body.state === "closed" ? "closed" : "failed";
  return {
    channel,
    merchantOrderNo: body.merchantOrderNo,
    providerTransactionId: body.providerTransactionId,
    providerEventId:
      typeof body.providerEventId === "string" ? body.providerEventId : body.providerTransactionId,
    amountCents: body.amountCents,
    currency: "CNY",
    state,
    paidAt: typeof body.paidAt === "string" ? body.paidAt : new Date().toISOString(),
    rawPayload: { ...body },
  };
}

export function createMockPaymentAdapter({
  channel,
  nodeEnv,
  secret = process.env.UML_MOCK_PAYMENT_SECRET ?? "local-mock-payment-secret",
}: {
  channel: PaymentChannel;
  nodeEnv: string | null;
  secret?: string;
}): PaymentProviderAdapter {
  const production = nodeEnv === "production";
  return {
    channel,
    isConfigured() {
      return !production;
    },
    async createPayment(input: ProviderCreatePaymentInput) {
      if (production) {
        throw new Error("Mock payment adapter is disabled in production");
      }
      const payload = {
        sandbox: true,
        channel,
        merchantOrderNo: input.merchantOrderNo,
        amountCents: input.amountCents,
      };
      const formBody = JSON.stringify({
        channel,
        merchantOrderNo: input.merchantOrderNo,
        providerTransactionId: `mock_${input.merchantOrderNo}`,
        providerEventId: `mock_evt_${input.merchantOrderNo}`,
        amountCents: input.amountCents,
        currency: "CNY",
        state: "paid",
      });
      const signature = sign(formBody, secret);
      return {
        providerPayload: payload,
        paymentFormHtml: `<form method="post" action="/api/billing/callbacks/epay"><input type="hidden" name="payload" value='${formBody.replace(/'/g, "&#39;")}' /><input type="hidden" name="signature" value="${signature}" /><button type="submit">支付</button></form>`,
        redirectUrl: input.returnUrl ?? undefined,
      };
    },
    async queryPayment(order) {
      return {
        channel,
        merchantOrderNo: order.merchantOrderNo,
        providerTransactionId: order.providerTransactionId ?? `mock_${order.merchantOrderNo}`,
        providerEventId: null,
        amountCents: order.amountCents,
        currency: "CNY",
        state: order.status === "paid" ? "paid" : "pending",
        paidAt: order.paidAt,
        rawPayload: order.providerPayload,
      };
    },
    async verifyCallback(input: PaymentCallbackInput) {
      if (
        input.body &&
        typeof input.body === "object" &&
        typeof (input.body as { payload?: unknown }).payload === "string"
      ) {
        return normalizeCallback(channel, readBody(input, secret));
      }
      const signature = headerValue(input.headers, "x-uml-mock-payment-signature");
      if (!signature || !secureEqual(signature, sign(input.rawBody, secret))) {
        throw new Error("Mock payment callback signature is invalid");
      }
      return normalizeCallback(channel, readBody(input, secret));
    },
  };
}
