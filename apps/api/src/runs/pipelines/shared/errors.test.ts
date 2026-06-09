// Locks run failure classification for provider quota and balance messages.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRunError } from "./errors.js";

test("normalizeRunError treats provider balance wording as quota exhaustion", () => {
  const siliconFlow = normalizeRunError(
    new Error(
      "LLM request failed with HTTP 403: Sorry, your account balance is insufficient",
    ),
  );
  const chineseQuota = normalizeRunError(
    new Error("Provider test failed with HTTP 403: 用户额度不足"),
  );

  assert.equal(siliconFlow.code, "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT");
  assert.equal(siliconFlow.message, "当前模型服务额度不足，请稍后重试或联系管理员。");
  assert.equal(chineseQuota.code, "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT");
});
