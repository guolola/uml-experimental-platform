// Defines server-owned billing SKU defaults and runtime overrides.
import { billingSkuDtoSchema, type BillingSkuDto } from "@uml-platform/contracts";

export const DEFAULT_BILLING_SKUS: BillingSkuDto[] = [
  {
    code: "credits_10",
    name: "10 次包",
    kind: "credit_pack",
    description: "买 10 次送 1 次，到账 11 次",
    durationDays: null,
    creditAmount: 11,
    amountCents: 990,
    currency: "CNY",
    active: true,
    sortOrder: 110,
  },
  {
    code: "credits_50",
    name: "50 次包",
    kind: "credit_pack",
    description: "买 50 次送 8 次，到账 58 次",
    durationDays: null,
    creditAmount: 58,
    amountCents: 4900,
    currency: "CNY",
    active: true,
    sortOrder: 120,
  },
  {
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
  },
  {
    code: "credits_500",
    name: "500 次包",
    kind: "credit_pack",
    description: "买 500 次送 120 次，到账 620 次",
    durationDays: null,
    creditAmount: 620,
    amountCents: 39900,
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
