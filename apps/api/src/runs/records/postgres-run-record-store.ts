// Persists run records/events to PostgreSQL while preserving the existing Map API.
import type { RunEvent } from "@uml-platform/contracts";
import type { Queryable } from "../../db/transactions.js";
import type { RunRecord, RunRecordMetadata, RunRecordStore } from "./run-record-store.js";
import { createRunError } from "../pipelines/shared/errors.js";

interface RunRecordRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  source_run_id: string | null;
  source_action: RunRecordMetadata["sourceAction"] | null;
  source_run_status: string | null;
  snapshot: RunRecord["snapshot"];
  status: string;
  stage: string;
  model: string | null;
  provider_config_id: string | null;
  error_message: string | null;
  error: RunRecord["snapshot"]["error"] | null;
  error_code: string | null;
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
  refreshRun(runId: string): Promise<RunRecord | null>;
  refreshProject(projectId: string): Promise<void>;
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
  if (
    !row.user_id &&
    !row.project_id &&
    !row.source_run_id &&
    !row.source_action &&
    !row.source_run_status &&
    !row.completed_at &&
    !row.model
  ) {
    return undefined;
  }
  return {
    userId: row.user_id ?? undefined,
    projectId: row.project_id ?? undefined,
    sourceRunId: row.source_run_id ?? undefined,
    sourceAction: row.source_action ?? undefined,
    sourceRunStatus: row.source_run_status ?? undefined,
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

function shouldMarkActiveRunsInterruptedOnRestore(env: NodeJS.ProcessEnv = process.env) {
  const queueMode = env.UML_RUN_QUEUE_MODE?.trim().toLowerCase();
  return queueMode !== "bullmq" && env.UML_ENABLE_RUN_QUEUE !== "true";
}

function cloneSnapshot(snapshot: RunRecord["snapshot"]) {
  return JSON.parse(JSON.stringify(snapshot)) as RunRecord["snapshot"];
}

function isActiveStatus(status: string) {
  return status === "queued" || status === "running";
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
      select id, user_id, project_id, source_run_id, source_action, source_run_status, snapshot, status, stage, model, provider_config_id, error_message, error, error_code, created_at, completed_at
      from run_records
      order by created_at asc
    `);
    const events = await this.db.query<RunEventRow>(`
      select run_id, sequence, payload
      from run_events
      order by run_id asc, sequence asc
    `);
    this.applyLoadedRows(records.rows, events.rows, {
      markActiveInterrupted: shouldMarkActiveRunsInterruptedOnRestore(),
    });
  }

  async refreshRun(runId: string) {
    const records = await this.db.query<RunRecordRow>(
      `
        select id, user_id, project_id, source_run_id, source_action, source_run_status, snapshot, status, stage, model, provider_config_id, error_message, error, error_code, created_at, completed_at
        from run_records
        where id = $1
      `,
      [runId],
    );
    const events = await this.loadEventsForRunIds(records.rows.map((row) => row.id));
    this.applyLoadedRows(records.rows, events, { markActiveInterrupted: false });
    return super.get(runId) ?? null;
  }

  async refreshProject(projectId: string) {
    const records = await this.db.query<RunRecordRow>(
      `
        select id, user_id, project_id, source_run_id, source_action, source_run_status, snapshot, status, stage, model, provider_config_id, error_message, error, error_code, created_at, completed_at
        from run_records
        where project_id = $1
        order by created_at asc
      `,
      [projectId],
    );
    const events = await this.loadEventsForRunIds(records.rows.map((row) => row.id));
    this.applyLoadedRows(records.rows, events, { markActiveInterrupted: false });
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

  private async loadEventsForRunIds(runIds: string[]) {
    if (runIds.length === 0) return [];
    const events = await this.db.query<RunEventRow>(
      `
        select run_id, sequence, payload
        from run_events
        where run_id = any($1::text[])
        order by run_id asc, sequence asc
      `,
      [runIds],
    );
    return events.rows;
  }

  private applyLoadedRows(
    rows: RunRecordRow[],
    eventRows: RunEventRow[],
    { markActiveInterrupted }: { markActiveInterrupted: boolean },
  ) {
    const eventRowsByRun = new Map<string, RunEventRow[]>();
    for (const row of eventRows) {
      const list = eventRowsByRun.get(row.run_id) ?? [];
      list.push(row);
      eventRowsByRun.set(row.run_id, list);
    }

    for (const row of rows) {
      const existing = super.get(row.id);
      const snapshot = cloneSnapshot(row.snapshot);
      const events = (eventRowsByRun.get(row.id) ?? []).map((eventRow) =>
        hydratePersistedEvent(eventRow.payload, snapshot),
      );
      const activeStatus = isActiveStatus(row.status);
      const staleActiveWithCompletedAt = activeStatus && Boolean(row.completed_at);
      const restoredInterruptedRun =
        staleActiveWithCompletedAt || (markActiveInterrupted && activeStatus);
      const record: RunRecord = {
        snapshot,
        events,
        listeners: existing?.listeners ?? new Set(),
        terminal:
          restoredInterruptedRun ||
          row.status === "completed" ||
          row.status === "failed" ||
          row.status === "cancelled" ||
          Boolean(row.completed_at),
        metadata: createMetadata(row),
        documentBuffer: existing?.documentBuffer,
      };
      if (restoredInterruptedRun && !record.snapshot.error) {
        record.snapshot.error = createRunError(
          "RUN_INTERNAL_ERROR",
          "Run interrupted by server restart",
        );
      }
      if (restoredInterruptedRun) {
        record.snapshot.status = "failed";
        if (!record.events.some((event) => event.type === "failed")) {
          record.events.push({
            type: "failed",
            stage: record.snapshot.currentStage ?? undefined,
            error:
              record.snapshot.error ??
              createRunError("RUN_INTERNAL_ERROR", "Run interrupted by server restart"),
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
            id, user_id, project_id, source_run_id, source_action, source_run_status,
            stage, status, model, provider_config_id,
            snapshot, error, error_code, completed_at, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, now())
          on conflict (id) do update set
            user_id = excluded.user_id,
            project_id = excluded.project_id,
            source_run_id = excluded.source_run_id,
            source_action = excluded.source_action,
            source_run_status = excluded.source_run_status,
            stage = excluded.stage,
            status = excluded.status,
            model = excluded.model,
            provider_config_id = excluded.provider_config_id,
            snapshot = excluded.snapshot,
            error = excluded.error,
            error_code = excluded.error_code,
            completed_at = coalesce(excluded.completed_at, run_records.completed_at),
            updated_at = now()
        `,
        [
          snapshot.runId,
          metadata?.userId ?? null,
          metadata?.projectId ?? null,
          metadata?.sourceRunId ?? null,
          metadata?.sourceAction ?? null,
          metadata?.sourceRunStatus ?? null,
          readStage(snapshot),
          readPersistedStatus(record, event),
          readModel(snapshot),
          readProviderConfigId(snapshot),
          JSON.stringify(snapshot),
          snapshot.error ? JSON.stringify(snapshot.error) : null,
          snapshot.error?.code ?? null,
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
