// Normalizes design LLM diagram models before validating the public contract.
import {
  designDiagramModelsResultSchema,
  type DesignDiagramModelSpec,
  type DiagramModelSpec,
  type ModelElementRef,
} from "@uml-platform/contracts";
import {
  ensureArray,
  isPlainRecord,
  normalizeStringArray,
  parseJson,
} from "../json/parse-json.js";
import {
  deriveDesignRelationshipTraceability,
  formatTraceabilityMissingRefs,
  normalizeDesignTraceabilityForSources,
  normalizeDesignTraceabilityWithCoverage,
  sanitizeTraceabilityEntries,
} from "../traceability/traceability-normalizer.js";
import { dedupeActivityModel } from "../diagrams/activity-dedupe.js";
import {
  normalizeActivityStructure,
  normalizeDeploymentStructure,
} from "../diagrams/diagram-structure.js";
import { normalizeLongDiagramTextField } from "../diagrams/relationship-labels.js";
import { normalizeSequenceFragments } from "../diagrams/sequence-fragments.js";

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
    if (lower.includes("create")) {
      return "create";
    }
    if (lower.includes("destroy") || lower.includes("delete")) {
      return "destroy";
    }
  }
  return "sync";
}

function normalizeClassKind(value: unknown) {
  if (
    value === "entity" ||
    value === "aggregate" ||
    value === "valueObject" ||
    value === "service" ||
    value === "other"
  ) {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase().replace(/[\s_\-]+/g, "");
    if (lower.includes("aggregate")) return "aggregate";
    if (lower.includes("valueobject") || lower.includes("vo")) return "valueObject";
    if (lower.includes("service")) return "service";
    if (lower.includes("entity") || lower.includes("domain")) return "entity";
  }
  return undefined;
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
  normalizeLongDiagramTextField(
    relationship,
    "label",
    diagramKind === "deployment" || diagramKind === "table" ? 16 : 18,
  );
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

function normalizeDesignDiagramModel(model: unknown) {
  if (!isPlainRecord(model)) return model;

  const normalized: Record<string, unknown> = { ...model };
  normalized.notes = normalizeStringArray(normalized.notes);
  const diagramKind = normalized.diagramKind;
  if (
    typeof diagramKind === "string" &&
    diagramKind !== "sequence" &&
    typeof normalized.modelId !== "string"
  ) {
    normalized.modelId = diagramKind;
  }

  if (diagramKind === "architecture") {
    normalized.packages = ensureArray(normalized.packages).map((packageItem) =>
      isPlainRecord(packageItem)
        ? {
            ...packageItem,
            componentIds: normalizeStringArray(packageItem.componentIds),
          }
        : packageItem,
    );
    normalized.components = ensureArray(normalized.components).map((component) =>
      isPlainRecord(component)
        ? {
            ...component,
            sourceRequirementIds: normalizeStringArray(component.sourceRequirementIds),
          }
        : component,
    );
    normalized.relationships = ensureArray(normalized.relationships).map((relationship) =>
      isPlainRecord(relationship)
        ? normalizeRelationshipDisplayFields({ ...relationship }, diagramKind)
        : relationship,
    );
  } else if (diagramKind === "sequence") {
    const sourceUseCaseId =
      typeof normalized.sourceUseCaseId === "string"
        ? normalized.sourceUseCaseId.trim()
        : "";
    const sourceUseCaseName =
      typeof normalized.sourceUseCaseName === "string"
        ? normalized.sourceUseCaseName.trim()
        : "";
    if (sourceUseCaseId && typeof normalized.modelId !== "string") {
      normalized.modelId = `sequence:${sourceUseCaseId}`;
    }
    if (typeof normalized.title !== "string" || !normalized.title.trim()) {
      normalized.title = sourceUseCaseName
        ? `${sourceUseCaseName}用例实现设计`
        : `${sourceUseCaseId || "设计"}用例实现设计`;
    }
    if (typeof normalized.summary !== "string" || !normalized.summary.trim()) {
      const title = typeof normalized.title === "string" ? normalized.title.trim() : "";
      normalized.summary = `${title || sourceUseCaseName || sourceUseCaseId || "该用例"}的对象交互流程。`;
    }
    normalized.participants = ensureArray(normalized.participants).map((participant) => {
      if (!isPlainRecord(participant)) return participant;
      const next = { ...participant };
      dropBlankOptionalTextFields(next, ["description"]);
      return next;
    });
    normalized.messages = ensureArray(normalized.messages).map((message) => {
      if (!isPlainRecord(message)) return message;
      return {
        ...message,
        type: normalizeSequenceMessageType(message.type),
        parameters: normalizeStringArray(message.parameters),
      };
    });
    normalized.fragments = normalizeSequenceFragments(
      normalized.fragments,
      ensureArray(normalized.messages),
    );
    normalizeSequenceDisplayFields(normalized);
  } else if (diagramKind === "class") {
    normalized.classes = ensureArray(normalized.classes).map((classItem) => {
      if (!isPlainRecord(classItem)) return classItem;
      const nextClass: Record<string, unknown> = {
        ...classItem,
        attributes: ensureArray(classItem.attributes),
        operations: ensureArray(classItem.operations ?? classItem.methods),
        stereotypes: normalizeStringArray(classItem.stereotypes),
      };
      delete nextClass.methods;
      const classKind = normalizeClassKind(nextClass.classKind);
      if (classKind) {
        nextClass.classKind = classKind;
      } else {
        delete nextClass.classKind;
      }
      return nextClass;
    });
    normalized.interfaces = ensureArray(normalized.interfaces).map((item) => {
      if (!isPlainRecord(item)) return item;
      return {
        ...item,
        operations: ensureArray(item.operations ?? item.methods),
      };
    });
    normalized.enums = ensureArray(normalized.enums).map((item) => {
      if (!isPlainRecord(item)) return item;
      return {
        ...item,
        literals: normalizeStringArray(item.literals),
      };
    });
    normalized.relationships = ensureArray(normalized.relationships).map((relationship) =>
      isPlainRecord(relationship)
        ? normalizeRelationshipDisplayFields({ ...relationship }, diagramKind)
        : relationship,
    );
  } else if (diagramKind === "activity") {
    normalized.swimlanes = ensureArray(normalized.swimlanes);
    normalized.nodes = ensureArray(normalized.nodes).map((node) => {
      if (!isPlainRecord(node)) return node;
      if (node.type === "activity") {
        return {
          ...node,
          input: normalizeStringArray("input" in node ? node.input : []),
          output: normalizeStringArray("output" in node ? node.output : []),
        };
      }
      return {
        ...node,
        input: "input" in node ? normalizeStringArray(node.input) : node.input,
        output: "output" in node ? normalizeStringArray(node.output) : node.output,
      };
    });
    normalized.relationships = ensureArray(normalized.relationships).map((relationship) =>
      isPlainRecord(relationship)
        ? normalizeRelationshipDisplayFields({ ...relationship }, diagramKind)
        : relationship,
    );
  } else if (diagramKind === "deployment") {
    normalized.nodes = ensureArray(normalized.nodes);
    normalized.databases = ensureArray(normalized.databases);
    normalized.components = ensureArray(normalized.components);
    normalized.externalSystems = ensureArray(normalized.externalSystems);
    normalized.artifacts = ensureArray(normalized.artifacts);
    normalized.relationships = ensureArray(normalized.relationships).map((relationship) =>
      isPlainRecord(relationship)
        ? normalizeRelationshipDisplayFields({ ...relationship }, diagramKind)
        : relationship,
    );
  } else if (diagramKind === "table") {
    normalized.tables = ensureArray(normalized.tables).map((table) => {
      if (!isPlainRecord(table)) return table;
      return {
        ...table,
        columns: ensureArray(table.columns),
        indexes: ensureArray(table.indexes),
      };
    });
    normalized.relationships = ensureArray(normalized.relationships).map((relationship) =>
      isPlainRecord(relationship)
        ? normalizeRelationshipDisplayFields({ ...relationship }, diagramKind)
        : relationship,
    );
  } else if (diagramKind === "component") {
    normalized.components = ensureArray(normalized.components).map((component) =>
      isPlainRecord(component)
        ? {
            ...component,
            sourceClassIds: normalizeStringArray(component.sourceClassIds),
          }
        : component,
    );
    normalized.interfaces = ensureArray(normalized.interfaces).map((interfaceItem) =>
      isPlainRecord(interfaceItem)
        ? {
            ...interfaceItem,
            operationNames: normalizeStringArray(interfaceItem.operationNames),
          }
        : interfaceItem,
    );
    normalized.relationships = ensureArray(normalized.relationships).map((relationship) =>
      isPlainRecord(relationship)
        ? normalizeRelationshipDisplayFields({ ...relationship }, diagramKind)
        : relationship,
    );
  }

  if (diagramKind === "activity") {
    return normalizeActivityStructure(dedupeActivityModel(normalized));
  }
  if (diagramKind === "deployment") {
    return normalizeDeploymentStructure(normalized);
  }
  return normalized;
}

export function parseDesignDiagramModelsResult(
  value: string,
  requirementModels: DiagramModelSpec[] = [],
) {
  const parsed = parseJson<unknown>(value);
  const result = parseDesignDiagramModelsOnlyFromParsed(parsed);
  const { designModelTraceability } = assertCompleteDesignTraceability(
    isPlainRecord(parsed) ? parsed.designModelTraceability : undefined,
    result.models,
    requirementModels,
  );
  if (designModelTraceability.length === 0) {
    throw new Error(
      "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  return {
    ...result,
    designModelTraceability,
  };
}

function assertCompleteDesignTraceability(
  rawTraceability: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const { traceability: designModelTraceability, missingSources } =
    normalizeCompleteDesignTraceability(
      rawTraceability,
      designModels,
      requirementModels,
    );
  if (designModelTraceability.length === 0) {
    throw new Error(
      "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  if (missingSources.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("design", missingSources));
  }
  return { designModelTraceability };
}

function parseDesignDiagramModelsOnlyFromParsed(parsed: unknown) {
  const cleaned = omitNullValues(parsed);
  const normalized = isPlainRecord(cleaned)
    ? {
        ...cleaned,
        models: ensureArray(cleaned.models).map(normalizeDesignDiagramModel),
      }
    : cleaned;
  const result = designDiagramModelsResultSchema
    .omit({ designModelTraceability: true })
    .parse(normalized);
  if (result.models.length === 0) {
    throw new Error("generate_design_models must return at least one model");
  }
  return result;
}

export function parseDesignDiagramModelsOnly(value: string) {
  return parseDesignDiagramModelsOnlyFromParsed(parseJson<unknown>(value));
}

export function parseDesignTraceabilityResult(
  value: string,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const coverage = parseDesignTraceabilityCoverageResult(
    value,
    designModels,
    requirementModels,
  );
  if (coverage.traceability.length === 0) {
    throw new Error(
      "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  if (coverage.missingSources.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("design", coverage.missingSources));
  }
  return { designModelTraceability: coverage.traceability };
}

export function parseDesignTraceabilityCoverageResult(
  value: string,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const parsed = omitNullValues(parseJson<unknown>(value));
  const rawTraceability = isPlainRecord(parsed)
    ? sanitizeTraceabilityEntries(parsed.designModelTraceability)
    : [];
  return normalizeCompleteDesignTraceability(
    rawTraceability,
    designModels,
    requirementModels,
  );
}

export function parseDesignTraceabilityCoverageForSources(
  value: string,
  requiredSources: ModelElementRef[],
  requirementModels: DiagramModelSpec[],
) {
  const parsed = omitNullValues(parseJson<unknown>(value));
  const rawTraceability = isPlainRecord(parsed)
    ? sanitizeTraceabilityEntries(parsed.designModelTraceability)
    : [];
  return normalizeDesignTraceabilityForSources(
    rawTraceability,
    requiredSources,
    requirementModels,
  );
}

function normalizeCompleteDesignTraceability(
  rawTraceability: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const normalized = normalizeDesignTraceabilityWithCoverage(
    rawTraceability,
    designModels,
    requirementModels,
  );
  const withDerivedRelationships = deriveDesignRelationshipTraceability(
    normalized.traceability,
    designModels,
  );
  return normalizeDesignTraceabilityWithCoverage(
    withDerivedRelationships,
    designModels,
    requirementModels,
  );
}
