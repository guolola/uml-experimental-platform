// Verifies requirement model response schemas stay compatible with OpenAI strict JSON Schema.
import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATE_MODELS_RESPONSE_FORMAT,
  GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT,
} from "./requirements-response-formats.js";

function assertStrictObjectRequirements(schema: unknown, path = "schema") {
  if (!schema || typeof schema !== "object") return;
  const node = schema as {
    anyOf?: unknown[];
    items?: unknown;
    oneOf?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown;
  };

  assert.equal(node.oneOf, undefined, `${path} must not use oneOf`);

  if (node.properties) {
    assert.deepEqual(
      node.required,
      Object.keys(node.properties),
      `${path}.required must list every property`,
    );
  }

  for (const [key, value] of Object.entries(node.properties ?? {})) {
    assertStrictObjectRequirements(value, `${path}.properties.${key}`);
  }
  if (node.items) {
    assertStrictObjectRequirements(node.items, `${path}.items`);
  }
  for (const [index, value] of (node.anyOf ?? []).entries()) {
    assertStrictObjectRequirements(value, `${path}.anyOf.${index}`);
  }
}

test("requirement model response formats are valid for OpenAI strict JSON Schema", () => {
  assertStrictObjectRequirements(GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema);
  assertStrictObjectRequirements(
    GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT.json_schema.schema,
  );
});
