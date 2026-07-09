// Verifies document fallback sections use deliverable trace sources.
import assert from "node:assert/strict";
import test from "node:test";
import {
  startDocumentRunRequestSchema,
  type DocumentSection,
} from "@uml-platform/contracts";
import {
  buildDocumentContext,
  diagramPlantUmlForDocument,
  diagramSvgKindsForDocument,
  expectedDocumentDiagramKinds,
  fallbackDocumentSections,
  findForbiddenDocumentPhrases,
} from "./document-context.js";

const INTERACTIVE_TRACE_REVIEW_PATTERN =
  /未找到明确(?:上游)?来源|请在跟踪矩阵|候选映射|需复核|自动补齐|相似度建立映射|低置信追踪关系复核|采纳|忽略|确认是否采纳/u;

function sectionTextValuesForTest(section: DocumentSection) {
  return [
    section.title,
    ...section.body,
    ...(section.table?.headers ?? []),
    ...(section.table?.rows.flat() ?? []),
  ];
}

test("software design documents omit pending traceability review appendix", () => {
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

  assert.equal(
    sections.some((section) => section.title.includes("低置信追踪关系复核")),
    false,
  );
  assert.equal(
    sections.flatMap((section) => sectionTextValuesForTest(section)).some((cell) =>
      INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("requirements documents use requirement rules as trace sources", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "简单图书馆管理系统需要支持借书、还书和图书检索。",
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "系统应支持借书。",
        relatedDiagrams: ["class"],
      },
      {
        id: "r2",
        category: "功能需求",
        text: "系统应支持图书检索。",
        relatedDiagrams: ["class"],
      },
    ],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementKind: "class",
          elementId: "Book",
          label: "Book",
        },
        mappingSource: "auto-filled-pending-review",
        reviewStatus: "pending",
        confidence: "low",
        rationale:
          "未找到明确来源，系统仅按相关图类型临时补齐；请在跟踪矩阵中采纳、忽略或稍后处理。",
      },
      {
        ruleId: "r2",
        target: {
          diagramKind: "class",
          elementKind: "class",
          elementId: "BookSearch",
          label: "图书检索",
        },
        mappingSource: "llm",
        reviewStatus: "confirmed",
        confidence: "medium",
        rationale:
          "系统按需求规则文本和模型元素名称的相似度补齐；请在跟踪矩阵中确认是否采纳。",
      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.title === "跟踪矩阵" && section.body.join("").includes("领域概念模型"),
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.headers, [
    "编号",
    "需求规则",
    "模型元素",
    "追踪依据",
  ]);
  assert.equal(traceSection.table?.rows[0]?.[1], "R1");
  assert.equal(
    traceSection.table?.rows[0]?.[3],
    "需求规则：R1（功能需求）系统应支持借书。",
  );
  assert.equal(
    traceSection.table?.rows[1]?.[3],
    "需求规则：R2（功能需求）系统应支持图书检索。",
  );
  assert.equal(
    traceSection.table?.rows.flat().some((cell) =>
      INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("software design class matrix shows direct upstream instead of requirement rules", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "简单图书馆管理系统需要支持借书。",
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          modelId: "class:design",
          elementKind: "class",
          elementId: "BorrowingService",
          label: "BorrowingService",
        },
        upstreamDesignRefs: [
          {
            diagramKind: "sequence",
            modelId: "sequence:borrow",
            elementKind: "participant",
            elementId: "BorrowingService",
            label: "借书实现",
          },
        ],
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
        rationale:
          "未找到明确上游来源，系统仅按最接近的需求元素临时补齐；请在跟踪矩阵中采纳、忽略或稍后处理。",
      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.title === "设计类跟踪矩阵",
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.headers, [
    "编号",
    "设计元素",
    "追踪依据",
    "映射需求元素",
  ]);
  assert.deepEqual(traceSection.table?.rows[0], [
    "1",
    "BorrowingService",
    "用例实现设计：借书实现",
    "用例图：借书",
  ]);
  assert.equal(
    traceSection.table?.rows.flat().some((cell) =>
      /^r\d+$/iu.test(cell) || INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("software design class matrix falls back to requirement elements as trace sources", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "简单图书馆管理系统需要支持借书。",
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          modelId: "class:design",
          elementKind: "class",
          elementId: "BorrowingService",
          label: "BorrowingService",
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
        rationale:
          "未找到明确上游来源，系统仅按最接近的需求元素临时补齐；请在跟踪矩阵中采纳、忽略或稍后处理。",
      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.title === "设计类跟踪矩阵",
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.rows[0], [
    "1",
    "BorrowingService",
    "用例图：借书",
    "用例图：借书",
  ]);
  assert.equal(
    traceSection.table?.rows.flat().some((cell) =>
      INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("software design interface matrix uses use cases as trace sources", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "简单图书馆管理系统需要支持借书。",
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "借书",
        notes: [],
        systemBoundaries: [],
        actors: [
          {
            id: "reader",
            name: "读者",
            actorType: "human",
            responsibilities: [],
          },
        ],
        useCases: [
          {
            id: "UC-Borrow",
            name: "借书",
            goal: "完成图书借阅",
            primaryActorId: "reader",
            supportingActorIds: [],
            preconditions: [],
            postconditions: [],
            eventFlows: [],
          },
        ],
        relationships: [],
      },
      {
        diagramKind: "prototype",
        title: "界面需求",
        summary: "借书界面",
        notes: [],
        nodes: [
          {
            id: "screen-borrow",
            name: "借书页面",
            nodeType: "screen",
            sourceUseCaseIds: ["UC-Borrow"],
            sourceRequirementIds: [],
          },
        ],
        relationships: [],
      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.table?.headers.join("|") === "编号|用例名称|界面名称|追踪依据",
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.rows[0], [
    "1",
    "借书",
    "借书页面",
    "用例：借书",
  ]);
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

test("document contexts include new diagram kinds in expected order", () => {
  assert.deepEqual(expectedDocumentDiagramKinds("requirementsSpec"), [
    "function",
    "activity",
    "usecase",
    "class",
    "deployment",
    "prototype",
    "analysis",
  ]);
  assert.deepEqual(expectedDocumentDiagramKinds("softwareDesignSpec"), [
    "architecture",
    "sequence",
    "class",
    "activity",
    "table",
    "component",
    "deployment",
  ]);

  const requirementSections = fallbackDocumentSections(
    startDocumentRunRequestSchema.parse({
      documentKind: "requirementsSpec",
      requirementText: "订单系统需要支持创建订单。",
      useAiText: false,
    }),
  );
  assert.deepEqual(
    requirementSections
      .map((section) => section.diagramKind)
      .filter(Boolean),
    ["function", "activity", "usecase", "class", "deployment", "prototype", "analysis"],
  );

  const designSections = fallbackDocumentSections(
    startDocumentRunRequestSchema.parse({
      documentKind: "softwareDesignSpec",
      requirementText: "订单系统需要支持创建订单。",
      useAiText: false,
    }),
  );
  assert.deepEqual(
    designSections
      .filter((section) => section.diagramKind)
      .map((section) => section.diagramModelId ?? section.diagramKind),
    [
      "requirement:activity",
      "architecture",
      "sequence:UC-1",
      "class",
      "activity",
      "table",
      "component",
      "deployment",
    ],
  );
});

test("fallback documents use logical headings and avoid placeholder prose", () => {
  const sections = fallbackDocumentSections(
    startDocumentRunRequestSchema.parse({
      documentKind: "requirementsSpec",
      requirementText: "订单系统需要支持创建订单。",
      useAiText: false,
    }),
  );

  assert.equal(sections[0]?.title, "项目引言");
  assert.ok(sections.every((section) => !/^\d/u.test(section.title)));
  assert.deepEqual(findForbiddenDocumentPhrases(sections), []);
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
    requirementPlantUml: [
      {
        diagramKind: "activity",
        source: "@startuml\n:需求流程;\n@enduml",
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
  assert.equal(
    diagramPlantUmlForDocument(input).get("requirement:activity"),
    "@startuml\n:需求流程;\n@enduml",
  );
  assert.equal(diagramSvgKindsForDocument(input).has("sequence:uc_apply"), true);
});
