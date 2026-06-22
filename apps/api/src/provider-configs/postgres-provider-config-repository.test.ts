// Verifies PostgreSQL provider config persistence keeps the in-memory store contract secure.
import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresProviderConfigRepository } from "./postgres-provider-config-repository.js";
import { normalizeProviderAllowedModels } from "./default-provider-models.js";
import type { Queryable } from "../db/transactions.js";

class ScriptedClient implements Queryable {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  private readonly rows: unknown[][] = [];

  queueRows(rows: unknown[]) {
    this.rows.push(rows);
  }

  async query(sql: string, params: readonly unknown[] = []) {
    this.calls.push({ sql, params });
    const rows = this.rows.shift() ?? [];
    return { rows, rowCount: rows.length };
  }
}

const createdRow = {
  id: "provider-1",
  name: "OpenAI production gateway",
  provider: "openai",
  base_url: "https://api.openai.com",
  allowlisted: true,
  masked_key: "sk-...a91f",
  key_purpose: "admin-configured provider key",
  created_by: "admin-user",
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
  last_used_at: null,
  risk_state: "medium",
  default_model: "gpt-4.1",
  allowed_models: ["gpt-4.1"],
  model_capabilities: {},
  quota: "unlimited",
  status: "active",
  scope_type: "system",
  scope_id: null,
  breaker_state: "closed",
  breaker_failure_count: 0,
  breaker_opened_at: null,
  breaker_last_failure_at: null,
};

test("postgres provider repository creates managed configs without storing plaintext keys", async () => {
  const client = new ScriptedClient();
  client.queueRows([createdRow]);
  client.queueRows([]);
  client.queueRows([]);
  const repository = createPostgresProviderConfigRepository({
    db: client,
    baseUrlAllowlist: ["https://api.openai.com"],
    secret: "test-secret",
  });

  const created = await repository.create({
    name: "OpenAI production gateway",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-live-secret-a91f",
    defaultModel: "gpt-4.1",
    createdBy: "admin-user",
  });

  assert.equal(created.baseUrl, "https://api.openai.com");
  assert.equal(created.maskedKey, "sk-...a91f");
  assert.doesNotMatch(JSON.stringify(created), /sk-live-secret-a91f/);
  assert.match(client.calls[0]?.sql ?? "", /insert into provider_configs/i);
  assert.match(client.calls[1]?.sql ?? "", /insert into provider_secrets/i);
  assert.match(client.calls[2]?.sql ?? "", /insert into audit_logs/i);
  assert.doesNotMatch(JSON.stringify(client.calls), /sk-live-secret-a91f/);
});

test("postgres provider repository infers provider labels for public custom HTTPS URLs", async () => {
  const client = new ScriptedClient();
  client.queueRows([{
    ...createdRow,
    provider: "openai-compatible",
    base_url: "https://api.custom-provider.example",
  }]);
  client.queueRows([]);
  client.queueRows([]);
  const repository = createPostgresProviderConfigRepository({
    db: client,
    baseUrlAllowlist: ["https://api.openai.com"],
    secret: "test-secret",
  });

  const created = await repository.create({
    name: "Custom production gateway",
    baseUrl: "https://api.custom-provider.example/v1",
    apiKey: "sk-live-secret-a91f",
    defaultModel: "gpt-4.1",
    createdBy: "admin-user",
  });

  assert.equal(created.baseUrl, "https://api.custom-provider.example");
  assert.equal(created.provider, "openai-compatible");
  assert.equal(client.calls[0]?.params[2], "openai-compatible");
});

test("postgres provider repository keeps SiliconFlow model catalogs provider-scoped", async () => {
  const allowedModels = [
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Flash",
    "Pro/moonshotai/Kimi-K2.6",
    "Pro/zai-org/GLM-5.1",
    "Pro/MiniMaxAI/MiniMax-M2.5",
    "Qwen/Qwen3.6-35B-A3B",
  ];
  const client = new ScriptedClient();
  client.queueRows([{
    ...createdRow,
    name: "SiliconFlow production gateway",
    provider: "siliconflow",
    base_url: "https://api.siliconflow.cn",
    default_model: "deepseek-ai/DeepSeek-V4-Pro",
    allowed_models: allowedModels,
  }]);
  client.queueRows([]);
  client.queueRows([]);
  const repository = createPostgresProviderConfigRepository({
    db: client,
    baseUrlAllowlist: ["https://api.siliconflow.cn"],
    secret: "test-secret",
  });

  const created = await repository.create({
    name: "SiliconFlow production gateway",
    provider: "siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKey: "sk-live-secret-a91f",
    defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    allowedModels,
    createdBy: "admin-user",
  });

  assert.equal(created.baseUrl, "https://api.siliconflow.cn");
  assert.deepEqual(created.allowedModels, allowedModels);
  assert.equal(created.allowedModels.includes("gpt-5.5-pro"), false);
  assert.deepEqual(client.calls[0]?.params[5], allowedModels);
});

