import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import type { LlmTransport } from "./llm.js";
import { createApiServer } from "./index.js";

function lastPromptText(messages: Parameters<LlmTransport["streamChatCompletion"]>[0]["messages"]) {
  const content = messages.at(-1)?.content ?? "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : part.image_url.url))
    .join("\n");
}

const RULES_JSON =
  '{"rules":[{"id":"r1","category":"业务规则","text":"用户必须登录后才能访问主要功能。","relatedDiagrams":["usecase","activity"]}]}';
const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

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

const CLASS_MODEL = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "用户与订单领域对象",
  notes: [],
  classes: [
    {
      id: "user",
      name: "用户",
      classKind: "entity",
      attributes: [
        {
          name: "id",
          type: "INT",
          visibility: "public",
          required: true,
        },
        {
          name: "email",
          type: "VARCHAR(100)",
          visibility: "public",
          required: true,
        },
      ],
      operations: [],
    },
    {
      id: "order",
      name: "订单",
      classKind: "entity",
      attributes: [
        {
          name: "id",
          type: "INT",
          visibility: "public",
          required: true,
        },
        {
          name: "userId",
          type: "INT",
          visibility: "public",
          required: true,
        },
      ],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [
    {
      id: "rel_user_order",
      type: "association",
      sourceId: "user",
      targetId: "order",
      sourceMultiplicity: "1",
      targetMultiplicity: "0..*",
      label: "下单",
    },
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

function createCodeAppBlueprintJson(appName = "校园活动运营台") {
  return JSON.stringify({
    appBlueprint: {
      appName,
      domain: "校园活动",
      targetUsers: ["学生", "活动管理员"],
      coreWorkflow: "浏览活动、提交报名、查看报名详情和运营状态",
      pages: [
        {
          id: "overview",
          name: "活动总览",
          route: "/",
          purpose: "查看活动运营指标和推荐活动",
          sourceDiagramIds: ["sequence"],
        },
        {
          id: "registration",
          name: "活动报名",
          route: "/registration",
          purpose: "完成活动筛选和报名提交",
          sourceDiagramIds: ["sequence"],
        },
        {
          id: "detail",
          name: "报名详情",
          route: "/detail",
          purpose: "查看报名记录、状态和提醒",
          sourceDiagramIds: ["sequence"],
        },
      ],
      successCriteria: ["页面能体现校园活动业务", "核心流程可在原型中切换查看"],
    },
  });
}

function createCodeUiBlueprintJson() {
  return JSON.stringify({
    uiBlueprint: {
      theme: {
        name: "校园活力运营",
        primaryColor: "#2563eb",
        backgroundColor: "#f7fafc",
        surfaceColor: "#ffffff",
        textColor: "#14213d",
        accentColor: "#f97316",
        density: "comfortable",
        tone: "清爽、可信、面向校园服务",
      },
      visualLanguage: "使用清爽背景、明确状态色和校园服务文案，突出活动报名闭环。",
      navigationModel: "左侧业务导航切换总览、报名、详情页面。",
      layoutPrinciples: ["总览突出指标和待办", "流程页突出筛选、表单和行动按钮"],
      componentGuidelines: ["状态徽标清晰", "列表和详情并列展示", "表单控件成组呈现"],
      stateGuidelines: ["空状态给出下一步动作", "成功状态显示报名结果", "错误状态保留原因"],
    },
  });
}

function extractZipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(centralOffset), 0x02014b50);
    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
      .toString("utf8");

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(
      name,
      method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed),
    );

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function createCodeFilePlanJson() {
  return JSON.stringify({
    filePlan: {
      entryFile: "/src/App.tsx",
      files: [
        { path: "/src/App.tsx", kind: "entry", responsibility: "挂载原型外壳" },
        {
          path: "/src/components/WorkspaceShell.tsx",
          kind: "component",
          responsibility: "组织导航和页面切换",
        },
        {
          path: "/src/pages/DashboardPage.tsx",
          kind: "page",
          responsibility: "活动运营总览",
        },
        {
          path: "/src/pages/RegistrationPage.tsx",
          kind: "page",
          responsibility: "活动报名流程",
        },
        {
          path: "/src/pages/DetailPage.tsx",
          kind: "page",
          responsibility: "报名详情和提醒",
        },
        {
          path: "/src/components/StatusBadge.tsx",
          kind: "component",
          responsibility: "展示活动和报名状态",
        },
        {
          path: "/src/components/MetricCard.tsx",
          kind: "component",
          responsibility: "展示运营指标",
        },
        {
          path: "/src/domain/types.ts",
          kind: "domain",
          responsibility: "定义活动和报名类型",
        },
        {
          path: "/src/data/mock-data.ts",
          kind: "data",
          responsibility: "提供校园活动 mock 数据",
        },
        { path: "/src/styles.css", kind: "style", responsibility: "业务主题样式" },
      ],
    },
  });
}

function createQualityCodeOperations(label = "校园活动") {
  return [
    {
      operation: "update_file",
      path: "/src/App.tsx",
      content:
        "import { WorkspaceShell } from './components/WorkspaceShell';\nexport default function App() { return <WorkspaceShell />; }",
      reason: "保持入口组件轻量",
    },
    {
      operation: "update_file",
      path: "/src/components/WorkspaceShell.tsx",
      content:
        "import { useState } from 'react';\nimport { DashboardPage } from '../pages/DashboardPage';\nimport { RegistrationPage } from '../pages/RegistrationPage';\nimport { DetailPage } from '../pages/DetailPage';\nconst tabs = ['总览','报名','详情'] as const;\nexport function WorkspaceShell() { const [tab,setTab]=useState<(typeof tabs)[number]>('总览'); return <main className=\"prototype-shell\"><nav>{tabs.map((item)=><button key={item} onClick={()=>setTab(item)}>{item}</button>)}</nav>{tab==='总览'?<DashboardPage />:tab==='报名'?<RegistrationPage />:<DetailPage />}</main>; }",
      reason: "生成多页面导航外壳",
    },
    {
      operation: "create_file",
      path: "/src/pages/DashboardPage.tsx",
      content:
        "import { MetricCard } from '../components/MetricCard';\nimport { activities } from '../data/mock-data';\nexport function DashboardPage() { return <section><h1>活动总览</h1><MetricCard label=\"可报名活动\" value={activities.length} /><p>校园活动运营状态一目了然。</p></section>; }",
      reason: "生成总览页面",
    },
    {
      operation: "create_file",
      path: "/src/pages/RegistrationPage.tsx",
      content:
        "import { StatusBadge } from '../components/StatusBadge';\nimport { activities } from '../data/mock-data';\nexport function RegistrationPage() { return <section><h1>活动报名</h1>{activities.map((item)=><article key={item.id}><h2>{item.name}</h2><StatusBadge status={item.status} /><button>报名</button></article>)}</section>; }",
      reason: "生成核心流程页面",
    },
    {
      operation: "create_file",
      path: "/src/pages/DetailPage.tsx",
      content:
        "import { registrations } from '../data/mock-data';\nexport function DetailPage() { return <section><h1>报名详情</h1>{registrations.map((item)=><article key={item.id}><strong>{item.studentName}</strong><p>{item.activityName}</p><p>{item.reminder}</p></article>)}</section>; }",
      reason: "生成详情页面",
    },
    {
      operation: "create_file",
      path: "/src/components/StatusBadge.tsx",
      content:
        "export function StatusBadge({ status }: { status: string }) { return <span className=\"status-badge\">{status}</span>; }",
      reason: "生成状态组件",
    },
    {
      operation: "create_file",
      path: "/src/components/MetricCard.tsx",
      content:
        "export function MetricCard({ label, value }: { label: string; value: number }) { return <div className=\"metric-card\"><span>{label}</span><strong>{value}</strong></div>; }",
      reason: "生成指标组件",
    },
    {
      operation: "update_file",
      path: "/src/domain/types.ts",
      content:
        "export interface Activity { id: string; name: string; status: string; }\nexport interface Registration { id: string; studentName: string; activityName: string; reminder: string; }",
      reason: "生成领域类型",
    },
    {
      operation: "update_file",
      path: "/src/data/mock-data.ts",
      content: `import type { Activity, Registration } from '../domain/types';
export const activities: Activity[] = [{ id: 'a1', name: '${label}开放日', status: '报名中' }];
export const registrations: Registration[] = [{ id: 'r1', studentName: '李同学', activityName: '${label}开放日', reminder: '明天 09:00 在礼堂签到' }];`,
      reason: "生成 mock 数据",
    },
    {
      operation: "update_file",
      path: "/src/styles.css",
      content:
        ":root{font-family:Inter,system-ui,sans-serif;color:#14213d;background:#f7fafc}body{margin:0}.prototype-shell{min-height:100vh;padding:24px;background:#f7fafc}nav{display:flex;gap:8px;margin-bottom:20px}button{border:0;border-radius:8px;padding:8px 12px;background:#2563eb;color:white}.metric-card,article{border:1px solid #dbe4f0;border-radius:12px;background:white;padding:16px;margin:10px 0}.status-badge{color:#f97316;font-weight:700}",
      reason: "生成业务主题样式",
    },
    {
      operation: "set_entry_file",
      path: "/src/App.tsx",
      reason: "设置 React 入口组件",
    },
  ];
}

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

const DESIGN_CLASS_AND_TABLE_JSON = JSON.stringify({
  models: [
    {
      ...CLASS_MODEL,
      title: "设计类图",
      summary: "设计阶段静态结构",
      classes: CLASS_MODEL.classes.map((item) => ({
        ...item,
        operations: [
          {
            name: "save",
            returnType: "void",
            visibility: "public",
            parameters: [],
          },
        ],
      })),
    },
    {
      diagramKind: "table",
      title: "表关系图",
      summary: "用户与订单表关系",
      notes: [],
      tables: [
        {
          id: "user",
          name: "user",
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
          ],
        },
        {
          id: "order",
          name: "order",
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
            {
              id: "user_id",
              name: "user_id",
              dataType: "INT",
              isPrimaryKey: false,
              isForeignKey: true,
              nullable: false,
              references: { tableId: "user", columnId: "id" },
            },
          ],
        },
      ],
      relationships: [
        {
          id: "rel_user_order_table",
          type: "one-to-many",
          sourceTableId: "user",
          targetTableId: "order",
          label: "1对多",
        },
      ],
    },
  ],
});

