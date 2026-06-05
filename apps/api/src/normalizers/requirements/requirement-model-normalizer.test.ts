// Covers requirement-stage model normalization rules before contract validation.
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRequirementDiagramModelsOnly,
  parseRequirementTraceabilityCoverageResult,
} from "./requirement-model-normalizer.js";

const nullableModelIdTraceabilityReplayFixtures = [
  {
    name: "null modelId",
    raw: `{"requirementModelTraceability":[{"ruleId":"r2","target":{"diagramKind":"activity","elementId":"n_search","elementKind":"activity","label":"检索设备","modelId":null}}]}`,
  },
  {
    name: "empty modelId",
    raw: `{"requirementModelTraceability":[{"ruleId":"r2","target":{"diagramKind":"activity","elementId":"n_search","elementKind":"activity","label":"检索设备","modelId":""}}]}`,
  },
] as const;

test("parseRequirementDiagramModelsOnly removes services and class operations", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "class",
          title: "领域概念模型",
          summary: "实体属性关系",
          notes: [],
          classes: [
            {
              id: "reservation",
              name: "Reservation",
              classKind: "entity",
              attributes: [{ name: "id", type: "string", visibility: "private" }],
              operations: [
                { name: "confirm", visibility: "public", parameters: [] },
              ],
            },
            {
              id: "reservation_service",
              name: "ReservationService",
              classKind: "service",
              attributes: [],
              operations: [
                { name: "reserve", visibility: "public", parameters: [] },
              ],
            },
          ],
          interfaces: [],
          enums: [],
          relationships: [
            {
              id: "rel1",
              type: "dependency",
              sourceId: "reservation",
              targetId: "reservation_service",
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "class");
  if (model?.diagramKind !== "class") return;
  assert.deepEqual(model.classes.map((item) => item.name), ["Reservation"]);
  assert.deepEqual(model.classes[0]?.operations, []);
  assert.deepEqual(model.relationships, []);
});

test("parseRequirementDiagramModelsOnly softly dedupes repeated interface actions", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "activity",
          title: "界面关系图",
          summary: "界面跳转",
          notes: [],
          swimlanes: [{ id: "system", name: "系统" }],
          nodes: [
            { id: "start", type: "start", name: "开始" },
            {
              id: "show1",
              type: "activity",
              name: "展示座位网格分布",
              actorOrLane: "system",
              input: [],
              output: [],
            },
            {
              id: "show2",
              type: "activity",
              name: "展示座位网格分布",
              actorOrLane: "system",
              input: [],
              output: [],
            },
            { id: "end", type: "end", name: "结束" },
          ],
          relationships: [
            { id: "f1", type: "control_flow", sourceId: "start", targetId: "show1" },
            { id: "f2", type: "control_flow", sourceId: "show2", targetId: "end" },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "activity");
  if (model?.diagramKind !== "activity") return;
  assert.equal(model.nodes.filter((node) => node.type === "activity").length, 1);
  assert.equal(model.relationships[1]?.sourceId, "show1");
});

test("parseRequirementDiagramModelsOnly preserves long relationship text in description", () => {
  const longLabel =
    "加密业务访问 | 协议: HTTPS | 端口: 443 | 客户端通过HTTPS访问后端接口，覆盖登录、查座、预约、签到与预约查看。";
  const longGuard = "库存可用且用户没有超期未归还设备并且当前时间段未被占用";
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "deployment",
          title: "部署需求模型",
          summary: "部署约束",
          notes: [],
          nodes: [
            { id: "mini", name: "微信小程序客户端", nodeType: "device" },
            { id: "gateway", name: "API网关", nodeType: "server" },
          ],
          databases: [],
          components: [],
          externalSystems: [],
          artifacts: [],
          relationships: [
            {
              id: "rel_gateway",
              type: "communication",
              sourceId: "mini",
              targetId: "gateway",
              label: longLabel,
              protocol: "HTTPS",
              port: 443,
            },
          ],
        },
        {
          diagramKind: "activity",
          title: "总体业务流程",
          summary: "预约流程",
          notes: [],
          swimlanes: [],
          nodes: [
            { id: "start", type: "start", name: "开始" },
            { id: "check", type: "decision", question: "是否允许预约？" },
            { id: "reserve", type: "activity", name: "提交预约", input: [], output: [] },
          ],
          relationships: [
            { id: "r1", type: "control_flow", sourceId: "start", targetId: "check" },
            {
              id: "r2",
              type: "control_flow",
              sourceId: "check",
              targetId: "reserve",
              guard: longGuard,
            },
          ],
        },
      ],
    }),
  );

  const deployment = parsed.models.find((model) => model.diagramKind === "deployment");
  assert.equal(deployment?.diagramKind, "deployment");
  if (deployment?.diagramKind === "deployment") {
    assert.equal(deployment.relationships[0]?.label, "加密业务访问");
    assert.equal(deployment.relationships[0]?.port, "443");
    assert.match(deployment.relationships[0]?.description ?? "", /覆盖登录、查座、预约/);
  }

  const activity = parsed.models.find((model) => model.diagramKind === "activity");
  assert.equal(activity?.diagramKind, "activity");
  if (activity?.diagramKind === "activity") {
    assert.notEqual(activity.relationships[1]?.guard, longGuard);
    assert.match(activity.relationships[1]?.description ?? "", /当前时间段未被占用/);
  }
});

