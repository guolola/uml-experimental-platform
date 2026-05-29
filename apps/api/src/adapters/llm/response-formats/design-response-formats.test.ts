// Verifies design model response schemas stay compatible with OpenAI strict JSON Schema.
import assert from "node:assert/strict";
import test from "node:test";
import { GENERATE_DESIGN_MODELS_RESPONSE_FORMAT } from "./design-response-formats.js";

function assertStrictObjectRequirements(schema: unknown, path = "schema") {
  if (!schema || typeof schema !== "object") return;
  const node = schema as {
    anyOf?: unknown[];
    additionalProperties?: unknown;
    items?: unknown;
    oneOf?: unknown[];
    properties?: Record<string, unknown>;
    required?: unknown;
  };

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
  for (const [index, value] of (node.oneOf ?? []).entries()) {
    assertStrictObjectRequirements(value, `${path}.oneOf.${index}`);
  }
  for (const [index, value] of (node.anyOf ?? []).entries()) {
    assertStrictObjectRequirements(value, `${path}.anyOf.${index}`);
  }
}

function assertNoOneOf(schema: unknown, path = "schema") {
  if (!schema || typeof schema !== "object") return;
  const node = schema as {
    anyOf?: unknown[];
    items?: unknown;
    oneOf?: unknown;
    properties?: Record<string, unknown>;
  };

  assert.equal(node.oneOf, undefined, `${path} must not use oneOf`);

  for (const [key, value] of Object.entries(node.properties ?? {})) {
    assertNoOneOf(value, `${path}.properties.${key}`);
  }
  if (node.items) {
    assertNoOneOf(node.items, `${path}.items`);
  }
  for (const [index, value] of (node.anyOf ?? []).entries()) {
    assertNoOneOf(value, `${path}.anyOf.${index}`);
  }
}

test("design model response format is valid for OpenAI strict JSON Schema", () => {
  assertStrictObjectRequirements(
    GENERATE_DESIGN_MODELS_RESPONSE_FORMAT.json_schema.schema,
  );
  assertNoOneOf(GENERATE_DESIGN_MODELS_RESPONSE_FORMAT.json_schema.schema);
});
