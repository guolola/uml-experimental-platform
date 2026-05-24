// Verifies PostgreSQL provider config persistence keeps the in-memory store contract secure.
import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresProviderConfigRepository } from "./postgres-provider-config-repository.js";
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
  quota: "unlimited",
  status: "active",
  scope_type: "system",
  scope_id: null,
  breaker_state: "closed",
  breaker_failure_count: 0,
  breaker_opened_at: null,
  breaker_last_failure_at: null,
};

test("postgres provider repository creates allowlisted configs without storing plaintext keys", async () => {
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

test("postgres provider repository blocks configs outside the admin allowlist", async () => {
  const repository = createPostgresProviderConfigRepository({
    db: new ScriptedClient(),
    baseUrlAllowlist: ["https://api.openai.com"],
    secret: "test-secret",
  });

  await assert.rejects(
    () =>
      repository.create({
        name: "Untrusted",
        provider: "proxy",
        baseUrl: "https://evil.example.com",
        apiKey: "sk-live-secret-a91f",
        defaultModel: "gpt-4.1",
        createdBy: "admin-user",
      }),
    /allowlist/i,
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
      allowedModels: ["gpt-4.1"],
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
