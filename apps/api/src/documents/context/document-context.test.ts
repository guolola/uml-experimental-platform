// Verifies document fallback sections preserve review cues for low-confidence traceability.
import assert from "node:assert/strict";
import test from "node:test";
import { startDocumentRunRequestSchema } from "@uml-platform/contracts";
import { fallbackDocumentSections } from "./document-context.js";

test("software design documents list pending auto-filled traceability for review", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "图书馆系统需要支持借书、还书。",
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          modelId: "class:design",
          elementKind: "class",
          elementId: "BookService",
          label: "BookService",
        },
        targets: [
          {
            diagramKind: "usecase",
            modelId: "usecase:requirements",
            elementKind: "useCase",
            elementId: "UC-Borrow",
            label: "借书",
          },
        ],
        mappingSource: "auto-filled-pending-review",
        reviewStatus: "pending",
        confidence: "low",
        rationale: "缺失映射由系统自动补齐",
      },
    ],
  });

  const sections = fallbackDocumentSections(input);
  const reviewSection = sections.find((section) =>
    section.title.includes("需复核追踪关系"),
  );

  assert.ok(reviewSection);
  assert.deepEqual(reviewSection.table?.headers, [
    "编号",
    "设计模型",
    "设计元素",
    "关联需求元素",
    "备注",
  ]);
  assert.equal(reviewSection.table?.rows[0]?.[2], "BookService");
});
