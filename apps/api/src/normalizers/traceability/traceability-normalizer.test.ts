// Covers element-level traceability filtering before generated mappings reach the UI.
import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDesignRelationshipTraceability,
  formatTraceabilityMissingRefs,
  normalizeDesignTraceability,
  normalizeDesignTraceabilityWithCoverage,
  normalizeRequirementTraceability,
  normalizeRequirementTraceabilityWithCoverage,
} from "./traceability-normalizer.js";

const rule = {
  id: "r1",
  category: "业务规则",
  text: "用户必须登录后才能提交订单。",
  relatedDiagrams: ["usecase" as const],
};

const requirementModel = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "用户实体",
  notes: [],
  classes: [
    {
      id: "domain-user",
      name: "UserDomain",
      attributes: [],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [
    {
      id: "rel-user-order",
      sourceId: "domain-user",
      targetId: "domain-order",
      type: "association" as const,
    },
  ],
};

const designModel = {
  diagramKind: "class" as const,
  title: "设计类图",
  summary: "静态结构",
  notes: [],
  classes: [
    {
      id: "class-user-auth",
      name: "Class_UserAuth",
      attributes: [],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [],
};

test("requirement traceability keeps valid rule-to-element refs and drops invalid refs", () => {
  const normalized = normalizeRequirementTraceability(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      },
      {
        ruleId: "missing-rule",
        target: { diagramKind: "class", elementId: "domain-user" },
      },
      {
        ruleId: "r1",
        target: { diagramKind: "class", elementId: "missing-element" },
      },
    ],
    [rule],
    [requirementModel],
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.ruleId, "r1");
  assert.equal(normalized[0]?.target.elementId, "domain-user");
  assert.equal(normalized[0]?.target.label, "UserDomain");
});

test("requirement traceability reports uncovered model elements and relationships", () => {
  const normalized = normalizeRequirementTraceabilityWithCoverage(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      },
    ],
    [rule],
    [requirementModel],
  );

  assert.equal(normalized.traceability.length, 1);
  assert.deepEqual(
    normalized.missingTargets.map((target) => target.elementId),
    ["rel-user-order"],
  );
  assert.match(
    formatTraceabilityMissingRefs("requirement", normalized.missingTargets),
    /缺少 1 个需求元素映射：class:rel-user-order/,
  );
});

test("requirement traceability coverage ignores structural activity elements", () => {
  const activityModel = {
    diagramKind: "activity" as const,
    title: "活动流程",
    summary: "业务节点",
    notes: [],
    swimlanes: [{ id: "lane-user", name: "用户" }],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "submit", type: "activity", name: "提交订单" },
      { id: "check", type: "decision", name: "校验库存" },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "flow-start", type: "control_flow" as const, sourceId: "start", targetId: "submit" },
      { id: "flow-submit", type: "control_flow" as const, sourceId: "submit", targetId: "check" },
      { id: "flow-end", type: "control_flow" as const, sourceId: "check", targetId: "end" },
    ],
  };
  const normalized = normalizeRequirementTraceabilityWithCoverage(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "activity",
          elementId: "submit",
          elementKind: "activity",
          label: "提交订单",
        },
      },
    ],
    [rule],
    [activityModel],
  );

  assert.deepEqual(
    normalized.missingTargets.map((target) => target.elementId),
    ["check", "flow-submit"],
  );
});

test("design traceability keeps valid design-to-requirement refs and drops invalid targets", () => {
  const normalized = normalizeDesignTraceability(
    [
      {
        source: {
          diagramKind: "class",
          elementId: "class-user-auth",
          elementKind: "class",
          label: "Class_UserAuth",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "domain-user",
            elementKind: "class",
            label: "UserDomain",
          },
          {
            diagramKind: "class",
            elementId: "missing-element",
          },
        ],
      },
      {
        source: { diagramKind: "class", elementId: "missing-source" },
        targets: [{ diagramKind: "class", elementId: "domain-user" }],
      },
    ],
    [designModel],
    [requirementModel],
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.source.elementId, "class-user-auth");
  assert.deepEqual(
    normalized[0]?.targets.map((target) => target.elementId),
    ["domain-user"],
  );
});

