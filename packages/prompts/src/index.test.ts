import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalyzeCodeBusinessLogicPrompt,
  buildGenerateCodeAppBlueprintPrompt,
  buildGenerateCodeAgentPlanPrompt,
  buildGenerateCodeFilePlanPrompt,
  buildGenerateCodeFileOperationsPrompt,
  buildGenerateCodeSkillResourceDiscoveryPrompt,
  buildGenerateCodeSkillResourcePlanPrompt,
  buildGenerateCodeVisualDirectionPrompt,
  buildGenerateCodeUiIrPrompt,
  buildGenerateCodeSpecPrompt,
  buildGenerateCodeUiBlueprintPrompt,
  buildGenerateCodeUiMockupPrompt,
  buildGenerateDocumentContentPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateModelsPrompt,
  buildRepairCodeFileOperationsPrompt,
  buildRepairDesignModelsPrompt,
  buildRepairModelsPrompt,
  buildVerifyCodeUiFidelityPrompt,
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
  assert.match(prompt, /JSON 必须完整合法/);
  assert.match(prompt, /sourceId 和 targetId/);
  assert.match(prompt, /port.*字符串/);
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
  assert.match(prompt, /relationships\[\] 必须显式包含 sourceId 和 targetId/);
  assert.match(prompt, /deployment\.relationships\[\]\.port 必须是字符串/);
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
  const visualDirection = {
    productType: "public activity calendar",
    targetAudience: "guests and registered users",
    toneKeywords: ["friendly", "professional"],
    styleKeywords: ["light SaaS", "soft cards"],
    colorMood: "light blue green",
    typographyMood: "clean readable sans-serif",
    layoutMood: "responsive calendar workspace",
    componentTexture: "soft shadows and subtle borders",
    interactionMood: "clear feedback and accessible forms",
    avoidStyles: ["pure black default background"],
    promptBrief: "Friendly public activity calendar with light blue green palette and polished SaaS cards.",
  };
  const skillResourceDiscoveryPlan = {
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    requests: [
      {
        path: "data/styles.csv",
        reason: "理解视觉风格。",
        expectedUse: "选择卡片和浅色主题规则。",
      },
      {
        path: "data/stacks/react.csv",
        reason: "理解 React 实现规则。",
        expectedUse: "保证原型可运行。",
      },
    ],
    diagnostics: [],
  };
  const skillResourcePreviews = {
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    previews: [
      {
        path: "data/styles.csv",
        rowCount: 120,
        headers: ["No", "Category", "Style", "Description"],
        sampleRows: [
          {
            No: "1",
            Category: "Cards",
            Style: "soft SaaS",
            Description: "Light cards with subtle borders",
          },
        ],
        matchedHints: ["calendar"],
        status: "completed" as const,
      },
    ],
    diagnostics: [],
  };
  const operationsPrompt = buildGenerateCodeFileOperationsPrompt(
    codeContext,
    {},
    {
      businessLogic,
      uiBlueprint,
      visualDirection,
      skillResourceDiscoveryPlan,
      skillResourcePreviews,
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
      skillResourcePlan: {
        skillName: "ui-ux-pro-max",
        alias: "@web-design",
        query: "校园活动 React responsive",
        requests: [
          {
            resourceType: "stack",
            name: "react-stack",
            query: "React responsive prototype",
            csvPath: "",
            stack: "react",
            domain: "",
            actionName: "",
            maxResults: 6,
            reason: "获取 React stack 规则。",
          },
        ],
        diagnostics: [],
      },
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
  const repairOperationsPrompt = buildRepairCodeFileOperationsPrompt(
    codeContext,
    {
      "/src/App.tsx": "export default function App() { return null; }",
      "/src/styles.css": ":root{--bg:#050506}body{background:#050506}",
    },
    '{"operations":[]}',
    "缺少主题切换",
    {
      businessLogic,
      visualDirection,
      skillResourceDiscoveryPlan,
      skillResourcePreviews,
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
    },
  );
  const uiIrPrompt = buildGenerateCodeUiIrPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
    null,
    null,
  );
  const skillResourcePlanPrompt = buildGenerateCodeSkillResourcePlanPrompt(
    businessLogic,
    {
      alias: "@web-design",
      aliases: ["@web-design"],
      name: "ui-ux-pro-max",
      description: "UI/UX design intelligence",
      source: "project",
      location: "apps/api/src/code-skills/ui-ux-pro-max/SKILL.md",
      baseDir: "apps/api/src/code-skills/ui-ux-pro-max",
      fileManifest: [
        {
          path: "apps/api/src/code-skills/ui-ux-pro-max/data/stacks/react.csv",
          relativePath: "data/stacks/react.csv",
          kind: "data",
          size: 120,
        },
      ],
      content: "Use search.py and CSV resources for UI/UX guidance.",
      loadedAt: new Date().toISOString(),
    },
    visualDirection,
    skillResourcePreviews,
  );
  const visualDirectionPrompt = buildGenerateCodeVisualDirectionPrompt(
    businessLogic,
    {
      alias: "@web-design",
      aliases: ["@web-design"],
      name: "ui-ux-pro-max",
      description: "UI/UX design intelligence",
      source: "project",
      location: "apps/api/src/code-skills/ui-ux-pro-max/SKILL.md",
      baseDir: "apps/api/src/code-skills/ui-ux-pro-max",
      fileManifest: [],
      content: "UI/UX design intelligence",
      loadedAt: new Date().toISOString(),
    },
  );
  const discoveryPrompt = buildGenerateCodeSkillResourceDiscoveryPrompt(
    businessLogic,
    {
      alias: "@web-design",
      aliases: ["@web-design"],
      name: "ui-ux-pro-max",
      description: "UI/UX design intelligence",
      source: "project",
      location: "apps/api/src/code-skills/ui-ux-pro-max/SKILL.md",
      baseDir: "apps/api/src/code-skills/ui-ux-pro-max",
      fileManifest: [
        {
          path: "apps/api/src/code-skills/ui-ux-pro-max/data/styles.csv",
          relativePath: "data/styles.csv",
          kind: "data",
          size: 100,
        },
      ],
      content: "UI/UX design intelligence",
      loadedAt: new Date().toISOString(),
    },
    visualDirection,
  );
  const verifyFidelityPrompt = buildVerifyCodeUiFidelityPrompt(businessLogic, null, {
    deterministicCheck: {
      fileFacts: [
        "/src/App.tsx 存在并已纳入还原检查上下文。",
        "检测到 4 个页面/功能文件：/src/pages/CalendarPage.tsx。",
      ],
      missing: [],
      repairSuggestions: [],
      routeExpectation:
        "业务路径只要求通过模拟 route state / mock route table / PageKey 体现。",
    },
    criticalFiles: [
      { path: "/src/App.tsx", content: "export default function App() { return null; }" },
      { path: "/src/components/WorkspaceShell.tsx", content: "const routes = ['/calendar'];" },
    ],
    pageFiles: [
      { path: "/src/pages/CalendarPage.tsx", content: "export function CalendarPage() { return <button />; }" },
    ],
    supportingFiles: [
      { path: "/src/data/mock-data.ts", content: "export const events = [];" },
    ],
    omittedFiles: [
      { path: "/BUSINESS_CONTEXT.md", originalLength: 3000, reason: "辅助说明文件省略。" },
    ],
  });

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
  assert.match(operationsPrompt, /Skill 资源查询计划/);
  assert.match(operationsPrompt, /视觉方向（必须执行）/);
  assert.match(operationsPrompt, /Skill 资源预览结果/);
  assert.match(operationsPrompt, /visualDirection\.promptBrief/);
  assert.match(operationsPrompt, /Skill action 查询结果（必须优先使用）/);
  assert.match(operationsPrompt, /skillResourcePlan/);
  assert.match(operationsPrompt, /ui-ux-pro-max/);
  assert.match(operationsPrompt, /不使用 shadcn stack/);
  assert.match(operationsPrompt, /新链路不生成界面图/);
  assert.match(operationsPrompt, /响应式布局/);
  assert.match(operationsPrompt, /默认必须是浅色主题/);
  assert.match(operationsPrompt, /浅色\/深色主题切换控件/);
  assert.match(operationsPrompt, /#050506/);
  assert.match(operationsPrompt, /--bg、--surface、--text、--muted、--primary、--border/);
  assert.match(operationsPrompt, /document\.title/);
  assert.match(operationsPrompt, /内存模拟路由表/);
  assert.match(operationsPrompt, /history\.replaceState/);
  assert.match(operationsPrompt, /SecurityError/);
  assert.match(repairOperationsPrompt, /默认必须修复为浅色主题/);
  assert.match(repairOperationsPrompt, /#050506/);
  assert.match(repairOperationsPrompt, /\[data-theme="dark"\]/);
  assert.match(repairOperationsPrompt, /document\.title/);
  assert.match(repairOperationsPrompt, /BrowserRouter/);
  assert.match(operationsPrompt, /不要把权限边界、服务边界、过滤条件、函数名、规则溯源等说明性文本直接显示/);
  assert.match(operationsPrompt, /\/BUSINESS_CONTEXT\.md/);
  assert.match(operationsPrompt, /不要放到 \/src\/docs\/\*/);
  assert.match(skillResourcePlanPrompt, /自主声明/);
  assert.match(skillResourcePlanPrompt, /Skill 资源预览结果/);
  assert.match(skillResourcePlanPrompt, /headers\/sampleRows/);
  assert.match(skillResourcePlanPrompt, /data\/styles\.csv/);
  assert.match(skillResourcePlanPrompt, /data\/products\.csv/);
  assert.match(skillResourcePlanPrompt, /data\/colors\.csv/);
  assert.match(skillResourcePlanPrompt, /data\/typography\.csv/);
  assert.match(skillResourcePlanPrompt, /data\/\*\*\/\.csv|data\/\*\*\/\*\.csv/);
  assert.match(skillResourcePlanPrompt, /不要声明所有 CSV/);
  assert.match(skillResourcePlanPrompt, /Web React 原型/);
  assert.match(skillResourcePlanPrompt, /data\/app-interface\.csv/);
  assert.match(skillResourcePlanPrompt, /React Native 的 haptics/);
  assert.match(skillResourcePlanPrompt, /React 原型必须至少声明一次 stack=react/);
  assert.match(skillResourcePlanPrompt, /dark-mode 资源，只能用于可选深色主题/);
  assert.match(visualDirectionPrompt, /promptBrief/);
  assert.match(visualDirectionPrompt, /优秀官网 demo/);
  assert.match(visualDirectionPrompt, /Web React/);
  assert.match(discoveryPrompt, /先声明要预览哪些 CSV/);
  assert.match(discoveryPrompt, /data\/styles\.csv/);
  assert.match(discoveryPrompt, /data\/stacks\/react\.csv/);
  assert.match(discoveryPrompt, /禁止预览移动端\/原生端资源/);
  assert.match(verifyFidelityPrompt, /criticalFiles/);
  assert.match(verifyFidelityPrompt, /pageFiles/);
  assert.match(verifyFidelityPrompt, /supportingFiles/);
  assert.match(verifyFidelityPrompt, /omittedFiles/);
  assert.match(verifyFidelityPrompt, /模拟 route state/);
  assert.match(verifyFidelityPrompt, /不得把 omittedFiles 中的辅助文件直接判定为缺失/);
  assert.match(verifyFidelityPrompt, /不得再笼统声称“未包含 App 或具体页面组件”/);

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
