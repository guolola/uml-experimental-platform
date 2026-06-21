// Formats code generation diagnostics for workspace surfaces without mutating run snapshots.
import type {
  CodeFileGenerationDiagnostic,
  CodeQualityDiagnostic,
  CodeRunSnapshot,
  RunStage,
} from "@uml-platform/contracts";

type CodeDiagnostic = CodeRunSnapshot["diagnostics"][number];

export type CodeDiagnosticProjection = {
  diagnostics?: readonly CodeDiagnostic[] | null;
  fileGenerationDiagnostics?: readonly CodeFileGenerationDiagnostic[] | null;
  qualityDiagnostics?: readonly CodeQualityDiagnostic[] | null;
  codeDiagnosticCount?: number | null;
  codeDiagnosticSummary?: readonly string[] | null;
};

const STAGE_LABELS: Partial<Record<RunStage, string>> = {
  analyze_code_business_logic: "分析业务逻辑",
  analyze_code_product: "分析业务背景",
  plan_code_ui: "规划界面方案",
  generate_code_ui_mockup: "生成界面设计图",
  analyze_code_ui_mockup: "解析界面设计图",
  generate_code_ui_ir: "生成结构化 UI IR",
  load_web_design_skill: "加载前端设计执行器",
  select_code_skills: "选择前端设计执行器",
  plan_code_files: "规划文件结构",
  generate_code_spec: "生成代码规格",
  generate_code_files: "生成代码文件",
  plan_code: "制定实现步骤",
  write_code_files: "写入原型文件",
  audit_code_quality: "检查原型质量",
  verify_code_ui_fidelity: "检查设计图还原度",
  verify_code_rendered_preview: "验证渲染预览",
  verify_code_business_assertions: "验证业务断言",
  verify_code_preview: "检查预览入口",
  repair_code_files: "修复代码输出",
};

const FILE_DIAGNOSTIC_STAGE_LABELS: Record<CodeFileGenerationDiagnostic["stage"], string> = {
  file_operations: "文件操作计划",
  implementation_brief: "实现蓝图",
  operation_manifest: "文件变更清单",
  file_content: "文件内容生成",
};

function trimText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stageLabel(stage: RunStage) {
  return STAGE_LABELS[stage] ?? stage;
}

function latestQualityIssues(
  diagnostics: readonly CodeQualityDiagnostic[] | null | undefined,
) {
  return diagnostics?.at(-1)?.issues ?? [];
}

export function getCodeDiagnosticCount(input: CodeDiagnosticProjection) {
  if (
    typeof input.codeDiagnosticCount === "number" &&
    Number.isFinite(input.codeDiagnosticCount)
  ) {
    return Math.max(0, input.codeDiagnosticCount);
  }
  return (
    (input.diagnostics?.length ?? 0) +
    (input.fileGenerationDiagnostics?.length ?? 0) +
    latestQualityIssues(input.qualityDiagnostics).length
  );
}

export function hasCodeDiagnostics(input: CodeDiagnosticProjection) {
  return getCodeDiagnosticCount(input) > 0;
}

export function formatCodeDiagnosticEntries(
  input: CodeDiagnosticProjection,
  limit = 3,
) {
  const fromSummary = (input.codeDiagnosticSummary ?? [])
    .map(trimText)
    .filter(Boolean);
  if (fromSummary.length > 0) {
    return fromSummary.slice(0, limit);
  }

  const entries = [
    ...(input.diagnostics ?? []).map((diagnostic) =>
      `${stageLabel(diagnostic.stage)}：${trimText(diagnostic.message)}`,
    ),
    ...(input.fileGenerationDiagnostics ?? []).map((diagnostic) => {
      const target = diagnostic.path ? `${diagnostic.path} ` : "";
      return `${FILE_DIAGNOSTIC_STAGE_LABELS[diagnostic.stage]}：${target}${trimText(
        diagnostic.message,
      )}`;
    }),
    ...latestQualityIssues(input.qualityDiagnostics).map((issue) =>
      `质量检查：${issue.path ? `${issue.path} ` : ""}${trimText(issue.message)}`,
    ),
  ].filter(Boolean);

  return entries.slice(0, limit);
}

export function formatCodeDiagnosticSummary(
  input: CodeDiagnosticProjection,
  options: { limit?: number } = {},
) {
  const count = getCodeDiagnosticCount(input);
  if (count <= 0) return null;
  const entries = formatCodeDiagnosticEntries(input, options.limit ?? 2);
  return entries.length > 0
    ? `代码诊断 ${count} 项：${entries.join("；")}`
    : `代码诊断 ${count} 项`;
}
