// Defines JSON schema response formats for design model generation.
import { type ChatCompletionResponseFormat } from "../../../llm.js";
import { getModelCapability } from "../../../model-capabilities.js";
import { requirementModelOneOf } from "./requirements-response-formats.js";

export const GENERATE_DESIGN_MODELS_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "design_diagram_models_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        models: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["sequence"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: { type: "array", items: { type: "string" } },
                  participants: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        participantType: {
                          type: "string",
                          enum: [
                            "actor",
                            "boundary",
                            "control",
                            "entity",
                            "service",
                            "database",
                            "external",
                          ],
                        },
                        description: { type: "string" },
                      },
                      required: ["id", "name", "participantType"],
                    },
                  },
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["sync", "async", "return", "create", "destroy"],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        name: { type: "string" },
                        parameters: { type: "array", items: { type: "string" } },
                        returnValue: { type: "string" },
                        condition: { type: "string" },
                        description: { type: "string" },
                      },
                      required: [
                        "id",
                        "type",
                        "sourceId",
                        "targetId",
                        "name",
                        "parameters",
                      ],
                    },
                  },
                  fragments: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: { type: "string", enum: ["alt", "opt", "loop", "par"] },
                        label: { type: "string" },
                        messageIds: { type: "array", items: { type: "string" } },
                        condition: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "label", "messageIds"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "participants",
                  "messages",
                  "fragments",
                ],
              },
              ...requirementModelOneOf.filter((schema) => {
                const diagramKind = (
                  schema.properties as { diagramKind?: { enum?: string[] } }
                ).diagramKind?.enum?.[0];
                return diagramKind !== "usecase";
              }),
            ],
          },
        },
      },
      required: ["models"],
    },
  },
};

export function getGenerateDesignModelsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_DESIGN_MODELS_RESPONSE_FORMAT
    : undefined;
}
