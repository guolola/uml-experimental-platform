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
  model: string | null;
  provider_config_id: string | null;
  error_message: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
}

interface RunEventRow {
  run_id: string;
  sequence: number;
  payload: PersistedRunEvent;
}

type PersistedCompletedRunEvent = {
  type: "completed";
  snapshotRef: string;
};
type PersistedRunEvent = RunEvent | PersistedCompletedRunEvent;
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

function readProviderConfigId(snapshot: RunRecord["snapshot"]) {
  const settings: unknown = "providerSettings" in snapshot ? snapshot.providerSettings : undefined;
  if (!settings || typeof settings !== "object" || !("providerConfigId" in settings)) {
    return null;
  }
  const providerConfigId = (settings as { providerConfigId?: unknown }).providerConfigId;
  return typeof providerConfigId === "string" && providerConfigId.trim()
    ? providerConfigId
    : null;
}

function readStage(snapshot: RunRecord["snapshot"]) {
  return snapshot.currentStage ?? "queued";
}

function terminalStatusFromEvent(event: RunEvent | undefined) {
  if (!event) return null;
  if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
    return event.type;
  }
  return null;
}

function readPersistedStatus(record: RunRecord, event?: RunEvent) {
  const eventStatus = terminalStatusFromEvent(event);
  if (eventStatus) return eventStatus;
  if (record.terminal) {
    for (let index = record.events.length - 1; index >= 0; index -= 1) {
      const status = terminalStatusFromEvent(record.events[index]);
      if (status) return status;
    }
  }
  return record.snapshot.status;
}

function readCompletedAt(record: RunRecord, event?: RunEvent) {
  if (record.metadata?.completedAt) return record.metadata.completedAt;
  if (!record.terminal && !terminalStatusFromEvent(event)) return null;
  return new Date().toISOString();
}

function createMetadata(row: RunRecordRow): RunRecordMetadata | undefined {
  if (!row.user_id && !row.project_id && !row.completed_at && !row.model) return undefined;
  return {
    userId: row.user_id ?? undefined,
    projectId: row.project_id ?? undefined,
    model: row.model ?? undefined,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    completedAt: toIsoString(row.completed_at),
  };
}

function shouldPersistProgressSnapshots() {
  return process.env.UML_PERSIST_PROGRESS_SNAPSHOT === "true";
}

function shouldPersistSnapshotForEvent(event: RunEvent) {
  if (event.type === "llm_chunk") {
    return false;
  }
  if (event.type === "stage_progress") {
    return shouldPersistProgressSnapshots();
  }
  return true;
}

function serializeEventForPersistence(event: RunEvent, snapshot: RunRecord["snapshot"]): PersistedRunEvent {
  if (event.type === "completed") {
    return { type: "completed", snapshotRef: snapshot.runId };
  }
  return event;
}

function hydratePersistedEvent(
  event: PersistedRunEvent,
  snapshot: RunRecord["snapshot"],
): RunEvent {
  if (event.type === "completed" && "snapshotRef" in event) {
    return { type: "completed", snapshot };
  }
  return event;
}

class PostgresRunRecordStore extends Map<string, RunRecord> implements PersistentRunRecordStore {
  private readonly pending = new Set<PersistJob>();
  private readonly chains = new Map<string, PersistJob>();
  private readonly failures: unknown[] = [];

  constructor(private readonly db: Queryable) {
    super();
  }

  override set(runId: string, record: RunRecord) {
    this.attachPersistence(record);
    super.set(runId, record);
    this.enqueue(runId, () => this.saveRecord(record));
    return this;
  }

  override delete(runId: string) {
    const deleted = super.delete(runId);
    if (deleted) {
      this.enqueue(runId, () =>
        this.db.query("delete from run_records where id = $1", [runId]).then(() => undefined),
      );
    }
    return deleted;
  }

  async restore() {
    const records = await this.db.query<RunRecordRow>(`
      select id, user_id, project_id, snapshot, status, stage, model, provider_config_id, error_message, created_at, completed_at
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
      const snapshot = records.rows.find((recordRow) => recordRow.id === row.run_id)?.snapshot;
      if (!snapshot) continue;
      list.push(hydratePersistedEvent(row.payload, snapshot));
      eventsByRun.set(row.run_id, list);
    }

    for (const row of records.rows) {
      const hasActiveStatus = row.status === "queued" || row.status === "running";
      const restoredActiveRun = hasActiveStatus && !row.completed_at;
      const restoredInterruptedRun = hasActiveStatus;
      const record: RunRecord = {
        snapshot: row.snapshot,
        events: eventsByRun.get(row.id) ?? [],
        listeners: new Set(),
        terminal:
          restoredActiveRun ||
          row.status === "completed" ||
          row.status === "failed" ||
          row.status === "cancelled" ||
          Boolean(row.completed_at),
        metadata: createMetadata(row),
      };
      if (restoredInterruptedRun && !record.snapshot.errorMessage) {
        record.snapshot.errorMessage = "Run interrupted by server restart";
      }
      if (restoredInterruptedRun) {
        record.snapshot.status = "failed";
        if (!record.events.some((event) => event.type === "failed")) {
          record.events.push({
            type: "failed",
            stage: record.snapshot.currentStage ?? undefined,
            message: record.snapshot.errorMessage ?? "Run interrupted by server restart",
          });
        }
      }
      this.attachPersistence(record);
      super.set(row.id, record);
      if (restoredInterruptedRun) {
        this.enqueue(row.id, () => this.saveRecord(record));
      }
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
      this.enqueue(nextRecord.snapshot.runId, () => this.saveRecord(nextRecord, event));
    };
  }

  private enqueue(runId: string, job: () => PersistJob) {
    const previous = this.chains.get(runId) ?? Promise.resolve();
    const chained = previous.catch(() => undefined).then(job);
    this.chains.set(runId, chained);

    const tracked = chained
      .catch((error) => {
        this.failures.push(error);
      })
      .finally(() => {
        this.pending.delete(tracked);
        if (this.chains.get(runId) === chained) {
          this.chains.delete(runId);
        }
      });
    this.pending.add(tracked);
  }

  private async saveRecord(record: RunRecord, event?: RunEvent) {
    const snapshot = record.snapshot;
    const metadata = record.metadata;
    if (!event || shouldPersistSnapshotForEvent(event)) {
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
          readPersistedStatus(record, event),
          readModel(snapshot),
          readProviderConfigId(snapshot),
          JSON.stringify(snapshot),
          snapshot.errorMessage ?? null,
          readCompletedAt(record, event),
          metadata?.createdAt ?? new Date().toISOString(),
        ],
      );
    }

    if (!event) return;
    const sequence = record.events.length;
    const persistedEvent = serializeEventForPersistence(event, snapshot);
    await this.db.query(
      `
        insert into run_events (run_id, sequence, event_type, payload)
        values ($1, $2, $3, $4::jsonb)
        on conflict (run_id, sequence) do update set
          event_type = excluded.event_type,
          payload = excluded.payload
      `,
      [snapshot.runId, sequence, event.type, JSON.stringify(persistedEvent)],
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
