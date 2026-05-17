import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWebDesignSkillForPrompt,
  fallbackCodeSkillResourceDiscoveryPlan,
  fallbackCodeSkillResourcePlan,
  fallbackCodeVisualDirection,
  getCodeSkillRuntimeStatus,
  loadWebDesignSkill,
  resolveCodeSkillContext,
  resolveCodeSkillResourcePreviews,
  toWebDesignSkillSelection,
} from "./code-skills.js";

test("loads @web-design as the fixed frontend code generation skill", () => {
  const result = loadWebDesignSkill();
  assert.equal(result.skill.alias, "@web-design");
  assert.equal(result.skill.name, "ui-ux-pro-max");
  assert.equal(result.skill.source, "project");
  assert.match(result.skill.location, /code-skills[\\/]ui-ux-pro-max[\\/]SKILL\.md$/);
  assert.match(result.skill.content, /UI\/UX Pro Max/i);
  assert.match(result.skill.baseDir, /code-skills[\\/]ui-ux-pro-max$/);
  assert.ok(result.skill.fileManifest.some((file) => file.relativePath === "SKILL.md"));
  assert.ok(result.skill.fileManifest.some((file) => file.relativePath === "skill.actions.json"));
  assert.ok(result.skill.fileManifest.some((file) => file.relativePath.replaceAll("\\", "/") === "scripts/search.py"));
  assert.equal(getCodeSkillRuntimeStatus().hasUiUxProMaxSkill, true);

  const selection = toWebDesignSkillSelection(result.skill);
  assert.equal(selection.alias, "@web-design");
  assert.equal(selection.name, "ui-ux-pro-max");
  assert.equal(selection.priority, 100);
  assert.ok(selection.appliesTo.includes("implementation"));

  const promptText = formatWebDesignSkillForPrompt(result.skill);
  assert.match(promptText, /<code_skill alias="@web-design" name="ui-ux-pro-max"/);
  assert.match(promptText, /<skill_files>/);
  assert.match(promptText, /<\/code_skill>/);
});

test("resolves ui-ux-pro-max context from model-declared skill resource plan", async () => {
  const result = loadWebDesignSkill();
  const businessLogic = {
    appName: "校园活动管理平台",
    domainSummary: "面向学生和管理员的活动浏览、报名、审核与统计平台。",
    coreWorkflow: "学生浏览活动并报名，管理员审核报名并查看活动统计。",
    actors: [
      {
        id: "student",
        name: "学生",
        type: "human",
        responsibilities: ["浏览活动", "报名活动"],
      },
    ],
    businessEntities: [
      {
        id: "activity",
        name: "活动",
        description: "校园活动",
        fields: ["id:string", "title:string", "status:string"],
        relationships: ["活动包含报名记录"],
      },
    ],
    pageFlows: [
      {
        id: "dashboard",
        name: "活动统计",
        route: "/",
        purpose: "查看活动趋势与报名指标",
        actors: ["管理员"],
        entryPoints: ["登录后进入"],
        userActions: ["筛选活动", "查看趋势"],
        states: ["加载中", "有数据", "空状态"],
        sourceRefs: ["activity"],
      },
    ],
    stateMachines: [],
    permissions: [],
    edgeCases: ["活动已满时禁止报名"],
    frontendOperations: ["筛选活动", "查看统计图表", "提交报名"],
    plantUmlTraceability: ["class:Activity"],
  };
  const plan = fallbackCodeSkillResourcePlan(result.skill, businessLogic);
  const context = await resolveCodeSkillContext(result.skill, plan);

  assert.equal(context.skillName, "ui-ux-pro-max");
  assert.match(context.query, /校园活动管理平台/);
  assert.ok(context.actionResults.some((action) => action.name === "design-system"));
  assert.ok(context.actionResults.some((action) => action.name === "react-stack"));
  assert.ok(context.actionResults.some((action) => action.name === "ux-guidelines"));
  assert.ok(context.actionResults.some((action) => action.name === "chart-guidelines"));
  assert.match(context.designSystem, /Bauhaus|design|style/i);
  assert.match(context.stackGuidelines, /useState|React|State/i);

  const promptText = formatWebDesignSkillForPrompt(result.skill, plan, context);
  assert.match(promptText, /<skill_resource_plan>/);
  assert.match(promptText, /<skill_context>/);
  assert.match(promptText, /design-system/);
});

