// Verifies project document commands derive feasibility reports only from complete, current feasibility analysis.
import assert from "node:assert/strict";
import test from "node:test";
import { snapshotInputFingerprint } from "@uml-platform/contracts";
import { resolveDocumentRunInput } from "./run-input-resolution.js";

const rules = [{
  id: "R1",
  category: "功能需求",
  text: "用户可以提交维修预约。",
  relatedDiagrams: ["usecase"],
}];

const contextModel = {
  diagramKind: "context",
  modelId: "context",
  title: "维修预约系统上下文",
  summary: "系统边界",
  notes: [],
  system: { id: "system", name: "维修预约系统", sourceRequirementIds: [] },
  people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
  externalSystems: [],
  relationships: [{
    id: "booking",
    sourceId: "customer",
    targetId: "system",
    direction: "directed",
    label: "提交预约",
    sourceRequirementIds: ["R1"],
  }],
};

const implementationPlan = {
  overview: "采用模块化 Web 实现。",
  candidates: [{
    id: "option-a",
    name: "模块化方案",
    summary: "按模块交付。",
    advantages: ["易于实施"],
    disadvantages: ["需要维护模块边界"],
    estimatedCost: "待确认",
    estimatedSchedule: "8 周",
    sourceRequirementIds: ["R1"],
    implementation: {
      architecture: {
        summary: "分层架构。",
        modules: [{
          id: "booking-module",
          name: "预约模块",
          responsibility: "管理预约。",
          sourceRequirementIds: ["R1"],
        }],
      },
      dataStrategy: { summary: "关系数据存储。", sourceRequirementIds: ["R1"] },
      integrations: [],
      deploymentAndOperations: { summary: "容器化部署。", sourceRequirementIds: ["R1"] },
      securityAndCompliance: { summary: "最小权限。", sourceRequirementIds: ["R1"] },
      milestones: [{
        id: "milestone-1",
        name: "核心交付",
        timeframe: "8 周",
        deliverables: ["可运行系统"],
        roles: ["开发者"],
        dependencies: [],
        acceptanceCriteria: ["预约流程通过验收"],
        sourceRequirementIds: ["R1"],
      }],
      risks: [],
      verdicts: [
        { category: "technical", verdict: "feasible", rationale: "技术成熟。" },
        { category: "operational", verdict: "feasible", rationale: "流程可执行。" },
        { category: "schedule", verdict: "feasible", rationale: "周期可控。" },
        { category: "economic", verdict: "conditional", rationale: "需确认预算。" },
        { category: "legal", verdict: "feasible", rationale: "无额外限制。" },
      ],
      decision: "conditional-go",
      preconditions: ["确认预算"],
    },
  }],
  recommendedCandidateId: "option-a",
  recommendationRationale: "适合当前规模。",
};

function currentFeasibilityState() {
  const feasibilityInputs = {};
  return {
    requirementText: "",
    rules,
    requirementBaseline: null,
    models: {},
    designModels: {},
    feasibilityInputs,
    feasibilityContextModel: contextModel,
    feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg><text>维修预约系统</text></svg>",
    feasibilityContextFingerprint: snapshotInputFingerprint({
      rules,
      requirementBaseline: null,
    }),
    feasibilityImplementationPlan: implementationPlan,
    feasibilityImplementationFingerprint: snapshotInputFingerprint({
      rules,
      contextModel,
      inputs: feasibilityInputs,
    }),
  };
}

const command = {
  projectId: "project-a",
  documentKind: "feasibilityStudy",
  providerSettings: {
    providerConfigId: "provider-a",
    model: "model-a",
  },
  useAiText: false,
};

test("current feasibility analysis enables a report without requirement or design models", async () => {
  const result = await resolveDocumentRunInput(
    command,
    { projectId: "project-a" },
    async () => ({ state: currentFeasibilityState() }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.documentKind, "feasibilityStudy");
  assert.equal(result.input.requirementModels.length, 1);
  assert.equal(result.input.designModels.length, 0);
  assert.equal(result.input.feasibilityImplementationPlan?.recommendedCandidateId, "option-a");
});

test("missing feasibility solution still blocks report generation", async () => {
  const state = currentFeasibilityState();
  state.feasibilityImplementationPlan = null as never;

  const result = await resolveDocumentRunInput(
    command,
    { projectId: "project-a" },
    async () => ({ state }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.statusCode, 409);
  assert.match(result.body.message, /上下文图和实现方案/u);
});

test("stale feasibility analysis still blocks report generation", async () => {
  const state = currentFeasibilityState();
  state.feasibilityImplementationFingerprint = "stale";

  const result = await resolveDocumentRunInput(
    command,
    { projectId: "project-a" },
    async () => ({ state }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.statusCode, 409);
  assert.match(result.body.message, /实现方案已过期/u);
});
