import assert from "node:assert/strict";
import test from "node:test";
import type { LlmTransport } from "./llm.js";
import { createApiServer } from "./index.js";

const RULES_JSON =
  '{"rules":[{"id":"r1","category":"业务规则","text":"用户必须登录后才能访问主要功能。","relatedDiagrams":["usecase","activity"]}]}';

const USECASE_MODEL_JSON = JSON.stringify({
  models: [
    {
      diagramKind: "usecase",
      title: "实验平台用例",
      summary: "主要参与者和用例",
      notes: ["仅包含核心流程"],
      actors: [
        {
          id: "actor_researcher",
          name: "研究人员",
          actorType: "human",
          responsibilities: ["发起生成请求"],
        },
      ],
      useCases: [
        {
          id: "usecase_generate",
          name: "生成模型",
          goal: "根据需求生成 UML 模型",
          preconditions: ["已输入需求文本"],
          postconditions: ["系统返回结构化模型与图"],
          primaryActorId: "actor_researcher",
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [
        {
          id: "boundary_platform",
          name: "实验平台",
        },
      ],
      relationships: [
        {
          id: "rel_association_1",
          sourceId: "actor_researcher",
          targetId: "usecase_generate",
          type: "association",
          label: "发起",
        },
      ],
    },
  ],
});

const ACTIVITY_MODEL = {
  diagramKind: "activity" as const,
  title: "活动流程",
  summary: "带泳道的活动图",
  notes: [],
  swimlanes: [
    { id: "lane_user", name: "用户" },
    { id: "lane_system", name: "系统" },
  ],
  nodes: [
    { id: "start", type: "start", name: "开始" },
    {
      id: "submit",
      type: "activity",
      name: "提交需求",
      actorOrLane: "lane_user",
      input: ["需求"],
      output: ["请求"],
    },
    {
      id: "generate",
      type: "activity",
      name: "生成模型",
      actorOrLane: "lane_system",
      input: ["请求"],
      output: ["模型"],
    },
    { id: "end", type: "end", name: "结束" },
  ],
  relationships: [
    { id: "flow_start", type: "control_flow", sourceId: "start", targetId: "submit" },
    { id: "flow_submit", type: "control_flow", sourceId: "submit", targetId: "generate" },
    { id: "flow_generate", type: "control_flow", sourceId: "generate", targetId: "end" },
  ],
};

const MULTI_MODEL_JSON = JSON.stringify({
  models: [JSON.parse(USECASE_MODEL_JSON).models[0], ACTIVITY_MODEL],
});

const DESIGN_SEQUENCE_MODEL = {
  diagramKind: "sequence" as const,
  title: "生成模型顺序",
  summary: "用户触发生成后的对象调用",
  notes: ["设计阶段动态行为"],
  participants: [
    {
      id: "actor_researcher",
      name: "研究人员",
      participantType: "actor",
    },
    {
      id: "ui",
      name: "Web 页面",
      participantType: "boundary",
    },
    {
      id: "api",
      name: "编排 API",
      participantType: "control",
    },
  ],
  messages: [
    {
      id: "msg_submit",
      type: "sync",
      sourceId: "actor_researcher",
      targetId: "ui",
      name: "submitRequirement",
      parameters: ["requirementText"],
    },
    {
      id: "msg_start",
      type: "sync",
      sourceId: "ui",
      targetId: "api",
      name: "startRun",
      parameters: ["selectedDiagrams"],
      returnValue: "runId",
    },
  ],
  fragments: [],
};

const DESIGN_SEQUENCE_JSON = JSON.stringify({
  models: [DESIGN_SEQUENCE_MODEL],
});

const DESIGN_ACTIVITY_JSON = JSON.stringify({
  models: [
    {
      ...ACTIVITY_MODEL,
      title: "设计业务逻辑",
      summary: "设计阶段业务逻辑层",
      notes: ["由顺序图约束对象协作"],
    },
  ],
});

function createMockLlmTransport(): LlmTransport {
  return {
    async *streamChatCompletion({ messages, responseFormat }) {
      const prompt = messages.at(-1)?.content ?? "";

      if (prompt.includes("请修复下面无法编译或返回占位 SVG 的 PlantUML")) {
        yield JSON.stringify({
          source: [
            "@startuml",
            "actor 研究人员",
            "usecase 生成模型",
            "研究人员 --> 生成模型 : 发起",
            "@enduml",
          ].join("\n"),
        });
        return;
      }

      if (prompt.includes("请修复下面不符合要求的 UML 结构化模型 JSON 输出")) {
        assert.equal(responseFormat?.type, "json_schema");
        yield USECASE_MODEL_JSON;
        return;
      }

      if (prompt.includes("抽取结构化需求规则")) {
        yield RULES_JSON;
        return;
      }

      if (prompt.includes("生成 UML 结构化模型")) {
        assert.equal(responseFormat?.type, "json_schema");
      }

      yield USECASE_MODEL_JSON;
    },
  };
}

async function withCapturedConsoleError(
  callback: (logs: string[]) => Promise<void>,
) {
  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    await callback(logs);
  } finally {
    console.error = originalConsoleError;
  }
}

test("api runs a full pipeline and streams SSE events", async () => {
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();

  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.equal(eventsResponse.statusCode, 200);
  assert.equal(
    eventsResponse.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
  assert.equal(eventsResponse.headers.vary, "Origin");
  assert.match(
    String(eventsResponse.headers["content-type"] ?? ""),
    /text\/event-stream/i,
  );
  assert.match(eventsResponse.body, /"type":"queued"/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  assert.equal(snapshotResponse.statusCode, 200);
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.rules.length, 1);
  assert.equal(snapshot.models.length, 1);
  assert.equal(snapshot.svgArtifacts.length, 1);

  await app.close();
});

test("api runs a design sequence pipeline from the requirement usecase model", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = messages.at(-1)?.content ?? "";
        assert.equal(responseFormat?.type, "json_schema");
        assert.match(prompt, /设计阶段顺序图/);
        yield DESIGN_SEQUENCE_JSON;
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>sequence</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      selectedDiagrams: ["sequence"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/design-runs/${runId}`,
  });
  assert.equal(snapshotResponse.statusCode, 200);
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.deepEqual(snapshot.selectedDiagrams, ["sequence"]);
  assert.equal(snapshot.models[0].diagramKind, "sequence");
  assert.equal(snapshot.svgArtifacts[0].diagramKind, "sequence");

  await app.close();
});

test("api auto-adds sequence dependency for downstream design diagrams", async () => {
  const prompts: string[] = [];
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = messages.at(-1)?.content ?? "";
        prompts.push(prompt);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("需求阶段用例模型生成设计阶段顺序图")) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
        yield DESIGN_ACTIVITY_JSON;
      },
    },
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0], ACTIVITY_MODEL],
      selectedDiagrams: ["activity"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/design-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.deepEqual(snapshot.selectedDiagrams, ["sequence", "activity"]);
  assert.deepEqual(
    snapshot.models.map((model: { diagramKind: string }) => model.diagramKind),
    ["sequence", "activity"],
  );
  assert.equal(prompts.length, 2);

  await app.close();
});

test("api repairs generate_models output when the first model JSON is malformed", async () => {
  let modelAttempts = 0;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = messages.at(-1)?.content ?? "";

        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        assert.equal(responseFormat?.type, "json_schema");
        modelAttempts += 1;
        if (modelAttempts === 1) {
          yield `${JSON.stringify({
            models: [
              {
                diagramKind: "usecase",
                title: "实验平台用例",
                summary: "主要参与者和用例",
                notes: [{ text: "仅包含核心流程" }],
                actors: [
                  {
                    id: "actor_researcher",
                    name: "研究人员",
                    actorType: "human",
                    responsibilities: ["发起生成请求"],
                  },
                ],
                useCases: [
                  {
                    id: "usecase_generate",
                    name: "生成模型",
                    goal: "根据需求生成 UML 模型",
                    preconditions: ["已输入需求文本"],
                    postconditions: ["系统返回结构化模型与图"],
                    primaryActorId: "actor_researcher",
                    supportingActorIds: [],
                  },
                ],
                systemBoundaries: [{ id: "boundary_platform", name: "实验平台" }],
                relationships: [
                  {
                    id: "rel_association_1",
                    sourceId: "actor_researcher",
                    targetId: "usecase_generate",
                    type: "association",
                    label: "发起",
                  },
                ],
              },
            ],
          })}\n说明：模型已生成`;
          return;
        }

        yield USECASE_MODEL_JSON;
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.match(eventsResponse.body, /模型 JSON 结构不合法/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.equal(modelAttempts, 2);
  assert.deepEqual(snapshot.models[0].notes, ["仅包含核心流程"]);

  await app.close();
});

test("api skips json_schema for compatible-mode models and completes", async () => {
  let sawGenerateModels = false;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = messages.at(-1)?.content ?? "";
        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        if (prompt.includes("生成 UML 结构化模型")) {
          sawGenerateModels = true;
          assert.equal(responseFormat, undefined);
        }
        yield USECASE_MODEL_JSON;
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "claude-opus-4-6-thinking",
      },
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.models.length, 1);
  assert.equal(sawGenerateModels, true);

  await app.close();
});

test("api logs the final generate_models output when parsing or schema validation fails", async () => {
  await withCapturedConsoleError(async (logs) => {
    let modelAttempts = 0;
    const app = await createApiServer({
      llmTransport: {
        async *streamChatCompletion({ messages, responseFormat }) {
          const prompt = messages.at(-1)?.content ?? "";

          if (prompt.includes("抽取结构化需求规则")) {
            yield RULES_JSON;
            return;
          }

          assert.equal(responseFormat?.type, "json_schema");
          modelAttempts += 1;
          if (modelAttempts === 1) {
            yield `${JSON.stringify({
              models: [
                {
                  diagramKind: "usecase",
                  title: "实验平台用例",
                  summary: "主要参与者和用例",
                  notes: [{ text: "仅包含核心流程" }],
                  actors: [
                    {
                      id: "actor_researcher",
                      name: "研究人员",
                      actorType: "human",
                      responsibilities: ["发起生成请求"],
                    },
                  ],
                  useCases: [
                    {
                      id: "usecase_generate",
                      name: "生成模型",
                      goal: "根据需求生成 UML 模型",
                      preconditions: ["已输入需求文本"],
                      postconditions: ["系统返回结构化模型与图"],
                      primaryActorId: "actor_researcher",
                      supportingActorIds: [],
                    },
                  ],
                  systemBoundaries: [{ id: "boundary_platform", name: "实验平台" }],
                  relationships: [
                    {
                      id: "rel_association_1",
                      sourceId: "actor_researcher",
                      targetId: "usecase_generate",
                      type: "association",
                      label: "发起",
                    },
                  ],
                },
              ],
            })}\n说明：模型已生成`;
            return;
          }

          yield USECASE_MODEL_JSON;
        },
      },
      renderClient: async () => ({
        svg: "<svg><text>ok</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: 120,
          durationMs: 5,
        },
      }),
    });

    const startResponse = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        requirementText: "实验平台根据文本需求生成模型和 UML 图。",
        selectedDiagrams: ["usecase"],
        providerSettings: {
          apiBaseUrl: "https://ai.comfly.chat",
          apiKey: "sk-test",
          model: "gpt-5.5",
        },
      },
    });

    const { runId } = startResponse.json();
    const eventsResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/events`,
      headers: {
        origin: "http://localhost:5173",
      },
    });

    assert.match(eventsResponse.body, /模型 JSON 结构不合法/);
    assert.ok(
      logs.some(
        (entry) =>
          entry.includes("[llm-structured-output-failed]") &&
          entry.includes("stage=generate_models") &&
          entry.includes("attempt=1") &&
          entry.includes("说明：模型已生成"),
      ),
    );

    await app.close();
  });
});

