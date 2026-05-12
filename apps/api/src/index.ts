import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  designDiagramModelsResultSchema,
  designRunSnapshotSchema,
  diagramErrorSchema,
  diagramModelsResultSchema,
  failedRunEventSchema,
  llmChunkRunEventSchema,
  providerSettingsSchema,
  queuedRunEventSchema,
  repairPlantUmlResultSchema,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
  requirementRulesResultSchema,
  runSnapshotSchema,
  startDesignRunRequestSchema,
  startDesignRunResponseSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  startRunRequestSchema,
  startRunResponseSchema,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignPlantUmlArtifact,
  type DesignRunSnapshot,
  type DesignSvgArtifact,
  type DiagramKind,
  type DiagramError,
  type DiagramModelSpec,
  type PlantUmlArtifact,
  type ProviderSettings,
  type RequirementRule,
  type RunEvent,
  type RunSnapshot,
  type RunStage,
  type SvgArtifact,
  type UmlDiagramKind,
} from "@uml-platform/contracts";
import {
  JSON_ONLY_SYSTEM_PROMPT,
  buildExtractRulesPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateDesignSequencePrompt,
  buildGenerateModelsPrompt,
  buildRepairDesignModelsPrompt,
  buildRepairModelsPrompt,
  buildRepairPlantUmlPrompt,
} from "@uml-platform/prompts";
import {
  createRealLlmTransport,
  type ChatCompletionResponseFormat,
  type ChatMessage,
  type LlmTransport,
} from "./llm.js";
import { getModelCapability } from "./model-capabilities.js";
import {
  generateDesignPlantUmlArtifacts,
  generatePlantUmlArtifacts,
} from "./plantuml.js";

const DEFAULT_PORT = Number(process.env.API_PORT ?? 4001);
const DEFAULT_HOST = process.env.API_HOST ?? "127.0.0.1";
const DEFAULT_RENDER_SERVICE_BASE_URL =
  process.env.RENDER_SERVICE_BASE_URL ?? "http://127.0.0.1:4002";
const DEFAULT_SSE_ALLOW_ORIGIN = "http://localhost:5173";
const MAX_PLANTUML_REPAIR_ATTEMPTS = 2;
const MAX_MODEL_REPAIR_ATTEMPTS = 2;
const DESIGN_DOWNSTREAM_DIAGRAMS: DesignDiagramKind[] = [
  "activity",
  "class",
  "deployment",
];

type AnyPlantUmlArtifact = { diagramKind: UmlDiagramKind; source: string };
type AnyDiagramModelSpec = DiagramModelSpec | DesignDiagramModelSpec;
type AnySvgArtifact = SvgArtifact | DesignSvgArtifact;

const GENERATE_MODELS_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "diagram_models_result",
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
      },
      required: ["models"],
    },
  },
};

const requirementModelOneOf = (
  (
    GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema.properties as {
      models: { items: { oneOf: Record<string, unknown>[] } };
    }
  ).models.items.oneOf
);

const GENERATE_DESIGN_MODELS_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

type RenderClient = (artifact: AnyPlantUmlArtifact) => Promise<{
  svg: string;
  renderMeta: {
    engine: string;
    generatedAt: string;
    sourceLength: number;
    durationMs: number;
  };
}>;

interface RunRecord {
  snapshot: RunSnapshot | DesignRunSnapshot;
  events: RunEvent[];
  listeners: Set<(event: RunEvent) => void>;
  terminal: boolean;
}

function logFailedStructuredOutput(
  stage: RunStage,
  model: string,
  error: unknown,
  rawText: string,
  attempt?: number,
) {
  const header = [
    "[llm-structured-output-failed]",
    `stage=${stage}`,
    `model=${model}`,
    attempt ? `attempt=${attempt}` : null,
    `error=${formatParseError(error)}`,
  ]
    .filter(Boolean)
    .join(" ");

  console.error(
    `${header}\n--- begin raw output ---\n${rawText}\n--- end raw output ---`,
  );
}

