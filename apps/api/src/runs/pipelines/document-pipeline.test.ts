// Verifies document pipelines enforce requirement baseline gates before rendering artifacts.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  ProviderSettings,
  StartDocumentRunRequest,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../llm.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import { createEmptyDocumentSnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import { runDocumentStagePipeline } from "./document-pipeline.js";

const providerSettings: ProviderSettings = {
  apiBaseUrl: "https://ai.comfly.org",
  apiKey: "sk-test",
  model: "gpt-5.5",
};

function blockedDocumentInput(): StartDocumentRunRequest {
  const requirementBaseline = buildRequirementBaseline({
    runId: "run-blocked-document-baseline",
    requirementText: "用户可以查看公开活动日历。用户不得查看公开活动日历。",
    rules: [
      {
        id: "REQ-001",
        category: "功能需求",
        text: "用户可以查看公开活动日历。",
        relatedDiagrams: ["usecase"],
      },
      {
        id: "REQ-002",
        category: "业务规则",
        text: "用户不得查看公开活动日历。",
        relatedDiagrams: ["usecase"],
      },
    ],
  });
  requirementBaseline.qualityReport = {
    ...requirementBaseline.qualityReport,
    status: "blocked",
    summary: "需求基线存在阻断型质量问题。",
    issues: [
      {
        id: "ISS-001",
        requirementId: "REQ-001",
        severity: "critical",
        code: "conflict",
        message: "公开活动日历查看规则互相冲突。",
        blocksDownstream: true,
      },
    ],
    blockingIssueIds: ["ISS-001"],
    reviewRequiredRequirementIds: ["REQ-001"],
  };
  return {
    documentKind: "requirementsSpec",
    requirementText: "用户可以查看公开活动日历。",
    requirementBaseline,
    rules: [],
    requirementModels: [],
    requirementModelTraceability: [],
    requirementPlantUml: [],
    requirementSvgArtifacts: [],
    designModels: [],
    designModelTraceability: [],
    designPlantUml: [],
    designSvgArtifacts: [],
    useAiText: false,
  };
}

test("runDocumentStagePipeline rejects blocked requirement baselines before DOCX assembly", async () => {
  const input = blockedDocumentInput();
  const record: RunRecord = {
    snapshot: createEmptyDocumentSnapshot("run-blocked-document", input),
    events: [],
    listeners: new Set(),
    terminal: false,
  };
  const documentLibrary = {
    saveGeneratedDocument: async () => {
      throw new Error("document library should not be called for blocked baselines");
    },
  } as unknown as DocumentLibrary;

  await assert.rejects(
    () =>
      runDocumentStagePipeline(
        record,
        input,
        documentLibrary,
        "workspace-test",
        providerSettings,
        {} as LlmTransport,
        (async () => {
          throw new Error("PNG renderer should not be called for blocked baselines");
        }) as PngRenderClient,
      ),
    /RequirementBaseline blocked downstream generation: 公开活动日历查看规则互相冲突/u,
  );
  assert.equal(record.snapshot.status, "queued");
  assert.equal(record.events.length, 0);
});
