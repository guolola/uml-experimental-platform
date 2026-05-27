// Builds stable fingerprints for workspace freshness checks shared by services and UI state.
export function snapshotInputFingerprint(value: unknown) {
  return JSON.stringify(sortFingerprintValue(value));
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
