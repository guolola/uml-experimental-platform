import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..", "..");
const sourceDir = join(
  repoRoot,
  "node_modules",
  "@codesandbox",
  "sandpack-client",
  "sandpack",
);
const targetDir = join(webRoot, "public", "sandpack");
const sandboxJsDir = join(targetDir, "static", "js");

if (!existsSync(sourceDir)) {
  throw new Error(`Sandpack client assets were not found at ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

const indexPath = join(targetDir, "index.html");
const indexHtml = readFileSync(indexPath, "utf8")
  .replace(/\b(src|href)="\//g, '$1="/sandpack/')
  .replace(/\b(content)="\//g, '$1="/sandpack/');
writeFileSync(indexPath, indexHtml);

const telemetryPattern =
  /[A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\.persistMeasurements\(\{sandboxId:[^}]+}\)\.catch\(\(\)=>\{\}\)/g;
const publicPathPattern = /([A-Za-z_$][\w$]*\.p=)"\/"/g;
const telemetryEndpointPattern =
  /https:\/\/col\.csbops\.io\/data\/sandpack/g;

let patchedFiles = 0;
for (const entry of readdirSync(sandboxJsDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

  const filePath = join(sandboxJsDir, entry.name);
  const source = readFileSync(filePath, "utf8");
  const patched = source
    .replace(publicPathPattern, '$1"/sandpack/"')
    .replace(telemetryPattern, "false")
    .replace(telemetryEndpointPattern, "/sandpack/telemetry-disabled");
  if (patched !== source) {
    writeFileSync(filePath, patched);
  }
  if (/^sandbox\..+\.js$/.test(entry.name) && patched !== source) patchedFiles += 1;
}

if (patchedFiles === 0) {
  throw new Error("Unable to patch Sandpack telemetry in sandbox bundle");
}

console.log(`Prepared local Sandpack bundler in ${targetDir}`);
