// Defines provider setting references, provider config DTOs, risk states, and config test response schemas.
import { z } from "zod";

export const resolvedProviderSettingsSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});
export type ProviderSettings = z.infer<typeof resolvedProviderSettingsSchema>;

export const managedProviderSettingsSchema = z.object({
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
});
export type ManagedProviderSettings = z.infer<
  typeof managedProviderSettingsSchema
>;

export const providerSettingsSchema = managedProviderSettingsSchema;
export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;

export const imageProviderSettingsSchema = resolvedProviderSettingsSchema.extend({
  model: z.enum([
    "gpt-image-2",
    "gemini-3.1-flash-image-preview-2k",
    "nano-banana-pro",
  ]),
});
export type ImageProviderSettings = z.infer<
  typeof imageProviderSettingsSchema
>;

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();

export const providerConfigStatusSchema = z.enum([
  "active",
  "disabled",
  "revoked",
]);
export type ProviderConfigStatus = z.infer<typeof providerConfigStatusSchema>;

export const providerRiskStateSchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type ProviderRiskState = z.infer<typeof providerRiskStateSchema>;

export const providerBreakerStateSchema = z.enum(["closed", "open"]);
export type ProviderBreakerState = z.infer<typeof providerBreakerStateSchema>;

export const providerConfigScopeTypeSchema = z.enum([
  "system",
  "user",
  "project",
]);
export type ProviderConfigScopeType = z.infer<
  typeof providerConfigScopeTypeSchema
>;

export const providerConfigDtoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    baseUrl: z.string().url(),
    defaultModel: z.string().trim().min(1),
    allowedModels: z.array(z.string().trim().min(1)),
    maskedKey: z.string().trim().min(1),
    status: providerConfigStatusSchema,
    riskState: providerRiskStateSchema,
    quota: z.string().trim().min(1),
    lastUsedAt: optionalNullableTimestampSchema,
    scopeType: providerConfigScopeTypeSchema,
    scopeId: z.string().min(1).nullable(),
    breakerState: providerBreakerStateSchema,
  })
  .strict();
export type ProviderConfigDto = z.infer<typeof providerConfigDtoSchema>;

export const providerConfigListResponseSchema = z
  .object({
    providerConfigs: z.array(providerConfigDtoSchema),
  })
  .strict();
export type ProviderConfigListResponse = z.infer<
  typeof providerConfigListResponseSchema
>;

export const providerConfigTestRequestSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProviderConfigTestRequest = z.infer<
  typeof providerConfigTestRequestSchema
>;

export const providerConfigTestResponseSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().min(1),
    capability: z.unknown().optional(),
    breaker: z
      .object({
        state: providerBreakerStateSchema,
        failureCount: z.number().int().min(0),
        openedAt: optionalNullableTimestampSchema,
        lastFailureAt: optionalNullableTimestampSchema,
      })
      .optional(),
  })
  .strict();
export type ProviderConfigTestResponse = z.infer<
  typeof providerConfigTestResponseSchema
>;
