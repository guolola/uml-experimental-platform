import assert from "node:assert/strict";
import test from "node:test";
import { getModelCapability } from "./model-capabilities.js";

test("deepseek v4 flash uses JSON mode instead of strict json_schema", () => {
  const capability = getModelCapability("deepseek-v4-flash");

  assert.equal(capability.supportsJsonSchema, false);
  assert.equal(capability.supportsJsonObject, true);
  assert.equal(capability.structuredOutputMode, "json_object");
  assert.equal(capability.modeLabel, "JSON 模式");
  assert.match(capability.warning ?? "", /json_schema/u);
});

test("unknown models default to strict json_schema", () => {
  const capability = getModelCapability("qwen3.7-plus");

  assert.equal(capability.supportsJsonSchema, true);
  assert.equal(capability.supportsJsonObject, true);
  assert.equal(capability.structuredOutputMode, "strict_json");
  assert.equal(capability.modeLabel, "严格 JSON");
});
