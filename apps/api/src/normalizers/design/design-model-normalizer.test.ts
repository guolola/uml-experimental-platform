// Covers repair-friendly normalization for malformed design model JSON.
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDesignDiagramModelsOnly,
  parseDesignTraceabilityCoverageResult,
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

  assert.equal(parsed.models[0]?.title, "新增图书顺序图");
  assert.equal(parsed.models[0]?.summary, "新增图书顺序图的对象交互流程。");
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
