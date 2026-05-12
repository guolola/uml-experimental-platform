import assert from "node:assert/strict";
import test from "node:test";
import {
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
