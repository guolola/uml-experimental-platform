import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalyzeCodeBusinessLogicPrompt,
  buildGenerateCodeAppBlueprintPrompt,
  buildGenerateCodeAgentPlanPrompt,
  buildGenerateCodeFilePlanPrompt,
  buildGenerateCodeFileOperationsPrompt,
  buildGenerateCodeUiIrPrompt,
  buildGenerateCodeSpecPrompt,
  buildGenerateCodeUiBlueprintPrompt,
  buildGenerateCodeUiMockupPrompt,
  buildGenerateDocumentContentPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateModelsPrompt,
  buildRepairDesignModelsPrompt,
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
  assert.match(prompt, /notes 永远是字符串数组/);
  assert.match(prompt, /response\/reply\/result 必须写 return/);
  assert.match(prompt, /classKind 只能使用 entity\|aggregate\|valueObject\|service\|other/);

  const repairPrompt = buildRepairDesignModelsPrompt(
    "用户登录后进入首页",
    [],
    ["sequence"],
    '{"models":[]}',
    "models.0.notes: Required",
  );
  assert.match(repairPrompt, /按错误路径逐项修复/);
  assert.match(repairPrompt, /不要改变原有业务语义/);
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
  const businessLogic = {
    appName: "校园活动平台",
    domainSummary: "面向学生的活动浏览、报名与提醒服务。",
    coreWorkflow: "浏览活动，查看详情，报名并接收提醒。",
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
        fields: ["id:string", "title:string", "status:string"],
        relationships: ["活动包含报名记录"],
      },
    ],
    pageFlows: [
      {
        id: "overview",
        name: "活动总览",
        route: "/",
        purpose: "浏览活动列表",
        actors: ["学生"],
        entryPoints: ["进入系统"],
        userActions: ["筛选活动", "查看详情"],
        states: ["空列表", "可报名", "已满员"],
        sourceRefs: ["activity"],
      },
      {
        id: "detail",
        name: "活动详情",
        route: "/detail",
        purpose: "查看详情并报名",
        actors: ["学生"],
        entryPoints: ["点击活动"],
        userActions: ["提交报名"],
        states: ["未报名", "报名成功"],
        sourceRefs: ["sequence"],
      },
    ],
    stateMachines: [],
    permissions: [],
    edgeCases: ["活动已满时禁止报名"],
    frontendOperations: ["筛选活动", "提交报名", "查看提醒"],
    plantUmlTraceability: ["class:Activity", "sequence:signup"],
  };
  const businessLogicPrompt = buildAnalyzeCodeBusinessLogicPrompt(
    codeContext.requirementText,
    [],
    [],
    [],
  );
  const filePlanPrompt = buildGenerateCodeFilePlanPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
    null,
    null,
    null,
    {},
    [
      {
        name: "react-prototype-quality",
        description: "提升 React 原型质量",
        source: "builtin",
        location: "apps/api/src/code-skills/builtin/react-prototype-quality/SKILL.md",
        appliesTo: ["planning", "implementation"],
        priority: 82,
        reason: "默认启用",
      },
    ],
  );
  const uiMockupPrompt = buildGenerateCodeUiMockupPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
  );
  const operationsPrompt = buildGenerateCodeFileOperationsPrompt(
    codeContext,
    {},
    {
      businessLogic,
      uiBlueprint,
      selectedCodeSkills: [
        {
          alias: "@web-design",
          name: "ui-ux-pro-max",
          description: "ui-ux-pro-max",
          source: "project",
          location: "apps/api/src/code-skills/ui-ux-pro-max/SKILL.md",
          appliesTo: ["implementation", "repair"],
          priority: 100,
          reason: "固定启用",
        },
      ],
      codeSkillInstructions:
        '<code_skill alias="@web-design" name="ui-ux-pro-max">生成完整可运行代码。</code_skill>',
      codeSkillContext: {
        skillName: "ui-ux-pro-max",
        alias: "@web-design",
        query: "校园活动 React",
        designSystem: "## Design System",
        stackGuidelines: "{\"stack\":\"react\"}",
        domainGuidelines: "{\"domain\":\"ux\"}",
        actionResults: [],
        diagnostics: [],
      },
    },
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
  assert.match(businessLogicPrompt, /businessLogic/);
  assert.match(businessLogicPrompt, /PlantUML/);
  assert.match(businessLogicPrompt, /不是 skill/);
  assert.match(businessLogicPrompt, /必须全部是字符串数组/);
  assert.match(businessLogicPrompt, /不要输出对象数组/);
  assert.match(businessLogicPrompt, /coreWorkflow 必须是一个字符串/);
  assert.match(businessLogicPrompt, /status:待审核\|已通过/);
  assert.match(planPrompt, /App、components、domain\/types、data\/mock-data/);
  assert.match(appBlueprintPrompt, /2 到 6 个页面/);
  assert.match(uiBlueprintPrompt, /避免空壳营销页/);
  assert.match(uiMockupPrompt, /draw-ui 风格约束/);
  assert.match(uiIrPrompt, /结构化 UI IR/);
  assert.match(uiIrPrompt, /WorkspaceShell, SidebarNav, TopBar/);
  assert.match(uiMockupPrompt, /真实、具体、贴合业务的示例数据/);
  assert.match(filePlanPrompt, /至少 2 个 \/src\/pages/);
  assert.match(filePlanPrompt, /至少 3 个 \/src\/components/);
  assert.match(filePlanPrompt, /当前启用的 Code Skills/);
  assert.match(operationsPrompt, /每个操作必须使用字段 operation/);
  assert.match(operationsPrompt, /operation, path, content, reason, message/);
  assert.match(operationsPrompt, /不能使用 type、action、op、kind/);
  assert.match(operationsPrompt, /businessLogic\.pageFlows/);
  assert.match(operationsPrompt, /\/src\/domain\/types\.ts/);
  assert.match(operationsPrompt, /\/src\/data\/mock-data\.ts/);
  assert.match(operationsPrompt, /不能默认套 UML 实验平台风格/);
  assert.match(operationsPrompt, /ui-ux-pro-max Skill（主设计执行上下文）/);
  assert.match(operationsPrompt, /Skill action 查询结果（必须优先使用）/);
  assert.match(operationsPrompt, /design-system、react-stack、ux-guidelines/);
  assert.match(operationsPrompt, /ui-ux-pro-max/);
  assert.match(operationsPrompt, /不使用 shadcn stack/);
  assert.match(operationsPrompt, /新链路不生成界面图/);
  assert.match(operationsPrompt, /不要把权限边界、服务边界、过滤条件、函数名、规则溯源等说明性文本直接显示/);
  assert.match(operationsPrompt, /不要为了这些说明性业务规则创建 \/src\/docs\/\*/);

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

test("document content prompt forbids unprovided school and personal names", () => {
  const prompt = buildGenerateDocumentContentPrompt("requirementsSpec", {
    requirementText: "系统支持用户注册和登录。",
  });

  assert.match(prompt, /不得出现具体大学、学院、教师、班级、学号、姓名/);
  assert.match(prompt, /未由用户输入明确提供/);
  assert.match(prompt, /待填写/);
  assert.match(prompt, /当前阶段未明确/);
});