function createMockLlmTransport(): LlmTransport {
  return {
    async *streamChatCompletion({ messages, responseFormat }) {
      const prompt = lastPromptText(messages);

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
        const prompt = lastPromptText(messages);
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
        const prompt = lastPromptText(messages);
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

test("api auto-adds class dependency for design table diagrams", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("需求阶段用例模型生成设计阶段顺序图")) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
        assert.match(prompt, /table/);
        yield DESIGN_CLASS_AND_TABLE_JSON;
      },
    },
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
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
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0], CLASS_MODEL],
      selectedDiagrams: ["table"],
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
  assert.deepEqual(snapshot.selectedDiagrams, ["sequence", "class", "table"]);
  assert.deepEqual(
    snapshot.models.map((model: { diagramKind: string }) => model.diagramKind),
    ["sequence", "class", "table"],
  );
  assert.match(
    snapshot.plantUml.find((item: { diagramKind: string }) => item.diagramKind === "table")
      ?.source ?? "",
    /<<FK>>/,
  );

  await app.close();
});

test("api code runs stream multi-stage quality file changes and reuse cached plans", async () => {
  let planCalls = 0;
  let operationCalls = 0;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("规划前端原型的业务应用蓝图")) {
          yield createCodeAppBlueprintJson();
          return;
        }
        if (prompt.includes("制定界面方案")) {
          yield createCodeUiBlueprintJson();
          return;
        }
        if (prompt.includes("提取可直接约束 React 原型实现的视觉参考规格")) {
          assert.ok(Array.isArray(messages.at(-1)?.content));
          assert.match(prompt, /https:\/\/example\.com\/mockup\.png/);
          yield JSON.stringify({
            uiReferenceSpec: {
              layoutStructure: ["左侧导航，右侧业务工作区"],
              navigation: "左侧竖向导航，当前项高亮",
              colorPalette: ["#2563eb", "#f97316", "#f8fafc"],
              componentShapes: ["统计卡片", "业务表格", "状态徽标"],
              informationDensity: "comfortable",
              keyBusinessAreas: ["活动总览", "报名列表"],
              stateExpressions: ["待审核", "已通过", "提醒状态"],
              implementationGuidelines: ["使用左侧导航和卡片式数据区还原设计图"],
              fallbackReason: null,
            },
          });
          return;
        }
        if (prompt.includes("规划文件树")) {
          yield createCodeFilePlanJson();
          return;
        }
        if (prompt.includes("制定一个简短文件实现计划")) {
          planCalls += 1;
          yield JSON.stringify({
            plan: ["生成领域类型和 mock 数据", "实现多页面导航", "补齐页面组件和样式"],
          });
          return;
        }
        if (prompt.includes("资深 React 实现工程师")) {
          operationCalls += 1;
          yield JSON.stringify({
            operations: createQualityCodeOperations(),
          });
          return;
        }
        if (prompt.includes("检查当前 React 原型代码是否还原了设计图")) {
          assert.ok(Array.isArray(messages.at(-1)?.content));
          yield JSON.stringify({
            uiFidelityReport: {
              passed: true,
              matched: ["左侧导航已体现", "业务卡片和表格已体现"],
              missing: [],
              repairSuggestions: [],
              summary: "原型基本贴合界面设计图。",
            },
          });
          return;
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      },
    },
    imageClient: {
      async generateImage({ providerSettings, prompt }) {
        assert.equal(providerSettings.model, "gpt-image-2");
        assert.match(prompt, /draw-ui 风格约束/);
        return {
          content: JSON.stringify({
            imageUrl: "https://example.com/mockup.png",
          }),
        };
      },
    },
  });

  const payload = {
    requirementText: "实验平台根据设计模型生成前端原型。",
    rules: JSON.parse(RULES_JSON).rules,
    designModels: [DESIGN_SEQUENCE_MODEL],
    providerSettings: {
      apiBaseUrl: "https://ai.comfly.chat",
      apiKey: "sk-test",
      model: "gpt-5.5",
    },
    imageProviderSettings: {
      apiBaseUrl: "https://ai.comfly.chat",
      apiKey: "sk-test",
      model: "gpt-image-2",
    },
  };

  const firstStart = await app.inject({
    method: "POST",
    url: "/api/code-runs",
    payload,
  });
  assert.equal(firstStart.statusCode, 202);
  const firstRunId = firstStart.json().runId;
  const firstEvents = await app.inject({
    method: "GET",
    url: `/api/code-runs/${firstRunId}/events`,
  });
  assert.match(firstEvents.body, /"stage":"plan_code"/);
  assert.match(firstEvents.body, /"stage":"analyze_code_product"/);
  assert.match(firstEvents.body, /"stage":"generate_code_ui_mockup"/);
  assert.match(firstEvents.body, /"artifactKind":"uiMockup"/);
  assert.match(firstEvents.body, /"stage":"analyze_code_ui_mockup"/);
  assert.match(firstEvents.body, /"artifactKind":"uiReferenceSpec"/);
  assert.match(firstEvents.body, /"stage":"plan_code_files"/);
  assert.match(firstEvents.body, /"stage":"audit_code_quality"/);
  assert.match(firstEvents.body, /"stage":"verify_code_ui_fidelity"/);
  assert.match(firstEvents.body, /"artifactKind":"uiFidelityReport"/);
  assert.match(firstEvents.body, /"type":"code_file_changed"/);
  assert.match(firstEvents.body, /"path":"\/src\/App.tsx"/);
  assert.match(firstEvents.body, /"type":"completed"/);

  const firstSnapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${firstRunId}`,
    })
  ).json();
  assert.equal(firstSnapshot.status, "completed");
  assert.equal(firstSnapshot.entryFile, "/src/App.tsx");
  assert.equal(firstSnapshot.appBlueprint.pages.length, 3);
  assert.equal(firstSnapshot.uiMockup.status, "completed");
  assert.equal(firstSnapshot.uiMockup.imageUrl, "https://example.com/mockup.png");
  assert.equal(firstSnapshot.uiReferenceSpec.navigation, "左侧竖向导航，当前项高亮");
  assert.equal(firstSnapshot.uiFidelityReport.passed, true);
  assert.equal(firstSnapshot.filePlan.files.length, 10);
  assert.equal(firstSnapshot.qualityDiagnostics.at(-1).passed, true);
  assert.ok(firstSnapshot.files["/src/pages/DashboardPage.tsx"]);
  assert.ok(firstSnapshot.files["/src/pages/RegistrationPage.tsx"]);
  assert.ok(firstSnapshot.files["/src/pages/DetailPage.tsx"]);
  assert.ok(firstSnapshot.files["/src/components/StatusBadge.tsx"]);
  assert.ok(firstSnapshot.files["/src/components/MetricCard.tsx"]);
  assert.ok(firstSnapshot.files["/src/components/WorkspaceShell.tsx"]);
  assert.ok(firstSnapshot.files["/src/domain/types.ts"]);
  assert.ok(firstSnapshot.files["/src/data/mock-data.ts"]);
  assert.equal(firstSnapshot.agentPlan.length, 3);

  const secondStart = await app.inject({
    method: "POST",
    url: "/api/code-runs",
    payload,
  });
  assert.equal(secondStart.statusCode, 202);
  const secondRunId = secondStart.json().runId;
  const secondEvents = await app.inject({
    method: "GET",
    url: `/api/code-runs/${secondRunId}/events`,
  });
  assert.match(secondEvents.body, /"type":"completed"/);
  const secondSnapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${secondRunId}`,
    })
  ).json();
  assert.equal(secondSnapshot.status, "completed");
  assert.equal(planCalls, 1);
  assert.equal(operationCalls, 2);

  await app.close();
});

