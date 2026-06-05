// Defines payment adapter boundaries so billing service can validate provider callbacks uniformly.
import type { PaymentChannel } from "@uml-platform/contracts";
import type { PaymentOrderRecord } from "../../billing/types.js";

export type ProviderPaymentState = "pending" | "paid" | "failed" | "closed" | "refunded";

export type ProviderCreatePaymentInput = {
  merchantOrderNo: string;
  subject: string;
  amountCents: number;
  currency: "CNY";
  expiresAt: string;
  notifyUrl: string;
  returnUrl?: string | null;
};

export type ProviderCreatePaymentResult = {
  providerPayload: Record<string, unknown>;
  codeUrl?: string;
  paymentFormHtml?: string;
  redirectUrl?: string;
};

export type ProviderPaymentCallback = {
  channel: PaymentChannel;
  merchantOrderNo: string;
  providerTransactionId: string;
  providerEventId: string | null;
  amountCents: number;
  currency: "CNY";
  state: ProviderPaymentState;
  paidAt: string | null;
  rawPayload: Record<string, unknown>;
};

export type PaymentCallbackInput = {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody: string;
};

export interface PaymentProviderAdapter {
  channel: PaymentChannel;
  isConfigured(): boolean;
  createPayment(input: ProviderCreatePaymentInput): Promise<ProviderCreatePaymentResult>;
  queryPayment(order: PaymentOrderRecord): Promise<ProviderPaymentCallback | null>;
  verifyCallback(input: PaymentCallbackInput): Promise<ProviderPaymentCallback>;
}

export type PaymentProviderRegistry = Record<PaymentChannel, PaymentProviderAdapter>;