function createEmptySnapshot(
  runId: string,
  requirementText: string,
  selectedDiagrams: DiagramKind[],
): RunSnapshot {
  return runSnapshotSchema.parse({
    runId,
    requirementText,
    selectedDiagrams,
    rules: [],
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

function withSequenceDependency(selectedDiagrams: DesignDiagramKind[]) {
  const unique = Array.from(new Set(selectedDiagrams));
  const needsSequence = unique.some((diagram) => diagram !== "sequence");
  return needsSequence && !unique.includes("sequence")
    ? (["sequence", ...unique] as DesignDiagramKind[])
    : unique;
}

function createEmptyDesignSnapshot(
  runId: string,
  input: {
    requirementText: string;
    selectedDiagrams: DesignDiagramKind[];
    rules: RequirementRule[];
    requirementModels: DiagramModelSpec[];
  },
): DesignRunSnapshot {
  return designRunSnapshotSchema.parse({
    runId,
    requirementText: input.requirementText,
    selectedDiagrams: withSequenceDependency(input.selectedDiagrams),
    rules: input.rules,
    requirementModels: input.requirementModels,
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

function emitEvent(record: RunRecord, event: RunEvent) {
  record.events.push(event);
  for (const listener of record.listeners) {
    listener(event);
  }
  if (event.type === "completed" || event.type === "failed") {
    record.terminal = true;
  }
}

function createMessages(prompt: string): ChatMessage[] {
  return [
    { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
}

function getGenerateModelsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_MODELS_RESPONSE_FORMAT
    : undefined;
}

function getGenerateDesignModelsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_DESIGN_MODELS_RESPONSE_FORMAT
    : undefined;
}

async function collectStructuredResult<T>(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  stage: RunStage,
  onChunk: (chunk: string) => void,
  parse: (text: string) => T,
  responseFormat?: ChatCompletionResponseFormat,
  attempt?: number,
) {
  let content = "";
  for await (const chunk of llmTransport.streamChatCompletion({
    providerSettings,
    messages,
    responseFormat,
  })) {
    content += chunk;
    onChunk(chunk);
  }
  try {
    return parse(content);
  } catch (error) {
    logFailedStructuredOutput(
      stage,
      providerSettings.model,
      error,
      content,
      attempt,
    );
    throw error;
  }
}

function parseJson<T>(value: string) {
  return JSON.parse(value) as T;
}

function formatParseError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "response";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
  }

  return getErrorMessage(error);
}

function stageProgressValue(stage: RunStage) {
  switch (stage) {
    case "extract_rules":
      return 20;
    case "generate_models":
      return 65;
    case "generate_design_sequence":
      return 45;
    case "generate_design_models":
      return 70;
    case "generate_plantuml":
      return 80;
    case "render_svg":
      return 95;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isPlaceholderSvg(svg: string) {
  return /Welcome to PlantUML!/i.test(svg);
}

async function createRenderClient(baseUrl: string, artifact: AnyPlantUmlArtifact) {
  const response = await fetch(`${baseUrl}/render/svg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      diagramKind: artifact.diagramKind,
      plantUmlSource: artifact.source,
    }),
  });

  if (!response.ok) {
    let message = `Render service failed with HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Ignore non-JSON error payloads and fall back to the status-based message.
    }
    throw new Error(message);
  }

  return (await response.json()) as Awaited<ReturnType<RenderClient>>;
}

async function renderArtifactWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
  model: AnyDiagramModelSpec,
  artifact: AnyPlantUmlArtifact,
): Promise<
  | {
      status: "success";
      artifact: AnyPlantUmlArtifact;
      svgArtifact: AnySvgArtifact;
    }
  | {
      status: "failed";
      artifact: AnyPlantUmlArtifact;
      errorMessage: string;
    }
> {
  let currentArtifact = artifact;
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= MAX_PLANTUML_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      const rendered = renderSvgResponseSchema.parse(await renderClient(currentArtifact));

      if (isPlaceholderSvg(rendered.svg)) {
        throw new Error("PlantUML returned placeholder SVG, source may be invalid");
      }

      return {
        status: "success",
        artifact: currentArtifact,
        svgArtifact: {
          diagramKind: currentArtifact.diagramKind,
          svg: rendered.svg,
          renderMeta: rendered.renderMeta,
        } as AnySvgArtifact,
      };
    } catch (error) {
      lastErrorMessage = getErrorMessage(error);

      if (attempt === MAX_PLANTUML_REPAIR_ATTEMPTS) {
        return {
          status: "failed",
          artifact: currentArtifact,
          errorMessage: `PlantUML repair failed for ${currentArtifact.diagramKind}: ${lastErrorMessage}`,
        };
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "render_svg",
          progress: stageProgressValue("render_svg"),
          message: `PlantUML 编译失败，正在尝试修复（${attempt + 1}/${MAX_PLANTUML_REPAIR_ATTEMPTS}）`,
        }),
      );

      const repairResult = await collectStructuredResult(
        llmTransport,
        providerSettings,
        createMessages(
          buildRepairPlantUmlPrompt(
            currentArtifact.diagramKind,
            model,
            currentArtifact.source,
            lastErrorMessage,
          ),
        ),
        "render_svg",
        (chunk) => {
          emitEvent(
            record,
            llmChunkRunEventSchema.parse({
              type: "llm_chunk",
              stage: "render_svg",
              chunk,
            }),
          );
        },
        (text) => repairPlantUmlResultSchema.parse(parseJson(text)),
        undefined,
        attempt + 1,
      );

      currentArtifact = {
        ...currentArtifact,
        source: repairResult.source,
      };
    }
  }

  return {
    status: "failed",
    artifact: currentArtifact,
    errorMessage: `PlantUML repair failed for ${artifact.diagramKind}: ${lastErrorMessage}`,
  };
}

