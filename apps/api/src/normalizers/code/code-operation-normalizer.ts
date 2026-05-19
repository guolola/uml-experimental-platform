// Normalizes generated code file operations before they mutate the run snapshot.
import { codeFileOperationsResultSchema } from "@uml-platform/contracts";
import { isPlainRecord, parseJson } from "../json/parse-json.js";

export function normalizeFilePath(path: string) {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.replace(/\\/g, "/");
}

function normalizeCodeOperationName(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  const aliasMap: Record<string, string> = {
    create: "create_file",
    add: "create_file",
    write: "create_file",
    "write_file": "create_file",
    file: "create_file",
    update: "update_file",
    modify: "update_file",
    edit: "update_file",
    replace: "update_file",
    set_entry: "set_entry_file",
    setEntry: "set_entry_file",
    entry: "set_entry_file",
    note_file: "note",
    comment: "note",
  };
  return aliasMap[normalized] ?? normalized;
}

function normalizeCodeOperationCandidate(candidate: unknown) {
  if (!isPlainRecord(candidate)) return candidate;

  const operation = candidate;
  const normalized: Record<string, unknown> = { ...operation };
  normalized.operation = normalizeCodeOperationName(
    normalized.operation ??
      normalized.type ??
      normalized.action ??
      normalized.op ??
      normalized.kind,
  );

  if (
    normalized.operation === "note" &&
    typeof normalized.message !== "string"
  ) {
    const fallbackMessage = normalized.reason ?? normalized.content;
    if (typeof fallbackMessage === "string") {
      normalized.message = fallbackMessage;
    }
  }

  return normalized;
}

export function parseCodeFileOperationsResult(text: string) {
  const parsed = parseJson<unknown>(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return codeFileOperationsResultSchema.parse(parsed);
  }

  const object = parsed as Record<string, unknown>;
  const operations = Array.isArray(object.operations)
    ? object.operations.map(normalizeCodeOperationCandidate)
    : object.operations;

  return codeFileOperationsResultSchema.parse({
    ...object,
    operations,
  });
}
