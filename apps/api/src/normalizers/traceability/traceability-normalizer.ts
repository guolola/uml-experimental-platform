// Validates generated traceability references against the model elements that actually exist.
import {
  type DesignDiagramModelSpec,
  type DesignModelTraceabilityEntry,
  type DiagramModelSpec,
  type ModelElementRef,
  type RequirementModelTraceabilityEntry,
  type RequirementRule,
} from "@uml-platform/contracts";
import { ensureArray, isPlainRecord } from "../json/parse-json.js";

type RefMaps = {
  refs: ModelElementRef[];
  byKey: Map<string, ModelElementRef>;
  byId: Map<string, ModelElementRef>;
};

export type RequirementTraceabilityCoverageResult = {
  traceability: RequirementModelTraceabilityEntry[];
  missingTargets: ModelElementRef[];
};

export type DesignTraceabilityCoverageResult = {
  traceability: DesignModelTraceabilityEntry[];
  missingSources: ModelElementRef[];
};

function compactString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function normalizeMappingSource(
  value: unknown,
): DesignModelTraceabilityEntry["mappingSource"] {
  return value === "derived-from-endpoints" || value === "llm" ? value : undefined;
}

function refKey(diagramKind: string, elementId: string) {
  return `${diagramKind}:${elementId}`.toLowerCase();
}

function refEntryKey(ref: Pick<ModelElementRef, "diagramKind" | "elementId">) {
  return refKey(ref.diagramKind, ref.elementId);
}

function addRef(
  refs: ModelElementRef[],
  diagramKind: string,
  elementId: unknown,
  elementKind: string,
  label: unknown,
) {
  const id = compactString(elementId);
  if (!id) return;
  refs.push({
    diagramKind: diagramKind as ModelElementRef["diagramKind"],
    elementId: id,
    elementKind,
    label: compactString(label) || id,
  });
}

function activityNodeKind(nodeType: unknown) {
  switch (nodeType) {
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
    default:
      return "activity-node";
  }
}

function isBusinessElementKind(kind: string) {
  return ![
    "system-boundary",
    "swimlane",
    "start-node",
    "end-node",
    "merge-node",
    "fork-node",
    "join-node",
  ].includes(kind);
}

export function collectModelRefs(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
): RefMaps {
  const refs: ModelElementRef[] = [];
  for (const model of models) {
    const diagramKind = model.diagramKind;
    const record = model as unknown as Record<string, unknown>;
    const listKeys: Array<[string, string]> = [
      ["actors", "actor"],
      ["useCases", "usecase"],
      ["systemBoundaries", "system-boundary"],
      ["classes", "class"],
      ["interfaces", "interface"],
      ["enums", "enum"],
      ["swimlanes", "swimlane"],
      ["nodes", diagramKind === "deployment" ? "deployment-node" : "activity-node"],
      ["databases", "database"],
      ["components", "component"],
      ["externalSystems", "external-system"],
      ["artifacts", "artifact"],
      ["participants", "participant"],
      ["messages", "message"],
      ["fragments", "fragment"],
      ["tables", "table"],
    ];

    const businessElementIds = new Set<string>();
    for (const [key, defaultKind] of listKeys) {
      for (const item of ensureArray(record[key])) {
        if (!isPlainRecord(item)) continue;
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? activityNodeKind(item.type)
            : defaultKind;
        const beforeCount = refs.length;
        if (isBusinessElementKind(kind)) {
          addRef(refs, diagramKind, item.id, kind, item.name ?? item.label);
        }
        if (refs.length > beforeCount) {
          businessElementIds.add(refs.at(-1)!.elementId);
        }
        if (key === "tables") {
          for (const column of ensureArray(item.columns)) {
            if (!isPlainRecord(column)) continue;
            const tableId = compactString(item.id);
            const columnId = compactString(column.id);
            if (!tableId || !columnId) continue;
            addRef(
              refs,
              diagramKind,
              `${tableId}.${columnId}`,
              "table-column",
              `${compactString(item.name) || tableId}.${compactString(column.name) || columnId}`,
            );
            businessElementIds.add(`${tableId}.${columnId}`);
          }
        }
      }
    }

    for (const relationship of ensureArray(record.relationships)) {
      if (!isPlainRecord(relationship)) continue;
      if (
        diagramKind === "activity" &&
        (!businessElementIds.has(compactString(relationship.sourceId)) ||
          !businessElementIds.has(compactString(relationship.targetId)))
      ) {
        continue;
      }
      addRef(
        refs,
        diagramKind,
        relationship.id,
        "relationship",
        relationship.label ?? `${compactString(relationship.sourceId)} -> ${compactString(relationship.targetId)}`,
      );
    }
  }

  const byKey = new Map<string, ModelElementRef>();
  const byId = new Map<string, ModelElementRef>();
  for (const ref of refs) {
    byKey.set(refKey(ref.diagramKind, ref.elementId), ref);
    byId.set(ref.elementId.toLowerCase(), ref);
  }
  return { refs: Array.from(byKey.values()), byKey, byId };
}