test("design traceability rejects stage names as diagramKind and reports missing source coverage", () => {
  const normalized = normalizeDesignTraceabilityWithCoverage(
    [
      {
        source: {
          diagramKind: "requirements",
          elementId: "class-user-auth",
          elementKind: "class",
          label: "Class_UserAuth",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "domain-user",
            elementKind: "class",
            label: "UserDomain",
          },
        ],
      },
    ],
    [designModel],
    [requirementModel],
  );

  assert.equal(normalized.traceability.length, 0);
  assert.deepEqual(
    normalized.missingSources.map((source) => source.elementId),
    ["class-user-auth"],
  );
});

test("design traceability distinguishes same element ids across sequence model instances", () => {
  const sequenceModels = [
    {
      diagramKind: "sequence" as const,
      modelId: "sequence:uc_view",
      sourceUseCaseId: "uc_view",
      sourceUseCaseName: "查看活动",
      title: "查看活动顺序图",
      summary: "查看活动流程",
      notes: [],
      participants: [
        { id: "p_user", name: "用户", participantType: "actor" as const },
      ],
      messages: [],
      fragments: [],
    },
    {
      diagramKind: "sequence" as const,
      modelId: "sequence:uc_create",
      sourceUseCaseId: "uc_create",
      sourceUseCaseName: "创建活动",
      title: "创建活动顺序图",
      summary: "创建活动流程",
      notes: [],
      participants: [
        { id: "p_user", name: "用户", participantType: "actor" as const },
      ],
      messages: [],
      fragments: [],
    },
  ];

  const normalized = normalizeDesignTraceabilityWithCoverage(
    [
      {
        source: {
          modelId: "sequence:uc_view",
          diagramKind: "sequence",
          elementId: "p_user",
          elementKind: "participant",
          label: "用户",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "domain-user",
            elementKind: "class",
            label: "UserDomain",
          },
        ],
      },
    ],
    sequenceModels,
    [requirementModel],
  );

  assert.equal(normalized.traceability.length, 1);
  assert.equal(normalized.traceability[0]?.source.modelId, "sequence:uc_view");
  assert.deepEqual(
    normalized.missingSources.map((source) => `${source.modelId}:${source.elementId}`),
    ["sequence:uc_create:p_user"],
  );
});

test("design traceability can derive relationship mappings from endpoint mappings", () => {
  const activityDesignModel = {
    diagramKind: "activity" as const,
    title: "设计活动图",
    summary: "页面流程",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "open", type: "activity" as const, name: "打开页面" },
      { id: "submit", type: "activity" as const, name: "提交表单" },
    ],
    relationships: [
      {
        id: "flow-open-submit",
        type: "control_flow" as const,
        sourceId: "open",
        targetId: "submit",
      },
    ],
  };
  const current = [
    {
      source: {
        diagramKind: "activity" as const,
        elementId: "open",
        elementKind: "activity",
        label: "打开页面",
      },
      targets: [
        {
          diagramKind: "usecase" as const,
          elementId: "usecase_generate",
          elementKind: "usecase",
          label: "生成模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "activity" as const,
        elementId: "submit",
        elementKind: "activity",
        label: "提交表单",
      },
      targets: [
        {
          diagramKind: "usecase" as const,
          elementId: "actor_researcher",
          elementKind: "actor",
          label: "研究人员",
        },
      ],
    },
  ];

  const derived = deriveDesignRelationshipTraceability(current, [
    activityDesignModel,
  ]);
  const relationship = derived.find(
    (entry) => entry.source.elementId === "flow-open-submit",
  );

  assert.equal(relationship?.mappingSource, "derived-from-endpoints");
  assert.deepEqual(
    relationship?.targets.map((target) => target.elementId).sort(),
    ["actor_researcher", "usecase_generate"],
  );
});
