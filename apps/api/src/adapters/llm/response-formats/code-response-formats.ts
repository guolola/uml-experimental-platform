// Defines JSON schema response format selectors for code generation stages.
import type { JsonSchemaResponseFormat } from "../../../llm.js";
import {
  getStructuredResponseFormat,
  type ModelCapabilitySource,
} from "../../../model-capabilities.js";
import {
  GENERATE_CODE_SPEC_RESPONSE_FORMAT,
  GENERATE_CODE_FILES_RESPONSE_FORMAT,
  GENERATE_CODE_BUSINESS_LOGIC_RESPONSE_FORMAT,
  GENERATE_CODE_SKILL_RESOURCE_PLAN_RESPONSE_FORMAT,
  GENERATE_CODE_VISUAL_DIRECTION_RESPONSE_FORMAT,
  GENERATE_CODE_SKILL_RESOURCE_DISCOVERY_RESPONSE_FORMAT,
  GENERATE_CODE_APP_BLUEPRINT_RESPONSE_FORMAT,
  GENERATE_CODE_UI_BLUEPRINT_RESPONSE_FORMAT,
  GENERATE_CODE_UI_REFERENCE_RESPONSE_FORMAT,
  GENERATE_CODE_UI_FIDELITY_RESPONSE_FORMAT,
  GENERATE_CODE_UI_IR_RESPONSE_FORMAT,
  GENERATE_CODE_FILE_PLAN_RESPONSE_FORMAT,
  GENERATE_CODE_AGENT_PLAN_RESPONSE_FORMAT,
  GENERATE_CODE_FILE_OPERATIONS_RESPONSE_FORMAT,
} from "./code-response-format-schemas.js";
export * from "./code-response-format-schemas.js";

function responseFormatForModel(
  model: ModelCapabilitySource,
  format: JsonSchemaResponseFormat,
) {
  return getStructuredResponseFormat(model, format);
}

export function getGenerateCodeSpecResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_SPEC_RESPONSE_FORMAT);
}

export function getGenerateCodeFilesResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_FILES_RESPONSE_FORMAT);
}

export function getGenerateCodeBusinessLogicResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_BUSINESS_LOGIC_RESPONSE_FORMAT);
}

export function getGenerateCodeSkillResourcePlanResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_SKILL_RESOURCE_PLAN_RESPONSE_FORMAT);
}

export function getGenerateCodeVisualDirectionResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_VISUAL_DIRECTION_RESPONSE_FORMAT);
}

export function getGenerateCodeSkillResourceDiscoveryResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_SKILL_RESOURCE_DISCOVERY_RESPONSE_FORMAT);
}

export function getGenerateCodeAppBlueprintResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_APP_BLUEPRINT_RESPONSE_FORMAT);
}

export function getGenerateCodeUiBlueprintResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_UI_BLUEPRINT_RESPONSE_FORMAT);
}

export function getGenerateCodeUiReferenceResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_UI_REFERENCE_RESPONSE_FORMAT);
}

export function getGenerateCodeUiFidelityResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_UI_FIDELITY_RESPONSE_FORMAT);
}

export function getGenerateCodeUiIrResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_UI_IR_RESPONSE_FORMAT);
}

export function getGenerateCodeFilePlanResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_FILE_PLAN_RESPONSE_FORMAT);
}

export function getGenerateCodeAgentPlanResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_AGENT_PLAN_RESPONSE_FORMAT);
}

export function getGenerateCodeFileOperationsResponseFormat(model: ModelCapabilitySource) {
  return responseFormatForModel(model, GENERATE_CODE_FILE_OPERATIONS_RESPONSE_FORMAT);
}