test("api code run accepts trailing text after UI blueprint JSON", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("规划前端原型的业务应用蓝图")) {
          yield createCodeAppBlueprintJson();
          return;
        }
        if (prompt.includes("制定界面方案")) {
          yield `${createCodeUiBlueprintJson()} 说明：界面方案已生成`;
          return;
        }
        if (prompt.includes("规划文件树")) {
          yield createCodeFilePlanJson();
          return;
        }
        if (prompt.includes("制定一个简短文件实现计划")) {
          yield JSON.stringify({ plan: ["生成页面", "补齐组件", "检查入口"] });
          return;
        }
        if (prompt.includes("资深 React 实现工程师")) {
          yield JSON.stringify({ operations: createQualityCodeOperations("容错输出") });
          return;
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      },
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/code-runs",
    payload: {
      requirementText: "校园活动平台支持活动报名和提醒。",
      rules: JSON.parse(RULES_JSON).rules,
      designModels: [DESIGN_SEQUENCE_MODEL],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/code-runs/${runId}/events`,
  });
  assert.match(events.body, /"stage":"plan_code_ui"/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.match(snapshot.files["/src/data/mock-data.ts"], /容错输出/);

  await app.close();
});

test("api code run fails incomplete UI blueprint JSON clearly", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("规划前端原型的业务应用蓝图")) {
          yield createCodeAppBlueprintJson();
          return;
        }
        if (prompt.includes("制定界面方案")) {
          yield '{"uiBlueprint":';
          return;
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      },
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/code-runs",
    payload: {
      requirementText: "校园活动平台支持活动报名和提醒。",
      rules: JSON.parse(RULES_JSON).rules,
      designModels: [DESIGN_SEQUENCE_MODEL],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/code-runs/${runId}/events`,
  });
  assert.match(events.body, /"type":"failed"/);
  assert.match(events.body, /"stage":"plan_code_ui"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "failed");
  assert.match(snapshot.errorMessage, /Unexpected end of JSON input/);

  await app.close();
});

