// Covers frontend normalization for admin-managed provider model policies.
import { describe, expect, it } from "vitest";
import {
  getProviderAllowedModels,
  getProviderLabel,
  resolveProviderModel,
} from "./provider-config-models";

describe("provider config model helpers", () => {
  it("keeps the default model in the selectable allowed model list", () => {
    expect(
      getProviderAllowedModels({
        defaultModel: "gpt-5.5",
        allowedModels: ["gpt-5.5-pro", "gpt-5.5"],
      }),
    ).toEqual(["gpt-5.5", "gpt-5.5-pro"]);
  });

  it("falls back to the provider default when the current model is not allowed", () => {
    expect(
      resolveProviderModel(
        {
          defaultModel: "gpt-5.5",
          allowedModels: ["gpt-5.5"],
        },
        "glm-5.1",
      ),
    ).toBe("gpt-5.5");
  });

  it("formats managed provider labels for model picker grouping", () => {
    expect(getProviderLabel({ provider: "siliconflow" })).toBe("SiliconFlow");
    expect(getProviderLabel({ provider: "openai-compatible" })).toBe("OpenAI Compatible");
    expect(getProviderLabel({ provider: "custom_provider" })).toBe("Custom Provider");
  });
});
