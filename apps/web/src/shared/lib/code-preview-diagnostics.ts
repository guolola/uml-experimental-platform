// Tags browser-local prototype preview failures so shared code diagnostics can project them consistently.
import type { CodeRunSnapshot } from "@uml-platform/contracts";

type CodeDiagnostic = CodeRunSnapshot["diagnostics"][number];

const CODE_PREVIEW_DIAGNOSTIC_PREFIX = "本地预览失败：";

export function createCodePreviewDiagnostic(
  message: string,
  at = new Date().toISOString(),
): CodeDiagnostic {
  return {
    stage: "verify_code_preview",
    message: `${CODE_PREVIEW_DIAGNOSTIC_PREFIX}${message.trim() || "预览构建失败"}`,
    at,
  };
}

export function isCodePreviewDiagnostic(diagnostic: CodeDiagnostic) {
  return diagnostic.message.startsWith(CODE_PREVIEW_DIAGNOSTIC_PREFIX);
}

export function replaceCodePreviewDiagnostic(
  diagnostics: readonly CodeDiagnostic[],
  message: string,
) {
  return [
    ...diagnostics.filter((diagnostic) => !isCodePreviewDiagnostic(diagnostic)),
    createCodePreviewDiagnostic(message),
  ];
}

export function removeCodePreviewDiagnostics(
  diagnostics: readonly CodeDiagnostic[],
) {
  return diagnostics.filter((diagnostic) => !isCodePreviewDiagnostic(diagnostic));
}
