// Covers repair-friendly normalization for malformed design model JSON.
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDesignDiagramModelsOnly,
  parseDesignTraceabilityCoverageResult,
  parseDesignTraceabilityCoverageForSources,
} from "./design-model-normalizer.js";

test("parseDesignDiagramModelsOnly fills sequence title from source use case", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_add_book",
          sourceUseCaseId: "uc_add_book",
          sourceUseCaseName: "新增图书",
          notes: [],
          participants: [
            {
              id: "librarian",
              name: "图书管理员",
              participantType: "actor",
            },
            {
              id: "librarySystem",
              name: "图书馆系统",
              participantType: "control",
            },
          ],
          messages: [
            {
              id: "m1",
              type: "sync",
              sourceId: "librarian",
              targetId: "librarySystem",
              name: "新增图书",
              parameters: [],
            },
          ],
          fragments: [],
        },
      ],
      designModelTraceability: [],
    }),
  );

  assert.equal(parsed.models[0]?.title, "新增图书用例实现设计");
  assert.equal(parsed.models[0]?.summary, "新增图书用例实现设计的对象交互流程。");
});

test("parseDesignDiagramModelsOnly normalizes sequence fragment branches", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_reserve",
          sourceUseCaseId: "uc_reserve",
          sourceUseCaseName: "预约座位",
          title: "预约座位顺序图",
          summary: "预约座位的对象交互流程。",
          notes: [],
          participants: [
            { id: "user", name: "用户", participantType: "actor" },
            { id: "svc", name: "预约服务", participantType: "service" },
          ],
          messages: [
            {
              id: "m1",
              type: "sync",
              sourceId: "user",
              targetId: "svc",
              name: "reserve",
              parameters: [],
            },
            {
              id: "m2",
              type: "return",
              sourceId: "svc",
              targetId: "user",
              name: "reject",
              parameters: [],
            },
          ],
          fragments: [
            {
              id: "alt1",
              type: "alt",
              label: "预约结果",
              messageIds: [],
              branches: [
                { label: "成功", messageIds: ["m1"] },
                { label: "失败", messageIds: ["m2"] },
              ],
            },
          ],
        },
      ],
    }),
  );

  const fragment = parsed.models[0]?.diagramKind === "sequence"
    ? parsed.models[0].fragments[0]
    : null;
  assert.deepEqual(fragment?.messageIds, ["m1", "m2"]);
  assert.equal(fragment?.branches?.length, 2);
});

test("parseDesignDiagramModelsOnly sanitizes malformed sequence fragments", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_publish",
          sourceUseCaseId: "uc_publish",
          sourceUseCaseName: "发布文章",
          title: "发布文章用例实现设计",
          summary: "发布文章的对象交互流程。",
          notes: [],
          participants: [
            { id: "user", name: "作者", participantType: "actor" },
            { id: "svc", name: "文章服务", participantType: "service" },
          ],
          messages: [
            {
              id: "m1",
              type: "sync",
              sourceId: "user",
              targetId: "svc",
              name: "submitPost",
              parameters: [],
            },
            {
              id: "m2",
              type: "return",
              sourceId: "svc",
              targetId: "user",
              name: "returnResult",
              parameters: [],
            },
          ],
          fragments: [
            {
              id: "alt1",
              type: "alt",
              label: "发布结果",
              messageIds: [],
              branches: [
                { label: "空分支", messageIds: [] },
                { label: "成功", messageIds: ["m1"] },
              ],
            },
            {
              id: "alt1",
              type: "opt",
              label: "返回提示",
              messageIds: ["m2", "missing"],
            },
            {
              id: "loop_all",
              type: "loop",
              label: "循环全部流程",
              messageIds: ["m1", "m2"],
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "sequence");
  if (model?.diagramKind !== "sequence") return;
  assert.deepEqual(
    model.fragments.map((fragment) => [fragment.id, fragment.type, fragment.messageIds]),
    [
      ["alt1", "opt", ["m1"]],
      ["alt1-2", "opt", ["m2"]],
    ],
  );
  assert.equal(model.fragments[0]?.branches?.length, 1);
});

