import assert from "node:assert/strict";
import test from "node:test";
import {
  diagramModelsResultSchema,
  designRunSnapshotSchema,
  designTraceEntrySchema,
  designDiagramModelsResultSchema,
  codeRunSnapshotSchema,
  codeSkillActionSchema,
  codeSkillContextSchema,
  codeSkillResourcePlanSchema,
  codeSkillSchema,
  codeUiIrResultSchema,
  renderSvgResponseSchema,
  requirementTraceEntrySchema,
  requirementRulesResultSchema,
  runEventSchema,
  runSnapshotSchema,
} from "./index.js";

test("contracts validate representative stage payloads", () => {
  const rules = requirementRulesResultSchema.parse({
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "用户必须登录后才能访问主要功能。",
        relatedDiagrams: ["usecase", "activity"],
      },
    ],
  });
  assert.equal(rules.rules.length, 1);

  const models = diagramModelsResultSchema.parse({
    models: [
      {
        diagramKind: "usecase",
        title: "订单实验平台用例",
        summary: "展示主要角色与用例。",
        notes: ["仅展示核心用例"],
        actors: [
          {
            id: "actor_researcher",
            name: "研究人员",
            actorType: "human",
            responsibilities: ["提交文本需求"],
          },
        ],
        useCases: [
          {
            id: "usecase_generate",
            name: "生成 UML 模型",
            goal: "从文本需求生成结构化模型",
            preconditions: ["用户已输入需求"],
            postconditions: ["系统产出结构化模型"],
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
          },
        ],
      },
    ],
  });
  assert.equal(models.models[0]?.diagramKind, "usecase");

  const event = runEventSchema.parse({
    type: "stage_progress",
    stage: "generate_models",
    progress: 65,
    message: "正在生成图模型",
  });
  assert.equal(event.type, "stage_progress");

  const uiMockupEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "generate_code_ui_mockup",
    artifactKind: "uiMockup",
    uiMockup: {
      status: "completed",
      model: "gpt-image-2",
      prompt: "生成活动日历界面图",
      summary: "公共活动日历主界面",
      imageUrl: "https://example.com/mockup.png",
      imageDataUrl: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    },
  });
  assert.equal(uiMockupEvent.type, "artifact_ready");

  const uiIr = codeUiIrResultSchema.parse({
    uiIr: {
      designTokens: {
        colors: {
          primary: "#2563eb",
          background: "#f8fafc",
          surface: "#ffffff",
          text: "#0f172a",
          accent: "#f97316",
        },
        typography: { body: "14px system-ui" },
        spacing: { "1": "4px", "3": "12px", "4": "16px" },
        radius: { sm: "4px", md: "8px" },
        shadow: { sm: "0 1px 2px rgba(0,0,0,.08)" },
        density: "comfortable",
      },
      componentRegistry: {
        components: [
          {
            name: "WorkspaceShell",
            description: "业务工作台布局",
            props: ["title"],
            variants: ["default"],
            usageRules: ["承载导航和主内容"],
          },
        ],
      },
      pages: [
        {
          id: "home",
          route: "/",
          name: "首页",
          layout: "sidebar-content",
          primaryActions: ["新增"],
          componentTree: {
            component: "WorkspaceShell",
            purpose: "承载首页",
            props: { title: "首页" },
            dataBinding: null,
            tokenRefs: ["colors.primary"],
            children: [],
          },
        },
      ],
      dataBindings: ["records -> DataTable"],
      interactions: ["点击新增打开表单"],
      responsiveRules: ["mobile 纵向排列"],
    },
  });
  assert.equal(uiIr.uiIr.pages[0]?.componentTree.component, "WorkspaceShell");

  const uiIrEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "generate_code_ui_ir",
    artifactKind: "uiIr",
    uiIr: uiIr.uiIr,
  });
  assert.equal(uiIrEvent.type, "artifact_ready");

  const codeSkill = codeSkillSchema.parse({
    name: "react-prototype-quality",
    description: "提升 React 原型质量",
    triggers: ["React", "原型"],
    appliesTo: ["planning", "implementation"],
    priority: 80,
    source: "builtin",
    location: "apps/api/src/code-skills/builtin/react-prototype-quality/SKILL.md",
    baseDir: "apps/api/src/code-skills/builtin/react-prototype-quality",
    fileManifest: [
      {
        path: "apps/api/src/code-skills/builtin/react-prototype-quality/SKILL.md",
        relativePath: "SKILL.md",
        kind: "skill",
        size: 120,
      },
    ],
    content: "生成完整可运行代码。",
  });
  assert.equal(codeSkill.name, "react-prototype-quality");

  const skillAction = codeSkillActionSchema.parse({
    name: "design-system",
    description: "查询设计系统",
    command: "python",
    args: ["scripts/search.py", "{query}", "--design-system"],
    outputFormat: "markdown",
  });
  assert.equal(skillAction.command, "python");
  assert.throws(() =>
    codeSkillActionSchema.parse({
      name: "bad",
      description: "危险命令",
      command: "rm",
      args: ["-rf", "."],
    }),
  );

  const codeSkillsEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "select_code_skills",
    artifactKind: "codeSkills",
    codeSkills: [
      {
        name: codeSkill.name,
        description: codeSkill.description,
        source: codeSkill.source,
        location: codeSkill.location,
        appliesTo: codeSkill.appliesTo,
        priority: codeSkill.priority,
        reason: "默认启用 React 原型质量技能。",
      },
    ],
    skillDiagnostics: [],
  });
  assert.equal(codeSkillsEvent.type, "artifact_ready");

  const codeSkillContext = codeSkillContextSchema.parse({
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    query: "校园活动 dashboard React",
    designSystem: "## Design System",
    stackGuidelines: "{\"results\":[]}",
    domainGuidelines: "{\"results\":[]}",
    actionResults: [
      {
        name: "design-system",
        description: "查询设计系统",
        command: "python",
        args: ["scripts/search.py", "校园活动", "--design-system"],
        outputFormat: "markdown",
        status: "completed",
        stdout: "## Design System",
        stderr: "",
        exitCode: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ],
    diagnostics: [],
  });
  assert.equal(codeSkillContext.actionResults[0]?.status, "completed");

  const skillResourcePlan = codeSkillResourcePlanSchema.parse({
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    query: "校园活动 dashboard React responsive accessible",
    requests: [
      {
        resourceType: "stack",
        name: "react-stack",
        query: "React prototype",
        csvPath: "",
        stack: "react",
        domain: "",
        actionName: "",
        maxResults: 6,
        reason: "获取 React 原型实现规则。",
      },
    ],
    diagnostics: [],
  });
  assert.equal(skillResourcePlan.requests[0]?.stack, "react");

  const skillResourcePlanEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "plan_code_ui",
    artifactKind: "skillResourcePlan",
    skillResourcePlan,
  });
  assert.equal(skillResourcePlanEvent.type, "artifact_ready");

  const codeSkillContextEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "plan_code_ui",
    artifactKind: "codeSkillContext",
    codeSkillContext,
  });
  assert.equal(codeSkillContextEvent.type, "artifact_ready");

  const codeSnapshot = codeRunSnapshotSchema.parse({
    runId: "code-run",
    requirementText: "生成活动报名原型",
    rules: [],
    designModels: [],
    spec: null,
    skillResourcePlan,
    codeSkillContext,
    selectedCodeSkills: codeSkillsEvent.codeSkills,
    skillDiagnostics: [],
    files: {},
    entryFile: "/src/App.tsx",
    currentStage: "select_code_skills",
    status: "running",
    errorMessage: null,
  });
  assert.equal(codeSnapshot.selectedCodeSkills.length, 1);

  const designTraceEntry = designTraceEntrySchema.parse({
    stage: "render_svg",
    attempt: 1,
    kind: "render_error",
    diagramKind: "activity",
    plantUmlSource: "@startuml\nstart\n@enduml",
    errorMessage: "Syntax Error? (line 2)",
    createdAt: new Date().toISOString(),
  });
  assert.equal(designTraceEntry.kind, "render_error");

  const designSnapshot = designRunSnapshotSchema.parse({
    runId: "design-run",
    requirementText: "生成设计模型",
    selectedDiagrams: ["sequence"],
    rules: [],
    requirementModels: [],
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [
      designTraceEntry,
      {
        stage: "generate_design_sequence",
        attempt: 1,
        kind: "llm_output",
        rawOutput: "{\"models\":[]}",
        createdAt: new Date().toISOString(),
      },
    ],
    currentStage: "render_svg",
    status: "running",
    errorMessage: null,
  });
  assert.equal(designSnapshot.designTrace.length, 2);

  const requirementTraceEntry = requirementTraceEntrySchema.parse({
    stage: "generate_models",
    attempt: 1,
    kind: "parse_error",
    rawOutput: "{\"models\":[]}",
    errorMessage: "models.0.notes: Required",
    createdAt: new Date().toISOString(),
  });
  assert.equal(requirementTraceEntry.kind, "parse_error");

  const requirementSnapshot = runSnapshotSchema.parse({
    runId: "run",
    requirementText: "生成需求模型",
    selectedDiagrams: ["usecase"],
    rules: [],
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [
      requirementTraceEntry,
      {
        stage: "generate_plantuml",
        attempt: 1,
        kind: "plantuml_source",
        diagramKind: "usecase",
        plantUmlSource: "@startuml\n@enduml",
        createdAt: new Date().toISOString(),
      },
    ],
    currentStage: "generate_models",
    status: "running",
    errorMessage: null,
  });
  assert.equal(requirementSnapshot.requirementTrace.length, 2);

  const render = renderSvgResponseSchema.parse({
    svg: "<svg></svg>",
    renderMeta: {
      engine: "plantuml",
      generatedAt: new Date().toISOString(),
      sourceLength: 120,
      durationMs: 42,
    },
  });
  assert.match(render.svg, /<svg/);
});

test("contracts validate design table relationship diagrams", () => {
  const result = designDiagramModelsResultSchema.parse({
    models: [
      {
        diagramKind: "table",
        title: "订单表关系",
        summary: "体现用户、订单和订单明细的主外键关系。",
        notes: ["由设计类图推导"],
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
                references: {
                  tableId: "user",
                  columnId: "id",
                },
              },
            ],
          },
        ],
        relationships: [
          {
            id: "rel_user_order",
            type: "one-to-many",
            sourceTableId: "user",
            targetTableId: "order",
            sourceColumnId: "id",
            targetColumnId: "user_id",
            label: "1对多",
          },
        ],
      },
    ],
  });

  assert.equal(result.models[0]?.diagramKind, "table");
});

test("contracts reject invalid stage payloads", () => {
  assert.throws(() => {
    requirementRulesResultSchema.parse({
      rules: [
        {
          id: "",
          category: "未知分类",
          text: "",
          relatedDiagrams: [],
        },
      ],
    });
  });
});