test("postgres provider repository updates editable metadata without touching secrets", async () => {
  const client = new ScriptedClient();
  client.queueRows([createdRow]);
  client.queueRows([{
    ...createdRow,
    name: "OpenAI production gateway v2",
    default_model: "gpt-4.1-mini",
    allowed_models: ["gpt-4.1", "gpt-4.1-mini"],
    key_purpose: "production generation",
    quota: "contract label",
    scope_type: "system",
    scope_id: null,
  }]);
  client.queueRows([]);
  const repository = createPostgresProviderConfigRepository({
    db: client,
    baseUrlAllowlist: ["https://api.openai.com"],
    secret: "test-secret",
  });

  const updated = await repository.updateMetadata("provider-1", {
    allowedModels: ["gpt-4.1", "gpt-4.1-mini"],
    defaultModel: "gpt-4.1-mini",
    keyPurpose: "production generation",
    name: "OpenAI production gateway v2",
    quota: "contract label",
    scopeId: null,
    scopeType: "system",
  }, "admin-user");

  assert.equal(updated?.name, "OpenAI production gateway v2");
  assert.equal(updated?.defaultModel, "gpt-4.1-mini");
  assert.match(client.calls[1]?.sql ?? "", /update provider_configs/i);
  assert.doesNotMatch(client.calls[1]?.sql ?? "", /provider_secrets/i);
  assert.deepEqual(client.calls[1]?.params.slice(1, 9), [
    "OpenAI production gateway v2",
    "gpt-4.1-mini",
    normalizeProviderAllowedModels("gpt-4.1-mini", ["gpt-4.1", "gpt-4.1-mini"], {
      baseUrl: "https://api.openai.com",
      provider: "openai",
    }),
    {},
    "production generation",
    "contract label",
    "system",
    null,
  ]);
  assert.match(client.calls[2]?.sql ?? "", /insert into audit_logs/i);
});

test("postgres provider repository blocks non-public provider base URLs", async () => {
  const repository = createPostgresProviderConfigRepository({
    db: new ScriptedClient(),
    baseUrlAllowlist: ["https://api.openai.com"],
    secret: "test-secret",
  });

  await assert.rejects(
    () =>
      repository.create({
        name: "Untrusted",
        baseUrl: "https://127.0.0.1:11434/v1",
        apiKey: "sk-live-secret-a91f",
        defaultModel: "gpt-4.1",
        createdBy: "admin-user",
      }),
    /public HTTPS host/i,
  );
});

test("postgres provider repository maps views and never includes secret ciphertext in list results", async () => {
  const client = new ScriptedClient();
  client.queueRows([{ ...createdRow, last_used_at: new Date("2026-05-22T00:01:00.000Z") }]);
  const repository = createPostgresProviderConfigRepository({
    db: client,
    baseUrlAllowlist: ["https://api.openai.com"],
    secret: "test-secret",
  });

  const configs = await repository.list();

  assert.deepEqual(configs, [
    {
      id: "provider-1",
      name: "OpenAI production gateway",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      allowlisted: true,
      maskedKey: "sk-...a91f",
      keyPurpose: "admin-configured provider key",
      createdBy: "admin-user",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
      lastUsedAt: "2026-05-22T00:01:00.000Z",
      riskState: "medium",
      defaultModel: "gpt-4.1",
      allowedModels: normalizeProviderAllowedModels("gpt-4.1", ["gpt-4.1"]),
      modelCapabilities: {},
      quota: "unlimited",
      status: "active",
      scopeType: "system",
      scopeId: null,
      breakerState: "closed",
      breakerFailureCount: 0,
      breakerOpenedAt: null,
      breakerLastFailureAt: null,
    },
  ]);
  assert.doesNotMatch(client.calls[0]?.sql ?? "", /secret_ciphertext/i);
});