test("parseDesignDiagramModelsOnly drops blank optional sequence fields", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_register",
          sourceUseCaseId: "uc_register",
          sourceUseCaseName: "注册活动",
          title: "注册活动用例实现设计",
          summary: "对象交互流程。",
          notes: [],
          participants: [
            {
              id: "visitor",
              name: "未注册用户",
              participantType: "actor",
              description: "",
            },
            {
              id: "controller",
              name: "注册控制器",
              participantType: "control",
            },
          ],
          messages: [
            {
              id: "m_submit",
              type: "sync",
              sourceId: "visitor",
              targetId: "controller",
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
  assert.equal(model?.diagramKind, "sequence");
  if (model?.diagramKind !== "sequence") return;
  assert.equal("description" in model.participants[0]!, false);
  assert.equal("returnValue" in model.messages[0]!, false);
  assert.equal("condition" in model.messages[0]!, false);
  assert.equal("description" in model.messages[0]!, false);
  assert.equal("condition" in model.fragments[0]!, false);
  assert.equal("description" in model.fragments[0]!, false);
  assert.equal("condition" in model.fragments[0]!.branches![0]!, false);
});

test("parseDesignDiagramModelsOnly softly dedupes repeated activity nodes", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "activity",
          modelId: "activity",
          title: "业务流程图",
          summary: "业务流转",
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

test("parseDesignDiagramModelsOnly fills missing activity node input and output arrays", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "activity",
          modelId: "activity",
          title: "界面关系图",
          summary: "界面跳转关系",
          notes: [],
          swimlanes: [{ id: "user", name: "用户" }],
          nodes: [
            { id: "start", type: "start", name: "开始" },
            {
              id: "open-orders",
              type: "activity",
              name: "打开订单列表页",
              actorOrLane: "user",
            },
            { id: "end", type: "end", name: "结束" },
          ],
          relationships: [
            {
              id: "flow-1",
              type: "control_flow",
              sourceId: "start",
              targetId: "open-orders",
            },
            {
              id: "flow-2",
              type: "control_flow",
              sourceId: "open-orders",
              targetId: "end",
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "activity");
  if (model?.diagramKind !== "activity") return;
  const action = model.nodes.find((node) => node.id === "open-orders");
  assert.deepEqual(action?.type === "activity" ? action.input : null, []);
  assert.deepEqual(action?.type === "activity" ? action.output : null, []);
});

test("parseDesignDiagramModelsOnly preserves long graph labels in descriptions", () => {
  const longMessage = "提交预约请求并校验库存、时段、超期状态和审计信息";
  const longTableLabel = "设备与预约记录之间的一对多历史追踪关系，覆盖预约、取消、借出与归还";
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:reserve",
          sourceUseCaseId: "reserve",
          sourceUseCaseName: "预约设备",
          title: "预约设备用例实现设计",
          summary: "预约设备流程",
          notes: [],
          participants: [
            { id: "student", name: "学生", participantType: "actor" },
            { id: "service", name: "预约服务", participantType: "service" },
          ],
          messages: [
            {
              id: "m1",
              type: "sync",
              sourceId: "student",
              targetId: "service",
              name: longMessage,
              parameters: [],
            },
          ],
          fragments: [
            {
              id: "alt1",
              type: "alt",
              label: "库存可用且时段未被占用并且学生无超期设备",
              messageIds: ["m1"],
            },
          ],
        },
        {
          diagramKind: "table",
          modelId: "table",
          title: "数据库设计",
          summary: "预约表",
          notes: [],
          tables: [
            {
              id: "device",
              name: "device",
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
            {
              id: "reservation",
              name: "reservation",
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
          relationships: [
            {
              id: "rel_table",
              type: "one-to-many",
              sourceTableId: "device",
              targetTableId: "reservation",
              label: longTableLabel,
            },
          ],
        },
      ],
    }),
  );

  const sequence = parsed.models.find((model) => model.diagramKind === "sequence");
  assert.equal(sequence?.diagramKind, "sequence");
  if (sequence?.diagramKind === "sequence") {
    assert.notEqual(sequence.messages[0]?.name, longMessage);
    assert.match(sequence.messages[0]?.description ?? "", /审计信息/);
    assert.match(sequence.fragments[0]?.description ?? "", /无超期设备/);
  }

  const table = parsed.models.find((model) => model.diagramKind === "table");
  assert.equal(table?.diagramKind, "table");
  if (table?.diagramKind === "table") {
    assert.notEqual(table.relationships[0]?.label, longTableLabel);
    assert.match(table.relationships[0]?.description ?? "", /借出与归还/);
  }
});

