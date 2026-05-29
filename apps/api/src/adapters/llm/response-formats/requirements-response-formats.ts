// Defines JSON schema response formats for requirement model generation.
import { type ChatCompletionResponseFormat } from "../../../llm.js";
import { getModelCapability } from "../../../model-capabilities.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

export const modelElementRefResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    modelId: { type: "string" },
    diagramKind: {
      type: "string",
      enum: [
        "usecase",
        "class",
        "activity",
        "deployment",
        "sequence",
        "table",
      ],
    },
    elementId: { type: "string" },
    elementKind: { type: "string" },
    label: { type: "string" },
  },
  required: ["diagramKind", "elementId", "elementKind", "label"],
} as const;

export const GENERATE_MODELS_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "diagram_models_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema({
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
                  diagramKind: { type: "string", enum: ["usecase"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  actors: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        actorType: {
                          type: "string",
                          enum: ["human", "system", "external"],
                        },
                        description: { type: "string" },
                        responsibilities: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: [
                        "id",
                        "name",
                        "actorType",
                        "responsibilities",
                      ],
                    },
                  },
                  useCases: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        goal: { type: "string" },
                        description: { type: "string" },
                        preconditions: {
                          type: "array",
                          items: { type: "string" },
                        },
                        postconditions: {
                          type: "array",
                          items: { type: "string" },
                        },
                        primaryActorId: { type: "string" },
                        supportingActorIds: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: [
                        "id",
                        "name",
                        "goal",
                        "preconditions",
                        "postconditions",
                        "supportingActorIds",
                      ],
                    },
                  },
                  systemBoundaries: {
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
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: [
                            "association",
                            "include",
                            "extend",
                            "generalization",
                          ],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        label: { type: "string" },
                        condition: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "actors",
                  "useCases",
                  "systemBoundaries",
                  "relationships",
                ],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["class"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  classes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        classKind: {
                          type: "string",
                          enum: [
                            "entity",
                            "aggregate",
                            "valueObject",
                            "service",
                            "other",
                          ],
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
                              type: { type: "string" },
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
                        operations: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              name: { type: "string" },
                              returnType: { type: "string" },
                              visibility: {
                                type: "string",
                                enum: ["public", "protected", "private", "package"],
                              },
                              parameters: {
                                type: "array",
                                items: {
                                  type: "object",
                                  additionalProperties: false,
                                  properties: {
                                    name: { type: "string" },
                                    type: { type: "string" },
                                    required: { type: "boolean" },
                                    direction: {
                                      type: "string",
                                      enum: ["in", "out", "inout"],
                                    },
                                  },
                                  required: ["name", "type"],
                                },
                              },
                              description: { type: "string" },
                            },
                            required: ["name", "visibility", "parameters"],
                          },
                        },
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
                        description: { type: "string" },
                        operations: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              name: { type: "string" },
                              returnType: { type: "string" },
                              visibility: {
                                type: "string",
                                enum: ["public", "protected", "private", "package"],
                              },
                              parameters: {
                                type: "array",
                                items: {
                                  type: "object",
                                  additionalProperties: false,
                                  properties: {
                                    name: { type: "string" },
                                    type: { type: "string" },
                                    required: { type: "boolean" },
                                    direction: {
                                      type: "string",
                                      enum: ["in", "out", "inout"],
                                    },
                                  },
                                  required: ["name", "type"],
                                },
                              },
                              description: { type: "string" },
                            },
                            required: ["name", "visibility", "parameters"],
                          },
                        },
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
                        literals: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["id", "name", "literals"],
                    },
                  },
                  relationships: {
                    type: "array",
                    items: {
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
                          enum: [
                            "none",
                            "source-to-target",
                            "target-to-source",
                            "bidirectional",
                          ],
                        },
                        label: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "classes",
                  "interfaces",
                  "enums",
                  "relationships",
                ],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["activity"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
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
                      oneOf: [
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["start"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type", "name"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["end"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type", "name"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["activity"] },
                            name: { type: "string" },
                            description: { type: "string" },
                            actorOrLane: { type: "string" },
                            input: {
                              type: "array",
                              items: { type: "string" },
                            },
                            output: {
                              type: "array",
                              items: { type: "string" },
                            },
                          },
                          required: ["id", "type", "name", "input", "output"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["decision"] },
                            name: { type: "string" },
                            question: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["merge"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["fork"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["join"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                      ],
                    },
                  },
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["control_flow", "object_flow"],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        condition: { type: "string" },
                        guard: { type: "string" },
                        trigger: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "swimlanes",
                  "nodes",
                  "relationships",
                ],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["deployment"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  nodes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        nodeType: {
                          type: "string",
                          enum: ["app", "server", "device", "container", "external"],
                        },
                        environment: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name", "nodeType"],
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
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["deployment", "communication", "dependency", "hosting"],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        protocol: { type: "string" },
                        port: { type: "string" },
                        direction: {
                          type: "string",
                          enum: ["one-way", "two-way", "inbound", "outbound"],
                        },
                        label: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "nodes",
                  "databases",
                  "components",
                  "externalSystems",
                  "artifacts",
                  "relationships",
                ],
              },
            ],
          },
        },
        requirementModelTraceability: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              ruleId: { type: "string" },
              target: modelElementRefResponseSchema,
            },
            required: ["ruleId", "target"],
          },
        },
      },
      required: ["models", "requirementModelTraceability"],
    }),
  },
};

export const requirementModelOneOf = (
  (
    GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema.properties as {
      models: { items: { oneOf: Record<string, unknown>[] } };
    }
  ).models.items.oneOf
);

export const GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "requirement_model_traceability_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        requirementModelTraceability: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              ruleId: { type: "string" },
              target: modelElementRefResponseSchema,
            },
            required: ["ruleId", "target"],
          },
        },
      },
      required: ["requirementModelTraceability"],
    }),
  },
};

export function getGenerateModelsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_MODELS_RESPONSE_FORMAT
    : undefined;
}

export function getGenerateRequirementTraceabilityResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT
    : undefined;
}
