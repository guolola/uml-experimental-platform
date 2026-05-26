// Normalizes requirement LLM diagram models before validating the public contract.
import {
  diagramModelsResultSchema,
  requirementModelTraceabilityEntrySchema,
  type DiagramModelSpec,
  type RequirementRule,
} from "@uml-platform/contracts";
import {
  ensureArray,
  isPlainRecord,
  normalizeStringArray,
  parseJson,
} from "../json/parse-json.js";
import {
  formatTraceabilityMissingRefs,
  normalizeRequirementTraceabilityWithCoverage,
} from "../traceability/traceability-normalizer.js";
import { dedupeActivityModel } from "../diagrams/activity-dedupe.js";

function isRequirementServiceClass(classItem: Record<string, unknown>) {
  const classKind = typeof classItem.classKind === "string" ? classItem.classKind.toLowerCase() : "";
  const stereotype =
    typeof classItem.stereotype === "string" ? classItem.stereotype.toLowerCase() : "";
  const name = typeof classItem.name === "string" ? classItem.name.trim() : "";
  return (
    classKind === "service" ||
    stereotype.includes("service") ||
    /(?:service|controller|repository|manager)$/i.test(name)
  );
}

function normalizeRequirementModelElementMaps(model: Record<string, unknown>) {
  const candidates: unknown[] = [];
  for (const key of [
    "actors",
    "useCases",
    "systemBoundaries",
    "classes",
    "interfaces",
    "enums",
    "swimlanes",
    "nodes",
    "databases",
    "components",
    "externalSystems",
    "artifacts",
  ]) {
    candidates.push(...ensureArray(model[key]));
  }

  const byName = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const item of candidates) {
    if (!isPlainRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    byId.set(id.toLowerCase(), id);
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (name) {
      byName.set(name.toLowerCase(), id);
    }
  }
  return { byName, byId };
}

function resolveRequirementEndpoint(
  value: unknown,
  maps: ReturnType<typeof normalizeRequirementModelElementMaps>,
) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  const raw = String(value).trim();
  if (!raw) return "";
  return maps.byId.get(raw.toLowerCase()) ?? maps.byName.get(raw.toLowerCase()) ?? raw;
}

function normalizeRequirementRelationship(
  relationship: unknown,
  maps: ReturnType<typeof normalizeRequirementModelElementMaps>,
) {
  if (!isPlainRecord(relationship)) return null;
  const normalized: Record<string, unknown> = { ...relationship };
  const sourceCandidate =
    normalized.sourceId ??
    normalized.source ??
    normalized.from ??
    normalized.start ??
    normalized.sourceRef ??
    normalized.sourceNodeId ??
    normalized.sourceUseCaseId ??
    normalized.actorId ??
    normalized.sourceName;
  const targetCandidate =
    normalized.targetId ??
    normalized.target ??
    normalized.to ??
    normalized.end ??
    normalized.targetRef ??
    normalized.targetNodeId ??
    normalized.targetUseCaseId ??
    normalized.useCaseId ??
    normalized.targetName;
  const sourceId = resolveRequirementEndpoint(sourceCandidate, maps);
  const targetId = resolveRequirementEndpoint(targetCandidate, maps);
  if (!sourceId || !targetId) {
    return null;
  }
  normalized.sourceId = sourceId;
  normalized.targetId = targetId;
  if ("port" in normalized && normalized.port !== undefined && normalized.port !== null) {
    normalized.port = String(normalized.port);
  }
  return normalized;
}