test("rejects skill resource path traversal and does not query undeclared chart resources", async () => {
  const result = loadWebDesignSkill();
  const plan = {
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    query: "simple React form",
    requests: [
      {
        resourceType: "stack" as const,
        name: "react-stack",
        query: "React form",
        csvPath: "",
        stack: "react",
        domain: "",
        actionName: "",
        maxResults: 5,
        reason: "React rules only.",
      },
      {
        resourceType: "csv" as const,
        name: "bad-path",
        query: "secret",
        csvPath: "../secret.csv",
        stack: "",
        domain: "",
        actionName: "",
        maxResults: 5,
        reason: "simulate bad path",
      },
    ],
    diagnostics: [],
  };
  const context = await resolveCodeSkillContext(result.skill, plan);
  assert.ok(context.actionResults.some((action) => action.name === "react-stack"));
  assert.ok(context.actionResults.some((action) => action.name === "bad-path" && action.status === "failed"));
  assert.ok(!context.actionResults.some((action) => action.name === "chart-guidelines"));
});

test("filters mobile and React Native resources from Web React skill context", async () => {
  const result = loadWebDesignSkill();
  const plan = {
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    query: "modern enterprise SaaS public calendar React responsive accessible light theme",
    requests: [
      {
        resourceType: "csv" as const,
        name: "web-styles",
        query: "modern enterprise SaaS mobile React Native Expo haptics",
        csvPath: "data/styles.csv",
        stack: "",
        domain: "",
        actionName: "",
        maxResults: 8,
        reason: "Should only return web/general style rows for this Web React prototype.",
      },
      {
        resourceType: "csv" as const,
        name: "mobile-draft",
        query: "Modern Enterprise SaaS Mobile React Native",
        csvPath: "data/draft.csv",
        stack: "",
        domain: "",
        actionName: "",
        maxResults: 5,
        reason: "simulate a model-declared mobile-only draft resource",
      },
      {
        resourceType: "csv" as const,
        name: "native-interface",
        query: "React Native accessibilityLabel haptics",
        csvPath: "data/app-interface.csv",
        stack: "",
        domain: "",
        actionName: "",
        maxResults: 5,
        reason: "simulate native-only app interface resource",
      },
    ],
    diagnostics: [],
  };

  const context = await resolveCodeSkillContext(result.skill, plan);
  const webStyles = context.actionResults.find((action) => action.name === "web-styles");
  assert.equal(webStyles?.status, "completed");
  assert.doesNotMatch(webStyles?.stdout ?? "", /React Native|Expo|Haptics|Modern Enterprise SaaS \(Mobile\)/i);
  assert.ok(context.actionResults.some((action) => action.name === "mobile-draft" && action.status === "failed"));
  assert.ok(context.actionResults.some((action) => action.name === "native-interface" && action.status === "failed"));
  assert.ok(
    context.diagnostics.some((diagnostic) =>
      diagnostic.message.includes("mobile/native-only"),
    ),
  );
});

test("previews skill CSV resources before final resource selection", () => {
  const result = loadWebDesignSkill();
  const businessLogic = {
    appName: "公众活动日历",
    domainSummary: "公开活动浏览、注册申请和提醒。",
    coreWorkflow: "游客浏览公开活动并提交注册申请。",
    actors: [],
    businessEntities: [],
    pageFlows: [],
    stateMachines: [],
    permissions: [],
    edgeCases: [],
    frontendOperations: ["浏览活动", "提交申请"],
    plantUmlTraceability: [],
  };
  const visualDirection = fallbackCodeVisualDirection(businessLogic);
  const discoveryPlan = fallbackCodeSkillResourceDiscoveryPlan(result.skill);
  const previews = resolveCodeSkillResourcePreviews(
    result.skill,
    discoveryPlan,
    visualDirection.promptBrief,
  );

  assert.equal(previews.skillName, "ui-ux-pro-max");
  assert.ok(previews.previews.some((preview) => preview.path === "data/styles.csv"));
  const styles = previews.previews.find((preview) => preview.path === "data/styles.csv");
  assert.equal(styles?.status, "completed");
  assert.ok((styles?.headers.length ?? 0) > 0);
  assert.ok((styles?.sampleRows.length ?? 0) > 0);
});

test("rejects mobile-only CSV resources during preview", () => {
  const result = loadWebDesignSkill();
  const previews = resolveCodeSkillResourcePreviews(
    result.skill,
    {
      skillName: "ui-ux-pro-max",
      alias: "@web-design",
      requests: [
        {
          path: "data/draft.csv",
          reason: "simulate native draft request",
          expectedUse: "should be blocked",
        },
        {
          path: "data/app-interface.csv",
          reason: "simulate native interface request",
          expectedUse: "should be blocked",
        },
      ],
      diagnostics: [],
    },
    "mobile native haptics",
  );

  assert.ok(previews.previews.every((preview) => preview.status === "failed"));
  assert.ok(
    previews.diagnostics.some((diagnostic) =>
      diagnostic.message.includes("mobile/native-only"),
    ),
  );
});
