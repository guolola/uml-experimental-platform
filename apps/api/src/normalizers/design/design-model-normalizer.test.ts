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
