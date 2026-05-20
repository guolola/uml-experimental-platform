// Normalizes design LLM diagram models before validating the public contract.
import {
  designDiagramModelsResultSchema,
  designModelTraceabilityEntrySchema,
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
} from "../traceability/traceability-normalizer.js";

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
  if (value === "interface" || value === "abstract" || value === "enum") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("interface")) return "interface";
    if (lower.includes("abstract")) return "abstract";
    if (lower.includes("enum")) return "enum";
  }
  return "class";
}

function normalizeDesignDiagramModel(model: unknown) {
  if (!isPlainRecord(model)) return model;

  const normalized: Record<string, unknown> = { ...model };
  normalized.notes = normalizeStringArray(normalized.notes);
  const diagramKind = normalized.diagramKind;

  if (diagramKind === "sequence") {
    normalized.participants = ensureArray(normalized.participants);
    normalized.messages = ensureArray(normalized.messages).map((message) => {
      if (!isPlainRecord(message)) return message;
      return {
        ...message,
        type: normalizeSequenceMessageType(message.type),
        parameters: normalizeStringArray(message.parameters),
      };
    });
    normalized.fragments = ensureArray(normalized.fragments).map((fragment) => {
      if (!isPlainRecord(fragment)) return fragment;
      return {
        ...fragment,
        messageIds: normalizeStringArray(fragment.messageIds),
      };
    });
  } else if (diagramKind === "class") {
    normalized.classes = ensureArray(normalized.classes).map((classItem) => {
      if (!isPlainRecord(classItem)) return classItem;
      const nextClass: Record<string, unknown> = {
        ...classItem,
        attributes: ensureArray(classItem.attributes),
        methods: ensureArray(classItem.methods),
        stereotypes: normalizeStringArray(classItem.stereotypes),
      };
      const classKind = normalizeClassKind(nextClass.classKind);
      if (classKind !== "class") {
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
        methods: ensureArray(item.methods),
      };
    });
    normalized.enums = ensureArray(normalized.enums).map((item) => {
      if (!isPlainRecord(item)) return item;
      return {
        ...item,
        literals: normalizeStringArray(item.literals),
      };
    });
    normalized.relationships = ensureArray(normalized.relationships);
  } else if (diagramKind === "activity") {
    normalized.swimlanes = ensureArray(normalized.swimlanes);
    normalized.nodes = ensureArray(normalized.nodes).map((node) => {
      if (!isPlainRecord(node)) return node;
      return {
        ...node,
        input: "input" in node ? normalizeStringArray(node.input) : node.input,
        output: "output" in node ? normalizeStringArray(node.output) : node.output,
      };
    });
    normalized.relationships = ensureArray(normalized.relationships);
  } else if (diagramKind === "deployment") {
    normalized.nodes = ensureArray(normalized.nodes);
    normalized.databases = ensureArray(normalized.databases);
    normalized.components = ensureArray(normalized.components);
    normalized.externalSystems = ensureArray(normalized.externalSystems);
    normalized.artifacts = ensureArray(normalized.artifacts);
    normalized.relationships = ensureArray(normalized.relationships);
  } else if (diagramKind === "table") {
    normalized.tables = ensureArray(normalized.tables).map((table) => {
      if (!isPlainRecord(table)) return table;
      return {
        ...table,
        columns: ensureArray(table.columns),
        indexes: ensureArray(table.indexes),
      };
    });
    normalized.relationships = ensureArray(normalized.relationships);
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
  const normalized = isPlainRecord(parsed)
    ? {
        ...parsed,
        models: ensureArray(parsed.models).map(normalizeDesignDiagramModel),
      }
    : parsed;
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
  const parsed = parseJson<unknown>(value);
  const rawTraceability = isPlainRecord(parsed)
    ? designModelTraceabilityEntrySchema
        .array()
        .parse(ensureArray(parsed.designModelTraceability))
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
  const parsed = parseJson<unknown>(value);
  const rawTraceability = isPlainRecord(parsed)
    ? designModelTraceabilityEntrySchema
        .array()
        .parse(ensureArray(parsed.designModelTraceability))
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
