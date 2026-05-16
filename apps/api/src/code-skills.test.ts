import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWebDesignSkillForPrompt,
  loadWebDesignSkill,
  resolveCodeSkillContext,
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

test("resolves ui-ux-pro-max action context from declared skill actions", async () => {
  const result = loadWebDesignSkill();
  const context = await resolveCodeSkillContext(result.skill, {
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
  });

  assert.equal(context.skillName, "ui-ux-pro-max");
  assert.match(context.query, /校园活动管理平台/);
  assert.ok(context.actionResults.some((action) => action.name === "design-system"));
  assert.ok(context.actionResults.some((action) => action.name === "react-stack"));
  assert.ok(context.actionResults.some((action) => action.name === "ux-guidelines"));
  assert.ok(context.actionResults.some((action) => action.name === "chart-guidelines"));

  const promptText = formatWebDesignSkillForPrompt(result.skill, context);
  assert.match(promptText, /<skill_context>/);
  assert.match(promptText, /design-system/);
});
