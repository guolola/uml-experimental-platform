import assert from "node:assert/strict";
import test from "node:test";
import {
  diagramModelsResultSchema,
  renderSvgResponseSchema,
  requirementRulesResultSchema,
  runEventSchema,
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