test("api code run continues when UI mockup image generation fails", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("规划前端原型的业务应用蓝图")) {
          yield createCodeAppBlueprintJson();
          return;
        }
        if (prompt.includes("制定界面方案")) {
          yield createCodeUiBlueprintJson();
          return;
        }
        if (prompt.includes("规划文件树")) {
          yield createCodeFilePlanJson();
          return;
        }
        if (prompt.includes("制定一个简短文件实现计划")) {
          yield JSON.stringify({
            plan: ["生成领域类型", "生成 mock 数据", "实现业务页面"],
          });
          return;
        }
        if (prompt.includes("资深 React 实现工程师")) {
          yield JSON.stringify({
            operations: createQualityCodeOperations("设计图失败后继续"),
          });
          return;
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      },
    },
    imageClient: {
      async generateImage() {
        throw new Error("image quota exceeded");
      },
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/code-runs",
    payload: {
      requirementText: "校园活动平台支持活动报名和提醒。",
      rules: JSON.parse(RULES_JSON).rules,
      designModels: [DESIGN_SEQUENCE_MODEL],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      imageProviderSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "nano-banana-pro",
      },
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/code-runs/${runId}/events`,
  });
  assert.match(events.body, /"artifactKind":"uiMockup"/);
  assert.match(events.body, /设计图生成失败/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.uiMockup.status, "failed");
  assert.match(snapshot.uiMockup.errorMessage, /已根据文字界面方案继续生成代码/);
  assert.match(snapshot.files["/src/data/mock-data.ts"], /设计图失败后继续/);

  await app.close();
});

test("api code runs repair invalid code operation discriminators", async () => {
  let operationCalls = 0;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("规划前端原型的业务应用蓝图")) {
          yield createCodeAppBlueprintJson();
          return;
        }
        if (prompt.includes("制定界面方案")) {
          yield createCodeUiBlueprintJson();
          return;
        }
        if (prompt.includes("规划文件树")) {
          yield createCodeFilePlanJson();
          return;
        }
        if (prompt.includes("制定一个简短文件实现计划")) {
          yield JSON.stringify({
            plan: ["生成领域类型", "生成 mock 数据", "实现业务页面"],
          });
          return;
        }
        if (prompt.includes("资深 React 实现工程师")) {
          operationCalls += 1;
          yield JSON.stringify({
            operations: [
              {
                operation: "bad_operation",
                path: "/src/App.tsx",
                content: "export default function App() { return <main>bad</main>; }",
                reason: "模拟错误 discriminator",
              },
            ],
          });
          return;
        }
        if (prompt.includes("请修复下面不符合代码文件操作协议")) {
          operationCalls += 1;
          yield JSON.stringify({
            operations: createQualityCodeOperations("业务原型"),
          });
          return;
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      },
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/code-runs",
    payload: {
      requirementText: "校园活动平台支持活动报名和提醒。",
      rules: JSON.parse(RULES_JSON).rules,
      designModels: [DESIGN_SEQUENCE_MODEL],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/code-runs/${runId}/events`,
  });
  assert.match(events.body, /repair_code_files/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.match(snapshot.files["/src/data/mock-data.ts"], /业务原型/);
  assert.equal(snapshot.qualityDiagnostics.at(-1).passed, true);
  assert.equal(operationCalls, 2);

  await app.close();
});

