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

function createCodeBusinessLogicJson(appName = "校园活动运营台") {
  return JSON.stringify({
    businessLogic: {
      appName,
      domainSummary: "校园活动平台支持学生浏览活动、报名、查看状态和接收提醒。",
      coreWorkflow: "浏览活动、提交报名、查看报名详情和提醒状态。",
      actors: [
        {
          id: "student",
          name: "学生",
          type: "human",
          responsibilities: ["浏览活动", "提交报名", "查看提醒"],
        },
        {
          id: "admin",
          name: "活动管理员",
          type: "human",
          responsibilities: ["维护活动", "审核报名"],
        },
      ],
      businessEntities: [
        {
          id: "activity",
          name: "活动",
          description: "校园活动信息",
          fields: ["id:string", "title:string", "status:string"],
          relationships: ["活动拥有多个报名记录"],
        },
        {
          id: "registration",
          name: "报名记录",
          description: "学生活动报名记录",
          fields: ["id:string", "activityId:string", "status:string"],
          relationships: ["报名记录属于活动"],
        },
      ],
      pageFlows: [
        {
          id: "overview",
          name: "活动总览",
          route: "/",
          purpose: "查看活动运营指标和推荐活动",
          actors: ["学生", "活动管理员"],
          entryPoints: ["进入系统"],
          userActions: ["查看指标", "筛选活动"],
          states: ["有活动", "空状态"],
          sourceRefs: ["sequence"],
        },
        {
          id: "registration",
          name: "活动报名",
          route: "/registration",
          purpose: "完成活动筛选和报名提交",
          actors: ["学生"],
          entryPoints: ["选择活动"],
          userActions: ["提交报名", "查看报名结果"],
          states: ["可报名", "已满员", "报名成功"],
          sourceRefs: ["sequence"],
        },
        {
          id: "detail",
          name: "报名详情",
          route: "/detail",
          purpose: "查看报名记录、状态和提醒",
          actors: ["学生", "活动管理员"],
          entryPoints: ["打开记录"],
          userActions: ["查看详情", "发送提醒"],
          states: ["待审核", "已通过", "已提醒"],
          sourceRefs: ["sequence"],
        },
      ],
      stateMachines: [
        {
          entity: "报名记录",
          states: ["待审核", "已通过", "已拒绝"],
          transitions: ["提交报名 -> 待审核", "审核通过 -> 已通过"],
        },
      ],
      permissions: [
        {
          actor: "学生",
          allowedActions: ["提交报名", "查看提醒"],
          restrictedActions: ["审核报名"],
        },
      ],
      edgeCases: ["活动已满时禁止报名", "提醒发送失败时展示错误原因"],
      frontendOperations: ["筛选活动", "提交报名", "查看详情", "发送提醒"],
      plantUmlTraceability: ["sequence", "class"],
    },
  });
}

