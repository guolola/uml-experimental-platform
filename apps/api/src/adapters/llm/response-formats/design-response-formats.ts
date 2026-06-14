// Defines JSON schema response formats for design model generation.
import { type ChatCompletionResponseFormat } from "../../../llm.js";
import { getModelCapability } from "../../../model-capabilities.js";
import { modelElementRefResponseSchema } from "./requirements-response-formats.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

const stringArrayResponseSchema = { type: "array", items: { type: "string" } };

const classOperationResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    returnType: { type: "string" },
    visibility: { type: "string", enum: ["public", "protected", "private", "package"] },
    parameters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          required: { type: "boolean" },
          direction: { type: "string", enum: ["in", "out", "inout"] },
        },
        required: ["name", "type"],
      },
    },
    description: { type: "string" },
  },
  required: ["name", "visibility", "parameters"],
};

const relationshipResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    type: {
      type: "string",
      enum: [
        "association",
        "aggregation",
        "composition",
        "inheritance",
        "implementation",
        "dependency",
        "control_flow",
        "object_flow",
        "deployment",
        "communication",
        "hosting",
        "one-to-one",
        "one-to-many",
        "many-to-many",
      ],
    },
    sourceId: { type: "string" },
    targetId: { type: "string" },
    sourceRole: { type: "string" },
    targetRole: { type: "string" },
    sourceMultiplicity: { type: "string" },
    targetMultiplicity: { type: "string" },
    navigability: {
      type: "string",
      enum: ["none", "source-to-target", "target-to-source", "bidirectional"],
    },
    condition: { type: "string" },
    guard: { type: "string" },
    trigger: { type: "string" },
    protocol: { type: "string" },
    port: { type: "string" },
    direction: { type: "string", enum: ["one-way", "two-way", "inbound", "outbound"] },
    sourceTableId: { type: "string" },
    targetTableId: { type: "string" },
    sourceColumnId: { type: "string" },
    targetColumnId: { type: "string" },
    label: { type: "string" },
    description: { type: "string" },
  },
  required: ["id", "type"],
};

const designModelResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    diagramKind: {
      type: "string",
      enum: ["sequence", "class", "activity", "deployment", "table"],
    },
    modelId: { type: "string" },
    sourceUseCaseId: { type: "string" },
    sourceUseCaseName: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    notes: stringArrayResponseSchema,
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
          type: { type: "string", enum: ["sync", "async", "return", "create", "destroy"] },
          sourceId: { type: "string" },
          targetId: { type: "string" },
          name: { type: "string" },
          parameters: stringArrayResponseSchema,
          returnValue: { type: "string" },
          condition: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "type", "sourceId", "targetId", "name", "parameters"],
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
          messageIds: stringArrayResponseSchema,
          condition: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "type", "label", "messageIds"],
      },
    },
    classes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          chineseName: { type: "string" },
          englishName: { type: "string" },
          type: { type: "string" },
          constraints: stringArrayResponseSchema,
          classKind: {
            type: "string",
            enum: ["entity", "aggregate", "valueObject", "service", "other"],
          },
          stereotype: { type: "string" },
          description: { type: "string" },
          attributes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                chineseName: { type: "string" },
                englishName: { type: "string" },
                type: { type: "string" },
                constraints: stringArrayResponseSchema,
                visibility: {
                  type: "string",
                  enum: ["public", "protected", "private", "package"],
                },
                required: { type: "boolean" },
                multiplicity: { type: "string" },
                defaultValue: { type: "string" },
                description: { type: "string" },
              },
              required: ["name", "type", "visibility"],
            },
          },
          operations: { type: "array", items: classOperationResponseSchema },
        },
        required: ["id", "name", "attributes", "operations"],
      },
    },
    interfaces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          chineseName: { type: "string" },
          englishName: { type: "string" },
          type: { type: "string" },
          constraints: stringArrayResponseSchema,
          description: { type: "string" },
          operations: { type: "array", items: classOperationResponseSchema },
        },
        required: ["id", "name", "operations"],
      },
    },
    enums: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          literals: stringArrayResponseSchema,
        },
        required: ["id", "name", "literals"],
      },
    },
    swimlanes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "name"],
      },
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: ["start", "end", "activity", "decision", "merge", "fork", "join"],
          },
          name: { type: "string" },
          description: { type: "string" },
          actorOrLane: { type: "string" },
          input: stringArrayResponseSchema,
          output: stringArrayResponseSchema,
          question: { type: "string" },
          nodeType: {
            type: "string",
            enum: ["app", "server", "device", "container", "external"],
          },
          environment: { type: "string" },
        },
        required: ["id"],
      },
    },
    databases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          engine: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "name"],
      },
    },
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          componentType: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "name"],
      },
    },
    externalSystems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "name"],
      },
    },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          artifactType: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "name"],
      },
    },
    tables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          columns: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                dataType: { type: "string" },
                isPrimaryKey: { type: "boolean" },
                isForeignKey: { type: "boolean" },
                nullable: { type: "boolean" },
                references: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    tableId: { type: "string" },
                    columnId: { type: "string" },
                  },
                  required: ["tableId", "columnId"],
                },
                description: { type: "string" },
              },
              required: ["id", "name", "dataType"],
            },
          },
        },
        required: ["id", "name", "columns"],
      },
    },
    relationships: { type: "array", items: relationshipResponseSchema },
  },
  required: ["diagramKind", "title", "summary", "notes"],
};

export const GENERATE_DESIGN_MODELS_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "design_diagram_models_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        models: {
          type: "array",
          items: designModelResponseSchema,
        },
        designModelTraceability: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              source: modelElementRefResponseSchema,
              targets: {
                type: "array",
                items: modelElementRefResponseSchema,
              },
              upstreamDesignRefs: {
                type: "array",
                items: modelElementRefResponseSchema,
              },
              mappingSource: {
                type: "string",
                enum: ["llm", "derived-from-endpoints", "auto-filled-pending-review"],
              },
              reviewStatus: { type: "string", enum: ["confirmed", "pending"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              rationale: { type: "string" },
            },
            required: ["source", "targets"],
          },
        },
      },
      required: ["models", "designModelTraceability"],
    }),
  },
};

export const GENERATE_DESIGN_TRACEABILITY_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "design_model_traceability_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        designModelTraceability: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              source: modelElementRefResponseSchema,
              targets: {
                type: "array",
                items: modelElementRefResponseSchema,
              },
              upstreamDesignRefs: {
                type: "array",
                items: modelElementRefResponseSchema,
              },
              mappingSource: {
                type: "string",
                enum: ["llm", "derived-from-endpoints", "auto-filled-pending-review"],
              },
              reviewStatus: { type: "string", enum: ["confirmed", "pending"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              rationale: { type: "string" },
            },
            required: ["source", "targets"],
          },
        },
      },
      required: ["designModelTraceability"],
    }),
  },
};

export function getGenerateDesignModelsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_DESIGN_MODELS_RESPONSE_FORMAT
    : undefined;
}

export function getGenerateDesignTraceabilityResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_DESIGN_TRACEABILITY_RESPONSE_FORMAT
    : undefined;
}
