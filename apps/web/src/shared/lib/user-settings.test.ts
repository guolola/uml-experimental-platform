// Covers persisted user settings defaults and normalization behavior.
import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_STORAGE_KEY, loadUserSettings } from "./user-settings";

describe("user settings defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses gpt-5.4 as the global default model", () => {
    expect(DEFAULT_USER_SETTINGS.defaultModel).toBe("gpt-5.4");
    expect(loadUserSettings().defaultModel).toBe("gpt-5.4");
  });

  it("falls back to gpt-5.4 when persisted model is not in the catalog", () => {
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        defaultModel: "retired-model",
      }),
    );

    expect(loadUserSettings().defaultModel).toBe("gpt-5.4");
  });
});
