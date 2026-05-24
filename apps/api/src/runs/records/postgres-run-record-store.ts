// Persists run records/events to PostgreSQL while preserving the existing Map API.
import type { RunEvent } from "@uml-platform/contracts";
import type { Queryable } from "../../db/transactions.js";
import type { RunRecord, RunRecordMetadata, RunRecordStore } from "./run-record-store.js";

interface RunRecordRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  snapshot: RunRecord["snapshot"];
  status: string;
  stage: string;
  error_message: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
}

interface RunEventRow {
  run_id: string;
  sequence: number;
  payload: RunEvent;
}

type PersistJob = Promise<void>;

export interface PersistentRunRecordStore extends RunRecordStore {
  flush(): Promise<void>;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function readModel(snapshot: RunRecord["snapshot"]) {
  const settings: unknown = "providerSettings" in snapshot ? snapshot.providerSettings : undefined;
  if (!settings || typeof settings !== "object" || !("model" in settings)) {
    return null;
  }
  const model = (settings as { model?: unknown }).model;
  return typeof model === "string" ? model : null;
}

function readStage(snapshot: RunRecord["snapshot"]) {
  return snapshot.currentStage ?? "queued";
}

function readCompletedAt(record: RunRecord) {
  if (!record.terminal) return null;
  return new Date().toISOString();
}

function createMetadata(row: RunRecordRow): RunRecordMetadata | undefined {
  if (!row.user_id && !row.project_id) return undefined;
  return {
    userId: row.user_id ?? undefined,
    projectId: row.project_id ?? undefined,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

class PostgresRunRecordStore extends Map<string, RunRecord> implements PersistentRunRecordStore {
  private readonly pending = new Set<PersistJob>();
  private readonly failures: unknown[] = [];

  constructor(private readonly db: Queryable) {
    super();
  }

  override set(runId: string, record: RunRecord) {
    this.attachPersistence(record);
    super.set(runId, record);
    this.enqueue(this.saveRecord(record));
    return this;
  }

  override delete(runId: string) {
    const deleted = super.delete(runId);
    if (deleted) {
      this.enqueue(
        this.db.query("delete from run_records where id = $1", [runId]).then(() => undefined),
      );
    }
    return deleted;
  }

  async restore() {
    const records = await this.db.query<RunRecordRow>(`
      select id, user_id, project_id, snapshot, status, stage, error_message, created_at, completed_at
      from run_records
      order by created_at asc
    `);
    const events = await this.db.query<RunEventRow>(`
      select run_id, sequence, payload
      from run_events
      order by run_id asc, sequence asc
    `);
    const eventsByRun = new Map<string, RunEvent[]>();
    for (const row of events.rows) {
      const list = eventsByRun.get(row.run_id) ?? [];
      list.push(row.payload);
      eventsByRun.set(row.run_id, list);
    }

    for (const row of records.rows) {
      const record: RunRecord = {
        snapshot: row.snapshot,
        events: eventsByRun.get(row.id) ?? [],
        listeners: new Set(),
        terminal:
          row.status === "completed" ||
          row.status === "failed" ||
          row.status === "cancelled" ||
          Boolean(row.completed_at),
        metadata: createMetadata(row),
      };
      this.attachPersistence(record);
      super.set(row.id, record);
    }
  }

  async flush() {
    while (this.pending.size > 0) {
      await Promise.all(Array.from(this.pending));
    }
    if (this.failures.length > 0) {
      throw this.failures.shift();
    }
  }

  private attachPersistence(record: RunRecord) {
    record.persist = (nextRecord, event) => {
      this.enqueue(this.saveRecord(nextRecord, event));
    };
  }

  private enqueue(job: PersistJob) {
    const tracked = job.catch((error) => {
      this.failures.push(error);
    }).finally(() => {
      this.pending.delete(tracked);
    });
    this.pending.add(tracked);
  }

  private async saveRecord(record: RunRecord, event?: RunEvent) {
    const snapshot = record.snapshot;
    const metadata = record.metadata;
    await this.db.query(
      `
        insert into run_records (
          id, user_id, project_id, stage, status, model, provider_config_id,
          snapshot, error_message, completed_at, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, now())
        on conflict (id) do update set
          user_id = excluded.user_id,
          project_id = excluded.project_id,
          stage = excluded.stage,
          status = excluded.status,
          model = excluded.model,
          provider_config_id = excluded.provider_config_id,
          snapshot = excluded.snapshot,
          error_message = excluded.error_message,
          completed_at = coalesce(excluded.completed_at, run_records.completed_at),
          updated_at = now()
      `,
      [
        snapshot.runId,
        metadata?.userId ?? null,
        metadata?.projectId ?? null,
        readStage(snapshot),
        snapshot.status,
        readModel(snapshot),
        null,
        JSON.stringify(snapshot),
        snapshot.errorMessage ?? null,
        readCompletedAt(record),
        metadata?.createdAt ?? new Date().toISOString(),
      ],
    );

    if (!event) return;
    const sequence = record.events.length;
    await this.db.query(
      `
        insert into run_events (run_id, sequence, event_type, payload)
        values ($1, $2, $3, $4::jsonb)
        on conflict (run_id, sequence) do update set
          event_type = excluded.event_type,
          payload = excluded.payload
      `,
      [snapshot.runId, sequence, event.type, JSON.stringify(event)],
    );
  }
}

export async function createPostgresRunRecordStore(
  db: Queryable,
): Promise<PersistentRunRecordStore> {
  const store = new PostgresRunRecordStore(db);
  await store.restore();
  return store;
}
