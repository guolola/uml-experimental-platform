// Verifies project run API summaries are projected into local history items.
import { describe, expect, it } from "vitest";
import { projectRunSummaryToHistoryItem } from "./project-history";

describe("projectRunSummaryToHistoryItem", () => {
  it("keeps code diagnostic summaries visible without a full snapshot", () => {
    const item = projectRunSummaryToHistoryItem({
      runId: "run-code-diagnostics",
      status: "completed",
      stage: "verify_code_preview",
      runKind: "code",
      model: "gpt-test",
      startedAt: "2026-06-21T00:00:00.000Z",
      snapshotAvailable: true,
      canRestore: true,
      codeDiagnosticCount: 2,
      codeDiagnosticSummary: [
        "verify_code_preview：检测到真实网络请求痕迹，已切换到本地 mock。",
        "operation_manifest：入口文件缺失，已回退到 /src/App.tsx。",
      ],
      codeQualityIssueCount: 1,
    });

    expect(item?.summary).toContain("阶段 verify_code_preview");
    expect(item?.summary).toContain("代码诊断 2 项");
    expect(item?.summary).toContain("检测到真实网络请求痕迹");
    expect(item?.codeDiagnosticCount).toBe(2);
    expect(item?.codeQualityIssueCount).toBe(1);
  });
});
