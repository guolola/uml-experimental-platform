// Covers requirement-stage model normalization rules before contract validation.
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRequirementDiagramModelsResult,
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

test("parseRequirementDiagramModelsResult keeps function structures functional-only", () => {
  const parsed = parseRequirementDiagramModelsResult(
    JSON.stringify({
      models: [
        {
          diagramKind: "function",
          title: "博客系统功能结构图",
          summary: "功能分解",
          notes: ["非功能需求归入系统支撑分支"],
          nodes: [
            { id: "root", name: "博客系统", sourceRequirementIds: ["r1"] },
            { id: "post", name: "文章管理", sourceRequirementIds: ["r1"] },
            { id: "support", name: "系统支撑", sourceRequirementIds: ["r2"] },
          ],
          relationships: [
            {
              id: "rel_post",
              type: "contains",
              sourceId: "root",
              targetId: "post",
            },
            {
              id: "rel_support",
              type: "decomposition",
              sourceId: "root",
              targetId: "support",
            },
            {
              id: "rel_dependency",
              type: "dependency",
              sourceId: "post",
              targetId: "support",
            },
          ],
        },
      ],
      requirementModelTraceability: [
        {
          ruleId: "r1",
          target: {
            diagramKind: "function",
            modelId: "function",
            elementId: "root",
            elementKind: "function",
            label: "博客系统",
          },
        },
        {
          ruleId: "r1",
          target: {
            diagramKind: "function",
            modelId: "function",
            elementId: "post",
            elementKind: "function",
            label: "文章管理",
          },
        },
        {
          ruleId: "r1",
          target: {
            diagramKind: "function",
            modelId: "function",
            elementId: "rel_post",
            elementKind: "relationship",
            label: "root -> post",
          },
        },
      ],
    }),
    [
      {
        id: "r1",
        category: "功能需求",
        text: "用户可以管理博客文章。",
        relatedDiagrams: ["function"],
      },
      {
        id: "r2",
        category: "非功能需求",
        text: "系统响应时间小于 2 秒。",
        relatedDiagrams: ["deployment"],
      },
    ],
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "function");
  if (model?.diagramKind !== "function") return;
  assert.deepEqual(model.notes, []);
  assert.deepEqual(model.nodes.map((node) => node.id), ["root", "post"]);
  assert.deepEqual(
    model.relationships.map((relationship) => [relationship.id, relationship.type]),
    [["rel_post", "decomposition"]],
  );
});

test("parseRequirementDiagramModelsOnly keeps sourced function nodes without rule context", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "function",
          title: "功能结构图",
          summary: "功能分解",
          notes: ["旧备注"],
          nodes: [
            { id: "root", name: "系统", sourceRequirementIds: ["r1"] },
            { id: "child", name: "核心功能", sourceRequirementIds: ["r1"] },
          ],
          relationships: [
            {
              id: "rel_child",
              type: "decomposition",
              source: "root",
              target: "child",
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "function");
  if (model?.diagramKind !== "function") return;
  assert.deepEqual(model.nodes.map((node) => node.id), ["root", "child"]);
  assert.deepEqual(model.notes, []);
});

test("parseRequirementDiagramModelsOnly preserves localized class metadata", () => {
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
              chineseName: "预约",
              englishName: "Reservation",
              type: "领域实体",
              classKind: "entity",
              constraints: ["同一时段不可重复预约"],
              attributes: [
                {
                  name: "startTime",
                  chineseName: "开始时间",
                  englishName: "startTime",
                  type: "DateTime",
                  visibility: "private",
                  constraints: ["必填"],
                },
              ],
              operations: [],
            },
          ],
          interfaces: [
            {
              id: "auditable",
              name: "Auditable",
              chineseName: "可审计对象",
              englishName: "Auditable",
              type: "interface",
              constraints: ["记录更新时间"],
              operations: [],
            },
          ],
          enums: [],
          relationships: [],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "class");
  if (model?.diagramKind !== "class") return;
  assert.equal(model.classes[0]?.chineseName, "预约");
  assert.equal(model.classes[0]?.englishName, "Reservation");
  assert.equal(model.classes[0]?.type, "领域实体");
  assert.deepEqual(model.classes[0]?.constraints, ["同一时段不可重复预约"]);
  assert.equal(model.classes[0]?.attributes[0]?.chineseName, "开始时间");
  assert.equal(model.classes[0]?.attributes[0]?.englishName, "startTime");
  assert.deepEqual(model.classes[0]?.attributes[0]?.constraints, ["必填"]);
  assert.equal(model.interfaces[0]?.chineseName, "可审计对象");
  assert.equal(model.interfaces[0]?.englishName, "Auditable");
  assert.equal(model.interfaces[0]?.type, "interface");
  assert.deepEqual(model.interfaces[0]?.constraints, ["记录更新时间"]);
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

