// Registers run endpoints and delegates lifecycle work to pipelines and record stores.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  codeRunSnapshotSchema,
  documentRunSnapshotSchema,
  designRunSnapshotSchema,
  failedRunEventSchema,
  queuedRunEventSchema,
  runSnapshotSchema,
  startCodeRunRequestSchema,
  startCodeRunResponseSchema,
  startDesignRunRequestSchema,
  startDesignRunResponseSchema,
  startDocumentRunRequestSchema,
  startDocumentRunResponseSchema,
  startRunRequestSchema,
  startRunResponseSchema,
  type CodeRunSnapshot,
  type ProviderSettings,
  type RunStage,
  type StartDocumentRunRequest,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "../../runs/records/snapshots.js";
import {
  emitEvent,
  type RunRecord,
  type RunRecordStore,
} from "../../runs/records/run-record-store.js";
import { registerRunEventsRoute } from "../../runs/records/run-events.js";
import { RUN_ROUTE_CONFIG } from "./run-route-config.js";

type RequirementPipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) => Promise<void>;

type DesignPipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) => Promise<void>;

type CodePipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
) => Promise<void>;

type DocumentPipeline = (
  record: RunRecord,
  input: StartDocumentRunRequest,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  pngRenderClient: PngRenderClient,
) => Promise<void>;

export function registerRunRoutes({
  app,
  runs,
  llmTransport,
  renderClient,
  pngRenderClient,
  defaultSseAllowOrigin,
  runStagePipeline,
  runDesignStagePipeline,
  runCodeStagePipeline,
  runDocumentStagePipeline,
  addCodeDiagnostic,
}: {
  app: FastifyInstance;
  runs: RunRecordStore;
  llmTransport: LlmTransport;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  defaultSseAllowOrigin: string;
  runStagePipeline: RequirementPipeline;
  runDesignStagePipeline: DesignPipeline;
  runCodeStagePipeline: CodePipeline;
  runDocumentStagePipeline: DocumentPipeline;
  addCodeDiagnostic: (
    snapshot: CodeRunSnapshot,
    stage: RunStage,
    message: string,
  ) => void;
}) {
  app.post(RUN_ROUTE_CONFIG.requirements.startPath, async (request, reply) => {
    const input = startRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptySnapshot(
        runId,
        input.requirementText,
        input.selectedDiagrams,
        input.rules,
      ),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    // Routes create queued records; pipelines advance them to running/completed/failed.
    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runStagePipeline(record, input.providerSettings, llmTransport, renderClient).catch(
      (error) => {
        record.snapshot.status = "failed";
        record.snapshot.errorMessage =
          error instanceof Error ? error.message : "Unknown run error";
        emitEvent(
          record,
          failedRunEventSchema.parse({
            type: "failed",
            stage: record.snapshot.currentStage ?? undefined,
            message: record.snapshot.errorMessage,
          }),
        );
      },
    );

    reply.code(202);
    return startRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.design.startPath, async (request, reply) => {
    const input = startDesignRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptyDesignSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runDesignStagePipeline(
      record,
      input.providerSettings,
      llmTransport,
      renderClient,
    ).catch((error) => {
      record.snapshot.status = "failed";
      record.snapshot.errorMessage =
        error instanceof Error ? error.message : "Unknown design run error";
      emitEvent(
        record,
        failedRunEventSchema.parse({
          type: "failed",
          stage: record.snapshot.currentStage ?? undefined,
          message: record.snapshot.errorMessage,
        }),
      );
    });

    reply.code(202);
    return startDesignRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.code.startPath, async (request, reply) => {
    const input = startCodeRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptyCodeSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runCodeStagePipeline(
      record,
      input.providerSettings,
      llmTransport,
    ).catch((error) => {
      record.snapshot.status = "failed";
      record.snapshot.errorMessage =
        error instanceof Error ? error.message : "Unknown code run error";
      addCodeDiagnostic(
        record.snapshot as CodeRunSnapshot,
        record.snapshot.currentStage ?? "write_code_files",
        record.snapshot.errorMessage,
      );
      emitEvent(
        record,
        failedRunEventSchema.parse({
          type: "failed",
          stage: record.snapshot.currentStage ?? undefined,
          message: record.snapshot.errorMessage,
        }),
      );
    });

    reply.code(202);
    return startCodeRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.document.startPath, async (request, reply) => {
    const input = startDocumentRunRequestSchema.parse(request.body);
    if (input.documentKind === "requirementsSpec" && input.requirementModels.length === 0) {
      reply.code(400);
      return { message: "请先在需求页生成需求模型，再导出需求规格说明书" };
    }
    if (input.documentKind === "softwareDesignSpec" && input.designModels.length === 0) {
      reply.code(400);
      return { message: "请先在设计页生成设计模型，再导出软件设计说明书" };
    }

    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptyDocumentSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runDocumentStagePipeline(
      record,
      input,
      input.providerSettings,
      llmTransport,
      pngRenderClient,
    ).catch((error) => {
      record.snapshot.status = "failed";
      record.snapshot.errorMessage =
        error instanceof Error ? error.message : "Unknown document run error";
      emitEvent(
        record,
        failedRunEventSchema.parse({
          type: "failed",
          stage: record.snapshot.currentStage ?? "generate_document_text",
          message: record.snapshot.errorMessage,
        }),
      );
    });

    reply.code(202);
    return startDocumentRunResponseSchema.parse({ runId });
  });

  app.get(RUN_ROUTE_CONFIG.requirements.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: RUN_ROUTE_CONFIG.requirements.notFoundMessage };
    }
    return runSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.design.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: RUN_ROUTE_CONFIG.design.notFoundMessage };
    }
    return designRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.code.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return {
        message: RUN_ROUTE_CONFIG.code.lostSnapshotMessage,
      };
    }
    return codeRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.document.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: RUN_ROUTE_CONFIG.document.notFoundMessage };
    }
    return documentRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.document.downloadPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record || !record.documentBuffer) {
      reply.code(404);
      return { message: "Document file not found" };
    }
    const snapshot = documentRunSnapshotSchema.parse(record.snapshot);
    reply.header(
      "Content-Type",
      snapshot.mimeType ??
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(snapshot.fileName ?? "说明书.docx")}`,
    );
    return record.documentBuffer;
  });

  for (const route of [
    RUN_ROUTE_CONFIG.requirements,
    RUN_ROUTE_CONFIG.design,
    RUN_ROUTE_CONFIG.code,
    RUN_ROUTE_CONFIG.document,
  ]) {
    registerRunEventsRoute({
      app,
      runs,
      path: route.eventsPath,
      notFoundMessage: route.notFoundMessage,
      defaultAllowOrigin: defaultSseAllowOrigin,
    });
  }
}
