// Verifies the PostgreSQL persistence foundation without requiring a live database.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostgresPoolFromEnv,
  getDatabaseUrl,
} from "./postgres.js";
import {
  baseSchemaSql,
  billingAndPaymentsSql,
  migrationTableName,
  migrations,
  providerConfigStoreSql,
  runMigrations,
} from "./migrations.js";
import {
  checkDatabaseHealth,
  withTransaction,
  type Queryable,
} from "./transactions.js";

class FakeClient implements Queryable {
  readonly queries: string[] = [];

  constructor(private readonly appliedMigrationIds = new Set<string>()) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push(params ? `${sql} ${JSON.stringify(params)}` : sql);

    if (/select id from schema_migrations/i.test(sql)) {
      return {
        rows: [...this.appliedMigrationIds].map((id) => ({ id })),
        rowCount: this.appliedMigrationIds.size,
      };
    }

    if (/insert into schema_migrations/i.test(sql)) {
      const id = String(params?.[0] ?? "");
      this.appliedMigrationIds.add(id);
      return { rows: [], rowCount: 1 };
    }

    if (/select 1 as ok/i.test(sql)) {
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }
}

class FakePool {
  readonly client = new FakeClient();
  connectCount = 0;
  releaseCount = 0;

  async connect() {
    this.connectCount += 1;
    return {
      query: (sql: string, params?: readonly unknown[]) =>
        this.client.query(sql, params),
      release: () => {
        this.releaseCount += 1;
      },
    };
  }
}

test("database url is read from DATABASE_URL and blank values are ignored", () => {
  assert.equal(getDatabaseUrl({ DATABASE_URL: "   " }), null);
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: " postgres://user:pass@localhost:5432/app " }),
    "postgres://user:pass@localhost:5432/app",
  );
});

test("postgres pool is created from DATABASE_URL without connecting eagerly", () => {
  const pool = createPostgresPoolFromEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  });

  assert.equal(pool.options.connectionString, "postgres://user:pass@localhost:5432/app");
  void pool.end();
});

test("base schema migration includes the required platform tables", () => {
  const requiredTables = [
    "users",
    "sessions",
    "login_events",
    "projects",
    "project_members",
    "audit_logs",
    "risk_events",
    "provider_configs",
    "provider_secrets",
    "provider_usage_events",
    "run_records",
    "run_events",
    "document_records",
  ];

  for (const table of requiredTables) {
    assert.match(baseSchemaSql, new RegExp(`create table if not exists ${table}`, "i"));
  }
});

test("base schema includes DB-backed document metadata and versions", () => {
  for (const column of [
    "workspace_id",
    "file_name",
    "byte_length",
    "source_run_id",
  ]) {
    assert.match(baseSchemaSql, new RegExp(column, "i"));
  }

  assert.match(
    baseSchemaSql,
    /create table if not exists document_record_versions/i,
  );
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /document_repository_metadata/i,
  );
});

test("provider config migration includes secure view fields and usage dimensions", () => {
  for (const column of [
    "masked_key",
    "key_purpose",
    "risk_state",
    "quota",
    "last_used_at",
    "secret_hash",
  ]) {
    assert.match(providerConfigStoreSql, new RegExp(column, "i"));
  }

  assert.match(providerConfigStoreSql, /create table if not exists provider_usage_events/i);
  assert.match(providerConfigStoreSql, /user_id.*project_id.*provider_config_id.*task_type/is);
});

test("billing migration creates payment, entitlement, and reservation records", () => {
  for (const table of [
    "billing_skus",
    "payment_orders",
    "payment_notifications",
    "billing_entitlement_ledger",
    "billing_usage_reservations",
  ]) {
    assert.match(
      billingAndPaymentsSql,
      new RegExp(`create table if not exists ${table}`, "i"),
    );
  }
  assert.match(billingAndPaymentsSql, /billing_usage_reservations\s*\([^;]*run_id text not null unique/is);
  assert.match(billingAndPaymentsSql, /billing_signup_bonus_unique/i);
  assert.match(billingAndPaymentsSql, /credits_500/i);
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /011_billing_and_payments/,
  );
});

test("migration runner creates its ledger and skips already applied migrations", async () => {
  const client = new FakeClient(new Set(migrations.map((migration) => migration.id)));

  const applied = await runMigrations(client);

  assert.equal(applied.length, 0);
  assert.match(client.queries[0] ?? "", new RegExp(`create table if not exists ${migrationTableName}`, "i"));
  assert.doesNotMatch(client.queries.join("\n"), /create table if not exists users/i);
});

test("migration runner applies missing migrations and records them", async () => {
  const client = new FakeClient();

  const applied = await runMigrations(client);

  assert.deepEqual(applied, migrations.map((migration) => migration.id));
  assert.match(client.queries.join("\n"), /create table if not exists users/i);
  assert.match(client.queries.join("\n"), /insert into schema_migrations/i);
});

test("health check reports ok when SELECT 1 succeeds", async () => {
  const health = await checkDatabaseHealth(new FakeClient());

  assert.equal(health.ok, true);
  assert.equal(typeof health.checkedAt, "string");
});

test("transaction helper commits successful work and releases the client", async () => {
  const pool = new FakePool();

  const result = await withTransaction(pool, async (client) => {
    await client.query("select 1 as ok");
    return "committed";
  });

  assert.equal(result, "committed");
  assert.deepEqual(pool.client.queries.map((query) => query.split(" ")[0]), [
    "BEGIN",
    "select",
    "COMMIT",
  ]);
  assert.equal(pool.releaseCount, 1);
});

test("transaction helper rolls back failed work and releases the client", async () => {
  const pool = new FakePool();

  await assert.rejects(
    () =>
      withTransaction(pool, async () => {
        throw new Error("boom");
      }),
    /boom/,
  );

  assert.deepEqual(pool.client.queries, ["BEGIN", "ROLLBACK"]);
  assert.equal(pool.releaseCount, 1);
});
