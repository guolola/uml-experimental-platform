// Builds admin run list/detail views while enforcing project data-scope visibility.
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import {
  buildAdminRunDto,
} from "./admin-route-presenters.js";
import type {
  RunRecord,
  RunRecordStore,
} from "../runs/records/run-record-store.js";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import { snapshotErrorMessage } from "../runs/records/admin-run-summaries.js";
import type { AdminActor } from "../security/admin-guard.js";
import {
  canSeeProjectByScope,
  hasFullProjectScope,
  visibleProjectsForAdmin,
} from "./academic-scope.js";

type AdminRunReadInput = {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
  runs: RunRecordStore;
  providerConfigs?: ProviderConfigStore;
};

function compareRunsNewestFirst(left: RunRecord, right: RunRecord) {
  const leftTime = new Date(left.metadata?.createdAt ?? 0).getTime();
  const rightTime = new Date(right.metadata?.createdAt ?? 0).getTime();
  return (Number.isFinite(rightTime) ? rightTime : 0) -
    (Number.isFinite(leftTime) ? leftTime : 0);
}

async function listVisibleAdminRunRecords({
  academicStore,
  authStore,
  actor,
  runs,
}: AdminRunReadInput) {
  const visibleProjectIds = hasFullProjectScope(actor)
    ? null
    : new Set(
        (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
          (project) => project.id,
        ),
      );

  return Array.from(runs.values())
    .filter(
      (record) =>
        visibleProjectIds === null ||
        (record.metadata?.projectId &&
          visibleProjectIds.has(String(record.metadata.projectId))),
    )
    .sort(compareRunsNewestFirst);
}

export async function listAdminRunDtos(input: AdminRunReadInput) {
  const visibleRuns = await listVisibleAdminRunRecords(input);
  return Promise.all(
    visibleRuns.map((record) =>
      buildAdminRunDto(record, input.authStore, {
        providerConfigs: input.providerConfigs,
      }),
    ),
  );
}

export async function buildAdminRunListView(input: AdminRunReadInput) {
  const visibleRuns = await listVisibleAdminRunRecords(input);
  return {
    generatedAt: new Date().toISOString(),
    runs: await Promise.all(
      visibleRuns.map((record) =>
        buildAdminRunDto(record, input.authStore, {
          providerConfigs: input.providerConfigs,
        }),
      ),
    ),
    structuredOutputMetrics: buildStructuredOutputMetrics(visibleRuns),
  };
}

function buildStructuredOutputMetrics(records: RunRecord[]) {
  const groups = new Map<string, {
    model: string;
    requestedMode: string;
    effectiveMode: string;
    total: number;
    initialStructureFailures: number;
    targetedRepairSuccesses: number;
    strictJsonDowngrades: number;
    finalStructuredOutputInvalid: number;
    aliasNormalizations: number;
    repairByStage: Record<string, number>;
  }>();
  for (const record of records) {
    const snapshot = record.snapshot as unknown as {
      generationDiagnostics?: {
        requestedMode?: string;
        effectiveMode?: string;
        downgradeReasons?: string[];
        normalizationActions?: string[];
        repairs?: Array<{ stage?: string; succeeded?: boolean }>;
      } | null;
      error?: { code?: string } | null;
    };
    const diagnostics = snapshot.generationDiagnostics;
    if (!diagnostics?.requestedMode || !diagnostics.effectiveMode) continue;
    const model = String(record.metadata?.model ?? "unknown");
    const key = `${model}:${diagnostics.requestedMode}:${diagnostics.effectiveMode}`;
    const current = groups.get(key) ?? {
      model,
      requestedMode: diagnostics.requestedMode,
      effectiveMode: diagnostics.effectiveMode,
      total: 0,
      initialStructureFailures: 0,
      targetedRepairSuccesses: 0,
      strictJsonDowngrades: 0,
      finalStructuredOutputInvalid: 0,
      aliasNormalizations: 0,
      repairByStage: {},
    };
    const repairs = diagnostics.repairs ?? [];
    current.total += 1;
    if (repairs.length > 0) current.initialStructureFailures += 1;
    if (repairs.some((repair) => repair.succeeded)) {
      current.targetedRepairSuccesses += 1;
    }
    for (const repair of repairs) {
      const stage = repair.stage ?? "unknown";
      current.repairByStage[stage] = (current.repairByStage[stage] ?? 0) + 1;
    }
    current.strictJsonDowngrades += diagnostics.downgradeReasons?.length ?? 0;
    if (snapshot.error?.code === "RUN_STRUCTURED_OUTPUT_INVALID") {
      current.finalStructuredOutputInvalid += 1;
    }
    current.aliasNormalizations += (diagnostics.normalizationActions ?? []).filter(
      (action) => action.startsWith("aliased-"),
    ).length;
    groups.set(key, current);
  }
  return [...groups.values()];
}

function runDiagnosticSummary(record: RunRecord) {
  const serializedEvents = record.events.map((event) => JSON.stringify(event));
  const repairEventCount = serializedEvents.filter((event) =>
    /repair|修复|plantuml/i.test(event),
  ).length;
  const artifactCount =
    record.events.filter((event) => /artifact|document|code_file/i.test(event.type)).length ||
    Object.entries(record.snapshot).filter(([, value]) => Array.isArray(value)).length;

  return {
    currentStage: record.snapshot.currentStage ?? null,
    terminal: record.terminal,
    eventCount: record.events.length,
    repairEventCount,
    artifactCount,
    errorMessage: snapshotErrorMessage(record.snapshot),
    snapshotKeys: Object.keys(record.snapshot),
    structuredOutput:
      "generationDiagnostics" in record.snapshot
        ? record.snapshot.generationDiagnostics ?? null
        : null,
    validationIssues:
      record.snapshot.error?.details &&
      Array.isArray(record.snapshot.error.details.validationIssues)
        ? record.snapshot.error.details.validationIssues
        : [],
  };
}

async function getReadableAdminRunRecord({
  academicStore,
  authStore,
  actor,
  runs,
  runId,
}: AdminRunReadInput & { runId: string }) {
  const record = runs.get(runId);
  if (!record) {
    return { ok: false, statusCode: 404, body: { message: "Run not found" } } as const;
  }

  const projectId =
    typeof record.metadata?.projectId === "string" ? record.metadata.projectId : null;
  const project = projectId ? await authStore.getProject(projectId) : null;
  if (
    project &&
    !(await canSeeProjectByScope(academicStore, authStore, actor, project))
  ) {
    return { ok: false, statusCode: 404, body: { message: "Run not found" } } as const;
  }
  if (!project && !hasFullProjectScope(actor)) {
    return { ok: false, statusCode: 404, body: { message: "Run not found" } } as const;
  }

  return { ok: true, record } as const;
}

export async function getAdminRunDetail(input: AdminRunReadInput & { runId: string }) {
  const access = await getReadableAdminRunRecord(input);
  if (!access.ok) {
    return { statusCode: access.statusCode, body: access.body };
  }

  const run = access.record;
  return {
    statusCode: 200,
    body: {
      generatedAt: new Date().toISOString(),
      run: {
        ...(await buildAdminRunDto(run, input.authStore, {
          includeArtifactPreviews: true,
          providerConfigs: input.providerConfigs,
        })),
        id: run.snapshot.runId,
        status: run.snapshot.status,
        currentStage: run.snapshot.currentStage,
        errorMessage: snapshotErrorMessage(run.snapshot),
        metadata: run.metadata ?? null,
        terminal: run.terminal,
        diagnostics: runDiagnosticSummary(run),
        snapshot: run.snapshot,
        events: run.events,
      },
    },
  };
}
