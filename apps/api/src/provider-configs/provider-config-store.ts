// Owns secure model provider configuration storage and no-readback API key views.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { normalizeProviderAllowedModels } from "./default-provider-models.js";

export type ProviderConfigStatus = "active" | "disabled" | "revoked";
export type ProviderRiskState = "low" | "medium" | "high" | "critical";
export type ProviderBreakerState = "closed" | "open";
export type ProviderConfigScopeType = "system" | "user" | "project";

export interface ProviderBreakerView {
  state: ProviderBreakerState;
  failureCount: number;
  openedAt: string | null;
  lastFailureAt: string | null;
}

export interface ProviderConfigView {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  allowlisted: boolean;
  maskedKey: string;
  keyPurpose: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  riskState: ProviderRiskState;
  defaultModel: string;
  allowedModels: string[];
  quota: string;
  status: ProviderConfigStatus;
  scopeType: ProviderConfigScopeType;
  scopeId: string | null;
  breakerState: ProviderBreakerState;
  breakerFailureCount: number;
  breakerOpenedAt: string | null;
  breakerLastFailureAt: string | null;
}

export interface ProviderAuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  result: "success" | "blocked" | "failed";
  createdAt: string;
}

interface StoredProviderConfig {
  view: ProviderConfigView;
  apiKeyCiphertext: string;
  apiKeyHash: string;
}

export interface ProviderConfigStore {
  create(input: {
    name: string;
    provider: string;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    allowedModels?: string[];
    keyPurpose?: string;
    createdBy: string;
    quota?: string;
    riskState?: ProviderRiskState;
    scopeType?: ProviderConfigScopeType;
    scopeId?: string | null;
  }): ProviderConfigView;
  list(): ProviderConfigView[];
  get(id: string): ProviderConfigView | null;
  updateMetadata?(id: string, input: {
    allowedModels?: string[];
    defaultModel?: string;
    keyPurpose?: string;
    name?: string;
    quota?: string;
    scopeId?: string | null;
    scopeType?: ProviderConfigScopeType;
  }, actor: string): ProviderConfigView | null;
  rotate(id: string, apiKey: string, actor: string): ProviderConfigView | null;
  disable?(id: string, actor: string): ProviderConfigView | null;
  enable?(id: string, actor: string): ProviderConfigView | null;
  revoke(id: string, actor: string): ProviderConfigView | null;
  getSecret(id: string): string | null;
  markUsed(id: string): ProviderConfigView | null;
  recordFailure?(id: string): ProviderConfigView | null;
  resetBreaker?(id: string): ProviderConfigView | null;
  listAuditLogs(): ProviderAuditLog[];
}

export class ProviderConfigPolicyError extends Error {}
export class ProviderConfigSecretError extends Error {}

function normalizeUrlOrigin(url: string) {
  try {
    return new URL(url.trim()).origin;
  } catch {
    throw new ProviderConfigPolicyError("Provider Base URL must be a valid URL");
  }
}

function createSecretKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encryptSecret(apiKey: string, secretKey: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString(
    "base64",
  )}`;
}

function decryptSecret(payload: string, secretKey: Buffer) {
  const [ivBase64, tagBase64, ciphertextBase64] = payload.split(".");
  if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new ProviderConfigSecretError("Provider secret payload is invalid");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey,
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function hashSecret(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  const lastFour = trimmed.slice(-4);
  const prefixMatch = /^[A-Za-z0-9]+-/.exec(trimmed);
  const prefix = prefixMatch?.[0] ?? "";
  return `${prefix}...${lastFour}`;
}

export function createProviderConfigStore({
  baseUrlAllowlist,
  secret,
  breakerFailureThreshold = 3,
}: {
  baseUrlAllowlist: string[];
  secret?: string;
  breakerFailureThreshold?: number;
}): ProviderConfigStore {
  const allowlist = new Set(baseUrlAllowlist.map(normalizeUrlOrigin));
  const secretKey = createSecretKey(
    secret ??
      process.env.UML_PROVIDER_CONFIG_SECRET ??
      "local-provider-config-secret-for-development-only",
  );
  const records = new Map<string, StoredProviderConfig>();
  const auditLogs: ProviderAuditLog[] = [];

  function assertAllowlisted(baseUrl: string) {
    const normalized = normalizeUrlOrigin(baseUrl);
    if (!allowlist.has(normalized)) {
      throw new ProviderConfigPolicyError(
        "Provider Base URL is not in the admin allowlist",
      );
    }
    return normalized;
  }

  function audit(input: {
    actor: string;
    action: string;
    target: string;
    result: ProviderAuditLog["result"];
  }) {
    auditLogs.unshift({
      id: randomUUID(),
      actor: input.actor,
      action: input.action,
      target: input.target,
      ip: "unknown",
      result: input.result,
      createdAt: new Date().toISOString(),
    });
  }

  function cloneView(view: ProviderConfigView): ProviderConfigView {
    return { ...view, allowedModels: [...view.allowedModels] };
  }

  function normalizeScope(input: {
    scopeType?: ProviderConfigScopeType;
    scopeId?: string | null;
  }) {
    const scopeType = input.scopeType ?? "system";
    const scopeId = input.scopeId?.trim() || null;
    if (scopeType === "system") return { scopeType, scopeId: null };
    if (!scopeId) {
      throw new ProviderConfigPolicyError(
        "Provider config user and project scopes require a scope id",
      );
    }
    return { scopeType, scopeId };
  }

  function closeBreaker(view: ProviderConfigView) {
    view.breakerState = "closed";
    view.breakerFailureCount = 0;
    view.breakerOpenedAt = null;
    view.breakerLastFailureAt = null;
  }

  return {
    create(input) {
      const baseUrl = assertAllowlisted(input.baseUrl);
      const scope = normalizeScope(input);
      const now = new Date().toISOString();
      const id = randomUUID();
      const view: ProviderConfigView = {
        id,
        name: input.name.trim(),
        provider: input.provider.trim(),
        baseUrl,
        allowlisted: true,
        maskedKey: maskApiKey(input.apiKey),
        keyPurpose: input.keyPurpose?.trim() || "admin-configured provider key",
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
        riskState: input.riskState ?? "medium",
        defaultModel: input.defaultModel.trim(),
        allowedModels: normalizeProviderAllowedModels(
          input.defaultModel,
          input.allowedModels,
          { baseUrl, provider: input.provider },
        ),
        quota: input.quota ?? "unlimited",
        status: "active",
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        breakerState: "closed",
        breakerFailureCount: 0,
        breakerOpenedAt: null,
        breakerLastFailureAt: null,
      };
      records.set(id, {
        view,
        apiKeyCiphertext: encryptSecret(input.apiKey.trim(), secretKey),
        apiKeyHash: hashSecret(input.apiKey.trim()),
      });
      audit({
        actor: input.createdBy,
        action: "create_provider_config",
        target: view.name,
        result: "success",
      });
      return cloneView(view);
    },
    list() {
      return Array.from(records.values(), (record) => cloneView(record.view));
    },
    get(id) {
      const record = records.get(id);
      return record ? cloneView(record.view) : null;
    },
    updateMetadata(id, input, actor) {
      const record = records.get(id);
      if (!record || record.view.status === "revoked") return null;
      const nextDefaultModel = input.defaultModel?.trim() || record.view.defaultModel;
      if (
        input.allowedModels &&
        !input.allowedModels.map((model) => model.trim()).includes(nextDefaultModel)
      ) {
        throw new ProviderConfigPolicyError("Provider default model must be included in allowed models");
      }
      const nextAllowedModels = normalizeProviderAllowedModels(
        nextDefaultModel,
        input.allowedModels ?? record.view.allowedModels,
        { baseUrl: record.view.baseUrl, provider: record.view.provider },
      );
      if (!nextAllowedModels.includes(nextDefaultModel)) {
        throw new ProviderConfigPolicyError("Provider default model must be included in allowed models");
      }
      const nextScopeType = input.scopeType ?? record.view.scopeType;
      const scope = normalizeScope({
        scopeType: nextScopeType,
        scopeId: nextScopeType === "system" ? null : input.scopeId ?? record.view.scopeId,
      });
      record.view.name = input.name?.trim() || record.view.name;
      record.view.keyPurpose = input.keyPurpose?.trim() || record.view.keyPurpose;
      record.view.defaultModel = nextDefaultModel;
      record.view.allowedModels = nextAllowedModels;
      record.view.quota = input.quota?.trim() || record.view.quota;
      record.view.scopeType = scope.scopeType;
      record.view.scopeId = scope.scopeId;
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "update_provider_config",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    rotate(id, apiKey, actor) {
      const record = records.get(id);
      if (!record) return null;
      record.apiKeyCiphertext = encryptSecret(apiKey.trim(), secretKey);
      record.apiKeyHash = hashSecret(apiKey.trim());
      record.view.maskedKey = maskApiKey(apiKey);
      record.view.status = "active";
      record.view.updatedAt = new Date().toISOString();
      closeBreaker(record.view);
      audit({
        actor,
        action: "rotate_provider_key",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    disable(id, actor) {
      const record = records.get(id);
      if (!record || record.view.status === "revoked") return null;
      record.view.status = "disabled";
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "disable_provider_config",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    enable(id, actor) {
      const record = records.get(id);
      if (!record || record.view.status === "revoked") return null;
      record.view.status = "active";
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "enable_provider_config",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    revoke(id, actor) {
      const record = records.get(id);
      if (!record) return null;
      record.view.status = "revoked";
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "revoke_provider_key",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    getSecret(id) {
      const record = records.get(id);
      if (!record || record.view.status !== "active") return null;
      return decryptSecret(record.apiKeyCiphertext, secretKey);
    },
    markUsed(id) {
      const record = records.get(id);
      if (!record) return null;
      record.view.lastUsedAt = new Date().toISOString();
      record.view.updatedAt = record.view.lastUsedAt;
      return cloneView(record.view);
    },
    recordFailure(id) {
      const record = records.get(id);
      if (!record) return null;
      const now = new Date().toISOString();
      record.view.breakerFailureCount += 1;
      record.view.breakerLastFailureAt = now;
      if (record.view.breakerFailureCount >= breakerFailureThreshold) {
        record.view.breakerState = "open";
        record.view.breakerOpenedAt = record.view.breakerOpenedAt ?? now;
      }
      record.view.updatedAt = now;
      return cloneView(record.view);
    },
    resetBreaker(id) {
      const record = records.get(id);
      if (!record) return null;
      closeBreaker(record.view);
      record.view.updatedAt = new Date().toISOString();
      return cloneView(record.view);
    },
    listAuditLogs() {
      return auditLogs.map((log) => ({ ...log }));
    },
  };
}