async function collectTextResult(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  responseFormat?: ChatCompletionResponseFormat,
) {
  let content = "";
  for await (const chunk of llmTransport.streamChatCompletion({
    providerSettings,
    messages,
    responseFormat,
  })) {
    content += chunk;
    onChunk(chunk);
  }
  return content;
}

async function generateModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DiagramKind[],
) {
  const responseFormat = getGenerateModelsResponseFormat(providerSettings.model);
  let prompt = buildGenerateModelsPrompt(
    requirementText,
    rules,
    selectedDiagrams,
  );
  let previousOutput = "";
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "generate_models",
            chunk,
          }),
        );
      },
      responseFormat,
    );
    previousOutput = content;

    try {
      return diagramModelsResultSchema.parse(parseJson(content));
    } catch (error) {
      logFailedStructuredOutput(
        "generate_models",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        throw new Error(
          `generate_models structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_models",
          progress: stageProgressValue("generate_models"),
          message: `模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairModelsPrompt(
        requirementText,
        rules,
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(`generate_models structured output failed: ${lastErrorMessage}`);
}

async function generateDesignModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DesignDiagramKind[],
  initialPrompt: string,
  stage: RunStage,
) {
  const responseFormat = getGenerateDesignModelsResponseFormat(providerSettings.model);
  let prompt = initialPrompt;
  let previousOutput = "";
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage,
            chunk,
          }),
        );
      },
      responseFormat,
    );
    previousOutput = content;

    try {
      const parsed = designDiagramModelsResultSchema.parse(parseJson(content));
      return {
        models: parsed.models.filter((model) =>
          selectedDiagrams.includes(model.diagramKind),
        ),
      };
    } catch (error) {
      logFailedStructuredOutput(
        stage,
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        throw new Error(
          `${stage} structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage,
          progress: stageProgressValue(stage),
          message: `设计模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDesignModelsPrompt(
        requirementText,
        rules,
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(`${stage} structured output failed: ${lastErrorMessage}`);
}

function findRequirementModel(
  models: DiagramModelSpec[],
  diagramKind: DiagramKind,
) {
  return models.find((model) => model.diagramKind === diagramKind);
}

function sourceRequirementKindForDesign(
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
): DiagramKind {
  switch (diagramKind) {
    case "activity":
      return "activity";
    case "class":
      return "class";
    case "deployment":
      return "deployment";
  }
}

async function runStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as RunSnapshot;

  const updateStage = (stage: RunStage, message?: string) => {
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  let rules: RequirementRule[] = [];
  let models: DiagramModelSpec[] = [];
  let plantUml: PlantUmlArtifact[] = [];
  let diagramErrors: Partial<Record<DiagramKind, DiagramError>> = {};

  updateStage("extract_rules", "正在抽取需求规则");
  const ruleResult = await collectStructuredResult(
    llmTransport,
    providerSettings,
    createMessages(buildExtractRulesPrompt(snapshot.requirementText)),
    "extract_rules",
    (chunk) => {
      emitEvent(
        record,
        llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage: "extract_rules",
          chunk,
        }),
      );
    },
    (text) => requirementRulesResultSchema.parse(parseJson(text)),
  );
  rules = ruleResult.rules;
  snapshot.rules = rules;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "extract_rules",
      artifactKind: "rules",
    }),
  );

  updateStage("generate_models", "正在生成结构化模型");
  if (snapshot.selectedDiagrams.length > 0) {
    const modelResult = await generateModelsWithRepair(
      record,
      providerSettings,
      llmTransport,
      snapshot.requirementText,
      rules,
      snapshot.selectedDiagrams,
    );
    models = modelResult.models;
  }
  snapshot.models = models;
  snapshot.diagramErrors = {};
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "model",
    }),
  );

  updateStage("generate_plantuml", "正在生成 PlantUML");
  plantUml = generatePlantUmlArtifacts(models);
  snapshot.plantUml = plantUml;
  for (const artifact of plantUml) {
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: artifact.diagramKind,
      }),
    );
  }

  updateStage("render_svg", "正在渲染 SVG");
  const repairedPlantUmlArtifacts: PlantUmlArtifact[] = [];
  const svgArtifacts: SvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    const model = models.find((item) => item.diagramKind === artifact.diagramKind);
    if (!model) {
      throw new Error(`Missing diagram model for ${artifact.diagramKind}`);
    }

    const rendered = await renderArtifactWithRepair(
      record,
      providerSettings,
      llmTransport,
      renderClient,
      model,
      artifact,
    );
    repairedPlantUmlArtifacts.push(rendered.artifact as PlantUmlArtifact);
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as SvgArtifact);
      emitEvent(
        record,
        artifactReadyRunEventSchema.parse({
          type: "artifact_ready",
          stage: "render_svg",
          artifactKind: "svg",
          diagramKind: artifact.diagramKind,
        }),
      );
      continue;
    }

    renderFailures.push(rendered.errorMessage);
    diagramErrors[artifact.diagramKind] = diagramErrorSchema.parse({
      stage: "render_svg",
      message: rendered.errorMessage,
    });
  }
  snapshot.plantUml = repairedPlantUmlArtifacts;
  snapshot.svgArtifacts = svgArtifacts;
  snapshot.diagramErrors = diagramErrors;

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  snapshot.currentStage = "render_svg";
  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

