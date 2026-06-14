// Verifies document fallback sections preserve review cues for low-confidence traceability.
import assert from "node:assert/strict";
import test from "node:test";
import { startDocumentRunRequestSchema } from "@uml-platform/contracts";
import {
  buildDocumentContext,
  diagramPlantUmlForDocument,
  diagramSvgKindsForDocument,
  fallbackDocumentSections,
} from "./document-context.js";

test("software design documents list pending auto-filled traceability for review", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "图书馆系统需要支持借书、还书。",
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          modelId: "class:design",
          elementKind: "class",
          elementId: "BookService",
          label: "BookService",
        },
        targets: [
          {
            diagramKind: "usecase",
            modelId: "usecase:requirements",
            elementKind: "useCase",
            elementId: "UC-Borrow",
            label: "借书",
          },
        ],
        mappingSource: "auto-filled-pending-review",
        reviewStatus: "pending",
        confidence: "low",
        rationale: "缺失映射由系统自动补齐",
      },
    ],
  });

  const sections = fallbackDocumentSections(input);
  const reviewSection = sections.find((section) =>
    section.title.includes("需复核追踪关系"),
  );

  assert.ok(reviewSection);
  assert.deepEqual(reviewSection.table?.headers, [
    "编号",
    "设计模型",
    "设计元素",
    "关联需求元素",
    "备注",
  ]);
  assert.equal(reviewSection.table?.rows[0]?.[2], "BookService");
});

test("requirements documents use generated use case event flows", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "社团活动管理系统需要支持活动报名。",
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "活动报名",
        notes: [],
        actors: [
          {
            id: "member",
            name: "社团成员",
            actorType: "human",
            responsibilities: [],
          },
        ],
        useCases: [
          {
            id: "uc_apply",
            name: "报名活动",
            goal: "完成活动报名",
            primaryActorId: "member",
            preconditions: ["用户已登录"],
            postconditions: ["报名记录已保存"],
            supportingActorIds: [],
            eventFlows: [
              {
                id: "main_apply",
                name: "正常报名",
                flowType: "main",
                trigger: "点击报名",
                steps: [
                  {
                    order: 1,
                    actor: "actor",
                    actorAction: "选择活动",
                    systemAction: "展示活动详情",
                    expectedResult: "进入报名确认页",
                  },
                ],
              },
              {
                id: "full_apply",
                name: "名额已满",
                flowType: "exception",
                condition: "活动名额已满",
                steps: [
                  {
                    order: 1,
                    actor: "system",
                    systemAction: "提示名额已满",
                    expectedResult: "报名不被创建",
                  },
                ],
              },
            ],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      },
    ],
    useAiText: false,
  });

  const sections = fallbackDocumentSections(input);
  const useCaseSection = sections.find((section) =>
    section.title.includes("报名活动"),
  );
  const body = useCaseSection?.body.join("\n") ?? "";

  assert.match(body, /主事件流：正常报名（?[^）]*触发：点击报名/u);
  assert.match(body, /步骤 1：参与者：选择活动；系统：展示活动详情；结果：进入报名确认页/u);
  assert.match(body, /异常事件流：名额已满（条件：活动名额已满）/u);
  assert.match(body, /系统：提示名额已满；结果：报名不被创建/u);
});

test("software design documents keep per-use-case sequence diagram references", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "社团活动管理系统需要支持活动报名和活动取消。",
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "活动管理",
        notes: [],
        actors: [],
        useCases: [
          {
            id: "uc_apply",
            name: "报名活动",
            goal: "完成活动报名",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
          {
            id: "uc_cancel",
            name: "取消报名",
            goal: "撤销报名记录",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      },
    ],
    designPlantUml: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_apply",
        source: "@startuml\nparticipant A\n@enduml",
      },
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_cancel",
        source: "@startuml\nparticipant B\n@enduml",
      },
    ],
    designSvgArtifacts: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_apply",
        svg: "<svg />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: "2026-06-14T00:00:00.000Z",
          sourceLength: 28,
          durationMs: 1,
        },
      },
    ],
    useAiText: false,
  });

  const sequenceSections = fallbackDocumentSections(input).filter(
    (section) => section.diagramKind === "sequence",
  );
  assert.deepEqual(
    sequenceSections.map((section) => section.diagramModelId),
    ["sequence:uc_apply", "sequence:uc_cancel"],
  );

  const context = buildDocumentContext(input);
  assert.deepEqual(
    context.canonicalSections
      .filter((section) => section.diagramKind === "sequence")
      .map((section) => section.diagramModelId),
    ["sequence:uc_apply", "sequence:uc_cancel"],
  );
  assert.equal(
    diagramPlantUmlForDocument(input).get("sequence:uc_cancel"),
    "@startuml\nparticipant B\n@enduml",
  );
  assert.equal(diagramSvgKindsForDocument(input).has("sequence:uc_apply"), true);
});
