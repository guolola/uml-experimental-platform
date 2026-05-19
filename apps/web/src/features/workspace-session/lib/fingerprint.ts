// Builds stable fingerprints for detecting stale generation results.



export function snapshotInputFingerprint(value: unknown) {
  return JSON.stringify(value);
}