test("parseRequirementTraceabilityCoverageResult ignores nullable optional model ids", () => {
  const rules = [
    {
      id: "FR-001",
      category: "functional" as const,
      title: "预约座位",
      statement: "学生可以预约座位。",
      priority: "must" as const,
      sourceExcerpt: "学生可以预约座位。",
    },
  ];
  const models = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "座位预约",
          notes: [],
          actors: [{ id: "student", name: "学生", actorType: "human" }],
          useCases: [
            {
              id: "uc_reserve",
              name: "预约座位",
              goal: "完成座位预约",
              preconditions: [],
              postconditions: [],
              supportingActorIds: [],
            },
          ],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    }),
  ).models;

  const coverage = parseRequirementTraceabilityCoverageResult(
    JSON.stringify({
      requirementModelTraceability: [
        {
          ruleId: "FR-001",
          target: {
            modelId: null,
            diagramKind: "usecase",
            elementId: "uc_reserve",
            elementKind: "usecase",
            label: "预约座位",
          },
        },
      ],
    }),
    rules,
    models,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.traceability[0]?.target.elementId, "uc_reserve");
  assert.equal(coverage.traceability[0]?.target.modelId, undefined);
});

test("parseRequirementTraceabilityCoverageResult replays nullable modelId failures from logs", () => {
  const rules = [
    {
      id: "r2",
      category: "functional" as const,
      title: "检索设备",
      statement: "用户可以检索设备。",
      priority: "must" as const,
      sourceExcerpt: "用户可以检索设备。",
    },
  ];
  const models = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "activity",
          title: "设备检索流程",
          summary: "用户检索设备。",
          notes: [],
          swimlanes: [],
          nodes: [
            { id: "start", type: "start", name: "开始" },
            { id: "n_search", type: "activity", name: "检索设备", input: [], output: [] },
            { id: "end", type: "end", name: "结束" },
          ],
          relationships: [],
        },
      ],
    }),
  ).models;

  for (const fixture of nullableModelIdTraceabilityReplayFixtures) {
    const coverage = parseRequirementTraceabilityCoverageResult(
      fixture.raw,
      rules,
      models,
    );

    assert.equal(coverage.traceability.length, 1, fixture.name);
    assert.equal(coverage.traceability[0]?.ruleId, "r2", fixture.name);
    assert.equal(coverage.traceability[0]?.target.diagramKind, "activity", fixture.name);
    assert.equal(coverage.traceability[0]?.target.elementId, "n_search", fixture.name);
    assert.equal(coverage.traceability[0]?.target.modelId, undefined, fixture.name);
    assert.equal(coverage.missingTargets.length, 0, fixture.name);
  }
});

test("parseRequirementTraceabilityCoverageResult keeps valid entries when nearby trace refs are malformed", () => {
  const rules = [
    {
      id: "FR-001",
      category: "functional" as const,
      title: "预约座位",
      statement: "学生可以预约座位。",
      priority: "must" as const,
      sourceExcerpt: "学生可以预约座位。",
    },
  ];
  const models = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "座位预约",
          notes: [],
          actors: [{ id: "student", name: "学生", actorType: "human" }],
          useCases: [
            {
              id: "uc_reserve",
              name: "预约座位",
              goal: "完成座位预约",
              preconditions: [],
              postconditions: [],
              supportingActorIds: [],
            },
          ],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    }),
  ).models;

  const coverage = parseRequirementTraceabilityCoverageResult(
    JSON.stringify({
      requirementModelTraceability: [
        {
          ruleId: "FR-001",
          target: {
            modelId: null,
            diagramKind: "use-case-diagram",
            elementId: "uc_reserve",
            elementKind: null,
            label: null,
          },
        },
        {
          ruleId: "FR-001",
          target: {
            diagramKind: "requirements",
            elementId: "uc_reserve",
          },
        },
      ],
    }),
    rules,
    models,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.traceability[0]?.target.diagramKind, "usecase");
  assert.equal(coverage.traceability[0]?.target.elementId, "uc_reserve");
  assert.equal(coverage.missingTargets.length, 1);
  assert.equal(coverage.missingTargets[0]?.elementId, "student");
});