test("parseDesignDiagramModelsOnly keeps classKind compatible with the contract", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "class",
          modelId: "class",
          title: "领域类图",
          summary: "领域对象",
          notes: [],
          classes: [
            {
              id: "base",
              name: "BasePolicy",
              classKind: "abstract class",
              attributes: [],
              operations: [],
            },
            {
              id: "reservation",
              name: "Reservation",
              classKind: "domain entity",
              attributes: [],
              operations: [],
            },
          ],
          interfaces: [],
          enums: [],
          relationships: [],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "class");
  if (model?.diagramKind !== "class") return;
  assert.equal(model.classes[0]?.classKind, undefined);
  assert.equal(model.classes[1]?.classKind, "entity");
});

test("parseDesignDiagramModelsOnly preserves localized class metadata", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "class",
          modelId: "class:design",
          title: "设计类图",
          summary: "设计对象",
          notes: [],
          classes: [
            {
              id: "reservation",
              name: "Reservation",
              chineseName: "预约记录",
              englishName: "Reservation",
              type: "设计实体",
              classKind: "domain entity",
              constraints: ["按用户隔离"],
              attributes: [
                {
                  name: "status",
                  chineseName: "状态",
                  englishName: "status",
                  type: "ReservationStatus",
                  visibility: "private",
                  constraints: ["不可为空"],
                },
              ],
              operations: [],
            },
          ],
          interfaces: [
            {
              id: "repository",
              name: "ReservationRepository",
              chineseName: "预约仓储",
              englishName: "ReservationRepository",
              type: "interface",
              constraints: ["持久化边界"],
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
  assert.equal(model.classes[0]?.chineseName, "预约记录");
  assert.equal(model.classes[0]?.englishName, "Reservation");
  assert.equal(model.classes[0]?.type, "设计实体");
  assert.equal(model.classes[0]?.classKind, "entity");
  assert.deepEqual(model.classes[0]?.constraints, ["按用户隔离"]);
  assert.equal(model.classes[0]?.attributes[0]?.chineseName, "状态");
  assert.equal(model.classes[0]?.attributes[0]?.englishName, "status");
  assert.deepEqual(model.classes[0]?.attributes[0]?.constraints, ["不可为空"]);
  assert.equal(model.interfaces[0]?.chineseName, "预约仓储");
  assert.equal(model.interfaces[0]?.englishName, "ReservationRepository");
  assert.equal(model.interfaces[0]?.type, "interface");
  assert.deepEqual(model.interfaces[0]?.constraints, ["持久化边界"]);
});

test("parseDesignTraceabilityCoverageResult ignores nullable optional refs", () => {
  const designModels = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_add_book",
          sourceUseCaseId: "uc_add_book",
          sourceUseCaseName: "新增图书",
          title: "新增图书顺序图",
          summary: "新增图书顺序图的对象交互流程。",
          notes: [],
          participants: [
            {
              id: "librarian",
              name: "图书管理员",
              participantType: "actor",
            },
          ],
          messages: [],
          fragments: [],
        },
      ],
    }),
  ).models;
  const requirementModels = [
    {
      diagramKind: "usecase" as const,
      title: "图书馆用例",
      summary: "图书馆管理",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc_add_book",
          name: "新增图书",
          goal: "新增一本书",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    },
  ];

  const coverage = parseDesignTraceabilityCoverageResult(
    JSON.stringify({
      designModelTraceability: [
        {
          source: {
            modelId: null,
            diagramKind: "sequence",
            elementId: "librarian",
            elementKind: "participant",
            label: "图书管理员",
          },
          targets: [
            {
              modelId: null,
              diagramKind: "usecase",
              elementId: "uc_add_book",
              elementKind: "usecase",
              label: "新增图书",
            },
          ],
          upstreamDesignRefs: null,
        },
      ],
    }),
    designModels,
    requirementModels,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.traceability[0]?.source.elementId, "librarian");
});

