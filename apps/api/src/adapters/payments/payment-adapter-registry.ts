// Assembles the active payment adapter while keeping mock payments out of production.
import type { PaymentProviderRegistry } from "./types.js";
import { createMockPaymentAdapter } from "./mock-payment-adapter.js";
import { createEpayAlipayPaymentAdapter } from "./epay/aggregate-adapter.js";

export function createPaymentProviderRegistry({
  env = process.env,
  nodeEnv = process.env.NODE_ENV ?? null,
}: {
  env?: Record<string, string | undefined>;
  nodeEnv?: string | null;
} = {}): PaymentProviderRegistry {
  const production = nodeEnv === "production";
  return {
    alipay: production
      ? createEpayAlipayPaymentAdapter(env)
      : createMockPaymentAdapter({ channel: "alipay", nodeEnv }),
  };
}
