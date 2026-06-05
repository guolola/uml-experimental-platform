// Verifies model-level generation keeps failures and retries scoped to the affected diagram.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiagramKind,
  DiagramModelSpec,
  ProviderSettings,
  RequirementRule,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { createEmptySnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { runStagePipeline } from "./requirements-pipeline.js";

const LIBRARY_REQUIREMENT_TEXT = `一个小型图书馆管理系统，需完成以下工作：
(1)借书、还书；
(2)图书馆中增加/删除一本书；
(3)照作者名或专业领域检索一批书；
(4)找出被某位读者借出的一批书；
(5)找出最近借走某本图书的读者。
该系统有两类用户：图书管理员与普通读者。
功能(4)可供普通读者查找他们自己借出的书目。
功能(1)、(2)、(5)只供图书管理员使用。
该系统必须满足以下限制：
(1)馆中所有未借出的书籍能够供读者随时借阅。
(2)在同一时刻，一本书不能既被借出，又可供借阅。
(3)一个读者一次借出的书籍数目不能超过预定值。`;

const providerSettings: ProviderSettings = {
  apiBaseUrl: "https://llm.test",
  apiKey: "test-key",
  model: "test-model",
};

const libraryRules: RequirementRule[] = [
  {
    id: "r1",
    category: "功能需求",
    text: "图书管理员可以办理借书和还书。",
    relatedDiagrams: ["usecase", "activity"],
  },
  {
    id: "r2",
    category: "数据需求",
    text: "系统需要记录图书、读者和借阅记录。",
    relatedDiagrams: ["class"],
  },
  {
    id: "r3",
    category: "部署需求",
    text: "系统需要部署为可访问的图书馆管理服务。",
    relatedDiagrams: ["deployment"],
  },
];

function modelForKind(kind: DiagramKind): DiagramModelSpec {
  if (kind === "usecase") {
    return {
      diagramKind: "usecase",
      title: "图书馆用例模型",
      summary: "管理员与读者的核心用例。",
      notes: [],
      actors: [
        {
          id: "actor_librarian",
          name: "图书管理员",
          actorType: "human",
          responsibilities: ["借书", "还书", "维护图书"],
        },
      ],
      useCases: [
        {
          id: "uc_borrow",
          name: "借书",
          goal: "登记图书借阅",
          preconditions: ["图书未借出"],
          postconditions: ["图书被借出"],
          primaryActorId: "actor_librarian",
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "boundary_library", name: "图书馆管理系统" }],
      relationships: [
        {
          id: "rel_librarian_borrow",
          type: "association",
          sourceId: "actor_librarian",
          targetId: "uc_borrow",
        },
      ],
    };
  }

  if (kind === "class") {
    return {
      diagramKind: "class",
      title: "图书馆领域概念模型",
      summary: "图书、读者和借阅记录。",
      notes: [],
      classes: [
        {
          id: "class_book",
          name: "图书",
          classKind: "entity",
          attributes: [
            { name: "id", type: "string", visibility: "private" },
            { name: "available", type: "boolean", visibility: "private" },
          ],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
  }

  if (kind === "activity") {
    return {
      diagramKind: "activity",
      title: "图书馆界面关系",
      summary: "借书和还书流程。",
      notes: [],
      swimlanes: [{ id: "lane_librarian", name: "图书管理员" }],
      nodes: [
        { id: "start", type: "start", name: "开始" },
        {
          id: "act_borrow",
          type: "activity",
          name: "办理借书",
          actorOrLane: "lane_librarian",
          input: ["读者", "图书"],
          output: ["借阅记录"],
        },
        { id: "end", type: "end", name: "结束" },
      ],
      relationships: [
        {
          id: "flow_borrow",
          type: "control_flow",
          sourceId: "start",
          targetId: "act_borrow",
        },
        {
          id: "flow_end",
          type: "control_flow",
          sourceId: "act_borrow",
          targetId: "end",
        },
      ],
    };
  }

  return {
    diagramKind: "deployment",
    title: "图书馆部署模型",
    summary: "管理服务和数据库部署。",
    notes: [],
    nodes: [
      {
        id: "node_app",
        name: "图书馆管理服务",
        nodeType: "server",
        environment: "production",
      },
    ],
    databases: [{ id: "db_library", name: "图书馆数据库", engine: "PostgreSQL" }],
    components: [],
    externalSystems: [],
    artifacts: [],
    relationships: [
      {
        id: "rel_app_db",
        type: "communication",
        sourceId: "node_app",
        targetId: "db_library",
        protocol: "TCP",
      },
    ],
  };
}

function outputForKind(kind: DiagramKind) {
  const ruleId =
    kind === "class" ? "r2" : kind === "deployment" ? "r3" : "r1";
  const model = modelForKind(kind);
  const targets =
    kind === "usecase"
      ? [
          { elementId: "actor_librarian", elementKind: "actor", label: "图书管理员" },
          { elementId: "uc_borrow", elementKind: "usecase", label: "借书" },
          {
            elementId: "rel_librarian_borrow",
            elementKind: "relationship",
            label: "图书管理员 -> 借书",
          },
        ]
      : kind === "class"
        ? [{ elementId: "class_book", elementKind: "class", label: "图书" }]
        : kind === "activity"
          ? [
              { elementId: "act_borrow", elementKind: "activity", label: "办理借书" },
              {
                elementId: "flow_borrow",
                elementKind: "relationship",
                label: "开始 -> 办理借书",
              },
              {
                elementId: "flow_end",
                elementKind: "relationship",
                label: "办理借书 -> 结束",
              },
            ]
          : [
              {
                elementId: "node_app",
                elementKind: "deployment-node",
                label: "图书馆管理服务",
              },
              { elementId: "db_library", elementKind: "database", label: "图书馆数据库" },
              {
                elementId: "rel_app_db",
                elementKind: "relationship",
                label: "图书馆管理服务 -> 图书馆数据库",
              },
            ];
  return JSON.stringify({
    models: [model],
    requirementModelTraceability: targets.map((target) => ({
      ruleId,
      target: {
        diagramKind: kind,
        ...target,
      },
    })),
  });
}

function selectedKindFromPrompt(prompt: string): DiagramKind {
  const match = prompt.match(/只生成以下图类型：\n([^\n]+)/);
  const listed = (match?.[1] ?? "usecase").split(",").map((item) => item.trim());
  return (listed[0] ?? "usecase") as DiagramKind;
}

test("requirement pipeline calls the LLM once per selected model and keeps successful models when one model fails", async () => {
  const calls: Array<{ kind: DiagramKind; prompt: string }> = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const kind = selectedKindFromPrompt(prompt);
      calls.push({ kind, prompt });
      if (kind === "activity") {
        yield "{bad-json";
        return;
      }
      yield outputForKind(kind);
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-library",
    LIBRARY_REQUIREMENT_TEXT,
    ["usecase", "class", "activity", "deployment"],
    libraryRules,
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.deepEqual(
    [...new Set(calls.map((call) => call.kind))].sort(),
    ["activity", "class", "deployment", "usecase"],
  );
  assert.equal(calls.filter((call) => call.kind === "class").length, 1);
  assert.equal(calls.filter((call) => call.kind === "deployment").length, 1);
  assert.equal(calls.filter((call) => call.kind === "usecase").length, 1);
  assert.ok(calls.filter((call) => call.kind === "activity").length > 1);
  assert.deepEqual(
    completed.models.map((model) => model.diagramKind).sort(),
    ["class", "deployment", "usecase"],
  );
  assert.equal(completed.diagramErrors.activity?.stage, "generate_models");
  assert.equal(completed.status, "completed");
});

test("requirement pipeline reuses contextual use case event flows for analysis-only reruns", async () => {
  const analysisRule: RequirementRule = {
    id: "r-analysis",
    category: "功能需求",
    text: "图书管理员可以按事件流完成借书。",
    relatedDiagrams: ["analysis"],
  };
  const useCaseContext = modelForKind("usecase");
  assert.equal(useCaseContext.diagramKind, "usecase");
  const contextualUseCase: DiagramModelSpec = {
    ...useCaseContext,
    useCases: useCaseContext.useCases.map((useCase) => ({
      ...useCase,
      eventFlows: [
        {
          id: "flow_borrow_main",
          name: "借书主成功场景",
          flowType: "main",
          trigger: "图书管理员发起借书",
          steps: [
            {
              order: 1,
              actor: "actor",
              action: "提交读者与图书信息",
              systemResponse: "校验图书可借状态",
            },
            {
              order: 2,
              actor: "system",
              action: "创建借阅记录",
              systemResponse: "返回借书成功",
            },
          ],
        },
      ],
    })),
  };
  const calls: string[] = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      calls.push(prompt);
      yield JSON.stringify({
        models: [
          {
            diagramKind: "analysis",
            modelId: "analysis:uc_borrow",
            sourceUseCaseId: "uc_borrow",
            sourceUseCaseName: "借书",
            title: "借书需求分析模型",
            summary: "根据借书用例事件流生成的需求阶段交互。",
            notes: [],
            participants: [
              {
                id: "actor_librarian",
                name: "图书管理员",
                participantType: "actor",
              },
              {
                id: "boundary_borrow",
                name: "借书界面",
                participantType: "boundary",
              },
              {
                id: "control_borrow",
                name: "借书控制",
                participantType: "control",
              },
            ],
            messages: [
              {
                id: "msg_submit",
                type: "sync",
                sourceId: "actor_librarian",
                targetId: "boundary_borrow",
                name: "提交借书信息",
                parameters: ["读者", "图书"],
                description: "图书管理员提交读者与图书信息。",
              },
              {
                id: "msg_validate",
                type: "sync",
                sourceId: "boundary_borrow",
                targetId: "control_borrow",
                name: "校验可借",
                parameters: ["图书"],
              },
            ],
            fragments: [],
          },
        ],
        requirementModelTraceability: [
          ...[
            ["actor_librarian", "participant", "图书管理员"],
            ["boundary_borrow", "participant", "借书界面"],
            ["control_borrow", "participant", "借书控制"],
            ["msg_submit", "message", "提交借书信息"],
            ["msg_validate", "message", "校验可借"],
          ].map(([elementId, elementKind, label]) => ({
            ruleId: "r-analysis",
            target: {
              diagramKind: "analysis",
              modelId: "analysis:uc_borrow",
              elementId,
              elementKind,
              label,
            },
          })),
        ],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-analysis-only",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [analysisRule],
    {
      models: [contextualUseCase],
      requirementModelTraceability: [
        {
          ruleId: "r-analysis",
          target: {
            diagramKind: "usecase",
            elementId: "uc_borrow",
            elementKind: "usecase",
            label: "借书",
          },
        },
      ],
    },
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? "", /单用例需求阶段用例模型/);
  assert.match(calls[0] ?? "", /uc_borrow/);
  assert.equal(completed.status, "completed");
  assert.equal(completed.diagramErrors.usecase, undefined);
  assert.equal(
    completed.models.find((model) => model.diagramKind === "analysis")?.modelId,
    "analysis:uc_borrow",
  );
  assert.deepEqual(
    completed.models.map((model) => model.diagramKind).sort(),
    ["analysis", "usecase"],
  );
});

test("requirement pipeline auto-fills traceability when LLM traceability stays empty", async () => {
  let traceabilityPromptCount = 0;
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      if (prompt.includes("抽取结构化需求规则")) {
        yield JSON.stringify({ rules: libraryRules });
        return;
      }
      if (prompt.includes("补充元素级可追踪关系") || prompt.includes("修复需求模型元素级可追踪关系")) {
        traceabilityPromptCount += 1;
        yield JSON.stringify({ requirementModelTraceability: [] });
        return;
      }
      yield JSON.stringify({
        models: [modelForKind("usecase")],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const record: RunRecord = {
    snapshot: createEmptySnapshot(
      "run-autofill-empty-traceability",
      LIBRARY_REQUIREMENT_TEXT,
      ["usecase"],
      [],
    ),
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(completed.status, "completed");
  assert.equal(traceabilityPromptCount, 3);
  assert.equal(completed.requirementModelTraceability.length, 3);
  assert.ok(
    completed.requirementTrace.some(
      (entry) =>
        entry.kind === "parsed_model" &&
        Boolean(
          (entry.parsedData as { autoFilledRequirementTraceability?: boolean } | undefined)
            ?.autoFilledRequirementTraceability,
        ),
    ),
  );
});

test("requirement pipeline accepts nullable model ids from traceability-only repair", async () => {
  let traceabilityPromptCount = 0;
  const repairedTargets = [
    { elementId: "actor_librarian", elementKind: "actor", label: "图书管理员" },
    { elementId: "uc_borrow", elementKind: "usecase", label: "借书" },
    {
      elementId: "rel_librarian_borrow",
      elementKind: "relationship",
      label: "图书管理员 -> 借书",
    },
  ];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      if (prompt.includes("补充元素级可追踪关系") || prompt.includes("修复需求模型元素级可追踪关系")) {
        traceabilityPromptCount += 1;
        yield JSON.stringify({
          requirementModelTraceability: repairedTargets.map((target) => ({
            ruleId: "r1",
            target: {
              modelId: null,
              diagramKind: "use-case-diagram",
              ...target,
            },
          })),
        });
        return;
      }
      yield JSON.stringify({
        models: [modelForKind("usecase")],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const record: RunRecord = {
    snapshot: createEmptySnapshot(
      "run-nullable-traceability-repair",
      LIBRARY_REQUIREMENT_TEXT,
      ["usecase"],
      [libraryRules[0]!],
    ),
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(completed.status, "completed");
  assert.equal(completed.diagramErrors.usecase, undefined);
  assert.equal(traceabilityPromptCount, 1);
  assert.equal(completed.requirementModelTraceability.length, 3);
  assert.ok(
    completed.requirementModelTraceability.every(
      (entry) =>
        entry.target.diagramKind === "usecase" &&
        entry.target.modelId === undefined,
    ),
  );
  assert.equal(
    completed.requirementTrace.some((entry) =>
      Boolean(
        (entry.parsedData as { autoFilledRequirementTraceability?: boolean } | undefined)
          ?.autoFilledRequirementTraceability,
      ),
    ),
    false,
  );
});

test("requirement pipeline skips traceability cleanly when there are no mappable model elements", async () => {
  let traceabilityPromptCount = 0;
  const emptyDeploymentModel: DiagramModelSpec = {
    diagramKind: "deployment",
    title: "空部署模型",
    summary: "没有可映射的业务元素。",
    notes: [],
    nodes: [],
    databases: [],
    components: [],
    externalSystems: [],
    artifacts: [],
    relationships: [],
  };
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      if (prompt.includes("抽取结构化需求规则")) {
        yield JSON.stringify({ rules: [] });
        return;
      }
      if (prompt.includes("补充元素级可追踪关系") || prompt.includes("修复需求模型元素级可追踪关系")) {
        traceabilityPromptCount += 1;
        yield JSON.stringify({ requirementModelTraceability: [] });
        return;
      }
      yield JSON.stringify({
        models: [emptyDeploymentModel],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const record: RunRecord = {
    snapshot: createEmptySnapshot(
      "run-no-mappable-elements-traceability-skip",
      "读者可以查询图书并提交借阅申请。",
      ["deployment"],
      [],
    ),
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(completed.status, "completed");
  assert.equal(completed.diagramErrors.deployment, undefined);
  assert.equal(traceabilityPromptCount, 0);
  assert.equal(completed.requirementModelTraceability.length, 0);
  assert.equal(
    completed.models.find((model) => model.diagramKind === "deployment")?.diagramKind,
    "deployment",
  );
  const skippedTrace = completed.requirementTrace.find(
    (entry) =>
      entry.kind === "parsed_model" &&
      Boolean(
        (entry.parsedData as { skippedRequirementTraceability?: boolean } | undefined)
          ?.skippedRequirementTraceability,
      ),
  );
  assert.ok(skippedTrace);
  assert.equal(skippedTrace.attempt, 1);
});

test("requirement pipeline retries missing per-use-case analysis coverage", async () => {
  const analysisRule: RequirementRule = {
    id: "r-analysis",
    category: "功能需求",
    text: "每个用例都应由事件流生成独立需求分析顺序图。",
    relatedDiagrams: ["analysis"],
  };
  const baseUseCaseModel = modelForKind("usecase");
  assert.equal(baseUseCaseModel.diagramKind, "usecase");
  const contextualUseCase: DiagramModelSpec = {
    ...baseUseCaseModel,
    useCases: [
      {
        ...baseUseCaseModel.useCases[0]!,
        id: "uc_borrow",
        name: "借书",
        eventFlows: [
          {
            id: "flow_borrow_main",
            name: "借书主成功场景",
            flowType: "main",
            trigger: "管理员发起借书",
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "提交借书信息",
                systemResponse: "系统创建借阅记录",
              },
            ],
          },
        ],
      },
      {
        ...baseUseCaseModel.useCases[0]!,
        id: "uc_search",
        name: "检索图书",
        eventFlows: [
          {
            id: "flow_search_main",
            name: "检索主成功场景",
            flowType: "main",
            trigger: "读者输入检索条件",
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "提交检索条件",
                systemResponse: "系统返回匹配图书",
              },
            ],
          },
        ],
      },
    ],
  };
  const callCounts = new Map<string, number>();
  const analysisOutput = (useCaseId: string, useCaseName: string) =>
    JSON.stringify({
      models: [
        {
          diagramKind: "analysis",
          modelId: `analysis:${useCaseId}`,
          sourceUseCaseId: useCaseId,
          sourceUseCaseName: useCaseName,
          title: `${useCaseName}需求分析模型`,
          summary: `根据${useCaseName}事件流生成。`,
          notes: [],
          participants: [
            {
              id: `actor_${useCaseId}`,
              name: useCaseName === "检索图书" ? "读者" : "图书管理员",
              participantType: "actor",
            },
            {
              id: `boundary_${useCaseId}`,
              name: `${useCaseName}界面`,
              participantType: "boundary",
            },
          ],
          messages: [
            {
              id: `msg_${useCaseId}`,
              type: "sync",
              sourceId: `actor_${useCaseId}`,
              targetId: `boundary_${useCaseId}`,
              name: useCaseName,
              parameters: [],
            },
          ],
          fragments: [],
        },
      ],
      requirementModelTraceability: [
        [`actor_${useCaseId}`, "participant", useCaseName === "检索图书" ? "读者" : "图书管理员"],
        [`boundary_${useCaseId}`, "participant", `${useCaseName}界面`],
        [`msg_${useCaseId}`, "message", useCaseName],
      ].map(([elementId, elementKind, label]) => ({
        ruleId: "r-analysis",
        target: {
          diagramKind: "analysis",
          modelId: `analysis:${useCaseId}`,
          elementId,
          elementKind,
          label,
        },
      })),
    });
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const isSearch = prompt.includes("uc_search");
      const useCaseId = isSearch ? "uc_search" : "uc_borrow";
      const useCaseName = isSearch ? "检索图书" : "借书";
      const count = (callCounts.get(useCaseId) ?? 0) + 1;
      callCounts.set(useCaseId, count);
      if (useCaseId === "uc_search" && count === 1) {
        throw new Error("temporary provider interruption");
      }
      yield analysisOutput(useCaseId, useCaseName);
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-analysis-coverage-retry",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [analysisRule],
    {
      models: [contextualUseCase],
      requirementModelTraceability: [],
    },
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  const analysisIds = completed.models
    .filter((model) => model.diagramKind === "analysis")
    .map((model) => model.modelId)
    .sort();
  assert.equal(completed.status, "completed");
  assert.equal(completed.diagramErrors.analysis, undefined);
  assert.equal(callCounts.get("uc_borrow"), 1);
  assert.equal(callCounts.get("uc_search"), 2);
  assert.deepEqual(analysisIds, ["analysis:uc_borrow", "analysis:uc_search"]);
});
