// Verifies run history labels and summaries shown across generation history surfaces.
import { describe, expect, it } from "vitest";
import type { CodeRunSnapshot, RunSnapshot } from "@uml-platform/contracts";
import { getRunHistorySnapshotSummary } from "./index";

function codeSnapshot(overrides: Partial<CodeRunSnapshot> = {}): CodeRunSnapshot {
  return {
    runId: "code-run-test",
    requirementText: "生成图书馆预约系统",
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    designModels: [],
    designPlantUml: [],
    spec: null,
    businessLogic: null,
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    businessAssertionResults: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: [],
    codeTrace: [],
    codeGenerationMode: "json_schema_operations",
    qualityDiagnostics: [],
    files: {},
    entryFile: null,
    dependencies: {},
    agentPlan: [],
    generationMode: "regenerate",
    changedFileCount: 0,
    diagnostics: [],
    codeContextHash: null,
    currentStage: "write_code_files",
    status: "failed",
    error: {
      code: "RUN_INTERNAL_ERROR",
      message: "代码重新生成失败",
      category: "generation",
      retryable: true,
    },
    ...overrides,
  };
}

describe("getRunHistorySnapshotSummary", () => {
  it("explains failed code regenerations as preserving the previous code", () => {
    expect(getRunHistorySnapshotSummary(codeSnapshot())).toBe(
      "代码重新生成失败，已保留上一版代码",
    );
  });

  it("summarizes code diagnostics, file diagnostics, and quality issues", () => {
    const summary = getRunHistorySnapshotSummary(
      codeSnapshot({
        status: "completed",
        error: null,
        generationMode: "continue",
        files: { "/src/App.tsx": "export default function App() { return null; }" },
        diagnostics: [
          {
            stage: "verify_code_preview",
            message: "检测到真实网络请求痕迹，已切换到本地 mock。",
            at: "2026-06-21T00:00:00.000Z",
          },
        ],
        fileGenerationDiagnostics: [
          {
            stage: "operation_manifest",
            status: "repaired",
            message: "入口文件缺失，已回退到 /src/App.tsx。",
            path: "/src/App.tsx",
            at: "2026-06-21T00:00:01.000Z",
          },
        ],
        qualityDiagnostics: [
          {
            passed: false,
            metrics: {
              fileCount: 1,
              pageFileCount: 1,
              componentFileCount: 0,
            },
            issues: [
              {
                severity: "warning",
                path: "/src/App.tsx",
                message: "页面缺少空状态。",
              },
            ],
          },
        ],
      }),
    );

    expect(summary).toContain("代码文件 1 个");
    expect(summary).toContain("代码诊断 3 项");
    expect(summary).toContain("检测到真实网络请求痕迹");
  });

  it("summarizes failed rules-only snapshots as rule extraction failures", () => {
    const snapshot: RunSnapshot = {
      runId: "run-rules-failed",
      requirementText: "订单系统需求",
      selectedDiagrams: [],
      analysisTargetUseCaseIds: [],
      rules: [],
      requirementBaseline: null,
      coverageMatrix: null,
      traceabilityMatrix: null,
      models: [],
      requirementModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      requirementTrace: [],
      currentStage: "extract_rules",
      status: "failed",
      error: {
        code: "RUN_STRUCTURED_OUTPUT_INVALID",
        message: "rules 必须是数组",
        category: "generation",
        retryable: true,
      },
    };

    expect(getRunHistorySnapshotSummary(snapshot)).toBe(
      "需求规则抽取失败：rules 必须是数组",
    );
  });

  it("explains analysis-only runs with automatically generated usecase dependencies", () => {
    const snapshot: RunSnapshot = {
      runId: "run-analysis-dependency",
      requirementText: "订单系统需求",
      selectedDiagrams: ["usecase", "analysis"],
      requestedDiagrams: ["analysis"],
      dependencyDiagrams: ["usecase"],
      analysisTargetUseCaseIds: [],
      rules: [],
      requirementBaseline: null,
      coverageMatrix: null,
      traceabilityMatrix: null,
      models: [],
      requirementModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      requirementTrace: [],
      currentStage: null,
      status: "completed",
      error: null,
    };

    expect(getRunHistorySnapshotSummary(snapshot)).toBe(
      "请求需求分析模型，自动补齐用例模型",
    );
  });
});
