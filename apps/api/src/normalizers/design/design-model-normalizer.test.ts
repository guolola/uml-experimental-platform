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