test("api repairs PlantUML after the first render failure and completes the run", async () => {
  let renderAttempts = 0;
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => {
      renderAttempts += 1;
      if (renderAttempts === 1) {
        throw new Error("Syntax Error? (line 3)");
      }

      assert.match(artifact.source, /@startuml/);
      assert.match(artifact.source, /研究人员 --> 生成模型/);
      return {
        svg: "<svg><text>fixed</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 8,
        },
      };
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.match(eventsResponse.body, /PlantUML 编译失败/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "completed");
  assert.equal(renderAttempts, 2);
  assert.match(snapshot.plantUml[0].source, /研究人员 --> 生成模型/);
  assert.equal(snapshot.svgArtifacts.length, 1);

  await app.close();
});

test("api treats placeholder SVG as a repairable render failure", async () => {
  let renderAttempts = 0;
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => {
      renderAttempts += 1;
      if (renderAttempts === 1) {
        return {
          svg: "<svg><text>Welcome to PlantUML!</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: artifact.source.length,
            durationMs: 3,
          },
        };
      }

      return {
        svg: "<svg><text>fixed after placeholder</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 6,
        },
      };
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.match(eventsResponse.body, /PlantUML 编译失败/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "completed");
  assert.equal(renderAttempts, 2);
  assert.match(snapshot.svgArtifacts[0].svg, /fixed after placeholder/);

  await app.close();
});

