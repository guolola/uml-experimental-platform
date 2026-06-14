// Defines the large diagram model response schema used by requirement generation.
import { type JsonSchemaResponseFormat } from "../../../llm.js";
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
        "prototype",
        "analysis",
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

export const requirementTraceabilityEntryResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ruleId: { type: "string" },
    target: modelElementRefResponseSchema,
    mappingSource: {
      type: "string",
      enum: ["llm", "auto-filled-pending-review"],
    },
    reviewStatus: { type: "string", enum: ["confirmed", "pending"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    rationale: { type: "string" },
  },
  required: ["ruleId", "target"],
} as const;

export const GENERATE_MODELS_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
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
                        eventFlows: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              id: { type: "string" },
                              name: { type: "string" },
                              flowType: {
                                type: "string",
                                enum: ["main", "alternative", "exception"],
                              },
                              trigger: { type: "string" },
                              condition: { type: "string" },
                              steps: {
                                type: "array",
                                items: {
                                  type: "object",
                                  additionalProperties: false,
                                  properties: {
                                    order: { type: "number" },
                                    actor: {
                                      type: "string",
                                      enum: ["actor", "system", "external"],
                                    },
                                    actorAction: { type: "string" },
                                    systemAction: { type: "string" },
                                    expectedResult: { type: "string" },
                                    sourceRequirementId: { type: "string" },
                                  },
                                  required: ["order", "actor"],
                                },
                              },
                            },
                            required: ["id", "name", "flowType", "steps"],
                          },
                        },
                      },
                      required: [
                        "id",
                        "name",
                        "goal",
                        "preconditions",
                        "postconditions",
                        "supportingActorIds",
                        "eventFlows",
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
                        chineseName: { type: "string" },
                        englishName: { type: "string" },
                        type: { type: "string" },
                        constraints: {
                          type: "array",
                          items: { type: "string" },
                        },
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
                              chineseName: { type: "string" },
                              englishName: { type: "string" },
                              type: { type: "string" },
                              constraints: {
                                type: "array",
                                items: { type: "string" },
                              },
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
                        chineseName: { type: "string" },
                        englishName: { type: "string" },
                        type: { type: "string" },
                        constraints: {
                          type: "array",
                          items: { type: "string" },
                        },
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
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["prototype"] },
                  modelId: { type: "string" },
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
                          enum: ["screen", "module", "entry-point"],
                        },
                        route: { type: "string" },
                        description: { type: "string" },
                        sourceUseCaseIds: {
                          type: "array",
                          items: { type: "string" },
                        },
                        sourceRequirementIds: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: [
                        "id",
                        "name",
                        "nodeType",
                        "sourceUseCaseIds",
                        "sourceRequirementIds",
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
                          enum: [
                            "navigation",
                            "contains",
                            "opens",
                            "submits",
                            "returns",
                            "depends-on",
                          ],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        label: { type: "string" },
                        trigger: { type: "string" },
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
                  "nodes",
                  "relationships",
                ],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["analysis"] },
                  modelId: { type: "string" },
                  sourceUseCaseId: { type: "string" },
                  sourceUseCaseName: { type: "string" },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
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
                        parameters: {
                          type: "array",
                          items: { type: "string" },
                        },
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
                        messageIds: {
                          type: "array",
                          items: { type: "string" },
                        },
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
            ],
          },
        },
        requirementModelTraceability: {
          type: "array",
          items: requirementTraceabilityEntryResponseSchema,
        },
      },
      required: ["models", "requirementModelTraceability"],
    }),
  },
};