function createCodeBusinessLogicObjectArrayJson(appName = "校园活动运营台") {
  return JSON.stringify({
    businessLogic: {
      appName,
      domainSummary: "校园活动平台支持学生浏览活动、报名、查看状态和接收提醒。",
      coreWorkflow: ["浏览活动", "提交报名", "查看报名详情和提醒状态"],
      actors: [
        {
          id: "student",
          name: "学生",
          type: "human",
          responsibilities: ["浏览活动", "提交报名"],
        },
      ],
      businessEntities: [
        {
          id: "activity",
          name: "活动",
          description: "校园活动信息",
          fields: [
            { name: "id", type: "string", required: true },
            { name: "title", type: "string", description: "活动标题" },
            { name: "status", type: "enum", values: ["可报名", "已满员"] },
          ],
          relationships: [
            {
              source: "活动",
              target: "报名记录",
              type: "one-to-many",
              description: "活动拥有多个报名记录",
            },
          ],
        },
        {
          id: "registration",
          name: "报名记录",
          description: "学生活动报名记录",
          fields: [
            { name: "id", type: "string" },
            { name: "activityId", type: "string" },
            { name: "status", type: "enum", values: ["待审核", "已通过"] },
          ],
          relationships: [
            {
              source: "报名记录",
              target: "活动",
              type: "many-to-one",
              description: "报名记录属于活动",
            },
          ],
        },
      ],
      pageFlows: [
        {
          id: "overview",
          name: "活动总览",
          route: "/",
          purpose: "查看活动运营指标和推荐活动",
          actors: ["学生"],
          entryPoints: ["进入系统"],
          userActions: ["筛选活动"],
          states: ["有活动", "空状态"],
          sourceRefs: ["sequence"],
        },
        {
          id: "registration",
          name: "活动报名",
          route: "/registration",
          purpose: "完成活动筛选和报名提交",
          actors: ["学生"],
          entryPoints: ["选择活动"],
          userActions: ["提交报名"],
          states: ["可报名", "已满员"],
          sourceRefs: ["sequence"],
        },
      ],
      stateMachines: [
        {
          entity: "报名记录",
          states: ["待审核", "已通过", "已拒绝"],
          transitions: [
            { from: "草稿", to: "待审核", action: "提交报名" },
            { from: "待审核", to: "已通过", action: "审核通过" },
          ],
        },
      ],
      permissions: [],
      edgeCases: [
        { condition: "活动已满", description: "禁止报名并提示原因" },
        { condition: "提醒发送失败", description: "展示错误原因" },
      ],
      frontendOperations: [
        { action: "筛选活动", target: "活动列表" },
        { action: "提交报名", target: "报名记录" },
      ],
      plantUmlTraceability: [
        { type: "sequence", source: "submitRegistration", target: "Registration" },
        { type: "class", source: "Activity", target: "Registration" },
      ],
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

function createCodeUiIrJson() {
  return JSON.stringify({
    uiIr: {
      designTokens: {
        colors: {
          primary: "#2563eb",
          background: "#f7fafc",
          surface: "#ffffff",
          text: "#14213d",
          accent: "#f97316",
          success: "#16a34a",
          warning: "#f59e0b",
          danger: "#dc2626",
        },
        typography: {
          body: "14px/1.5 Inter, system-ui",
          heading: "600 22px/1.25 Inter, system-ui",
          label: "600 12px/1.2 Inter, system-ui",
        },
        spacing: { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px" },
        radius: { sm: "4px", md: "8px", lg: "12px" },
        shadow: { sm: "0 1px 2px rgba(15,23,42,.08)", md: "0 8px 24px rgba(15,23,42,.12)" },
        density: "comfortable",
      },
      componentRegistry: {
        components: [
          "WorkspaceShell",
          "SidebarNav",
          "TopBar",
          "MetricCard",
          "DataTable",
          "StatusBadge",
          "FilterBar",
          "ActionButton",
          "DetailPanel",
          "EmptyState",
        ].map((name) => ({
          name,
          description: `${name} 约束校园活动业务原型`,
          props: ["title", "items", "status", "onAction"],
          variants: ["default", "compact"],
          usageRules: ["按 UI IR 组合使用"],
        })),
      },
      pages: [
        {
          id: "overview",
          route: "/",
          name: "活动总览",
          layout: "sidebar-content",
          primaryActions: ["发布活动"],
          componentTree: {
            component: "WorkspaceShell",
            purpose: "承载活动总览",
            props: { title: "校园活动平台" },
            dataBinding: null,
            tokenRefs: ["colors.background", "spacing.4"],
            children: [
              {
                component: "SidebarNav",
                purpose: "展示活动导航",
                props: { activeRoute: "/" },
                dataBinding: "pages",
                tokenRefs: ["colors.primary"],
                children: [],
              },
              {
                component: "MetricCard",
                purpose: "展示活动指标",
                props: { title: "可报名活动" },
                dataBinding: "activities",
                tokenRefs: ["colors.surface", "radius.md"],
                children: [],
              },
            ],
          },
        },
      ],
      dataBindings: ["activities -> MetricCard/DataTable"],
      interactions: ["点击报名提交报名记录"],
      responsiveRules: ["mobile 纵向排列"],
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
        ":root{--color-primary:#2563eb;--space-3:12px;--radius-md:8px;font-family:Inter,system-ui,sans-serif;color:#14213d;background:#f7fafc}body{margin:0}.prototype-shell{min-height:100vh;padding:24px;background:#f7fafc}nav{display:flex;gap:8px;margin-bottom:20px}button{border:0;border-radius:var(--radius-md);padding:8px var(--space-3);background:var(--color-primary);color:white}.metric-card,article{border:1px solid #dbe4f0;border-radius:12px;background:white;padding:16px;margin:10px 0}.status-badge{color:#f97316;font-weight:700}",
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_models" && entry.kind === "llm_output",
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_models" && entry.kind === "parsed_model",
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { stage: string; kind: string; plantUmlSource?: string }) =>
        entry.stage === "generate_plantuml" &&
        entry.kind === "plantuml_source" &&
        /@startuml/.test(entry.plantUmlSource ?? ""),
    ),
  );

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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.ok(
    snapshot.designTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_design_sequence" && entry.kind === "llm_output",
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_design_sequence" && entry.kind === "parsed_model",
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { stage: string; kind: string; plantUmlSource?: string }) =>
        entry.stage === "generate_plantuml" &&
        entry.kind === "plantuml_source" &&
        /@startuml/.test(entry.plantUmlSource ?? ""),
    ),
  );

  await app.close();
});

test("api records design PlantUML repair trace", async () => {
  let renderAttempts = 0;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        if (prompt.includes("请修复下面无法编译或返回占位 SVG 的 PlantUML")) {
          yield JSON.stringify({
            source: [
              "@startuml",
              "actor 用户",
              "用户 -> 系统 : 提交设计请求",
              "@enduml",
            ].join("\n"),
          });
          return;
        }
        assert.equal(responseFormat?.type, "json_schema");
        assert.match(prompt, /设计阶段顺序图/);
        yield DESIGN_SEQUENCE_JSON;
      },
    },
    renderClient: async (artifact) => {
      renderAttempts += 1;
      if (renderAttempts === 1) {
        throw new Error("Syntax Error? (line 4)");
      }
      return {
        svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
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
    url: "/api/design-runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      selectedDiagrams: ["sequence"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.equal(renderAttempts, 2);
  assert.ok(
    snapshot.designTrace.some(
      (entry: { kind: string; errorMessage?: string }) =>
        entry.kind === "render_error" && /Syntax Error/.test(entry.errorMessage ?? ""),
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { kind: string; rawOutput?: string }) =>
        entry.kind === "repair_output" && /提交设计请求/.test(entry.rawOutput ?? ""),
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { kind: string; plantUmlSource?: string }) =>
        entry.kind === "repaired_plantuml" &&
        /提交设计请求/.test(entry.plantUmlSource ?? ""),
    ),
  );

  await app.close();
});