test("parseDesignTraceabilityCoverageResult keeps valid entries when nearby trace refs are malformed", () => {
  const designModels = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_add_book",
          sourceUseCaseId: "uc_add_book",
          sourceUseCaseName: "新增图书",
          title: "新增图书顺序图",
          summary: "新增图书顺序图的对象交互流程。",
          notes: [],
          participants: [
            {
              id: "librarian",
              name: "图书管理员",
              participantType: "actor",
            },
          ],
          messages: [],
          fragments: [],
        },
      ],
    }),
  ).models;
  const requirementModels = [
    {
      diagramKind: "usecase" as const,
      title: "图书馆用例",
      summary: "图书馆管理",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc_add_book",
          name: "新增图书",
          goal: "新增一本书",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    },
  ];

  const coverage = parseDesignTraceabilityCoverageResult(
    JSON.stringify({
      designModelTraceability: [
        {
          source: {
            modelId: null,
            diagram: "sequence-diagram",
            refId: "librarian",
            elementKind: null,
            label: null,
          },
          targets: [
            {
              modelId: null,
              diagramType: "use-case-diagram",
              targetId: "uc_add_book",
              elementKind: null,
              label: null,
            },
          ],
          upstreamDesignRefs: null,
        },
        {
          source: {
            diagramKind: "requirements",
            elementId: "missing-source",
          },
          targets: [],
        },
      ],
    }),
    designModels,
    requirementModels,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.traceability[0]?.source.diagramKind, "sequence");
  assert.equal(coverage.traceability[0]?.source.elementId, "librarian");
  assert.equal(coverage.traceability[0]?.targets[0]?.diagramKind, "usecase");
  assert.equal(coverage.traceability[0]?.targets[0]?.elementId, "uc_add_book");
  assert.equal(coverage.missingSources.length, 0);
});

test("parseDesignTraceabilityCoverageForSources accepts a single-object traceability payload", () => {
  const requiredSources = [
    {
      modelId: "sequence:uc_add_book",
      diagramKind: "sequence" as const,
      elementId: "librarian",
      elementKind: "participant",
      label: "图书管理员",
    },
  ];
  const requirementModels = [
    {
      diagramKind: "usecase" as const,
      title: "图书馆用例",
      summary: "图书馆管理",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc_add_book",
          name: "新增图书",
          goal: "新增一本书",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    },
  ];

  const coverage = parseDesignTraceabilityCoverageForSources(
    JSON.stringify({
      designModelTraceability: {
        source: {
          modelID: "sequence:uc_add_book",
          diagram: "sequence-diagram",
          refId: "librarian",
        },
        targets: [
          {
            diagram: "use-case-diagram",
            refId: "uc_add_book",
          },
        ],
      },
    }),
    requiredSources,
    requirementModels,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.missingSources.length, 0);
});

test("parseDesignDiagramModelsOnly filters deployment relationships with illegal endpoints", () => {
  const parsed = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "deployment",
          modelId: "deployment",
          title: "部署设计",
          summary: "组件部署关系",
          notes: [],
          nodes: [{ id: "app_server", name: "应用服务器", nodeType: "server" }],
          databases: [{ id: "db", name: "业务数据库" }],
          components: [{ id: "api", name: "后端服务" }],
          externalSystems: [],
          artifacts: [{ id: "jar", name: "服务制品" }],
          relationships: [
            {
              id: "deploy_jar",
              type: "deployment",
              sourceId: "jar",
              targetId: "app_server",
            },
            {
              id: "invalid_hosting",
              type: "hosting",
              sourceId: "jar",
              targetId: "api",
            },
            {
              id: "invalid_artifact_comm",
              type: "communication",
              sourceId: "jar",
              targetId: "db",
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
    ["deploy_jar"],
  );
});
