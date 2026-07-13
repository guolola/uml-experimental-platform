// Defines billing request, response, entitlement, SKU, and payment order schemas shared by API and web clients.
import { z } from "zod";

export const paymentChannelSchema = z.enum(["alipay"]);
export type PaymentChannel = z.infer<typeof paymentChannelSchema>;

export const billingSkuKindSchema = z.enum(["credit_pack"]);
export type BillingSkuKind = z.infer<typeof billingSkuKindSchema>;

export const billingOrderStatusSchema = z.enum([
  "pending",
  "paid",
  "expired",
  "closed",
  "failed",
  "refund_pending",
  "refunded",
]);
export type BillingOrderStatus = z.infer<typeof billingOrderStatusSchema>;

export const billingSkuDtoSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  kind: billingSkuKindSchema,
  description: z.string().min(1),
  durationDays: z.number().int().positive().nullable(),
  creditAmount: z.number().int().positive().nullable(),
  amountCents: z.number().int().positive(),
  currency: z.literal("CNY"),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type BillingSkuDto = z.infer<typeof billingSkuDtoSchema>;

export const billingSkuListResponseSchema = z.object({
  skus: z.array(billingSkuDtoSchema),
});
export type BillingSkuListResponse = z.infer<typeof billingSkuListResponseSchema>;

export const billingSignupBonusSchema = z.object({
  granted: z.boolean(),
  creditAmount: z.number().int().min(0),
  validUntil: z.string().min(1).nullable(),
});
export type BillingSignupBonus = z.infer<typeof billingSignupBonusSchema>;

export const billingOrderStatusDtoSchema = z.object({
  orderId: z.string().min(1),
  merchantOrderNo: z.string().min(1),
  sku: billingSkuDtoSchema,
  amountCents: z.number().int().positive(),
  currency: z.literal("CNY"),
  channel: paymentChannelSchema,
  status: billingOrderStatusSchema,
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  paidAt: z.string().min(1).nullable(),
});
export type BillingOrderStatusDto = z.infer<typeof billingOrderStatusDtoSchema>;

export const billingSummarySchema = z.object({
  creditBalance: z.number().int(),
  signupBonus: billingSignupBonusSchema,
  recentOrders: z.array(billingOrderStatusDtoSchema),
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;

export const createPaymentOrderRequestSchema = z
  .object({
    skuCode: z.string().min(1),
    channel: paymentChannelSchema,
    returnUrl: z.string().url().optional(),
  })
  .strict();
export type CreatePaymentOrderRequest = z.infer<
  typeof createPaymentOrderRequestSchema
>;

export const createPaymentOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  merchantOrderNo: z.string().min(1),
  status: billingOrderStatusSchema,
  amountCents: z.number().int().positive(),
  currency: z.literal("CNY"),
  expiresAt: z.string().min(1),
  channel: paymentChannelSchema,
  codeUrl: z.string().min(1).optional(),
  paymentFormHtml: z.string().min(1).optional(),
  redirectUrl: z.string().url().optional(),
});
export type CreatePaymentOrderResponse = z.infer<
  typeof createPaymentOrderResponseSchema
>;

export const resumePaymentOrderResponseSchema = createPaymentOrderResponseSchema;
export type ResumePaymentOrderResponse = z.infer<
  typeof resumePaymentOrderResponseSchema
>;

export const billingEntitlementFailureReasonSchema = z.enum([
  "no_entitlement",
  "negative_balance",
]);
export type BillingEntitlementFailureReason = z.infer<
  typeof billingEntitlementFailureReasonSchema
>;

export const billingEntitlementErrorResponseSchema = z.object({
  message: z.string().min(1),
  reason: billingEntitlementFailureReasonSchema,
  billingSummary: billingSummarySchema,
  payCta: z.object({
    label: z.string().min(1),
    href: z.string().min(1),
  }),
});
export type BillingEntitlementErrorResponse = z.infer<
  typeof billingEntitlementErrorResponseSchema
>;