test("api document run embeds PlantUML diagrams as PNG files in DOCX", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages }) {
        assert.match(lastPromptText(messages), /需求规格说明书/);
        yield JSON.stringify({
          sections: [
            { level: 1, title: "1 项目引言", body: ["说明项目背景。"] },
            {
              level: 2,
              title: "1.1 总体用例图",
              body: ["总体用例图如下。"],
              diagramKind: "usecase",
            },
          ],
        });
      },
    },
    pngRenderClient: async (artifact) => ({
      png: VALID_PNG,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 1,
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      requirementPlantUml: [
        {
          diagramKind: "usecase",
          source: "@startuml\nactor 用户\n@enduml",
        },
      ],
      requirementSvgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>usecase</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 24,
            durationMs: 1,
          },
        },
      ],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"artifactKind":"document"/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.ok(
    !snapshot.missingArtifacts.some((item: string) => item.startsWith("usecase")),
  );

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
  });
  assert.equal(download.statusCode, 200);
  const entries = extractZipEntries(download.rawPayload);
  const mediaPngs = [...entries.keys()].filter((name) =>
    /^word\/media\/.+\.png$/.test(name),
  );
  assert.ok(mediaPngs.length > 0);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  const relsXml =
    entries.get("word/_rels/document.xml.rels")?.toString("utf8") ?? "";
  assert.match(documentXml, /图 总体用例图/);
  assert.match(relsXml, /media\/.+\.png/);

  await app.close();
});

test("api document run reports missing embeddable image source when only SVG exists", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion() {
        yield JSON.stringify({
          sections: [
            {
              level: 1,
              title: "1 项目引言",
              body: ["说明项目背景。"],
              diagramKind: "usecase",
            },
          ],
        });
      },
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      requirementSvgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>usecase</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 24,
            durationMs: 1,
          },
        },
      ],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.match(snapshot.missingArtifacts.join("；"), /缺少可嵌入图片源/);

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
  });
  const entries = extractZipEntries(download.rawPayload);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  assert.match(documentXml, /当前未生成该图/);

  await app.close();
});

test("api repairs generate_models output when the first model JSON is malformed", async () => {
  let modelAttempts = 0;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);

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
        const prompt = lastPromptText(messages);
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
          const prompt = lastPromptText(messages);

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
        const prompt = lastPromptText(messages);

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
