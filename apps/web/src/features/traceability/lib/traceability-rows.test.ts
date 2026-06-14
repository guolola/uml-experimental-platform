// Verifies traceability row builders surface pending review metadata for the matrix UI.
import { describe, expect, it } from "vitest";
import { buildRequirementRows } from "./traceability-rows";

describe("traceability row builders", () => {
  it("surfaces pending auto-filled requirement mappings with confidence details", () => {
    const rows = buildRequirementRows(
      [
        {
          id: "r1",
          category: "数据需求",
          text: "系统应维护图书信息。",
          relatedDiagrams: ["class"],
        },
      ],
      {
        class: {
          diagramKind: "class",
          title: "领域概念模型",
          summary: "图书领域对象",
          notes: [],
          classes: [
            {
              id: "Book",
              name: "Book",
              attributes: [],
              operations: [],
            },
          ],
          interfaces: [],
          enums: [],
          relationships: [],
        },
      },
      [
        {
          ruleId: "r1",
          target: {
            diagramKind: "class",
            modelId: "class",
            elementId: "Book",
            elementKind: "class",
            label: "Book",
          },
          mappingSource: "auto-filled-pending-review",
          reviewStatus: "pending",
          confidence: "low",
          rationale: "系统按相关图类型兜底补齐，需人工复核。",
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "mapped",
      mappingNote: "系统按相关图类型兜底补齐，需人工复核。",
    });
    expect(rows[0]?.detailLines).toContain(
      "待确认：系统按相关图类型兜底补齐，需人工复核。",
    );
    expect(rows[0]?.detailLines).toContain("置信度：low");
  });
});
