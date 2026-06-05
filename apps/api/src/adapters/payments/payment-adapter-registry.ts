// Assembles payment adapters while keeping mock payments out of production.
import type { PaymentProviderRegistry } from "./types.js";
import { createMockPaymentAdapter } from "./mock-payment-adapter.js";
import { createWechatNativePaymentAdapter } from "./wechat/native-adapter.js";
import { createAlipayPagePaymentAdapter } from "./alipay/page-adapter.js";

export function createPaymentProviderRegistry({
  env = process.env,
  nodeEnv = process.env.NODE_ENV ?? null,
}: {
  env?: Record<string, string | undefined>;
  nodeEnv?: string | null;
} = {}): PaymentProviderRegistry {
  const production = nodeEnv === "production";
  return {
    wechat_native: production
      ? createWechatNativePaymentAdapter(env)
      : createMockPaymentAdapter({ channel: "wechat_native", nodeEnv }),
    alipay_page: production
      ? createAlipayPagePaymentAdapter(env)
      : createMockPaymentAdapter({ channel: "alipay_page", nodeEnv }),
  };
}
