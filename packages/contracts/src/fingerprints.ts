// Owns stable workspace input fingerprinting for requirement snapshots and design input compatibility.
export const WORKSPACE_FINGERPRINT_VERSION = "fp:v2";

export function snapshotInputFingerprint(value: unknown) {
  return `${WORKSPACE_FINGERPRINT_VERSION}:${fingerprintHash(
    JSON.stringify(sortFingerprintValue(value)),
  )}`;
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

export function normalizeDesignInputFingerprint(
  fingerprint: string | null | undefined,
) {
  if (!fingerprint) return fingerprint ?? null;
  if (fingerprint.startsWith(`${WORKSPACE_FINGERPRINT_VERSION}:`)) {
    return fingerprint;
  }
  try {
    return snapshotInputFingerprint(
      normalizeDesignInputFingerprintValue(JSON.parse(fingerprint)),
    );
  } catch {
    return fingerprint;
  }
}

export function normalizeSnapshotFingerprint(
  fingerprint: string | null | undefined,
) {
  if (!fingerprint) return fingerprint ?? null;
  if (fingerprint.startsWith(`${WORKSPACE_FINGERPRINT_VERSION}:`)) {
    return fingerprint;
  }
  try {
    return snapshotInputFingerprint(JSON.parse(fingerprint));
  } catch {
    return fingerprint;
  }
}

function fingerprintHash(value: string) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ char, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ char, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ char, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ char, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [h1, h2, h3, h4]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
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

const DIAGRAM_FINGERPRINT_ORDER = [
  "function",
  "activity",
  "usecase",
  "class",
  "prototype",
  "deployment",
  "analysis",
];

function normalizeDesignInputFingerprintValue(value: unknown) {
  const record = isFingerprintRecord(value) ? value : {};
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
  const record = isFingerprintRecord(value) ? value : {};
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
  const record = isFingerprintRecord(value) ? value : {};
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
  const record = isFingerprintRecord(value) ? value : {};
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

function isFingerprintRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