test("api records design model parse repair trace", async () => {
  let designCalls = 0;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("请修复下面不符合要求的设计阶段 UML 结构化模型 JSON 输出")) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
        designCalls += 1;
        yield '{"models":[{"diagramKind":"sequence","title":""}]}';
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.equal(designCalls, 1);
  assert.ok(
    snapshot.designTrace.some(
      (entry: { attempt: number; kind: string; rawOutput?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "llm_output" &&
        /"title":""/.test(entry.rawOutput ?? ""),
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { attempt: number; kind: string; errorMessage?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "parse_error" &&
        /title/.test(entry.errorMessage ?? ""),
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { attempt: number; kind: string }) =>
        entry.attempt === 2 && entry.kind === "parsed_model",
    ),
  );

  await app.close();
});

test("api normalizes common design model shape issues before validation", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        assert.match(prompt, /设计阶段顺序图/);
        yield JSON.stringify({
          models: [
            {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: "由用例推导",
              participants: [
                { id: "user", name: "用户", participantType: "actor" },
                { id: "system", name: "系统", participantType: "control" },
              ],
              messages: [
                {
                  id: "m1",
                  type: "response",
                  sourceId: "system",
                  targetId: "user",
                  name: "返回结果",
                  parameters: "result",
                },
              ],
              fragments: [],
            },
          ],
        });
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.deepEqual(snapshot.models[0].notes, ["由用例推导"]);
  assert.equal(snapshot.models[0].messages[0].type, "return");
  assert.deepEqual(snapshot.models[0].messages[0].parameters, ["result"]);

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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
  let operationCalls = 0;
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("抽取代码生成必须遵守的业务事实")) {
          yield createCodeBusinessLogicJson();
          return;
        }
        if (prompt.includes("请作为产品界面设计师")) {
          yield createCodeUiBlueprintJson();
          return;
        }
        if (prompt.includes("ui-ux-pro-max 主设计执行器")) {
          assert.doesNotMatch(JSON.stringify(responseFormat), /"oneOf"/);
          assert.match(prompt, /ui-ux-pro-max Skill（主设计执行上下文）/);
          assert.match(prompt, /ui-ux-pro-max/);
          operationCalls += 1;
          yield JSON.stringify({
            operations: createQualityCodeOperations(),
          });
          return;
        }
        if (prompt.includes("检查当前 React 原型代码是否覆盖业务逻辑")) {
          yield JSON.stringify({
            uiFidelityReport: {
              passed: true,
              matched: ["页面流程已体现", "业务操作已体现"],
              missing: [],
              repairSuggestions: [],
              summary: "原型基本覆盖业务逻辑和界面方案。",
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
      apiBaseUrl: "https://ai.comfly.org",
      apiKey: "sk-test",
      model: "gpt-5.5",
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
  assert.match(firstEvents.body, /"stage":"analyze_code_business_logic"/);
  assert.match(firstEvents.body, /"artifactKind":"businessLogic"/);
  assert.match(firstEvents.body, /"stage":"plan_code_ui"/);
  assert.doesNotMatch(firstEvents.body, /"stage":"load_web_design_skill"/);
  assert.match(firstEvents.body, /"artifactKind":"codeSkills"/);
  assert.match(firstEvents.body, /"stage":"generate_code_files"/);
  assert.match(firstEvents.body, /"stage":"audit_code_quality"/);
  assert.match(firstEvents.body, /"stage":"verify_code_ui_fidelity"/);
  assert.match(firstEvents.body, /"stage":"verify_code_rendered_preview"/);
  assert.match(firstEvents.body, /"artifactKind":"uiFidelityReport"/);
  assert.doesNotMatch(firstEvents.body, /generate_code_ui_mockup/);
  assert.doesNotMatch(firstEvents.body, /generate_code_ui_ir/);
  assert.doesNotMatch(firstEvents.body, /plan_code_files/);
  assert.doesNotMatch(firstEvents.body, /plan_code"/);
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
  assert.equal(firstSnapshot.businessLogic.pageFlows.length, 3);
  assert.equal(firstSnapshot.loadedCodeSkill.alias, "@web-design");
  assert.equal(firstSnapshot.codeSkillContext.skillName, "ui-ux-pro-max");
  assert.ok(firstSnapshot.codeSkillContext.actionResults.length >= 3);
  assert.equal(firstSnapshot.uiBlueprint, null);
  assert.equal(firstSnapshot.uiMockup, null);
  assert.equal(firstSnapshot.uiReferenceSpec, null);
  assert.equal(firstSnapshot.uiIr, null);
  assert.equal(firstSnapshot.uiFidelityReport.passed, true);
  assert.ok(
    firstSnapshot.selectedCodeSkills.some(
      (skill: { alias: string; name: string }) =>
        skill.alias === "@web-design" && skill.name === "ui-ux-pro-max",
    ),
  );
  assert.equal(firstSnapshot.qualityDiagnostics.at(-1).passed, true);
  assert.ok(firstSnapshot.files["/src/pages/DashboardPage.tsx"]);
  assert.ok(firstSnapshot.files["/src/pages/RegistrationPage.tsx"]);
  assert.ok(firstSnapshot.files["/src/pages/DetailPage.tsx"]);
  assert.ok(firstSnapshot.files["/src/components/StatusBadge.tsx"]);
  assert.ok(firstSnapshot.files["/src/components/MetricCard.tsx"]);
  assert.ok(firstSnapshot.files["/src/components/WorkspaceShell.tsx"]);
  assert.ok(firstSnapshot.files["/src/domain/types.ts"]);
  assert.ok(firstSnapshot.files["/src/data/mock-data.ts"]);
  assert.equal(firstSnapshot.agentPlan.length, 0);

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

  const regenerateStart = await app.inject({
    method: "POST",
    url: "/api/code-runs",
    payload: {
      ...payload,
      generationMode: "regenerate",
      existingFiles: {
        "/src/App.tsx": "export default function App() { return <main>旧原型</main>; }",
      },
    },
  });
  assert.equal(regenerateStart.statusCode, 202);
  const regenerateRunId = regenerateStart.json().runId;
  const regenerateEvents = await app.inject({
    method: "GET",
    url: `/api/code-runs/${regenerateRunId}/events`,
  });
  assert.match(regenerateEvents.body, /"type":"completed"/);
  const regenerateSnapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${regenerateRunId}`,
    })
  ).json();
  assert.equal(regenerateSnapshot.status, "completed");
  assert.equal(regenerateSnapshot.generationMode, "regenerate");
  assert.doesNotMatch(regenerateSnapshot.files["/src/App.tsx"], /旧原型/);
  assert.equal(operationCalls, 3);

  await app.close();
});

test("api code run normalizes object-array business logic fields", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("抽取代码生成必须遵守的业务事实")) {
          yield createCodeBusinessLogicObjectArrayJson();
          return;
        }
        if (prompt.includes("请作为产品界面设计师")) {
          yield createCodeUiBlueprintJson();
          return;
        }
        if (prompt.includes("ui-ux-pro-max 主设计执行器")) {
          yield JSON.stringify({
            operations: createQualityCodeOperations("对象数组归一化"),
          });
          return;
        }
        if (prompt.includes("检查当前 React 原型代码是否覆盖业务逻辑")) {
          yield JSON.stringify({
            uiFidelityReport: {
              passed: true,
              matched: ["业务逻辑字段已归一化"],
              missing: [],
              repairSuggestions: [],
              summary: "通过。",
            },
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.match(events.body, /"stage":"analyze_code_business_logic"/);
  assert.match(events.body, /"stage":"plan_code_ui"/);
  assert.doesNotMatch(events.body, /"stage":"load_web_design_skill"/);
  assert.match(events.body, /"stage":"generate_code_files"/);
  assert.doesNotMatch(events.body, /invalid_type/);
  assert.doesNotMatch(events.body, /generate_code_ui_mockup/);
  assert.doesNotMatch(events.body, /generate_code_ui_ir/);
  assert.doesNotMatch(events.body, /plan_code_files/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.equal(typeof snapshot.businessLogic.coreWorkflow, "string");
  assert.match(snapshot.businessLogic.coreWorkflow, /浏览活动/);
  assert.equal(typeof snapshot.businessLogic.businessEntities[0].fields[0], "string");
  assert.equal(
    typeof snapshot.businessLogic.businessEntities[0].relationships[0],
    "string",
  );
  assert.equal(typeof snapshot.businessLogic.stateMachines[0].transitions[0], "string");
  assert.equal(typeof snapshot.businessLogic.edgeCases[0], "string");
  assert.equal(typeof snapshot.businessLogic.frontendOperations[0], "string");
  assert.equal(typeof snapshot.businessLogic.plantUmlTraceability[0], "string");
  assert.match(snapshot.businessLogic.businessEntities[0].fields[0], /id/);
  assert.match(snapshot.businessLogic.stateMachines[0].transitions[0], /提交报名/);

  await app.close();
});

test("api code run accepts trailing text after UI blueprint JSON", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("抽取代码生成必须遵守的业务事实")) {
          yield createCodeBusinessLogicJson();
          return;
        }
        if (prompt.includes("请作为产品界面设计师")) {
          yield `${createCodeUiBlueprintJson()} 说明：界面方案已生成`;
          return;
        }
        if (prompt.includes("ui-ux-pro-max 主设计执行器")) {
          yield JSON.stringify({ operations: createQualityCodeOperations("容错输出") });
          return;
        }
        if (prompt.includes("检查当前 React 原型代码是否覆盖业务逻辑")) {
          yield JSON.stringify({
            uiFidelityReport: {
              passed: true,
              matched: ["已覆盖业务流程"],
              missing: [],
              repairSuggestions: [],
              summary: "通过。",
            },
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
        apiBaseUrl: "https://ai.comfly.org",
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

test("api code run does not call a separate UI blueprint stage", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("抽取代码生成必须遵守的业务事实")) {
          yield createCodeBusinessLogicJson();
          return;
        }
        if (prompt.includes("请作为产品界面设计师")) {
          throw new Error("UI blueprint prompt should not be called");
        }
        if (prompt.includes("ui-ux-pro-max 主设计执行器")) {
          yield JSON.stringify({
            operations: createQualityCodeOperations("无独立界面方案"),
          });
          return;
        }
        if (prompt.includes("检查当前 React 原型代码是否覆盖业务逻辑")) {
          yield JSON.stringify({
            uiFidelityReport: {
              passed: true,
              matched: ["已覆盖业务流程"],
              missing: [],
              repairSuggestions: [],
              summary: "通过。",
            },
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.match(events.body, /"artifactKind":"codeSkills"/);
  assert.doesNotMatch(events.body, /UI blueprint prompt should not be called/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.uiBlueprint, null);
  assert.match(snapshot.files["/src/data/mock-data.ts"], /无独立界面方案/);

  await app.close();
});

test("api code run continues when UI mockup image generation fails", async () => {
  const app = await createApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, responseFormat }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, "json_schema");
        if (prompt.includes("抽取代码生成必须遵守的业务事实")) {
          yield createCodeBusinessLogicJson();
          return;
        }
        if (prompt.includes("请作为产品界面设计师")) {
          yield createCodeUiBlueprintJson();
          return;
        }
        if (prompt.includes("ui-ux-pro-max 主设计执行器")) {
          yield JSON.stringify({
            operations: createQualityCodeOperations("设计图失败后继续"),
          });
          return;
        }
        if (prompt.includes("检查当前 React 原型代码是否覆盖业务逻辑")) {
          yield JSON.stringify({
            uiFidelityReport: {
              passed: true,
              matched: ["已覆盖业务流程"],
              missing: [],
              repairSuggestions: [],
              summary: "通过。",
            },
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.doesNotMatch(events.body, /"artifactKind":"uiMockup"/);
  assert.doesNotMatch(events.body, /generate_code_ui_mockup/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/code-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.uiMockup, null);
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
        if (prompt.includes("抽取代码生成必须遵守的业务事实")) {
          yield createCodeBusinessLogicJson();
          return;
        }
        if (prompt.includes("请作为产品界面设计师")) {
          yield createCodeUiBlueprintJson();
          return;
        }
        if (prompt.includes("ui-ux-pro-max 主设计执行器")) {
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
        if (prompt.includes("检查当前 React 原型代码是否覆盖业务逻辑")) {
          yield JSON.stringify({
            uiFidelityReport: {
              passed: true,
              matched: ["已覆盖业务流程"],
              missing: [],
              repairSuggestions: [],
              summary: "通过。",
            },
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
        apiBaseUrl: "https://ai.comfly.org",
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
            {
              level: 1,
              title: "1 项目引言",
              body: ["说明项目背景，禁止写入成都信息工程大学 软件工程学院等模板外机构名。"],
            },
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.doesNotMatch(documentXml, /成都信息工程大学/);
  assert.doesNotMatch(documentXml, /软件工程学院/);
  assert.match(documentXml, /课程设计文档/);
  assert.match(documentXml, /项目名称：待填写/);
  assert.match(documentXml, /文档类型：需求规格说明书/);
  assert.match(documentXml, /生成日期：\d{4}-\d{2}-\d{2}/);
  assert.match(documentXml, /图 总体用例图/);
  assert.match(relsXml, /media\/.+\.png/);

  await app.close();
});

test("api software design document uses generic cover without school names", async () => {
  const app = await createApiServer();

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    payload: {
      documentKind: "softwareDesignSpec",
      requirementText: "根据设计产物生成软件设计说明书。",
      rules: [],
      requirementModels: [],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      useAiText: false,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"type":"completed"/);

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
  });
  assert.equal(download.statusCode, 200);
  const entries = extractZipEntries(download.rawPayload);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  assert.doesNotMatch(documentXml, /成都信息工程大学/);
  assert.doesNotMatch(documentXml, /软件工程学院/);
  assert.match(documentXml, /课程设计文档/);
  assert.match(documentXml, /项目名称：待填写/);
  assert.match(documentXml, /文档类型：软件设计说明书/);

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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string; rawOutput?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "llm_output" &&
        /模型已生成/.test(entry.rawOutput ?? ""),
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string; errorMessage?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "parse_error" &&
        /notes/.test(entry.errorMessage ?? ""),
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string }) =>
        entry.attempt === 2 && entry.kind === "parsed_model",
    ),
  );

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
        apiBaseUrl: "https://ai.comfly.org",
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
          apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { kind: string; errorMessage?: string }) =>
        entry.kind === "render_error" && /Syntax Error/.test(entry.errorMessage ?? ""),
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { kind: string; rawOutput?: string }) =>
        entry.kind === "repair_output" && /研究人员 --> 生成模型/.test(entry.rawOutput ?? ""),
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { kind: string; plantUmlSource?: string }) =>
        entry.kind === "repaired_plantuml" &&
        /研究人员 --> 生成模型/.test(entry.plantUmlSource ?? ""),
    ),
  );

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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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
        apiBaseUrl: "https://ai.comfly.org",
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

test("api exposes version details under root and /api for deployment checks", async () => {
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

  const rootVersion = await app.inject({
    method: "GET",
    url: "/version",
  });
  const apiVersion = await app.inject({
    method: "GET",
    url: "/api/version",
  });

  assert.equal(rootVersion.statusCode, 200);
  assert.equal(apiVersion.statusCode, 200);

  for (const payload of [rootVersion.json(), apiVersion.json()]) {
    assert.equal(payload.status, "ok");
    assert.equal(payload.renderServiceBaseUrl, "http://127.0.0.1:4002");
    assert.equal(payload.features.supportsDesignTableDiagram, true);
    assert.equal(typeof payload.runtimeCwd, "string");
    assert.ok(payload.runtimeCwd.length > 0);
    assert.equal(typeof payload.startedAt, "string");
  }

  await app.close();
});

test("api applies the configured CORS origin allowlist", async () => {
  const originalCorsOrigins = process.env.API_CORS_ORIGINS;
  process.env.API_CORS_ORIGINS = "https://app.example.com,http://localhost:5173";

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

  try {
    const allowed = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://app.example.com" },
    });
    const blocked = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://evil.example.com" },
    });

    assert.equal(allowed.statusCode, 200);
    assert.equal(
      allowed.headers["access-control-allow-origin"],
      "https://app.example.com",
    );
    assert.equal(blocked.statusCode, 200);
    assert.equal(blocked.headers["access-control-allow-origin"], undefined);
  } finally {
    await app.close();
    if (originalCorsOrigins === undefined) {
      delete process.env.API_CORS_ORIGINS;
    } else {
      process.env.API_CORS_ORIGINS = originalCorsOrigins;
    }
  }
});

