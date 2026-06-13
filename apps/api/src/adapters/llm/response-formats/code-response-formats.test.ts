// Verifies code generation response format selectors keep exporting schema constants.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CODE_BUSINESS_LOGIC_RESPONSE_SCHEMA,
  GENERATE_CODE_FILE_OPERATIONS_RESPONSE_FORMAT,
  GENERATE_CODE_SPEC_RESPONSE_FORMAT,
  getGenerateCodeFileOperationsResponseFormat,
  getGenerateCodeSpecResponseFormat,
} from "./code-response-formats.js";

test("code response format selectors return the exported schema constants", () => {
  assert.equal(
    getGenerateCodeSpecResponseFormat("gpt-5.4"),
    GENERATE_CODE_SPEC_RESPONSE_FORMAT,
  );
  assert.equal(
    getGenerateCodeFileOperationsResponseFormat("gpt-5.4"),
    GENERATE_CODE_FILE_OPERATIONS_RESPONSE_FORMAT,
  );
});

test("code response format module re-exports shared schema fragments", () => {
  assert.equal(CODE_BUSINESS_LOGIC_RESPONSE_SCHEMA.type, "object");
  assert.equal(
    GENERATE_CODE_SPEC_RESPONSE_FORMAT.json_schema.name,
    "code_generation_spec_result",
  );
});
