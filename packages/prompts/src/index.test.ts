import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGenerateCodeAppBlueprintPrompt,
  buildGenerateCodeAgentPlanPrompt,
  buildGenerateCodeFilePlanPrompt,
  buildGenerateCodeFileOperationsPrompt,
  buildGenerateCodeUiIrPrompt,
  buildGenerateCodeSpecPrompt,
  buildGenerateCodeUiBlueprintPrompt,
  buildGenerateCodeUiMockupPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateModelsPrompt,
  buildRepairModelsPrompt,
} from "./index.js";

test("requirement model prompts include requirement-stage responsibilities", () => {
  const prompt = buildGenerateModelsPrompt("用户登录后进入首页", [], [
    "usecase",
    "class",
    "activity",
    "deployment",
  ]);

  assert.match(prompt, /需求阶段模型职责/);
  assert.match(prompt, /用例模型\(usecase\): 明确系统边界/);
  assert.match(prompt, /领域概念模型\(class\): 建立领域模型/);
  assert.match(prompt, /界面关系\(activity\): 描述 UI 的跳转逻辑与页面状态流转/);
  assert.match(prompt, /部署模型\(deployment\): 描述物理架构、网络拓扑、服务器节点及通信协议/);
});

test("requirement repair prompt preserves requirement-stage responsibilities", () => {
  const prompt = buildRepairModelsPrompt(
    "用户登录后进入首页",
    [],
    ["activity"],
    '{"models":[]}',
    "models.0.nodes: Required",
  );

  assert.match(prompt, /需求阶段模型职责/);
  assert.match(prompt, /界面关系\(activity\): 描述 UI 的跳转逻辑与页面状态流转/);
});

test("design model prompt keeps design-stage activity semantics", () => {
  const prompt = buildGenerateDesignModelsPrompt(
    "用户登录后进入首页",
    [],
    [],
    {
      diagramKind: "sequence",
      title: "顺序图",
      summary: "动态行为",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    },
    ["activity"],
  );

  assert.match(prompt, /设计阶段模型职责/);
  assert.match(prompt, /活动图\(activity\): 业务逻辑层，描述全局业务逻辑的流转、并行与分支/);
  assert.match(prompt, /activity 表达业务逻辑层，不表达页面跳转说明/);
});

test("code generation prompts use business background theme and modular files", () => {
  const codeContext = {
    requirementText: "校园活动平台支持活动浏览、报名和提醒邮件。",
    rules: [],
    designModels: [],
  };

  const specPrompt = buildGenerateCodeSpecPrompt(
    codeContext.requirementText,
    [],
    [],
  );
  const planPrompt = buildGenerateCodeAgentPlanPrompt(codeContext, {
    "/src/App.tsx": "",
  });
  const appBlueprintPrompt = buildGenerateCodeAppBlueprintPrompt(
    codeContext.requirementText,
    [],
    [],
  );
  const appBlueprint = {
    appName: "校园活动平台",
    domain: "校园活动",
    targetUsers: ["学生"],
    coreWorkflow: "浏览活动并报名",
    pages: [
      {
        id: "overview",
        name: "活动总览",
        route: "/",
        purpose: "查看活动",
        sourceDiagramIds: [],
      },
      {
        id: "detail",
        name: "活动详情",
        route: "/detail",
        purpose: "查看详情",
        sourceDiagramIds: [],
      },
    ],
    successCriteria: ["能完成活动浏览和报名"],
  };
  const uiBlueprint = {
    theme: {
      name: "校园活动",
      primaryColor: "#2563eb",
      backgroundColor: "#f8fafc",
      surfaceColor: "#ffffff",
      textColor: "#0f172a",
      accentColor: "#f97316",
      density: "comfortable" as const,
      tone: "清爽",
    },
    visualLanguage: "校园服务风格",
    navigationModel: "页面切换",
    layoutPrinciples: ["信息清晰"],
    componentGuidelines: ["状态明确"],
    stateGuidelines: ["保留空状态"],
  };
  const uiBlueprintPrompt = buildGenerateCodeUiBlueprintPrompt(
    codeContext,
    appBlueprint,
  );
  const filePlanPrompt = buildGenerateCodeFilePlanPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
    null,
    null,
    null,
    {},
  );
  const uiMockupPrompt = buildGenerateCodeUiMockupPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
  );
  const operationsPrompt = buildGenerateCodeFileOperationsPrompt(
    codeContext,
    ["实现校园活动原型"],
    {},
    { appBlueprint, uiBlueprint, uiReferenceSpec: null, filePlan: null },
  );
  const uiIrPrompt = buildGenerateCodeUiIrPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
    null,
    null,
  );

  assert.match(specPrompt, /theme 必须描述业务领域主题/);
  assert.match(specPrompt, /不是 UML 实验平台主题/);
  assert.match(planPrompt, /App、components、domain\/types、data\/mock-data/);
  assert.match(appBlueprintPrompt, /2 到 6 个页面/);
  assert.match(uiBlueprintPrompt, /避免空壳营销页/);
  assert.match(uiMockupPrompt, /draw-ui 风格约束/);
  assert.match(uiIrPrompt, /结构化 UI IR/);
  assert.match(uiIrPrompt, /WorkspaceShell, SidebarNav, TopBar/);
  assert.match(uiMockupPrompt, /真实、具体、贴合业务的示例数据/);
  assert.match(filePlanPrompt, /至少 2 个 \/src\/pages/);
  assert.match(filePlanPrompt, /至少 3 个 \/src\/components/);
  assert.match(operationsPrompt, /每个操作必须使用字段 operation/);
  assert.match(operationsPrompt, /operation, path, content, reason, message/);
  assert.match(operationsPrompt, /不能使用 type、action、op、kind/);
  assert.match(operationsPrompt, /文件计划中的所有 \/src\/pages/);
  assert.match(operationsPrompt, /\/src\/domain\/types\.ts/);
  assert.match(operationsPrompt, /\/src\/data\/mock-data\.ts/);
  assert.match(operationsPrompt, /不能默认套 UML 实验平台风格/);

  const longUiMockupPrompt = buildGenerateCodeUiMockupPrompt(
    {
      requirementText: "校园活动平台需要覆盖复杂审批、通知、统计和运营配置。".repeat(5000),
      rules: Array.from({ length: 80 }, (_, index) => ({
        id: `r${index + 1}`,
        category: "功能需求",
        text: "需要在界面中展示真实业务数据、筛选条件、状态变化和下一步操作。".repeat(80),
        relatedDiagrams: ["usecase"],
      })),
      designModels: Array.from({ length: 40 }, (_, index) => ({
        diagramKind: "sequence",
        title: `流程 ${index + 1}`,
        summary: "包含复杂参与者、消息和异常分支。".repeat(80),
        participants: [],
        messages: [],
        fragments: [],
      })),
    },
    appBlueprint,
    uiBlueprint,
  );
  assert.ok(longUiMockupPrompt.length <= 24000);
  assert.match(longUiMockupPrompt, /内容已截断/);
});