test("parseRequirementDiagramModelsOnly drops blank optional sequence fields", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "analysis",
          modelId: "analysis:uc_register",
          sourceUseCaseId: "uc_register",
          sourceUseCaseName: "注册活动",
          title: "注册活动需求分析模型",
          summary: "根据用例事件流生成。",
          notes: [],
          participants: [
            {
              id: "visitor",
              name: "未注册用户",
              participantType: "actor",
              description: "",
            },
            {
              id: "page",
              name: "注册页面",
              participantType: "boundary",
            },
          ],
          messages: [
            {
              id: "m_submit",
              type: "sync",
              sourceId: "visitor",
              targetId: "page",
              name: "提交注册申请",
              parameters: [],
              returnValue: "",
              condition: "",
              description: "",
            },
          ],
          fragments: [
            {
              id: "alt_result",
              type: "alt",
              label: "注册结果",
              messageIds: ["m_submit"],
              condition: "",
              description: "",
              branches: [
                {
                  label: "成功",
                  condition: "",
                  messageIds: ["m_submit"],
                },
              ],
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "analysis");
  if (model?.diagramKind !== "analysis") return;
  assert.equal("description" in model.participants[0]!, false);
  assert.equal("returnValue" in model.messages[0]!, false);
  assert.equal("condition" in model.messages[0]!, false);
  assert.equal("description" in model.messages[0]!, false);
  assert.equal("condition" in model.fragments[0]!, false);
  assert.equal("description" in model.fragments[0]!, false);
  assert.equal("condition" in model.fragments[0]!.branches![0]!, false);
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

test("parseRequirementDiagramModelsOnly repairs activity start end and flow continuity", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "activity",
          title: "总体业务流程",
          summary: "提交和结束流程",
          notes: [],
          swimlanes: [],
          nodes: [
            { id: "submit", type: "activity", name: "提交申请", input: [], output: [] },
            { id: "finish", type: "activity", name: "流程结束", input: [], output: [] },
          ],
          relationships: [],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "activity");
  if (model?.diagramKind !== "activity") return;
  const start = model.nodes.find((node) => node.type === "start");
  const end = model.nodes.find((node) => node.type === "end");
  assert.ok(start);
  assert.equal(end?.id, "finish");
  assert.equal(model.nodes.filter((node) => node.type === "end").length, 1);
  assert.ok(
    model.relationships.some(
      (relationship) =>
        relationship.sourceId === start.id && relationship.targetId === "submit",
    ),
  );
  assert.ok(
    model.relationships.some(
      (relationship) =>
        relationship.sourceId === "submit" && relationship.targetId === "finish",
    ),
  );
});

test("parseRequirementDiagramModelsOnly removes invalid deployment artifact links", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "deployment",
          title: "部署需求模型",
          summary: "部署关系",
          notes: [],
          nodes: [{ id: "server", name: "应用服务器", nodeType: "server" }],
          databases: [],
          components: [],
          externalSystems: [],
          artifacts: [
            { id: "web_bundle", name: "前端制品" },
            { id: "script_bundle", name: "脚本制品" },
          ],
          relationships: [
            {
              id: "deploy_web",
              type: "deployment",
              sourceId: "web_bundle",
              targetId: "server",
            },
            {
              id: "invalid_artifact_line",
              type: "communication",
              sourceId: "web_bundle",
              targetId: "script_bundle",
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "deployment");
  if (model?.diagramKind !== "deployment") return;
  assert.deepEqual(
    model.relationships.map((relationship) => relationship.id),
    ["deploy_web"],
  );
});

test("parseRequirementDiagramModelsOnly adds prototype entry and folds placeholder path nodes", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "prototype",
          title: "原型界面关系",
          summary: "界面跳转",
          notes: [],
          nodes: [
            { id: "home", name: "首页", nodeType: "screen" },
            { id: "placeholder", name: "详情后续路径", nodeType: "module" },
            { id: "detail", name: "活动详情页", nodeType: "screen" },
          ],
          relationships: [
            {
              id: "open_placeholder",
              type: "navigation",
              sourceId: "home",
              targetId: "placeholder",
            },
            {
              id: "open_detail",
              type: "navigation",
              sourceId: "placeholder",
              targetId: "detail",
              label: "查看详情",
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "prototype");
  if (model?.diagramKind !== "prototype") return;
  assert.ok(model.nodes.some((node) => node.nodeType === "entry-point"));
  assert.equal(model.nodes.some((node) => node.id === "placeholder"), false);
  assert.ok(
    model.relationships.some(
      (relationship) =>
        relationship.sourceId === "home" &&
        relationship.targetId === "detail" &&
        relationship.label === "查看详情",
    ),
  );
});
