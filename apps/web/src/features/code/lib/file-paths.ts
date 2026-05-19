// Owns display and editor language helpers for generated prototype file paths.



export function languageForPath(path: string) {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".html")) return "html";
  return "plaintext";
}

export function fileLabel(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
