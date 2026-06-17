// Normalizes requirement LLM diagram models before validating the public contract.
import {
  diagramModelsResultSchema,
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
  sanitizeTraceabilityEntries,
} from "../traceability/traceability-normalizer.js";
import { dedupeActivityModel } from "../diagrams/activity-dedupe.js";
import {
  normalizeActivityStructure,
  normalizeDeploymentStructure,
  normalizePrototypeStructure,
} from "../diagrams/diagram-structure.js";
import { normalizeLongDiagramTextField } from "../diagrams/relationship-labels.js";

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
    "participants",
    "messages",
    "fragments",
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

function omitNullValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitNullValues);
  }
  if (!isPlainRecord(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null) continue;
    next[key] = omitNullValues(item);
  }
  return next;
}

function normalizeSequenceMessageType(value: unknown) {
  if (value === "async" || value === "return" || value === "create" || value === "destroy") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("return") || lower.includes("response") || lower.includes("reply")) {
      return "return";
    }
    if (lower.includes("async") || lower.includes("event") || lower.includes("message")) {
      return "async";
    }
    if (lower.includes("create")) return "create";
    if (lower.includes("destroy") || lower.includes("delete")) return "destroy";
  }
  return "sync";
}

function normalizeSequenceFragment(fragment: Record<string, unknown>) {
  const branches = ensureArray(fragment.branches)
    .map((branch) => {
      if (!isPlainRecord(branch)) return null;
      const nextBranch = {
        ...branch,
        messageIds: normalizeStringArray(branch.messageIds),
      };
      dropBlankOptionalTextFields(nextBranch, ["condition"]);
      return nextBranch;
    })
    .filter(Boolean);
  const branchMessageIds = branches.flatMap((branch) =>
    isPlainRecord(branch) ? normalizeStringArray(branch.messageIds) : [],
  );
  const messageIds = normalizeStringArray(fragment.messageIds);
  const next: Record<string, unknown> = {
    ...fragment,
    messageIds: messageIds.length > 0 ? messageIds : branchMessageIds,
  };
  if (branches.length > 0) {
    next.branches = branches;
  } else {
    delete next.branches;
  }
  dropBlankOptionalTextFields(next, ["condition", "description"]);
  return next;
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

function normalizeEventFlows(value: unknown) {
  return ensureArray(value).map((flow) => {
    if (!isPlainRecord(flow)) return flow;
    return {
      ...flow,
      steps: ensureArray(flow.steps).map((step, index) =>
        isPlainRecord(step)
          ? {
              ...step,
              order:
                typeof step.order === "number" && Number.isFinite(step.order)
                  ? step.order
                  : index + 1,
            }
          : step,
      ),
    };
  });
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
  diagramKind: unknown,
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
  normalizeRelationshipDisplayFields(normalized, diagramKind);
  return normalized;
}

function normalizeRelationshipDisplayFields(
  relationship: Record<string, unknown>,
  diagramKind: unknown,
) {
  if (diagramKind === "activity") {
    normalizeLongDiagramTextField(relationship, "condition", 14);
    normalizeLongDiagramTextField(relationship, "guard", 14);
    normalizeLongDiagramTextField(relationship, "trigger", 14);
    return relationship;
  }
  normalizeLongDiagramTextField(relationship, "label", diagramKind === "deployment" ? 16 : 18);
  return relationship;
}

function normalizeSequenceDisplayFields(record: Record<string, unknown>) {
  record.messages = ensureArray(record.messages).map((message) => {
    if (!isPlainRecord(message)) return message;
    const next = { ...message };
    dropBlankOptionalTextFields(next, ["returnValue", "condition", "description"]);
    normalizeLongDiagramTextField(next, "name", 20);
    normalizeLongDiagramTextField(next, "condition", 14);
    return next;
  });
  record.fragments = ensureArray(record.fragments).map((fragment) => {
    if (!isPlainRecord(fragment)) return fragment;
    const next = { ...fragment };
    dropBlankOptionalTextFields(next, ["condition", "description"]);
    normalizeLongDiagramTextField(next, "label", 16);
    normalizeLongDiagramTextField(next, "condition", 14);
    if (Array.isArray(next.branches)) {
      next.branches = next.branches.map((branch) => {
        if (!isPlainRecord(branch)) return branch;
        const nextBranch = { ...branch };
        dropBlankOptionalTextFields(nextBranch, ["condition"]);
        normalizeLongDiagramTextField(nextBranch, "label", 14);
        normalizeLongDiagramTextField(nextBranch, "condition", 14);
        return nextBranch;
      });
    }
    return next;
  });
  return record;
}

function normalizeRequirementDiagramModel(model: unknown) {
  if (!isPlainRecord(model)) return model;
  const cleaned = omitNullValues(model);
  if (!isPlainRecord(cleaned)) return cleaned;
  const diagramKind = cleaned.diagramKind;
  const normalized: Record<string, unknown> = {
    ...cleaned,
    notes: normalizeStringArray(cleaned.notes),
  };

  if (diagramKind === "function") {
    if (typeof normalized.modelId !== "string") {
      normalized.modelId = "function";
    }
    normalized.nodes = ensureArray(normalized.nodes).map((node) =>
      isPlainRecord(node)
        ? {
            ...node,
            sourceRequirementIds: normalizeStringArray(node.sourceRequirementIds),
          }
        : node,
    );
    normalized.relationships = ensureArray(normalized.relationships);
  } else if (diagramKind === "usecase") {
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
            eventFlows: normalizeEventFlows(useCase.eventFlows),
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
          constraints: normalizeStringArray(classItem.constraints),
          attributes: ensureArray(classItem.attributes).map((attribute) =>
            isPlainRecord(attribute)
              ? {
                  ...attribute,
                  constraints: normalizeStringArray(attribute.constraints),
                }
              : attribute,
          ),
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
        ? {
            ...interfaceItem,
            constraints: normalizeStringArray(interfaceItem.constraints),
            operations: [],
          }
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
    normalized.relationships = ensureArray(normalized.relationships);
  } else if (diagramKind === "prototype") {
    normalized.nodes = ensureArray(normalized.nodes).map((node) =>
      isPlainRecord(node)
        ? {
            ...node,
            sourceUseCaseIds: normalizeStringArray(node.sourceUseCaseIds),
            sourceRequirementIds: normalizeStringArray(node.sourceRequirementIds),
          }
        : node,
    );
    normalized.relationships = ensureArray(normalized.relationships);
  } else if (diagramKind === "analysis") {
    const sourceUseCaseId =
      typeof normalized.sourceUseCaseId === "string"
        ? normalized.sourceUseCaseId.trim()
        : "";
    const sourceUseCaseName =
      typeof normalized.sourceUseCaseName === "string"
        ? normalized.sourceUseCaseName.trim()
        : "";
    if (sourceUseCaseId && typeof normalized.modelId !== "string") {
      normalized.modelId = `analysis:${sourceUseCaseId}`;
    }
    if (typeof normalized.title !== "string" || !normalized.title.trim()) {
      normalized.title = sourceUseCaseName
        ? `${sourceUseCaseName}需求分析模型`
        : `${sourceUseCaseId || "需求"}分析模型`;
    }
    if (typeof normalized.summary !== "string" || !normalized.summary.trim()) {
      normalized.summary = `${sourceUseCaseName || sourceUseCaseId || "该用例"}的需求阶段交互分析。`;
    }
    normalized.participants = ensureArray(normalized.participants).map((participant) => {
      if (!isPlainRecord(participant)) return participant;
      const next = { ...participant };
      dropBlankOptionalTextFields(next, ["description"]);
      return next;
    });
    normalized.messages = ensureArray(normalized.messages).map((message) =>
      isPlainRecord(message)
        ? {
            ...message,
            type: normalizeSequenceMessageType(message.type),
            parameters: normalizeStringArray(message.parameters),
          }
        : message,
    );
    normalized.fragments = ensureArray(normalized.fragments).map((fragment) =>
      isPlainRecord(fragment) ? normalizeSequenceFragment(fragment) : fragment,
    );
    normalizeSequenceDisplayFields(normalized);
  }

  const maps = normalizeRequirementModelElementMaps(normalized);
  normalized.relationships = ensureArray(normalized.relationships)
    .map((relationship) => normalizeRequirementRelationship(relationship, maps, diagramKind))
    .filter(Boolean);

  if (diagramKind === "activity") {
    return normalizeActivityStructure(dedupeActivityModel(normalized));
  }
  if (diagramKind === "deployment") {
    return normalizeDeploymentStructure(normalized);
  }
  if (diagramKind === "prototype") {
    return normalizePrototypeStructure(normalized);
  }
  return normalized;
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
  const cleaned = omitNullValues(parsed);
  const normalized = isPlainRecord(cleaned)
    ? {
        ...cleaned,
        models: ensureArray(cleaned.models).map(normalizeRequirementDiagramModel),
      }
    : cleaned;
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
  const parsed = omitNullValues(parseJson<unknown>(value));
  const rawTraceability = isPlainRecord(parsed)
    ? sanitizeTraceabilityEntries(parsed.requirementModelTraceability)
    : [];
  return normalizeRequirementTraceabilityWithCoverage(rawTraceability, rules, models);
}
