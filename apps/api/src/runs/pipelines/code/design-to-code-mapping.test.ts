// Verifies deterministic design-model coverage before prompts ask an LLM to write files.
import assert from "node:assert/strict";
import test from "node:test";
import type { CodeRunSnapshot, DesignDiagramModelSpec } from "@uml-platform/contracts";
import { buildCodeContext } from "./code-context.js";
import {
  buildDesignModelCoverageReport,
  buildDesignToCodeMapping,
} from "./design-to-code-mapping.js";

function sampleDesignModels(): DesignDiagramModelSpec[] {
  return [
    {
      diagramKind: "architecture",
      modelId: "architecture",
      title: "总体架构",
      summary: "分层架构",
      notes: [],
      packages: [{ id: "pkg-front", name: "前端应用", componentIds: ["cmp-shell"] }],
      components: [{ id: "cmp-shell", name: "工作台外壳", packageId: "pkg-front" }],
      relationships: [
        { id: "arch-rel", type: "dependency", sourceId: "cmp-shell", targetId: "pkg-front" },
      ],
    },
    {
      diagramKind: "sequence",
      modelId: "sequence:submit",
      sourceUseCaseId: "submit",
      sourceUseCaseName: "提交申请",
      title: "提交申请",
      summary: "用户提交申请",
      notes: [],
      participants: [
        { id: "actor-user", name: "用户", participantType: "actor" },
        { id: "svc-submit", name: "提交服务", participantType: "service" },
      ],
      messages: [
        {
          id: "msg-submit",
          type: "sync",
          sourceId: "actor-user",
          targetId: "svc-submit",
          name: "submitRequest",
          parameters: ["request"],
        },
      ],
      fragments: [{ id: "frag-invalid", type: "alt", label: "校验失败", messageIds: ["msg-submit"] }],
    },
    {
      diagramKind: "activity",
      modelId: "activity",
      title: "界面关系",
      summary: "页面跳转",
      notes: [],
      swimlanes: [],
      nodes: [
        { id: "page-list", type: "activity", name: "申请列表", input: [], output: [] },
        { id: "decision-valid", type: "decision", question: "是否有效" },
      ],
      relationships: [
        { id: "route-detail", type: "control_flow", sourceId: "page-list", targetId: "decision-valid" },
      ],
    },
    {
      diagramKind: "class",
      modelId: "class",
      title: "设计类图",
      summary: "申请实体",
      notes: [],
      classes: [
        {
          id: "Application",
          name: "Application",
          attributes: [{ name: "status", type: "string", visibility: "public" }],
          operations: [],
        },
      ],
      interfaces: [{ id: "SubmitPort", name: "SubmitPort", operations: [] }],
      enums: [{ id: "ApplicationStatus", name: "ApplicationStatus", literals: ["待提交"] }],
      relationships: [
        { id: "class-rel", type: "association", sourceId: "Application", targetId: "SubmitPort" },
      ],
    },
    {
      diagramKind: "component",
      modelId: "component",
      title: "组件关系",
      summary: "组件拆分",
      notes: [],
      components: [{ id: "cmp-form", name: "申请表单", sourceClassIds: ["Application"] }],
      interfaces: [{ id: "iface-submit", name: "提交接口", operationNames: ["submitRequest"] }],
      relationships: [
        { id: "cmp-rel", type: "required-interface", sourceId: "cmp-form", targetId: "iface-submit" },
      ],
    },
    {
      diagramKind: "deployment",
      modelId: "deployment",
      title: "部署设计",
      summary: "外部服务",
      notes: [],
      nodes: [{ id: "browser", name: "浏览器", nodeType: "device" }],
      databases: [{ id: "db-main", name: "业务库" }],
      components: [{ id: "api", name: "业务 API" }],
      externalSystems: [{ id: "sms", name: "短信服务" }],
      artifacts: [{ id: "artifact-web", name: "前端包" }],
      relationships: [
        { id: "dep-rel", type: "communication", sourceId: "browser", targetId: "api" },
      ],
    },
    {
      diagramKind: "table",
      modelId: "table",
      title: "数据库设计",
      summary: "申请表",
      notes: [],
      tables: [
        {
          id: "applications",
          name: "applications",
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "uuid",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
          ],
        },
      ],
      relationships: [],
    },
  ];
}

test("design-to-code mapping covers every design model kind with concrete targets", () => {
  const mapping = buildDesignToCodeMapping(sampleDesignModels(), "2026-06-26T00:00:00.000Z");
  const kinds = new Set(mapping.items.map((item) => item.diagramKind));
  assert.deepEqual([...kinds].sort(), [
    "activity",
    "architecture",
    "class",
    "component",
    "deployment",
    "sequence",
    "table",
  ]);
  assert.ok(mapping.items.some((item) => item.targetPath.startsWith("/src/features/")));
  assert.ok(mapping.items.some((item) => item.targetPath.startsWith("/src/components/")));
  assert.ok(mapping.items.some((item) => item.targetPath === "/src/domain/types.ts"));
  assert.ok(mapping.items.some((item) => item.targetPath === "/src/data/mock-data.ts"));

  const report = buildDesignModelCoverageReport({
    designModels: sampleDesignModels(),
    mapping,
    generatedAt: "2026-06-26T00:00:00.000Z",
  });
  assert.equal(report.passed, true);
  assert.equal(report.models.length, 7);
});

test("buildCodeContext keeps design-only facts and expands architecture component and table models", () => {
  const designModels = sampleDesignModels();
  const mapping = buildDesignToCodeMapping(designModels, "2026-06-26T00:00:00.000Z");
  const snapshot = {
    runId: "code-run",
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    designModels,
    designPlantUml: [],
    spec: null,
    businessLogic: null,
    designToCodeMapping: mapping,
    designModelCoverageReport: buildDesignModelCoverageReport({ designModels, mapping }),
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    businessAssertionResults: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: [],
    codeTrace: [],
    codeGenerationMode: "json_schema_operations",
    qualityDiagnostics: [],
    files: {},
    entryFile: "/src/App.tsx",
    dependencies: {},
    agentPlan: [],
    generationMode: "continue",
    changedFileCount: 0,
    diagnostics: [],
    codeContextHash: null,
    currentStage: null,
    status: "running",
    error: null,
  } as CodeRunSnapshot;

  const context = buildCodeContext(snapshot) as Record<string, unknown>;
  assert.equal("requirementText" in context, false);
  assert.equal("rules" in context, false);
  assert.equal("requirementBaseline" in context, false);
  assert.ok(String(context.authority).includes("Design Model Only"));

  const compactModels = context.designModels as Array<Record<string, unknown>>;
  const architecture = compactModels.find((model) => model.diagramKind === "architecture");
  const component = compactModels.find((model) => model.diagramKind === "component");
  const table = compactModels.find((model) => model.diagramKind === "table");
  assert.equal(Array.isArray(architecture?.components), true);
  assert.equal(Array.isArray(component?.interfaces), true);
  assert.equal(Array.isArray(table?.tables), true);
  assert.equal(context.designToCodeMapping, mapping);
});
