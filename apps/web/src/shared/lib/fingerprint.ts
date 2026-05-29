// Builds stable fingerprints for workspace freshness checks shared by services and UI state.
export function snapshotInputFingerprint(value: unknown) {
  return JSON.stringify(sortFingerprintValue(value));
}

export function designInputFingerprint(
  requirementModels: unknown[],
  requirementModelTraceability: unknown[],
) {
  return snapshotInputFingerprint(
    normalizeDesignInputFingerprintValue({
      requirementModels,
      requirementModelTraceability,
    }),
  );
}

export function normalizeDesignInputFingerprint(fingerprint: string | null | undefined) {
  if (!fingerprint) return fingerprint ?? null;
  try {
    return snapshotInputFingerprint(
      normalizeDesignInputFingerprintValue(JSON.parse(fingerprint)),
    );
  } catch {
    return fingerprint;
  }
}

export function normalizeSnapshotFingerprint(fingerprint: string | null | undefined) {
  if (!fingerprint) return fingerprint ?? null;
  try {
    return snapshotInputFingerprint(JSON.parse(fingerprint));
  } catch {
    return fingerprint;
  }
}

function sortFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortFingerprintValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortFingerprintValue(entry)]),
  );
}

const DIAGRAM_FINGERPRINT_ORDER = ["usecase", "class", "activity", "deployment"];

function normalizeDesignInputFingerprintValue(value: unknown) {
  const record = isRecord(value) ? value : {};
  return {
    requirementModels: sortByFingerprintKey(
      Array.isArray(record.requirementModels) ? record.requirementModels : [],
      designModelFingerprintKey,
    ),
    requirementModelTraceability: sortByFingerprintKey(
      Array.isArray(record.requirementModelTraceability)
        ? record.requirementModelTraceability
        : [],
      traceabilityFingerprintKey,
    ),
  };
}

function sortByFingerprintKey<T>(values: T[], keyFor: (value: T) => string) {
  return values
    .map((value, index) => ({ index, key: keyFor(value), value }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.index - right.index)
    .map((entry) => entry.value);
}

function designModelFingerprintKey(value: unknown) {
  const record = isRecord(value) ? value : {};
  const diagramKind = compactFingerprintValue(record.diagramKind);
  const modelId = compactFingerprintValue(record.modelId);
  const rank = DIAGRAM_FINGERPRINT_ORDER.indexOf(diagramKind);
  const orderedRank = rank >= 0 ? rank : DIAGRAM_FINGERPRINT_ORDER.length;
  return [
    String(orderedRank).padStart(2, "0"),
    diagramKind,
    modelId,
    snapshotInputFingerprint(value),
  ].join(":");
}

function traceabilityFingerprintKey(value: unknown) {
  const record = isRecord(value) ? value : {};
  return [
    modelElementRefFingerprintKey(record.source),
    Array.isArray(record.targets)
      ? sortByFingerprintKey(record.targets, modelElementRefFingerprintKey).join("|")
      : "",
    compactFingerprintValue(record.ruleId),
    snapshotInputFingerprint(value),
  ].join(":");
}

function modelElementRefFingerprintKey(value: unknown) {
  const record = isRecord(value) ? value : {};
  return [
    compactFingerprintValue(record.modelId),
    compactFingerprintValue(record.diagramKind),
    compactFingerprintValue(record.elementId),
  ].join(":");
}

function compactFingerprintValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().toLowerCase()
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
