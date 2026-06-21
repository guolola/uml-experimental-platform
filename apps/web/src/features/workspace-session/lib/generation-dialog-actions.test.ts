// Verifies generation result dialog copy for document completion edge cases.
import { describe, expect, it } from "vitest";
import { documentRunCompletionDialog } from "./generation-dialog-actions";

describe("documentRunCompletionDialog", () => {
  it("surfaces missing diagram warnings for completed documents", () => {
    const dialog = documentRunCompletionDialog({
      documentTitle: "需求规格说明书",
      runId: "doc-warning",
      missingArtifactCount: 2,
    });

    expect(dialog.title).toBe("说明书已生成但缺图");
    expect(dialog.message).toBe(
      "需求规格说明书已生成，但有 2 项图源缺失，请复核后交付。",
    );
    expect(dialog.runId).toBe("doc-warning");
    expect(dialog.stageLabel).toBe("说明书");
  });
});
