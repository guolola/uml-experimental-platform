// Repairs generated diagram graph structure before contract validation and rendering.
import { isPlainRecord } from "../json/parse-json.js";

function compactString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function stableId(value: string) {
  return value.replace(/[^a-z0-9_\-:.]+/gi, "_").replace(/^_+|_+$/g, "") || "node";
}

function uniqueId(base: string, used: Set<string>) {
  let id = stableId(base);
  let index = 2;
  while (used.has(id)) {
    id = `${stableId(base)}_${index}`;
    index += 1;
  }
  used.add(id);
  return id;
}

function relationshipKey(relationship: Record<string, unknown>) {
  return [
    relationship.type,
    relationship.sourceId,
    relationship.targetId,
    relationship.condition,
    relationship.guard,
    relationship.trigger,
    relationship.label,
  ]
    .map((value) => compactString(value).toLowerCase())
    .join("::");
}

function dedupeRelationships(relationships: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return relationships.filter((relationship) => {
    if (relationship.sourceId === relationship.targetId) return false;
    const key = relationshipKey(relationship);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEndLikeActivity(node: Record<string, unknown>) {
  if (node.type !== "activity") return false;
  const text = `${compactString(node.name)} ${compactString(node.description)}`;
  return /流程结束|结束流程|结束|终止|完成/iu.test(text);
}

export function normalizeActivityStructure(model: Record<string, unknown>) {
  const nodes: Record<string, unknown>[] = (Array.isArray(model.nodes) ? model.nodes : [])
    .filter(isPlainRecord)
    .map((node) => {
      if (isEndLikeActivity(node)) {
        const next: Record<string, unknown> = {
          ...node,
          type: "end",
          name: compactString(node.name) || "结束",
        };
        delete next.input;
        delete next.output;
        delete next.actorOrLane;
        return next;
      }
      return { ...node };
    });
  const usedNodeIds = new Set(
    nodes.map((node) => compactString(node.id)).filter(Boolean),
  );
  const relationships = (Array.isArray(model.relationships) ? model.relationships : [])
    .filter(isPlainRecord)
    .map((relationship) => ({ ...relationship }));

  if (nodes.length === 0) {
    nodes.push(
      { id: uniqueId("start", usedNodeIds), type: "start", name: "开始" },
      { id: uniqueId("end", usedNodeIds), type: "end", name: "结束" },
    );
  }

  const nodeIds = new Set(nodes.map((node) => compactString(node.id)).filter(Boolean));
  const endNodes = nodes.filter((node) => node.type === "end");
  const primaryEnd = endNodes[0];
  if (!primaryEnd) {
    nodes.push({ id: uniqueId("end", nodeIds), type: "end", name: "结束" });
  } else {
    const primaryEndId = compactString(primaryEnd.id);
    const duplicateEndIds = new Set(
      endNodes
        .slice(1)
        .map((node) => compactString(node.id))
        .filter(Boolean),
    );
    for (const relationship of relationships) {
      if (duplicateEndIds.has(compactString(relationship.targetId))) {
        relationship.targetId = primaryEndId;
      }
      if (duplicateEndIds.has(compactString(relationship.sourceId))) {
        relationship.sourceId = primaryEndId;
      }
    }
    if (duplicateEndIds.size > 0) {
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        if (duplicateEndIds.has(compactString(nodes[index]?.id))) {
          nodes.splice(index, 1);
        }
      }
    }
  }

  const refreshedIds = new Set(nodes.map((node) => compactString(node.id)).filter(Boolean));
  const validRelationships = dedupeRelationships(
    relationships.filter(
      (relationship) =>
        refreshedIds.has(compactString(relationship.sourceId)) &&
        refreshedIds.has(compactString(relationship.targetId)),
    ),
  );
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const relationship of validRelationships) {
    const sourceId = compactString(relationship.sourceId);
    const targetId = compactString(relationship.targetId);
    outgoing.set(sourceId, (outgoing.get(sourceId) ?? 0) + 1);
    incoming.set(targetId, (incoming.get(targetId) ?? 0) + 1);
  }

  const startNode =
    nodes.find((node) => node.type === "start") ??
    (() => {
      const start: Record<string, unknown> = {
        id: uniqueId("start", refreshedIds),
        type: "start",
        name: "开始",
      };
      nodes.unshift(start);
      return start;
    })();
  const startId = compactString(startNode.id);
  const endNode =
    nodes.find((node) => node.type === "end") ??
    (() => {
      const end: Record<string, unknown> = {
        id: uniqueId("end", refreshedIds),
        type: "end",
        name: "结束",
      };
      nodes.push(end);
      return end;
    })();
  const endId = compactString(endNode.id);
  const usedRelationshipIds = new Set(
    validRelationships.map((relationship) => compactString(relationship.id)).filter(Boolean),
  );

  const businessNodes = nodes.filter(
    (node) => node.type !== "start" && node.type !== "end",
  );
  const sourceNodes = businessNodes.filter(
    (node) => (incoming.get(compactString(node.id)) ?? 0) === 0,
  );
  const sinkNodes = businessNodes.filter(
    (node) => (outgoing.get(compactString(node.id)) ?? 0) === 0,
  );
  for (const node of sourceNodes.length > 0 ? sourceNodes : businessNodes.slice(0, 1)) {
    const targetId = compactString(node.id);
    if (!targetId || targetId === startId) continue;
    validRelationships.push({
      id: uniqueId(`flow_${startId}_${targetId}`, usedRelationshipIds),
      type: "control_flow",
      sourceId: startId,
      targetId,
    });
  }
  for (const node of sinkNodes.length > 0 ? sinkNodes : businessNodes.slice(-1)) {
    const sourceId = compactString(node.id);
    if (!sourceId || sourceId === endId) continue;
    validRelationships.push({
      id: uniqueId(`flow_${sourceId}_${endId}`, usedRelationshipIds),
      type: "control_flow",
      sourceId,
      targetId: endId,
    });
  }

  return {
    ...model,
    nodes,
    relationships: dedupeRelationships(validRelationships),
  };
}

function deploymentElementKinds(model: Record<string, unknown>) {
  const kinds = new Map<string, "node" | "database" | "component" | "external" | "artifact">();
  for (const [key, kind] of [
    ["nodes", "node"],
    ["databases", "database"],
    ["components", "component"],
    ["externalSystems", "external"],
    ["artifacts", "artifact"],
  ] as const) {
    for (const item of Array.isArray(model[key]) ? model[key] : []) {
      if (!isPlainRecord(item)) continue;
      const id = compactString(item.id);
      if (id) kinds.set(id, kind);
    }
  }
  return kinds;
}

function deploymentRelationshipAllowed(
  type: string,
  sourceKind: string | undefined,
  targetKind: string | undefined,
) {
  if (!sourceKind || !targetKind) return false;
  if (type === "hosting") return sourceKind === "node" && targetKind === "component";
  if (type === "deployment") {
    return (
      (sourceKind === "artifact" && (targetKind === "node" || targetKind === "component")) ||
      (sourceKind === "component" && targetKind === "node")
    );
  }
  if (type === "communication") {
    return sourceKind !== "artifact" && targetKind !== "artifact";
  }
  if (type === "dependency") {
    return sourceKind !== targetKind || sourceKind !== "artifact";
  }
  return false;
}

export function normalizeDeploymentStructure(model: Record<string, unknown>) {
  const kinds = deploymentElementKinds(model);
  const relationships = (Array.isArray(model.relationships) ? model.relationships : [])
    .filter(isPlainRecord)
    .flatMap((relationship) => {
      const type = compactString(relationship.type) || "communication";
      const sourceId = compactString(relationship.sourceId);
      const targetId = compactString(relationship.targetId);
      const sourceKind = kinds.get(sourceId);
      const targetKind = kinds.get(targetId);
      if (!deploymentRelationshipAllowed(type, sourceKind, targetKind)) {
        return [];
      }
      return [{ ...relationship, type, sourceId, targetId }];
    });
  return { ...model, relationships: dedupeRelationships(relationships) };
}

function isPrototypePlaceholder(node: Record<string, unknown>) {
  const text = `${compactString(node.name)} ${compactString(node.description)}`;
  return /后续路径|连接点|占位|中转|placeholder|connector/i.test(text);
}

export function normalizePrototypeStructure(model: Record<string, unknown>) {
  const nodes = (Array.isArray(model.nodes) ? model.nodes : [])
    .filter(isPlainRecord)
    .map((node) => ({ ...node }));
  const relationships = (Array.isArray(model.relationships) ? model.relationships : [])
    .filter(isPlainRecord)
    .map((relationship) => ({ ...relationship }));
  const usedNodeIds = new Set(nodes.map((node) => compactString(node.id)).filter(Boolean));

  const incoming = new Map<string, Record<string, unknown>[]>();
  const outgoing = new Map<string, Record<string, unknown>[]>();
  for (const relationship of relationships) {
    const sourceId = compactString(relationship.sourceId);
    const targetId = compactString(relationship.targetId);
    outgoing.set(sourceId, [...(outgoing.get(sourceId) ?? []), relationship]);
    incoming.set(targetId, [...(incoming.get(targetId) ?? []), relationship]);
  }

  const removeNodeIds = new Set<string>();
  const patchedRelationships: Record<string, unknown>[] = [...relationships];
  const usedRelationshipIds = new Set(
    patchedRelationships.map((relationship) => compactString(relationship.id)).filter(Boolean),
  );
  for (const node of nodes) {
    const nodeId = compactString(node.id);
    if (!nodeId || !isPrototypePlaceholder(node)) continue;
    const inEdges = incoming.get(nodeId) ?? [];
    const outEdges = outgoing.get(nodeId) ?? [];
    if (inEdges.length !== 1 || outEdges.length !== 1) continue;
    removeNodeIds.add(nodeId);
    patchedRelationships.push({
      ...outEdges[0],
      id: uniqueId(`nav_${compactString(inEdges[0]?.sourceId)}_${compactString(outEdges[0]?.targetId)}`, usedRelationshipIds),
      sourceId: inEdges[0]?.sourceId,
      targetId: outEdges[0]?.targetId,
      label: compactString(outEdges[0]?.label) || compactString(inEdges[0]?.label) || undefined,
    });
  }

  const keptNodes = nodes.filter((node) => !removeNodeIds.has(compactString(node.id)));
  if (!keptNodes.some((node) => node.nodeType === "entry-point")) {
    const entry = {
      id: uniqueId("entry", usedNodeIds),
      name: "入口",
      nodeType: "entry-point",
      sourceUseCaseIds: [],
      sourceRequirementIds: [],
    };
    keptNodes.unshift(entry);
    const target = keptNodes.find((node) => node !== entry && node.nodeType === "screen") ?? keptNodes[1];
    if (target) {
      patchedRelationships.push({
        id: uniqueId(`nav_${entry.id}_${compactString(target.id)}`, usedRelationshipIds),
        type: "navigation",
        sourceId: entry.id,
        targetId: compactString(target.id),
        label: "进入",
      });
    }
  }

  const nodeIds = new Set(keptNodes.map((node) => compactString(node.id)).filter(Boolean));
  const keptRelationships = patchedRelationships.filter(
    (relationship) =>
      !removeNodeIds.has(compactString(relationship.sourceId)) &&
      !removeNodeIds.has(compactString(relationship.targetId)) &&
      nodeIds.has(compactString(relationship.sourceId)) &&
      nodeIds.has(compactString(relationship.targetId)),
  );

  return {
    ...model,
    nodes: keptNodes,
    relationships: dedupeRelationships(keptRelationships),
  };
}
