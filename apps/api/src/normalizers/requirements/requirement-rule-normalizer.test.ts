// Verifies requirement rule extraction tolerates model-specific labels before contract validation.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequirementRulesResult } from "./requirement-rule-normalizer.js";

test("wraps top-level rule arrays returned by non-strict JSON models", () => {
  const result = normalizeRequirementRulesResult([
    {
      id: "r1",
      category: "功能",
      text: "学生可以查询空闲座位并提交预约。",
      relatedDiagrams: ["用例图"],
    },
  ]);

  assert.deepEqual(result.rules, [
    {
      id: "r1",
      category: "功能需求",
      text: "学生可以查询空闲座位并提交预约。",
      relatedDiagrams: ["usecase"],
    },
  ]);
});

test("normalizes requirement rule category aliases and diagram aliases", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r1",
        category: "安全需求",
        text: "接口请求做合法性校验，防止恶意预约。",
        relatedDiagrams: ["部署图", "外部接口"],
      },
      {
        id: "r2",
        category: "接口需求",
        text: "用户通过微信一键授权登录系统。",
        relatedDiagrams: ["功能分解图", "用例图", "流程图"],
      },
    ],
  });

  assert.deepEqual(result.rules, [
    {
      id: "r1",
      category: "非功能需求",
      text: "接口请求做合法性校验，防止恶意预约。",
      relatedDiagrams: ["deployment"],
    },
    {
      id: "r2",
      category: "外部接口",
      text: "用户通过微信一键授权登录系统。",
      relatedDiagrams: ["usecase", "activity"],
    },
  ]);
});

test("preserves source fragments separately from readable rule text", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "图书管理员可以借阅图书。",
        sourceFragment: "(1)借书",
        relatedDiagrams: ["用例图"],
      },
    ],
  });

  assert.deepEqual(result.rules[0], {
    id: "r1",
    category: "功能需求",
    text: "图书管理员可以借阅图书。",
    sourceFragment: "(1)借书",
    relatedDiagrams: ["usecase"],
  });
});

test("renames duplicate requirement rule ids deterministically", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "读者可以检索图书。",
        relatedDiagrams: ["用例图"],
      },
      {
        id: "R1",
        category: "数据需求",
        text: "系统需要记录图书库存。",
        relatedDiagrams: ["类图"],
      },
      {
        id: "r1",
        category: "异常处理",
        text: "检索失败时系统提示原因。",
        relatedDiagrams: ["活动图"],
      },
    ],
  });

  assert.deepEqual(
    result.rules.map((rule) => rule.id),
    ["r1", "R1-2", "r1-3"],
  );
});

test("infers related diagrams when model returns only invalid diagram labels", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r3",
        category: "性能需求",
        text: "系统支持至少100人同时在线使用，页面加载速度小于2秒。",
        relatedDiagrams: ["性能需求", "安全需求"],
      },
      {
        id: "r4",
        category: "功能需求",
        text: "用户选择日期、时间段与座位后提交预约请求。",
        relatedDiagrams: ["外部接口"],
      },
    ],
  });

  assert.equal(result.rules[0]?.category, "非功能需求");
  assert.deepEqual(result.rules[0]?.relatedDiagrams, ["deployment"]);
  assert.deepEqual(result.rules[1]?.relatedDiagrams, [
    "function",
    "usecase",
    "activity",
    "analysis",
    "class",
  ]);
});

test("filters function structure mappings from non-functional and interface rules", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r5",
        category: "非功能需求",
        text: "系统响应时间应小于 2 秒。",
        relatedDiagrams: ["功能结构图", "部署图"],
      },
      {
        id: "r6",
        category: "界面需求",
        text: "首页展示博客列表和登录入口。",
        relatedDiagrams: ["功能分解图", "原型界面关系"],
      },
    ],
  });

  assert.deepEqual(result.rules[0]?.relatedDiagrams, ["deployment"]);
  assert.deepEqual(result.rules[1]?.relatedDiagrams, ["prototype"]);
});