async function runDesignStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as DesignRunSnapshot;

  const updateStage = (stage: RunStage, message?: string) => {
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  let models: DesignDiagramModelSpec[] = [];
  let diagramErrors: Partial<Record<DesignDiagramKind, DiagramError>> = {};
  const useCaseModel = findRequirementModel(snapshot.requirementModels, "usecase");
  if (!useCaseModel) {
    throw new Error("缺少需求阶段用例模型，无法生成设计阶段顺序图");
  }

  updateStage("generate_design_sequence", "正在生成设计顺序图");
  const sequenceResult = await generateDesignModelsWithRepair(
    record,
    providerSettings,
    llmTransport,
    snapshot.requirementText,
    snapshot.rules,
    ["sequence"],
    buildGenerateDesignSequencePrompt(
      snapshot.requirementText,
      snapshot.rules,
      useCaseModel,
    ),
    "generate_design_sequence",
  );
  const sequenceModel = sequenceResult.models.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
      model.diagramKind === "sequence",
  );
  if (!sequenceModel) {
    throw new Error("设计顺序图生成结果缺少 sequence 模型");
  }
  models = [sequenceModel];
  snapshot.models = models;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_sequence",
      artifactKind: "model",
      diagramKind: "sequence",
    }),
  );

  const requestedDownstream = snapshot.selectedDiagrams.filter(
    (diagram): diagram is Exclude<DesignDiagramKind, "sequence"> =>
      diagram !== "sequence",
  );
  const downstreamWithSources = requestedDownstream.filter((diagram) => {
    const sourceKind = sourceRequirementKindForDesign(diagram);
    if (findRequirementModel(snapshot.requirementModels, sourceKind)) {
      return true;
    }
    diagramErrors[diagram] = diagramErrorSchema.parse({
      stage: "generate_design_models",
      message: `缺少需求阶段${sourceKind}模型，无法生成对应设计图`,
    });
    return false;
  });

  if (downstreamWithSources.length > 0) {
    updateStage("generate_design_models", "正在生成设计阶段结构化模型");
    const sourceModels = downstreamWithSources
      .map((diagram) =>
        findRequirementModel(
          snapshot.requirementModels,
          sourceRequirementKindForDesign(diagram),
        ),
      )
      .filter((model): model is DiagramModelSpec => Boolean(model));
    const downstreamResult = await generateDesignModelsWithRepair(
      record,
      providerSettings,
      llmTransport,
      snapshot.requirementText,
      snapshot.rules,
      downstreamWithSources,
      buildGenerateDesignModelsPrompt(
        snapshot.requirementText,
        snapshot.rules,
        sourceModels,
        sequenceModel,
        downstreamWithSources,
      ),
      "generate_design_models",
    );
    models = [...models, ...downstreamResult.models];
    snapshot.models = models;
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_design_models",
        artifactKind: "model",
      }),
    );
  }

  updateStage("generate_plantuml", "正在生成设计阶段 PlantUML");
  let plantUml = generateDesignPlantUmlArtifacts(models);
  snapshot.plantUml = plantUml;
  for (const artifact of plantUml) {
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: artifact.diagramKind,
      }),
    );
  }

  updateStage("render_svg", "正在渲染设计阶段 SVG");
  const repairedPlantUmlArtifacts: DesignPlantUmlArtifact[] = [];
  const svgArtifacts: DesignSvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    const model = models.find((item) => item.diagramKind === artifact.diagramKind);
    if (!model) {
      throw new Error(`Missing design diagram model for ${artifact.diagramKind}`);
    }

    const rendered = await renderArtifactWithRepair(
      record,
      providerSettings,
      llmTransport,
      renderClient,
      model,
      artifact,
    );
    repairedPlantUmlArtifacts.push(rendered.artifact as DesignPlantUmlArtifact);
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as DesignSvgArtifact);
      emitEvent(
        record,
        artifactReadyRunEventSchema.parse({
          type: "artifact_ready",
          stage: "render_svg",
          artifactKind: "svg",
          diagramKind: artifact.diagramKind,
        }),
      );
      continue;
    }

    renderFailures.push(rendered.errorMessage);
    diagramErrors[artifact.diagramKind] = diagramErrorSchema.parse({
      stage: "render_svg",
      message: rendered.errorMessage,
    });
  }
  snapshot.plantUml = repairedPlantUmlArtifacts;
  snapshot.svgArtifacts = svgArtifacts;
  snapshot.diagramErrors = diagramErrors;

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  snapshot.currentStage = "render_svg";
  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

