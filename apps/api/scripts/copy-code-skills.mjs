import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptDir, "..");
const source = resolve(apiRoot, "src/code-skills");
const target = resolve(apiRoot, "dist/code-skills");

if (!existsSync(source)) {
  console.warn(`[copy-code-skills] source not found: ${source}`);
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter: (path) => !/__pycache__/.test(path) && !/\.pyc$/i.test(path),
});

console.log(`[copy-code-skills] copied ${source} -> ${target}`);
