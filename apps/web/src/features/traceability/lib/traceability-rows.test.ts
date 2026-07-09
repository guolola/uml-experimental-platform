// Verifies traceability row builders surface pending review metadata for the matrix UI.
import { describe, expect, it } from "vitest";
import { buildDesignRows, buildRequirementRows } from "./traceability-rows";

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

  it("shows design upstream and requirement elements without requirement rules", () => {
    const rows = buildDesignRows(
      [
        {
          id: "r1",
          category: "功能需求",
          text: "系统应支持借书。",
          relatedDiagrams: ["usecase"],
        },
      ],
      {
        usecase: {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "借书",
          notes: [],
          actors: [],
          useCases: [
            {
              id: "borrow-book",
              name: "借书",
              goal: "完成借书",
              preconditions: [],
              postconditions: [],
              supportingActorIds: [],
            },
          ],
          systemBoundaries: [],
          relationships: [],
        },
      },
      {
        class: {
          diagramKind: "class",
          title: "设计类图",
          summary: "借书服务",
          notes: [],
          classes: [
            {
              id: "BorrowingService",
              name: "BorrowingService",
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
            diagramKind: "usecase",
            modelId: "usecase",
            elementId: "borrow-book",
            elementKind: "usecase",
            label: "借书",
          },
        },
      ],
      [
        {
          source: {
            diagramKind: "class",
            modelId: "class",
            elementId: "BorrowingService",
            elementKind: "class",
            label: "BorrowingService",
          },
          upstreamDesignRefs: [
            {
              diagramKind: "sequence",
              modelId: "sequence:borrow-book",
              elementId: "BorrowingService",
              elementKind: "participant",
              label: "借书服务调用",
            },
          ],
          targets: [
            {
              diagramKind: "usecase",
              modelId: "usecase",
              elementId: "borrow-book",
              elementKind: "usecase",
              label: "借书",
            },
          ],
          mappingSource: "auto-filled-pending-review",
          reviewStatus: "pending",
          confidence: "low",
          rationale:
            "未找到明确上游来源，系统仅按最接近的需求元素临时补齐；请在跟踪矩阵中采纳、忽略或稍后处理。",
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.requirementRules).toEqual([]);
    expect(rows[0]?.upstreamDesignElements.map((ref) => ref.label)).toEqual([
      "借书服务调用",
    ]);
    expect(rows[0]?.requirementElements.map((ref) => ref.label)).toEqual([
      "借书",
    ]);
    expect(rows[0]?.mappingNote).toBe("由系统自动建立候选映射，需复核。");
    expect(rows[0]?.detailLines).toEqual([
      "待确认：由系统自动建立候选映射，需复核。",
      "来源用例实现设计：sequence:borrow-book / 借书服务调用",
      "需求元素：用例模型 / 借书",
    ]);
  });
});