function relationshipEndpointIds(
  relationship: Record<string, unknown>,
) {
  return [
    compactString(relationship.sourceId || relationship.sourceTableId),
    compactString(relationship.targetId || relationship.targetTableId),
  ].filter(Boolean);
}

function collectRelationshipEndpointRefs(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
) {
  const refs = collectModelRefs(models);
  const endpointsByRelationship = new Map<string, ModelElementRef[]>();

  for (const model of models) {
    const diagramKind = model.diagramKind;
    const record = model as unknown as Record<string, unknown>;
    for (const relationship of ensureArray(record.relationships)) {
      if (!isPlainRecord(relationship)) continue;
      const relationshipId = compactString(relationship.id);
      if (!relationshipId) continue;
      const relationshipRef = refs.byKey.get(refKey(diagramKind, relationshipId));
      if (!relationshipRef) continue;
      const endpoints = relationshipEndpointIds(relationship)
        .map((id) => refs.byKey.get(refKey(diagramKind, id)))
        .filter((ref): ref is ModelElementRef => Boolean(ref));
      if (endpoints.length > 0) {
        endpointsByRelationship.set(refEntryKey(relationshipRef), endpoints);
      }
    }
  }

  return endpointsByRelationship;
}

function resolveRef(raw: unknown, maps: RefMaps) {
  if (!isPlainRecord(raw)) return null;
  const diagramKind = compactString(raw.diagramKind);
  const elementId = compactString(raw.elementId ?? raw.id);
  if (!diagramKind || !elementId) return null;
  return maps.byKey.get(refKey(diagramKind, elementId)) ?? null;
}

function missingRefsForTargets(
  refs: ModelElementRef[],
  coveredRefs: Iterable<ModelElementRef>,
) {
  const coveredKeys = new Set(
    Array.from(coveredRefs, (ref) => refKey(ref.diagramKind, ref.elementId)),
  );
  return refs.filter((ref) => !coveredKeys.has(refKey(ref.diagramKind, ref.elementId)));
}

export function formatTraceabilityMissingRefs(
  scope: "requirement" | "design",
  missingRefs: ModelElementRef[],
) {
  const label = scope === "requirement" ? "需求元素" : "设计元素";
  const preview = missingRefs
    .slice(0, 8)
    .map((ref) => `${ref.diagramKind}:${ref.elementId}`)
    .join("、");
  const suffix = missingRefs.length > 8 ? ` 等 ${missingRefs.length} 个` : "";
  return `缺少 ${missingRefs.length} 个${label}映射：${preview}${suffix}`;
}

export function normalizeRequirementTraceability(
  raw: unknown,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
): RequirementModelTraceabilityEntry[] {
  return normalizeRequirementTraceabilityWithCoverage(raw, rules, models).traceability;
}

export function normalizeRequirementTraceabilityWithCoverage(
  raw: unknown,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
): RequirementTraceabilityCoverageResult {
  const validRules = new Set(rules.map((rule) => rule.id.toLowerCase()));
  const requirementRefs = collectModelRefs(models);
  const traceability = ensureArray(raw).flatMap((entry) => {
    if (!isPlainRecord(entry)) return [];
    const ruleId = compactString(entry.ruleId);
    if (!ruleId || !validRules.has(ruleId.toLowerCase())) return [];
    const target = resolveRef(entry.target, requirementRefs);
    return target ? [{ ruleId, target }] : [];
  });
  const missingTargets = missingRefsForTargets(
    requirementRefs.refs,
    traceability.map((entry) => entry.target),
  );
  return { traceability, missingTargets };
}

export function normalizeDesignTraceability(
  raw: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
): DesignModelTraceabilityEntry[] {
  return normalizeDesignTraceabilityWithCoverage(
    raw,
    designModels,
    requirementModels,
  ).traceability;
}