test("api keeps successful diagrams and reports activity render failure in diagramErrors", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = messages.at(-1)?.content ?? "";

        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        if (prompt.includes("请修复下面无法编译或返回占位 SVG 的 PlantUML")) {
          yield JSON.stringify({
            source: "@startuml\n|用户|\nstart\n:提交需求;\nstop\n@enduml",
          });
          return;
        }

        assert.equal(responseFormat?.type, "json_schema");
        yield MULTI_MODEL_JSON;
      },
    },
    renderClient: async (artifact) => {
      if (artifact.diagramKind === "activity") {
        throw new Error("Syntax Error? (Assumed diagram type: activity)");
      }

      return {
        svg: "<svg><text>usecase ok</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 5,
        },
      };
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase", "activity"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.match(eventsResponse.body, /"type":"completed"/);
  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.svgArtifacts.length, 1);
  assert.equal(snapshot.svgArtifacts[0].diagramKind, "usecase");
  assert.match(
    snapshot.diagramErrors.activity?.message ?? "",
    /PlantUML repair failed for activity/i,
  );
  assert.equal(snapshot.diagramErrors.activity?.stage, "render_svg");

  await app.close();
});

test("api fails the run when PlantUML still cannot be repaired after retries", async () => {
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => {
      throw new Error("broken uml source");
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.match(eventsResponse.body, /PlantUML 编译失败/);
  assert.match(eventsResponse.body, /"type":"failed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "failed");
  assert.match(snapshot.errorMessage ?? "", /PlantUML repair failed for usecase/i);
  assert.match(snapshot.errorMessage ?? "", /broken uml source/i);

  await app.close();
});

test("api emits failed events when a stage returns invalid JSON", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion() {
        yield '{"rules":"invalid"}';
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:5173",
    },
  });

  assert.equal(eventsResponse.statusCode, 200);
  assert.equal(
    eventsResponse.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
  assert.match(eventsResponse.body, /"type":"failed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "failed");
  assert.match(snapshot.errorMessage ?? "", /invalid/i);

  await app.close();
});

test("api rejects invalid start requests with 400", async () => {
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /providerSettings\.apiKey/i);

  await app.close();
});

