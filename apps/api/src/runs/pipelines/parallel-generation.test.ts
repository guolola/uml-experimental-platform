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