export function normalizeDesignTraceabilityWithCoverage(
  raw: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
): DesignTraceabilityCoverageResult {
  const designRefs = collectModelRefs(designModels);
  return normalizeDesignTraceabilityForSources(
    raw,
    designRefs.refs,
    requirementModels,
  );
}

export function normalizeDesignTraceabilityForSources(
  raw: unknown,
  requiredSources: ModelElementRef[],
  requirementModels: DiagramModelSpec[],
): DesignTraceabilityCoverageResult {
  const designRefs = mapsForRefs(requiredSources);
  const requirementRefs = collectModelRefs(requirementModels);
  const traceability = ensureArray(raw).flatMap((entry) => {
    if (!isPlainRecord(entry)) return [];
    const source = resolveRef(entry.source, designRefs);
    if (!source) return [];
    const targets = ensureArray(entry.targets)
      .map((target) => resolveRef(target, requirementRefs))
      .filter((target): target is ModelElementRef => Boolean(target));
    return targets.length > 0
      ? [
          {
            source,
            targets,
            mappingSource: normalizeMappingSource(entry.mappingSource),
            rationale: compactString(entry.rationale) || undefined,
          },
        ]
      : [];
  });
  const missingSources = missingRefsForTargets(
    requiredSources,
    traceability.map((entry) => entry.source),
  );
  return { traceability, missingSources };
}

function mapsForRefs(refs: ModelElementRef[]): RefMaps {
  const byKey = new Map<string, ModelElementRef>();
  const byId = new Map<string, ModelElementRef>();
  for (const ref of refs) {
    byKey.set(refEntryKey(ref), ref);
    byId.set(ref.elementId.toLowerCase(), ref);
  }
  return { refs: Array.from(byKey.values()), byKey, byId };
}

export function deriveDesignRelationshipTraceability(
  current: DesignModelTraceabilityEntry[],
  designModels: DesignDiagramModelSpec[],
) {
  const endpointRefs = collectRelationshipEndpointRefs(designModels);
  const designRefs = collectModelRefs(designModels);
  const bySource = new Map<string, DesignModelTraceabilityEntry>();
  for (const entry of current) {
    bySource.set(refEntryKey(entry.source), entry);
  }

  const derived: DesignModelTraceabilityEntry[] = [];
  for (const [relationshipKey, endpoints] of endpointRefs) {
    if (bySource.has(relationshipKey)) continue;
    const targets = new Map<string, ModelElementRef>();
    for (const endpoint of endpoints) {
      const endpointTrace = bySource.get(refEntryKey(endpoint));
      for (const target of endpointTrace?.targets ?? []) {
        targets.set(refEntryKey(target), target);
      }
    }
    if (targets.size === 0) continue;
    const relationshipRef = designRefs.byKey.get(relationshipKey);
    if (!relationshipRef) continue;
    derived.push({
      source: relationshipRef,
      targets: Array.from(targets.values()),
      mappingSource: "derived-from-endpoints",
      rationale: "由关系两端设计元素的需求映射合并推导",
    });
  }

  return mergeDesignTraceability(current, derived);
}

export function mergeRequirementTraceability(
  current: RequirementModelTraceabilityEntry[],
  patch: RequirementModelTraceabilityEntry[],
) {
  const merged = new Map<string, RequirementModelTraceabilityEntry>();
  for (const entry of [...current, ...patch]) {
    merged.set(
      `${entry.ruleId.toLowerCase()}:${refKey(entry.target.diagramKind, entry.target.elementId)}`,
      entry,
    );
  }
  return Array.from(merged.values());
}

export function mergeDesignTraceability(
  current: DesignModelTraceabilityEntry[],
  patch: DesignModelTraceabilityEntry[],
) {
  const merged = new Map<string, DesignModelTraceabilityEntry>();
  for (const entry of [...current, ...patch]) {
    const key = refKey(entry.source.diagramKind, entry.source.elementId);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      continue;
    }
    const targets = new Map<string, ModelElementRef>();
    for (const target of [...existing.targets, ...entry.targets]) {
      targets.set(refKey(target.diagramKind, target.elementId), target);
    }
    merged.set(key, {
      source: existing.source,
      targets: Array.from(targets.values()),
      mappingSource: existing.mappingSource ?? entry.mappingSource,
      rationale: existing.rationale ?? entry.rationale,
    });
  }
  return Array.from(merged.values());
}
