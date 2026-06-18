// Normalizes sequence fragments shared by requirement analysis and design sequence models.
import {
  ensureArray,
  isPlainRecord,
  normalizeStringArray,
} from "../json/parse-json.js";

type SequenceFragmentType = "alt" | "opt" | "loop" | "par";

const SEQUENCE_FRAGMENT_TYPES = new Set<SequenceFragmentType>([
  "alt",
  "opt",
  "loop",
  "par",
]);

function compactString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFragmentType(value: unknown): SequenceFragmentType {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (SEQUENCE_FRAGMENT_TYPES.has(normalized as SequenceFragmentType)) {
      return normalized as SequenceFragmentType;
    }
    if (normalized.includes("loop") || normalized.includes("循环")) return "loop";
    if (normalized.includes("parallel") || normalized.includes("并行")) return "par";
    if (normalized.includes("optional") || normalized.includes("可选")) return "opt";
  }
  return "opt";
}

function fallbackFragmentLabel(type: SequenceFragmentType, index: number) {
  if (type === "loop") return "循环";
  if (type === "par") return "并行";
  if (type === "alt") return "条件分支";
  return `可选片段 ${index + 1}`;
}

function uniqueMessageIds(ids: unknown, validMessageIds: Set<string>) {
  const seen = new Set<string>();
  return normalizeStringArray(ids).filter((id) => {
    const trimmed = id.trim();
    if (!trimmed || !validMessageIds.has(trimmed) || seen.has(trimmed)) {
      return false;
    }
    seen.add(trimmed);
    return true;
  });
}

function uniqueId(value: unknown, index: number, usedIds: Set<string>) {
  const base = compactString(value) || `fragment-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function dropBlankOptionalTextFields(
  record: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    if (typeof record[key] === "string" && !record[key].trim()) {
      delete record[key];
    }
  }
}

function normalizeBranch(
  branch: unknown,
  index: number,
  validMessageIds: Set<string>,
) {
  if (!isPlainRecord(branch)) return null;
  const messageIds = uniqueMessageIds(branch.messageIds, validMessageIds);
  if (messageIds.length === 0) return null;
  const label =
    compactString(branch.label) ||
    compactString(branch.condition) ||
    `分支 ${index + 1}`;
  const next: Record<string, unknown> = {
    ...branch,
    label,
    messageIds,
  };
  dropBlankOptionalTextFields(next, ["condition"]);
  return next;
}

function coversWholeMessageFlow(
  messageIds: string[],
  validMessageIds: Set<string>,
) {
  return (
    validMessageIds.size > 1 &&
    messageIds.length === validMessageIds.size &&
    messageIds.every((id) => validMessageIds.has(id))
  );
}

export function normalizeSequenceFragments(value: unknown, messages: unknown[]) {
  const validMessageIds = new Set(
    ensureArray(messages)
      .flatMap((message) => {
        if (!isPlainRecord(message)) return [];
        const id = compactString(message.id);
        return id ? [id] : [];
      }),
  );
  if (validMessageIds.size === 0) return [];

  const usedFragmentIds = new Set<string>();
  return ensureArray(value).flatMap((fragment, index) => {
    if (!isPlainRecord(fragment)) return [];
    const normalizedBranches = ensureArray(fragment.branches)
      .map((branch, branchIndex) =>
        normalizeBranch(branch, branchIndex, validMessageIds),
      )
      .filter((branch): branch is Record<string, unknown> => Boolean(branch));
    const branchMessageIds = uniqueMessageIds(
      normalizedBranches.flatMap((branch) => normalizeStringArray(branch.messageIds)),
      validMessageIds,
    );
    const explicitMessageIds = uniqueMessageIds(
      fragment.messageIds,
      validMessageIds,
    );
    const messageIds =
      explicitMessageIds.length > 0 ? explicitMessageIds : branchMessageIds;
    if (messageIds.length === 0) return [];

    let type = normalizeFragmentType(fragment.type);
    if (type === "loop" && coversWholeMessageFlow(messageIds, validMessageIds)) {
      return [];
    }
    if (type === "alt" && normalizedBranches.length < 2) {
      type = "opt";
    }

    const next: Record<string, unknown> = {
      ...fragment,
      id: uniqueId(fragment.id, index, usedFragmentIds),
      type,
      label: compactString(fragment.label) || fallbackFragmentLabel(type, index),
      messageIds,
    };
    if (normalizedBranches.length > 0) {
      next.branches = normalizedBranches;
    } else {
      delete next.branches;
    }
    dropBlankOptionalTextFields(next, ["condition", "description"]);
    return [next];
  });
}
