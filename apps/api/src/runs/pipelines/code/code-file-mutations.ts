// Owns prototype file mutation helpers and their code_file_changed run events.

import {
  codeFileChangedRunEventSchema,
  type CodeFileOperation,
  type CodeRunSnapshot,
} from "@uml-platform/contracts";
import { normalizeFilePath } from "../../../normalizers/code/code-operation-normalizer.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { addCodeDiagnostic } from "./code-run-diagnostics.js";

export function sanitizePrototypeFileContent(path: string, content: string) {
  const normalizedPath = normalizeFilePath(path);
  if (normalizedPath !== "/src/styles.css") return content;
  return content
    .replace(/^\s*@import\s+(?:url\()?["']?https?:\/\/[^"')\s;]+["']?\)?\s*;?\s*$/gim, "")
    .replace(/url\(\s*["']?https?:\/\/[^"')\s]+["']?\s*\)/gi, "none");
}

export function emitCodeFileChanged(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  path: string,
  content: string,
  reason: string,
) {
  const normalizedPath = normalizeFilePath(path);
  if (normalizedPath.startsWith("/src/docs/")) {
    addCodeDiagnostic(
      snapshot,
      "write_code_files",
      `${normalizedPath} 已忽略：说明性业务规则由平台代码页展示，不写入原型本地文档。`,
    );
    return false;
  }
  const sanitizedContent = sanitizePrototypeFileContent(normalizedPath, content);
  if (sanitizedContent !== content) {
    addCodeDiagnostic(
      snapshot,
      "write_code_files",
      `${normalizedPath} 已移除外部样式资源引用，原型预览仅使用本地 mock 与本地样式。`,
    );
  }
  const previousContent = snapshot.files[normalizedPath];
  if (previousContent === sanitizedContent) {
    addCodeDiagnostic(snapshot, "write_code_files", `${normalizedPath} 内容未变化：${reason}`);
    return false;
  }
  snapshot.changedFileCount += 1;
  snapshot.files = {
    ...snapshot.files,
    [normalizedPath]: sanitizedContent,
  };
  emitEvent(
    record,
    codeFileChangedRunEventSchema.parse({
      type: "code_file_changed",
      path: normalizedPath,
      content: sanitizedContent,
      reason,
    }),
  );
  return true;
}

export function applyCodeOperation(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  operation: CodeFileOperation,
) {
  switch (operation.operation) {
    case "create_file":
    case "update_file":
      return emitCodeFileChanged(
        record,
        snapshot,
        operation.path,
        operation.content,
        operation.reason,
      );
    case "set_entry_file":
      snapshot.entryFile = normalizeFilePath(operation.path);
      addCodeDiagnostic(snapshot, "write_code_files", operation.reason);
      return false;
    case "note":
      addCodeDiagnostic(snapshot, "write_code_files", operation.message);
      return false;
  }
}
