// Softly merges repeated activity actions while preserving the surrounding flow graph.
import { isPlainRecord } from "../json/parse-json.js";

function stableText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function stableList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stableText).filter(Boolean).sort().join("|")
    : "";
}

function activityNodeKey(node: Record<string, unknown>) {
  if (node.type !== "activity") return null;
  const name = stableText(node.name);
  if (!name) return null;
  return [
    name,
    stableText(node.actorOrLane),
    stableList(node.input),
    stableList(node.output),
  ].join("::");
}

function relationshipKey(relationship: Record<string, unknown>) {
  return [
    relationship.type,
    relationship.sourceId,
    relationship.targetId,
    relationship.condition,
    relationship.guard,
    relationship.trigger,
  ]
    .map((value) => String(value ?? ""))
    .join("::");
}

export function dedupeActivityModel(model: Record<string, unknown>) {
  const replacementById = new Map<string, string>();
  const firstNodeByKey = new Map<string, Record<string, unknown>>();
  const nextNodes: unknown[] = [];

  for (const node of Array.isArray(model.nodes) ? model.nodes : []) {
    if (!isPlainRecord(node)) {
      nextNodes.push(node);
      continue;
    }
    const key = activityNodeKey(node);
    const id = typeof node.id === "string" ? node.id : "";
    const existing = key ? firstNodeByKey.get(key) : undefined;
    if (key && existing && id && typeof existing.id === "string") {
      replacementById.set(id, existing.id);
      continue;
    }
    if (key) {
      firstNodeByKey.set(key, node);
    }
    nextNodes.push(node);
  }

  if (replacementById.size === 0) {
    return model;
  }

  const relationshipKeys = new Set<string>();
  const nextRelationships = (Array.isArray(model.relationships) ? model.relationships : [])
    .map((relationship) => {
      if (!isPlainRecord(relationship)) return relationship;
      const sourceId =
        typeof relationship.sourceId === "string"
          ? replacementById.get(relationship.sourceId) ?? relationship.sourceId
          : relationship.sourceId;
      const targetId =
        typeof relationship.targetId === "string"
          ? replacementById.get(relationship.targetId) ?? relationship.targetId
          : relationship.targetId;
      return { ...relationship, sourceId, targetId };
    })
    .filter((relationship) => {
      if (!isPlainRecord(relationship)) return true;
      if (relationship.sourceId === relationship.targetId) return false;
      const key = relationshipKey(relationship);
      if (relationshipKeys.has(key)) return false;
      relationshipKeys.add(key);
      return true;
    });

  return {
    ...model,
    nodes: nextNodes,
    relationships: nextRelationships,
  };
}
