import { describe, expect, it } from "vitest";
import {
  WORKFLOW_MANIFEST,
  getWorkflowDisabledReason,
} from "./manifest";

describe("workflow manifest", () => {
  it("exposes prerequisite reasons that the UI can show inline", () => {
    expect(
      getWorkflowDisabledReason("code", {
        hasRequirementText: true,
        hasRequirementModels: true,
        hasDesignModels: false,
        hasCodeFiles: false,
      }),
    ).toBe("请先生成设计模型");
  });

  it("keeps workflow step ids unique", () => {
    const ids = WORKFLOW_MANIFEST.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
