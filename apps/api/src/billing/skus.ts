// Defines server-owned billing SKU defaults and runtime overrides.
import { billingSkuDtoSchema, type BillingSkuDto } from "@uml-platform/contracts";

export const DEFAULT_BILLING_SKUS: BillingSkuDto[] = [
  {
    code: "time_day",
    name: "日卡",
    kind: "time_pass",
    description: "1 天 AI 生成通行卡",
    durationDays: 1,
    creditAmount: null,
    amountCents: 990,
    currency: "CNY",
    active: true,
    sortOrder: 10,
  },
  {
    code: "time_week",
    name: "周卡",
    kind: "time_pass",
    description: "7 天 AI 生成通行卡",
    durationDays: 7,
    creditAmount: null,
    amountCents: 3900,
    currency: "CNY",
    active: true,
    sortOrder: 20,
  },
  {
    code: "time_month",
    name: "月卡",
    kind: "time_pass",
    description: "30 天 AI 生成通行卡",
    durationDays: 30,
    creditAmount: null,
    amountCents: 9900,
    currency: "CNY",
    active: true,
    sortOrder: 30,
  },
  {
    code: "time_year",
    name: "年卡",
    kind: "time_pass",
    description: "365 天 AI 生成通行卡",
    durationDays: 365,
    creditAmount: null,
    amountCents: 99900,
    currency: "CNY",
    active: true,
    sortOrder: 40,
  },
  {
    code: "credits_10",
    name: "10 次包",
    kind: "credit_pack",
    description: "10 次 AI 生成次数包，默认不过期",
    durationDays: null,
    creditAmount: 10,
    amountCents: 990,
    currency: "CNY",
    active: true,
    sortOrder: 110,
  },
  {
    code: "credits_50",
    name: "50 次包",
    kind: "credit_pack",
    description: "50 次 AI 生成次数包，默认不过期",
    durationDays: null,
    creditAmount: 50,
    amountCents: 3900,
    currency: "CNY",
    active: true,
    sortOrder: 120,
  },
  {
    code: "credits_100",
    name: "100 次包",
    kind: "credit_pack",
    description: "100 次 AI 生成次数包，默认不过期",
    durationDays: null,
    creditAmount: 100,
    amountCents: 6900,
    currency: "CNY",
    active: true,
    sortOrder: 130,
  },
  {
    code: "credits_500",
    name: "500 次包",
    kind: "credit_pack",
    description: "500 次 AI 生成次数包，默认不过期",
    durationDays: null,
    creditAmount: 500,
    amountCents: 29900,
    currency: "CNY",
    active: true,
    sortOrder: 140,
  },
];

function parseSkuOverrides(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("UML_BILLING_SKUS_JSON must be a JSON array");
  }
  return parsed.map((item) => billingSkuDtoSchema.parse(item));
}

export function resolveBillingSkusFromEnv({
  env = process.env,
}: {
  env?: Record<string, string | undefined>;
} = {}) {
  const overrideSkus = parseSkuOverrides(env.UML_BILLING_SKUS_JSON);
  return {
    skus: overrideSkus ?? DEFAULT_BILLING_SKUS,
    source: overrideSkus ? ("env" as const) : ("default" as const),
  };
}