test("api proxies manual PlantUML render requests", async () => {
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 4,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    payload: {
      diagramKind: "class",
      plantUmlSource: "@startuml\nclass User\n@enduml",
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.match(body.svg, /class/);
  assert.equal(body.renderMeta.sourceLength, "@startuml\nclass User\n@enduml".length);

  await app.close();
});

test("api reports manual PlantUML render failures clearly", async () => {
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => {
      throw new Error("Syntax Error? (line 2)");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    payload: {
      diagramKind: "activity",
      plantUmlSource: "@startuml\nbroken\n@enduml",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /Syntax Error/);

  await app.close();
});

test("api rejects invalid manual render requests with 400", async () => {
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    payload: {
      diagramKind: "unknown",
      plantUmlSource: "",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /diagramKind|plantUmlSource/);

  await app.close();
});

test("api tests provider connections and returns model capability", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    const app = await createApiServer({
      llmTransport: createMockLlmTransport(),
      renderClient: async () => ({
        svg: "<svg />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: 0,
          durationMs: 1,
        },
      }),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/provider/test",
      payload: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "claude-opus-4-6-thinking",
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.capability.supportsJsonSchema, false);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api reports provider test failures clearly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "invalid api key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    const app = await createApiServer({
      llmTransport: createMockLlmTransport(),
      renderClient: async () => ({
        svg: "<svg />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: 0,
          durationMs: 1,
        },
      }),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/provider/test",
      payload: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "bad-key",
        model: "gpt-5.5",
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /invalid api key/);

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api exposes health under root and /api for reverse proxy checks", async () => {
  const app = await createApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });

  const rootHealth = await app.inject({
    method: "GET",
    url: "/health",
  });
  const apiHealth = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(rootHealth.statusCode, 200);
  assert.equal(apiHealth.statusCode, 200);
  assert.equal(rootHealth.json().status, "ok");
  assert.equal(apiHealth.json().status, "ok");

  await app.close();
});
