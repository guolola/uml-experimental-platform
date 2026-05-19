// Owns code-run diagnostic append helpers shared by code pipeline stages.

import {
  type CodeQualityDiagnostic,
  type CodeRunSnapshot,
  type RunStage,
} from "@uml-platform/contracts";

export function addCodeDiagnostic(
  snapshot: CodeRunSnapshot,
  stage: RunStage,
  message: string,
) {
  snapshot.diagnostics = [
    ...snapshot.diagnostics,
    {
      stage,
      message,
      at: new Date().toISOString(),
    },
  ];
}

export function addFileGenerationDiagnostic(
  snapshot: CodeRunSnapshot,
  entry: {
    stage: "file_operations" | "implementation_brief" | "operation_manifest" | "file_content";
    path?: string;
    status: "completed" | "failed" | "repaired";
    message: string;
  },
) {
  snapshot.fileGenerationDiagnostics = [
    ...snapshot.fileGenerationDiagnostics,
    {
      ...entry,
      at: new Date().toISOString(),
    },
  ];
}

export function recordCodeQualityDiagnostics(
  snapshot: CodeRunSnapshot,
  diagnostic: CodeQualityDiagnostic,
) {
  snapshot.qualityDiagnostics = [...snapshot.qualityDiagnostics, diagnostic];
  addCodeDiagnostic(
    snapshot,
    "audit_code_quality",
    diagnostic.passed
      ? `质量检查通过：${diagnostic.metrics.pageFileCount} 个页面文件，${diagnostic.metrics.componentFileCount} 个组件文件`
      : `质量检查发现 ${diagnostic.issues.length} 个问题`,
  );
  for (const issue of diagnostic.issues) {
    addCodeDiagnostic(
      snapshot,
      issue.severity === "error" ? "repair_code_files" : "audit_code_quality",
      `${issue.path ? `${issue.path}：` : ""}${issue.message}`,
    );
  }
}
