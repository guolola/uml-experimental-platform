// Verifies deterministic cleanup applied when prototype files are written.

import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePrototypeFileContent } from "./code-file-mutations.js";

test("sanitizePrototypeFileContent removes external CSS resources", () => {
  const sanitized = sanitizePrototypeFileContent(
    "/src/styles.css",
    [
      "@import url('https://fonts.googleapis.com/css2?family=Inter');",
      ":root { --font: Inter, system-ui; }",
      ".hero { background-image: url(\"https://cdn.example.com/hero.png\"); }",
    ].join("\n"),
  );

  assert.doesNotMatch(sanitized, /https?:\/\//);
  assert.doesNotMatch(sanitized, /@import/);
  assert.match(sanitized, /background-image: none/);
  assert.match(sanitized, /--font: Inter/);
});