export async function createApiServer(options?: {
  llmTransport?: LlmTransport;
  renderClient?: RenderClient;
  renderServiceBaseUrl?: string;
}) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError) {
      reply.code(400).send({
        message: error.issues
          .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "request";
            return `${path}: ${issue.message}`;
          })
          .join("; "),
      });
      return;
    }

    reply.code(500).send({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  });

  const llmTransport = options?.llmTransport ?? createRealLlmTransport();
  const renderServiceBaseUrl =
    options?.renderServiceBaseUrl ?? DEFAULT_RENDER_SERVICE_BASE_URL;
  const renderClient: RenderClient =
    options?.renderClient ??
    ((artifact: AnyPlantUmlArtifact) =>
      createRenderClient(renderServiceBaseUrl, artifact));
  const runs = new Map<string, RunRecord>();

  const healthPayload = () => ({
    status: "ok",
    renderServiceBaseUrl,
  });

  app.get("/health", async () => healthPayload());
  app.get("/api/health", async () => healthPayload());

  app.post("/api/runs", async (request, reply) => {
    const input = startRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptySnapshot(runId, input.requirementText, input.selectedDiagrams),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runStagePipeline(record, input.providerSettings, llmTransport, renderClient).catch(
      (error) => {
        record.snapshot.status = "failed";
        record.snapshot.errorMessage =
          error instanceof Error ? error.message : "Unknown run error";
        emitEvent(
          record,
          failedRunEventSchema.parse({
            type: "failed",
            stage: record.snapshot.currentStage ?? undefined,
            message: record.snapshot.errorMessage,
          }),
        );
      },
    );

    reply.code(202);
    return startRunResponseSchema.parse({ runId });
  });

  app.post("/api/design-runs", async (request, reply) => {
    const input = startDesignRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptyDesignSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runDesignStagePipeline(
      record,
      input.providerSettings,
      llmTransport,
      renderClient,
    ).catch((error) => {
      record.snapshot.status = "failed";
      record.snapshot.errorMessage =
        error instanceof Error ? error.message : "Unknown design run error";
      emitEvent(
        record,
        failedRunEventSchema.parse({
          type: "failed",
          stage: record.snapshot.currentStage ?? undefined,
          message: record.snapshot.errorMessage,
        }),
      );
    });

    reply.code(202);
    return startDesignRunResponseSchema.parse({ runId });
  });

  app.post("/api/render/svg", async (request, reply) => {
    const input = renderSvgRequestSchema.parse(request.body);
    try {
      return renderSvgResponseSchema.parse(
        await renderClient({
          diagramKind: input.diagramKind,
          source: input.plantUmlSource,
        }),
      );
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/api/provider/test", async (request, reply) => {
    const providerSettings = providerSettingsSchema.parse(request.body);
    const capability = getModelCapability(providerSettings.model);
    const response = await fetch(
      new URL("/v1/chat/completions", providerSettings.apiBaseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: providerSettings.model,
          messages: [
            {
              role: "user",
              content: "只回复 JSON：{\"ok\":true}",
            },
          ],
          stream: false,
          temperature: 0,
          response_format: { type: "json_object" },
          tools: [],
          tool_choice: "none",
        }),
      },
    );

    if (!response.ok) {
      let message = `Provider test failed with HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as {
          message?: string;
          error?: { message?: string };
        };
        message = payload.error?.message ?? payload.message ?? message;
      } catch {
        try {
          const text = await response.text();
          if (text.trim()) {
            message = `${message}: ${text.trim().slice(0, 240)}`;
          }
        } catch {
          // Keep the status-based message.
        }
      }
      reply.code(response.status >= 400 && response.status < 500 ? 400 : 502);
      return {
        ok: false,
        message,
        capability,
      };
    }

    return {
      ok: true,
      message: "Provider connection ok",
      capability,
    };
  });

  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Run not found" };
    }
    return runSnapshotSchema.parse(record.snapshot);
  });

  app.get("/api/design-runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Design run not found" };
    }
    return designRunSnapshotSchema.parse(record.snapshot);
  });

  app.get("/api/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Run not found" };
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin = requestOrigin ?? DEFAULT_SSE_ALLOW_ORIGIN;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
    });

    const send = (event: RunEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of record.events) {
      send(event);
    }

    if (record.terminal) {
      reply.raw.end();
      return;
    }

    const listener = (event: RunEvent) => {
      send(event);
      if (event.type === "completed" || event.type === "failed") {
        record.listeners.delete(listener);
        reply.raw.end();
      }
    };

    record.listeners.add(listener);
    request.raw.on("close", () => {
      record.listeners.delete(listener);
    });
  });

  app.get("/api/design-runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Design run not found" };
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin = requestOrigin ?? DEFAULT_SSE_ALLOW_ORIGIN;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
    });

    const send = (event: RunEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of record.events) {
      send(event);
    }

    if (record.terminal) {
      reply.raw.end();
      return;
    }

    const listener = (event: RunEvent) => {
      send(event);
      if (event.type === "completed" || event.type === "failed") {
        record.listeners.delete(listener);
        reply.raw.end();
      }
    };

    record.listeners.add(listener);
    request.raw.on("close", () => {
      record.listeners.delete(listener);
    });
  });

  return app;
}

async function start() {
  const app = await createApiServer();
  await app.listen({ host: DEFAULT_HOST, port: DEFAULT_PORT });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