function normalizeRequirementDiagramModel(model: unknown) {
  if (!isPlainRecord(model)) return model;
  const diagramKind = model.diagramKind;
  const normalized: Record<string, unknown> = {
    ...model,
    notes: normalizeStringArray(model.notes),
  };

  if (diagramKind === "usecase") {
    normalized.actors = ensureArray(normalized.actors).map((actor) =>
      isPlainRecord(actor)
        ? { ...actor, responsibilities: normalizeStringArray(actor.responsibilities) }
        : actor,
    );
    normalized.useCases = ensureArray(normalized.useCases).map((useCase) =>
      isPlainRecord(useCase)
        ? {
            ...useCase,
            preconditions: normalizeStringArray(useCase.preconditions),
            postconditions: normalizeStringArray(useCase.postconditions),
            supportingActorIds: normalizeStringArray(useCase.supportingActorIds),
          }
        : useCase,
    );
    normalized.systemBoundaries = ensureArray(normalized.systemBoundaries);
  } else if (diagramKind === "class") {
    const removedClassIds = new Set<string>();
    normalized.classes = ensureArray(normalized.classes)
      .map((classItem) => {
        if (!isPlainRecord(classItem)) return classItem;
        if (isRequirementServiceClass(classItem)) {
          if (typeof classItem.id === "string") removedClassIds.add(classItem.id);
          return null;
        }
        const nextClass: Record<string, unknown> = {
          ...classItem,
          attributes: ensureArray(classItem.attributes),
          operations: [],
          stereotypes: normalizeStringArray(classItem.stereotypes),
        };
        delete nextClass.methods;
        if (nextClass.classKind === "service") {
          nextClass.classKind = "other";
        }
        return nextClass;
      })
      .filter(Boolean);
    normalized.interfaces = ensureArray(normalized.interfaces).map((interfaceItem) =>
      isPlainRecord(interfaceItem)
        ? { ...interfaceItem, operations: [] }
        : interfaceItem,
    );
    normalized.enums = ensureArray(normalized.enums).map((enumItem) =>
      isPlainRecord(enumItem)
        ? { ...enumItem, literals: normalizeStringArray(enumItem.literals) }
        : enumItem,
    );
    normalized.relationships = ensureArray(normalized.relationships).filter(
      (relationship) => {
        if (!isPlainRecord(relationship)) return true;
        return !(
          (typeof relationship.sourceId === "string" &&
            removedClassIds.has(relationship.sourceId)) ||
          (typeof relationship.targetId === "string" &&
            removedClassIds.has(relationship.targetId))
        );
      },
    );
  } else if (diagramKind === "activity") {
    normalized.swimlanes = ensureArray(normalized.swimlanes);
    normalized.nodes = ensureArray(normalized.nodes).map((node) =>
      isPlainRecord(node)
        ? {
            ...node,
            input: "input" in node ? normalizeStringArray(node.input) : node.input,
            output: "output" in node ? normalizeStringArray(node.output) : node.output,
          }
        : node,
    );
    normalized.relationships = ensureArray(normalized.relationships);
  } else if (diagramKind === "deployment") {
    normalized.nodes = ensureArray(normalized.nodes);
    normalized.databases = ensureArray(normalized.databases);
    normalized.components = ensureArray(normalized.components);
    normalized.externalSystems = ensureArray(normalized.externalSystems);
    normalized.artifacts = ensureArray(normalized.artifacts);
  }

  const maps = normalizeRequirementModelElementMaps(normalized);
  normalized.relationships = ensureArray(normalized.relationships)
    .map((relationship) => normalizeRequirementRelationship(relationship, maps))
    .filter(Boolean);

  return diagramKind === "activity" ? dedupeActivityModel(normalized) : normalized;
}

export function parseRequirementDiagramModelsResult(
  value: string,
  rules: RequirementRule[] = [],
) {
  const parsed = parseJson<unknown>(value);
  const result = parseRequirementDiagramModelsOnlyFromParsed(parsed);
  const { requirementModelTraceability } = assertCompleteRequirementTraceability(
    isPlainRecord(parsed) ? parsed.requirementModelTraceability : undefined,
    rules,
    result.models,
  );
  if (requirementModelTraceability.length === 0) {
    throw new Error(
      "generate_models must return non-empty requirementModelTraceability with valid rule-to-element references",
    );
  }
  return {
    ...result,
    requirementModelTraceability,
  };
}

function assertCompleteRequirementTraceability(
  rawTraceability: unknown,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const { traceability: requirementModelTraceability, missingTargets } =
    normalizeRequirementTraceabilityWithCoverage(rawTraceability, rules, models);
  if (requirementModelTraceability.length === 0) {
    throw new Error(
      "generate_models must return non-empty requirementModelTraceability with valid rule-to-element references",
    );
  }
  if (missingTargets.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("requirement", missingTargets));
  }
  return { requirementModelTraceability };
}

function parseRequirementDiagramModelsOnlyFromParsed(parsed: unknown) {
  const normalized = isPlainRecord(parsed)
    ? {
        ...parsed,
        models: ensureArray(parsed.models).map(normalizeRequirementDiagramModel),
      }
    : parsed;
  const result = diagramModelsResultSchema
    .omit({ requirementModelTraceability: true })
    .parse(normalized);
  if (result.models.length === 0) {
    throw new Error("generate_models must return at least one model");
  }
  return result;
}

export function parseRequirementDiagramModelsOnly(value: string) {
  return parseRequirementDiagramModelsOnlyFromParsed(parseJson<unknown>(value));
}

export function parseRequirementTraceabilityResult(
  value: string,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const coverage = parseRequirementTraceabilityCoverageResult(value, rules, models);
  if (coverage.traceability.length === 0) {
    throw new Error(
      "generate_models must return non-empty requirementModelTraceability with valid rule-to-element references",
    );
  }
  if (coverage.missingTargets.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("requirement", coverage.missingTargets));
  }
  return { requirementModelTraceability: coverage.traceability };
}

export function parseRequirementTraceabilityCoverageResult(
  value: string,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const parsed = parseJson<unknown>(value);
  const rawTraceability = isPlainRecord(parsed)
    ? requirementModelTraceabilityEntrySchema
        .array()
        .parse(ensureArray(parsed.requirementModelTraceability))
    : [];
  return normalizeRequirementTraceabilityWithCoverage(rawTraceability, rules, models);
}
