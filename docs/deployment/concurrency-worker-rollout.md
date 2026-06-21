# UML Platform Concurrency Worker Rollout

This document records the implementation path for supporting 20-50 concurrent classroom users without letting AI generation block normal API requests.

## Target

- 20-50 users can log in, browse projects, edit requirements, view run history, and download documents concurrently.
- About 3-8 users can start AI generation at the same time.
- Generation requests return a `runId` quickly while the heavy work runs in workers.
- Normal API requests must stay responsive while LLM, PlantUML, and DOCX work is queued or running.

## Implemented Foundation

- Optional Redis/BullMQ run queue behind `UML_RUN_QUEUE_MODE=bullmq`.
- API run routes create `queued` records and enqueue BullMQ jobs when the queue is enabled.
- Without queue mode, routes preserve the existing inline pipeline startup behavior.
- Independent generation worker entrypoint: `apps/api/dist/workers/generation-worker.js`.
- Worker consumes `generation-runs`, revives the queued run record, resolves managed provider secrets server-side, and awaits the existing pipeline.
- Redis run event publishing hooks are attached to queued records and worker records.
- Redis run control channel lets API cancellation notify workers.
- `DATABASE_POOL_MAX` / `PGPOOL_MAX` configures node-postgres pool size.
- PM2 config supports API instance count and optional generation worker processes.

## Production Environment

Start with:

```text
UML_RUN_QUEUE_MODE=bullmq
UML_ENABLE_GENERATION_WORKER=true
REDIS_URL=redis://127.0.0.1:6379/0

UML_API_INSTANCES=4
UML_GENERATION_WORKER_INSTANCES=2
UML_GENERATION_WORKER_CONCURRENCY=1

DATABASE_POOL_MAX=5
UML_API_MAX_MEMORY_RESTART=1536M
UML_GENERATION_WORKER_MAX_MEMORY_RESTART=1536M

UML_LLM_GLOBAL_CONCURRENCY=10
UML_LLM_PROVIDER_CONCURRENCY=10
UML_LLM_PROJECT_CONCURRENCY=10
UML_LLM_USER_CONCURRENCY=10
UML_LLM_RUN_CONCURRENCY=10

UML_RENDER_CONCURRENCY=1

# Optional worker safety guards for long model streams.
UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS=300000
UML_REQUIREMENT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS=30000
UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS=1200000
UML_DESIGN_MODEL_TASK_TIMEOUT_MS=300000
UML_DESIGN_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS=30000
UML_DESIGN_MODEL_TASK_MAX_RUNTIME_MS=1200000
UML_CODE_MODEL_TASK_TIMEOUT_MS=300000
UML_CODE_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS=30000
UML_CODE_MODEL_TASK_MAX_RUNTIME_MS=1200000
```

With the above:

- API DB connection upper bound: `4 * 5 = 20`
- Worker DB connection upper bound: `2 * 5 = 10`
- Application-side DB connection upper bound: about `30`
- Suggested PgBouncer `default_pool_size`: `40`
- Suggested API PM2 memory restart threshold: `UML_API_MAX_MEMORY_RESTART=1536M`, then adjust from measured RSS and retained run history size.
- Suggested worker PM2 memory restart threshold: `UML_GENERATION_WORKER_MAX_MEMORY_RESTART=1536M`, because code-generation runs can retain large streamed outputs and generated file maps before the process releases memory.
- Requirement, design, and code LLM operations inherit the global model task timeout defaults unless the stage-specific `UML_REQUIREMENT_MODEL_TASK_*`, `UML_DESIGN_MODEL_TASK_*`, or `UML_CODE_MODEL_TASK_*` overrides are set; keep the defaults unless production traces show slow but healthy streams need a larger max runtime. For classroom validation, temporarily lowering requirement/design max runtime is useful to prevent one malformed or silent provider response from occupying a worker for an hour of retries.

## PM2

The existing `ecosystem.config.cjs` now reads:

- `UML_API_INSTANCES` for `uml-api`
- `UML_ENABLE_GENERATION_WORKER=true` to add `uml-generation-worker`
- `UML_GENERATION_WORKER_INSTANCES` for worker process count
- `UML_GENERATION_WORKER_CONCURRENCY` for per-worker BullMQ job concurrency
- `UML_API_MAX_MEMORY_RESTART` for API PM2 memory restart threshold; keep this above observed API startup RSS.

When `UML_API_INSTANCES > 1`, PM2 runs `uml-api` in cluster mode so all API workers can share
`API_PORT=4001`. Keep render-service in fork mode because it is a single local HTTP dependency.

Example:

```bash
UML_RUN_QUEUE_MODE=bullmq \
UML_ENABLE_GENERATION_WORKER=true \
REDIS_URL=redis://127.0.0.1:6379/0 \
UML_API_INSTANCES=4 \
UML_GENERATION_WORKER_INSTANCES=2 \
UML_GENERATION_WORKER_CONCURRENCY=1 \
DATABASE_POOL_MAX=5 \
UML_API_MAX_MEMORY_RESTART=1536M \
UML_GENERATION_WORKER_MAX_MEMORY_RESTART=1536M \
pm2 reload ecosystem.config.cjs --env production
```

## PgBouncer

Initial sizing:

```text
default_pool_size = 40
reserve_pool_size = 5
pool_mode = transaction
```

Point `DATABASE_URL` at PgBouncer after validating application compatibility with transaction pooling. If transaction pooling causes session-level issues, fall back to session pooling and retest.

## Rollout Order

1. Run a baseline load test on the current inline-pipeline production release.
2. Deploy Redis and PgBouncer, but keep `UML_RUN_QUEUE_MODE` disabled.
3. Enable queue mode with `UML_API_INSTANCES=1`, `UML_GENERATION_WORKER_INSTANCES=1`, `UML_GENERATION_WORKER_CONCURRENCY=1`.
4. Verify requirement, design, code, and document runs complete through the worker.
5. Enable `UML_API_INSTANCES=4`.
6. Enable `UML_GENERATION_WORKER_INSTANCES=2`.
7. Run staged load tests and tune worker concurrency, render concurrency, and LLM concurrency from evidence.

## Load Test Acceptance

Stage C is the target acceptance gate:

```text
20 users online, 3 concurrent generation runs
30 users online, 5 concurrent generation runs
50 users online, 8 concurrent generation runs
```

Pass criteria:

- Normal API P95 < 1.5s
- Normal API error rate < 1%
- Start-generation requests return `runId` / queued state in 300-800ms
- Task drawer shows queued/running within 1s
- PM2 restart count does not increase
- Postgres connections stay below the PgBouncer pool budget
- BullMQ jobs do not disappear
- Run terminal events are persisted

## Known Follow-Ups

- The current implementation publishes Redis run events, but SSE endpoints still primarily read from the process-local run store. Full cross-API SSE fanout should subscribe to Redis channels so any API instance can stream worker events for runs created elsewhere.
- The first distributed concurrency layer is BullMQ worker concurrency. A dedicated Redis semaphore for global/provider/project/user/run dimensions should be added before increasing worker concurrency aggressively.
- Cancellation now sends a Redis control message to workers. Long provider calls can still only stop at cooperative cancellation points unless provider abort signals are wired end-to-end.
