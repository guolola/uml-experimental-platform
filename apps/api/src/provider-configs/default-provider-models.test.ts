// Verifies managed provider configs receive the platform-default model allowlist.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProviderAllowedModels } from "./default-provider-models.js";

test("provider config model normalization includes new default platform models", () => {
  const allowed = normalizeProviderAllowedModels("gpt-5.4", ["custom-model"]);

  assert.deepEqual(allowed.slice(0, 2), ["gpt-5.4", "custom-model"]);
  assert.ok(allowed.includes("gpt-5.5-pro"));
  assert.ok(allowed.includes("claude-opus-4-7"));
  assert.ok(allowed.includes("deepseek-v4-pro"));
  assert.ok(allowed.includes("MiniMax-M2.7"));
  assert.ok(allowed.includes("qwen3.5-plus"));
  assert.ok(allowed.includes("glm-5.1"));
});

test("siliconflow provider configs keep only the reviewed model catalog", () => {
  const allowed = normalizeProviderAllowedModels(
    "deepseek-ai/DeepSeek-V4-Pro",
    [
      "deepseek-ai/DeepSeek-V4-Pro",
      "deepseek-ai/DeepSeek-V4-Flash",
      "Pro/moonshotai/Kimi-K2.6",
      "Pro/zai-org/GLM-5.1",
      "Pro/MiniMaxAI/MiniMax-M2.5",
      "Qwen/Qwen3.6-35B-A3B",
    ],
    { baseUrl: "https://api.siliconflow.cn/v1", provider: "siliconflow" },
  );

  assert.deepEqual(allowed, [
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Flash",
    "Pro/moonshotai/Kimi-K2.6",
    "Pro/zai-org/GLM-5.1",
    "Pro/MiniMaxAI/MiniMax-M2.5",
    "Qwen/Qwen3.6-35B-A3B",
  ]);
  assert.equal(allowed.includes("gpt-5.5-pro"), false);
  assert.equal(allowed.includes("gpt-5.4"), false);
});
