// Verifies requirement rule extraction tolerates model-specific labels before contract validation.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequirementRulesResult } from "./requirement-rule-normalizer.js";

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
        relatedDiagrams: ["用例图", "流程图"],
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
    "usecase",
    "activity",
    "analysis",
    "class",
  ]);
});
