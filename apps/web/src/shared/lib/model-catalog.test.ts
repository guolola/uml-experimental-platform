// Verifies the selectable provider/model catalog exposed by the model picker.
import { describe, expect, it } from "vitest";
import { MODEL_VENDORS, getModelDisplayName, getModelOption } from "./model-catalog";

describe("model catalog", () => {
  it("includes the configured first-level vendors and requested models", () => {
    expect(MODEL_VENDORS.map((vendor) => vendor.label)).toEqual([
      "OpenAI",
      "Claude",
      "Google",
      "DeepSeek",
      "Minimax",
      "Aliyun",
      "智谱",
    ]);

    expect(getModelOption("gpt-5.5-pro")?.fullLabel).toBe("gpt-5.5-pro");
    expect(getModelOption("claude-opus-4-7")?.fullLabel).toBe("claude-opus-4-7");
    expect(getModelOption("deepseek-v4-pro")?.fullLabel).toBe("deepseek-v4-pro");
    expect(getModelOption("MiniMax-M2.7")?.fullLabel).toBe("MiniMax-M2.7");
    expect(getModelOption("qwen3.5-plus")?.fullLabel).toBe("qwen3.5-plus");
    expect(getModelOption("glm-5.1")?.fullLabel).toBe("glm-5.1");
  });

  it("shows the new vendor label in picker display text", () => {
    expect(getModelDisplayName("glm-5.1")).toMatchObject({
      triggerLabel: "智谱 · GLM 5.1",
      vendorLabel: "智谱",
      shortLabel: "GLM 5.1",
    });
  });
});
